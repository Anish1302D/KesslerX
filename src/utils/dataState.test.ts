import { describe, it, expect } from 'vitest';
import { resolveDataState, formatObjectCount } from './dataState';

describe('resolveDataState', () => {
  it('identifies loading state', () => {
    expect(resolveDataState({ data: [], loading: true, error: null })).toBe('loading');
    expect(resolveDataState({ data: [1, 2], loading: true, error: null })).toBe('loading');
  });

  it('identifies error state when request failed with empty data', () => {
    const state = resolveDataState({ data: [], loading: false, error: 'Network request failed' });
    expect(state).toBe('error');
    expect(formatObjectCount(0, state)).toBe('Unavailable');
  });

  it('distinguishes legitimate empty state from error', () => {
    const state = resolveDataState({ data: [], loading: false, error: null });
    expect(state).toBe('empty');
    expect(formatObjectCount(0, state)).toBe('0');
  });

  it('identifies ready state when items exist', () => {
    const state = resolveDataState({ data: ['sat1', 'sat2'], loading: false, error: null });
    expect(state).toBe('ready');
    expect(formatObjectCount(2, state)).toBe('2');
  });

  it('never formats failed requests as 0 objects', () => {
    const errorState = resolveDataState({ data: [], loading: false, error: 'Connection refused' });
    const formatted = formatObjectCount(0, errorState);
    expect(formatted).not.toBe('0');
    expect(formatted).toBe('Unavailable');
  });
});
