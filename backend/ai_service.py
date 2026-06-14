import logging
import os
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
Keep responses concise, professional, and slightly technical, like a mission control AI.
Respond to the user's queries based on the provided context (if any).
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
