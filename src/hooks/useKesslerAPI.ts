import { useState, useEffect, useCallback, useRef } from 'react';
import { satellites as mockSatellites } from '../data/mockData';
import { API_BASE_URL, getApiUrl, getWsUrl, API_ENDPOINTS } from '../config/api';
import { apiRequest } from '../utils/apiClient';

const API = API_BASE_URL;

// ============================================================
// Generic fetcher with retry + fallback
// ============================================================

async function fetchWithRetry<T>(url: string, fallback: T, retries = 2): Promise<T> {
  try {
    return await apiRequest<T>(url, { retries, timeoutMs: 15000 });
  } catch (err) {
    console.warn(`[KesslerAPI] ${url} failed, using fallback`, err);
    return fallback;
  }
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
      const result = await apiRequest<T>(getApiUrl(endpoint), { timeoutMs: 15000, retries: 1 });
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
    let isCancelled = false;

    const executeFetch = async () => {
      try {
        const result = await apiRequest<T>(getApiUrl(endpoint), { timeoutMs: 15000, retries: 1 });
        if (mountedRef.current && !isCancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current && !isCancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (mountedRef.current && !isCancelled) setLoading(false);
      }
    };

    void executeFetch();
    const interval = setInterval(() => {
      void executeFetch();
    }, refreshMs);

    return () => {
      isCancelled = true;
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [endpoint, refreshMs]);

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
  [key: string]: unknown;
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSatellites() {
      try {
        const data = await apiRequest<{ satellites: SatelliteData[] }>(
          getApiUrl(API_ENDPOINTS.SATELLITES + '?limit=500'),
          { timeoutMs: 15000, retries: 2 }
        );
        if (Array.isArray(data.satellites)) {
          setSatellites(data.satellites);
        } else {
          throw new Error('Invalid satellite data format received');
        }
      } catch (err) {
        console.warn('API fetch failed, using mock data fallback', err);
        const mappedMock: SatelliteData[] = mockSatellites.map(s => ({
          ...s,
          NORAD_CAT_ID: s.id,
          OBJECT_NAME: s.name,
          OBJECT_TYPE: s.type === 'Debris' ? 'DEBRIS' : 'PAYLOAD',
          CATEGORY: s.type,
        }));
        setSatellites(mappedMock);
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

export type WebSocketConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseWebsocketOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

export interface UseWebsocketReturn {
  alerts: AlertMessage[];
  isConnected: boolean;
  connectionStatus: WebSocketConnectionStatus;
  retryCount: number;
  maxRetries: number;
  reconnect: () => void;
}

export function useWebsocket(options: UseWebsocketOptions = {}): UseWebsocketReturn {
  const { maxRetries = 5, initialDelay = 1000, maxDelay = 15000 } = options;
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketConnectionStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const wsUrl = getWsUrl(API_ENDPOINTS.WS_ALERTS);
    setConnectionStatus((prev) => (prev === 'connected' ? 'reconnecting' : prev === 'disconnected' ? 'connecting' : prev));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          try { ws.close(); } catch {}
          return;
        }
        retryCountRef.current = 0;
        setRetryCount(0);
        setIsConnected(true);
        setConnectionStatus('connected');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (retryCountRef.current < maxRetries) {
          const attempt = retryCountRef.current + 1;
          retryCountRef.current = attempt;
          setRetryCount(attempt);
          setConnectionStatus('reconnecting');
          const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
          reconnectRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        } else {
          setConnectionStatus('disconnected');
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try { ws.close(); } catch {}
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'pong') return; // Ignore heartbeat responses
          setAlerts((prev) => [message, ...prev].slice(0, 50));
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      // Send heartbeat every 25 seconds
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);
    } catch {
      if (!mountedRef.current) return;
      setIsConnected(false);
      if (retryCountRef.current < maxRetries) {
        const attempt = retryCountRef.current + 1;
        retryCountRef.current = attempt;
        setRetryCount(attempt);
        setConnectionStatus('reconnecting');
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      } else {
        setConnectionStatus('disconnected');
      }
    }
  }, [maxRetries, initialDelay, maxDelay]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    setConnectionStatus('connecting');
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    retryCountRef.current = 0;
    setRetryCount(0);
    setConnectionStatus('connecting');
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.onmessage = null;
          wsRef.current.onopen = null;
          wsRef.current.close();
        } catch {}
      }
    };
  }, [connect]);

  return { alerts, isConnected, connectionStatus, retryCount, maxRetries, reconnect };
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
  radiation_belt?: string;
  solar_wind_speed?: number;
  bz_component?: number;
  proton_density?: number;
  atmospheric_density_multiplier?: number;
  satellite_drag_impact?: string;
  status?: string;
  source?: string;
  mode?: string;
  warnings?: string[];
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
