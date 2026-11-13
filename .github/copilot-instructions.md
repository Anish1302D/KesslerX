# GitHub Copilot Instructions for KesslerX

KesslerX is an AI-Powered Space Situational Awareness (SSA) and Orbital Traffic Management decision-support platform built with React 19, TypeScript, Vite, Tailwind CSS, CesiumJS, satellite.js, Recharts, FastAPI, Python, SGP4, Firebase/Firestore, and Gemini AI.

## Pre-Merge Verification Checklist

Before approving or merging any Pull Request, verify that all of the following checks pass with zero errors:

1. **Frontend Lint**: `npm run lint` (0 ESLint errors/warnings)
2. **TypeScript Typecheck & Production Build**: `npm run build` (`tsc -b && vite build`)
3. **Frontend Unit & Component Tests**: `npm test -- --run` (Vitest + React Testing Library)
4. **Backend API & Orbital Mechanics Tests**: `TESTING=1 PYTHONPATH=backend python -m pytest backend`

## Non-Negotiable Aerospace Safety Rules

1. **Decision Support Only**: KesslerX is decision-support software, never a spacecraft flight-command system.
2. **Mandatory Disclaimer**: Every maneuver recommendation or negotiation output must include:
   `"Decision support only — human approval required. Not a flight command system."`
3. **Human-in-the-Loop**: Never allow an AI model to execute a maneuver, change spacecraft state, or auto-approve an operational action.
4. **Deterministic Physics**: Never use `Math.random()` or Python `random` to fabricate physical risk parameters (collision probability, miss distance, $\Delta v$, fuel cost, or TCA) in conjunction/negotiation calculations.
5. **Data Provenance**: Always preserve explicit data provenance metadata (`observed`, `derived`, `simulated`, `fallback`, `cached`).
6. **Secret Hygiene**: Never commit API keys, service account JSON credentials, or private tokens into source code.

