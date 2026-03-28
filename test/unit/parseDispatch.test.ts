import { describe, it, expect } from 'vitest';
import { parseDispatchJSON, validateSchema, ParseError, ValidationError }
  from '@/shared/parseDispatch';
import { Severity, LocationConfidence } from '@/shared/dispatch';

const VALID: Record<string, unknown> = {
  incidentType: 'Auto Collision', severity: 'CRITICAL',
  location: '5th Avenue', injuries: '1 confirmed',
  requiredResources: ['1x Ambulance'],
  actionableSummary: 'Immediate response required.',
  locationConfidence: 'HIGH',
};

describe('parseDispatchJSON', () => {
  it('parses valid JSON string', () => {
    expect(parseDispatchJSON(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('strips ```json markdown fences', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseDispatchJSON(wrapped)).toEqual(VALID);
  });

  it('strips plain ``` fences', () => {
    const wrapped = '```\n' + JSON.stringify(VALID) + '\n```';
    expect(parseDispatchJSON(wrapped)).toEqual(VALID);
  });

  it('throws ParseError on empty string', () => {
    expect(() => parseDispatchJSON('')).toThrow(ParseError);
  });

  it('throws ParseError on non-JSON text', () => {
    expect(() => parseDispatchJSON('Sorry, I cannot help.')).toThrow(ParseError);
  });
});

describe('validateSchema', () => {
  it('returns typed DispatchReport for valid object', () => {
    const result = validateSchema(VALID);
    expect(result.severity).toBe(Severity.CRITICAL);
    expect(result.locationConfidence).toBe(LocationConfidence.HIGH);
  });

  it('throws ValidationError for invalid severity', () => {
    expect(() => validateSchema({ ...VALID, severity: 'EXTREME' })).toThrow(ValidationError);
  });

  it('throws ValidationError for missing incidentType', () => {
    const { incidentType: _, ...rest } = VALID;
    expect(() => validateSchema(rest)).toThrow(ValidationError);
  });

  it('accepts null location', () => {
    expect(() => validateSchema({ ...VALID, location: null, locationConfidence: 'LOW' }))
      .not.toThrow();
  });

  it('accepts empty requiredResources array', () => {
    expect(() => validateSchema({ ...VALID, requiredResources: [] })).not.toThrow();
  });

  it('throws ValidationError for requiredResources not an array', () => {
    expect(() => validateSchema({ ...VALID, requiredResources: '1x Ambulance' }))
      .toThrow(ValidationError);
  });

  it('throws ValidationError for non-object input', () => {
    expect(() => validateSchema([])).toThrow(ValidationError);
    expect(() => validateSchema(null)).toThrow(ValidationError);
  });

  it('throws ValidationError for invalid locationConfidence', () => {
    expect(() => validateSchema({ ...VALID, locationConfidence: 'VERY_HIGH' }))
      .toThrow(ValidationError);
  });
});
