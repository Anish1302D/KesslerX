import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemHealthPanel from './SystemHealthPanel';

vi.mock('../../hooks/useConnectivityDiagnostics', () => ({
  useConnectivityDiagnostics: () => ({
    diagnostic: {
      status: 'online',
      latencyMs: 42,
      lastChecked: new Date().toISOString(),
      endpoint: 'http://localhost:8000/api/health',
      serviceName: 'KesslerX Backend',
      dependencies: {
        database: 'connected',
        ai_engine: 'available',
        satellite_catalog: 'active',
      },
    },
    loading: false,
    checkNow: vi.fn(),
  }),
}));

vi.mock('../../utils/webglDetection', () => ({
  detectWebGLSupport: () => ({
    supported: true,
    webgl2: true,
    renderer: 'Mock WebGL 2.0',
  }),
}));

describe('SystemHealthPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders system health header and operational status', () => {
    render(<SystemHealthPanel isWsConnected={true} />);
    expect(screen.getByText(/SYSTEM HEALTH & DIAGNOSTICS/i)).toBeDefined();
    expect(screen.getByText(/OPERATIONAL/i)).toBeDefined();
  });

  it('displays latency and connected websocket status', () => {
    render(<SystemHealthPanel isWsConnected={true} />);
    expect(screen.getByText('42ms')).toBeDefined();
    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('displays WebGL 2 graphics engine indicator', () => {
    render(<SystemHealthPanel isWsConnected={false} />);
    expect(screen.getByText('WebGL 2')).toBeDefined();
    expect(screen.getByText('Connecting')).toBeDefined();
  });
});
