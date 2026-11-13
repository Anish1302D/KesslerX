import { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkBackendHealth,
  type ConnectivityDiagnostic,
} from '../utils/connectivityDiagnostics';

export function useConnectivityDiagnostics(intervalMs: number = 30000) {
  const [diagnostic, setDiagnostic] = useState<ConnectivityDiagnostic>({
    status: 'online',
    latencyMs: 0,
    lastChecked: '',
    endpoint: '',
    serviceName: 'KesslerX Backend',
    dependencies: {},
  });
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const checkNow = useCallback(async () => {
    setLoading(true);
    try {
      const res = await checkBackendHealth();
      if (mountedRef.current) {
        setDiagnostic(res);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;

    const run = async () => {
      try {
        const res = await checkBackendHealth();
        if (mountedRef.current && !isCancelled) {
          setDiagnostic(res);
        }
      } finally {
        if (mountedRef.current && !isCancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    const timer = setInterval(() => {
      void run();
    }, intervalMs);

    return () => {
      isCancelled = true;
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { diagnostic, loading, checkNow };
}
