import httpx
import os
import logging
import time
import asyncio
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

SPACE_TRACK_URL = "https://www.space-track.org"

class SpaceTrackClient:
    def __init__(self):
        self.username = os.getenv("SPACE_TRACK_USERNAME")
        self.password = os.getenv("SPACE_TRACK_PASSWORD")
        self.client = httpx.AsyncClient(base_url=SPACE_TRACK_URL, timeout=10.0)
        self.is_authenticated = False
        self._cache = None
        self._cache_time = 0
        self._cache_ttl = 600 # 10 minutes

    async def login(self):
        if not self.username or not self.password or self.username == "your_space_track_username":
            logger.warning("Space-Track credentials missing. Will use mock data.")
            return False

        login_data = {
            'identity': self.username,
            'password': self.password,
        }
        
        try:
            response = await self.client.post("/ajaxauth/login", data=login_data)
            if response.status_code == 200:
                self.is_authenticated = True
                logger.info("Successfully authenticated with Space-Track API.")
                return True
            else:
                logger.error(f"Failed to authenticate with Space-Track: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error during Space-Track login: {e}")
            return False

    async def get_active_satellites(self, limit=100):
        # Return cached data if valid
        if self._cache and (time.time() - self._cache_time < self._cache_ttl):
            logger.info("Returning cached satellite data")
            return self._cache[:limit] if len(self._cache) > limit else self._cache

        if not self.is_authenticated:
            success = await self.login()
            if not success:
                return self.get_mock_data()

        # Query active satellites with valid TLEs
        query = f"/basicspacedata/query/class/gp/DECAY_DATE/null-val/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID/limit/1000/format/json"
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = await self.client.get(query)
                if response.status_code == 200:
                    data = response.json()
                    self._cache = data
                    self._cache_time = time.time()
                    return data[:limit] if len(data) > limit else data
                elif response.status_code == 429: # Rate limited
                    wait_time = int(response.headers.get("Retry-After", 5))
                    logger.warning(f"Rate limited by Space-Track. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Failed to fetch data: {response.status_code}")
                    break
            except Exception as e:
                logger.error(f"Error fetching data on attempt {attempt+1}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
        
        # Fallback to cache or mock data
        if self._cache:
            return self._cache[:limit] if len(self._cache) > limit else self._cache
        return self.get_mock_data()

    def get_mock_data(self):
        return [
            {
                "NORAD_CAT_ID": 25544,
                "OBJECT_NAME": "ISS (ZARYA)",
                "TLE_LINE1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997",
                "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261",
                "OBJECT_TYPE": "PAYLOAD"
            },
            {
                "NORAD_CAT_ID": 44713,
                "OBJECT_NAME": "STARLINK-1007",
                "TLE_LINE1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
                "TLE_LINE2": "2 44713  53.0500 123.4567 0001234 123.4567 123.4567 15.00000000123451",
                "OBJECT_TYPE": "PAYLOAD"
            }
        ]
