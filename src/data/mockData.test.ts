import { describe, it, expect } from 'vitest';
import {
  satellites,
  closeApproaches,
  alerts,
  spaceWeather,
  orbitalCongestion,
  dashboardMetrics,
  analyticsData,
  countryData,
  collisionEvents,
  simulationPresets,
} from './mockData';

describe('KesslerX Catalog & Telemetry Data Integrity', () => {
  it('contains both active satellites and deterministic debris objects', () => {
    expect(satellites.length).toBeGreaterThan(100);
    const activePayloads = satellites.filter((s) => s.type !== 'Debris');
    const debrisObjects = satellites.filter((s) => s.type === 'Debris');

    expect(activePayloads.length).toBeGreaterThanOrEqual(19);
    expect(debrisObjects.length).toBeGreaterThanOrEqual(120);
  });

  it('validates orbital parameter ranges for all catalog objects', () => {
    for (const sat of satellites) {
      expect(sat.id).toBeTruthy();
      expect(sat.name).toBeTruthy();
      expect(sat.altitude).toBeGreaterThan(0);
      expect(sat.velocity).toBeGreaterThan(0);
      expect(sat.period).toBeGreaterThan(0);
      expect(sat.inclination).toBeGreaterThanOrEqual(0);
      expect(sat.inclination).toBeLessThanOrEqual(180);
      expect(sat.lat).toBeGreaterThanOrEqual(-90);
      expect(sat.lat).toBeLessThanOrEqual(90);
      expect(sat.lon).toBeGreaterThanOrEqual(-180);
      expect(sat.lon).toBeLessThanOrEqual(180);
      expect(['LEO', 'MEO', 'GEO', 'HEO']).toContain(sat.orbitType);
    }
  });

  it('validates close approach conjunction records and alerts', () => {
    expect(closeApproaches.length).toBeGreaterThan(0);
    for (const ca of closeApproaches) {
      expect(ca.missDistance).toBeGreaterThan(0);
      expect(ca.tcaMinutes).toBeGreaterThan(0);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(ca.severity);
    }

    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(alert.severity);
      expect(alert.title).toBeTruthy();
    }
  });

  it('validates space weather, congestion, and analytics structures', () => {
    expect(spaceWeather.kpIndex).toBeGreaterThanOrEqual(0);
    expect(spaceWeather.kpIndex).toBeLessThanOrEqual(9);
    expect(orbitalCongestion.LEO).toBeGreaterThan(orbitalCongestion.GEO);
    expect(dashboardMetrics.activeSatellites.value).toBeGreaterThan(0);
    expect(analyticsData.length).toBeGreaterThan(0);
    expect(countryData.length).toBeGreaterThan(0);
    expect(collisionEvents.length).toBeGreaterThan(0);
    expect(simulationPresets.length).toBeGreaterThan(0);
  });
});
