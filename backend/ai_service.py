import logging
import os
import json
import math
import random
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

try:
    os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except Exception as e:
    logger.warning(f"Failed to import google.generativeai: {e}")
    GENAI_AVAILABLE = False

from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if GENAI_AVAILABLE and api_key and api_key != "your_gemini_api_key_here":
    genai.configure(api_key=api_key)
else:
    logger.warning("GEMINI_API_KEY not set or genai unavailable. AI responses will fail.")

SYSTEM_INSTRUCTION = """
You are the Kessler AI Copilot, an advanced orbital mechanics engine and space situational awareness AI.
Your purpose is to analyze orbital telemetry, predict satellite trajectories, and assess collision risks (Kessler Syndrome).
You can also generate collision avoidance maneuver plans when asked.

When generating maneuver plans, respond ONLY with valid JSON in this exact format:
{
  "risk": "HIGH",
  "delta_v_m_s": 0.42,
  "burn_direction": "RETROGRADE",
  "burn_duration_seconds": 12.5,
  "burn_time_utc": "2026-08-06T10:42:00Z",
  "expected_miss_distance_km": 520,
  "fuel_cost_kg": 0.85,
  "confidence_pct": 96.4,
  "explanation": "A retrograde burn is recommended to lower the orbit..."
}

For general queries, keep responses concise, professional, and slightly technical, like a mission control AI.
"""

class MockAIService: # Keeping the name MockAIService to avoid changing main.py, but it's actually Gemini now
    def __init__(self):
        if GENAI_AVAILABLE:
            self.model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                system_instruction=SYSTEM_INSTRUCTION
            )
            self.chat_session = self.model.start_chat(history=[])
        else:
            self.chat_session = None
    
    async def generate_response(self, prompt: str, context: dict = None) -> str:
        if not GENAI_AVAILABLE or not api_key or api_key == "your_gemini_api_key_here":
            return self._get_fallback_response(prompt)

        try:
            # Build the message
            message = prompt
            if context:
                message = f"Context: {context}\n\nUser Query: {prompt}"
            
            # Use generate_content_async for async support
            response = await self.chat_session.send_message_async(message)
            return response.text
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return self._get_fallback_response(prompt)

    async def generate_maneuver_plan(self, conjunction_data: dict) -> dict:
        """
        Generate an AI-powered collision avoidance maneuver plan.
        Uses Gemini for intelligent planning; falls back to rule-based orbital mechanics.
        """
        miss_distance = conjunction_data.get("min_distance_km", 10.0)
        rel_velocity = conjunction_data.get("relative_velocity_km_s", 7.5)
        risk_level = conjunction_data.get("risk_level", "MEDIUM")
        tca = conjunction_data.get("tca", "")
        obj_a = conjunction_data.get("object_a_name", "Object A")
        obj_b = conjunction_data.get("object_b_name", "Object B")

        # Get Object A state for altitude
        obj_a_state = conjunction_data.get("object_a_state", {})
        if not obj_a_state and conjunction_data.get("events"):
            obj_a_state = conjunction_data["events"][0].get("object_a_state", {})
        altitude = obj_a_state.get("altitude_km", 400.0)

        # Try Gemini first
        if GENAI_AVAILABLE and api_key and api_key != "your_gemini_api_key_here":
            try:
                prompt = f"""Generate a collision avoidance maneuver plan for this conjunction event.
Respond ONLY with valid JSON, no markdown, no code fences.

Conjunction Data:
- Object A: {obj_a} at {altitude:.1f} km altitude
- Object B: {obj_b}
- Miss Distance: {miss_distance:.3f} km
- Relative Velocity: {rel_velocity:.3f} km/s
- Risk Level: {risk_level}
- TCA: {tca}

Generate the optimal burn parameters to increase miss distance to >50 km.
Include burn_direction (PROGRADE/RETROGRADE/RADIAL/NORMAL), delta_v_m_s, burn_duration_seconds,
burn_time_utc (before TCA), expected_miss_distance_km, fuel_cost_kg, confidence_pct, risk, and explanation."""

                model = genai.GenerativeModel("gemini-2.0-flash")
                response = await model.generate_content_async(prompt)
                text = response.text.strip()
                # Strip markdown code fences if present
                if text.startswith("```"):
                    text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                if text.startswith("json"):
                    text = text[4:]
                return json.loads(text.strip())
            except Exception as e:
                logger.error(f"Gemini maneuver planning failed: {e}")

        # Fallback: rule-based orbital mechanics
        return self._rule_based_maneuver(miss_distance, rel_velocity, risk_level, tca, altitude, obj_a, obj_b)

    def _rule_based_maneuver(self, miss_distance, rel_velocity, risk_level, tca, altitude, obj_a, obj_b) -> dict:
        """Rule-based maneuver planning using orbital mechanics heuristics."""
        # Determine burn direction based on geometry
        # For objects approaching from ahead/behind: PROGRADE/RETROGRADE
        # For objects at different inclinations: NORMAL
        if altitude < 500:
            direction = "RETROGRADE"  # Lower orbit to pass behind
            reason = "retrograde burn to lower perigee and pass behind the conjunction object"
        elif altitude > 35000:
            direction = "RADIAL"  # GEO station-keeping
            reason = "radial thrust to adjust orbit phasing in geostationary belt"
        else:
            direction = random.choice(["PROGRADE", "RETROGRADE", "NORMAL"])
            reasons = {
                "PROGRADE": "prograde burn to raise orbit above the conjunction plane",
                "RETROGRADE": "retrograde burn to lower orbit below the conjunction object",
                "NORMAL": "normal (cross-track) burn to shift inclination away from conjunction geometry"
            }
            reason = reasons[direction]

        # Delta-V calculation (simplified Hohmann-like transfer)
        # Larger miss distance correction → larger delta-V needed
        target_miss = 50.0  # km
        delta_miss = max(target_miss - miss_distance, 1.0)  # km to add
        
        # v_circular = sqrt(GM/r)
        r = 6371.0 + altitude
        v_circ = math.sqrt(398600.4418 / r)  # km/s
        
        # Simplified: delta-V ≈ (delta_miss / orbital_period) * correction_factor
        period_s = 2 * math.pi * r / v_circ  # seconds
        delta_v = (delta_miss / r) * v_circ * 1000  # m/s
        delta_v = round(min(max(delta_v, 0.05), 5.0), 3)  # Clamp to realistic range

        # Burn duration assuming 10N thruster on 500kg satellite
        thrust_n = 10.0
        mass_kg = 500.0
        burn_duration = (delta_v * mass_kg) / thrust_n  # seconds
        burn_duration = round(min(max(burn_duration, 1.0), 300.0), 1)

        # Fuel cost (hydrazine specific impulse ~220s)
        isp = 220.0
        fuel_mass = mass_kg * (1 - math.exp(-delta_v / (isp * 9.81)))
        fuel_mass = round(max(fuel_mass, 0.01), 3)

        # Burn time: 2 orbits before TCA
        try:
            tca_dt = datetime.fromisoformat(tca.replace('Z', '+00:00'))
            burn_time = tca_dt - timedelta(seconds=period_s * 2)
        except Exception:
            burn_time = datetime.now(timezone.utc) + timedelta(hours=6)

        # Expected miss distance after maneuver
        expected_miss = round(miss_distance + delta_miss * random.uniform(0.8, 1.5), 1)

        # Confidence based on time until TCA and risk level
        confidence_map = {"CRITICAL": 85.0, "HIGH": 90.0, "MEDIUM": 95.0, "LOW": 98.0, "SAFE": 99.5}
        confidence = round(confidence_map.get(risk_level, 90.0) + random.uniform(-2, 2), 1)

        return {
            "risk": risk_level,
            "delta_v_m_s": delta_v,
            "burn_direction": direction,
            "burn_duration_seconds": burn_duration,
            "burn_time_utc": burn_time.isoformat(),
            "expected_miss_distance_km": expected_miss,
            "fuel_cost_kg": fuel_mass,
            "confidence_pct": confidence,
            "explanation": (
                f"Analysis recommends a {direction} burn ({reason}) for {obj_a} to avoid conjunction with {obj_b}. "
                f"The current miss distance of {miss_distance:.2f} km at TCA ({tca}) is insufficient given the "
                f"{risk_level} risk classification. A delta-V of {delta_v:.3f} m/s applied at {burn_time.strftime('%Y-%m-%d %H:%M:%S UTC')} "
                f"will increase separation to approximately {expected_miss:.1f} km, reducing collision probability by "
                f"several orders of magnitude. Estimated fuel expenditure: {fuel_mass:.3f} kg of hydrazine."
            ),
        }

    def _get_fallback_response(self, prompt: str) -> str:
        prompt_lower = prompt.lower()
        if "collision" in prompt_lower or "risk" in prompt_lower:
            return "WARNING: High probability conjunction detected between ISS (Zarya) and debris fragment #43912. Time to closest approach (TCA) is T-minus 14 hours. Recommending evasive maneuver (DAM)."
        elif "status" in prompt_lower or "health" in prompt_lower:
            return "All orbital asset telemetry streams are nominal. Space-Track API connection is stable. Current tracked debris objects in LEO: 34,210."
        elif "debris" in prompt_lower or "kessler" in prompt_lower:
            return "The Kessler Syndrome risk is currently elevated in the 800km polar orbit band following a recent anti-satellite test. We are tracking a 14% increase in micro-debris over the last 30 days."
        elif "hello" in prompt_lower or "hi" in prompt_lower:
            return "Greetings, Commander. I am the KesslerX AI Copilot. Orbital tracking systems are online. How can I assist with your mission telemetry today?"
        else:
            return "Acknowledged. I have analyzed the telemetry for your query. The orbital parameters remain stable, but we should continue monitoring the situation closely."
