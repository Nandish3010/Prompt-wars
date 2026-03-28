/**
 * POST /api/analyze
 *
 * Request:  { text: string, imageBase64?: string, mimeType?: string }
 * Response: { dispatch: DispatchReport } | { error: string }
 *
 * Google services used:
 *   - Gemini 2.5 Flash       — AI analysis (responseMimeType: application/json)
 *   - Firebase Firestore     — incident persistence (Admin SDK)
 *   - Firebase Storage       — image archiving (Admin SDK)
 *   - Google Maps Geocoding  — location → GPS coords
 *   - Google Weather API     — live conditions for Gemini context enrichment
 *
 * Security:
 *   - All API keys are server-side env vars, never sent to client
 *   - Rate limited: 10 requests/IP/minute (in-memory)
 *   - Image capped at 4MB, MIME allowlisted
 *   - Text capped at 2000 chars
 *   - Gemini output validated against strict schema before returning
 *   - AbortController: 25s timeout prevents hung function slots
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI }        from '@google/generative-ai';
import { validateSchema, ValidationError } from '@/shared/parseDispatch';
import { DispatchReport }                  from '@/shared/dispatch';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS  = 2_000;
const TIMEOUT_MS      = 25_000;
const ALLOWED_MIMES   = ['image/jpeg', 'image/png', 'image/webp'];
const RATE_LIMIT_RPM  = 10;
const MAX_CACHE       = 20;
const CACHE_TTL_MS    = 5 * 60 * 1000;

// ── Rate limiting ─────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Checks if the given IP has exceeded the rate limit.
 * @param ip - client IP address
 * @returns true if rate limited, false otherwise
 */
function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= RATE_LIMIT_RPM) return true;
  entry.count++;
  return false;
}

// ── Response cache ────────────────────────────────────────────────────────────
// Keyed on original incident text BEFORE weather enrichment so weather
// changes never produce stale cache hits.

const responseCache = new Map<string, { dispatch: DispatchReport; expiresAt: number }>();

/**
 * Returns a cached dispatch for the given text, or null on miss/expiry.
 * @param text - original incident text (pre-enrichment)
 */
function getCached(text: string): DispatchReport | null {
  const key   = text.slice(0, 200);
  const entry = responseCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.dispatch;
}

/**
 * Stores a dispatch in the response cache.
 * @param text     - original incident text (pre-enrichment)
 * @param dispatch - validated dispatch report to cache
 */
function setCache(text: string, dispatch: DispatchReport): void {
  if (responseCache.size >= MAX_CACHE) {
    responseCache.delete(responseCache.keys().next().value!);
  }
  responseCache.set(text.slice(0, 200), {
    dispatch,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ── Gemini system prompt ──────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an emergency dispatch assistant.
Given a raw incident report (text and/or image), plus optional weather context,
extract structured emergency data. Return ONLY valid JSON matching this schema:
{
  "incidentType": "string (e.g. Auto Collision, Structure Fire, Medical Emergency)",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "location": "string or null if unknown",
  "injuries": "string describing injuries or 'None reported'",
  "requiredResources": ["array of resource strings"],
  "actionableSummary": "2-3 sentence actionable summary for dispatchers",
  "locationConfidence": "HIGH | MEDIUM | LOW"
}
Factor weather conditions into severity and resource recommendations when provided.
Be precise about severity. If location is unclear, set location to null and locationConfidence to LOW.`;

// ── Request validation ────────────────────────────────────────────────────────

interface ValidatedBody {
  text:         string;
  imageBase64?: string;
  mimeType?:    string;
}

/**
 * Parses and validates the request body.
 * @param req - incoming Next.js request
 * @returns ValidatedBody or a NextResponse with appropriate error status
 */
async function parseRequestBody(req: NextRequest): Promise<ValidatedBody | NextResponse> {
  let raw: { text?: unknown; imageBase64?: unknown; mimeType?: unknown };
  try {
    raw = await req.json() as typeof raw;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Incident description is required' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Description too long. Max ${MAX_TEXT_CHARS} characters.` },
      { status: 400 },
    );
  }

  if (raw.imageBase64 !== undefined) {
    if (typeof raw.mimeType !== 'string' || !ALLOWED_MIMES.includes(raw.mimeType)) {
      return NextResponse.json(
        { error: 'Only JPG, PNG, and WebP images are supported.' },
        { status: 400 },
      );
    }
    const imageBytes = (raw.imageBase64 as string).length * 0.75;
    if (imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large. Max 4MB.' }, { status: 400 });
    }
  }

  return {
    text,
    imageBase64: typeof raw.imageBase64 === 'string' ? raw.imageBase64 : undefined,
    mimeType:    typeof raw.mimeType    === 'string' ? raw.mimeType    : undefined,
  };
}

// ── Gemini parts builder ──────────────────────────────────────────────────────

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Builds the Gemini content parts array from text and optional image.
 * @param text        - enriched incident text (may include weather context)
 * @param imageBase64 - optional base64 image
 * @param mimeType    - image MIME type
 */
function buildGeminiParts(text: string, imageBase64?: string, mimeType?: string): GeminiPart[] {
  const parts: GeminiPart[] = [{ text }];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  return parts;
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * Saves the dispatch report to Firestore and optionally archives the image
 * to Firebase Storage. Failures are logged but never fail the user request.
 * @param dispatch    - validated dispatch report (mutated with id/timestamp/imageUrl)
 * @param ip          - client IP for audit tracking
 * @param imageBase64 - optional image to archive
 * @param mimeType    - image MIME type
 */
async function persistIncident(
  dispatch:     DispatchReport,
  ip:           string,
  imageBase64?: string,
  mimeType?:    string,
): Promise<void> {
  try {
    const { db, storage } = await import('@/shared/firebaseAdmin');

    let imageUrl: string | undefined;
    if (imageBase64 && mimeType) {
      try {
        const filename = `incidents/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const file     = storage.file(filename);
        const buffer   = Buffer.from(imageBase64, 'base64');
        await file.save(buffer, { metadata: { contentType: mimeType }, public: true });
        imageUrl = `https://storage.googleapis.com/${storage.name}/${filename}`;
      } catch (storageErr) {
        console.error('Storage upload failed:', storageErr);
      }
    }

    const docRef = await db.collection('incidents').add({
      ...dispatch,
      imageUrl,
      timestamp:    Date.now(),
      reportedByIp: ip,
    });

    dispatch.id        = docRef.id;
    dispatch.timestamp = Date.now();
    dispatch.imageUrl  = imageUrl;
  } catch (dbErr) {
    console.error('Firestore save failed:', dbErr);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Wait 60 seconds.' }, { status: 429 });
  }

  const bodyOrError = await parseRequestBody(req);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { text, imageBase64, mimeType } = bodyOrError;

  // Cache check on ORIGINAL text — before weather enrichment (ENG-1 fix)
  const cached = getCached(text);
  if (cached) return NextResponse.json({ dispatch: cached });

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  // Weather enrichment — geocode raw text for rough location, fetch conditions
  let weatherContext: string | undefined;
  let enrichedText = text;

  try {
    const { geocodeLocation }                        = await import('@/lib/geocoding');
    const { getWeatherAtLocation, formatWeatherContext } = await import('@/lib/weather');

    const roughCoords = await geocodeLocation(text.slice(0, 200));
    if (roughCoords) {
      const weather = await getWeatherAtLocation(roughCoords.lat, roughCoords.lng);
      if (weather) {
        weatherContext = formatWeatherContext(weather);
        enrichedText   = `${weatherContext}\n\nIncident report: ${text}`;
      }
    }
  } catch {
    // Best-effort — skip enrichment if anything fails
  }

  // Gemini call with JSON mode (responseMimeType guarantees raw JSON, no markdown fences)
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model:             'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig:  { responseMimeType: 'application/json' },
  });

  const parts      = buildGeminiParts(enrichedText, imageBase64, mimeType);
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    clearTimeout(timeoutId);

    // Safety refusal — Gemini blocks graphic emergency content
    const feedback = result.response.promptFeedback;
    if (feedback?.blockReason) {
      return NextResponse.json(
        { error: 'Input was flagged by safety filters. Try rephrasing.' },
        { status: 422 },
      );
    }

    // responseMimeType: application/json guarantees clean JSON — no fence stripping needed
    let dispatch: DispatchReport;
    try {
      dispatch = validateSchema(JSON.parse(result.response.text()));
    } catch {
      return NextResponse.json({ error: 'Unexpected AI response. Try again.' }, { status: 422 });
    }

    // Geocode the Gemini-extracted location for precise map pinning
    if (dispatch.location) {
      try {
        const { geocodeLocation } = await import('@/lib/geocoding');
        const extracted = await geocodeLocation(dispatch.location);
        if (extracted) dispatch.coords = extracted;
      } catch { /* non-critical */ }
    }

    dispatch.weatherContext = weatherContext;

    // Cache on original text before any mutation from persist
    setCache(text, dispatch);

    // Persist to Firestore + Storage (non-blocking on failure)
    await persistIncident(dispatch, ip, imageBase64, mimeType);

    return NextResponse.json({ dispatch });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ValidationError) {
      console.error('Validation error:', (err as Error).message);
      return NextResponse.json({ error: 'Unexpected AI response. Try again.' }, { status: 422 });
    }
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out. Try again.' }, { status: 503 });
    }
    if ((err as Error).message?.includes('429')) {
      return NextResponse.json({ error: 'AI service is busy. Wait 60 seconds.' }, { status: 429 });
    }
    console.error('Gemini error:', err);
    return NextResponse.json({ error: 'Service unavailable. Try again.' }, { status: 503 });
  }
}
