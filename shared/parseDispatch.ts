/**
 * Parses and validates raw Gemini text output into a DispatchReport.
 *
 * Data flow:
 *   raw string (Gemini response.text())
 *     └─▶ stripMarkdownFences()   removes ```json...``` wrappers
 *     └─▶ JSON.parse()            throws ParseError if invalid
 *     └─▶ validateSchema()        throws ValidationError if wrong shape
 *     └─▶ DispatchReport          fully typed, safe to render
 *
 * CRITICAL: Gemini often wraps responses in markdown fences.
 * stripMarkdownFences() prevents silent parse failures.
 */
import { DispatchReport, Severity, LocationConfidence } from './dispatch';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const SEVERITY_VALUES   = Object.values(Severity) as string[];
const CONFIDENCE_VALUES = Object.values(LocationConfidence) as string[];

/** Strips markdown code fences Gemini sometimes wraps JSON in. */
function stripMarkdownFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/**
 * Parses a raw Gemini response string into an unknown object.
 * @param raw - raw string from Gemini response.text()
 * @returns parsed JSON as unknown
 * @throws {ParseError} if the string is not valid JSON.
 */
export function parseDispatchJSON(raw: string): unknown {
  if (!raw || raw.trim() === '') {
    throw new ParseError('Empty response from Gemini');
  }
  const cleaned = stripMarkdownFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ParseError(`Invalid JSON from Gemini: ${cleaned.slice(0, 80)}`);
  }
}

/**
 * Validates that a parsed object matches the DispatchReport schema.
 * @param data - parsed unknown object from parseDispatchJSON
 * @returns fully typed DispatchReport
 * @throws {ValidationError} if any required field is missing or invalid.
 */
export function validateSchema(data: unknown): DispatchReport {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError('Response is not a JSON object');
  }

  const d = data as Record<string, unknown>;

  if (typeof d['incidentType'] !== 'string' || !d['incidentType']) {
    throw new ValidationError('Missing or invalid incidentType');
  }
  if (!SEVERITY_VALUES.includes(d['severity'] as string)) {
    throw new ValidationError(`Invalid severity: ${String(d['severity'])}`);
  }
  if (d['location'] !== null && typeof d['location'] !== 'string') {
    throw new ValidationError('location must be a string or null');
  }
  if (typeof d['injuries'] !== 'string') {
    throw new ValidationError('Missing injuries field');
  }
  if (!Array.isArray(d['requiredResources'])) {
    throw new ValidationError('requiredResources must be an array');
  }
  if (typeof d['actionableSummary'] !== 'string' || !d['actionableSummary']) {
    throw new ValidationError('Missing actionableSummary');
  }
  if (!CONFIDENCE_VALUES.includes(d['locationConfidence'] as string)) {
    throw new ValidationError(`Invalid locationConfidence: ${String(d['locationConfidence'])}`);
  }

  return data as DispatchReport;
}
