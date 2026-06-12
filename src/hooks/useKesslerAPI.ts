import { useState, useEffect } from 'react';

export interface SatelliteData {
  NORAD_CAT_ID: number;
  OBJECT_NAME: string;
  TLE_LINE1: string;
  TLE_LINE2: string;
  OBJECT_TYPE: string;
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSatellites() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/satellites?limit=500`);
        if (!response.ok) throw new Error('Failed to fetch satellites');
        const data = await response.json();
        setSatellites(data.satellites);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchSatellites();
  }, []);

  return { satellites, loading, error };
}

export interface AlertMessage {
  type: string;
  data: string;
}

export function useWebsocket() {
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const wsUrl = `${import.meta.env.VITE_API_BASE_URL?.replace('http', 'ws')}/ws/alerts`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setAlerts((prev) => [message, ...prev].slice(0, 50)); // Keep last 50
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return { alerts, isConnected };
}
