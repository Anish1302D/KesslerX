import { describe, it, expect } from 'vitest';
import { validateEnv } from './envValidation';

describe('validateEnv', () => {
  it('defaults to localhost:8000 in non-production when no URL is provided', () => {
    const result = validateEnv({
      PROD: false,
      VITE_API_BASE_URL: '',
    });
    expect(result.isValid).toBe(true);
    expect(result.apiBaseUrl).toBe('http://localhost:8000');
    expect(result.wsBaseUrl).toBe('ws://localhost:8000');
  });

  it('validates a production HTTPS API URL and strips trailing slashes', () => {
    const result = validateEnv({
      PROD: true,
      VITE_API_BASE_URL: 'https://kesslerx-backend.onrender.com///',
      VITE_FIREBASE_API_KEY: 'valid_api_key_12345',
      VITE_FIREBASE_PROJECT_ID: 'kesslerx-prod',
    });
    expect(result.isValid).toBe(true);
    expect(result.apiBaseUrl).toBe('https://kesslerx-backend.onrender.com');
    expect(result.wsBaseUrl).toBe('wss://kesslerx-backend.onrender.com');
    expect(result.firebaseConfigured).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects invalid URL format and reports an error', () => {
    const result = validateEnv({
      PROD: false,
      VITE_API_BASE_URL: 'not-a-valid-url',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid VITE_API_BASE_URL format');
  });

  it('flags warning when production uses localhost', () => {
    const result = validateEnv({
      PROD: true,
      VITE_API_BASE_URL: 'http://localhost:8000',
    });
    expect(result.warnings.some(w => w.includes('loopback'))).toBe(true);
  });

  it('detects unconfigured or placeholder Firebase credentials', () => {
    const result = validateEnv({
      PROD: false,
      VITE_API_BASE_URL: 'http://localhost:8000',
      VITE_FIREBASE_API_KEY: 'your_firebase_web_api_key',
    });
    expect(result.firebaseConfigured).toBe(false);
  });
});
