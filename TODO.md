# KesslerX Master Implementation Task List (TODO.md)

- [x] **Phase 0 — Baseline & Project Inventory**
  - [x] Run npm ci, npm run build, npm run lint, pytest
  - [x] Reconnect backend Python 3.14 venv & install SGP4
  - [x] Create KesslerX_Audit_Report.md
  - [x] Create TODO.md and IMPLEMENTATION_STATUS.md

- [x] **Phase 1 — Fix Cesium, WebGL, and Orbital Map**
  - [x] WebGL capability detection utility (`src/utils/webglDetection.ts`)
  - [x] Remove hardcoded Cesium Ion token from CesiumGlobe.tsx (read ONLY from `VITE_CESIUM_ION_TOKEN`)
  - [x] Implement clear missing-token, invalid-token, and loading timeout states
  - [x] Implement 2D Tabular Fallback View when WebGL fails or is unavailable (`src/components/dashboard/GlobeFallbackTable.tsx`)
  - [x] Add Error Boundary around Cesium components (`src/components/dashboard/CesiumErrorBoundary.tsx`)
  - [x] Restore compliant Cesium attribution (no CSS hiding or detached div)
  - [x] Ensure all map controls work or are visibly disabled with clear reason
  - [x] Add tests for Cesium fallback, timeout, and WebGL error handling

- [x] **Phase 2 — Fix Frontend Quality and Lint**
  - [x] Fix render-time ref access in `src/pages/Simulations.tsx`
  - [x] Fix render-time ref access in `src/pages/GroundStation.tsx`
  - [x] Fix synchronous setState-in-effect in `src/pages/OrbitalMap.tsx` and `src/pages/Settings.tsx`
  - [x] Fix impure function call (`Date.now()`) in `src/components/ai/AICopilotBar.tsx` and `src/pages/Reports.tsx`
  - [x] Eliminate all 196 ESLint errors and warnings across the codebase (0 errors, 0 warnings achieved)
  - [x] Replace unnecessary `any` types with strict TypeScript interfaces
  - [x] Verify zero lint errors and warnings with `npm run lint`

- [x] **Phase 3 — Data Provenance and Freshness**
  - [x] Define standard `DataEnvelope<T>` TypeScript interface (`src/types/dataEnvelope.ts`)
  - [x] Apply `DataEnvelope` across satellites, debris, collisions, telemetry, weather, alerts
  - [x] Fix misleading fixed dates in mock data; compute TCA relative to current time
  - [x] Add visible badges: `[Observed]`, `[Derived]`, `[Simulated]`, `[Fallback]`, `[Demo Fixture]`, `[Stale TLE]` (`src/components/ui/ProvenanceBadge.tsx`)
  - [x] Implement Global Data Provenance Status Banner in Header/Dashboard (`src/components/layout/GlobalProvenanceBanner.tsx`)

- [x] **Phase 4 — Backend Error Handling and API Correctness**
  - [x] Remove global exception handler returning HTTP 200 on failure; return proper 4xx/5xx status codes
  - [x] Standardize structured error responses `{code, message, retryable, details}`
  - [x] Add strict input validation (TLE checksums, epoch age, duration, propagation step, telemetry)
  - [x] Add rate limiting middleware for AI chat, maneuver analysis, telemetry uploads
  - [x] Expand `/api/health` to independently report backend, DB, satellite catalog, space weather, AI, and cache

- [x] **Phase 5 — CORS, Authentication, and Firestore Security**
  - [x] Restrict CORS to configured origins (no wildcard + credentials)
  - [x] Implement secure auth token verification (support Firebase Auth tokens + dev bearer tokens)
  - [x] Reject client-forged unverified `x-user-id` headers
  - [x] Enforce Role-Based Access Control (Analyst, Operations Lead, Mission Manager, Safety Analyst, Admin)
  - [x] Update `firestore.rules` with secure per-collection rules and RBAC
  - [x] Quarantine/remove any exposed private key files and add strict `.gitignore` rules
  - [x] Verify no secrets exposed to client bundle

- [x] **Phase 6 — Orbital and Conjunction Analysis Safety**
  - [x] Make SGP4 limitations explicit in all output
  - [x] Add `INSUFFICIENT_DATA` response when inputs are stale, invalid, or missing
  - [x] Remove all random calculations in `ai_service.py` (burn direction, miss distance, confidence)
  - [x] Add non-negotiable safety disclaimer to all maneuver advice: "Decision support only — human approval required"
  - [x] Never allow AI models to calculate physics or execute commands

- [x] **Phase 7 — Implement Intent-to-Action Negotiator (Differentiated AI Feature)**
  - [x] Backend negotiator engine generating 6 deterministic candidate options (`backend/negotiator_engine.py`)
  - [x] Deterministic multi-factor scoring (risk reduction, fuel, disruption, uncertainty, margin, externalities)
  - [x] Constrained LLM explanation schema (summary, evidence, assumptions, uncertainties, missing inputs)
  - [x] Frontend Intent-to-Action Negotiator UI: candidate cards, side-by-side comparison, evidence drawer (`src/components/negotiator/IntentNegotiatorCockpit.tsx`)
  - [x] Candidate selection for review workflow with Two-Person Rule sign-off (no command execution)

- [x] **Phase 8 — Handoff and Accountability Workflow**
  - [x] Strengthen handoff lifecycle with authenticated identities
  - [x] Add idempotent request protection and optimistic concurrency locking
  - [x] Structured handoff notes with complete provenance snapshot and safety notice

- [x] **Phase 9 — Remove All No-Op and Broken Controls**
  - [x] Audit every page for `onClick={() => {}}`, `alert(...)`, and broken controls
  - [x] Implement real actions or disabled states across all 15 routes

- [x] **Phase 10 — Reports and Exports**
  - [x] Complete PDF export, JSON evidence export, CSV data export
  - [x] Include full provenance, assumptions, and decision-support disclaimers in all exports

- [x] **Phase 11 — Space Weather Station Enhancements**
  - [x] Explicit observed vs forecast labels, Kp history, drag/orbit impact analysis
  - [x] Jacchia-Bowman atmospheric density drag multiplier ($1.00\times - 2.50\times$)

- [x] **Phase 12 — Real-time Alerts and WebSockets**
  - [x] Add reconnect status, deduplication, REST polling fallback when WebSocket is unavailable

- [x] **Phase 13 — Ground Station Simulator**
  - [x] Clear simulator labeling (`HARDWARE IN THE LOOP SIMULATOR`); define hardware telemetry validation schemas
  - [x] Satellite pass tracking (Az/El, Doppler, Range Rate, Next AOS/LOS)

- [x] **Phase 14 — Responsive Design and Accessibility**
  - [x] Keyboard navigation, aria labels, color contrast, responsive mobile/tablet layout

- [x] **Phase 15 — Testing Suite**
  - [x] Comprehensive frontend Vitest tests (fallback, badges, Negotiator, handoffs, accessibility) -> 20 tests passed
  - [x] Comprehensive backend Pytest tests (deterministic physics, auth, validation, rate limits, health) -> 36 tests passed

- [x] **Phase 16 — CI and Deployment Verification**
  - [x] Update CI configuration (`.github/workflows/ci.yml`) and verify build/test scripts
  - [x] Configure `render.yaml` and `vercel.json`

- [x] **Phase 17 — Documentation and Final Validation**
  - [x] Update README.md, SECURITY.md, DATA_PROVENANCE.md, AI_SAFETY.md, API.md, CONTRIBUTING.md
  - [x] Create FINAL_IMPLEMENTATION_REPORT.md

---

## Production Prototype Track (Realtime, Authenticated, Observable Production Prototype)

- [x] **Track Phase 0 — Forensic Audit & Reality Baseline**
  - [x] Identified all 16 prototype mock/synthetic/demo patterns
  - [x] Created `REALTIME_PRODUCTION_AUDIT.md`
  - [x] Verified active live NOAA, CelesTrak, and Firestore connectivity

- [x] **Track Phase 1 — Explicit Environments & Fail-Closed Config**
  - [x] Implemented `backend/config.py` supporting `production`, `demo`, `development`, `test`
  - [x] Implemented `SafeConfigDiagnostic` and `GET /api/admin/config-status`
  - [x] Added `validate_production_readiness()` fail-closed checks

- [x] **Track Phase 2 — Real Persistent Storage Engine**
  - [x] Implemented `backend/storage.py` SQLite schema with WAL mode
  - [x] Implemented optimistic concurrency locking and idempotency protection
  - [x] Connected Firestore client bridge in `backend/firebase_config.py`

- [x] **Track Phase 3 — Real Space-Track & CelesTrak Ingestion**
  - [x] Completely refactored `backend/space_track.py` with session login and SGP4 checksum validation
  - [x] Isolated demo data into `backend/demo_catalog.py`
  - [x] Zero random debris generated in production mode

- [x] **Track Phase 4 — Operator-Grade Conjunction Assessment**
  - [x] Implemented CCSDS Conjunction Data Message (`CDMEvent`) parser in `backend/conjunction_engine.py`
  - [x] Implemented Foster/Alfriend 2D encounter-plane collision probability calculation
  - [x] Fail-closed with `INSUFFICIENT_DATA` when covariance is missing

- [x] **Track Phase 5 — Real NOAA SWPC Space Weather Integration**
  - [x] Created `backend/noaa_service.py` fetching live Kp, F10.7 flux, solar wind speed, and Bz field
  - [x] Computed Jacchia-Bowman atmospheric drag multiplier from live NOAA measurements
  - [x] Completely removed synthetic sine/cosine math from `/api/space-weather`

- [x] **Track Phase 6 — Grounded AI Decision Support System**
  - [x] Rewrote `backend/ai_service.py` with Pydantic structured output (`AIChatResponse`)
  - [x] Per-request session isolation and deterministic physics bounds (`compute_deterministic_maneuver`)
  - [x] Strict safety banners: "Decision support only — human approval required"

- [x] **Track Phase 7 — Authenticated Ground Station Telemetry Boundary**
  - [x] Rewrote `backend/ground_station.py` with HMAC token validation and sequence replay protection
  - [x] Disabled background simulation loops in production (`main.py`)
  - [x] Reports `NO_HARDWARE_CONNECTED` when offline

- [x] **Track Phase 8 — Frontend Production Data Contracts**
  - [x] Updated `src/hooks/useKesslerAPI.ts` and `src/hooks/useHandoffAPI.ts` with explicit `isDemoModeActive()`
  - [x] Fail-closed error states with honest metadata (`source`, `mode`, `provider`, `freshness`)
  - [x] Zero silent mock substitution in production mode

- [x] **Track Phase 9 — Comprehensive Multi-Provider Testing & Final Reporting**
  - [x] Created `backend/test_real_providers.py`
  - [x] 43 backend Pytest tests passed (100%)
  - [x] 20 frontend Vitest tests passed (100%)
  - [x] 0 ESLint warnings or errors (`npx eslint .`)
  - [x] Production bundle successfully built in 3.13s (`npm run build`)
  - [x] Authored `FINAL_REALTIME_PRODUCTION_REPORT.md`

