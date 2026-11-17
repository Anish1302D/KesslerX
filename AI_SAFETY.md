# KesslerX — AI Safety & Operational Non-Negotiables

## 1. Decision Support Boundary

> **NON-NEGOTIABLE RULE #1:**
> KesslerX is **decision-support software**, not an autonomous spacecraft-command system.

- KesslerX provides advisory, analytical, and situational intelligence to human operators.
- **Under no circumstances** may an AI model or automated backend worker transmit flight commands, fire satellite thrusters, modify attitude control modes, or execute maneuvers autonomously.
- Every generated recommendation, screen, and PDF report visibly states:
  > **"Decision support only — human approval required. Not a flight command system."**

---

## 2. Deterministic Physics Over Probabilistic Hallucination

1. **Vis-Viva & Rocket Equation Physics**:
   - Collision probability ($P_c$), miss distance ($\Delta r$), required $\Delta v$, fuel consumption ($\Delta m$), and burn directions are computed using deterministic orbital mechanics (`backend/negotiator_engine.py` and `backend/ai_service.py`).
   - Vis-Viva equation:
     $$v^2 = \mu \left(\frac{2}{r} - \frac{1}{a}\right)$$
   - Tsiolkovsky rocket equation:
     $$\Delta m = m_0 \left(1 - e^{-\frac{\Delta v}{I_{sp} g_0}}\right)$$
   - **Zero Random Numbers**: Random number generation (`random.uniform`, `Math.random`) is strictly forbidden for computing physical collision metrics, maneuver advice, or risk scores.
2. **LLM Sandboxing**:
   - Language models (Gemini 1.5 Pro) are utilized solely for contextual narrative summarization and natural language explanation of deterministic physics calculations.
   - LLMs are never permitted to generate raw physical constants or operational burn parameters without mathematical validation.

---

## 3. The Two-Person Rule Sign-Off

For any high-conjunction mitigation action, KesslerX requires dual-key authorization:
1. **Primary Operator**: Selects candidate maneuver from the Intent Negotiator trade-off matrix.
2. **Secondary Flight Director**: Reviews covariance, propellant penalty, and secondary collision risks, entering credentials and authorization rationale.
3. **Audit Trail**: Every sign-off is committed to an append-only immutable audit log with cryptographic UTC timestamps.

---

## 4. Claims & Attribution Honesty

- **No False Claims**: KesslerX does not claim to be "the world's first orbital AI" or possess unverified global uniqueness.
- **Differentiated Capability**: The platform is accurately described as featuring: *"KesslerX's differentiated feature: The Intent-to-Action Negotiator."*
- **Licensing & Attribution**: CesiumJS, SGP4, Space-Track, NOAA, NASA, and Resium attributions remain visible, unobstructed, and compliant with their respective licenses.


## Orbital Commons AI Safety & Privacy Boundaries

- **Mandatory Warning**: Every Orbital Commons output, API response, evidence packet, and UI view includes `Decision support only — human approval required. Not a flight command system.`
- **Deterministic Physics & Scoring**: All multi-revolution phasing delta-v calculations, Tsiolkovsky propellant estimates, corridor externality checks, fairness penalties, Pareto frontiers, and composite scores execute deterministically in Python (`backend/orbital_commons_engine.py`).
- **Schema-Locked AI Narratives**: Gemini output (`explain_orbital_commons`) is strictly validated against `LLMCommonsExplanation` and never modifies numbers, feasibility flags, or review states; invalid outputs fall back to deterministic prose.
- **Fail-Closed Gate**: Stale ephemeris (`> 72h`), passed/invalid TCA, or missing covariance inputs force `status: "INSUFFICIENT_DATA"` and block maneuver approval.
- **Two-Person Human Governance**: Requires two distinct authenticated human reviewers (`PENDING_REVIEW` -> `FIRST_REVIEW_COMPLETE` -> `SECOND_REVIEW_COMPLETE`) and maintains `command_executed: false`.
- **Prototype Privacy Masking Disclosure**: Private operator delta-v, availability, and blackout constraints are masked in cross-operator views (`authorized_private_details: null`). This is a server-enforced prototype privacy boundary, not cryptographic MPC or federated learning.
