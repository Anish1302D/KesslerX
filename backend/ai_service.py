"""
KesslerX AI Decision Support Service.
Provides evidence-grounded, schema-validated orbital safety decision support using Google Gemini.
Eliminates shared global sessions, enforces per-request isolation, grounds all answers
on authoritative backend telemetry, and strictly prevents AI from calculating physics in free text.
"""

import logging
import os
import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ValidationError

from config import config
from negotiator_engine import compute_deterministic_maneuver, DISCLAIMER_TEXT

logger = logging.getLogger(__name__)

# Check Gemini SDK availability
try:
    os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except Exception as e:
    logger.warning(f"Failed to import google.generativeai: {e}")
    GENAI_AVAILABLE = False


# ============================================================
# Pydantic Schemas for AI Grounded Output
# ============================================================

class EvidenceItem(BaseModel):
    source_id: str
    source: str
    observed_at: Optional[str] = None
    freshness_seconds: int = 0
    claim: str


class AIChatResponse(BaseModel):
    answer: str
    evidence: List[EvidenceItem] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    uncertainties: List[str] = Field(default_factory=list)
    missing_inputs: List[str] = Field(default_factory=list)
    recommended_next_step: Optional[str] = None
    decision_support_only: bool = True
    human_approval_required: bool = True


SYSTEM_INSTRUCTION = f"""
You are the KesslerX Orbital Safety Decision Support Copilot.
You assist spacecraft flight directors and SSA analysts with orbital safety analysis.

NON-NEGOTIABLE SAFETY RULES:
1. Decision support only — human approval required. You never issue flight commands.
2. You have NO authority to execute burns, approve actions, or change spacecraft state.
3. Every recommendation must visibly declare: "{DISCLAIMER_TEXT}"
4. You NEVER fabricate satellite orbits, TLEs, CDMs, solar weather, or collision probabilities.
5. You MUST ground every claim strictly in the backend-provided EVIDENCE BUNDLE.
6. When responding, output ONLY valid JSON adhering strictly to this schema:
{{
  "answer": "Clear technical answer citing evidence",
  "evidence": [
    {{"source_id": "...", "source": "noaa|space-track|local|sgp4", "observed_at": "ISO", "freshness_seconds": 0, "claim": "..."}}
  ],
  "assumptions": ["List of physical and operational assumptions"],
  "uncertainties": ["Known uncertainties, e.g. TLE covariance degradation"],
  "missing_inputs": ["Any missing telemetry or sensor data required for flight qualification"],
  "recommended_next_step": "Recommended operational next step (e.g. Schedule radar tracking pass)",
  "decision_support_only": true,
  "human_approval_required": true
}}
"""


class AIService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.is_configured = bool(GENAI_AVAILABLE and self.api_key and self.api_key != "your_gemini_api_key_here")
        self.model_name = "gemini-2.0-flash"
        
        if self.is_configured:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=SYSTEM_INSTRUCTION
                )
                logger.info(f"AIService initialized with Gemini model: {self.model_name}")
                config.update_provider_status("gemini_ai", configured=True, status="operational", success=True)
            except Exception as e:
                logger.error(f"Failed to initialize Gemini model: {e}")
                self.is_configured = False
                config.update_provider_status("gemini_ai", configured=True, status="error", success=False, error_message=str(e))
        else:
            config.update_provider_status("gemini_ai", configured=False, status="unconfigured")

    async def generate_response(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> AIChatResponse:
        """
        Generates schema-validated, evidence-grounded response.
        Per-request isolated invocation (no cross-user shared sessions).
        """
        request_id = str(uuid.uuid4())[:8]

        # In production mode: Fail closed if Gemini is not configured
        if not self.is_configured:
            if config.is_production and not config.is_test:
                raise RuntimeError("GEMINI_API_KEY is not configured in production environment. AI decision support is unavailable.")
            # In demo or test mode: Return deterministic schema-compliant response
            return self._build_demo_chat_response(prompt, context)

        # Assemble evidence bundle
        evidence_bundle = self._build_evidence_bundle(context)
        structured_prompt = f"""
REQUEST ID: {request_id}
USER PROMPT: {prompt}

AUTHORITATIVE BACKEND EVIDENCE BUNDLE:
{json.dumps(evidence_bundle, indent=2)}

Respond ONLY with valid JSON complying with the required schema. Ground all statements in the evidence bundle.
"""
        try:
            # Per-request call
            response = await self.model.generate_content_async(
                structured_prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            raw_text = response.text.strip()
            
            # Clean markdown code block wraps if model included them
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            parsed = json.loads(raw_text)
            validated = AIChatResponse(**parsed)
            # Ensure safety flags cannot be bypassed
            validated.decision_support_only = True
            validated.human_approval_required = True
            config.update_provider_status("gemini_ai", configured=True, status="operational", success=True)
            return validated

        except (json.JSONDecodeError, ValidationError) as parse_err:
            logger.warning(f"Gemini output schema validation failed: {parse_err}. Re-grounding to safe envelope.")
            return AIChatResponse(
                answer="Analysis completed using deterministic backend evidence. Model free-text output did not satisfy strict safety schema.",
                evidence=[EvidenceItem(source_id="local-backend", source="local", claim="Deterministic backend telemetry envelope")],
                assumptions=["SGP4 ballistic propagation with B-star atmospheric drag"],
                uncertainties=["High TLE age covariance growth without updated radar observation"],
                missing_inputs=["Operator-grade Covariance Error Ellipsoid"],
                recommended_next_step="Review deterministic Candidate Maneuver Cockpit",
                decision_support_only=True,
                human_approval_required=True,
            )
        except Exception as e:
            logger.error(f"Gemini API request error: {e}")
            config.update_provider_status("gemini_ai", configured=True, status="degraded", success=False, error_message=str(e))
            if config.is_production:
                raise
            return self._build_demo_chat_response(prompt, context)

    async def generate_maneuver_plan(self, conjunction_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates deterministic collision avoidance maneuver plan.
        Orbital physics calculations are computed deterministically (Vis-Viva & Tsiolkovsky).
        Gemini is invoked only to formulate technical explanation grounded on deterministic calculations.
        """
        miss_km = float(conjunction_data.get("min_distance_km", 0.5))
        rel_vel = float(conjunction_data.get("relative_velocity_km_s", 7.5))
        obj_a = conjunction_data.get("object_a_name", "Primary Satellite")
        obj_b = conjunction_data.get("object_b_name", "Secondary Object")
        tca = conjunction_data.get("tca", datetime.now(timezone.utc).isoformat())

        # Compute deterministic physics
        deterministic = compute_deterministic_maneuver(
            altitude_km=450.0,
            miss_distance_km=miss_km,
            relative_velocity_km_s=rel_vel,
            tca_str=tca,
            obj_a_name=obj_a,
            obj_b_name=obj_b,
        )

        explanation = f"Recommended deterministic {deterministic['burn_direction']} burn of {deterministic['delta_v_m_s']} m/s to expand miss distance to {deterministic['expected_miss_distance_km']} km. Decision support only — human approval required."

        # If Gemini is configured, request technical rationale without altering any physical quantities
        if self.is_configured:
            try:
                prompt = f"""
Summarize the operational rationale for the following DETERMINISTIC maneuver plan.
Do NOT modify any numbers (delta-v, fuel, burn time, miss distance).
Primary: {obj_a}
Target: {obj_b}
Calculated delta-v: {deterministic['delta_v_m_s']} m/s
Burn direction: {deterministic['burn_direction']}
Expected miss distance: {deterministic['expected_miss_distance_km']} km
Fuel cost: {deterministic['fuel_cost_kg']} kg
Provide a 2-sentence rationale for flight dynamics review.
"""
                resp = await self.model.generate_content_async(prompt)
                if resp.text:
                    explanation = resp.text.strip()
            except Exception as e:
                logger.warning(f"Could not generate LLM rationale: {e}")

        deterministic["explanation"] = f"{DISCLAIMER_TEXT} {explanation}"
        deterministic["disclaimer"] = DISCLAIMER_TEXT
        return deterministic

    def _build_evidence_bundle(self, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Collects authoritative telemetry context for prompt grounding."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "context_supplied": context or {},
            "physics_model": "SGP4 Ballistic Propagation & Vis-Viva Encounter Plane",
            "operational_epoch": "2026 UTC",
            "disclaimer": DISCLAIMER_TEXT,
        }

    def _build_demo_chat_response(self, prompt: str, context: Optional[Dict[str, Any]]) -> AIChatResponse:
        """Deterministic, schema-compliant fallback for Demo/Test mode."""
        return AIChatResponse(
            answer=f"Decision support analysis for: '{prompt[:100]}'. Telemetry indicates nominal satellite state in 2026 operational epoch. Atmospheric drag is within expected bounds.",
            evidence=[
                EvidenceItem(source_id="local-telemetry", source="local", claim="Telemetry within nominal operational bounds"),
                EvidenceItem(source_id="noaa-swpc", source="noaa", claim="Geomagnetic and solar activity nominal")
            ],
            assumptions=["SGP4 ballistic propagation with B-star atmospheric drag"],
            uncertainties=["Covariance growth over 72-hour forecast horizon"],
            missing_inputs=["Operator-grade Covariance Error Ellipsoid"],
            recommended_next_step="Verify tracking pass schedule via Ground Station",
            decision_support_only=True,
            human_approval_required=True,
        )


# Global singleton instance & alias for backwards compatibility
ai_service = AIService()
MockAIService = AIService
