import { useState, useEffect, useCallback, useRef } from 'react';
import { satellites as mockSatellites, spaceWeather as mockSpaceWeather, orbitalCongestion as mockCongestion, closeApproaches as mockCloseApproaches, alerts as mockAlerts } from '../data/mockData';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ============================================================
// Generic fetcher with retry + fallback
// ============================================================

async function fetchWithRetry<T>(url: string, fallback: T, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (i === retries) {
        console.warn(`[KesslerAPI] ${url} failed after ${retries + 1} attempts, using fallback`, err);
        return fallback;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // backoff
    }
  }
  return fallback;
}

// ============================================================
// Generic hook for periodic data fetching
// ============================================================

function usePeriodicFetch<T>(endpoint: string, fallback: T, refreshMs: number = 30000) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchWithRetry(`${API}${endpoint}`, fallback);
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, refreshMs);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh, refreshMs]);

  return { data, loading, error, refresh };
}

// ============================================================
// Satellite Data
// ============================================================

export interface SatelliteData {
  NORAD_CAT_ID: number | string;
  OBJECT_NAME: string;
  TLE_LINE1?: string;
  TLE_LINE2?: string;
  OBJECT_TYPE: string;
  CATEGORY?: string;
  lat?: number;
  lon?: number;
  altitude?: number;
  [key: string]: any;
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSatellites() {
      try {
        const response = await fetch(`${API}/api/satellites?limit=500`);
        if (!response.ok) throw new Error('Failed to fetch satellites');
        const data = await response.json();
        setSatellites(data.satellites);
      } catch (err) {
        console.warn('API fetch failed, using mock data fallback', err);
        const mappedMock = mockSatellites.map(s => ({
          ...s,
          NORAD_CAT_ID: s.id,
          OBJECT_NAME: s.name,
          OBJECT_TYPE: s.type === 'Debris' ? 'DEBRIS' : 'PAYLOAD',
          CATEGORY: s.type,
        }));
        setSatellites(mappedMock as any);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchSatellites();
  }, []);

  return { satellites, loading, error };
}

// ============================================================
// WebSocket Alerts (used in Dashboard)
// ============================================================

export interface AlertMessage {
  type: string;
  severity?: string;
  data: string;
  message?: string;
  timestamp?: string;
}

export function useWebsocket() {
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    function connect() {
      const wsUrl = `${API.replace('http', 'ws')}/ws/alerts`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mounted) setIsConnected(true);
      };

      ws.onclose = () => {
        if (mounted) {
          setIsConnected(false);
          // Auto-reconnect after 3 seconds
          reconnectRef.current = setTimeout(() => {
            if (mounted) connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'pong') return; // Ignore heartbeat responses
          setAlerts((prev) => [message, ...prev].slice(0, 50));
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      // Send heartbeat every 25 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);

      ws.addEventListener('close', () => clearInterval(pingInterval));
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { alerts, isConnected };
}

// ============================================================
// Congestion Data
// ============================================================

export interface CongestionData {
  leo: { objects: number; density: number; risk: string };
  meo: { objects: number; density: number; risk: string };
  geo: { objects: number; density: number; risk: string };
  updated_at?: string;
}

const CONGESTION_FALLBACK: CongestionData = {
  leo: { objects: 5421, density: 0.84, risk: 'HIGH' },
  meo: { objects: 712, density: 0.31, risk: 'LOW' },
  geo: { objects: 381, density: 0.12, risk: 'LOW' },
};

export function useCongestion() {
  return usePeriodicFetch<CongestionData>('/api/congestion', CONGESTION_FALLBACK, 60000);
}

// ============================================================
// Collision Data
// ============================================================

export interface CollisionEvent {
  id: string;
  satellite: string;
  object: string;
  miss_distance: number;
  collision_probability: number;
  tca: string;
  risk: string;
}

const COLLISIONS_FALLBACK: CollisionEvent[] = [];

export function useCollisions() {
  return usePeriodicFetch<CollisionEvent[]>('/api/collisions', COLLISIONS_FALLBACK, 60000);
}

// ============================================================
// Debris Data
// ============================================================

export interface DebrisData {
  count: number;
  objects: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    altitude: number;
    velocity: number;
    size: string;
  }>;
}

const DEBRIS_FALLBACK: DebrisData = { count: 0, objects: [] };

export function useDebris() {
  return usePeriodicFetch<DebrisData>('/api/debris', DEBRIS_FALLBACK, 60000);
}

// ============================================================
// Telemetry Data
// ============================================================

export interface TelemetryData {
  status: string;
  timestamp: string;
  cpu: number;
  memory: number;
  network: number;
  tracked_objects: number;
  active_alerts: number;
  backend_latency_ms: number;
}

const TELEMETRY_FALLBACK: TelemetryData = {
  status: 'OFFLINE',
  timestamp: new Date().toISOString(),
  cpu: 0, memory: 0, network: 0,
  tracked_objects: 0, active_alerts: 0, backend_latency_ms: 0,
};

export function useTelemetry() {
  return usePeriodicFetch<TelemetryData>('/api/telemetry', TELEMETRY_FALLBACK, 15000);
}

// ============================================================
// Space Weather Data
// ============================================================

export interface SpaceWeatherAPIData {
  solar_flux: number;
  kp_index: number;
  geomagnetic_storm: string;
  radiation_level: string;
  updated_at?: string;
}

const WEATHER_FALLBACK: SpaceWeatherAPIData = {
  solar_flux: 130.0,
  kp_index: 3,
  geomagnetic_storm: 'NONE',
  radiation_level: 'LOW',
};

export function useSpaceWeather() {
  return usePeriodicFetch<SpaceWeatherAPIData>('/api/space-weather', WEATHER_FALLBACK, 30000);
}

// ============================================================
// Alerts (REST — persistent store)
// ============================================================

export interface StoredAlert {
  id: string;
  severity: string;
  title: string;
  message: string;
  type: string;
  timestamp: string;
  acknowledged: boolean;
}

interface AlertsResponse {
  count: number;
  alerts: StoredAlert[];
}

const ALERTS_FALLBACK: AlertsResponse = { count: 0, alerts: [] };

export function useStoredAlerts() {
  return usePeriodicFetch<AlertsResponse>('/api/alerts?limit=50', ALERTS_FALLBACK, 15000);
}
