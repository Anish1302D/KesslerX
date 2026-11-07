import asyncio
import pytest
from ai_service import AIService

@pytest.mark.anyio
async def test_key():
    service = AIService()
    response = await service.generate_response('Hello! This is a test. Please reply with "Key is working."')
    assert response is not None
    assert response.answer != ""

if __name__ == "__main__":
    asyncio.run(test_key())


