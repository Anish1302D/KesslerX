/**
 * Validation utilities for conjunction and maneuver assessment timestamps and inputs.
 * Ensures timestamps are valid ISO dates, strictly in the future, within screening horizon,
 * and flags unsupported assessment parameters without altering core maneuver mechanics.
 */

export interface ManeuverAssessmentInput {
  tca?: string | null;
  duration_hours?: number;
  step_seconds?: number;
  tle1_line1?: string;
  tle1_line2?: string;
  tle2_line1?: string;
  tle2_line2?: string;
  object_a_name?: string;
  object_b_name?: string;
  miss_distance_km?: number;
  collision_probability?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a TCA (Time of Closest Approach) timestamp.
 */
export function validateTcaTimestamp(
  tca: string | null | undefined,
  referenceDate: Date = new Date()
): { valid: boolean; error?: string; date?: Date } {
  if (!tca || typeof tca !== 'string' || tca.trim() === '') {
    return { valid: false, error: 'TCA timestamp is required for maneuver assessment.' };
  }

  const parsedTime = Date.parse(tca);
  if (isNaN(parsedTime)) {
    return { valid: false, error: `Invalid TCA timestamp format: '${tca}'. Expected valid ISO-8601 UTC date string.` };
  }

  const tcaDate = new Date(parsedTime);

  // Reject dates in the past (allow 10-second margin for in-flight clock skew)
  if (tcaDate.getTime() < referenceDate.getTime() - 10000) {
    return {
      valid: false,
      error: `TCA timestamp (${tcaDate.toISOString()}) is in the past. Maneuver assessments require a future Time of Closest Approach.`,
      date: tcaDate,
    };
  }

  // Reject excessively distant dates (> 30 days)
  const maxFutureMs = 30 * 24 * 60 * 60 * 1000;
  if (tcaDate.getTime() > referenceDate.getTime() + maxFutureMs) {
    return {
      valid: false,
      error: 'TCA timestamp exceeds the maximum 30-day orbital ephemeris screening horizon.',
      date: tcaDate,
    };
  }

  return { valid: true, date: tcaDate };
}

/**
 * Validates TLE input format.
 */
export function validateTleLine(line: string, expectedLineNum: 1 | 2): { valid: boolean; error?: string } {
  const trimmed = line.trim();
  if (!trimmed) {
    return { valid: false, error: `TLE Line ${expectedLineNum} is missing.` };
  }
  if (!trimmed.startsWith(`${expectedLineNum} `)) {
    return { valid: false, error: `TLE Line ${expectedLineNum} must start with '${expectedLineNum} '.` };
  }
  if (trimmed.length < 60 || trimmed.length > 72) {
    return { valid: false, error: `TLE Line ${expectedLineNum} has invalid length (${trimmed.length} chars). Standard TLE line is 69 characters.` };
  }
  return { valid: true };
}

/**
 * Validates full maneuver assessment inputs and flags unsupported cases.
 */
export function validateManeuverAssessment(
  input: ManeuverAssessmentInput,
  referenceDate: Date = new Date()
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate TLE lines if provided
  if (input.tle1_line1) {
    const v = validateTleLine(input.tle1_line1, 1);
    if (!v.valid && v.error) errors.push(`Object A: ${v.error}`);
  }
  if (input.tle1_line2) {
    const v = validateTleLine(input.tle1_line2, 2);
    if (!v.valid && v.error) errors.push(`Object A: ${v.error}`);
  }
  if (input.tle2_line1) {
    const v = validateTleLine(input.tle2_line1, 1);
    if (!v.valid && v.error) errors.push(`Object B: ${v.error}`);
  }
  if (input.tle2_line2) {
    const v = validateTleLine(input.tle2_line2, 2);
    if (!v.valid && v.error) errors.push(`Object B: ${v.error}`);
  }

  // Validate TCA if provided
  if (input.tca !== undefined) {
    const tcaVal = validateTcaTimestamp(input.tca, referenceDate);
    if (!tcaVal.valid && tcaVal.error) {
      errors.push(tcaVal.error);
    } else if (tcaVal.date) {
      const minutesToTca = (tcaVal.date.getTime() - referenceDate.getTime()) / (60 * 1000);
      if (minutesToTca < 20) {
        warnings.push(`Emergency: TCA is within ${Math.round(minutesToTca)} minutes. Maneuver execution window is critically short.`);
      }
    }
  }

  // Validate duration hours
  if (input.duration_hours !== undefined) {
    if (isNaN(input.duration_hours) || input.duration_hours <= 0) {
      errors.push('Assessment duration must be a positive number of hours.');
    } else if (input.duration_hours > 168) {
      errors.push('Assessment duration exceeds maximum supported window of 168 hours (7 days).');
    }
  }

  // Validate step seconds
  if (input.step_seconds !== undefined) {
    if (isNaN(input.step_seconds) || input.step_seconds < 1 || input.step_seconds > 600) {
      errors.push('Simulation step seconds must be between 1 and 600 seconds.');
    }
  }

  // Flag unsupported inputs / edge cases
  if (input.object_a_name?.toUpperCase().includes('DEBRIS')) {
    warnings.push('Asset A is flagged as uncooperative debris. Avoidance burn can only be conducted by asset B.');
  }

  if (input.collision_probability !== undefined) {
    if (input.collision_probability < 0 || input.collision_probability > 1.0) {
      errors.push('Collision probability must be a decimal between 0.0 and 1.0.');
    }
  }

  if (input.miss_distance_km !== undefined) {
    if (input.miss_distance_km < 0) {
      errors.push('Miss distance cannot be negative.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
