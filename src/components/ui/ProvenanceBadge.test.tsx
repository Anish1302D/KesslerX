import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProvenanceBadge from './ProvenanceBadge';
import { createDataEnvelope } from '../../types/dataEnvelope';

describe('ProvenanceBadge', () => {
  it('renders mode, source, and age correctly', () => {
    const envelope = createDataEnvelope({ foo: 'bar' }, {
      source: 'space-track',
      mode: 'observed',
      generatedAt: new Date().toISOString(),
    });

    render(<ProvenanceBadge envelope={envelope} />);
    expect(screen.getByText('Observed')).toBeDefined();
    expect(screen.getByText('space-track')).toBeDefined();
    expect(screen.getByText('<1m ago')).toBeDefined();
  });

  it('renders fallback mode with warnings', () => {
    const envelope = createDataEnvelope([], {
      source: 'demo',
      mode: 'fallback',
      warnings: ['Demo fixture', 'Source unavailable — using fallback'],
    });

    render(<ProvenanceBadge envelope={envelope} />);
    expect(screen.getByText('Fallback / Demo Fixture')).toBeDefined();
    expect(screen.getByText('Demo fixture')).toBeDefined();
    expect(screen.getByText('Source unavailable — using fallback')).toBeDefined();
  });

  it('renders compact mode with source and age', () => {
    render(<ProvenanceBadge source="noaa" mode="derived" compact />);
    expect(screen.getByText(/noaa/i)).toBeDefined();
  });
});
