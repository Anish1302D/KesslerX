# KesslerX — REST & WebSocket API Reference

The KesslerX backend is built with FastAPI (Python 3.11).

- **Base URL (Local)**: `http://localhost:8000`
- **Base URL (Production)**: Configured via `VITE_API_BASE_URL`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **OpenAPI Schema**: `http://localhost:8000/openapi.json`

---

## 1. Authentication & Security Headers

State-changing endpoints require an authorization token or caller header:
- Header: `Authorization: Bearer <firebase_id_token_or_dev_token>`
- Fallback Dev Tokens:
  - `dev_token_analyst` (Role: `analyst`)
  - `dev_token_lead` (Role: `mission operations lead`)
  - `dev_token_manager` (Role: `mission manager`)
  - `dev_token_admin` (Role: `administrator`)

---

## 2. Standard Response & Error Envelopes

All errors return structured JSON with appropriate HTTP status codes (no 200 OK on failure):

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Maximum 30 requests per minute for this endpoint.",
  "retryable": true
}
```

### HTTP Status Code Usage:
- `400 Bad Request`: Malformed payload or semantic error.
- `401 Unauthorized`: Missing or invalid identity token.
- `403 Forbidden`: Insufficient role permissions.
- `404 Not Found`: Requested entity does not exist.
- `409 Conflict`: Concurrency conflict or optimistic lock failure.
- `422 Unprocessable Entity`: Pydantic input validation failure (e.g. invalid TLE syntax).
- `429 Too Many Requests`: Rate limit quota exceeded.
- `500 Internal Server Error`: Unexpected server failure.
- `503 Service Unavailable`: Upstream dependency unavailable.

---

## 3. Endpoints Overview

### Health & Observability
- `GET /api/health`
  - Granular subsystem health status (`database`, `ai_engine`, `satellite_catalog`, `space_weather`, `websocket`, `cache`, `version`).

### Orbital Catalog & Ephemeris
- `GET /api/satellites?limit=50`
  - Retrieve active satellite items with deterministic positions.
- `GET /api/debris?limit=1000`
  - Tracked orbital debris objects with size classification.
- `GET /api/collisions`
  - Active close approach events with dynamically computed TCAs.

### Conjunction Screening & Intent Negotiation
- `POST /api/conjunction/analyze`
  - Run SGP4 conjunction screening between two TLE-defined objects.
- `POST /api/negotiator/evaluate`
  - Evaluates 6 deterministic maneuver candidates with multi-factor scoring.
- `POST /api/ai/maneuver`
  - Deterministic maneuver analysis with Vis-Viva delta-v calculation.
- `POST /api/ai/chat`
  - Fine-tuned SSA contextual AI chat copilot with rate limiting.

### Space Weather & Environment
- `GET /api/space-weather`
  - F10.7 solar flux, Kp index, solar wind, and atmospheric density multiplier.

### Alerts & Live Telemetry
- `GET /api/alerts?limit=50`
  - Persistent alert history.
- `POST /api/alerts/{id}/acknowledge`
  - Acknowledge an alert.
- `GET /api/telemetry`
  - Real-time system telemetry and resource utilization.
- `WebSocket /ws/alerts`
  - Real-time operational alert broadcasts (heartbeat ping/pong supported).
- `WebSocket /ws/ground-station`
  - ESP32 hardware telemetry stream.

### Responsibility Transfer (Handoffs)
- `GET /api/users` & `GET /api/users/{id}`
- `GET /api/events/{id}/handoffs`
- `GET /api/events/{id}/timeline`
- `GET /api/handoffs/pending`
- `POST /api/events/{id}/handoffs`
- `POST /api/handoffs/{id}/confirm`
- `POST /api/handoffs/{id}/accept`
- `POST /api/handoffs/{id}/reject`
- `POST /api/handoffs/{id}/clarification`
- `POST /api/handoffs/{id}/escalate`

