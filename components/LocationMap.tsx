/**
 * Embeds a Google Maps view of the extracted incident location.
 *
 * When GPS coordinates from the Geocoding API are available, the map
 * uses precise lat/lng for an exact pin. Falls back to a text query
 * if geocoding failed or wasn't available.
 *
 * Shown only when location is not null and confidence is not LOW.
 *
 * Google services: Maps Geocoding API (coords), Maps Embed API (iframe)
 */
'use client';

import React from 'react';
import { LocationConfidence, Coords } from '@/shared/dispatch';

const MAPS_EMBED_BASE = 'https://maps.google.com/maps';
const MAP_ZOOM        = 15;

interface LocationMapProps {
  location:   string;
  confidence: LocationConfidence;
  /** GPS coordinates from the Geocoding API for a precise pin. */
  coords?:    Coords;
}

/**
 * Renders a Google Maps embed for the extracted incident location.
 * Returns null when confidence is LOW to avoid showing a misleading pin.
 * @param location   - human-readable location string from Gemini
 * @param confidence - Gemini's confidence in the extracted location
 * @param coords     - optional GPS coordinates for precise pinning
 */
export default function LocationMap({ location, confidence, coords }: LocationMapProps) {
  if (confidence === LocationConfidence.LOW) return null;

  // Prefer precise lat/lng from Geocoding API; fall back to text query
  const query  = coords ? `${coords.lat},${coords.lng}` : encodeURIComponent(location);
  const mapSrc = `${MAPS_EMBED_BASE}?q=${query}&output=embed&z=${MAP_ZOOM}`;

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
            href={`https://maps.google.com/?q=${query}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps
          </a>
          {coords && ' · Precise pin via Geocoding API'}
        </small>
      </p>
    </div>
  );
}
