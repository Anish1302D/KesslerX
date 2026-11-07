"""
KesslerX Durable Persistent Storage Engine.
Supports Firestore (Cloud) and SQLite (Durable Local Engine).
Eliminates in-memory data loss in free-tier and offline environments.
Provides ACID transactions, optimistic concurrency, idempotency keys, and query limits.
"""

import os
import json
import sqlite3
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from config import config, ENV_PRODUCTION, ENV_DEMO

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("SQLITE_DB_PATH", os.path.join(os.path.dirname(__file__), "kesslerx_durable.db"))


class StorageEngine:
    def __init__(self):
        self.firestore_client = None
        self.is_firestore_active = False
        self._init_sqlite()

    def _get_sqlite_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_sqlite(self):
        """Creates durable SQLite schema with indexes and constraints."""
        try:
            with self._get_sqlite_conn() as conn:
                cursor = conn.cursor()
                
                # Users & Roles
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT,
                        role TEXT NOT NULL,
                        organization_id TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)

                # Organizations
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS organizations (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        tier TEXT NOT NULL DEFAULT 'standard',
                        created_at TEXT NOT NULL
                    )
                """)

                # Conjunction Events
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS events (
                        id TEXT PRIMARY KEY,
                        satellite TEXT NOT NULL,
                        object TEXT NOT NULL,
                        tca TEXT NOT NULL,
                        miss_distance REAL NOT NULL,
                        collision_probability REAL NOT NULL,
                        risk TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'new',
                        version INTEGER NOT NULL DEFAULT 1,
                        current_owner_id TEXT,
                        source TEXT NOT NULL,
                        mode TEXT NOT NULL,
                        raw_payload TEXT,
                        idempotency_key TEXT UNIQUE,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)

                # Handoffs (Transfer of Responsibility)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS handoffs (
                        id TEXT PRIMARY KEY,
                        event_id TEXT NOT NULL,
                        from_user_id TEXT NOT NULL,
                        to_user_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        priority TEXT NOT NULL,
                        reason TEXT NOT NULL,
                        next_action TEXT NOT NULL,
                        deadline TEXT,
                        message TEXT,
                        evidence_snapshot TEXT,
                        version INTEGER NOT NULL DEFAULT 1,
                        idempotency_key TEXT UNIQUE,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (event_id) REFERENCES events (id)
                    )
                """)

                # Alerts
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS alerts (
                        id TEXT PRIMARY KEY,
                        event_id TEXT,
                        severity TEXT NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        type TEXT NOT NULL,
                        acknowledged INTEGER NOT NULL DEFAULT 0,
                        acknowledged_by TEXT,
                        acknowledged_at TEXT,
                        created_at TEXT NOT NULL
                    )
                """)

                # TLE & Ephemeris Snapshots
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS tle_snapshots (
                        norad_id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        line1 TEXT NOT NULL,
                        line2 TEXT NOT NULL,
                        epoch TEXT NOT NULL,
                        category TEXT NOT NULL,
                        source TEXT NOT NULL,
                        fetched_at TEXT NOT NULL
                    )
                """)

                # NOAA Space Weather Records
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS space_weather_records (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        observed_at TEXT NOT NULL,
                        solar_flux REAL,
                        kp_index REAL,
                        solar_wind_speed REAL,
                        bz_gsm REAL,
                        proton_density REAL,
                        atmospheric_drag_mult REAL,
                        source TEXT NOT NULL,
                        raw_json TEXT,
                        created_at TEXT NOT NULL
                    )
                """)

                # Audit Log (Immutable append-only)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        action TEXT NOT NULL,
                        resource_type TEXT NOT NULL,
                        resource_id TEXT NOT NULL,
                        details TEXT,
                        ip_address TEXT,
                        timestamp TEXT NOT NULL
                    )
                """)

                # Reports & Evidence Packages
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS reports (
                        id TEXT PRIMARY KEY,
                        organization_id TEXT NOT NULL,
                        generated_by TEXT NOT NULL,
                        report_type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        provenance TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                """)

                # Provider Ingestion Fetch Logs
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS provider_fetch_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        provider TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        status_code INTEGER,
                        record_count INTEGER,
                        success INTEGER NOT NULL,
                        error_message TEXT,
                        fetched_at TEXT NOT NULL
                    )
                """)

                # Ground Station Hardware Telemetry
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS ground_station_telemetry (
                        packet_id INTEGER PRIMARY KEY,
                        station_id TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        latitude REAL NOT NULL,
                        longitude REAL NOT NULL,
                        altitude_m REAL NOT NULL,
                        temperature_c REAL NOT NULL,
                        battery_pct REAL NOT NULL,
                        signal_dbm REAL NOT NULL,
                        velocity_m_s REAL NOT NULL,
                        heading_deg REAL NOT NULL,
                        pitch_deg REAL NOT NULL,
                        roll_deg REAL NOT NULL,
                        uptime_seconds INTEGER NOT NULL,
                        created_at TEXT NOT NULL
                    )
                """)

                # Indexes for High Performance Queries
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_tca ON events(tca)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts(acknowledged, severity)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_handoffs_event ON handoffs(event_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, timestamp)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_tle_epoch ON tle_snapshots(epoch)")
                
                conn.commit()
                logger.info(f"Durable SQLite storage initialized at {DB_PATH}")

        except Exception as e:
            logger.error(f"Failed to initialize SQLite storage: {e}")

    def attach_firestore(self, client):
        """Attaches active Firestore client."""
        self.firestore_client = client
        self.is_firestore_active = client is not None
        if self.is_firestore_active:
            logger.info("Firestore attached as primary cloud persistence provider.")

    # ========================================================
    # Audit Logging (Immutable)
    # ========================================================
    def log_audit(self, user_id: str, action: str, resource_type: str, resource_id: str, details: dict = None, ip_address: str = None):
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_sqlite_conn() as conn:
                conn.cursor().execute(
                    "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user_id, action, resource_type, resource_id, json.dumps(details or {}), ip_address or "127.0.0.1", now)
                )
                conn.commit()
            
            if self.is_firestore_active:
                self.firestore_client.collection("audit_logs").add({
                    "user_id": user_id,
                    "action": action,
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "details": details or {},
                    "ip_address": ip_address or "127.0.0.1",
                    "timestamp": now,
                })
        except Exception as e:
            logger.error(f"Error recording audit log: {e}")

    # ========================================================
    # Users
    # ========================================================
    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            if self.is_firestore_active:
                doc = self.firestore_client.collection("users").document(user_id).get()
                if doc.exists:
                    d = doc.to_dict()
                    d["user_id"] = d.get("user_id") or d.get("id") or user_id
                    return d

            with self._get_sqlite_conn() as conn:
                row = conn.cursor().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                if row:
                    d = dict(row)
                    d["user_id"] = d.get("id")
                    return d
        except Exception as e:
            logger.error(f"Error fetching user {user_id}: {e}")
        return None

    def upsert_user(self, user_data: Dict[str, Any]):
        now = datetime.now(timezone.utc).isoformat()
        uid = user_data.get("user_id") or user_data.get("id")
        user_data["id"] = uid
        user_data["user_id"] = uid
        try:
            with self._get_sqlite_conn() as conn:
                conn.cursor().execute("""
                    INSERT INTO users (id, name, email, role, organization_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        email=excluded.email,
                        role=excluded.role,
                        organization_id=excluded.organization_id,
                        updated_at=excluded.updated_at
                """, (
                    uid,
                    user_data.get("name", uid),
                    user_data.get("email", f"{uid}@kesslerx.internal"),
                    user_data.get("role", "analyst"),
                    user_data.get("organization_id", "org-primary"),
                    user_data.get("created_at", now),
                    now
                ))
                conn.commit()

            if self.is_firestore_active:
                self.firestore_client.collection("users").document(uid).set({
                    **user_data,
                    "updated_at": now
                }, merge=True)
        except Exception as e:
            logger.error(f"Error upserting user {uid}: {e}")

    def list_users(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            with self._get_sqlite_conn() as conn:
                rows = conn.cursor().execute("SELECT * FROM users LIMIT ?", (limit,)).fetchall()
                results = []
                for r in rows:
                    d = dict(r)
                    d["user_id"] = d.get("id")
                    results.append(d)
                return results
        except Exception as e:
            logger.error(f"Error listing users: {e}")
            return []

    # ========================================================
    # Events & Conjunctions
    # ========================================================
    def get_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            with self._get_sqlite_conn() as conn:
                rows = conn.cursor().execute("SELECT * FROM events ORDER BY tca ASC LIMIT ?", (limit,)).fetchall()
                results = []
                for r in rows:
                    d = dict(r)
                    d["event_id"] = d.get("id")
                    results.append(d)
                return results
        except Exception as e:
            logger.error(f"Error fetching events: {e}")
            return []

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        try:
            with self._get_sqlite_conn() as conn:
                row = conn.cursor().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
                if row:
                    d = dict(row)
                    d["event_id"] = d.get("id")
                    return d
        except Exception as e:
            logger.error(f"Error fetching event {event_id}: {e}")
        return None

    def upsert_event(self, event_data: Dict[str, Any]) -> Tuple[bool, str]:
        """Upserts event with optimistic locking / version checking."""
        now = datetime.now(timezone.utc).isoformat()
        eid = event_data["id"]
        incoming_version = event_data.get("version", 1)

        try:
            with self._get_sqlite_conn() as conn:
                cursor = conn.cursor()
                existing = cursor.execute("SELECT version FROM events WHERE id = ?", (eid,)).fetchone()
                
                if existing:
                    current_version = existing["version"]
                    if incoming_version != current_version:
                        return False, f"Optimistic lock conflict: current version is {current_version}, incoming is {incoming_version}"
                    new_version = current_version + 1
                else:
                    new_version = incoming_version

                cursor.execute("""
                    INSERT INTO events (
                        id, satellite, object, tca, miss_distance, collision_probability,
                        risk, status, version, current_owner_id, source, mode, raw_payload,
                        idempotency_key, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        satellite=excluded.satellite,
                        object=excluded.object,
                        tca=excluded.tca,
                        miss_distance=excluded.miss_distance,
                        collision_probability=excluded.collision_probability,
                        risk=excluded.risk,
                        status=excluded.status,
                        version=excluded.version,
                        current_owner_id=excluded.current_owner_id,
                        source=excluded.source,
                        mode=excluded.mode,
                        raw_payload=excluded.raw_payload,
                        updated_at=excluded.updated_at
                """, (
                    eid,
                    event_data.get("satellite", "UNKNOWN"),
                    event_data.get("object", "UNKNOWN"),
                    event_data.get("tca", now),
                    float(event_data.get("miss_distance", 0.0)),
                    float(event_data.get("collision_probability", 0.0)),
                    event_data.get("risk", "MEDIUM"),
                    event_data.get("status", "new"),
                    new_version,
                    event_data.get("current_owner_id"),
                    event_data.get("source", "space-track"),
                    event_data.get("mode", "observed"),
                    json.dumps(event_data.get("raw_payload", {})),
                    event_data.get("idempotency_key"),
                    event_data.get("created_at", now),
                    now
                ))
                conn.commit()

            if self.is_firestore_active:
                self.firestore_client.collection("events").document(eid).set({
                    **event_data,
                    "version": new_version,
                    "updated_at": now
                }, merge=True)

            return True, eid
        except sqlite3.IntegrityError as ie:
            return False, f"Integrity error (e.g. duplicate idempotency key): {ie}"
        except Exception as e:
            return False, str(e)

    # ========================================================
    # Alerts
    # ========================================================
    def add_alert(self, severity: str, title: str, message: str, alert_type: str = "general", event_id: str = None) -> str:
        now = datetime.now(timezone.utc).isoformat()
        alert_id = f"ALT-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        try:
            with self._get_sqlite_conn() as conn:
                conn.cursor().execute("""
                    INSERT INTO alerts (id, event_id, severity, title, message, type, acknowledged, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """, (alert_id, event_id, severity.upper(), title, message, alert_type, now))
                conn.commit()

            if self.is_firestore_active:
                self.firestore_client.collection("alerts").document(alert_id).set({
                    "id": alert_id,
                    "event_id": event_id,
                    "severity": severity.upper(),
                    "title": title,
                    "message": message,
                    "type": alert_type,
                    "acknowledged": False,
                    "created_at": now,
                })
            return alert_id
        except Exception as e:
            logger.error(f"Error adding alert: {e}")
            return alert_id

    def list_alerts(self, limit: int = 50, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            with self._get_sqlite_conn() as conn:
                cursor = conn.cursor()
                if severity:
                    rows = cursor.execute(
                        "SELECT * FROM alerts WHERE severity = ? ORDER BY created_at DESC LIMIT ?",
                        (severity.upper(), limit)
                    ).fetchall()
                else:
                    rows = cursor.execute(
                        "SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?",
                        (limit,)
                    ).fetchall()
                
                result = []
                for r in rows:
                    item = dict(r)
                    item["acknowledged"] = bool(item["acknowledged"])
                    result.append(item)
                return result
        except Exception as e:
            logger.error(f"Error listing alerts: {e}")
            return []

    def acknowledge_alert(self, alert_id: str, acknowledged_by: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        try:
            with self._get_sqlite_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE alerts
                    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?
                    WHERE id = ?
                """, (acknowledged_by, now, alert_id))
                conn.commit()
                updated = cursor.rowcount > 0

            if self.is_firestore_active:
                self.firestore_client.collection("alerts").document(alert_id).update({
                    "acknowledged": True,
                    "acknowledged_by": acknowledged_by,
                    "acknowledged_at": now,
                })
            return updated
        except Exception as e:
            logger.error(f"Error acknowledging alert {alert_id}: {e}")
            return False

    # ========================================================
    # TLE Snapshot Caching
    # ========================================================
    def store_tle_snapshots(self, satellites: List[Dict[str, Any]], source: str = "space-track") -> int:
        now = datetime.now(timezone.utc).isoformat()
        stored = 0
        try:
            with self._get_sqlite_conn() as conn:
                cursor = conn.cursor()
                for sat in satellites:
                    norad = sat.get("NORAD_CAT_ID")
                    if not norad:
                        continue
                    try:
                        norad_int = int(norad)
                    except ValueError:
                        continue

                    cursor.execute("""
                        INSERT INTO tle_snapshots (norad_id, name, line1, line2, epoch, category, source, fetched_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(norad_id) DO UPDATE SET
                            name=excluded.name,
                            line1=excluded.line1,
                            line2=excluded.line2,
                            epoch=excluded.epoch,
                            category=excluded.category,
                            source=excluded.source,
                            fetched_at=excluded.fetched_at
                    """, (
                        norad_int,
                        sat.get("OBJECT_NAME", f"OBJECT-{norad}"),
                        sat.get("TLE_LINE1", ""),
                        sat.get("TLE_LINE2", ""),
                        sat.get("EPOCH", now),
                        sat.get("CATEGORY", "Unknown"),
                        source,
                        now
                    ))
                    stored += 1
                conn.commit()
        except Exception as e:
            logger.error(f"Error storing TLE snapshots: {e}")
        return stored

    def get_tle_snapshots(self, limit: int = 1000) -> List[Dict[str, Any]]:
        try:
            with self._get_sqlite_conn() as conn:
                rows = conn.cursor().execute("SELECT * FROM tle_snapshots LIMIT ?", (limit,)).fetchall()
                result = []
                for r in rows:
                    result.append({
                        "NORAD_CAT_ID": r["norad_id"],
                        "OBJECT_NAME": r["name"],
                        "TLE_LINE1": r["line1"],
                        "TLE_LINE2": r["line2"],
                        "EPOCH": r["epoch"],
                        "CATEGORY": r["category"],
                        "SOURCE": r["source"],
                        "FETCHED_AT": r["fetched_at"],
                    })
                return result
        except Exception as e:
            logger.error(f"Error reading TLE snapshots: {e}")
            return []

    def get_tle_snapshot_count(self) -> int:
        try:
            with self._get_sqlite_conn() as conn:
                row = conn.cursor().execute("SELECT COUNT(*) as count FROM tle_snapshots").fetchone()
                return row["count"] if row else 0
        except Exception:
            return 0


# Global singleton storage engine
storage = StorageEngine()
