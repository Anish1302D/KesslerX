/**
 * SHA-256 Evidence Packet Verification Utility
 * Provides deterministic cryptographic hashing and integrity verification for
 * orbital conjunction evidence packages, negotiation packets, and audit trails.
 * Uses Web Crypto API (crypto.subtle) with standard canonical JSON serialization.
 */

/**
 * Deterministically serialize any JavaScript object to a canonical JSON string
 * with recursively sorted keys.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys
    .filter(k => record[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonicalizeJson(record[k])}`);

  return '{' + entries.join(',') + '}';
}

/**
 * Fallback SHA-256 implementation when crypto.subtle is not available in legacy/insecure environments.
 */
function sha256Fallback(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = str[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  str += '\x80';
  while ((str[lengthProperty] % 64) - 56) str += '\x00';
  for (i = 0; i < str[lengthProperty]; i++) {
    j = str.charCodeAt(i);
    if (j >> 8) return ''; // ASCII check
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0);

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i]) | 0;
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes the SHA-256 digest of a given evidence packet using canonical JSON representation.
 */
export async function computeEvidenceHash(packet: unknown): Promise<string> {
  const canonical = canonicalizeJson(packet);

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(canonical);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback if subtle digest fails
    }
  }

  return sha256Fallback(canonical);
}

/**
 * Verifies that an evidence packet matches an expected SHA-256 hash.
 */
export async function verifyEvidencePacket(
  packet: unknown,
  expectedHash: string
): Promise<{ verified: boolean; computedHash: string; expectedHash: string }> {
  const computedHash = await computeEvidenceHash(packet);
  const normalizedExpected = expectedHash.trim().toLowerCase().replace(/^sha256:/i, '');
  const verified = computedHash.toLowerCase() === normalizedExpected;
  return {
    verified,
    computedHash,
    expectedHash: normalizedExpected,
  };
}

/**
 * Signs an evidence packet by calculating its canonical hash and returning a sealed packet.
 */
export async function sealEvidencePacket<T extends Record<string, unknown>>(
  packet: T
): Promise<T & { sha256_hash: string; signed_at: string }> {
  const signedAt = new Date().toISOString();
  // Strip any existing hash fields to prevent circularity
  const payloadWithoutHash = { ...packet } as Record<string, unknown>;
  delete payloadWithoutHash.sha256_hash;
  delete payloadWithoutHash.audit_hash;
  const payloadToSign = { ...payloadWithoutHash, signed_at: signedAt };
  const hash = await computeEvidenceHash(payloadToSign);

  return {
    ...(packet as T),
    signed_at: signedAt,
    sha256_hash: hash,
  };
}

/**
 * Validates a sealed evidence packet containing a sha256_hash or audit_hash field.
 */
export async function verifySealedPacket(
  packet: Record<string, unknown>
): Promise<{ verified: boolean; computedHash: string; expectedHash?: string; reason?: string }> {
  if (!packet || typeof packet !== 'object') {
    return { verified: false, computedHash: '', reason: 'Packet is not an object' };
  }

  const expectedHash = (packet.sha256_hash || packet.audit_hash) as string | undefined;
  if (!expectedHash) {
    return { verified: false, computedHash: '', reason: 'Missing sha256_hash or audit_hash in evidence packet' };
  }

  // Compute hash over payload excluding self-referential hash field
  const payload = { ...packet };
  delete payload.sha256_hash;
  delete payload.audit_hash;
  const computedHash = await computeEvidenceHash(payload);
  const normalizedExpected = expectedHash.trim().toLowerCase().replace(/^sha256:/i, '');

  const verified = computedHash.toLowerCase() === normalizedExpected;
  return {
    verified,
    computedHash,
    expectedHash: normalizedExpected,
    reason: verified ? undefined : `Hash mismatch: expected ${normalizedExpected}, computed ${computedHash}`,
  };
}
