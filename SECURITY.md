# KesslerX — Security & Vulnerability Policy

## 1. Security Overview

KesslerX is designed for mission-critical Space Situational Awareness and Orbital Safety Decision Support. Because operational recommendations affect high-value space assets, the platform implements multi-layer defense-in-depth:

- **Strict Identity Derivation**: The server never trusts client-controlled identity headers (`x-user-id`) without cryptographically verifying Bearer identity tokens or managed session keys.
- **Role-Based Access Control (RBAC)**: All state-changing endpoints (e.g. handoff confirmation, alert acknowledgment, configuration mutation, report generation) require verified role privileges.
- **Zero Exposed Secrets**: No API keys, service accounts, private PEM keys, or tokens are committed to source control or exposed to browser bundles.
- **Restricted CORS**: Wildcard origins (`*`) with credentials enabled are prohibited. CORS strictly validates origin against configured `FRONTEND_ORIGIN` and `ALLOWED_ORIGINS`.
- **Hardened Firestore Security Rules**: Granular role-based rules restrict access to user profiles, conjunction events, handoff lifecycles, and immutable audit logs. Default-deny policy applied to all unmapped collections.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Role | Read Data / Maps | Run Conjunction Screening | Propose Maneuver / Negotiate | Two-Person Sign-Off | Accept Handoff | Administrative Config |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Analyst** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Safety Analyst** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Mission Operations Lead** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Mission Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Administrator** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 3. Secret & Credential Hygiene

1. **Environment Variables**:
   - `SPACE_TRACK_USERNAME` and `SPACE_TRACK_PASSWORD` must be set exclusively via server environment variables (e.g. Render dashboard) or user browser local storage for local testing.
   - `GEMINI_API_KEY` must never be referenced with a `VITE_` prefix.
   - `VITE_CESIUM_ION_TOKEN` is the only browser-accessible token, restricted to map tile rendering.
2. **Git Commit History**:
   - Repository history is audited to ensure no `.env`, service account JSON, or private credentials exist in revision logs.
   - The `.gitignore` file enforces exclusion of `.env*`, `*.pem`, `*.key`, `*serviceAccount*.json`, and virtual environments.

---

## 4. Rate Limiting Policy

To protect free-tier infrastructure and prevent denial-of-service, in-memory sliding window rate limits are applied:
- `/api/ai/chat`: 20 requests per minute
- `/api/conjunction/analyze`: 30 requests per minute
- `/api/ai/maneuver`: 30 requests per minute
- `/api/negotiator/evaluate`: 30 requests per minute
- Exceeding the quota yields `HTTP 429 Too Many Requests` with retry headers.

---

## 5. Reporting a Security Vulnerability

If you discover a potential vulnerability or security issue within KesslerX:
1. Do not open a public GitHub issue.
2. Submit a confidential report directly to the repository maintainer at: `anish1302d@gmail.com`
3. Include detailed steps to reproduce, affected endpoints, and suggested remediation.
4. Security advisories will be triaged and addressed within 48 hours.

