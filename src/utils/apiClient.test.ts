import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiError } from './apiClient';

describe('apiRequest utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully returns parsed JSON data on 200 OK', async () => {
    const mockData = { status: 'nominal', count: 42 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify(mockData),
    }));

    const result = await apiRequest<typeof mockData>('https://api.kesslerx.space/data');
    expect(result).toEqual(mockData);
  });

  it('throws ApiError with HTTP_ERROR on 404 response with detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ detail: 'Target satellite not found in catalog' }),
    }));

    await expect(apiRequest('https://api.kesslerx.space/notfound', { retries: 0 }))
      .rejects.toThrow('Target satellite not found in catalog');
  });

  it('throws ApiError with PARSE_ERROR when response is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{ malformed json: missing quotes }',
    }));

    await expect(apiRequest('https://api.kesslerx.space/badjson', { retries: 0 }))
      .rejects.toThrow(ApiError);
  });

  it('retries on transient 503 error and succeeds if next attempt works', async () => {
    const mockSuccess = { status: 'recovered' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ error: 'Temporary upstream overload' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockSuccess),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest('https://api.kesslerx.space/transient', {
      retries: 1,
      retryDelayMs: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(mockSuccess);
  });

  it('detects timeout and throws TIMEOUT_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('The user aborted a request.');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    }));

    await expect(
      apiRequest('https://api.kesslerx.space/slow', {
        timeoutMs: 50,
        retries: 0,
      })
    ).rejects.toThrow('timed out after 50ms');
  });
});
