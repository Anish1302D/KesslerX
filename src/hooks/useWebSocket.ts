import { useState, useEffect, useRef } from 'react';
import { getWsUrl } from '../config/api';

export interface WebSocketMessage {
  type?: string;
  data?: unknown;
  severity?: string;
  timestamp?: string;
  message?: string;
}

export function useWebSocket(pathOrUrl: string) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // Resolve target WebSocket URL using centralized config
    const wsUrl = getWsUrl(pathOrUrl);

    const connect = () => {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isMounted) setIsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            setMessages((prev) => [...prev, data]);
          } catch {
            setMessages((prev) => [...prev, { data: event.data }]);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          // Reconnect after 5 seconds with cancellation guard
          reconnectTimeout = setTimeout(() => {
            if (isMounted) connect();
          }, 5000);
        };

        ws.onerror = () => {
          if (isMounted) setIsConnected(false);
        };

        wsRef.current = ws;
      } catch {
        if (isMounted) {
          setIsConnected(false);
          reconnectTimeout = setTimeout(() => {
            if (isMounted) connect();
          }, 5000);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [pathOrUrl]);

  return { messages, isConnected };
}
