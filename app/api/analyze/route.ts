/**
 * POST /api/analyze
 *
 * Request:  { text: string, imageBase64?: string, mimeType?: string }
 * Response: { dispatch: DispatchReport } | { error: string }
 *
 * Security:
 *   - GEMINI_API_KEY is a server-side env var, never sent to client
 *   - Rate limited: 10 requests/IP/minute (in-memory)
 *   - Image capped at 4MB, MIME allowlisted
 *   - Text capped at 2000 chars
 *   - Gemini output validated before returning
 *   - AbortController: 25s timeout prevents hung function slots
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI }        from '@google/generative-ai';
import { parseDispatchJSON, validateSchema, ParseError, ValidationError }
  from '@/shared/parseDispatch';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS  = 2_000;
const TIMEOUT_MS      = 25_000;
const ALLOWED_MIMES   = ['image/jpeg', 'image/png', 'image/webp'];
const RATE_LIMIT_RPM  = 10;

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

const SYSTEM_INSTRUCTION = `You are an emergency dispatch assistant.
Given a raw incident report (text and/or image), extract structured emergency data.
Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "incidentType": "string (e.g. Auto Collision, Structure Fire, Medical Emergency)",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "location": "string or null if unknown",
  "injuries": "string describing injuries or 'None reported'",
  "requiredResources": ["array of resource strings"],
  "actionableSummary": "2-3 sentence actionable summary for dispatchers",
  "locationConfidence": "HIGH | MEDIUM | LOW"
}
Be precise about severity. If location is unclear, set location to null and locationConfidence to LOW.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Wait 60 seconds.' }, { status: 429 });
  }

  let body: { text?: unknown; imageBase64?: unknown; mimeType?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Incident description is required' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Description too long. Max ${MAX_TEXT_CHARS} characters.` },
      { status: 400 }
    );
  }

  if (body.imageBase64 !== undefined) {
    if (typeof body.mimeType !== 'string' || !ALLOWED_MIMES.includes(body.mimeType)) {
      return NextResponse.json({ error: 'Only JPG, PNG, and WebP images are supported.' }, { status: 400 });
    }
    const imageBytes = (body.imageBase64 as string).length * 0.75;
    if (imageBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large. Max 4MB.' }, { status: 400 });
    }
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
  const parts: Part[] = [{ text }];
  if (body.imageBase64 && body.mimeType) {
    parts.push({
      inlineData: { mimeType: body.mimeType as string, data: body.imageBase64 as string },
    });
  }

  // AbortController — CRITICAL: prevents hung Firebase Function slots
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    clearTimeout(timeoutId);

    // Safety refusal — CRITICAL: Gemini blocks graphic emergency content
    const feedback = result.response.promptFeedback;
    if (feedback?.blockReason) {
      return NextResponse.json(
        { error: 'Input was flagged by safety filters. Try rephrasing.' },
        { status: 422 }
      );
    }

    const raw      = result.response.text();
    const parsed   = parseDispatchJSON(raw);
    const dispatch = validateSchema(parsed);

    return NextResponse.json({ dispatch });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ParseError || err instanceof ValidationError) {
      console.error('Parse/validation error:', err.message);
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
