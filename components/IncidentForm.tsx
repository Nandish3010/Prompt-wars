/**
 * Main incident input form.
 *
 * State machine:
 *   idle ──submit──▶ loading ──success──▶ idle (card shown)
 *                           └──error────▶ idle (error shown)
 *
 * Textarea is controlled (value/onChange) so VoiceInput can populate it.
 * Double-submit guard: isLoading state prevents concurrent requests.
 */
'use client';

import { useState, useRef, FormEvent }  from 'react';
import { DispatchReport }               from '@/shared/dispatch';
import { AnalyzeResponse }              from '@/shared/dispatch';
import { logIncidentAnalyzed }          from '@/lib/analytics';
import DispatchCard                     from './DispatchCard';
import VoiceInput                       from './VoiceInput';

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

/**
 * Validates an image file against type and size constraints.
 * @param file - file to validate
 * @returns error string if invalid, null if valid
 */
function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are supported.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image too large. Max 4MB.';
  }
  return null;
}

/**
 * Builds the JSON body for the /api/analyze request.
 * @param text - incident description text
 * @param file - optional image file
 */
async function buildRequestBody(
  text: string,
  file: File | undefined,
): Promise<{ text: string; imageBase64?: string; mimeType?: string }> {
  const body: { text: string; imageBase64?: string; mimeType?: string } = { text };
  if (file) {
    body.imageBase64 = await fileToBase64(file);
    body.mimeType    = file.type;
  }
  return body;
}

interface IncidentFormProps {
  /** Called after each successful dispatch so the parent can refresh RecentIncidents. */
  onDispatch?: () => void;
}

/** Main incident report form with voice input and dispatch card output. */
export default function IncidentForm({ onDispatch }: IncidentFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [dispatch,  setDispatch]  = useState<DispatchReport | null>(null);
  const [textValue, setTextValue] = useState('');
  const cardRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading) return; // double-submit guard

    setError(null);
    setDispatch(null);

    const file = fileRef.current?.files?.[0];

    if (!textValue.trim()) {
      setError('Please describe the incident before analyzing.');
      return;
    }

    if (file) {
      const imgError = validateImage(file);
      if (imgError) { setError(imgError); return; }
    }

    setIsLoading(true);

    try {
      const body = await buildRequestBody(textValue.trim(), file);
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
      onDispatch?.();

      // Fire-and-forget analytics — never blocks UI
      logIncidentAnalyzed(data.dispatch.severity, data.dispatch.incidentType).catch(() => {});

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
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
          />
          <span id="text-hint" className="hint">
            Describe what you see — location, injuries, vehicle count, fire, etc.
          </span>
          <VoiceInput
            onTranscript={(t) => setTextValue(prev => prev ? `${prev} ${t}` : t)}
            disabled={isLoading}
          />
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
            ref={fileRef}
          />
          <span id="photo-hint" className="hint">JPG, PNG, or WebP · Max 4MB</span>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading
            ? <><span className="spinner" aria-hidden="true" />Analyzing incident...</>
            : 'Analyze Incident'}
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
            ref={cardRef}
          />
        )}
      </div>
    </div>
  );
}
