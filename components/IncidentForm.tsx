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

/**
 * Converts a File to a base64-encoded string (without the data URL prefix).
 * @param file - image file from input[type=file]
 * @returns base64-encoded image data
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/** Main incident report form with dispatch card output. */
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
