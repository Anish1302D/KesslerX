import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { apiRequest, ApiError } from '../utils/apiClient';
import { resolveDataState, formatObjectCount } from '../utils/dataState';
import { parseTleEpoch, evaluateTleFreshness } from '../utils/tleFreshness';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  validateTcaTimestamp,
  validateTleLine,
  validateManeuverAssessment,
} from '../utils/maneuverValidation';
import {
  canonicalizeJson,
  computeEvidenceHash,
  sealEvidencePacket,
  verifyEvidencePacket,
  verifySealedPacket,
} from '../utils/evidenceHash';

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

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

describe('Frontend Integration & Reliability Fallback Scenarios', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. API Failure Resilience and Data State Fallbacks
  describe('API failure resilience & data state classification', () => {
    it('surfaces ApiError with HTTP_ERROR on 500 internal server failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ detail: 'Orbital compute engine offline' }),
      }));

      await expect(apiRequest('https://api.kesslerx.space/ephemeris', { retries: 0 }))
        .rejects.toThrow(ApiError);
    });

    it('handles network timeouts and classifies as TIMEOUT_ERROR', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }));

      await expect(apiRequest('https://api.kesslerx.space/telemetry', { timeoutMs: 25, retries: 0 }))
        .rejects.toThrow(/timed out/i);
    });

    it('distinguishes legitimate empty catalog from request failure', () => {
      // Legitimate empty catalog: empty data, not loading, no error
      const emptyState = resolveDataState({ data: [], loading: false, error: null });
      expect(emptyState).toBe('empty');
      expect(formatObjectCount(0, emptyState)).toBe('0');

      // Failed request: empty data, not loading, error present
      const failedState = resolveDataState({ data: [], loading: false, error: '503 Service Unavailable' });
      expect(failedState).toBe('error');
      // Must NEVER display '0' when request failed!
      expect(formatObjectCount(0, failedState)).toBe('Unavailable');
    });
  });

  // 2. Stale Satellite Data Warnings & Freshness Assessment
  describe('Stale satellite data warnings & epoch freshness', () => {
    const sampleTleLine1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002';

    it('accurately parses TLE epoch date from line 1', () => {
      const epoch = parseTleEpoch(sampleTleLine1);
      expect(epoch).not.toBeNull();
      expect(epoch?.getUTCFullYear()).toBe(2024);
      expect(epoch?.getUTCMonth()).toBe(0); // Jan
      expect(epoch?.getUTCDate()).toBe(1);
    });

    it('evaluates freshness levels: nominal (<48h), warning/stale (>48h), and critical (>168h)', () => {
      // 24h old -> nominal
      const refNominal = new Date(Date.UTC(2024, 0, 2, 12, 0, 0));
      const nominalResult = evaluateTleFreshness(sampleTleLine1, refNominal);
      expect(nominalResult.isStale).toBe(false);
      expect(nominalResult.severity).toBe('nominal');

      // 72h old -> stale warning
      const refStale = new Date(Date.UTC(2024, 0, 4, 12, 0, 0));
      const staleResult = evaluateTleFreshness(sampleTleLine1, refStale);
      expect(staleResult.isStale).toBe(true);
      expect(staleResult.severity).toBe('stale');
      expect(staleResult.warningMessage).toContain('STALE TLE WARNING');

      // 14 days old -> critical warning
      const refCritical = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
      const criticalResult = evaluateTleFreshness(sampleTleLine1, refCritical);
      expect(criticalResult.isStale).toBe(true);
      expect(criticalResult.isCritical).toBe(true);
      expect(criticalResult.severity).toBe('critical');
    });

    it('handles missing or malformed TLE strings safely', () => {
      const result = evaluateTleFreshness('invalid TLE text');
      expect(result.epochDate).toBeNull();
      expect(result.isStale).toBe(true);
      expect(result.warningMessage).toContain('Epoch timestamp unavailable');
    });
  });

  // 3. WebSocket States & Resilient Reconnection
  describe('WebSocket connectivity states and bounded reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      MockWebSocket.instances = [];
      vi.stubGlobal('WebSocket', MockWebSocket);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('transitions to connected on open and reconnecting on unexpected close', () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.kesslerx.space/ws/events', { maxRetries: 3 })
      );

      expect(result.current.connectionStatus).toBe('connecting');
      expect(result.current.isConnected).toBe(false);

      // Simulate connection established
      act(() => {
        MockWebSocket.instances[0].simulateOpen();
      });

      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.isConnected).toBe(true);

      // Simulate connection drop
      act(() => {
        MockWebSocket.instances[0].simulateClose();
      });

      expect(result.current.connectionStatus).toBe('reconnecting');
      expect(result.current.isConnected).toBe(false);
      expect(result.current.retryCount).toBe(1);
    });

    it('bounds reconnect attempts and transitions to disconnected state after max retries', () => {
      const { result } = renderHook(() =>
        useWebSocket('wss://api.kesslerx.space/ws/events', {
          maxRetries: 2,
          initialDelay: 100,
        })
      );

      // Attempt 1 fails
      act(() => {
        MockWebSocket.instances[0].simulateClose();
      });
      expect(result.current.connectionStatus).toBe('reconnecting');
      expect(result.current.retryCount).toBe(1);

      // Fast-forward backoff timer
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Attempt 2 fails
      act(() => {
        MockWebSocket.instances[1].simulateClose();
      });
      expect(result.current.connectionStatus).toBe('reconnecting');
      expect(result.current.retryCount).toBe(2);

      // Fast-forward backoff timer
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Attempt 3 fails (maxRetries = 2 exceeded)
      act(() => {
        MockWebSocket.instances[2].simulateClose();
      });

      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.isConnected).toBe(false);
    });
  });

  // 4. Maneuver Assessment Timestamp & Input Validation
  describe('Maneuver assessment timestamp and input validation', () => {
    const refDate = new Date('2026-11-11T00:00:00Z');

    it('validates proper ISO future timestamps within 30-day window', () => {
      expect(validateTcaTimestamp('2026-11-12T12:00:00Z', refDate).valid).toBe(true);
      expect(validateTcaTimestamp('invalid-date-format', refDate).valid).toBe(false);
      expect(validateTcaTimestamp('', refDate).valid).toBe(false);
      expect(validateTcaTimestamp(null, refDate).valid).toBe(false);
      // Past TCA
      expect(validateTcaTimestamp('2026-11-10T00:00:00Z', refDate).valid).toBe(false);
      // Beyond 30 days
      expect(validateTcaTimestamp('2027-01-01T00:00:00Z', refDate).valid).toBe(false);
    });

    it('validates standard 69-character Two-Line Element sets', () => {
      const validLine1 = '1 25544U 98067A   24142.50000000  .00016717  00000-0  10270-3 0  9025';
      const validLine2 = '2 25544  51.6416 250.2341 0004561  89.1234 271.0123 15.49812345421051';

      expect(validateTleLine(validLine1, 1).valid).toBe(true);
      expect(validateTleLine(validLine2, 2).valid).toBe(true);

      // Mismatched prefix
      expect(validateTleLine('2 25544 ...', 1).valid).toBe(false);
      // Truncated line
      expect(validateTleLine('1 25544 SHORT', 1).valid).toBe(false);
    });

    it('rejects unsupported assessment inputs without affecting orbital calculations', () => {
      const result = validateManeuverAssessment(
        {
          collision_probability: 1.5, // > 1.0 is physically impossible
          miss_distance_km: -5.0,    // Negative distance is impossible
        },
        refDate
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('probability'))).toBe(true);
      expect(result.errors.some(e => e.includes('Miss distance'))).toBe(true);
    });
  });

  // 5. SHA-256 Cryptographic Evidence Packet Verification
  describe('SHA-256 evidence packet integrity & canonical hashing', () => {
    const sampleEvidence = {
      event_id: 'EVT-STARLINK-3021',
      primary: 'STARLINK-3021',
      secondary: 'DEBRIS-88172',
      miss_distance_km: 0.12,
      collision_probability: 0.098,
      tca_utc: '2026-11-12T14:30:00Z',
    };

    it('produces identical SHA-256 hashes regardless of JSON key order (canonical sorting)', async () => {
      const reorderedEvidence = {
        secondary: 'DEBRIS-88172',
        collision_probability: 0.098,
        event_id: 'EVT-STARLINK-3021',
        tca_utc: '2026-11-12T14:30:00Z',
        miss_distance_km: 0.12,
        primary: 'STARLINK-3021',
      };

      const canonical1 = canonicalizeJson(sampleEvidence);
      const canonical2 = canonicalizeJson(reorderedEvidence);
      expect(canonical1).toBe(canonical2);

      const hash1 = await computeEvidenceHash(sampleEvidence);
      const hash2 = await computeEvidenceHash(reorderedEvidence);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('detects tampering and invalidates tampered evidence packages', async () => {
      const sealed = await sealEvidencePacket(sampleEvidence);
      expect(sealed.sha256_hash).toBeDefined();

      // Untampered verification succeeds
      const verifiedResult = await verifySealedPacket(sealed);
      expect(verifiedResult.verified).toBe(true);

      // Tampered verification fails
      const tampered = {
        ...sealed,
        miss_distance_km: 15.0, // Modified coordinate
      };
      const failedResult = await verifySealedPacket(tampered);
      expect(failedResult.verified).toBe(false);
      expect(failedResult.reason).toContain('Hash mismatch');
    });

    it('verifies explicit payload against an expected SHA-256 digest', async () => {
      const hash = await computeEvidenceHash(sampleEvidence);
      const validResult = await verifyEvidencePacket(sampleEvidence, hash);
      expect(validResult.verified).toBe(true);
      expect(validResult.computedHash).toBe(hash);

      const invalidResult = await verifyEvidencePacket(sampleEvidence, 'f'.repeat(64));
      expect(invalidResult.verified).toBe(false);
    });
  });
});
