/**
 * Fetches live weather conditions using the Google Weather API.
 *
 * Weather context is prepended to the Gemini prompt so severity and
 * resource recommendations account for real-world conditions:
 *   - High winds → fire spreads faster → escalate severity
 *   - Heavy rain → wet roads → hydroplaning risk
 *   - Extreme heat → medical emergency risk
 *
 * Google service: Google Weather API (weather.googleapis.com)
 */

/** Normalised weather conditions for Gemini context injection. */
export interface WeatherConditions {
  temperatureCelsius: number;
  description:        string;
  windSpeedKmh:       number;
  precipitationPct:   number;
}

/**
 * Fetches current weather at the given coordinates.
 * @param lat - latitude of the incident location
 * @param lng - longitude of the incident location
 * @returns WeatherConditions or null if the API is unavailable
 */
export async function getWeatherAtLocation(
  lat: number,
  lng: number,
): Promise<WeatherConditions | null> {
  const apiKey = process.env['GOOGLE_WEATHER_API_KEY'];
  if (!apiKey) return null;

  const url =
    `https://weather.googleapis.com/v1/currentConditions:lookup` +
    `?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    // Response is wrapped under "currentConditions"
    const data = await res.json() as {
      currentConditions?: {
        temperature?:     { degrees?: number };
        weatherCondition?: { description?: { text?: string } };
        wind?:            { speed?: { value?: number } };
        precipitation?:   { probability?: { percent?: number } };
      };
    };

    const c = data.currentConditions;
    if (!c) return null;

    return {
      temperatureCelsius: c.temperature?.degrees               ?? 0,
      description:        c.weatherCondition?.description?.text ?? 'Unknown',
      windSpeedKmh:       c.wind?.speed?.value                  ?? 0,
      precipitationPct:   c.precipitation?.probability?.percent ?? 0,
    };
  } catch {
    // Network error or unexpected response — skip weather enrichment
    return null;
  }
}

/**
 * Formats a WeatherConditions object into a concise string for Gemini context.
 * @param w - weather conditions to format
 * @returns single-line weather summary
 */
export function formatWeatherContext(w: WeatherConditions): string {
  return (
    `Current weather at incident location: ${w.description}, ` +
    `${w.temperatureCelsius}°C, wind ${w.windSpeedKmh} km/h, ` +
    `precipitation probability ${w.precipitationPct}%.`
  );
}
