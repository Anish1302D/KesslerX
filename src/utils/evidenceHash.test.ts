import { describe, it, expect } from 'vitest';
import {
  canonicalizeJson,
  computeEvidenceHash,
  verifyEvidencePacket,
  sealEvidencePacket,
  verifySealedPacket,
} from './evidenceHash';

describe('evidenceHash cryptographic utility', () => {
  const sampleEvidence = {
    event_id: 'EVT-STARLINK-3021',
    primary: 'STARLINK-3021',
    secondary: 'DEBRIS-88172',
    miss_distance_km: 0.12,
    collision_probability: 0.098,
    tca_utc: '2026-11-12T14:30:00Z',
  };

  it('canonicalizes JSON with key-order independence', () => {
    const objA = { z: 1, a: 2, m: { y: 10, b: 20 } };
    const objB = { a: 2, m: { b: 20, y: 10 }, z: 1 };

    expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
    expect(canonicalizeJson(objA)).toBe('{"a":2,"m":{"b":20,"y":10},"z":1}');
  });

  it('computes 64-character lowercase SHA-256 hex digest', async () => {
    const hash = await computeEvidenceHash(sampleEvidence);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Re-computing on same object yields identical hash
    const recomputed = await computeEvidenceHash({
      secondary: 'DEBRIS-88172',
      event_id: 'EVT-STARLINK-3021',
      tca_utc: '2026-11-12T14:30:00Z',
      collision_probability: 0.098,
      miss_distance_km: 0.12,
      primary: 'STARLINK-3021',
    });
    expect(recomputed).toBe(hash);
  });

  it('verifies untampered evidence packet', async () => {
    const hash = await computeEvidenceHash(sampleEvidence);
    const result = await verifyEvidencePacket(sampleEvidence, hash);
    expect(result.verified).toBe(true);
    expect(result.computedHash).toBe(hash);
  });

  it('detects and rejects tampered evidence packet', async () => {
    const originalHash = await computeEvidenceHash(sampleEvidence);
    const tamperedEvidence = { ...sampleEvidence, miss_distance_km: 1.5 }; // altered distance

    const result = await verifyEvidencePacket(tamperedEvidence, originalHash);
    expect(result.verified).toBe(false);
    expect(result.computedHash).not.toBe(originalHash);
  });

  it('seals and verifies an evidence packet with sha256_hash signature', async () => {
    const sealed = await sealEvidencePacket(sampleEvidence);
    expect(sealed.sha256_hash).toBeDefined();
    expect(sealed.signed_at).toBeDefined();

    const verification = await verifySealedPacket(sealed);
    expect(verification.verified).toBe(true);
    expect(verification.reason).toBeUndefined();

    // Tamper with sealed packet
    const tamperedSealed = { ...sealed, collision_probability: 0.001 };
    const failedVerification = await verifySealedPacket(tamperedSealed);
    expect(failedVerification.verified).toBe(false);
    expect(failedVerification.reason).toContain('Hash mismatch');
  });
});
