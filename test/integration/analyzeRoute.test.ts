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
