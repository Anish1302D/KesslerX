/**
 * Frontend Environment Configuration Validation Utility
 * Validates API and service configuration at startup and runtime.
 */

export interface EnvValidationResult {
  isValid: boolean;
  isProduction: boolean;
  apiBaseUrl: string;
  wsBaseUrl: string;
  firebaseConfigured: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnv(
  rawEnv: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isProduction =
    rawEnv.PROD === true ||
    rawEnv.MODE === 'production' ||
    rawEnv.NODE_ENV === 'production';

  // --- API Base URL Validation ---
  let rawApiUrl = typeof rawEnv.VITE_API_BASE_URL === 'string'
    ? rawEnv.VITE_API_BASE_URL.trim()
    : '';

  let apiBaseUrl = 'http://localhost:8000';

  if (!rawApiUrl) {
    if (isProduction) {
      warnings.push(
        'VITE_API_BASE_URL is not set in production. Defaulting to current host origin.'
      );
      if (typeof window !== 'undefined' && window.location?.origin) {
        apiBaseUrl = window.location.origin;
      }
    } else {
      apiBaseUrl = 'http://localhost:8000';
    }
  } else {
    // Trim trailing slashes
    rawApiUrl = rawApiUrl.replace(/\/+$/, '');
    try {
      const parsed = new URL(rawApiUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`Invalid API protocol '${parsed.protocol}'. Expected 'http:' or 'https:'.`);
      } else {
        apiBaseUrl = rawApiUrl;
        if (isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
          warnings.push(`Production environment configured with loopback API URL '${rawApiUrl}'.`);
        }
      }
    } catch {
      errors.push(`Invalid VITE_API_BASE_URL format: '${rawApiUrl}'. Must be a valid absolute URL.`);
      apiBaseUrl = isProduction && typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:8000';
    }
  }

  // --- WebSocket URL Validation & Derivation ---
  let wsBaseUrl: string;
  const rawWsUrl = typeof rawEnv.VITE_WS_URL === 'string'
    ? rawEnv.VITE_WS_URL.trim().replace(/\/+$/, '')
    : '';

  if (rawWsUrl) {
    try {
      const parsedWs = new URL(rawWsUrl);
      if (['ws:', 'wss:'].includes(parsedWs.protocol)) {
        wsBaseUrl = rawWsUrl;
      } else if (['http:', 'https:'].includes(parsedWs.protocol)) {
        wsBaseUrl = rawWsUrl.replace(/^http/, 'ws');
      } else {
        warnings.push(`Invalid WebSocket protocol '${parsedWs.protocol}'. Deriving from API base.`);
        wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
      }
    } catch {
      warnings.push(`Invalid VITE_WS_URL format '${rawWsUrl}'. Deriving from API base URL.`);
      wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    }
  } else {
    wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
  }

  // --- Firebase Configuration Check ---
  const fbApiKey = typeof rawEnv.VITE_FIREBASE_API_KEY === 'string' ? rawEnv.VITE_FIREBASE_API_KEY.trim() : '';
  const fbProjectId = typeof rawEnv.VITE_FIREBASE_PROJECT_ID === 'string' ? rawEnv.VITE_FIREBASE_PROJECT_ID.trim() : '';

  const isPlaceholderKey = !fbApiKey || fbApiKey.includes('your_') || fbApiKey.startsWith('AIzaSyDummy');
  const isPlaceholderProject = !fbProjectId || fbProjectId.includes('your_');

  const firebaseConfigured = !isPlaceholderKey && !isPlaceholderProject;

  if (isProduction && !firebaseConfigured) {
    warnings.push('Firebase credentials not fully configured for production; running in fallback mode.');
  }

  const result: EnvValidationResult = {
    isValid: errors.length === 0,
    isProduction,
    apiBaseUrl,
    wsBaseUrl,
    firebaseConfigured,
    errors,
    warnings,
  };

  return result;
}

// Cached validation result for singleton access
let cachedResult: EnvValidationResult | null = null;

export function getValidatedEnv(): EnvValidationResult {
  if (!cachedResult) {
    cachedResult = validateEnv();
    if (typeof console !== 'undefined') {
      if (cachedResult.errors.length > 0) {
        console.error('[KesslerX Env] Configuration errors detected:', cachedResult.errors);
      }
      if (cachedResult.warnings.length > 0) {
        console.warn('[KesslerX Env] Configuration warnings:', cachedResult.warnings);
      }
    }
  }
  return cachedResult;
}
