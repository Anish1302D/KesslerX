import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GlobeFallbackTable, { SatelliteItem } from '../dashboard/GlobeFallbackTable';
import CesiumErrorBoundary from '../dashboard/CesiumErrorBoundary';
import CesiumGlobe from '../dashboard/CesiumGlobe';
import ObjectDetailsPanel from '../dashboard/ObjectDetailsPanel';
import PhoneSatellitePanel from './PhoneSatellitePanel';
import { UserProvider } from '../handoff/UserContext';
import {
  createDefaultPhoneSatelliteData,
  evaluatePhoneTiltConjunction,
  phoneSatelliteToItem,
} from '../../utils/phoneSatelliteOrbit';

const baseCatalog: SatelliteItem[] = [
  {
    NORAD_CAT_ID: 25544,
    OBJECT_NAME: 'ISS (ZARYA)',
    CATEGORY: 'ISS',
    altitude: 420,
    epoch: '2026-11-17T00:00:00Z',
    source: 'Space-Track',
    status: 'Active Operational',
  },
];

describe('Phone Satellite UI, Fallback & Safety Labels', () => {
  it('displays PHONE-SATELLITE-001 in 2D fallback clearly labelled as mock demonstration orbit', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry.orientation = { roll_deg: 24, pitch_deg: 6, yaw_deg: 110 };
    phoneData.conjunction = evaluatePhoneTiltConjunction(24, 6, 110, '2026-11-17T12:00:00Z');

    render(
      <GlobeFallbackTable
        satellites={baseCatalog}
        phoneSatellite={phoneData}
        reason="WebGL context unavailable"
      />
    );

    expect(screen.getAllByText('PHONE SATELLITE').length).toBeGreaterThan(0);
    expect(screen.getByText(/Mock Demonstration Orbit \(MOCK_LEO_PHONE_DEMO\)/i)).toBeDefined();
    expect(screen.getByTestId('fallback-phone-telemetry')).toBeDefined();
    expect(screen.getByText(/Demonstration collision probability:/i)).toBeDefined();
  });

  it('keeps phone telemetry visible when WebGL / Cesium initialization crashes inside ErrorBoundary', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry.orientation = { roll_deg: 55, pitch_deg: 15, yaw_deg: 45 };
    phoneData.conjunction = evaluatePhoneTiltConjunction(55, 15, 45, '2026-11-17T12:05:00Z');

    const CrashingGlobe = () => {
      throw new Error('Simulated WebGL failure');
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <CesiumErrorBoundary satellites={baseCatalog} phoneSatellite={phoneData}>
          <CrashingGlobe />
        </CesiumErrorBoundary>
        <PhoneSatellitePanel phoneSatellite={phoneData} />
      </div>
    );

    consoleSpy.mockRestore();

    // 2D fallback displays phone satellite row
    expect(screen.getByTestId('globe-fallback-view')).toBeDefined();
    expect(screen.getByTestId('fallback-phone-telemetry')).toBeDefined();
    // Additive PhoneSatellitePanel telemetry remains fully visible despite WebGL crash
    const panel = screen.getByTestId('phone-satellite-panel');
    expect(panel).toBeDefined();
    expect(panel.textContent).toContain('CRITICAL');
    expect(panel.textContent).toContain('Raspberry Pi Zero W Ground Station (KX-RPI-ZERO-GS-001)');
    expect(panel.textContent).toContain('PHONE SATELLITE — SIMULATED');
    expect(panel.textContent).toContain('MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS');
    expect(panel.textContent).toContain('DEMO COLLISION PROBABILITY — DERIVED FROM PHONE TILT');
    expect(panel.textContent).toContain('Decision support only — human approval required. Not a flight command system.');
  });

  it('displays full safety labels and demonstration probability in ObjectDetailsPanel when PHONE SATELLITE is selected', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry.orientation = { roll_deg: 18, pitch_deg: 8, yaw_deg: 33 };
    phoneData.conjunction = evaluatePhoneTiltConjunction(18, 8, 33, '2026-11-17T12:10:00Z');
    const phoneItem = phoneSatelliteToItem(phoneData);
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <UserProvider>
          <ObjectDetailsPanel
            satelliteData={phoneItem}
            phoneSatellite={phoneData}
            onClose={onClose}
          />
        </UserProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('PHONE SATELLITE')).toBeDefined();
    expect(screen.getByText(/Physical smartphone used as a satellite attitude simulator/i)).toBeDefined();
    expect(screen.getByText('PHONE SATELLITE — SIMULATED')).toBeDefined();
    expect(screen.getByText('MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS')).toBeDefined();
    expect(screen.getByText(/DEMO COLLISION PROBABILITY — DERIVED FROM PHONE TILT/)).toBeDefined();
    expect(screen.getByText(/Decision support only — human approval required\. Not a flight command system\./)).toBeDefined();
    expect(screen.getByText('Demonstration collision probability')).toBeDefined();
    expect(screen.getByText(/PHONE-DEMO-DEBRIS-001/)).toBeDefined();
  });

  it('invokes inspection callback when clicking Inspect & Follow button', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    const onSelect = vi.fn();

    render(
      <PhoneSatellitePanel phoneSatellite={phoneData} onSelectPhoneSatellite={onSelect} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Inspect & Follow PHONE SATELLITE/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('displays PHONE SATELLITE and live demonstration telemetry inside CesiumGlobe fallback mode', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry.orientation = { roll_deg: 0, pitch_deg: 0, yaw_deg: 0 };
    phoneData.conjunction = evaluatePhoneTiltConjunction(0, 0, 0, '2026-11-17T12:15:00Z');

    render(
      <CesiumGlobe
        satellites={baseCatalog}
        phoneSatellite={phoneData}
        forceFallback={true}
      />
    );

    expect(screen.getByTestId('globe-fallback-view')).toBeDefined();
    expect(screen.getAllByText('PHONE SATELLITE').length).toBeGreaterThan(0);
    expect(screen.getByTestId('fallback-phone-telemetry')).toBeDefined();
    expect(screen.getByText(/0\.50% \(SAFE\)/i)).toBeDefined();
  });

  it('makes compact PhoneSatellitePanel body scrollable and displays live ground_station_id in ObjectDetailsPanel', () => {
    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry.ground_station_id = 'KX-LAPTOP-FALLBACK-001';
    phoneData.telemetry.link_status = 'LIVE_LAPTOP_FALLBACK';

    render(
      <MemoryRouter>
        <UserProvider>
          <PhoneSatellitePanel phoneSatellite={phoneData} defaultExpanded={true} compact={true} />
          <ObjectDetailsPanel
            satelliteData={phoneSatelliteToItem(phoneData)}
            phoneSatellite={phoneData}
            onClose={() => {}}
          />
        </UserProvider>
      </MemoryRouter>
    );

    const scrollBody = screen.getByTestId('phone-satellite-scroll-body');
    expect(scrollBody.className).toContain('overflow-y-auto');
    expect(screen.getAllByText(/KX-LAPTOP-FALLBACK-001/).length).toBeGreaterThan(0);
  });
});
