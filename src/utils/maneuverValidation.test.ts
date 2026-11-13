import { describe, it, expect } from 'vitest';
import {
  validateTcaTimestamp,
  validateTleLine,
  validateManeuverAssessment,
} from './maneuverValidation';

describe('maneuverValidation', () => {
  const refDate = new Date('2026-11-11T00:00:00Z');

  describe('validateTcaTimestamp', () => {
    it('accepts valid future ISO timestamp within 30 days', () => {
      const validTca = '2026-11-12T12:00:00Z';
      const result = validateTcaTimestamp(validTca, refDate);
      expect(result.valid).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('rejects unparseable or malformed date strings', () => {
      const result = validateTcaTimestamp('INVALID_DATE_STRING', refDate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid TCA timestamp format');
    });

    it('rejects empty or missing timestamp', () => {
      expect(validateTcaTimestamp('', refDate).valid).toBe(false);
      expect(validateTcaTimestamp(null, refDate).valid).toBe(false);
      expect(validateTcaTimestamp(undefined, refDate).valid).toBe(false);
    });

    it('rejects past TCA timestamps', () => {
      const pastTca = '2026-11-10T00:00:00Z'; // 1 day before refDate
      const result = validateTcaTimestamp(pastTca, refDate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is in the past');
    });

    it('rejects TCA timestamps beyond 30-day horizon', () => {
      const farFutureTca = '2027-01-01T00:00:00Z';
      const result = validateTcaTimestamp(farFutureTca, refDate);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds the maximum 30-day');
    });
  });

  describe('validateTleLine', () => {
    const validLine1 = '1 25544U 98067A   24142.50000000  .00016717  00000-0  10270-3 0  9025';
    const validLine2 = '2 25544  51.6416 250.2341 0004561  89.1234 271.0123 15.49812345421051';

    it('validates standard TLE lines', () => {
      expect(validateTleLine(validLine1, 1).valid).toBe(true);
      expect(validateTleLine(validLine2, 2).valid).toBe(true);
    });

    it('rejects lines with incorrect starting prefix', () => {
      expect(validateTleLine('2 25544 ...', 1).valid).toBe(false);
      expect(validateTleLine('1 25544 ...', 2).valid).toBe(false);
    });

    it('rejects truncated lines', () => {
      expect(validateTleLine('1 25544 TOO SHORT', 1).valid).toBe(false);
    });
  });

  describe('validateManeuverAssessment', () => {
    it('approves clean valid assessment inputs', () => {
      const validLine1 = '1 25544U 98067A   24142.50000000  .00016717  00000-0  10270-3 0  9025';
      const validLine2 = '2 25544  51.6416 250.2341 0004561  89.1234 271.0123 15.49812345421051';
      const result = validateManeuverAssessment(
        {
          tle1_line1: validLine1,
          tle1_line2: validLine2,
          tca: '2026-11-12T14:30:00Z',
          duration_hours: 24,
          step_seconds: 10,
          collision_probability: 0.05,
          miss_distance_km: 1.2,
        },
        refDate
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('flags unsupported non-maneuverable debris inputs as warning', () => {
      const result = validateManeuverAssessment(
        {
          object_a_name: 'COSMOS 1408 DEBRIS',
          tca: '2026-11-12T14:30:00Z',
        },
        refDate
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('uncooperative debris'))).toBe(true);
    });

    it('rejects negative miss distance and invalid probability', () => {
      const result = validateManeuverAssessment({
        collision_probability: 1.5,
        miss_distance_km: -5.0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('probability'))).toBe(true);
      expect(result.errors.some(e => e.includes('Miss distance'))).toBe(true);
    });
  });
});
