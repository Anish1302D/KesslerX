/**
 * TLE & Satellite Data Freshness Utility
 * Parses TLE epoch and determines data age, staleness thresholds, and propagation warnings.
 */

export interface TleFreshnessInfo {
  epochDate: Date | null;
  ageHours: number | null;
  ageDays: number | null;
  isStale: boolean; // > 48 hours
  isCritical: boolean; // > 168 hours (7 days)
  warningMessage?: string;
  severity: 'nominal' | 'stale' | 'critical';
}

/**
 * Extracts epoch Date from TLE Line 1 (columns 19-32: YYDDD.DDDDDDDD)
 */
export function parseTleEpoch(tleLine1?: string): Date | null {
  if (!tleLine1 || tleLine1.length < 32) return null;

  try {
    const epochStr = tleLine1.substring(18, 32).trim();
    if (!epochStr) return null;

    const rawYear = parseInt(epochStr.substring(0, 2), 10);
    if (isNaN(rawYear)) return null;

    // Two-digit year convention: 57-99 -> 1957-1999; 00-56 -> 2000-2056
    const fullYear = rawYear < 57 ? 2000 + rawYear : 1900 + rawYear;

    const dayOfYear = parseFloat(epochStr.substring(2));
    if (isNaN(dayOfYear)) return null;

    const epoch = new Date(Date.UTC(fullYear, 0, 1));
    // dayOfYear is 1-based, so add (dayOfYear - 1) days in milliseconds
    const epochTime = epoch.getTime() + (dayOfYear - 1) * 86400000;
    return new Date(epochTime);
  } catch {
    return null;
  }
}

/**
 * Evaluates TLE freshness against standard flight dynamics thresholds.
 * @param tleLine1 First line of the TLE
 * @param referenceDate Optional reference date (defaults to now)
 * @param staleHours Threshold for stale warning (default 48 hours)
 * @param criticalHours Threshold for critical warning (default 168 hours / 7 days)
 */
export function evaluateTleFreshness(
  tleLine1?: string,
  referenceDate: Date = new Date(),
  staleHours: number = 48,
  criticalHours: number = 168
): TleFreshnessInfo {
  const epochDate = parseTleEpoch(tleLine1);

  if (!epochDate || isNaN(epochDate.getTime())) {
    return {
      epochDate: null,
      ageHours: null,
      ageDays: null,
      isStale: true,
      isCritical: false,
      severity: 'stale',
      warningMessage: 'Epoch timestamp unavailable. Orbital elements age unknown.',
    };
  }

  const ageMs = referenceDate.getTime() - epochDate.getTime();
  const ageHours = Math.max(0, Math.round(ageMs / 3600000));
  const ageDays = Math.round((ageHours / 24) * 10) / 10;

  if (ageHours > criticalHours) {
    return {
      epochDate,
      ageHours,
      ageDays,
      isStale: true,
      isCritical: true,
      severity: 'critical',
      warningMessage: `CRITICAL TLE AGE: Elements are ${ageDays} days old (${ageHours}h). High SGP4 propagation drift. Re-observation required.`,
    };
  }

  if (ageHours > staleHours) {
    return {
      epochDate,
      ageHours,
      ageDays,
      isStale: true,
      isCritical: false,
      severity: 'stale',
      warningMessage: `STALE TLE WARNING: Orbital elements are ${ageHours}h old (>48h). Atmospheric drag may increase position uncertainty.`,
    };
  }

  return {
    epochDate,
    ageHours,
    ageDays,
    isStale: false,
    isCritical: false,
    severity: 'nominal',
    warningMessage: undefined,
  };
}

