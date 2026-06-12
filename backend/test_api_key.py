import asyncio
from ai_service import MockAIService

async def test_key():
    try:
        service = MockAIService()
        print('Service initialized. Sending test prompt...')
        response = await service.generate_response('Hello! This is a test. Please reply with "Key is working."')
        print('Response from Gemini:', response)
    except Exception as e:
        print('Error:', e)

asyncio.run(test_key())
