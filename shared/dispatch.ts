/**
 * Core types for CrisisConnect dispatch reports.
 * Shared between the API route (server) and React components (client).
 */

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH     = 'HIGH',
  MEDIUM   = 'MEDIUM',
  LOW      = 'LOW',
}

export enum LocationConfidence {
  HIGH   = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW    = 'LOW',
}

/** GPS coordinates from the Geocoding API — used for precise map pinning. */
export interface Coords {
  lat: number;
  lng: number;
}

export interface DispatchReport {
  id?:                string;     // Firestore document ID
  timestamp?:         number;     // epoch ms
  imageUrl?:          string;     // Cloud Storage URL
  coords?:            Coords;     // GPS from Google Maps Geocoding API
  weatherContext?:    string;     // Weather summary from Google Weather API
  incidentType:       string;
  severity:           Severity;
  location:           string | null;
  injuries:           string;
  requiredResources:  string[];
  actionableSummary:  string;
  locationConfidence: LocationConfidence;
}

/** API response shapes */
export interface AnalyzeSuccessResponse {
  dispatch: DispatchReport;
}

export interface AnalyzeErrorResponse {
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccessResponse | AnalyzeErrorResponse;
