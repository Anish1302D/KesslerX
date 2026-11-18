/**
 * Isolated Deterministic Orbit & Tilt-Conjunction Utilities for PHONE-SATELLITE-001.
 *
 * Strictly additive: does not modify existing satellite catalog, debris fixtures,
 * collision events, or SGP4 propagation behavior.
 */

import type { SatelliteItem } from '../components/dashboard/GlobeFallbackTable';

export const PHONE_SATELLITE_SAFETY_LABELS = {
  simulated: 'PHONE SATELLITE — SIMULATED',
  mockOrbit: 'MOCK ORBIT — NOT A REAL SPACECRAFT EPHEMERIS',
  demoProbability: 'DEMO COLLISION PROBABILITY — DERIVED FROM PHONE TILT',
  disclaimer: 'Decision support only — human approval required. Not a flight command system.',
} as const;

export const PHONE_SATELLITE_IDENTITY = {
  id: 'PHONE-SATELLITE-001',
  name: 'PHONE SATELLITE',
  object_type: 'PHONE_SATELLITE',
  category: 'Phone Satellite',
  source: 'phone_sensor',
  mode: 'simulated',
  ground_station_id: 'KX-RPI-ZERO-GS-001',
  hardware_model: 'Raspberry Pi Zero W',
  color: '#FF2EF5',
  description:
    'Physical smartphone used as a satellite attitude simulator. Orbit is a controlled demonstration orbit, not a real spacecraft orbit.',
} as const;

export const PHONE_MOCK_ORBIT = {
  semi_major_axis_km: 7021.0,
  altitude_km: 650.0,
  inclination_deg: 72.0,
  eccentricity: 0.012,
  raan_deg: 145.0,
  argument_of_perigee_deg: 38.0,
  mean_anomaly_deg: 215.0,
  orbit_type: 'MOCK_LEO_PHONE_DEMO',
  period_minutes: 97.4,
  reference_epoch: '2026-11-17T00:00:00Z',
} as const;

export interface PhoneOrientation {
  roll_deg: number;
  pitch_deg: number;
  yaw_deg: number;
}

export interface PhoneAngularVelocity {
  x_dps: number;
  y_dps: number;
  z_dps: number;
}

export interface PhoneTelemetrySnapshot {
  device_id: string;
  satellite_name: string;
  sequence: number;
  timestamp: string | null;
  received_at: string | null;
  ingested_at?: string | null;
  orientation: PhoneOrientation;
  angular_velocity: PhoneAngularVelocity;
  source: string;
  mode: string;
  ground_station_id: string;
  hardware_model?: string;
  warnings?: string[];
  link_status: 'LIVE_RPI_ZERO_GATEWAY' | 'AWAITING_RPI_ZERO_TELEMETRY' | 'LIVE_RPI3_GATEWAY' | 'AWAITING_RPI3_TELEMETRY' | string;
  packets_received: number;
}

export interface PhoneConjunctionSnapshot {
  id: string;
  satellite: string;
  object: string;
  debris_name: string;
  source: string;
  mode: string;
  model_label: string;
  term: string;
  collision_probability: number;
  collision_probability_pct: number;
  risk_level: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  tilt_magnitude_deg: number;
  roll_deg: number;
  pitch_deg: number;
  yaw_deg: number;
  miss_distance_km: number;
  tca_hours: number;
  confidence: number;
  confidence_note: string;
  ground_station_id: string;
  provenance: string;
  last_updated: string | null;
  disclaimer: string;
  warnings: string[];
}

export interface PhoneSatelliteOrbitPosition {
  timestamp: string;
  lat: number;
  lon: number;
  altitude_km: number;
  velocity_km_s: number;
  velocity_km_h: number;
  radius_km: number;
}

export interface PhoneSatelliteData {
  id: string;
  name: string;
  object_type: string;
  category: string;
  source: string;
  mode: string;
  ground_station_id: string;
  color: string;
  description: string;
  orbit: typeof PHONE_MOCK_ORBIT & {
    current_position?: PhoneSatelliteOrbitPosition;
  };
  telemetry: PhoneTelemetrySnapshot;
  conjunction: PhoneConjunctionSnapshot;
  warnings: string[];
  disclaimer: string;
}

const EARTH_RADIUS_KM = 6371.0;
const GM_EARTH_KM3_S2 = 398600.4418;
const REF_EPOCH_MS = Date.UTC(2026, 10, 17, 0, 0, 0); // 2026-11-17T00:00:00Z

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

function radToDeg(rad: number): number {
  return (rad * 180.0) / Math.PI;
}

function julianDateFromDate(date: Date): number {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  const day =
    date.getUTCDate() +
    (date.getUTCHours() +
      date.getUTCMinutes() / 60.0 +
      (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000.0) / 3600.0) /
      24.0;

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

function gmstRadians(date: Date): number {
  const jd = julianDateFromDate(date);
  const d = jd - 2451545.0;
  const t = d / 36525.0;
  let gmstDeg =
    (280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000.0) % 360.0;
  if (gmstDeg < 0) gmstDeg += 360.0;
  return degToRad(gmstDeg);
}

function solveKepler(meanAnomalyRad: number, eccentricity: number): number {
  const twoPi = 2.0 * Math.PI;
  let m = meanAnomalyRad % twoPi;
  if (m < 0) m += twoPi;
  let E = m + eccentricity * Math.sin(m);
  for (let i = 0; i < 10; i++) {
    const fVal = E - eccentricity * Math.sin(E) - m;
    const fPrime = 1.0 - eccentricity * Math.cos(E);
    const delta = fVal / fPrime;
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/**
 * Deterministically propagates PHONE-SATELLITE-001 along its independent mock orbit.
 * Same input timestamp always yields identical position and velocity.
 */
export function propagatePhoneSatelliteOrbit(date: Date): PhoneSatelliteOrbitPosition {
  const deltaSeconds = (date.getTime() - REF_EPOCH_MS) / 1000.0;

  const aKm = PHONE_MOCK_ORBIT.semi_major_axis_km;
  const ecc = PHONE_MOCK_ORBIT.eccentricity;
  const incRad = degToRad(PHONE_MOCK_ORBIT.inclination_deg);
  const raanRad = degToRad(PHONE_MOCK_ORBIT.raan_deg);
  const argpRad = degToRad(PHONE_MOCK_ORBIT.argument_of_perigee_deg);
  const m0Rad = degToRad(PHONE_MOCK_ORBIT.mean_anomaly_deg);

  const meanMotion = Math.sqrt(GM_EARTH_KM3_S2 / (aKm * aKm * aKm));
  const meanAnom = m0Rad + meanMotion * deltaSeconds;
  const eccAnom = solveKepler(meanAnom, ecc);

  const trueAnom =
    2.0 *
    Math.atan2(
      Math.sqrt(1.0 + ecc) * Math.sin(eccAnom / 2.0),
      Math.sqrt(1.0 - ecc) * Math.cos(eccAnom / 2.0)
    );

  const radiusKm = aKm * (1.0 - ecc * Math.cos(eccAnom));

  const xP = radiusKm * Math.cos(trueAnom);
  const yP = radiusKm * Math.sin(trueAnom);

  const muASqrt = Math.sqrt(GM_EARTH_KM3_S2 * aKm);
  const vxP = -(muASqrt / radiusKm) * Math.sin(eccAnom);
  const vyP = (muASqrt / radiusKm) * Math.sqrt(1.0 - ecc * ecc) * Math.cos(eccAnom);

  const cosO = Math.cos(raanRad);
  const sinO = Math.sin(raanRad);
  const cosW = Math.cos(argpRad);
  const sinW = Math.sin(argpRad);
  const cosI = Math.cos(incRad);
  const sinI = Math.sin(incRad);

  const px = cosO * cosW - sinO * sinW * cosI;
  const py = sinO * cosW + cosO * sinW * cosI;
  const pz = sinW * sinI;

  const qx = -cosO * sinW - sinO * cosW * cosI;
  const qy = -sinO * sinW + cosO * cosW * cosI;
  const qz = cosW * sinI;

  const xEci = xP * px + yP * qx;
  const yEci = xP * py + yP * qy;
  const zEci = xP * pz + yP * qz;

  const vxEci = vxP * px + vyP * qx;
  const vyEci = vxP * py + vyP * qy;
  const vzEci = vxP * pz + vyP * qz;
  const speedKmS = Math.sqrt(vxEci * vxEci + vyEci * vyEci + vzEci * vzEci);

  const gmst = gmstRadians(date);
  const cosG = Math.cos(gmst);
  const sinG = Math.sin(gmst);
  const xEcef = xEci * cosG + yEci * sinG;
  const yEcef = -xEci * sinG + yEci * cosG;
  const zEcef = zEci;

  const horiz = Math.sqrt(xEcef * xEcef + yEcef * yEcef);
  const latDeg = radToDeg(Math.atan2(zEcef, horiz));
  const lonDeg = radToDeg(Math.atan2(yEcef, xEcef));
  const altKm = radiusKm - EARTH_RADIUS_KM;

  return {
    timestamp: date.toISOString(),
    lat: Number(latDeg.toFixed(4)),
    lon: Number(lonDeg.toFixed(4)),
    altitude_km: Number(altKm.toFixed(2)),
    velocity_km_s: Number(speedKmS.toFixed(4)),
    velocity_km_h: Number((speedKmS * 3600.0).toFixed(1)),
    radius_km: Number(radiusKm.toFixed(2)),
  };
}

export function buildPhoneOrbitTrack(
  startDate: Date,
  durationMinutes: number = PHONE_MOCK_ORBIT.period_minutes,
  stepSeconds: number = 60
): Array<{ time: Date; pos: PhoneSatelliteOrbitPosition }> {
  const samples: Array<{ time: Date; pos: PhoneSatelliteOrbitPosition }> = [];
  const totalSeconds = Math.floor(durationMinutes * 60);
  for (let sec = 0; sec <= totalSeconds; sec += stepSeconds) {
    const t = new Date(startDate.getTime() + sec * 1000);
    samples.push({ time: t, pos: propagatePhoneSatelliteOrbit(t) });
  }
  return samples;
}

/**
 * Deterministic mirror of the backend tilt-driven demonstration collision probability model.
 */
export function evaluatePhoneTiltConjunction(
  rollDeg: number,
  pitchDeg: number,
  yawDeg: number = 0,
  lastUpdated: string | null = null
): PhoneConjunctionSnapshot {
  const clampedRoll = Math.max(-90, Math.min(90, Number(rollDeg) || 0));
  const clampedPitch = Math.max(-90, Math.min(90, Number(pitchDeg) || 0));
  const tiltMagnitude = Math.sqrt(clampedRoll * clampedRoll + clampedPitch * clampedPitch);

  let prob: number;
  let riskLevel: PhoneConjunctionSnapshot['risk_level'];

  if (tiltMagnitude <= 5) {
    prob = 0.005 + (tiltMagnitude / 5) * (0.015 - 0.005);
    riskLevel = 'SAFE';
  } else if (tiltMagnitude <= 15) {
    prob = 0.015 + ((tiltMagnitude - 5) / 10) * (0.05 - 0.015);
    riskLevel = 'LOW';
  } else if (tiltMagnitude <= 30) {
    prob = 0.05 + ((tiltMagnitude - 15) / 15) * (0.15 - 0.05);
    riskLevel = 'MEDIUM';
  } else if (tiltMagnitude <= 45) {
    prob = 0.15 + ((tiltMagnitude - 30) / 15) * (0.35 - 0.15);
    riskLevel = 'HIGH';
  } else {
    prob = Math.min(0.6, 0.35 + ((tiltMagnitude - 45) / 45) * (0.6 - 0.35));
    riskLevel = 'CRITICAL';
  }

  prob = Number(Math.min(0.6, Math.max(0, prob)).toFixed(4));

  return {
    id: 'PHONE-DEMO-CONJUNCTION-001',
    satellite: 'PHONE SATELLITE',
    object: 'PHONE-DEMO-DEBRIS-001',
    debris_name: 'PHONE-DEMO-DEBRIS-001',
    source: 'simulation',
    mode: 'simulated',
    model_label: 'DEMO SIMULATION',
    term: 'Demonstration collision probability',
    collision_probability: prob,
    collision_probability_pct: Number((prob * 100).toFixed(2)),
    risk_level: riskLevel,
    tilt_magnitude_deg: Number(tiltMagnitude.toFixed(2)),
    roll_deg: Number(clampedRoll.toFixed(2)),
    pitch_deg: Number(clampedPitch.toFixed(2)),
    yaw_deg: Number((Number(yawDeg) || 0).toFixed(2)),
    miss_distance_km: 0.85,
    tca_hours: 6.0,
    confidence: 100,
    confidence_note: 'Deterministic demonstration mapping; not a real orbital confidence estimate.',
    ground_station_id: PHONE_SATELLITE_IDENTITY.ground_station_id,
    provenance: 'DEMO SIMULATION derived deterministically from KX-RPI-ZERO-GS-001 (Raspberry Pi Zero W) phone tilt telemetry',
    last_updated: lastUpdated,
    disclaimer: PHONE_SATELLITE_SAFETY_LABELS.disclaimer,
    warnings: [
      'DEMO SIMULATION',
      PHONE_SATELLITE_SAFETY_LABELS.demoProbability,
      'Deterministic demonstration mapping; not a real orbital collision probability.',
    ],
  };
}

export function createDefaultPhoneSatelliteData(now: Date = new Date()): PhoneSatelliteData {
  const pos = propagatePhoneSatelliteOrbit(now);
  return {
    ...PHONE_SATELLITE_IDENTITY,
    orbit: {
      ...PHONE_MOCK_ORBIT,
      current_position: pos,
    },
    telemetry: {
      device_id: PHONE_SATELLITE_IDENTITY.id,
      satellite_name: PHONE_SATELLITE_IDENTITY.name,
      sequence: 0,
      timestamp: null,
      received_at: null,
      ingested_at: null,
      orientation: { roll_deg: 0, pitch_deg: 0, yaw_deg: 0 },
      angular_velocity: { x_dps: 0, y_dps: 0, z_dps: 0 },
      source: 'phone_sensor',
      mode: 'simulated',
      ground_station_id: PHONE_SATELLITE_IDENTITY.ground_station_id,
      hardware_model: PHONE_SATELLITE_IDENTITY.hardware_model,
      warnings: [],
      link_status: 'AWAITING_RPI_ZERO_TELEMETRY',
      packets_received: 0,
    },
    conjunction: evaluatePhoneTiltConjunction(0, 0, 0, null),
    warnings: [
      'Mock demonstration orbit',
      'Collision probability is derived from phone tilt for demonstration only',
    ],
    disclaimer: PHONE_SATELLITE_SAFETY_LABELS.disclaimer,
  };
}

export function isPhoneSatelliteItem(sat?: SatelliteItem | null): boolean {
  if (!sat) return false;
  return (
    String(sat.NORAD_CAT_ID ?? sat.id ?? '') === PHONE_SATELLITE_IDENTITY.id ||
    String(sat.OBJECT_TYPE ?? '').toUpperCase() === 'PHONE_SATELLITE' ||
    String(sat.CATEGORY ?? '').toLowerCase() === 'phone satellite'
  );
}

export function phoneSatelliteToItem(
  data?: PhoneSatelliteData | null,
  now: Date = new Date()
): SatelliteItem {
  const pos = data?.orbit?.current_position ?? propagatePhoneSatelliteOrbit(now);
  return {
    id: PHONE_SATELLITE_IDENTITY.id,
    NORAD_CAT_ID: PHONE_SATELLITE_IDENTITY.id,
    OBJECT_NAME: PHONE_SATELLITE_IDENTITY.name,
    name: PHONE_SATELLITE_IDENTITY.name,
    OBJECT_TYPE: PHONE_SATELLITE_IDENTITY.object_type,
    CATEGORY: PHONE_SATELLITE_IDENTITY.category,
    type: PHONE_SATELLITE_IDENTITY.category,
    altitude: Math.round(pos.altitude_km),
    alt_km: pos.altitude_km,
    velocity: Math.round(pos.velocity_km_h),
    speed_km_s: pos.velocity_km_s,
    inclination: PHONE_MOCK_ORBIT.inclination_deg,
    inc_deg: PHONE_MOCK_ORBIT.inclination_deg,
    period: PHONE_MOCK_ORBIT.period_minutes,
    epoch: `MOCK ORBIT (${PHONE_MOCK_ORBIT.orbit_type})`,
    source: `${PHONE_SATELLITE_IDENTITY.source} (${PHONE_SATELLITE_IDENTITY.ground_station_id})`,
    status:
      data?.telemetry?.link_status === 'LIVE_RPI_ZERO_GATEWAY' || data?.telemetry?.link_status === 'LIVE_RPI3_GATEWAY'
        ? 'Live Sim (Pi Zero W)'
        : 'Mock Demo Orbit',
  };
}
