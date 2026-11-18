import { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS, getApiUrl, getWsUrl } from '../config/api';
import { apiRequest } from '../utils/apiClient';
import {
  PhoneSatelliteData,
  createDefaultPhoneSatelliteData,
} from '../utils/phoneSatelliteOrbit';

export interface UsePhoneSatelliteReturn {
  phoneSatellite: PhoneSatelliteData;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  refresh: () => Promise<void>;
}

export function usePhoneSatellite(pollIntervalMs: number = 2500): UsePhoneSatelliteReturn {
  const [phoneSatellite, setPhoneSatellite] = useState<PhoneSatelliteData>(() =>
    createDefaultPhoneSatelliteData()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const mountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectWsRef = useRef<() => void>(() => {});

  const fetchPhoneSatellite = useCallback(async () => {
    try {
      const data = await apiRequest<PhoneSatelliteData>(
        getApiUrl(API_ENDPOINTS.PHONE_SATELLITE),
        { timeoutMs: 10000, retries: 1 }
      );
      if (mountedRef.current && data && data.id === 'PHONE-SATELLITE-001') {
        setPhoneSatellite(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to reach KesslerX backend');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {
        // ignore cleanup error
      }
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(getWsUrl(API_ENDPOINTS.WS_GROUND_STATION));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const pkt = JSON.parse(event.data);
          if (pkt && pkt.packet_type === 'phone_telemetry' && pkt.device_id === 'PHONE-SATELLITE-001') {
            setPhoneSatellite((prev) => ({
              ...prev,
              telemetry: {
                device_id: pkt.device_id,
                satellite_name: pkt.satellite_name || prev.name,
                sequence: pkt.sequence ?? prev.telemetry.sequence,
                timestamp: pkt.timestamp ?? prev.telemetry.timestamp,
                received_at: pkt.received_at ?? prev.telemetry.received_at,
                ingested_at: pkt.conjunction?.last_updated ?? prev.telemetry.ingested_at,
                orientation: pkt.orientation ?? prev.telemetry.orientation,
                angular_velocity: pkt.angular_velocity ?? prev.telemetry.angular_velocity,
                source: pkt.source || 'phone_sensor',
                mode: pkt.mode || 'simulated',
                ground_station_id: pkt.ground_station_id || 'KX-RPI-ZERO-GS-001',
                hardware_model: pkt.hardware_model || 'Raspberry Pi Zero W',
                warnings: pkt.warnings || [],
                link_status: 'LIVE_RPI_ZERO_GATEWAY',
                packets_received: (prev.telemetry.packets_received || 0) + 1,
              },
              conjunction: pkt.conjunction ?? prev.conjunction,
            }));
            setError(null);
          }
        } catch {
          // Ignore unrelated or malformed socket packets
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setWsConnected(false);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connectWsRef.current();
          }
        }, 3000);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setWsConnected(false);
      };
    } catch {
      if (mountedRef.current) {
        setWsConnected(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connectWsRef.current = connectWs;

    const initialFetch = async () => {
      try {
        const data = await apiRequest<PhoneSatelliteData>(
          getApiUrl(API_ENDPOINTS.PHONE_SATELLITE),
          { timeoutMs: 10000, retries: 1 }
        );
        if (mountedRef.current && data && data.id === 'PHONE-SATELLITE-001') {
          setPhoneSatellite(data);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Unable to reach KesslerX backend');
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void initialFetch();
    connectWs();

    const interval = setInterval(() => {
      void initialFetch();
    }, pollIntervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, [connectWs, pollIntervalMs]);

  return {
    phoneSatellite,
    loading,
    error,
    wsConnected,
    refresh: fetchPhoneSatellite,
  };
}
