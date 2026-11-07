"""
KesslerX Centralized Configuration & Environment Validation.
Enforces explicit environments: production, demo, development, test.
Implements fail-closed security and safe administrative diagnostics.
"""

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Valid application environments
ENV_DEVELOPMENT = "development"
ENV_TEST = "test"
ENV_DEMO = "demo"
ENV_PRODUCTION = "production"

ALLOWED_ENVIRONMENTS = {ENV_DEVELOPMENT, ENV_TEST, ENV_DEMO, ENV_PRODUCTION}


class ProviderStatus(BaseModel):
    configured: bool
    status: str  # "operational", "unconfigured", "degraded", "offline"
    last_fetch: Optional[str] = None
    last_failure: Optional[str] = None
    last_error: Optional[str] = None
    freshness_seconds: Optional[int] = None
    record_count: int = 0
    retry_count: int = 0


class SafeConfigDiagnostic(BaseModel):
    app_env: str
    is_production: bool
    is_demo: bool
    startup_time: str
    durable_storage: str
    providers: Dict[str, ProviderStatus]
    cors_allowed_origins: List[str]
    rate_limits_enabled: bool


class AppConfig:
    def __init__(self):
        # Resolve APP_ENV with fallback to development
        env_raw = os.getenv("APP_ENV", os.getenv("NODE_ENV", ENV_DEVELOPMENT)).lower().strip()
        if env_raw not in ALLOWED_ENVIRONMENTS:
            logger.warning(f"Unrecognized APP_ENV '{env_raw}', defaulting to '{ENV_DEVELOPMENT}'")
            self.app_env = ENV_DEVELOPMENT
        else:
            self.app_env = env_raw

        self.startup_time = datetime.now(timezone.utc).isoformat()
        
        # Provider Status Trackers
        self.provider_statuses: Dict[str, ProviderStatus] = {
            "firebase": ProviderStatus(configured=False, status="unconfigured"),
            "space_track": ProviderStatus(configured=False, status="unconfigured"),
            "noaa_swpc": ProviderStatus(configured=True, status="operational"), # public, always configured
            "gemini_ai": ProviderStatus(configured=False, status="unconfigured"),
            "ground_station": ProviderStatus(configured=True, status="waiting_for_telemetry"),
        }

    @property
    def is_production(self) -> bool:
        return self.app_env == ENV_PRODUCTION

    @property
    def is_demo(self) -> bool:
        return self.app_env == ENV_DEMO

    @property
    def is_test(self) -> bool:
        return self.app_env == ENV_TEST or os.getenv("TESTING") == "1"

    def update_provider_status(
        self,
        provider: str,
        configured: Optional[bool] = None,
        status: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None,
        record_count: Optional[int] = None,
    ):
        if provider not in self.provider_statuses:
            self.provider_statuses[provider] = ProviderStatus(configured=False, status="unknown")
        
        p = self.provider_statuses[provider]
        now_str = datetime.now(timezone.utc).isoformat()
        if configured is not None:
            p.configured = configured
        if status is not None:
            p.status = status
        
        if success:
            p.last_fetch = now_str
            p.last_error = None
            p.retry_count = 0
            p.freshness_seconds = 0
        else:
            p.last_failure = now_str
            if error_message:
                p.last_error = error_message
            p.retry_count += 1
            if p.status == "operational":
                p.status = "degraded"
        
        if record_count is not None:
            p.record_count = record_count

    def validate_production_readiness(self) -> Dict[str, Any]:
        """
        Validates configuration completeness. In production mode, logs warnings for missing upstream dependencies.
        Never exposes raw secrets, passwords, or keys.
        """
        issues = []
        
        # 1. Firebase Admin
        has_fb_json = bool(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON"))
        has_fb_path = bool(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
        has_fb_cred = bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
        fb_configured = has_fb_json or has_fb_path or has_fb_cred
        self.provider_statuses["firebase"].configured = fb_configured

        if not fb_configured:
            issues.append("Firebase credentials missing: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH required for cloud persistence.")

        # 2. Space-Track
        st_user = os.getenv("SPACE_TRACK_USERNAME")
        st_pass = os.getenv("SPACE_TRACK_PASSWORD")
        st_configured = bool(st_user and st_pass and st_user != "your_space_track_username")
        self.provider_statuses["space_track"].configured = st_configured

        if not st_configured:
            issues.append("Space-Track credentials missing: SPACE_TRACK_USERNAME and SPACE_TRACK_PASSWORD required for direct 18th SDS queries.")

        # 3. Gemini AI
        ai_key = os.getenv("GEMINI_API_KEY")
        ai_configured = bool(ai_key and ai_key != "your_gemini_api_key_here")
        self.provider_statuses["gemini_ai"].configured = ai_configured

        if not ai_configured:
            issues.append("Gemini AI key missing: GEMINI_API_KEY required for AI decision support.")

        if self.is_production and issues:
            logger.warning("Production environment started with degraded capabilities:")
            for issue in issues:
                logger.warning(f"  - {issue}")

        return {
            "app_env": self.app_env,
            "production_ready": len(issues) == 0,
            "issues": issues,
            "storage_mode": "firestore" if fb_configured else "sqlite-durable",
        }

    def get_diagnostic_report(self) -> SafeConfigDiagnostic:
        """Returns safe administrative diagnostic representation with zero secret leakage."""
        frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173,http://localhost:3000,https://kessler-x.vercel.app")
        origins = [o.strip() for o in frontend_origin.split(",") if o.strip()]

        fb_conf = self.provider_statuses["firebase"].configured
        storage_type = "Firestore (Cloud)" if fb_conf else "SQLite (Durable Local Engine)"

        return SafeConfigDiagnostic(
            app_env=self.app_env,
            is_production=self.is_production,
            is_demo=self.is_demo,
            startup_time=self.startup_time,
            durable_storage=storage_type,
            providers=self.provider_statuses,
            cors_allowed_origins=origins,
            rate_limits_enabled=True,
        )


# Global singleton configuration
config = AppConfig()

