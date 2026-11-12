/**
 * Robust API Client with Timeout, Typed Errors, and Retry Handling
 * Preserves all existing API contracts and JSON payloads.
 */

export class ApiError extends Error {
  status?: number;
  code: 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'HTTP_ERROR' | 'PARSE_ERROR';
  details?: unknown;

  constructor(
    message: string,
    code: 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'HTTP_ERROR' | 'PARSE_ERROR',
    status?: number,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Parses response body safely, returning parsed JSON or fallback object on HTML/text.
 */
async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (contentType.includes('application/json') || text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(
        `Failed to parse response as JSON from ${response.url}`,
        'PARSE_ERROR',
        response.status
      );
    }
  }

  return { message: text.slice(0, 500) };
}

/**
 * Performs a fetch request with timeout, transient error retries, and comprehensive error categorization.
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = 15000,
    retries = 2,
    retryDelayMs = 1000,
    signal: userSignal,
    ...fetchOptions
  } = options;

  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    let isTimeout = false;

    const timer = setTimeout(() => {
      isTimeout = true;
      controller.abort();
    }, timeoutMs);

    // Combine with user-provided abort signal if given
    const combinedSignal = userSignal
      ? (userSignal.aborted
          ? userSignal
          : (() => {
              userSignal.addEventListener('abort', () => controller.abort(), { once: true });
              return controller.signal;
            })())
      : controller.signal;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: combinedSignal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errorData: unknown = null;
        try {
          errorData = await parseResponseBody(response);
        } catch {
          // Ignore secondary parse error on error responses
        }

        let errorMessage = `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
        if (errorData && typeof errorData === 'object') {
          const rec = errorData as Record<string, unknown>;
          if (typeof rec.detail === 'string') {
            errorMessage = rec.detail;
          } else if (typeof rec.error === 'string') {
            errorMessage = rec.error;
          } else if (typeof rec.message === 'string') {
            errorMessage = rec.message;
          }
        }

        // Retry only on transient server errors (502, 503, 504)
        const isTransient = [502, 503, 504].includes(response.status);
        if (isTransient && attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
          continue;
        }

        throw new ApiError(errorMessage, 'HTTP_ERROR', response.status, errorData);
      }

      const parsedData = await parseResponseBody(response);
      return parsedData as T;
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof ApiError) {
        throw err;
      }

      const isAbort =
        isTimeout ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError');

      if (isAbort && isTimeout) {
        if (attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
          continue;
        }
        throw new ApiError(
          `Request to ${url} timed out after ${timeoutMs}ms`,
          'TIMEOUT_ERROR'
        );
      }

      // Check for network offline / unreachable
      const isNetwork =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch'));

      if (attempt < retries) {
        attempt++;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }

      throw new ApiError(
        isNetwork
          ? `Network error: Unable to connect to ${url}`
          : (err instanceof Error ? err.message : 'Unknown network failure'),
        'NETWORK_ERROR',
        undefined,
        err
      );
    }
  }

  throw new ApiError(`Request failed after ${retries + 1} attempts`, 'NETWORK_ERROR');
}
