/**
 * Backend Connectivity Diagnostics Utility
 * Probes the KesslerX backend health endpoint, measures roundtrip latency,
 * and reports granular dependency statuses.
 */

import { getApiUrl, API_ENDPOINTS } from '../config/api';
import { apiRequest } from './apiClient';

export interface HealthResponse {
  status: string;
  service?: string;
  timestamp?: string;
  disclaimer?: string;
  dependencies?: {
    database?: string;
    ai_engine?: string;
    satellite_catalog?: string;
    space_weather?: string;
    websocket?: string;
    cache?: string;
    [key: string]: string | undefined;
  };
}

export interface ConnectivityDiagnostic {
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  lastChecked: string;
  endpoint: string;
  serviceName: string;
  dependencies: Record<string, string>;
  error?: string;
}

export async function checkBackendHealth(
  timeoutMs: number = 8000
): Promise<ConnectivityDiagnostic> {
  const endpoint = getApiUrl(API_ENDPOINTS.HEALTH);
  const startTime = performance.now();

  try {
    const data = await apiRequest<HealthResponse>(endpoint, {
      timeoutMs,
      retries: 1,
      retryDelayMs: 500,
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const rawDeps = data.dependencies || {};
    const deps: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawDeps)) {
      if (typeof value === 'string') {
        deps[key] = value;
      }
    }

    // If any critical dependency is failing, mark degraded
    const hasDegradedDeps = Object.values(deps).some(
      (val) => val === 'fallback' || val === 'in-memory-fallback' || val === 'mock-fallback'
    );

    const isHealthy = data.status === 'nominal' || data.status === 'ok';

    return {
      status: isHealthy ? (hasDegradedDeps ? 'degraded' : 'online') : 'degraded',
      latencyMs,
      lastChecked: new Date().toISOString(),
      endpoint,
      serviceName: data.service || 'KesslerX Backend',
      dependencies: deps,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      status: 'offline',
      latencyMs,
      lastChecked: new Date().toISOString(),
      endpoint,
      serviceName: 'KesslerX Backend (Unreachable)',
      dependencies: {
        database: 'offline',
        ai_engine: 'offline',
        satellite_catalog: 'offline',
        space_weather: 'offline',
        websocket: 'offline',
      },
      error: err instanceof Error ? err.message : 'Backend unreachable',
    };
  }
}
