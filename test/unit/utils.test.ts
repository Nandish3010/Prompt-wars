import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeLocation } from '@/lib/geocoding';
import { getWeatherAtLocation, formatWeatherContext } from '@/lib/weather';
import { POST as transcribePOST } from '@/app/api/transcribe/route';
import { NextRequest } from 'next/server';

describe('Google Service Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Geocoding Library', () => {
    it('returns null if no API key is set', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const res = await geocodeLocation('Bangalore');
      expect(res).toBeNull();
    });

    it('returns coordinates on successful API response', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test_key';
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          status: 'OK',
          results: [{ geometry: { location: { lat: 10, lng: 20 } } }]
        })
      });
      const res = await geocodeLocation('Bangalore');
      expect(res).toEqual({ lat: 10, lng: 20 });
    });

    it('returns null on API failure', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test_key';
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const res = await geocodeLocation('Bangalore');
      expect(res).toBeNull();
    });
  });

  describe('Weather Library', () => {
    it('returns null if no API key is set', async () => {
      delete process.env.GOOGLE_WEATHER_API_KEY;
      const res = await getWeatherAtLocation(10, 20);
      expect(res).toBeNull();
    });

    it('formats weather context correctly', () => {
      const summary = formatWeatherContext({
        temperatureCelsius: 25,
        description: 'Sunny',
        windSpeedKmh: 15,
        precipitationPct: 0
      });
      expect(summary).toContain('Sunny');
      expect(summary).toContain('25°C');
    });

    it('returns null on fetch failure', async () => {
      process.env.GOOGLE_WEATHER_API_KEY = 'test_key';
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const res = await getWeatherAtLocation(10, 20);
      expect(res).toBeNull();
    });

    it('parses weather response correctly', async () => {
      process.env.GOOGLE_WEATHER_API_KEY = 'test_key';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          currentConditions: {
            temperature: { degrees: 30 },
            weatherCondition: { description: { text: 'Clear' } },
            wind: { speed: { value: 5 } },
            precipitation: { probability: { percent: 10 } }
          }
        })
      });
      const res = await getWeatherAtLocation(10, 20);
      expect(res!.temperatureCelsius).toBe(30);
      expect(res!.description).toBe('Clear');
    });
  });

  describe('Transcribe API Route', () => {
    it('returns 400 for invalid body', async () => {
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: 'invalid-json'
      });
      const res = await transcribePOST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when no audio is provided', async () => {
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ mimeType: 'audio/webm' })
      });
      const res = await transcribePOST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when audio exceeds max size', async () => {
      const base64Str = 'A'.repeat(15 * 1024 * 1024); // Exceeds 10MB
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audioBase64: base64Str, mimeType: 'audio/webm' })
      });
      const res = await transcribePOST(req);
      expect(res.status).toBe(400);
    });

    it('returns 503 if no API key is set', async () => {
      delete process.env.GOOGLE_SPEECH_API_KEY;
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audioBase64: 'fake-base64', mimeType: 'audio/webm' })
      });
      const res = await transcribePOST(req);
      expect(res.status).toBe(503);
    });

    it('returns transcript on success', async () => {
      process.env.GOOGLE_SPEECH_API_KEY = 'test_key';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ alternatives: [{ transcript: 'Hello world' }] }]
        })
      });

      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audioBase64: 'fake-base64', mimeType: 'audio/mp4' })
      });
      const res = await transcribePOST(req);
      const data = await res.json();
      expect(data.transcript).toBe('Hello world');
    });

    it('returns 502 on API failure', async () => {
      process.env.GOOGLE_SPEECH_API_KEY = 'test_key';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Error')
      });

      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audioBase64: 'fake-base64', mimeType: 'audio/webm' })
      });
      const res = await transcribePOST(req);
      expect(res.status).toBe(502);
    });
  });
});
