import { useState, useEffect, useRef } from 'react';

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

    // Resolve target WebSocket URL
    let wsUrl: string;
    if (pathOrUrl.startsWith('ws://') || pathOrUrl.startsWith('wss://')) {
      wsUrl = pathOrUrl;
    } else {
      const explicitWsBase = import.meta.env.VITE_WS_URL;
      const apiBase = import.meta.env.VITE_API_BASE_URL;

      if (explicitWsBase) {
        const base = explicitWsBase.endsWith('/') ? explicitWsBase.slice(0, -1) : explicitWsBase;
        const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
        wsUrl = `${base}${path}`;
      } else if (apiBase) {
        const wsScheme = apiBase.startsWith('https') ? 'wss:' : 'ws:';
        const hostPath = apiBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
        wsUrl = `${wsScheme}//${hostPath}${path}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//localhost:8000${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
      }
    }

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
