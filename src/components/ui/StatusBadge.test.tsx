import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge Component', () => {
  it('renders the correct label when provided', () => {
    render(<StatusBadge severity="HIGH" label="CRITICAL FAILURE" />);
    expect(screen.getByText('CRITICAL FAILURE')).toBeTruthy();
  });

  it('renders the severity name as label when no label is provided', () => {
    render(<StatusBadge severity="MEDIUM" />);
    expect(screen.getByText('MEDIUM')).toBeTruthy();
  });

  it('applies the pulse animation class when pulse is true', () => {
    const { container } = render(<StatusBadge severity="LOW" pulse={true} />);
    // StatusBadge returns a span as the outermost element
    const badgeElement = container.firstChild as HTMLElement;
    expect(badgeElement.className).toContain('animate-pulse');
  });

  it('does not apply the pulse animation class when pulse is false', () => {
    const { container } = render(<StatusBadge severity="LOW" pulse={false} />);
    const badgeElement = container.firstChild as HTMLElement;
    expect(badgeElement.className).not.toContain('animate-pulse');
  });
});
