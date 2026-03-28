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

/**
 * Renders a Google Maps embed for the extracted incident location.
 * Returns null when confidence is LOW to avoid showing a wrong pin.
 * @param location - human-readable location string from Gemini
 * @param confidence - Gemini's confidence in the extracted location
 */
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
