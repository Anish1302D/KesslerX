"""
KesslerX Production Provider Contract & Reliability Tests.
Validates real upstream provider adapters, durable persistence,
idempotency, optimistic concurrency, and fail-closed authentication.
"""

import pytest
import time
from datetime import datetime, timezone
from config import config, ENV_PRODUCTION, ENV_DEMO, ENV_TEST
from storage import storage
from noaa_service import noaa_client
from space_track import space_track_client, verify_tle_checksum
from ground_station import gs_manager, DeviceTelemetryPacket
from conjunction_engine import CDMEvent, compute_encounter_plane_probability
from ai_service import AIChatResponse, EvidenceItem


def test_tle_checksum_validation():
    # Valid ISS TLE with authentic checksums
    valid_line1 = "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9997"
    valid_line2 = "2 25544  51.6416 113.8823 0004944 260.6558 139.7397 15.49842525452267"
    assert verify_tle_checksum(valid_line1) is True
    assert verify_tle_checksum(valid_line2) is True

    # Tampered checksum (modified last digit from 7 to 0)
    corrupted_line1 = "1 25544U 98067A   24128.53055556  .00016717  00000-0  30062-3 0  9990"
    assert verify_tle_checksum(corrupted_line1) is False


def test_durable_storage_idempotency_and_locking():
    # 1. First write with idempotency key
    test_id = f"EVT-TEST-{int(time.time() * 1000)}"
    idem_key = f"IDEM-{int(time.time() * 1000)}"
    event_data = {
        "id": test_id,
        "satellite": "STARLINK-3021",
        "object": "DEBRIS-88172",
        "tca": datetime.now(timezone.utc).isoformat(),
        "miss_distance": 0.35,
        "collision_probability": 0.045,
        "risk": "HIGH",
        "version": 1,
        "idempotency_key": idem_key,
        "source": "space-track",
        "mode": "observed"
    }

    success, msg = storage.upsert_event(event_data)
    assert success is True
    assert msg == test_id

    # 2. Duplicate write with same idempotency key fails integrity
    dup_event = dict(event_data)
    dup_event["id"] = f"{test_id}-DUP"
    success_dup, err = storage.upsert_event(dup_event)
    assert success_dup is False
    assert "Integrity error" in err

    # 3. Successful update increments version from 1 to 2
    update_event = dict(event_data)
    update_event["version"] = 1
    update_event["idempotency_key"] = f"IDEM-{int(time.time() * 1000) + 1}"
    success_up, _ = storage.upsert_event(update_event)
    assert success_up is True

    # 4. Stale write with version 1 is rejected (db is now at version 2)
    stale_event = dict(event_data)
    stale_event["version"] = 1
    stale_event["idempotency_key"] = f"IDEM-{int(time.time() * 1000) + 2}"
    success_lock, lock_err = storage.upsert_event(stale_event)
    assert success_lock is False
    assert "Optimistic lock conflict" in lock_err


def test_cdm_event_parsing_and_normalization():
    raw_cdm = {
        "CDM_ID": "CDM-2026-0881",
        "CREATION_DATE": "2026-11-07T00:00:00Z",
        "TCA": "2026-11-08T14:22:00Z",
        "MISS_DISTANCE": 450.0,  # meters
        "RELATIVE_SPEED": 14200.0,  # m/s
        "COLLISION_PROBABILITY": 0.0034,
        "OBJECT1_NAME": "PRIMARY_ASSET_1",
        "OBJECT2_NAME": "COSMOS_DEB",
        "OBJECT1_HARD_BODY_RADIUS": 2.5,
        "OBJECT2_HARD_BODY_RADIUS": 0.8
    }

    cdm = CDMEvent(raw_cdm)
    valid, errors = cdm.validate()
    assert valid is True
    assert len(errors) == 0

    norm = cdm.to_normalized_event()
    assert norm["satellite"] == "PRIMARY_ASSET_1"
    assert norm["miss_distance"] == 0.45  # converted to km
    assert norm["relative_velocity_km_s"] == 14.2  # converted to km/s
    assert norm["risk"] == "CRITICAL"  # prob > 1e-3


def test_conjunction_probability_insufficient_data():
    # Missing covariance must return INSUFFICIENT_DATA (fail-closed, no fabricated 500m default)
    prob, status = compute_encounter_plane_probability(
        miss_distance_m=450.0,
        combined_hbr_m=3.3,
        sigma_x_m=None,
        sigma_y_m=None
    )
    assert prob is None
    assert "INSUFFICIENT_DATA" in status

    # With valid covariance
    prob_valid, status_valid = compute_encounter_plane_probability(
        miss_distance_m=450.0,
        combined_hbr_m=3.3,
        sigma_x_m=200.0,
        sigma_y_m=150.0
    )
    assert prob_valid is not None
    assert 0.0 <= prob_valid <= 1.0
    assert status_valid == "OPERATIONAL_FOSTER_2D"


def test_ground_station_authentication_and_replay_protection():
    # 1. Unauthorized device rejected
    bad_packet = DeviceTelemetryPacket(
        station_id="GS-PRIMARY-01",
        device_token="invalid_secret_key",
        sequence_number=1,
        timestamp=datetime.now(timezone.utc).isoformat(),
        latitude=34.05,
        longitude=-118.25,
        altitude_m=100.0,
        temperature_c=22.0,
        battery_pct=95.0,
        signal_dbm=-70.0,
        velocity_m_s=0.0
    )
    with pytest.raises(PermissionError):
        gs_manager.ingest_packet(bad_packet)

    # 2. Valid authenticated packet
    valid_packet = DeviceTelemetryPacket(
        station_id="GS-PRIMARY-01",
        device_token="kesslerx_device_key_primary_secure",
        sequence_number=10,
        timestamp=datetime.now(timezone.utc).isoformat(),
        latitude=34.05,
        longitude=-118.25,
        altitude_m=100.0,
        temperature_c=22.0,
        battery_pct=95.0,
        signal_dbm=-70.0,
        velocity_m_s=0.0
    )
    res = gs_manager.ingest_packet(valid_packet)
    assert res["station_id"] == "GS-PRIMARY-01"
    assert res["sequence_number"] == 10

    # 3. Replay of same or lower sequence number is rejected
    replay_packet = DeviceTelemetryPacket(
        station_id="GS-PRIMARY-01",
        device_token="kesslerx_device_key_primary_secure",
        sequence_number=10,  # Replay!
        timestamp=datetime.now(timezone.utc).isoformat(),
        latitude=34.05,
        longitude=-118.25,
        altitude_m=100.0,
        temperature_c=22.0,
        battery_pct=95.0,
        signal_dbm=-70.0,
        velocity_m_s=0.0
    )
    with pytest.raises(ValueError):
        gs_manager.ingest_packet(replay_packet)


def test_ai_chat_response_schema_validation():
    valid_payload = {
        "answer": "Candidate maneuver verified for Starlink-3021.",
        "evidence": [
            {
                "source_id": "ST-25544",
                "source": "space-track",
                "observed_at": "2026-11-07T06:00:00Z",
                "freshness_seconds": 120,
                "claim": "TLE epoch within 24h operational limit"
            }
        ],
        "assumptions": ["SGP4 propagation with B-star atmospheric drag"],
        "uncertainties": ["Atmospheric density variation during geomagnetic storm"],
        "missing_inputs": ["Operator-grade Covariance Matrix"],
        "recommended_next_step": "Obtain radar refinement from LeoLabs",
        "decision_support_only": True,
        "human_approval_required": True
    }

    parsed = AIChatResponse(**valid_payload)
    assert parsed.decision_support_only is True
    assert parsed.human_approval_required is True
    assert len(parsed.evidence) == 1
    assert parsed.evidence[0].source == "space-track"
