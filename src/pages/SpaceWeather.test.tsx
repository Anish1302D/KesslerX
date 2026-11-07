import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SpaceWeather from './SpaceWeather';

describe('SpaceWeather Page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        solar_flux: 142.5,
        kp_index: 3,
        geomagnetic_storm: 'NONE',
        radiation_belt: 'LOW',
        solar_wind_speed: 435.0,
        bz_component: -1.75,
        proton_density: 4.1,
        atmospheric_density_multiplier: 1.24,
        satellite_drag_impact: 'Nominal (+8%)',
        status: 'nominal',
        source: 'noaa',
        mode: 'derived',
        warnings: ['NOAA SWPC F10.7 solar flux proxy'],
        updated_at: new Date().toISOString(),
      }),
    }));
  });

  it('renders page header and solar influence title', () => {
    render(<SpaceWeather />);
    expect(screen.getByText(/SOLAR INFLUENCE & SPACE WEATHER MONITOR/i)).toBeDefined();
  });

  it('displays the atmospheric density drag multiplier', async () => {
    render(<SpaceWeather />);
    await waitFor(() => {
      expect(screen.getByText(/Atmospheric Density Drag Multiplier/i)).toBeDefined();
      expect(screen.getByText(/SOLAR ARCHIVE/i)).toBeDefined();
      expect(screen.getByText(/FULL REPORT/i)).toBeDefined();
    });
  });
});

