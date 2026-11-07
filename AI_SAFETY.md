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

