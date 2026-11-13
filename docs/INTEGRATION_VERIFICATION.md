# KesslerX — Frontend Integration & Reliability Verification Guide

This guide documents the configuration, integration architecture, resilience fallbacks, demo modes, smoke tests, operational boundaries, and verification results for the KesslerX Orbital Safety Platform following the frontend reliability upgrade.

---

## 1. System Configuration & Environment Architecture

### 1.1 Centralized API & WebSocket Configuration

All API endpoints and WebSocket channels are centralized in [`src/config/api.ts`](file:///src/config/api.ts). Hardcoded URLs and scattered environment variable references have been eliminated while preserving 100% of the backend API contracts.

| Environment Variable | Default Value | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Root URL for REST endpoints (health, telemetry, ephemeris, conjunctions, maneuver planning) |
| `VITE_WS_BASE_URL` | Derived from `VITE_API_BASE_URL` (`ws://...` or `wss://...`) | Real-time WebSocket base URL for mission event streaming |
| `VITE_CESIUM_ION_TOKEN` | Free Community / Sandbox Token | Access token for Cesium Ion 3D globe photogrammetry and terrain tilesets |

### 1.2 Environment Validation

Configuration is validated at application startup using [`src/utils/envValidation.ts`](file:///src/utils/envValidation.ts):
- Checks formatting of API and WebSocket URLs.
- Flags insecure `http://` or `ws://` schemes in production environments.
- Logs actionable diagnostics in the developer console without crashing unconfigured development environments.

---

## 2. Integration Reliability & Fault Tolerant Architecture

### 2.1 Resilient API Client (`apiClient.ts`)
Network calls use [`src/utils/apiClient.ts`](file:///src/utils/apiClient.ts), which introduces:
- **Configurable Timeouts:** Default 15-second timeout via standard `AbortController` preventing hung UI requests.
- **Transient Failure Retries:** Configurable exponential backoff retries for transient 502/503/504 errors.
- **Categorized Error Handling (`ApiError`):** Explicitly classifies errors into `TIMEOUT_ERROR`, `NETWORK_ERROR`, `HTTP_ERROR`, and `PARSE_ERROR`.

### 2.2 Legitimate Empty vs. Failed Request Differentiation (`dataState.ts`)
The UI differentiates between empty state responses (e.g. 0 active conjunctions detected) and failed API requests (e.g. backend unreachable):
- A successful empty response displays **`0`** with nominal indicators.
- An unreachable or errored service displays **`Unavailable`** with a retry action, strictly avoiding false zero counts.

### 2.3 Resilient WebSocket State Machine (`useWebSocket.ts`)
Mission event streaming maintains an explicit connection state machine:
- States: `connecting` → `connected` → `reconnecting` → `disconnected`.
- **Bounded Reconnection:** Implements jittered exponential backoff capped at 5 retry attempts.
- **Manual Reconnect:** Surfaces user-initiated reconnection controls in the `AlertCenter` and `Dashboard` when maximum retry bounds are reached.

### 2.4 Cesium 3D Globe Recovery & 2D Accessible Fallback
WebGL and 3D rendering failures are isolated and recovered automatically:
- **WebGL Capability Detection (`webglDetection.ts`):** Probes hardware acceleration and context loss before mounting Cesium.
- **Error Boundary Recovery (`CesiumErrorBoundary.tsx`):** Catches rendering exceptions and provides key-based remounting.
- **2D Tracking Table Fallback (`GlobeFallbackTable.tsx`):** If WebGL is unavailable or fails, renders an accessible, sortable table displaying object designations, NORAD IDs, orbital regimes (LEO, MEO, GEO), perigee/apogee, and CSV export.
- **Navigation Controls:** A manual toggle enables users to switch between the 3D globe and the 2D tabular view at any time.

### 2.5 TLE Epoch Freshness & Stale Data Warnings (`tleFreshness.ts`)
Ephemeris propagation accuracy degrades over time. Satellite details display real-time epoch freshness indicators:
- **Nominal (< 48 hours):** Standard high-precision propagation indicator.
- **Stale Warning (48 – 168 hours):** Amber warning advising increased positional covariance.
- **Critical Alert (> 168 hours / 7 days):** Red warning indicating severe propagation drift; operators are advised to ingest a new Space-Track ELSET.

### 2.6 Maneuver Assessment Timestamp Validation (`maneuverValidation.ts`)
The maneuver planning interface validates inputs client-side before submission:
- Validates Time of Closest Approach (TCA) as a valid future ISO timestamp within a 30-day operational horizon.
- Rejects negative miss distances, invalid probability ranges ($> 1.0$ or $< 0$), and malformed 69-character TLE lines.
- Identifies uncooperative space debris objects and flags passive drag-only constraints.
- **Strict Boundary:** Preserves existing maneuver-generation physics and does not alter server-side orbital calculation logic.

### 2.7 SHA-256 Cryptographic Evidence Integrity (`evidenceHash.ts`)
Orbital safety assessments and Intent-to-Action negotiation agreements require verifiable audit trails:
- **Canonical Serialization (`canonicalizeJson`):** Recursively sorts object keys to guarantee deterministic stringification.
- **Cryptographic Digest (`computeEvidenceHash`):** Computes a 64-character lowercase SHA-256 hex digest using the Web Crypto API (`crypto.subtle`) with a pure JS fallback.
- **Digital Evidence Sealing:** Packages include an immutable `sha256_hash` and `signed_at` timestamp.
- **Verification Badges:** Integrated into [`IntentNegotiatorCockpit.tsx`](file:///src/components/negotiator/IntentNegotiatorCockpit.tsx) and [`Reports.tsx`](file:///src/pages/Reports.tsx) to verify package authenticity and detect tampering.

---

## 3. Data Provenance & Demo Mode Governance

KesslerX enforces visible data provenance throughout the user interface:
- **Live Space-Track / NOAA:** Authenticated real-time observations and solar flux telemetry.
- **Derived Ephemeris:** SGP4-propagated state vectors and covariance ellipsoids computed from validated TLEs.
- **Simulated / Demo Fixtures:** When running disconnected from live orbital ground stations, all synthetic data is explicitly badged as `SIMULATED` or `DEMO`.
- **System Health Panel (`SystemHealthPanel.tsx`):** Provides live visibility into frontend operational health, backend API ping latency, and telemetry ingestion pipeline status.

---

## 4. Verification & Smoke Test Procedures

### 4.1 Automated Test Execution

Execute the comprehensive test suites across both frontend and backend environments:

```bash
# 1. Frontend Test Suite (Vitest)
npx vitest run

# 2. Frontend Lint Verification (ESLint)
npm run lint

# 3. Frontend Production Build (Vite + TypeScript)
npm run build

# 4. Backend Verification Suite (Pytest)
python -m pytest backend/ -o asyncio_mode=auto
```

### 4.2 Manual Smoke Testing Checklist

1. **Dashboard Health Verification:**
   - Navigate to `/`.
   - Confirm the System Health status panel reflects frontend `Nominal` and displays backend connectivity status.
2. **Data State Handling:**
   - Disconnect the local backend service.
   - Verify that satellite counts display `Unavailable` with an error advisory instead of a misleading `0`.
3. **Cesium Fallback & Recovery:**
   - In `/map`, toggle to the **2D Tracking Table**.
   - Verify sorting by satellite name and altitude. Filter by `LEO`, `MEO`, and `GEO` layers. Export the catalog to CSV.
   - Click **Switch to 3D Globe** to return to the CesiumJS view.
4. **Conjunction Date Validation:**
   - Navigate to `/conjunctions`.
   - Attempt to submit a past date or malformed timestamp. Confirm that client-side validation blocks the request with a clear advisory.
5. **Evidence Package Verification:**
   - Open `/reports` and export a JSON evidence package.
   - Inspect the generated JSON file and confirm the presence of `sha256_hash` and `signed_at` audit fields.

---

## 5. Architectural Preservation & Boundaries

The 20-commit reliability upgrade adhered to strict operational restrictions:
- **NO changes to core orbital physics or SGP4 propagation mechanics.**
- **NO changes to collision-risk algorithms or covariance scaling.**
- **NO changes to Vis-Viva maneuver-generation logic or burn duration calculations.**
- **NO modifications to existing FastAPI backend endpoint contracts.**
- **NO database schema alterations or migrations.**
- **NO weakening of authentication, role-based access control, or two-person sign-off requirements.**
- **NO removal of existing capabilities or unauthorized UI redesigns.**

---

## 6. Verification Summary

| Suite / Check | Result | Details |
|---|---|---|
| **Frontend Unit & Integration Tests** | **PASS** | 15 test files passed, 63+ tests covering API, WebSocket, TLE, WebGL, 2D Fallback, Validation, and Hashing |
| **Frontend Code Quality & Lint** | **PASS** | 0 ESLint errors |
| **Frontend Production Build** | **PASS** | TypeScript compilation and Vite bundling clean |
| **Backend Verification Suite** | **PASS** | 36 pytest tests passing (`backend/`) |
| **Git Working Tree** | **CLEAN** | Exactly 20 sequential commits on branch `fix/kesslerx-integration-stability` |
