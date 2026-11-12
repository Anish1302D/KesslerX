import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../config/api';

export interface WebSocketMessage {
  type?: string;
  data?: unknown;
  severity?: string;
  timestamp?: string;
  message?: string;
}

export type WebSocketConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseWebSocketOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
}

export interface UseWebSocketReturn {
  messages: WebSocketMessage[];
  isConnected: boolean;
  connectionStatus: WebSocketConnectionStatus;
  retryCount: number;
  maxRetries: number;
  reconnect: () => void;
}

export function useWebSocket(
  pathOrUrl: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { maxRetries = 5, initialDelay = 1000, maxDelay = 15000 } = options;

  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketConnectionStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  // Resolve target WebSocket URL using centralized config
  const wsUrl = getWsUrl(pathOrUrl);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear any existing reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close any previous instance safely
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setConnectionStatus((prev) => (prev === 'connected' ? 'reconnecting' : prev === 'disconnected' ? 'connecting' : prev));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          try { ws.close(); } catch { /* ignore */ }
          return;
        }
        retryCountRef.current = 0;
        setRetryCount(0);
        setIsConnected(true);
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch {
          setMessages((prev) => [...prev, { data: event.data }]);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);

        if (retryCountRef.current < maxRetries) {
          const attempt = retryCountRef.current + 1;
          retryCountRef.current = attempt;
          setRetryCount(attempt);
          setConnectionStatus('reconnecting');

          // Bounded exponential backoff: initialDelay * 2^(attempt - 1), capped at maxDelay
          const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectRef.current();
            }
          }, delay);
        } else {
          setConnectionStatus('disconnected');
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        // Error will naturally lead to close event or manual close
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {
            // Ignore close errors
          }
        }
      };
    } catch {
      if (!isMountedRef.current) return;
      setIsConnected(false);

      if (retryCountRef.current < maxRetries) {
        const attempt = retryCountRef.current + 1;
        retryCountRef.current = attempt;
        setRetryCount(attempt);
        setConnectionStatus('reconnecting');
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectRef.current();
          }
        }, delay);
      } else {
        setConnectionStatus('disconnected');
      }
    }
  }, [wsUrl, maxRetries, initialDelay, maxDelay]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    setConnectionStatus('connecting');
    connect();
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.onmessage = null;
          wsRef.current.onopen = null;
          wsRef.current.close();
        } catch {
          // Ignore close errors
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { messages, isConnected, connectionStatus, retryCount, maxRetries, reconnect };
}
