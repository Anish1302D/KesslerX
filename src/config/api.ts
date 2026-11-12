/**
 * Centralized KesslerX Frontend API Configuration
 * Consolidates API base URLs, WebSocket resolution, and endpoints across the frontend.
 * Preserves all existing backend API contracts and endpoint paths.
 */

import { getValidatedEnv } from '../utils/envValidation';

const env = getValidatedEnv();

export const API_BASE_URL: string = env.apiBaseUrl;
export const WS_BASE_URL: string = env.wsBaseUrl;

/**
 * Builds an absolute API URL for the given endpoint path.
 */
export function getApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * Builds an absolute WebSocket URL for the given endpoint path.
 */
export function getWsUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${WS_BASE_URL}${cleanPath}`;
}

export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  SATELLITES: '/api/satellites',
  AI_CHAT: '/api/ai/chat',
  AI_MANEUVER: '/api/ai/maneuver',
  NEGOTIATOR_EVALUATE: '/api/negotiator/evaluate',
  CONGESTION: '/api/congestion',
  COLLISIONS: '/api/collisions',
  DEBRIS: '/api/debris',
  TELEMETRY: '/api/telemetry',
  SPACE_WEATHER: '/api/space-weather',
  ALERTS: '/api/alerts',
  CONJUNCTION_ANALYZE: '/api/conjunction/analyze',
  CONJUNCTION_PRESETS: '/api/conjunction/presets',
  GROUND_STATION_STATUS: '/api/ground-station/status',
  GROUND_STATION_HISTORY: '/api/ground-station/history',
  GROUND_STATION_LATEST: '/api/ground-station/latest',
  GROUND_STATION_TELEMETRY: '/api/ground-station/telemetry',
  USERS: '/api/users',
  EVENTS: '/api/events',
  HANDOFFS_PENDING: '/api/handoffs/pending',
  WS_ALERTS: '/ws/alerts',
  WS_GROUND_STATION: '/ws/ground-station',
} as const;
