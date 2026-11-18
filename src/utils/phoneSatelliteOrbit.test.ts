import { describe, it, expect } from 'vitest';
import {
  PHONE_SATELLITE_IDENTITY,
  PHONE_MOCK_ORBIT,
  PHONE_SATELLITE_SAFETY_LABELS,
  propagatePhoneSatelliteOrbit,
  buildPhoneOrbitTrack,
  evaluatePhoneTiltConjunction,
  createDefaultPhoneSatelliteData,
  phoneSatelliteToItem,
} from './phoneSatelliteOrbit';
import { satellites as existingSatellites, collisionEvents as existingCollisions } from '../data/mockData';

describe('PHONE-SATELLITE-001 Deterministic Orbit & Tilt Model', () => {
  it('defines distinct identity, color, and preserves existing fixtures untouched', () => {
    expect(PHONE_SATELLITE_IDENTITY.id).toBe('PHONE-SATELLITE-001');
    expect(PHONE_SATELLITE_IDENTITY.name).toBe('PHONE SATELLITE');
    expect(PHONE_SATELLITE_IDENTITY.object_type).toBe('PHONE_SATELLITE');
    expect(PHONE_SATELLITE_IDENTITY.color).toBe('#FF2EF5');
    expect(PHONE_SATELLITE_IDENTITY.ground_station_id).toBe('KX-RPI-ZERO-GS-001');
    expect(PHONE_SATELLITE_IDENTITY.hardware_model).toBe('Raspberry Pi Zero W');

    // Existing fixtures must not be polluted by phone satellite or phone conjunction
    expect(existingSatellites.some((s) => s.id === 'PHONE-SATELLITE-001' || s.name === 'PHONE SATELLITE')).toBe(false);
    expect(existingCollisions.some((c) => c.id === 'PHONE-DEMO-CONJUNCTION-001')).toBe(false);
  });

  it('computes a deterministic independent mock orbit for any fixed UTC date', () => {
    const t0 = new Date('2026-11-17T12:00:00Z');
    const posA = propagatePhoneSatelliteOrbit(t0);
    const posB = propagatePhoneSatelliteOrbit(t0);
    expect(posA).toEqual(posB);

    expect(PHONE_MOCK_ORBIT.semi_major_axis_km).toBe(7021.0);
    expect(PHONE_MOCK_ORBIT.altitude_km).toBe(650.0);
    expect(PHONE_MOCK_ORBIT.inclination_deg).toBe(72.0);
    expect(PHONE_MOCK_ORBIT.eccentricity).toBe(0.012);
    expect(PHONE_MOCK_ORBIT.orbit_type).toBe('MOCK_LEO_PHONE_DEMO');

    const t1 = new Date('2026-11-17T12:15:00Z');
    const posLater = propagatePhoneSatelliteOrbit(t1);
    expect(posLater.lat).not.toBe(posA.lat);

    const item = phoneSatelliteToItem(createDefaultPhoneSatelliteData(t0), t0);
    expect(item.NORAD_CAT_ID).toBe('PHONE-SATELLITE-001');
    expect(item.OBJECT_NAME).toBe('PHONE SATELLITE');
    expect(item.CATEGORY).toBe('Phone Satellite');

    // Distinct marker/orbit color not shared by existing categories
    const existingColors = ['#00AEEF', '#FF4D4D', '#FFFFFF', '#EAB308', '#F97316', '#10B981', '#A855F7', '#94A3B8'];
    expect(existingColors).not.toContain(PHONE_SATELLITE_IDENTITY.color);

    // Full mock orbit track builds multiple deterministic points across 97.4 minutes
    const track = buildPhoneOrbitTrack(t0, PHONE_MOCK_ORBIT.period_minutes, 120);
    expect(track.length).toBeGreaterThan(40);
    expect(track[0].pos.altitude_km).toBeGreaterThan(550);
    expect(track[0].pos.altitude_km).toBeLessThan(750);
  });

  it('evaluates tilt-driven demonstration collision probability deterministically and caps at 0.60', () => {
    const level = evaluatePhoneTiltConjunction(0, 0, 0);
    expect(level.risk_level).toBe('SAFE');
    expect(level.collision_probability).toBe(0.005);
    expect(level.source).toBe('simulation');
    expect(level.mode).toBe('simulated');

    const slight = evaluatePhoneTiltConjunction(10, 0, 0);
    expect(slight.risk_level).toBe('LOW');
    expect(slight.collision_probability).toBeGreaterThan(level.collision_probability);

    const moderate = evaluatePhoneTiltConjunction(25, 5, 0);
    expect(moderate.risk_level).toBe('MEDIUM');
    expect(moderate.collision_probability).toBeGreaterThan(slight.collision_probability);

    const high = evaluatePhoneTiltConjunction(38, 0, 0);
    expect(high.risk_level).toBe('HIGH');

    const critical = evaluatePhoneTiltConjunction(70, 20, 0);
    expect(critical.risk_level).toBe('CRITICAL');
    expect(critical.collision_probability).toBeLessThanOrEqual(0.6);

    const extreme = evaluatePhoneTiltConjunction(180, 180, 0);
    expect(extreme.collision_probability).toBe(0.6);

    const returned = evaluatePhoneTiltConjunction(1, 0, 0);
    expect(returned.collision_probability).toBeLessThan(critical.collision_probability);
    expect(returned.risk_level).toBe('SAFE');

    expect(PHONE_SATELLITE_SAFETY_LABELS.disclaimer).toBe(
      'Decision support only — human approval required. Not a flight command system.'
    );
  });
});
