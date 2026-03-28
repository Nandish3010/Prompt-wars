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

export interface DispatchReport {
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
