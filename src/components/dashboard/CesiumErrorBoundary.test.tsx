import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CesiumErrorBoundary } from './CesiumErrorBoundary';
import { SatelliteItem } from './GlobeFallbackTable';

const mockSatellites: SatelliteItem[] = [
  {
    NORAD_CAT_ID: 25544,
    OBJECT_NAME: 'ISS (ZARYA)',
    CATEGORY: 'ISS',
    altitude: 418,
  },
];

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('WebGL creation failed');
  }
  return <div data-testid="cesium-viewer-success">Viewer Mounted Successfully</div>;
}

describe('CesiumErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <CesiumErrorBoundary satellites={mockSatellites}>
        <ProblemChild shouldThrow={false} />
      </CesiumErrorBoundary>
    );

    expect(screen.getByTestId('cesium-viewer-success')).toBeDefined();
    expect(screen.getByText('Viewer Mounted Successfully')).toBeDefined();
  });

  it('catches initialization crash and displays fallback view with retry', () => {
    const onRetry = vi.fn();
    render(
      <CesiumErrorBoundary satellites={mockSatellites} onRetry={onRetry}>
        <ProblemChild shouldThrow={true} />
      </CesiumErrorBoundary>
    );

    expect(screen.getByTestId('globe-fallback-view')).toBeDefined();
    expect(screen.getByText(/3D Globe crashed: WebGL creation failed/i)).toBeDefined();

    const retryBtn = screen.getByRole('button', { name: /Retry 3D Globe/i });
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
