export type DataSource = 'space-track' | 'noaa' | 'nasa' | 'local' | 'simulation' | 'demo';
export type DataMode = 'observed' | 'derived' | 'simulated' | 'fallback';

export interface DataEnvelope<T> {
  value: T;
  source: DataSource;
  mode: DataMode;
  observedAt?: string;
  generatedAt: string;
  freshnessSeconds?: number;
  warnings: string[];
}

export function createDataEnvelope<T>(
  value: T,
  options?: Partial<Omit<DataEnvelope<T>, 'value'>>
): DataEnvelope<T> {
  const now = new Date().toISOString();
  return {
    value,
    source: options?.source ?? 'local',
    mode: options?.mode ?? 'derived',
    observedAt: options?.observedAt ?? now,
    generatedAt: options?.generatedAt ?? now,
    freshnessSeconds: options?.freshnessSeconds ?? 0,
    warnings: options?.warnings ?? [],
  };
}

export function isEnvelopeStale(envelope: DataEnvelope<unknown>, thresholdSeconds = 86400): boolean {
  if (typeof envelope.freshnessSeconds === 'number' && envelope.freshnessSeconds > thresholdSeconds) {
    return true;
  }
  const refTime = envelope.observedAt || envelope.generatedAt;
  if (!refTime) return false;
  const age = (Date.now() - new Date(refTime).getTime()) / 1000;
  return age > thresholdSeconds;
}

