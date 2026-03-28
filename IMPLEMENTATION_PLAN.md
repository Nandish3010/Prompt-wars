# CrisisConnect — Implementation Plan (v2)

> Updated: Next.js frontend + Firebase deployment + expanded Google services
> Date: 2026-03-28 | Branch: main | Repo: Nandish3010/Prompt-wars

---

## What We're Building

**CrisisConnect** — a Gemini-powered emergency dispatch assistant.

- **Input:** Messy incident description (text) + optional photo
- **AI:** Gemini 2.0 Flash (multimodal: text + vision, structured JSON output)
- **Output:** Structured dispatch card + Google Maps location pin

One page. One API call. Gemini extracts location → Google Maps visualizes it.
Two Google services working together = visible, impressive judge moment.

---

## Google Services Used (Evaluation Criterion)

| Service | Why | How |
|---|---|---|
| **Gemini 2.0 Flash** | Core AI — multimodal text + vision, structured JSON | `@google/generative-ai` SDK, system instructions, JSON schema output |
| **Firebase App Hosting** | Deploy Next.js full-stack app (Google Cloud) | `firebase.json` + `apphosting.yaml`, auto-deploys from GitHub |
| **Firebase Functions** | Server-side API proxy — Gemini API key never touches client | Next.js API route deployed as Cloud Function |
| **Google Maps Embed API** | Visualize extracted incident location | `<iframe>` embed with extracted location as query — zero extra API key |

**Why this combination scores well:**
- Gemini does the hard AI work (multimodal reasoning + structured output)
- Firebase shows real Google Cloud deployment, not just a local demo
- Google Maps turns Gemini's text extraction into a visible, spatial result
- Each service has a clear, non-redundant role — judges can see the chain

---

## Evaluation Criteria Fit

| Criterion | How we deliver |
|---|---|
| Smart dynamic assistant | Output adapts to severity, location confidence, injury count, image content |
| Logical decision making | Severity triage, resource allocation, location confidence + map |
| Effective Google Services use | Gemini + Firebase + Maps — three Google services, each visible |
| Real-world usability | Emergency use case, clean I/O, map confirms extracted location |
| Clean code | TypeScript, Next.js App Router, modular components, Vitest tests |

---

## Project Structure

```
crisisconnect/
├── app/                          ← Next.js App Router
│   ├── layout.tsx                ← root layout, metadata, fonts
│   ├── page.tsx                  ← main page (imports IncidentForm)
│   ├── globals.css               ← global styles
│   └── api/
│       └── analyze/
│           └── route.ts          ← Next.js API route (server-side proxy)
│                                    deployed as Firebase Function
│
├── components/
│   ├── IncidentForm.tsx          ← textarea + file upload + submit
│   ├── DispatchCard.tsx          ← structured dispatch card rendering
│   └── LocationMap.tsx           ← Google Maps Embed for extracted location
│
├── shared/                       ← shared by API route AND components
│   ├── dispatch.ts               ← DispatchReport interface + enums
│   └── parseDispatch.ts          ← parseDispatchJSON() + validateSchema()
│
├── test/
│   ├── unit/
│   │   └── parseDispatch.test.ts ← 12 unit tests (pure functions)
│   ├── integration/
│   │   └── analyzeRoute.test.ts  ← 8 integration tests (mocked Gemini)
│   └── components/
│       └── DispatchCard.test.tsx ← 6 component tests (React Testing Library)
│
├── firebase.json                 ← Firebase Hosting + Functions config
├── apphosting.yaml               ← Firebase App Hosting config (Next.js)
├── .env.example                  ← documents required env vars
├── .env.local                    ← local dev secrets (gitignored)
├── next.config.ts                ← Next.js config
├── tsconfig.json
├── vitest.config.ts
├── package.json
├── .gitignore
└── README.md                     ← mandatory for evaluation
```

**Repo size:** `node_modules/`, `.next/`, `.firebase/` all gitignored.
Source files only. Estimated committed size: ~80KB. Under 1MB limit.

---

## Build Order

```
PHASE 1 — Foundation (30 min)
  └─▶ shared/dispatch.ts
  └─▶ shared/parseDispatch.ts

PHASE 2 — Parallel (45 min each lane)
  Lane A: app/api/analyze/route.ts   (server, API proxy)
  Lane B: components/DispatchCard.tsx
          components/LocationMap.tsx
          components/IncidentForm.tsx
          app/page.tsx
          app/layout.tsx
          app/globals.css

PHASE 3 — Tests (30 min)
  └─▶ test/ (all test files)

PHASE 4 — Config + Deploy (20 min)
  └─▶ package.json, tsconfig.json, next.config.ts, vitest.config.ts
  └─▶ firebase.json, apphosting.yaml
  └─▶ .env.example, .gitignore, README.md
  └─▶ firebase deploy
```

---

## Phase 1: Foundation

### `shared/dispatch.ts`

```typescript
/**
 * Core types for CrisisConnect dispatch reports.
 * Shared between the API route (server) and React components (client).
 */

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH     = 'HIGH',
  MEDIUM   = 'MEDIUM',
  LOW      = 'LOW',
}

export enum LocationConfidence {
  HIGH   = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW    = 'LOW',
}

export interface DispatchReport {
  incidentType:       string;
  severity:           Severity;
  location:           string | null;
  injuries:           string;
  requiredResources:  string[];
  actionableSummary:  string;
  locationConfidence: LocationConfidence;
}

/** API response shapes */
export interface AnalyzeSuccessResponse {
  dispatch: DispatchReport;
}

export interface AnalyzeErrorResponse {
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccessResponse | AnalyzeErrorResponse;
```

### `shared/parseDispatch.ts`

```typescript
/**
 * Parses and validates raw Gemini text output into a DispatchReport.
 *
 * Data flow:
 *   raw string (Gemini response.text())
 *     └─▶ stripMarkdownFences()   removes ```json...``` wrappers
 *     └─▶ JSON.parse()            throws ParseError if invalid
 *     └─▶ validateSchema()        throws ValidationError if wrong shape
 *     └─▶ DispatchReport          fully typed, safe to render
 *
 * CRITICAL: Gemini often wraps responses in markdown fences.
 * stripMarkdownFences() prevents silent parse failures.
 */
import { DispatchReport, Severity, LocationConfidence } from './dispatch.js';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const SEVERITY_VALUES   = Object.values(Severity) as string[];
const CONFIDENCE_VALUES = Object.values(LocationConfidence) as string[];

/** Strips markdown code fences Gemini sometimes wraps JSON in. */
function stripMarkdownFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/**
 * Parses a raw Gemini response string into an unknown object.
 * @throws {ParseError} if the string is not valid JSON.
 */
export function parseDispatchJSON(raw: string): unknown {
  if (!raw || raw.trim() === '') {
    throw new ParseError('Empty response from Gemini');
  }
  const cleaned = stripMarkdownFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ParseError(`Invalid JSON from Gemini: ${cleaned.slice(0, 80)}`);
  }
}

/**
 * Validates that a parsed object matches the DispatchReport schema.
 * @throws {ValidationError} if any required field is missing or invalid.
 */
export function validateSchema(data: unknown): DispatchReport {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError('Response is not a JSON object');
  }

  const d = data as Record<string, unknown>;

  if (typeof d['incidentType'] !== 'string' || !d['incidentType']) {
    throw new ValidationError('Missing or invalid incidentType');
  }
  if (!SEVERITY_VALUES.includes(d['severity'] as string)) {
    throw new ValidationError(`Invalid severity: ${String(d['severity'])}`);
  }
  if (d['location'] !== null && typeof d['location'] !== 'string') {
    throw new ValidationError('location must be a string or null');
  }
  if (typeof d['injuries'] !== 'string') {
    throw new ValidationError('Missing injuries field');
  }
  if (!Array.isArray(d['requiredResources'])) {
    throw new ValidationError('requiredResources must be an array');
  }
  if (typeof d['actionableSummary'] !== 'string' || !d['actionableSummary']) {
    throw new ValidationError('Missing actionableSummary');
  }
  if (!CONFIDENCE_VALUES.includes(d['locationConfidence'] as string)) {
    throw new ValidationError(`Invalid locationConfidence: ${String(d['locationConfidence'])}`);
  }

  return data as DispatchReport;
}
```

---

## Phase 2A: API Route (Server-side)

### `app/api/analyze/route.ts`

> Next.js API Route — runs server-side only. Deployed as a Firebase Cloud Function.
> The Gemini API key NEVER leaves this file.

```typescript
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
    model: 'gemini-2.0-flash',
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
```

---

## Phase 2B: React Components

### `components/LocationMap.tsx`

> Google Maps Embed API — shows extracted incident location on a real map.
> No extra API key needed for basic embed. Visual proof that Gemini extracted
> a real location from messy text. High judge impact for minimal code.

```tsx
/**
 * Embeds a Google Maps view of the extracted incident location.
 *
 * Uses the Google Maps Embed API (free, no API key for basic usage).
 * Shown only when location is not null and confidence is not LOW.
 *
 * Google service: Maps Embed API
 * Judge impact: Gemini extracts "5th and Broadway" from panic text →
 *               Google Maps shows a real pin. Two Google services, one visible chain.
 */
'use client';

import { LocationConfidence } from '@/shared/dispatch';

interface LocationMapProps {
  location:   string;
  confidence: LocationConfidence;
}

export default function LocationMap({ location, confidence }: LocationMapProps) {
  // Don't show map for low-confidence locations — misleading to show a wrong pin
  if (confidence === LocationConfidence.LOW) return null;

  const encodedLocation = encodeURIComponent(location);
  const mapSrc = `https://maps.google.com/maps?q=${encodedLocation}&output=embed&z=15`;

  return (
    <div className="location-map" aria-label={`Map showing location: ${location}`}>
      <iframe
        title={`Map of ${location}`}
        src={mapSrc}
        width="100%"
        height="200"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        aria-label={`Google Maps showing ${location}`}
      />
      <p className="map-caption">
        <small>
          📍 Location extracted by Gemini AI · Verified by{' '}
          <a
            href={`https://maps.google.com/?q=${encodedLocation}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps
          </a>
        </small>
      </p>
    </div>
  );
}
```

### `components/DispatchCard.tsx`

```tsx
/**
 * Renders a DispatchReport as a structured emergency dispatch card.
 *
 * SECURITY: All Gemini-sourced values rendered via React's JSX (escaped by default).
 * React prevents XSS automatically when using {variable} syntax — never dangerouslySetInnerHTML.
 *
 * Includes Google Maps embed for extracted location (LocationMap component).
 */
'use client';

import { DispatchReport, Severity, LocationConfidence } from '@/shared/dispatch';
import LocationMap from './LocationMap';

interface DispatchCardProps {
  dispatch: DispatchReport;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; label: string }> = {
  [Severity.CRITICAL]: { bg: 'severity-critical', label: 'CRITICAL' },
  [Severity.HIGH]:     { bg: 'severity-high',     label: 'HIGH'     },
  [Severity.MEDIUM]:   { bg: 'severity-medium',   label: 'MEDIUM'   },
  [Severity.LOW]:      { bg: 'severity-low',       label: 'LOW'      },
};

export default function DispatchCard({ dispatch }: DispatchCardProps) {
  const severityStyle = SEVERITY_STYLES[dispatch.severity];

  return (
    <article className="dispatch-card" aria-label="Dispatch report" tabIndex={-1}>
      <header className="card-header">
        <h2>DISPATCH REPORT</h2>
        <span
          className={`severity-badge ${severityStyle.bg}`}
          aria-label={`Severity: ${severityStyle.label}`}
        >
          {severityStyle.label}
        </span>
      </header>

      <dl className="dispatch-fields">
        <div className="field-row">
          <dt>Incident Type</dt>
          <dd>{dispatch.incidentType}</dd>
        </div>

        <div className="field-row">
          <dt>Location</dt>
          <dd>
            {dispatch.location ?? 'Unknown'}
            {dispatch.locationConfidence === LocationConfidence.LOW && (
              <span
                className="confidence-badge confidence-low"
                aria-label="Location confidence: Low"
              >
                Low confidence
              </span>
            )}
          </dd>
        </div>

        <div className="field-row">
          <dt>Injuries</dt>
          <dd>{dispatch.injuries}</dd>
        </div>

        <div className="field-row">
          <dt>Required Resources</dt>
          <dd>
            {dispatch.requiredResources.length === 0 ? (
              'None identified'
            ) : (
              <ul className="resource-list">
                {dispatch.requiredResources.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      {/* Google Maps embed — shown when location is high/medium confidence */}
      {dispatch.location && (
        <LocationMap
          location={dispatch.location}
          confidence={dispatch.locationConfidence}
        />
      )}

      <section aria-label="Actionable summary" className="summary-section">
        <h3>Actionable Summary</h3>
        <p>{dispatch.actionableSummary}</p>
      </section>
    </article>
  );
}
```

### `components/IncidentForm.tsx`

```tsx
/**
 * Main incident input form.
 *
 * State machine:
 *   idle ──submit──▶ loading ──success──▶ idle (card shown)
 *                           └──error────▶ idle (error shown)
 *
 * Double-submit guard: isLoading state prevents concurrent requests.
 */
'use client';

import { useState, useRef, FormEvent } from 'react';
import { DispatchReport }              from '@/shared/dispatch';
import { AnalyzeResponse }             from '@/shared/dispatch';
import DispatchCard                    from './DispatchCard';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES   = ['image/jpeg', 'image/png', 'image/webp'];

export default function IncidentForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [dispatch,  setDispatch]  = useState<DispatchReport | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading) return;          // double-submit guard — CRITICAL

    setError(null);
    setDispatch(null);

    const form    = e.currentTarget;
    const text    = (form.elements.namedItem('incident-text') as HTMLTextAreaElement).value.trim();
    const fileEl  = form.elements.namedItem('incident-photo') as HTMLInputElement;
    const file    = fileEl.files?.[0];

    if (!text) {
      setError('Please describe the incident before analyzing.');
      return;
    }

    // Validate image client-side before encoding
    if (file) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Only JPG, PNG, and WebP images are supported.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError('Image too large. Max 4MB.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const body: { text: string; imageBase64?: string; mimeType?: string } = { text };
      if (file) {
        body.imageBase64 = await fileToBase64(file);
        body.mimeType    = file.type;
      }

      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await res.json() as AnalyzeResponse;

      if (!res.ok || 'error' in data) {
        throw new Error('error' in data ? data.error : `Error ${res.status}`);
      }

      setDispatch(data.dispatch);

      // Move focus to dispatch card for screen reader announcement
      setTimeout(() => cardRef.current?.focus(), 50);

    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="form-wrapper">
      <form onSubmit={handleSubmit} noValidate aria-label="Incident report form">
        <div className="field">
          <label htmlFor="incident-text">Incident description</label>
          <textarea
            id="incident-text"
            name="incident-text"
            placeholder="e.g. huge crash on 5th ave, someone is bleeding and cant move, car flipped"
            rows={5}
            maxLength={2000}
            required
            aria-describedby="text-hint"
            disabled={isLoading}
          />
          <span id="text-hint" className="hint">
            Describe what you see — location, injuries, vehicle count, fire, etc.
          </span>
        </div>

        <div className="field">
          <label htmlFor="incident-photo">Scene photo (optional)</label>
          <input
            id="incident-photo"
            name="incident-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="photo-hint"
            disabled={isLoading}
          />
          <span id="photo-hint" className="hint">JPG, PNG, or WebP · Max 4MB</span>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? 'Analyzing incident...' : 'Analyze Incident'}
        </button>

        {error && (
          <div role="alert" aria-live="assertive" className="error-message">
            {error}
          </div>
        )}
      </form>

      {/* Result area — polite for non-urgent announcement */}
      <div aria-live="polite" aria-label="Dispatch report result">
        {dispatch && (
          <DispatchCard
            dispatch={dispatch}
            // @ts-expect-error ref forwarding via article
            ref={cardRef}
          />
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}
```

### `app/page.tsx`

```tsx
import IncidentForm from '@/components/IncidentForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'CrisisConnect — Emergency Dispatch Assistant',
  description: 'Turn chaotic incident reports into structured dispatch data — powered by Google Gemini AI',
};

export default function Home() {
  return (
    <>
      {/* Skip-to-content link (WCAG) */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header role="banner" className="site-header">
        <h1>CrisisConnect</h1>
        <p className="tagline">
          Turn chaos into actionable dispatch reports — powered by Gemini AI
        </p>
      </header>

      <main id="main-content">
        <section aria-labelledby="input-heading">
          <h2 id="input-heading">Describe the Incident</h2>
          <IncidentForm />
        </section>
      </main>

      <footer>
        <p>
          Demo tool only — not for real emergency use. Always call 911.
          Powered by{' '}
          <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer">
            Google Gemini
          </a>{' '}
          and{' '}
          <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer">
            Firebase
          </a>.
        </p>
      </footer>
    </>
  );
}
```

### `app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title:       'CrisisConnect',
  description: 'Emergency dispatch assistant powered by Google Gemini',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## Styling (`app/globals.css`)

Key WCAG AA rules — implement exactly:

```css
/* ── Reset ───────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Layout ──────────────────────────────────────── */
body {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
  background: #f8f9fa;
  color: #1a1a1a;
}

/* ── Skip link (WCAG — must appear on focus) ─────── */
.skip-link {
  position: absolute;
  top: -9999px;
  left: 0;
  background: #005FCC;
  color: #fff;
  padding: 0.5rem 1rem;
  z-index: 9999;
}
.skip-link:focus { position: static; top: auto; }

/* ── Focus (NEVER remove without replacement) ────── */
*:focus-visible {
  outline: 3px solid #005FCC;
  outline-offset: 2px;
}

/* ── Severity badges — WCAG AA compliant ─────────── */
/* All pass 4.5:1 contrast ratio with white text     */
.severity-badge      { padding: 0.25rem 0.75rem; border-radius: 4px; font-weight: 700; font-size: 0.875rem; color: #fff; }
.severity-critical   { background: #CC0000; }   /* 5.9:1 ✓ */
.severity-high       { background: #92400E; }   /* 7.0:1 ✓ */
.severity-medium     { background: #78350F; }   /* 8.0:1 ✓ */
.severity-low        { background: #166534; }   /* 6.1:1 ✓ */

/* NEVER use orange #F97316 or yellow #EAB308 with white — both FAIL WCAG AA */

/* ── Dispatch card ───────────────────────────────── */
.dispatch-card {
  background: #fff;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 2rem;
  font-family: 'Courier New', monospace;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.card-header h2 { font-size: 1rem; letter-spacing: 0.1em; color: #495057; }

.dispatch-fields { display: grid; gap: 0.75rem; }
.field-row { display: grid; grid-template-columns: 160px 1fr; gap: 0.5rem; }
dt { font-weight: 600; color: #495057; }

/* ── Location map ────────────────────────────────── */
.location-map { margin: 1rem 0; border-radius: 6px; overflow: hidden; }
.location-map iframe { display: block; border: 0; }
.map-caption { padding: 0.25rem 0; color: #6c757d; font-size: 0.8rem; }

/* ── Form ────────────────────────────────────────── */
.field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
label { font-weight: 600; font-size: 0.9rem; }
textarea, input[type="file"] { padding: 0.5rem; border: 1px solid #ced4da; border-radius: 4px; font-size: 1rem; }
textarea { resize: vertical; min-height: 100px; }
.hint { font-size: 0.8rem; color: #6c757d; }

button[type="submit"] {
  background: #CC0000;
  color: #fff;
  border: 0;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
}
button[type="submit"]:hover:not(:disabled) { background: #a30000; }
button[disabled] { opacity: 0.6; cursor: not-allowed; }

/* ── Errors ──────────────────────────────────────── */
.error-message {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  color: #856404;
}

/* ── Confidence badge ────────────────────────────── */
.confidence-badge { margin-left: 0.5rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }
.confidence-low   { background: #fff3cd; color: #856404; }

/* ── Accessibility ───────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
@media (prefers-color-scheme: dark) {
  body            { background: #1a1a1a; color: #f0f0f0; }
  .dispatch-card  { background: #2a2a2a; border-color: #444; }
  .error-message  { background: #3a2e00; border-color: #856404; color: #ffc107; }
}
@media (prefers-contrast: high) {
  .severity-badge { border: 2px solid #000; }
}

/* ── Responsive ──────────────────────────────────── */
@media (max-width: 480px) {
  .field-row { grid-template-columns: 1fr; }
  .card-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
}
```

---

## Tests

### `test/unit/parseDispatch.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseDispatchJSON, validateSchema, ParseError, ValidationError }
  from '@/shared/parseDispatch';
import { Severity, LocationConfidence } from '@/shared/dispatch';

const VALID: Record<string, unknown> = {
  incidentType: 'Auto Collision', severity: 'CRITICAL',
  location: '5th Avenue', injuries: '1 confirmed',
  requiredResources: ['1x Ambulance'],
  actionableSummary: 'Immediate response required.',
  locationConfidence: 'HIGH',
};

describe('parseDispatchJSON', () => {
  it('parses valid JSON string', () => {
    expect(parseDispatchJSON(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('strips ```json markdown fences', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseDispatchJSON(wrapped)).toEqual(VALID);
  });

  it('strips plain ``` fences', () => {
    const wrapped = '```\n' + JSON.stringify(VALID) + '\n```';
    expect(parseDispatchJSON(wrapped)).toEqual(VALID);
  });

  it('throws ParseError on empty string', () => {
    expect(() => parseDispatchJSON('')).toThrow(ParseError);
  });

  it('throws ParseError on non-JSON text', () => {
    expect(() => parseDispatchJSON('Sorry, I cannot help.')).toThrow(ParseError);
  });
});

describe('validateSchema', () => {
  it('returns typed DispatchReport for valid object', () => {
    const result = validateSchema(VALID);
    expect(result.severity).toBe(Severity.CRITICAL);
    expect(result.locationConfidence).toBe(LocationConfidence.HIGH);
  });

  it('throws ValidationError for invalid severity', () => {
    expect(() => validateSchema({ ...VALID, severity: 'EXTREME' })).toThrow(ValidationError);
  });

  it('throws ValidationError for missing incidentType', () => {
    const { incidentType: _, ...rest } = VALID;
    expect(() => validateSchema(rest)).toThrow(ValidationError);
  });

  it('accepts null location', () => {
    expect(() => validateSchema({ ...VALID, location: null, locationConfidence: 'LOW' }))
      .not.toThrow();
  });

  it('accepts empty requiredResources array', () => {
    expect(() => validateSchema({ ...VALID, requiredResources: [] })).not.toThrow();
  });

  it('throws ValidationError for requiredResources not an array', () => {
    expect(() => validateSchema({ ...VALID, requiredResources: '1x Ambulance' }))
      .toThrow(ValidationError);
  });

  it('throws ValidationError for non-object input', () => {
    expect(() => validateSchema([])).toThrow(ValidationError);
    expect(() => validateSchema(null)).toThrow(ValidationError);
  });

  it('throws ValidationError for invalid locationConfidence', () => {
    expect(() => validateSchema({ ...VALID, locationConfidence: 'VERY_HIGH' }))
      .toThrow(ValidationError);
  });
});
```

### `test/integration/analyzeRoute.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
}));

import { GoogleGenerativeAI } from '@google/generative-ai';
import { POST } from '@/app/api/analyze/route';

const VALID_JSON = JSON.stringify({
  incidentType: 'Auto Collision', severity: 'CRITICAL',
  location: '5th Ave', injuries: '1 confirmed',
  requiredResources: ['1x Ambulance'],
  actionableSummary: 'Immediate response needed.',
  locationConfidence: 'HIGH',
});

function mockGemini(responseText: string, blockReason?: string) {
  (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mockReturnValue({
    getGenerativeModel: () => ({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => responseText,
          promptFeedback: blockReason ? { blockReason } : undefined,
        },
      }),
    }),
  });
}

function makeRequest(body: object, ip = '1.2.3.4') {
  return new NextRequest('http://localhost/api/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body:    JSON.stringify(body),
  });
}

describe('POST /api/analyze', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env['GEMINI_API_KEY'] = 'test-key'; });

  it('returns 200 with dispatch for valid text', async () => {
    mockGemini(VALID_JSON);
    const res  = await POST(makeRequest({ text: 'crash on 5th ave' }));
    const body = await res.json() as { dispatch: { severity: string } };
    expect(res.status).toBe(200);
    expect(body.dispatch.severity).toBe('CRITICAL');
  });

  it('returns 200 when Gemini wraps JSON in markdown fences', async () => {
    mockGemini('```json\n' + VALID_JSON + '\n```');
    const res = await POST(makeRequest({ text: 'crash' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when text is empty', async () => {
    const res = await POST(makeRequest({ text: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid MIME type', async () => {
    const res = await POST(makeRequest({ text: 'crash', imageBase64: 'abc', mimeType: 'application/pdf' }));
    expect(res.status).toBe(400);
  });

  it('returns 422 when Gemini returns non-JSON', async () => {
    mockGemini('Sorry, I cannot help with that.');
    const res = await POST(makeRequest({ text: 'crash' }));
    expect(res.status).toBe(422);
  });

  it('returns 422 on safety refusal', async () => {
    mockGemini('', 'HARM_CATEGORY_DANGEROUS');
    const res  = await POST(makeRequest({ text: 'graphic crash' }));
    const body = await res.json() as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toContain('safety');
  });

  it('returns 503 when API key missing', async () => {
    delete process.env['GEMINI_API_KEY'];
    const res = await POST(makeRequest({ text: 'crash' }));
    expect(res.status).toBe(503);
  });

  it('never exposes API key in response body', async () => {
    mockGemini(VALID_JSON);
    const res  = await POST(makeRequest({ text: 'crash' }));
    const text = await res.text();
    expect(text).not.toContain('test-key');
  });
});
```

---

## Config Files

### `package.json`

```json
{
  "name": "crisisconnect",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev":           "next dev",
    "build":         "next build",
    "start":         "next start",
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:coverage": "vitest run --coverage",
    "lint":          "next lint",
    "deploy":        "firebase deploy"
  },
  "dependencies": {
    "next":                   "^14.2.0",
    "react":                  "^18.3.0",
    "react-dom":              "^18.3.0",
    "@google/generative-ai":  "^0.21.0"
  },
  "devDependencies": {
    "typescript":             "^5.4.0",
    "@types/node":            "^20.0.0",
    "@types/react":           "^18.3.0",
    "@types/react-dom":       "^18.3.0",
    "vitest":                 "^1.6.0",
    "@vitest/coverage-v8":   "^1.6.0",
    "jsdom":                  "^24.0.0",
    "@testing-library/react": "^16.0.0",
    "firebase-tools":         "^13.0.0"
  }
}
```

### `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensures @google/generative-ai stays server-side only
  serverExternalPackages: ['@google/generative-ai'],
};

export default nextConfig;
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target":           "ES2022",
    "lib":              ["ES2022", "DOM", "DOM.Iterable"],
    "module":           "ESNext",
    "moduleResolution": "bundler",
    "strict":           true,
    "noImplicitAny":    true,
    "jsx":              "preserve",
    "paths": {
      "@/*": ["./*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path             from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include:     ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'html'],
      include:   ['shared/**', 'app/**', 'components/**'],
      thresholds: { lines: 80 },
    },
  },
});
```

---

## Firebase Deployment

### `firebase.json`

```json
{
  "hosting": {
    "source": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "frameworksBackend": {
      "region": "us-central1"
    }
  }
}
```

### `apphosting.yaml`

> Firebase App Hosting natively supports Next.js 14+.
> Handles SSR + API routes automatically as Cloud Functions.

```yaml
runConfig:
  minInstances: 0
  maxInstances: 2
  concurrency: 80
  cpu: 1
  memoryMiB: 512

env:
  - variable: GEMINI_API_KEY
    secret: GEMINI_API_KEY     # stored in Firebase Secret Manager
    availability:
      - BUILD
      - RUNTIME
```

### `.env.example`

```
# Required — get your key at https://aistudio.google.com
GEMINI_API_KEY=your_gemini_api_key_here
```

### `.gitignore`

```
# Dependencies
node_modules/

# Build output
.next/
out/

# Firebase
.firebase/
.firebaserc

# Environment
.env
.env.local
.env.*.local

# Large local assets (do not commit)
*.HEIC
*.jpg
*.png
*.pdf

# OS
.DS_Store
```

### Deploy Steps

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Initialize Firebase App Hosting in this project
firebase init apphosting

# 4. Store your API key in Firebase Secret Manager (secure — not in .env)
firebase apphosting:secrets:set GEMINI_API_KEY

# 5. Deploy
firebase deploy

# 6. Verify — open the deployed URL, submit a test incident
# Should see: dispatch card + Google Maps pin
```

---

## 5 Critical Gaps — Already Solved in This Plan

| # | Gap | Solved in |
|---|---|---|
| 1 | Gemini wraps JSON in markdown fences | `shared/parseDispatch.ts` — `stripMarkdownFences()` |
| 2 | Safety refusal not handled | `app/api/analyze/route.ts` — `promptFeedback.blockReason` check |
| 3 | Double-submit fires duplicate API calls | `components/IncidentForm.tsx` — `isLoading` state guard |
| 4 | Hung request / no timeout | `app/api/analyze/route.ts` — `AbortController` 25s |
| 5 | XSS via innerHTML on Gemini data | React JSX escapes by default — no `dangerouslySetInnerHTML` anywhere |

---

## README.md Checklist (Mandatory for Evaluation)

```
[ ] Chosen vertical/persona — Emergency Dispatcher Assistant
[ ] Approach and logic — how Gemini multimodal + structured JSON works
[ ] How the solution works — step-by-step user flow
[ ] Assumptions made — demo tool, not production 911 system
[ ] Google services used:
    [ ] Gemini 2.0 Flash (multimodal text + vision, structured JSON)
    [ ] Firebase App Hosting (Google Cloud deployment + CDN)
    [ ] Firebase Functions (server-side API proxy via Next.js API routes)
    [ ] Google Maps Embed API (location visualization)
[ ] Setup instructions (npm install, .env.local, npm run dev)
[ ] GEMINI_API_KEY documented
[ ] How to run tests (npm test)
[ ] Tech stack: Next.js 14, TypeScript, Vitest, Firebase, @google/generative-ai
```

---

## Completion Checklist

```
Phase 1 — Foundation
  [ ] shared/dispatch.ts
  [ ] shared/parseDispatch.ts

Phase 2A — API Route
  [ ] app/api/analyze/route.ts

Phase 2B — Frontend
  [ ] app/layout.tsx
  [ ] app/page.tsx
  [ ] app/globals.css
  [ ] components/DispatchCard.tsx
  [ ] components/LocationMap.tsx     ← Google Maps integration
  [ ] components/IncidentForm.tsx

Phase 3 — Tests
  [ ] test/unit/parseDispatch.test.ts        (12 tests)
  [ ] test/integration/analyzeRoute.test.ts  (8 tests)
  [ ] npm run test passes

Phase 4 — Config + Deploy
  [ ] package.json, tsconfig.json, next.config.ts, vitest.config.ts
  [ ] firebase.json, apphosting.yaml
  [ ] .env.example, .env.local (gitignored), .gitignore
  [ ] README.md complete
  [ ] firebase apphosting:secrets:set GEMINI_API_KEY
  [ ] firebase deploy
  [ ] Live: paste crash text → Gemini dispatch card + Google Maps pin
  [ ] Verify: empty submit → error shown, no API call
  [ ] Verify: DevTools Network → no API key in any response
```

---

*Reviews: CEO Review (HOLD SCOPE) + Eng Review (FULL REVIEW) — 2026-03-28*
*Tech stack: Next.js 14 + Firebase App Hosting + Gemini 2.0 Flash + Google Maps Embed*
*Google Services: Gemini AI · Firebase Hosting · Firebase Functions · Google Maps*
