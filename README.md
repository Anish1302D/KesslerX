# KesslerX — Orbital Safety Decision Support Platform

![Build Status](https://img.shields.io/badge/Build-Passing-00FF99?style=flat-square)
![ESLint](https://img.shields.io/badge/ESLint-0%20Errors%20%7C%200%20Warnings-00FF99?style=flat-square)
![Frontend Tests](https://img.shields.io/badge/Vitest-20%2F20%20Passing-00FF99?style=flat-square)
![Backend Tests](https://img.shields.io/badge/Pytest-36%2F36%20Passing-00FF99?style=flat-square)
![Compliance](https://img.shields.io/badge/Safety-Decision%20Support%20Only-00AEEF?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-FFC107?style=flat-square)

> **Operational Notice:** KesslerX is an orbital safety **decision-support platform**, not a spacecraft command or flight execution system. All maneuver recommendations visibly state: *"Decision support only — human approval required."* No AI model or automated workflow executes burns, modifies satellite state, or transmits operational flight commands.

---

## 🛰️ Overview & Differentiated Capabilities

KesslerX provides mission directors, orbital safety analysts, and satellite operators with real-time Space Situational Awareness (SSA), conjunction screening, thermospheric space weather monitoring, and cascading collision simulations.

### 🌟 KesslerX's Differentiated Feature: The Intent-to-Action Negotiator

Unlike traditional black-box or alert-only platforms, KesslerX implements a multi-candidate **Intent-to-Action Negotiator**:

1. **Deterministic Physics Evaluation**: Formulates 6 distinct, mathematically grounded options:
   - `DO_NOTHING` (Baseline Risk Analysis)
   - `PROGRADE_BOOST` (Perigee/Apogee raising via Vis-Viva)
   - `RETROGRADE_BURN` (Phase-advance phasing)
   - `OUT_OF_PLANE_INCLINATION` (Cross-track node displacement)
   - `COVARIANCE_REFINEMENT` (Ground radar / SSN tasking request)
   - `PASSIVE_DIFFERENTIAL_DRAG` (Attitude re-orientation)
2. **Transparent Multi-Factor Scoring**: Evaluates candidate options across 5 weighted dimensions:
   - Risk Reduction ($0.30$)
   - Fuel Cost Penalty ($0.25$)
   - Mission Continuity & Payload Uptime ($0.20$)
   - Covariance / Tracking Confidence ($0.15$)
   - Secondary Conjunction Avoidance ($0.10$)
3. **Two-Person Rule Sign-Off**: Mandatory dual-key authorization modal requiring human flight director authentication and rationale logging before exporting or staging any recommendation.

---

## 🔬 Core Architectural Pillars

- **CesiumJS 3D Globe with Resilient 2D Fallback**: Automatic WebGL hardware detection; if WebGL is unavailable or fails, renders an interactive, sortable 2D tabular satellite/debris catalog (`GlobeFallbackTable`) with epoch, altitude, category, and retry controls.
- **Strict Data Provenance (`DataEnvelope<T>`)**: Every telemetry metric, TLE, collision event, and AI advisory carries clear source (`space-track`, `noaa`, `nasa`, `local`, `simulation`, `demo`) and mode (`observed`, `derived`, `simulated`, `fallback`) metadata.
- **Dynamic Time of Closest Approach (TCA)**: Calculated relative to the active operational session time rather than static hardcoded past fixtures.
- **Thermospheric Space Weather & Drag Multiplier**: Integrates NOAA Space Weather Prediction Center (SWPC) F10.7 solar flux and planetary Kp index to compute real-time Jacchia-Bowman atmospheric density scaling factors ($1.00\times - 2.50\times$).
- **Hardware-in-the-Loop Ground Station Simulator**: Dedicated telemetry dashboard receiving simulated or real ESP32 LoRa downlinks, displaying satellite pass tracking (Azimuth, Elevation, Doppler shift, Range Rate), and hardware diagnostics.
- **Multi-Format Intelligence Reports**: Generates cryptographic PDF documents, structured JSON audit packages, and CSV spreadsheets with complete compliance provenance.

---

## 🛠️ Free-Tier Production Architecture

KesslerX is architected to run sustainably on free-tier infrastructure without paid vendor lock-in:

| Service | Tier / Deployment | Purpose |
|---|---|---|
| **Frontend** | Vercel (Edge CDN) | React 19 + TypeScript SPA with client-side routing |
| **Backend API** | Render (Free Web Service) | FastAPI + Python 3.11 with SGP4 & Vis-Viva mechanics |
| **Database & Auth** | Firebase / Firestore Free Spark | User identity, RBAC, conjunction events, immutable audit logs |
| **Ephemeral Cache** | In-Memory TTL + SQLite | SGP4 satellite catalog and Space-Track session management |
| **3D Imagery** | Cesium Ion Free Community | Earth terrain and Blue Marble basemaps |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v20 or higher (`node -v`)
- **Python**: v3.11 or higher (`python --version`)
- **Git**

### 2. Frontend Installation & Build
```bash
# Clone the repository
git clone https://github.com/Anish1302D/KesslerX.git
cd KesslerX

# Install Node dependencies
npm ci

# Run lint (target: 0 errors, 0 warnings)
npx eslint .

# Run frontend test suite
npm test -- --run

# Production build
npm run build
```

### 3. Backend Setup & Tests
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Run backend test suite
pytest -q
```

### 4. Running the Complete Stack
In Terminal 1 (Frontend):
```bash
npm run dev
# Dashboard available at: http://localhost:5173
```

In Terminal 2 (Backend):
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# API docs available at: http://localhost:8000/docs
```

---

## 🔒 Security & Role-Based Access Control (RBAC)

KesslerX enforces strict RBAC across 5 operational tiers:
- **Analyst**: View conjunctions, inspect ephemeris, draft handoff notes.
- **Safety Analyst**: Run conjunction screening, review covariance trade-offs.
- **Mission Operations Lead**: Propose maneuver intents, submit two-person sign-offs.
- **Mission Manager**: Execute handoff acceptances, authorize orbital risk waivers.
- **Administrator**: Rotate system ingestion keys, configure institutional endpoints.

See [SECURITY.md](./SECURITY.md) for vulnerability disclosure policies and credential hygiene guidelines.

---

## 📚 Technical Documentation

- **[AI Safety Principles & Guardrails](./AI_SAFETY.md)** — Decision-support boundary, deterministic physics, and human oversight.
- **[Data Provenance Specification](./DATA_PROVENANCE.md)** — Envelope specification, mode indicators, and fallback behavior.
- **[REST & WebSocket API Reference](./API.md)** — Endpoints, status codes, Pydantic schemas, and rate limits.
- **[Security & RBAC Policy](./SECURITY.md)** — Firestore rules, CORS configuration, and token validation.
- **[Contributing Guide](./CONTRIBUTING.md)** — Pull request checklist, test execution, and coding conventions.
- **[Final Implementation Report](./FINAL_IMPLEMENTATION_REPORT.md)** — Complete audit transformation synthesis across all 17 phases.

---

## 📄 License & Attribution

Distributed under the MIT License. Orbit propagation powered by SGP4 (`sgp4` and `satellite.js`). Space weather data derived from NOAA SWPC Boulder, CO. Satellite ephemeris data provided by Space-Track.org / 18th Space Defense Squadron. CesiumJS is licensed under Apache 2.0.
