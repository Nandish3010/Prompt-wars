/**
 * POST /api/transcribe
 *
 * Request:  { audioBase64: string, mimeType: string }
 * Response: { transcript: string } | { error: string }
 *
 * Proxies audio to Google Cloud Speech-to-Text API.
 * API key is server-side only — never exposed to the browser.
 *
 * Google service: Cloud Speech-to-Text API (speech.googleapis.com)
 */
import { NextRequest, NextResponse } from 'next/server';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — Speech-to-Text sync limit

/** Maps browser MIME types to Speech-to-Text encoding constants. */
function resolveEncoding(mimeType: string): string {
  if (mimeType.includes('webm')) return 'WEBM_OPUS';
  if (mimeType.includes('mp4'))  return 'MP3';
  if (mimeType.includes('ogg'))  return 'OGG_OPUS';
  return 'WEBM_OPUS'; // safe default for Chrome/Edge
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { audioBase64?: unknown; mimeType?: unknown };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body.audioBase64 !== 'string' || !body.audioBase64) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  // Guard against oversized payloads
  const estimatedBytes = body.audioBase64.length * 0.75;
  if (estimatedBytes > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio too large. Max 10MB.' }, { status: 400 });
  }

  const apiKey = process.env['GOOGLE_SPEECH_API_KEY'];
  if (!apiKey) {
    console.error('GOOGLE_SPEECH_API_KEY not configured');
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm';
  const encoding = resolveEncoding(mimeType);

  try {
    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: 48000,
            languageCode:    'en-US',
            model:           'latest_short',
          },
          audio: { content: body.audioBase64 },
        }),
      },
    );

    if (!res.ok) {
      console.error('Speech-to-Text error:', res.status, await res.text());
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
    }

    const data = await res.json() as {
      results?: Array<{ alternatives: Array<{ transcript: string }> }>;
    };

    const transcript = data.results?.[0]?.alternatives?.[0]?.transcript ?? '';
    return NextResponse.json({ transcript });

  } catch (err) {
    console.error('Transcribe route error:', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
