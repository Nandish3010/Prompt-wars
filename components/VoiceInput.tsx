/**
 * Voice input button — captures audio via MediaRecorder and transcribes
 * it using Google Cloud Speech-to-Text via the /api/transcribe route.
 *
 * Gracefully degrades: renders nothing if MediaRecorder is not available
 * (IE, some mobile webviews, SSR).
 *
 * Google service: Cloud Speech-to-Text API (via /api/transcribe)
 */
'use client';

import React, { useState, useRef } from 'react';

interface VoiceInputProps {
  /** Called with the transcription text when speech recognition completes. */
  onTranscript: (text: string) => void;
  /** Disables the button (e.g. while the form is submitting). */
  disabled?: boolean;
}

/**
 * Microphone button that records audio and returns a transcript.
 * Renders nothing in environments where MediaRecorder is unavailable.
 * @param onTranscript - callback receiving the transcribed text
 * @param disabled     - disables recording when the form is loading
 */
export default function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [isRecording,    setIsRecording]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // SSR + unsupported browser guard — render nothing rather than a broken button
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return null;

  /** Determines the best supported audio format for this browser. */
  function getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    return types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  async function startRecording() {
    setError(null);
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current   = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob     = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const base64   = await blobToBase64(blob);
        await transcribe(base64, blob.type);
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setError('Microphone access denied.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
    setIsTranscribing(true);
  }

  async function transcribe(audioBase64: string, mimeType: string) {
    try {
      const res  = await fetch('/api/transcribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audioBase64, mimeType }),
      });
      const data = await res.json() as { transcript?: string; error?: string };
      if (data.transcript) {
        onTranscript(data.transcript);
      } else {
        setError(data.error ?? 'Transcription failed. Try again.');
      }
    } catch {
      setError('Transcription failed. Try again.');
    } finally {
      setIsTranscribing(false);
    }
  }

  const label = isRecording
    ? 'Stop recording'
    : isTranscribing
    ? 'Transcribing…'
    : 'Start voice input';

  return (
    <div className="voice-input">
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isTranscribing}
        aria-label={label}
        aria-pressed={isRecording}
        className={`voice-btn${isRecording ? ' voice-btn--recording' : ''}`}
      >
        {isRecording ? '⏹ Stop' : isTranscribing ? 'Transcribing…' : '🎤 Speak'}
      </button>

      {error && (
        <span role="alert" className="voice-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** Converts a Blob to a base64 string (without the data-URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to encode audio'));
    reader.readAsDataURL(blob);
  });
}
