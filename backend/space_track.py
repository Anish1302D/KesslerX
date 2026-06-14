import httpx
import os
import logging
import time
import asyncio
from dotenv import load_dotenv
import random
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

    def assign_category(self, sat):
        name = sat.get("OBJECT_NAME", "").upper()
        obj_type = sat.get("OBJECT_TYPE", "").upper()
        
        if obj_type == "DEBRIS" or obj_type == "ROCKET BODY" or "DEB" in name:
            return "Debris"
        if "ISS" in name or "ZARYA" in name:
            return "ISS"
        if any(x in name for x in ["STARLINK", "ONEWEB", "IRIDIUM", "INTELSAT", "EUTELSAT"]):
            return "Communication"
        if any(x in name for x in ["NOAA", "GOES", "METEOR", "TIROS", "AQUA", "TERRA"]):
            return "Weather"
        if any(x in name for x in ["USA ", "COSMOS", "KOSMOS", "SL-"]):
            return "Military"
        if any(x in name for x in ["NAVSTAR", "GALILEO", "GLONASS", "BEIDOU"]):
            return "GPS"
        if any(x in name for x in ["HUBBLE", "CHANDRA", "JWST", "SWIFT"]):
            return "Scientific"
        
        return "Communication" # Default fallback

    def _ensure_quotas(self, data):
        result = []
        counts = {
            "Debris": 0, "Communication": 0, "ISS": 0, "Weather": 0, "Military": 0, "GPS": 0, "Scientific": 0
        }
        
        for sat in data:
            cat = self.assign_category(sat)
            sat["CATEGORY"] = cat
            result.append(sat)
            if cat in counts:
                counts[cat] += 1
                
        # If quotas are not met, inject mock data
        mock_data = self.get_full_mock_data()
        for mock_sat in mock_data:
            cat = self.assign_category(mock_sat)
            if counts.get(cat, 0) < (100 if cat == "Debris" else 4):
                mock_sat["CATEGORY"] = cat
                result.append(mock_sat)
                if cat in counts:
                    counts[cat] += 1
                
        # Filter strictly 100 debris and keep all payloads
        final_result = []
        final_counts = {"Debris": 0}
        for sat in result:
            cat = sat.get("CATEGORY")
            if cat == "Debris":
                if final_counts["Debris"] < 100:
                    final_result.append(sat)
                    final_counts["Debris"] += 1
            else:
                final_result.append(sat)
                
        return final_result

    async def get_active_satellites(self, limit=1000):
        # Return cached data if valid
        if self._cache and (time.time() - self._cache_time < self._cache_ttl):
            logger.info("Returning cached satellite data")
            return self._ensure_quotas(self._cache)[:limit]

        if not self.is_authenticated:
            success = await self.login()
            if not success:
                return self._ensure_quotas(self.get_full_mock_data())[:limit]

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
                    return self._ensure_quotas(data)[:limit]
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
            return self._ensure_quotas(self._cache)[:limit]
        return self._ensure_quotas(self.get_full_mock_data())[:limit]

    def get_full_mock_data(self):
        mocks = [
            # ISS
            {"NORAD_CAT_ID": 25544, "OBJECT_NAME": "ISS (ZARYA)", "TLE_LINE1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997", "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 25545, "OBJECT_NAME": "ISS (NODE 2)", "TLE_LINE1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997", "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 25546, "OBJECT_NAME": "ISS (NODE 3)", "TLE_LINE1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997", "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 25547, "OBJECT_NAME": "ISS (COLUMBUS)", "TLE_LINE1": "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997", "TLE_LINE2": "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452261", "OBJECT_TYPE": "PAYLOAD"},
            # Comm
            {"NORAD_CAT_ID": 44713, "OBJECT_NAME": "STARLINK-1007", "TLE_LINE1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 44713  53.0500 123.4567 0001234 123.4567 123.4567 15.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 44714, "OBJECT_NAME": "ONEWEB-0012", "TLE_LINE1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 44713  87.0500 123.4567 0001234 123.4567 123.4567 13.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 44715, "OBJECT_NAME": "IRIDIUM-101", "TLE_LINE1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 44713  86.4000 123.4567 0001234 123.4567 123.4567 14.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 44716, "OBJECT_NAME": "STARLINK-1008", "TLE_LINE1": "1 44713U 19074A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 44713  53.0500 143.4567 0001234 123.4567 123.4567 15.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            # Weather
            {"NORAD_CAT_ID": 43013, "OBJECT_NAME": "NOAA-20", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 43014, "OBJECT_NAME": "GOES-16", "TLE_LINE1": "1 41866U 16071A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 41866   0.1000 123.4567 0001234 123.4567 123.4567  1.00270000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 43015, "OBJECT_NAME": "METEOR-M2", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 43016, "OBJECT_NAME": "AQUA", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.2000 123.4567 0001234 123.4567 123.4567 14.50000000123451", "OBJECT_TYPE": "PAYLOAD"},
            # Military
            {"NORAD_CAT_ID": 30001, "OBJECT_NAME": "USA-200", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 30002, "OBJECT_NAME": "COSMOS-2500", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 30003, "OBJECT_NAME": "KOSMOS-123", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  82.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 30004, "OBJECT_NAME": "USA-201", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  98.7000 123.4567 0001234 123.4567 123.4567 14.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            # GPS
            {"NORAD_CAT_ID": 20001, "OBJECT_NAME": "NAVSTAR 70", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  55.0000 123.4567 0001234 123.4567 123.4567  2.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 20002, "OBJECT_NAME": "GALILEO 22", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  56.0000 123.4567 0001234 123.4567 123.4567  1.70000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 20003, "OBJECT_NAME": "GLONASS-M", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  64.8000 123.4567 0001234 123.4567 123.4567  2.10000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 20004, "OBJECT_NAME": "BEIDOU-3", "TLE_LINE1": "1 43013U 17073A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 43013  55.0000 123.4567 0001234 123.4567 123.4567  2.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            # Scientific
            {"NORAD_CAT_ID": 10001, "OBJECT_NAME": "HUBBLE", "TLE_LINE1": "1 20580U 90037B   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 20580  28.5000 123.4567 0001234 123.4567 123.4567 15.00000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 10002, "OBJECT_NAME": "CHANDRA", "TLE_LINE1": "1 25867U 99040B   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 25867  28.5000 123.4567 0001234 123.4567 123.4567  0.30000000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 10003, "OBJECT_NAME": "JWST", "TLE_LINE1": "1 50463U 21130A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 50463   0.1000 123.4567 0001234 123.4567 123.4567  0.00200000123451", "OBJECT_TYPE": "PAYLOAD"},
            {"NORAD_CAT_ID": 10004, "OBJECT_NAME": "SWIFT", "TLE_LINE1": "1 28485U 04047A   24128.12345678  .00012345  00000-0  12345-3 0  9991", "TLE_LINE2": "2 28485  20.5000 123.4567 0001234 123.4567 123.4567 15.00000000123451", "OBJECT_TYPE": "PAYLOAD"}
        ]
        
        for i in range(100):
            inclination = f"{random.uniform(0, 180):07.4f}"
            raan = f"{random.uniform(0, 360):08.4f}"
            mean_anomaly = f"{random.uniform(0, 360):08.4f}"
            mean_motion = f"{random.uniform(12.0, 16.0):011.8f}"
            
            mocks.append({
                "NORAD_CAT_ID": 90000 + i,
                "OBJECT_NAME": f"DEBRIS-{90000 + i}",
                "TLE_LINE1": f"1 {90000+i}U 09005A   24128.12345678  .00012345  00000-0  12345-3 0  9991",
                "TLE_LINE2": f"2 {90000+i} {inclination} {raan} 0001234 123.4567 {mean_anomaly} {mean_motion}",
                "OBJECT_TYPE": "DEBRIS"
            })
            
        return mocks
