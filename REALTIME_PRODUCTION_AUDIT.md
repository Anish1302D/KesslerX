# KesslerX Realtime Production Audit Report (Phase 0)

**Date**: November 2024 (Operational Epoch: 2026 UTC)  
**Auditor**: Principal System & Aerospace Reliability Engineering  
**Scope**: Complete inventory of all mock data, synthetic math, in-memory storage, demo fallbacks, and credential dependencies across backend, frontend, and deployment configurations.

---

## 1. Executive Summary of Production Gaps

While KesslerX passes all linters, TypeScript compilations, and baseline unit tests, an exhaustive forensic inspection reveals 16 distinct areas where demo fixtures, in-process simulations, synthetic math, or in-memory stores are embedded in the production path:

1. **Storage Reliance on In-Memory Fallback**:
   - `backend/firebase_config.py` fell back to in-memory storage due to uninstalled `firebase-admin` in local virtualenv and relative path resolution issues.
   - `backend/handoff_service.py` seeded demo users and events into `_mem_users` and `_mem_events`.
   - `backend/main.py` stored alerts in a module-level list `_alert_store` and cached responses in a process-local dict `_cache`.

2. **Synthetic Space Weather Simulation**:
   - `backend/main.py` (`/api/space-weather`) generated `solar_flux`, `solar_wind`, `bz`, and `proton_density` using diurnal trigonometric sine and cosine functions (`math.sin(now_ts / 3600.0)`), yet labelled the response `"source": "noaa", "mode": "derived"`.

3. **Fixed Collision Fixtures**:
   - `backend/main.py` (`/api/collisions`) served a hard-coded array `_COLLISION_EVENTS` (8 events: `STARLINK-3021`, `ISS (ZARYA)`, `ONEWEB-0012`, etc.) with synthetic offset timestamps.

4. **Catalog Mock Injection & Random Debris**:
   - `backend/space_track.py` injected 100 random debris objects (`DEBRIS-90000+`) using `random.uniform(0, 180)` for orbital elements and repeated May 2024 ISS records when credentials were not configured.

5. **Simulated Real-Time Alert Broadcast**:
   - `backend/main.py:simulate_realtime_updates()` ran an infinite 5-second `while True` loop cycling through 8 canned text templates and broadcasting them over WebSocket `/ws/alerts`.

6. **Simulated Ground Station Telemetry**:
   - `backend/ground_station.py` and `backend/main.py:simulate_ground_station()` generated random battery drift, temperature sine waves, and synthetic packet counters broadcast every second.

7. **AI Copilot Implementation**:
   - `backend/ai_service.py` maintained a single shared global chat session (`self.chat_session = self.model.start_chat()`) across all concurrent users, returned hard-coded string fallback responses, and did not enforce schema-validated structured evidence envelopes.

8. **Conjunction Engine Fixed Assumptions**:
   - `backend/conjunction_engine.py` defaulted to fixed 500m uncertainty and 20m² cross-sections, and returned pre-packaged demo pairs.

9. **Client-Side Unconditional Fallbacks**:
   - `src/hooks/useKesslerAPI.ts` imported `src/data/mockData.ts` and unconditionally substituted client fixtures upon any network or server error.

10. **Authentication Fail-Open**:
    - Unauthenticated requests could pass `x-user-id` in dev mode or fall back to demo analyst credentials without verifying identity tokens.

---

## 2. Forensic Code Inventory

| File & Line | Component / Symbol | Nature of Finding | Required Remediation |
|---|---|---|---|
| `backend/main.py:351` | `/api/health` | Reports `database: in-memory-fallback` | Require durable store (Firestore / SQLite); fail degraded if storage unreachable. |
| `backend/main.py:517-599` | `_COLLISION_EVENTS` | Fixed 8 collision events served with `"source": "demo"` | Replace with real CDM ingestion & authoritative server-persisted conjunctions. |
| `backend/main.py:724-750` | `/api/space-weather` | Synthetic `math.sin/cos` values masquerading as NOAA | Connect to live NOAA SWPC REST endpoints (`f107_cm_flux.json`, `noaa-planetary-k-index.json`, `rtsw_mag_1m.json`, `rtsw_wind_1m.json`). |
| `backend/main.py:797-822` | `simulate_realtime_updates()` | 5-second infinite broadcast of fake alerts | Drive WebSocket alerts from durable database outbox/event stream. |
| `backend/main.py:936-953` | `simulate_ground_station()` | 1-second simulated telemetry stream | Replace with authenticated hardware device ingestion API; show offline if no hardware connected. |
| `backend/main.py:308-309` | `_tle_to_approx_position()` | `random.uniform` fallback positions | Fail closed or use deterministic SGP4 propagation from valid TLE. |
| `backend/space_track.py:81` | `_ensure_quotas()` | Injects mock data if quota not met | Fail closed in production; serve cached snapshot with explicit age/stale warnings. |
| `backend/space_track.py:178` | `get_full_mock_data()` | `random.uniform` generated debris | Isolate to test/demo fixtures only; never return from production provider. |
| `backend/handoff_service.py:73`| `DEMO_USERS`, `DEMO_EVENTS`| Demo users/events seeded into storage | Disable seeding in production (`APP_ENV=production`); require authenticated users. |
| `backend/ai_service.py:54` | `MockAIService` | Shared session, ungrounded fallbacks | Rename to `AIService`, per-request invocation, Pydantic structured output, evidence grounding. |
| `src/hooks/useKesslerAPI.ts:2` | `import { satellites as mockSatellites }` | Client fallback to fixture data | Remove automatic mock substitution; display honest error/stale banner. |
| `src/pages/GroundStation.tsx` | Telemetry UI | Hardware simulator running client-side | Restrict simulator strictly to opt-in demo mode; display "No telemetry available" by default. |

---

## 3. Provider Credential & Connectivity Baseline

| Provider | Purpose | Status in Environment | Resolution Strategy |
|---|---|---|---|
| **Firebase / Firestore** | User auth, persistent events, handoffs, audit | **Configured** (`keerx-25b72`, `backend/firebase-credentials.json` verified and connected to collections) | Ensure proper relative pathing; add SQLite persistent local engine for offline/free-tier resilience. |
| **NOAA SWPC** | Real-time solar flux, Kp index, solar wind, Bz | **Live & Public** (`services.swpc.noaa.gov` endpoints verified returning HTTP 200 with 2026 data) | Build `backend/noaa_service.py` provider adapter with durable snapshot caching. |
| **Space-Track API** | Authoritative satellite catalog & CDMs | **Credentials Missing** in local `.env` | Implement real REST client (`/ajaxauth/login`, `/basicspacedata/query/class/gp`); support verified NORAD mirror (CelesTrak) when Space-Track credentials unconfigured; fail closed if unavailable. |
| **Google Gemini API** | AI decision support & Copilot | **Key Unset** (`GEMINI_API_KEY` placeholder) | Require `GEMINI_API_KEY` in production; fail closed with structured 503 and clear configuration notice; ground responses on backend evidence. |

---

## 4. Remediation Plan

1. **Phase 1**: Explicit environment configuration (`APP_ENV=production|demo|development|test`) with fail-closed validation and diagnostic status endpoint (`/api/admin/config-status`).
2. **Phase 2**: Durable persistent storage engine (Firestore + SQLite fallback layer) with zero demo seeding in production.
3. **Phase 3**: Real Space-Track client with session-cookie authentication, rate limiting, and durable snapshot caching (no random debris).
4. **Phase 4**: Operator-grade CDM conjunction ingestion separated from educational SGP4 analysis.
5. **Phase 5**: Real-time event architecture (durable outbox, replayable WebSocket/SSE, no fake timer loops).
6. **Phase 6**: Real NOAA SWPC ingestion with genuine F10.7 flux, Kp, and solar wind measurements.
7. **Phase 7**: Genuine `AIService` with per-request Gemini invocation, Pydantic structured output, and evidence grounding.
8. **Phase 8**: Real Intent-to-Action Negotiator bound to server-persisted event snapshots.
9. **Phase 9**: Verified server-side authentication (Firebase token verification) with strict RBAC.
10. **Phase 10**: Authenticated ground station device telemetry ingestion contract (no fake packets).
11. **Phase 11**: Durable multi-format evidence packages and reports.
12. **Phase 12**: Observability, structured logging, request IDs, and honest health states.
13. **Phase 13**: Frontend production data contract eliminating unconditional fixture fallbacks.
14. **Phase 14-17**: Comprehensive real-provider testing, documentation updates, and final report delivery.

