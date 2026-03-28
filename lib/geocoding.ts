/**
 * Geocodes a location string to lat/lng using the Google Maps Geocoding API.
 *
 * Called server-side only (route.ts) — API key is never exposed to the browser.
 * Coordinates are returned in the DispatchReport and used by LocationMap for
 * precise map pinning instead of a text-query embed.
 *
 * Google service: Google Maps Geocoding API
 */

/** Lat/lng coordinate pair returned by the Geocoding API. */
export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Converts a human-readable location string to GPS coordinates.
 * @param location - location string extracted by Gemini (e.g. "5th and Broadway")
 * @returns Coords or null if geocoding fails or key is missing
 */
export async function geocodeLocation(location: string): Promise<Coords | null> {
  const apiKey = process.env['GOOGLE_MAPS_API_KEY'];
  if (!apiKey) return null;

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(location)}&key=${apiKey}`;

  try {
    const res  = await fetch(url);
    const data = await res.json() as {
      status:  string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    if (data.status === 'OK' && data.results[0]) {
      return data.results[0].geometry.location;
    }
  } catch {
    // Network error — fall back to text-query map embed
  }
  return null;
}
