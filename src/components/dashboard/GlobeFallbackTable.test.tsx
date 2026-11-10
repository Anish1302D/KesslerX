import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobeFallbackTable, { SatelliteItem } from './GlobeFallbackTable';

const mockSatellites: SatelliteItem[] = [
  {
    NORAD_CAT_ID: 25544,
    OBJECT_NAME: 'ISS (ZARYA)',
    CATEGORY: 'ISS',
    altitude: 418,
    epoch: '2026-11-07 10:00:00',
    source: 'Space-Track',
    status: 'Operational',
  },
  {
    NORAD_CAT_ID: 44713,
    OBJECT_NAME: 'STARLINK-1007',
    CATEGORY: 'Communication',
    altitude: 550,
    epoch: '2026-11-07 09:30:00',
    source: 'Space-Track',
    status: 'Active',
  },
  {
    NORAD_CAT_ID: 90001,
    OBJECT_NAME: 'DEBRIS-90001',
    CATEGORY: 'Debris',
    altitude: 35800, // GEO altitude
    epoch: '2026-11-06 22:00:00',
    source: 'SGP4 Model',
    status: 'Tracked Debris',
  },
];

describe('GlobeFallbackTable', () => {
  it('renders fallback banner with reason and satellite rows', () => {
    const onRetry = vi.fn();
    render(
      <GlobeFallbackTable
        satellites={mockSatellites}
        reason="WebGL context lost"
        onRetry3D={onRetry}
      />
    );

    expect(screen.getByTestId('globe-fallback-view')).toBeDefined();
    expect(screen.getByText(/2D Planetary Fallback Mode:/i)).toBeDefined();
    expect(screen.getByText(/WebGL context lost/i)).toBeDefined();
    expect(screen.getByText('ISS (ZARYA)')).toBeDefined();
    expect(screen.getByText('STARLINK-1007')).toBeDefined();
    expect(screen.getByText('DEBRIS-90001')).toBeDefined();
  });

  it('triggers onRetry3D when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(
      <GlobeFallbackTable
        satellites={mockSatellites}
        onRetry3D={onRetry}
      />
    );

    const retryBtn = screen.getByRole('button', { name: /Retry 3D Globe/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('allows filtering by search term', () => {
    render(<GlobeFallbackTable satellites={mockSatellites} />);

    const searchInput = screen.getByPlaceholderText(/Search by object name or NORAD ID/i);
    fireEvent.change(searchInput, { target: { value: 'Starlink' } });

    expect(screen.getByText('STARLINK-1007')).toBeDefined();
    expect(screen.queryByText('ISS (ZARYA)')).toBeNull();
  });

  it('filters by orbit layer (e.g. LEO vs GEO)', () => {
    render(<GlobeFallbackTable satellites={mockSatellites} />);

    const leoBtn = screen.getByRole('button', { name: 'LEO' });
    fireEvent.click(leoBtn);

    expect(screen.getByText('ISS (ZARYA)')).toBeDefined();
    expect(screen.getByText('STARLINK-1007')).toBeDefined();
    expect(screen.queryByText('DEBRIS-90001')).toBeNull(); // GEO altitude excluded in LEO
  });

  it('supports keyboard navigation via Enter key on rows', () => {
    const onSelect = vi.fn();
    render(<GlobeFallbackTable satellites={mockSatellites} onSelectObject={onSelect} />);

    const issRow = screen.getByText('ISS (ZARYA)').closest('tr');
    expect(issRow).not.toBeNull();
    if (issRow) {
      fireEvent.keyDown(issRow, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS (ZARYA)' })
      );
    }
  });

  it('calls onSelectObject when row is clicked', () => {
    const onSelect = vi.fn();
    render(<GlobeFallbackTable satellites={mockSatellites} onSelectObject={onSelect} />);

    const issRow = screen.getByText('ISS (ZARYA)');
    fireEvent.click(issRow);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS (ZARYA)' })
    );
  });
});
