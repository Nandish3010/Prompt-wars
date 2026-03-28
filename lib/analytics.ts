/**
 * Firebase Analytics event logging.
 *
 * isSupported() check is required — Analytics is browser-only and
 * will return false in SSR, Node.js, or browsers blocking cookies.
 *
 * Google service: Firebase Analytics
 */
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import { firebaseApp } from './firebase';

/**
 * Logs an incident_analyzed event to Firebase Analytics.
 * Fire-and-forget — failures are silently ignored so they never block the UI.
 * @param severity    - incident severity level (CRITICAL | HIGH | MEDIUM | LOW)
 * @param incidentType - human-readable incident type from Gemini
 */
export async function logIncidentAnalyzed(
  severity: string,
  incidentType: string,
): Promise<void> {
  if (!(await isSupported())) return;
  const analytics = getAnalytics(firebaseApp);
  logEvent(analytics, 'incident_analyzed', {
    severity,
    incident_type: incidentType,
  });
}
