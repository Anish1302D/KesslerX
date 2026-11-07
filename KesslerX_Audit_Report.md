# KesslerX Comprehensive System Audit Report

**Date**: 2026-11-07  
**Platform**: KesslerX — AI-Powered Space Situational Awareness & Orbital Traffic Management  
**Auditor**: Antigravity Principal Systems Engineer & Aerospace QA Lead  
**Repository**: https://github.com/Anish1302D/KesslerX.git  
**Deployment**: https://kessler-x.vercel.app/  

---

## 1. Executive Summary

KesslerX is an orbital safety decision-support platform featuring interactive 3D orbital propagation, conjunction assessment, responsibility transfer workflows, ground station simulation, and space situational awareness analytics.

The current system has strong visual design and functional architectural foundations, but suffers from several critical defects across security, reliability, data honesty, aerospace safety, and code quality:

1. **Security & Credential Exposure**:
   - `backend/firebase-credentials.json` and a duplicate file contain active Google Cloud / Firebase service account private keys on disk.
   - `CesiumGlobe.tsx` contains a hardcoded Cesium Ion JWT token.
   - CORS is configured with `allow_origins=["*"]` combined with `allow_credentials=True`.
   - `x-user-id` HTTP header is accepted from clients without authentication or cryptographic token validation.
   - `firestore.rules` contains an expired wildcard open-read-write rule (`request.time < timestamp.date(2026, 9, 21)`).

2. **Error Handling & API Correctness**:
   - `backend/main.py` has a global exception handler converting unhandled exceptions into HTTP 200 with `status: "success"`.
   - Congestion and debris endpoints return synthetic fallback values without provenance or mode indicators.
   - Missing input validation for TLE checksums, epoch age, duration, propagation step, upload payload limits, and rate limits.
   - Health check `/api/health` reports `"status": "nominal"` regardless of database, satellite catalog, AI, or dependency health.

3. **Aerospace & AI Safety Compliance**:
   - `backend/ai_service.py` uses `random.choice(["PROGRADE", "RETROGRADE", "NORMAL"])` for maneuver burn direction and `random.uniform()` for expected miss distance and confidence.
   - `backend/main.py` uses `random.uniform()` and `random.randint()` for telemetry, congestion, and space weather.
   - Safety rule violations: Absence of required decision-support disclaimers ("Decision support only — human approval required") on all maneuver outputs.
   - Misleading "Live" claims on static mock fixtures and stale TLE sets.
   - Fixed TCA dates (e.g., `2026-08-05T18:40:00Z`) shown as upcoming.

4. **Cesium & WebGL Reliability**:
   - Globe initialization frequently hangs on "Initializing Globe..." due to brittle `waitForCesium` script-tag polling.
   - Missing WebGL capability detection and no 2D/tabular fallback view when WebGL fails.
   - Required Cesium Ion credits hidden using a detached DOM container (`document.createElement('div')`).

5. **Frontend Code Quality & Lint**:
   - 196 ESLint problems (192 errors, 4 warnings).
   - Render-time ref access in `Simulations.tsx` and `GroundStation.tsx`.
   - Synchronous `setState` inside `useEffect` bodies in `OrbitalMap.tsx` and `Settings.tsx`.
   - Impure function calls (`Date.now()`) during render in `AICopilotBar.tsx`.
   - Unhandled no-op controls (`onClick={() => {}}`, `alert(...)`, unlinked buttons).

6. **Missing Differentiated AI Feature**:
   - The *Intent-to-Action Negotiator* (multi-operator explainable conjunction decision packet) is not yet implemented.

---

## 2. Inventory of Repository Assets

### Frontend Routes (`src/App.tsx`)
- `/` — `Dashboard`
- `/orbital-map` — `OrbitalMap`
- `/collision-monitor` — `CollisionMonitor`
- `/conjunction-analysis` — `ConjunctionAnalysis`
- `/analytics` — `Analytics`
- `/space-weather` — `SpaceWeather`
- `/ai-copilot` — `AICopilot`
- `/simulations` — `Simulations`
- `/ground-station` — `GroundStation`
- `/alert-center` — `AlertCenter`
- `/reports` — `Reports`
- `/settings` — `Settings`
- `/event/:eventId` — `EventWorkspace`
- `/handoffs` — `PendingHandoffs`
- `/transfer` — `TransferResponsibility`

### Backend Endpoints (`backend/main.py`)
- GET `/api/health`
- GET `/api/satellites`
- GET `/api/congestion`
- GET `/api/collisions`
- GET `/api/debris`
- GET `/api/telemetry`
- GET `/api/space-weather`
- GET `/api/alerts`
- POST `/api/alerts/{alert_id}/acknowledge`
- GET `/api/conjunction/presets`
- POST `/api/conjunction/analyze`
- POST `/api/ai/chat`
- POST `/api/ai/maneuver`
- GET `/api/ground-station/status`
- GET `/api/ground-station/history`
- GET `/api/ground-station/latest`
- POST `/api/ground-station/telemetry`
- GET `/api/users`
- GET `/api/users/{user_id}`
- GET `/api/events`
- GET `/api/events/{event_id}`
- GET `/api/events/{event_id}/handoffs`
- GET `/api/events/{event_id}/timeline`
- POST `/api/events/{event_id}/handoffs`
- GET `/api/handoffs/pending`
- GET `/api/handoffs/{handoff_id}`
- POST `/api/handoffs/{handoff_id}/generate-note`
- POST `/api/handoffs/{handoff_id}/update-note`
- POST `/api/handoffs/{handoff_id}/confirm`
- POST `/api/handoffs/{handoff_id}/accept`
- POST `/api/handoffs/{handoff_id}/clarification`
- POST `/api/handoffs/{handoff_id}/respond-clarification`
- POST `/api/handoffs/{handoff_id}/reject`
- POST `/api/handoffs/{handoff_id}/escalate`
- POST `/api/handoffs/check-timeouts`
- POST `/api/events/{event_id}/unassigned-emergency`
- WebSocket `/ws/alerts`
- WebSocket `/ws/ground-station`

---

## 3. Baseline Test and Build Results

| Check | Baseline Status | Issues Identified |
|---|---|---|
| `npm ci` | Passed | 30 vulnerabilities reported in transitive packages |
| `npm run build` | Passed (1.75s) | Rollup browser externalization notices for `worker_threads` |
| `npm run lint` | **Failed (196 problems)** | 192 errors, 4 warnings across components, pages, hooks |
| `npm test` | Passed (4 tests) | Only 1 test file (`StatusBadge.test.tsx`) present |
| `pytest` | Passed (24 passed, 1 skipped) | `test_api_key.py` ran network call at import time; sgp4 was missing; startup tasks hung in test runner |

---

## 4. Detailed Findings by Phase

### Phase 1: Cesium, WebGL, and Map
- Hardcoded Ion token in `CesiumGlobe.tsx:317` must be removed; token must only come from `VITE_CESIUM_ION_TOKEN`.
- `creditContainer: document.createElement('div')` hides mandatory Cesium attribution. Must be replaced with compliant visible credit element.
- No WebGL detection: if `WebGLRenderingContext` fails, UI stays stuck on "Initializing Globe...". Needs automatic 2D tabular fallback view.
- Map controls in `OrbitalMap.tsx` and `Dashboard.tsx` need full error boundary and retry mechanisms.

### Phase 2: Frontend Lint and Quality
- **Render-time ref access**:
  - `src/pages/Simulations.tsx:357` reads `particlesRef.current.length` in JSX.
  - `src/pages/GroundStation.tsx` reads simulation refs in render.
- **Synchronous setState-in-effect**:
  - `src/pages/OrbitalMap.tsx:71` calls `handleSelectObject` directly in effect.
  - `src/pages/Settings.tsx:14` calls `setSpaceTrackEmail` directly in effect.
- **Impure functions during render**:
  - `src/components/ai/AICopilotBar.tsx:33` calls `Date.now()` during message generation.
- **TypeScript strictness**: Excessive `any` types throughout `CesiumGlobe.tsx`, `PendingHandoffs.tsx`, and `useKesslerAPI.ts`.

### Phase 3: Data Provenance & Freshness
- Missing standard `DataEnvelope<T>` schema.
- TCA values in `_COLLISION_EVENTS` are fixed in 2026-08, showing as expired or misleading.
- No global provenance banner indicating whether current data is live, cached, simulated, or fallback.

### Phase 4: Backend Error Handling & Resilience
- Global exception handler masking errors with HTTP 200.
- Missing rate limiting on LLM chat, maneuver planning, and telemetry upload.
- `/api/health` lacks granular component health diagnostics (database, space-track, AI, cache).

### Phase 5: Authentication & Security
- Wildcard CORS with credentials enabled.
- Forged client `x-user-id` header accepted as truth.
- Permissive expired Firestore security rules.
- Presence of service account private key JSON files on disk.

### Phase 6: Orbital Analysis Safety
- Non-deterministic burn direction and random jitter in `ai_service.py`.
- Missing decision-support disclaimers on maneuver advice.
- Missing explicit uncertainty covariance, hard-body radius, and TLE epoch age checks.

### Phase 7: Intent-to-Action Negotiator (Differentiated AI Feature)
- Not currently implemented. Conjunction analysis must feed into a multi-candidate deterministic evaluator (Maneuver Sat A, Maneuver Sat B, Request Additional Tracking, Hold & Re-screen, Escalate, Insufficient Data) with explainable scoring and human-in-the-loop review.

### Phase 8: Handoff & Accountability
- Handoff service exists but lacks cryptographic authentication and idempotent operation protections.

### Phase 9: No-Op & Misleading Controls
- Various unhandled click handlers (`onClick={() => {}}`, `alert(...)`, placeholder buttons) across `CollisionMonitor`, `Reports`, `GroundStation`, `Settings`, `Simulations`.

---

## 5. Remediation Plan

The implementation proceeds according to the 17-Phase Master Plan, systematically resolving all findings and validating each phase before final sign-off.

