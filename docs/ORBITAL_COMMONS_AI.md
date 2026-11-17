# Orbital Commons AI — Multi-Operator Decision Support & Governance

> **Mandatory Safety Warning:**
> `Decision support only — human approval required. Not a flight command system.`
> `Research prototype. Decision support only — human approval required. No command execution.`

---

## 1. Purpose

Single-satellite maneuver planning optimizes fuel or risk for one spacecraft in isolation. In congested Low Earth Orbit (LEO) and Sun-Synchronous Orbit (SSO) shells, unilateral avoidance burns frequently shift hazard onto neighboring active satellites, repeat-burden cooperative operators, or push spacecraft into secondary debris corridors.

**Orbital Commons AI** provides **explainable, auditable, human-approved** multi-operator conjunction coordination for KesslerX. For a conjunction event between Operator A and Operator B inside a shared corridor `ImpactGraph`, it deterministically evaluates **7 candidate courses of action** and produces a signed SHA-256 evidence packet awaiting **two-person human review**.

---

## 2. System Architecture

```text
+-------------------------------------------------------------------+
|  KesslerX Frontend (/orbital-commons & /conjunction-analysis)     |
|  - Policy Mode Selector & Fairness / Burden Matrix                |
|  - Counterfactual Panel & Pareto Frontier                         |
|  - Privacy-Masked Operator Summaries & Evidence Drawer (SHA-256)  |
|  - Two-Person Approval Workflow (NO Execute Maneuver button)      |
+---------------------------------+---------------------------------+
                                  | HTTPS JSON + x-user-id / Bearer
                                  v
+-------------------------------------------------------------------+
|  FastAPI Endpoints (/api/orbital-commons/*)                       |
|  - POST /evaluate          (Deterministic scoring + AI narrative) |
|  - GET  /policies          (Policy metadata & weights)            |
|  - GET  /events/{event_id} (Masked summaries & review status)     |
|  - GET  /events/{event_id}/evidence (Canonical JSON + SHA-256)    |
|  - POST /events/{event_id}/approve  (Two-Person Rule enforcement) |
|  - POST /events/{event_id}/reject   (Reject or Clarification)     |
+------------------+------------------------------+-----------------+
                   |                              |
                   v                              v
+----------------------------------+  +-----------------------------+
|  orbital_commons_engine.py       |  | ai_service.py               |
|  - Multi-rev CW & Tsiolkovsky    |  | - Explain ONLY pre-computed |
|  - Feasibility & Blackout Gates  |  |   CommonsResult             |
|  - Externality & Fairness Scores |  | - Strict Pydantic Schema    |
|  - Pareto Frontier & SHA-256     |  | - Deterministic Fallback    |
|  - Fail-Closed INSUFFICIENT_DATA |  | - Zero Physics Calculation  |
+----------------------------------+  +-----------------------------+
```

---

## 3. Data Flow & Provenance Rules

1. **Input Ingestion & Validation (`CommonsRequest`)**:
   - Strict Pydantic bounds check orbital altitude (`120–45,000 km`), `collision_probability` (`[0.0, 1.0]`), `miss_distance_km` (`>= 0`), operator constraints, and corridor `ImpactGraph`. Invalid payloads fail immediately with `HTTP 422`.
2. **Fail-Closed Provenance & Integrity Gate (`INSUFFICIENT_DATA`)**:
   - If `tle_age_hours > 72.0` or `impact_graph.data_age_hours > 72.0`,
   - Or `tca` is invalid or already passed,
   - Or covariance / uncertainty sigma values are missing or `covariance_available === false`:
   - The engine returns `status = "INSUFFICIENT_DATA"`, sets `review_state.status = "INSUFFICIENT_DATA"`, recommends `OPT-7-INSUFFICIENT-DATA`, and **blocks approval endpoints**.
3. **Simulated vs Live Feed Provenance**:
   - Baseline demo scenarios (`OC-DEMO-001`, `OC-DEMO-DEBRIS-002`, `OC-DEMO-STALE-003`) are explicitly labelled `data_mode: "simulated"` or `DEMO SIMULATION` (offline frontend fallback).

---

## 4. Candidate Actions & Optimization Policies

### 7 Evaluated Candidate Courses of Action
1. `OPT-1-MANEUVER-PRIMARY` (`MANEUVER_PRIMARY`) — Unilateral phasing burn by primary spacecraft.
2. `OPT-2-MANEUVER-SECONDARY` (`MANEUVER_SECONDARY`) — Unilateral burn by secondary spacecraft (if maneuverable).
3. `OPT-3-ADDITIONAL-TRACKING` (`ADDITIONAL_TRACKING`) — Task SSN/optical follow-up pass to collapse covariance.
4. `OPT-4-HOLD-RESCREEN` (`HOLD_AND_RESCREEN`) — Passive deferral to next screening cycle (rejected if `TCA < 18h` or `Pc > max_allowed_risk`).
5. `OPT-5-COORDINATED-SPLIT` (`COORDINATED_SPLIT_MANEUVER`) — Symmetric counter-phasing burn shared across Operator A and Operator B.
6. `OPT-6-ESCALATE-SAFETY-LEAD` (`ESCALATE_HUMAN_SAFETY_LEAD`) — Formal escalation to coalition flight safety directors.
7. `OPT-7-INSUFFICIENT-DATA` (`INSUFFICIENT_DATA`) — Fail-closed hold pending verified ephemeris.

### 5 Auditable Policy Modes & Weights

| Policy Mode | Risk Red. | Fuel Eff. | Continuity | Uncertainty | Externality | Fairness | Human Rev. |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `FAIR_BURDEN_SHARING` | 0.30 | 0.15 | 0.15 | 0.10 | 0.10 | 0.15 | 0.05 |
| `MINIMUM_FUEL` | 0.22 | 0.40 | 0.10 | 0.08 | 0.08 | 0.07 | 0.05 |
| `MINIMUM_MISSION_INTERRUPTION` | 0.22 | 0.10 | 0.40 | 0.08 | 0.08 | 0.07 | 0.05 |
| `MAXIMUM_RISK_REDUCTION` | 0.50 | 0.08 | 0.08 | 0.10 | 0.12 | 0.07 | 0.05 |
| `MINIMUM_EXTERNALITY` | 0.24 | 0.10 | 0.10 | 0.10 | 0.33 | 0.08 | 0.05 |

---

## 5. Deterministic Scoring Formulas

- **Phasing Delta-V**: Derived deterministically via multi-revolution Clohessy-Wiltshire in-track phasing scaled over available orbital revolutions before burn lead time, anchored by `compute_deterministic_maneuver` from `negotiator_engine.py`.
- **Propellant Cost**: Tsiolkovsky Rocket Equation $\Delta m = m_0 (1 - e^{-\Delta v / (I_{sp} g_0)})$ using propulsion-specific $I_{sp}$ (`HALL_ELECTRIC` = 1550 s, `BIPROP` = 305 s, `HYDRAZINE` = 220 s, `COLD` = 68 s).
- **Corridor Externality**: Evaluates altitude-band proximity ($|\Delta h| < 25\text{ km}$) against every neighbor in `ImpactGraph.nearby_objects`, applying extra weighting for non-maneuverable debris and rejecting maneuvers whose induced secondary risk exceeds `maximum_allowed_risk`.
- **Burden Fairness**: Compares relative resource burden $(\Delta v / \Delta v_{\text{avail}} + \text{downtime}/15)$ between Operator A and Operator B, penalizing asymmetric unilateral burden and repeat burns when an operator has `prior_maneuver_count > 0`.
- **Pareto Frontier**: Marks every feasible candidate as `pareto_optimal = true` iff no other feasible candidate strictly dominates it across the 6 technical/fairness dimensions.

---

## 6. Privacy & Safety Limitations (Honest Boundaries)

- **Privacy Boundary**: Private constraints (`available_delta_v_m_s`, `minimum_service_availability_percent`, `blackout_windows`) are evaluated server-side and masked (`authorized_private_details: null`) in cross-operator views. **This is a server-enforced prototype privacy boundary — it is NOT production cryptographic multi-party computation (MPC), zero-knowledge proofs, or federated learning.**
- **Safety Boundary**: Orbital Commons AI is **decision support only**. Every response sets `command_executed: false`. No endpoint, background worker, LLM prompt, or UI button can uplink or execute a spacecraft maneuver.
- **LLM Guardrail**: Gemini narrative explanations are validated against the strict `LLMCommonsExplanation` Pydantic schema; any malformed or out-of-policy response automatically triggers `generate_deterministic_commons_explanation()`.

---

## 7. Human Approval Workflow & SHA-256 Evidence Packet

Approval follows the **Two-Person Rule**:
1. `PENDING_REVIEW` -> **First Human Reviewer** submits `/approve` -> transitions to `FIRST_REVIEW_COMPLETE`.
2. **Second Human Reviewer** (strictly verified as `second_reviewer != first_reviewer`, HTTP 403 otherwise) submits `/approve` -> transitions to `SECOND_REVIEW_COMPLETE`.
3. `command_executed` remains `false` at every stage.

### SHA-256 Evidence Packet & Hash Behavior
Canonical JSON uses sorted keys and compact separators (`json.dumps(..., sort_keys=True, separators=(",", ":"))`) over inputs, policy weights, engine version, operator summaries, candidate metrics, Pareto frontier, assumptions, and missing inputs — excluding volatile wall-clock `generated_at_utc`.
- **Identical inputs** always produce the **exact same** `audit_hash_sha256`.
- **Any change** to input telemetry, policy mode/weights, `ENGINE_VERSION`, or candidate scores changes `audit_hash_sha256`.

```json
{
  "event_id": "OC-DEMO-001",
  "engine_version": "orbital-commons-1.0.0",
  "selected_policy": "FAIR_BURDEN_SHARING",
  "recommendation": "OPT-5-COORDINATED-SPLIT",
  "pareto_frontier": [
    "OPT-2-MANEUVER-SECONDARY",
    "OPT-3-ADDITIONAL-TRACKING",
    "OPT-5-COORDINATED-SPLIT",
    "OPT-6-ESCALATE-SAFETY-LEAD",
    "OPT-7-INSUFFICIENT-DATA"
  ],
  "hash_algorithm": "SHA-256",
  "hash_scope": "canonical_deterministic_evidence",
  "audit_hash_sha256": "<64-hex-sha256-digest>",
  "disclaimer": "Decision support only — human approval required. Not a flight command system."
}
```

---

## 8. API Usage Examples

```bash
# 1. List transparent policy configurations
curl http://localhost:8000/api/orbital-commons/policies

# 2. Retrieve seeded OC-DEMO-001 evaluation (cross-operator privacy-masked)
curl -H "x-user-id: anish" http://localhost:8000/api/orbital-commons/events/OC-DEMO-001

# 3. Record 1st Human Review (Anish)
curl -X POST http://localhost:8000/api/orbital-commons/events/OC-DEMO-001/approve \
  -H "Content-Type: application/json" \
  -H "x-user-id: anish" \
  -d '{"candidate_id":"OPT-5-COORDINATED-SPLIT","notes":"Corridor clear","safety_acknowledged":true}'

# 4. Record 2nd Independent Human Review (Sarah)
curl -X POST http://localhost:8000/api/orbital-commons/events/OC-DEMO-001/approve \
  -H "Content-Type: application/json" \
  -H "x-user-id: sarah" \
  -d '{"candidate_id":"OPT-5-COORDINATED-SPLIT","notes":"Concur","safety_acknowledged":true}'
```

---

## 9. 5-Minute Judge Demonstration Script

1. Navigate to **`/orbital-commons`** in KesslerX (`OC-DEMO-001` loads immediately).
2. Point out the **Mandatory Safety Banner**, `SIMULATED` provenance badge, counterfactual (`What happens if no action is taken?`), and why `OPT-1` is **REJECTED** due to `COSMOS-DEB-4421` upper-corridor proximity.
3. Click **`Minimum Fuel`** policy tab -> show recommendation dynamically shifts to **`OPT-2-MANEUVER-SECONDARY`** (`HALL_ELECTRIC`, `0.027 kg` propellant). Click **`Minimum Mission Interruption`** -> shifts to **`OPT-3-ADDITIONAL-TRACKING`**.
4. Switch scenario to **`Stale TLE Gate Demo`** -> demonstrate fail-closed **`INSUFFICIENT_DATA`** halting maneuver selection and locking human sign-off.
5. Return to **`Active vs Active (OC-DEMO-001)`**, open **`Inspect Evidence Drawer`** to show the canonical JSON and 64-char SHA-256 digest, then record **1st Human Review (`anish`)**, show same-user 2nd review is blocked, switch reviewer to **`sarah`**, record **2nd Human Review**, and confirm `Command Execution: DISABLED`.
