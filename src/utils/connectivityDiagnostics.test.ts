import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBackendHealth } from './connectivityDiagnostics';

describe('checkBackendHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports online status when backend returns nominal health with active dependencies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        status: 'nominal',
        service: 'KesslerX Backend',
        dependencies: {
          database: 'connected',
          ai_engine: 'available',
          satellite_catalog: 'active',
          space_weather: 'active',
          websocket: 'active',
        },
      }),
    }));

    const result = await checkBackendHealth();
    expect(result.status).toBe('online');
    expect(result.serviceName).toBe('KesslerX Backend');
    expect(result.dependencies.database).toBe('connected');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded status when in-memory fallback dependencies are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({
        status: 'nominal',
        service: 'KesslerX Backend',
        dependencies: {
          database: 'in-memory-fallback',
          ai_engine: 'mock-fallback',
        },
      }),
    }));

    const result = await checkBackendHealth();
    expect(result.status).toBe('degraded');
  });

  it('reports offline status and error when backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const result = await checkBackendHealth();
    expect(result.status).toBe('offline');
    expect(result.dependencies.database).toBe('offline');
    expect(result.error).toContain('Connection refused');
  });
});
