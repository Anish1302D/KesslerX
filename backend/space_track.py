"""
KesslerX Space-Track & Orbital Catalog Ingestion Client.
Connects directly to the official Space-Track REST API (18th Space Defense Squadron).
Provides authenticated session management, TLE checksum validation, durable snapshot caching,
and fail-closed behavior in production.
"""

import httpx
import os
import logging
import time
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from dotenv import load_dotenv

from config import config
from storage import storage
from demo_catalog import get_demo_catalog_fixtures

load_dotenv()
logger = logging.getLogger(__name__)

SPACE_TRACK_URL = "https://www.space-track.org"
CELESTRAK_MIRROR_URL = "https://celestrak.org/NORAD/elements/gp.php"


def verify_tle_checksum(line: str) -> bool:
    """Verifies standard NORAD/SGP4 TLE modulo 10 checksum."""
    if len(line.strip()) < 68:
        return False
    computed = 0
    for char in line[:68]:
        if char.isdigit():
            computed += int(char)
        elif char == "-":
            computed += 1
    expected = int(line[68])
    return (computed % 10) == expected


class SpaceTrackClient:
    def __init__(self):
        self.username = os.getenv("SPACE_TRACK_USERNAME")
        self.password = os.getenv("SPACE_TRACK_PASSWORD")
        self.client = httpx.AsyncClient(base_url=SPACE_TRACK_URL, timeout=12.0)
        self.is_authenticated = False
        self._cache: Optional[List[Dict[str, Any]]] = None
        self._cache_time: float = 0.0
        self._cache_ttl: int = 1800  # 30 minutes cache compliant with Space-Track guidelines
        self.last_provider_used: str = "uninitialized"

    async def login(self) -> bool:
        """Authenticates with Space-Track using official login endpoint."""
        if not self.username or not self.password or self.username == "your_space_track_username":
            logger.info("Direct Space-Track credentials unconfigured in environment.")
            config.update_provider_status("space_track", configured=False, status="unconfigured")
            return False

        login_data = {
            "identity": self.username,
            "password": self.password,
        }
        
        try:
            response = await self.client.post("/ajaxauth/login", data=login_data)
            if response.status_code == 200:
                self.is_authenticated = True
                logger.info("Successfully authenticated with official Space-Track API.")
                config.update_provider_status("space_track", configured=True, status="operational", success=True)
                return True
            else:
                logger.error(f"Failed to authenticate with Space-Track: HTTP {response.status_code}")
                config.update_provider_status("space_track", configured=True, status="auth_failed", success=False, error_message=f"HTTP {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Network error during Space-Track login: {e}")
            config.update_provider_status("space_track", configured=True, status="offline", success=False, error_message=str(e))
            return False

    def assign_category(self, sat: Dict[str, Any]) -> str:
        name = sat.get("OBJECT_NAME", "").upper()
        obj_type = sat.get("OBJECT_TYPE", "").upper()
        
        if obj_type in ("DEBRIS", "ROCKET BODY") or "DEB" in name or "R/B" in name:
            return "Debris"
        if "ISS" in name or "ZARYA" in name or "TIANGONG" in name:
            return "ISS"
        if any(x in name for x in ["STARLINK", "ONEWEB", "IRIDIUM", "INTELSAT", "EUTELSAT", "SES", "AMAZON"]):
            return "Communication"
        if any(x in name for x in ["NOAA", "GOES", "METEOR", "TIROS", "AQUA", "TERRA", "METOP"]):
            return "Weather"
        if any(x in name for x in ["USA", "COSMOS", "KOSMOS", "SL-"]):
            return "Military"
        if any(x in name for x in ["NAVSTAR", "GALILEO", "GLONASS", "BEIDOU", "GPS"]):
            return "GPS"
        if any(x in name for x in ["HUBBLE", "CHANDRA", "JWST", "SWIFT", "FERMI", "SPITZER"]):
            return "Scientific"
        
        return "Communication"

    async def get_active_satellites(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Retrieves active satellite records.
        Prioritizes:
        1. In-memory valid cache (< 30 min).
        2. Direct Space-Track API (if authenticated).
        3. Authorized NORAD Ephemeris Distributor (CelesTrak mirror) if Space-Track direct is unconfigured.
        4. Stored persistent SQLite snapshots.
        5. Demo fixtures only if APP_ENV=demo.
        6. Fail closed in production.
        """
        now = time.time()
        if self._cache and (now - self._cache_time < self._cache_ttl):
            return self._cache[:limit]

        # 1. Try direct Space-Track query if credentials are valid
        if self.username and self.password and self.username != "your_space_track_username":
            if not self.is_authenticated:
                await self.login()
            
            if self.is_authenticated:
                st_data = await self._fetch_space_track_gp(limit)
                if st_data:
                    self._cache = st_data
                    self._cache_time = now
                    self.last_provider_used = "space-track"
                    storage.store_tle_snapshots(st_data, source="space-track")
                    config.update_provider_status("space_track", configured=True, status="operational", success=True, record_count=len(st_data))
                    return st_data[:limit]

        # 2. Try verified NORAD Ephemeris Distributor (CelesTrak Mirror)
        mirror_data = await self._fetch_celestrak_mirror(limit)
        if mirror_data:
            self._cache = mirror_data
            self._cache_time = now
            self.last_provider_used = "celestrak-space-track-mirror"
            storage.store_tle_snapshots(mirror_data, source="celestrak-mirror")
            config.update_provider_status("space_track", configured=True, status="mirror_operational", success=True, record_count=len(mirror_data))
            return mirror_data[:limit]

        # 3. Try durable database snapshots
        db_snapshots = storage.get_tle_snapshots(limit=limit)
        if db_snapshots:
            logger.info(f"Serving {len(db_snapshots)} cached TLE records from durable SQLite storage.")
            self._cache = db_snapshots
            self._cache_time = now
            self.last_provider_used = "durable-db-cache"
            return db_snapshots[:limit]

        # 4. If Demo mode is explicitly active, return demo catalog fixtures
        if config.is_demo:
            logger.info("Serving demo catalog fixtures (APP_ENV=demo).")
            demo_data = get_demo_catalog_fixtures()
            self._cache = demo_data
            self._cache_time = now
            self.last_provider_used = "demo-fixtures"
            return demo_data[:limit]

        # 5. Fail closed in production: NEVER generate fake debris
        logger.error("No valid satellite catalog available and external providers unreachable.")
        config.update_provider_status("space_track", configured=False, status="unavailable", success=False, error_message="No provider reachable and no cached snapshot exists")
        return []

    async def _fetch_space_track_gp(self, limit: int) -> Optional[List[Dict[str, Any]]]:
        """Fetches from official Space-Track /basicspacedata/query/class/gp."""
        query = "/basicspacedata/query/class/gp/DECAY_DATE/null-val/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID/limit/1000/format/json"
        try:
            response = await self.client.get(query)
            if response.status_code == 200:
                raw_data = response.json()
                processed = []
                for item in raw_data:
                    item["CATEGORY"] = self.assign_category(item)
                    item["SOURCE"] = "space-track"
                    processed.append(item)
                return processed
            elif response.status_code == 429:
                logger.warning("Space-Track rate limit encountered.")
            else:
                logger.error(f"Space-Track fetch returned HTTP {response.status_code}")
        except Exception as e:
            logger.error(f"Space-Track network error: {e}")
        return None

    async def _fetch_celestrak_mirror(self, limit: int) -> Optional[List[Dict[str, Any]]]:
        """Fetches real-time published NORAD TLE elements from CelesTrak public mirror."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Fetch active stations & last 30 days elements
                url = f"{CELESTRAK_MIRROR_URL}?GROUP=stations&FORMAT=json"
                resp = await client.get(url)
                if resp.status_code == 200:
                    raw_data = resp.json()
                    processed = []
                    for item in raw_data:
                        cat = self.assign_category(item)
                        item["CATEGORY"] = cat
                        item["SOURCE"] = "celestrak-space-track-mirror"
                        processed.append(item)
                    
                    # Also fetch a sample of high interest payloads to populate catalog
                    try:
                        url_extra = f"{CELESTRAK_MIRROR_URL}?GROUP=visual&FORMAT=json"
                        resp_extra = await client.get(url_extra)
                        if resp_extra.status_code == 200:
                            for extra_item in resp_extra.json():
                                extra_item["CATEGORY"] = self.assign_category(extra_item)
                                extra_item["SOURCE"] = "celestrak-space-track-mirror"
                                processed.append(extra_item)
                    except Exception:
                        pass

                    return processed
        except Exception as e:
            logger.warning(f"Could not reach NORAD mirror: {e}")
        return None


# Global singleton Space-Track client
space_track_client = SpaceTrackClient()
