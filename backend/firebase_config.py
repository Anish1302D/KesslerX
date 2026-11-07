"""
KesslerX Firebase Configuration
Initializes Firebase Admin SDK for Firestore persistence.
Bridges to centralized storage and configuration status.
"""

import os
import json
import logging
from config import config

logger = logging.getLogger(__name__)

_firebase_app = None
_firestore_client = None
_firebase_available = False


def _resolve_cred_path(path: str) -> str:
    """Resolves credential path relative to backend folder or absolute path."""
    if not path:
        return ""
    if os.path.isabs(path) and os.path.exists(path):
        return path
    # Try current directory
    if os.path.exists(path):
        return path
    # Try relative to backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.join(backend_dir, path)
    if os.path.exists(candidate):
        return candidate
    candidate_basename = os.path.join(backend_dir, os.path.basename(path))
    if os.path.exists(candidate_basename):
        return candidate_basename
    return path


def init_firebase():
    """Initialize Firebase Admin SDK. Safe to call multiple times."""
    global _firebase_app, _firestore_client, _firebase_available

    if _firebase_app is not None:
        return _firebase_available

    if os.getenv("TESTING") == "1" or os.getenv("FIREBASE_DISABLED") == "1":
        _firebase_available = False
        _firebase_app = "disabled"
        config.update_provider_status("firebase", configured=False, status="disabled_for_testing")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        from storage import storage

        cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        raw_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        cred_path = _resolve_cred_path(raw_path) if raw_path else None
        project_id = os.getenv("FIREBASE_PROJECT_ID", "keerx-25b72")
        
        if cred_json:
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
            _firebase_app = firebase_admin.initialize_app(cred)
            logger.info("Firebase initialized from FIREBASE_SERVICE_ACCOUNT_JSON env var")
        elif cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            _firebase_app = firebase_admin.initialize_app(cred)
            logger.info(f"Firebase initialized with service account: {cred_path}")
        elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            _firebase_app = firebase_admin.initialize_app()
            logger.info("Firebase initialized with GOOGLE_APPLICATION_CREDENTIALS")
        elif project_id:
            _firebase_app = firebase_admin.initialize_app(options={
                'projectId': project_id,
            })
            logger.info(f"Firebase initialized with project ID: {project_id}")
        else:
            logger.warning(
                "No Firebase credentials found. Using durable SQLite storage engine. "
                "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH to enable cloud persistence."
            )
            _firebase_available = False
            _firebase_app = "disabled"
            config.update_provider_status("firebase", configured=False, status="unconfigured")
            return False

        _firestore_client = firestore.client()
        # Verify database exists and is reachable
        try:
            _ = _firestore_client.collection("users").limit(1).get()
            _firebase_available = True
            storage.attach_firestore(_firestore_client)
            config.update_provider_status("firebase", configured=True, status="operational", success=True)
            logger.info("Firestore client connected and operational")
            return True
        except Exception as db_err:
            logger.warning(f"Firestore verification failed: {db_err}. Bridging to durable SQLite storage.")
            _firebase_available = False
            _firestore_client = None
            config.update_provider_status("firebase", configured=False, status="degraded", success=False, error_message=str(db_err))
            return False

    except Exception as e:
        logger.warning(f"Firebase initialization failed: {e}. Bridging to durable SQLite storage.")
        _firebase_available = False
        _firebase_app = "disabled"
        config.update_provider_status("firebase", configured=False, status="degraded", success=False, error_message=str(e))
        return False


def get_firestore():
    """Get Firestore client. Returns None if Firebase is not available."""
    if not _firebase_available:
        return None
    return _firestore_client


def is_firebase_available() -> bool:
    return _firebase_available
