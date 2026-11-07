import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobalProvenanceBanner from './GlobalProvenanceBanner';

describe('GlobalProvenanceBanner', () => {
  it('renders mode title and decision support disclaimer', () => {
    render(<GlobalProvenanceBanner />);
    expect(screen.getByText(/DEMO FIXTURE & LOCAL PROPAGATION MODE/i)).toBeDefined();
    expect(screen.getByText(/Decision support only — human approval required/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Data Provenance/i })).toBeDefined();
  });

  it('allows toggling the provenance detail panel', () => {
    render(<GlobalProvenanceBanner />);
    const toggleBtn = screen.getByRole('button', { name: /Data Provenance/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Orbital Catalog \(TLE\)/i)).toBeDefined();
    expect(screen.getByText(/Safety Decision Support/i)).toBeDefined();
  });
});
