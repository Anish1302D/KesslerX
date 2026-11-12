import { describe, it, expect } from 'vitest';
import { parseTleEpoch, evaluateTleFreshness } from './tleFreshness';

describe('tleFreshness utility', () => {
  it('parses valid TLE epoch year and day accurately', () => {
    // 24001.50000000 = Year 2024, day 1.5 (Jan 1, 12:00:00 UTC)
    const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
    const date = parseTleEpoch(line1);

    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2024);
    expect(date?.getUTCMonth()).toBe(0); // January
    expect(date?.getUTCDate()).toBe(1);
    expect(date?.getUTCHours()).toBe(12);
  });

  it('marks data nominal when TLE is less than 48 hours old', () => {
    // Reference date: Jan 2, 2024 12:00 UTC (24h after Jan 1, 12:00 UTC)
    const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
    const ref = new Date(Date.UTC(2024, 0, 2, 12, 0, 0));

    const freshness = evaluateTleFreshness(line1, ref);
    expect(freshness.isStale).toBe(false);
    expect(freshness.isCritical).toBe(false);
    expect(freshness.severity).toBe('nominal');
    expect(freshness.ageHours).toBe(24);
  });

  it('flags warning when TLE is older than 48 hours', () => {
    // Reference date: Jan 4, 2024 12:00 UTC (72h after Jan 1, 12:00 UTC)
    const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
    const ref = new Date(Date.UTC(2024, 0, 4, 12, 0, 0));

    const freshness = evaluateTleFreshness(line1, ref);
    expect(freshness.isStale).toBe(true);
    expect(freshness.isCritical).toBe(false);
    expect(freshness.severity).toBe('stale');
    expect(freshness.warningMessage).toContain('STALE TLE WARNING');
  });

  it('flags critical alert when TLE is older than 7 days (168 hours)', () => {
    // Reference date: Jan 15, 2024 12:00 UTC (14 days after Jan 1)
    const line1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';
    const ref = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));

    const freshness = evaluateTleFreshness(line1, ref);
    expect(freshness.isStale).toBe(true);
    expect(freshness.isCritical).toBe(true);
    expect(freshness.severity).toBe('critical');
    expect(freshness.warningMessage).toContain('CRITICAL TLE AGE');
  });

  it('handles null or invalid TLE line gracefully', () => {
    const freshness = evaluateTleFreshness('invalid tle line string');
    expect(freshness.epochDate).toBeNull();
    expect(freshness.isStale).toBe(true);
    expect(freshness.warningMessage).toContain('Epoch timestamp unavailable');
  });
});

