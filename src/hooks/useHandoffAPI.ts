// ============================================================
// KesslerX Handoff API Hook
// Follows the existing useKesslerAPI.ts patterns
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type HandoffUser, type HandoffEvent, type Handoff, type TimelineEntry,
  type HandoffCreatePayload, DEFAULT_DEMO_USERS, DEFAULT_DEMO_EVENTS,
} from '../data/handoffTypes';
import { isDemoModeActive } from './useKesslerAPI';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';


// ============================================================
// Generic fetch helper
// ============================================================

async function handoffFetch<T>(
  url: string,
  options?: RequestInit & { userId?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.userId ? { 'x-user-id': options.userId } : {}),
  };

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================
// Data Fetching Hooks
// ============================================================

export function useUsers() {
  const [users, setUsers] = useState<HandoffUser[]>(() => isDemoModeActive() ? DEFAULT_DEMO_USERS : []);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await handoffFetch<{ users: HandoffUser[] }>(`${API}/api/users`);
      if (mountedRef.current && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (err) {
      if (isDemoModeActive()) {
        console.warn('Failed to fetch users, using default demo users:', err);
        if (mountedRef.current) setUsers(DEFAULT_DEMO_USERS);
      } else {
        console.error('Failed to fetch users in production mode:', err);
        if (mountedRef.current) setUsers([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchUsers = async () => {
      try {
        const data = await handoffFetch<{ users: HandoffUser[] }>(`${API}/api/users`);
        if (!isCancelled && Array.isArray(data.users)) {
          setUsers(data.users);
        }
      } catch (err) {
        if (!isCancelled) {
          if (isDemoModeActive()) {
            console.warn('Failed to fetch users, using default demo users:', err);
            setUsers(DEFAULT_DEMO_USERS);
          } else {
            console.error('Failed to fetch users in production mode:', err);
            setUsers([]);
          }
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void fetchUsers();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, []);

  return { users, loading, refresh };
}

export function useEvents() {
  const [events, setEvents] = useState<HandoffEvent[]>(() => isDemoModeActive() ? DEFAULT_DEMO_EVENTS : []);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await handoffFetch<{ events: HandoffEvent[] }>(`${API}/api/events`);
      if (mountedRef.current && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err) {
      if (isDemoModeActive()) {
        console.warn('Failed to fetch events, using default demo events:', err);
        if (mountedRef.current) setEvents(DEFAULT_DEMO_EVENTS);
      } else {
        console.error('Failed to fetch events in production mode:', err);
        if (mountedRef.current) setEvents([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchEvents = async () => {
      try {
        const data = await handoffFetch<{ events: HandoffEvent[] }>(`${API}/api/events`);
        if (!isCancelled && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      } catch (err) {
        if (!isCancelled) {
          if (isDemoModeActive()) {
            console.warn('Failed to fetch events, using default demo events:', err);
            setEvents(DEFAULT_DEMO_EVENTS);
          } else {
            console.error('Failed to fetch events in production mode:', err);
            setEvents([]);
          }
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void fetchEvents();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, []);

  return { events, loading, refresh };
}

export function useEvent(eventId: string) {
  const [event, setEvent] = useState<HandoffEvent | null>(() => {
    return isDemoModeActive() ? (DEFAULT_DEMO_EVENTS.find(e => e.event_id === eventId) || null) : null;
  });
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await handoffFetch<HandoffEvent>(`${API}/api/events/${eventId}`);
      if (mountedRef.current && data && data.event_id) {
        setEvent(data);
      }
    } catch (err) {
      if (isDemoModeActive()) {
        console.warn(`Failed to fetch event ${eventId}, using demo fallback:`, err);
        const fallback = DEFAULT_DEMO_EVENTS.find(e => e.event_id === eventId);
        if (mountedRef.current && fallback) setEvent(fallback);
      } else {
        console.error(`Failed to fetch event ${eventId} in production:`, err);
        if (mountedRef.current) setEvent(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchEvent = async () => {
      if (!eventId) return;
      try {
        const data = await handoffFetch<HandoffEvent>(`${API}/api/events/${eventId}`);
        if (!isCancelled && data && data.event_id) {
          setEvent(data);
        }
      } catch (err) {
        if (!isCancelled) {
          if (isDemoModeActive()) {
            console.warn(`Failed to fetch event ${eventId}, using demo fallback:`, err);
            const fallback = DEFAULT_DEMO_EVENTS.find(e => e.event_id === eventId);
            if (fallback) setEvent(fallback);
          } else {
            console.error(`Failed to fetch event ${eventId} in production:`, err);
            setEvent(null);
          }
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void fetchEvent();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, [eventId]);

  return { event, loading, refresh };
}

export function useEventHandoffs(eventId: string) {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await handoffFetch<{ handoffs: Handoff[] }>(
        `${API}/api/events/${eventId}/handoffs`
      );
      if (mountedRef.current) setHandoffs(data.handoffs);
    } catch (err) {
      console.warn('Failed to fetch handoffs:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchHandoffs = async () => {
      if (!eventId) return;
      try {
        const data = await handoffFetch<{ handoffs: Handoff[] }>(
          `${API}/api/events/${eventId}/handoffs`
        );
        if (!isCancelled) setHandoffs(data.handoffs);
      } catch (err) {
        if (!isCancelled) console.warn('Failed to fetch handoffs:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void fetchHandoffs();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, [eventId]);

  return { handoffs, loading, refresh };
}

export function useEventTimeline(eventId: string) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await handoffFetch<{ timeline: TimelineEntry[] }>(
        `${API}/api/events/${eventId}/timeline`
      );
      if (mountedRef.current) setTimeline(data.timeline);
    } catch (err) {
      console.warn('Failed to fetch timeline:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchTimeline = async () => {
      if (!eventId) return;
      try {
        const data = await handoffFetch<{ timeline: TimelineEntry[] }>(
          `${API}/api/events/${eventId}/timeline`
        );
        if (!isCancelled) setTimeline(data.timeline);
      } catch (err) {
        if (!isCancelled) console.warn('Failed to fetch timeline:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void fetchTimeline();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, [eventId]);

  return { timeline, loading, refresh };
}

export function usePendingHandoffs(userId: string) {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await handoffFetch<{ handoffs: Handoff[] }>(
        `${API}/api/handoffs/pending`,
        { userId }
      );
      if (mountedRef.current) setHandoffs(data.handoffs);
    } catch (err) {
      console.warn('Failed to fetch pending handoffs:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchPending = async () => {
      try {
        const data = await handoffFetch<{ handoffs: Handoff[] }>(
          `${API}/api/handoffs/pending`,
          { userId }
        );
        if (!isCancelled && mountedRef.current) setHandoffs(data.handoffs);
      } catch (err) {
        if (!isCancelled) console.warn('Failed to fetch pending handoffs:', err);
      } finally {
        if (!isCancelled && mountedRef.current) setLoading(false);
      }
    };

    void fetchPending();
    const interval = setInterval(() => {
      void fetchPending();
    }, 10000); // Poll every 10s

    return () => {
      isCancelled = true;
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [userId]);

  return { handoffs, loading, refresh };
}

export function useHandoff(handoffId: string) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!handoffId) return;
    try {
      const data = await handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}`);
      if (mountedRef.current) setHandoff(data);
    } catch (err) {
      console.warn('Failed to fetch handoff:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [handoffId]);

  useEffect(() => {
    mountedRef.current = true;
    let isCancelled = false;
    const fetchHandoff = async () => {
      if (!handoffId) return;
      try {
        const data = await handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}`);
        if (!isCancelled && mountedRef.current) setHandoff(data);
      } catch (err) {
        if (!isCancelled) console.warn('Failed to fetch handoff:', err);
      } finally {
        if (!isCancelled && mountedRef.current) setLoading(false);
      }
    };
    void fetchHandoff();
    return () => {
      isCancelled = true;
      mountedRef.current = false;
    };
  }, [handoffId]);

  return { handoff, loading, refresh };
}

// ============================================================
// Action Functions
// ============================================================

export async function createHandoff(
  eventId: string,
  payload: HandoffCreatePayload,
  userId: string,
): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/events/${eventId}/handoffs`, {
    method: 'POST',
    body: JSON.stringify(payload),
    userId,
  });
}

export async function generateNote(handoffId: string): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/generate-note`, {
    method: 'POST',
  });
}

export async function updateNote(handoffId: string, note: string): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/update-note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function confirmTransfer(handoffId: string, userId: string): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/confirm`, {
    method: 'POST',
    userId,
  });
}

export async function acceptHandoff(handoffId: string, userId: string): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/accept`, {
    method: 'POST',
    userId,
  });
}

export async function requestClarification(
  handoffId: string, userId: string, message: string,
): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/clarification`, {
    method: 'POST',
    body: JSON.stringify({ message }),
    userId,
  });
}

export async function rejectHandoff(
  handoffId: string, userId: string, reason: string, reassignTo?: string,
): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason, reassign_to_user_id: reassignTo || '' }),
    userId,
  });
}

export async function checkTimeouts(timeout?: number): Promise<{ timed_out_count?: number; escalated_count?: number } | unknown> {
  const url = timeout
    ? `${API}/api/handoffs/check-timeouts?timeout=${timeout}`
    : `${API}/api/handoffs/check-timeouts`;
  return handoffFetch(url, { method: 'POST' });
}

export async function triggerEscalation(handoffId: string): Promise<Handoff> {
  return handoffFetch<Handoff>(`${API}/api/handoffs/${handoffId}/escalate`, {
    method: 'POST',
  });
}
