import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateClose() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

describe('useWebSocket resilient reconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes in connecting state and connects successfully', () => {
    const { result } = renderHook(() => useWebSocket('/ws/alerts'));

    expect(result.current.connectionStatus).toBe('connecting');
    expect(result.current.isConnected).toBe(false);
    expect(MockWebSocket.instances.length).toBe(1);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.retryCount).toBe(0);
  });

  it('receives messages parsed from JSON', () => {
    const { result } = renderHook(() => useWebSocket('/ws/alerts'));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateMessage(JSON.stringify({ type: 'alert', message: 'Test alert' }));
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({ type: 'alert', message: 'Test alert' });
  });

  it('applies bounded exponential retries and transitions to disconnected when limit reached', () => {
    const maxRetries = 3;
    const { result } = renderHook(() => useWebSocket('/ws/alerts', { maxRetries, initialDelay: 100 }));

    // Initial socket created
    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate failure 1
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    expect(result.current.connectionStatus).toBe('reconnecting');
    expect(result.current.retryCount).toBe(1);

    // Advance timer for retry 1 (100ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(MockWebSocket.instances.length).toBe(2);

    // Simulate failure 2
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });
    expect(result.current.connectionStatus).toBe('reconnecting');
    expect(result.current.retryCount).toBe(2);

    // Advance timer for retry 2 (200ms)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(MockWebSocket.instances.length).toBe(3);

    // Simulate failure 3
    act(() => {
      MockWebSocket.instances[2].simulateClose();
    });
    expect(result.current.connectionStatus).toBe('reconnecting');
    expect(result.current.retryCount).toBe(3);

    // Advance timer for retry 3 (400ms)
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(MockWebSocket.instances.length).toBe(4);

    // Simulate failure 4 (exceeds maxRetries = 3)
    act(() => {
      MockWebSocket.instances[3].simulateClose();
    });

    // Should now be disconnected, no further automatic retries
    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // No new instances created
    expect(MockWebSocket.instances.length).toBe(4);
  });

  it('allows manual reconnection after being disconnected', () => {
    const { result } = renderHook(() => useWebSocket('/ws/alerts', { maxRetries: 1, initialDelay: 100 }));

    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      MockWebSocket.instances[1].simulateClose();
    });

    expect(result.current.connectionStatus).toBe('disconnected');

    // Trigger manual reconnect
    act(() => {
      result.current.reconnect();
    });

    expect(result.current.connectionStatus).toBe('connecting');
    expect(result.current.retryCount).toBe(0);
    expect(MockWebSocket.instances.length).toBe(3);

    act(() => {
      MockWebSocket.instances[2].simulateOpen();
    });

    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });
});
