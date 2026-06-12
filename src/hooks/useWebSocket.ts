import { useState, useEffect, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket(url: string) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Determine WS protocol based on HTTP protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the provided URL or fallback to localhost
    const wsUrl = url.startsWith('ws') ? url : `${protocol}//localhost:8000${url}`;
    
    const connect = () => {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch (e) {
          console.error("Failed to parse WebSocket message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Attempt to reconnect after a delay
        setTimeout(connect, 5000);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return { messages, isConnected };
}
