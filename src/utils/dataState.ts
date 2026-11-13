/**
 * Utility for distinguishing true empty data states from failed network/API requests.
 * Prevents displaying "0 objects" or "0 Active Satellites" when an API call failed.
 */

export type DataState = 'loading' | 'error' | 'empty' | 'ready';

export interface DataStateOptions<T> {
  data: T[] | null | undefined;
  loading: boolean;
  error?: string | null;
  /**
   * If true, even if error occurred, fallback data is being shown.
   * If false or undefined, error with empty data is considered 'error'.
   */
  hasFallback?: boolean;
}

/**
 * Determines whether the dataset is loading, in error state, legitimately empty, or ready with data.
 */
export function resolveDataState<T>({
  data,
  loading,
  error,
  hasFallback = false,
}: DataStateOptions<T>): DataState {
  if (loading) {
    return 'loading';
  }

  // If there's an error and no fallback data to show, it is an error state
  if (error && (!data || data.length === 0 || !hasFallback)) {
    if (!data || data.length === 0) {
      return 'error';
    }
  }

  // If data is null or empty array and there is an error
  if (error && (!data || data.length === 0)) {
    return 'error';
  }

  // If request succeeded but array is empty
  if (!data || data.length === 0) {
    return error ? 'error' : 'empty';
  }

  return 'ready';
}

/**
 * Formats an object count string for UI display.
 * - Loading: '...'
 * - Error: 'Unavailable'
 * - Empty: '0'
 * - Ready: localized numeric string
 */
export function formatObjectCount(
  count: number | undefined | null,
  state: DataState,
  unavailableLabel: string = 'Unavailable'
): string {
  switch (state) {
    case 'loading':
      return '...';
    case 'error':
      return unavailableLabel;
    case 'empty':
      return '0';
    case 'ready':
      return count !== undefined && count !== null ? count.toLocaleString() : '0';
  }
}
