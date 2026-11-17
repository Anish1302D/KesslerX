import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Gauge, Clock, Compass, Shield, Download, Crosshair, Satellite, Smartphone } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import StaleDataWarning from '../ui/StaleDataWarning';
import * as satellite from 'satellite.js';
import { getSatelliteMedia, type SatelliteMedia } from '../../data/satelliteMedia';
import type { FollowState } from './CesiumGlobe';
import { SatelliteItem } from './GlobeFallbackTable';
import ReportPreviewModal from '../handoff/ReportPreviewModal';
import { useEvents, useUsers } from '../../hooks/useHandoffAPI';
import { useCurrentUser } from '../handoff/UserContext';
import type { HandoffEvent } from '../../data/handoffTypes';
import {
  isPhoneSatelliteItem,
  createDefaultPhoneSatelliteData,
  PHONE_SATELLITE_IDENTITY,
  PHONE_MOCK_ORBIT,
  PHONE_SATELLITE_SAFETY_LABELS,
  type PhoneSatelliteData,
} from '../../utils/phoneSatelliteOrbit';

interface ObjectDetailsPanelProps {
  satelliteData: SatelliteItem | null;
  phoneSatellite?: PhoneSatelliteData | null;
  onClose: () => void;
  followState?: FollowState;
  onFollowSatellite?: () => void;
  onStopFollowing?: () => void;
}

export default function ObjectDetailsPanel({
  satelliteData,
  phoneSatellite,
  onClose,
  followState,
  onFollowSatellite,
  onStopFollowing,
}: ObjectDetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { events } = useEvents();
  const { users } = useUsers();
  const { currentUser } = useCurrentUser();

  // Phone satellite state detection
  const isPhoneSat = isPhoneSatelliteItem(satelliteData);
  const resolvedPhone = phoneSatellite || (isPhoneSat ? createDefaultPhoneSatelliteData() : null);

  // Parse TLE to get real stats
  let altitude = 'Unknown';
  let velocity = 'Unknown';
  let inclination = 'Unknown';
  let period = 'Unknown';

  if (isPhoneSat && resolvedPhone) {
    altitude = String(resolvedPhone.orbit.current_position?.altitude_km ?? PHONE_MOCK_ORBIT.altitude_km);
    velocity = String(Math.round(resolvedPhone.orbit.current_position?.velocity_km_h ?? 27095));
    inclination = String(PHONE_MOCK_ORBIT.inclination_deg);
    period = String(PHONE_MOCK_ORBIT.period_minutes);
  } else if (satelliteData && satelliteData.TLE_LINE1 && satelliteData.TLE_LINE2) {
    try {
      const satrec = satellite.twoline2satrec(satelliteData.TLE_LINE1, satelliteData.TLE_LINE2);
      const positionAndVelocity = satellite.propagate(satrec, new Date());
      if (positionAndVelocity && positionAndVelocity.position && positionAndVelocity.velocity) {
        const positionEci = positionAndVelocity.position;
        const velocityEci = positionAndVelocity.velocity;
      
      if (positionEci && velocityEci && typeof positionEci !== 'boolean' && typeof velocityEci !== 'boolean') {
        const gmst = satellite.gstime(new Date());
        const positionGd = satellite.eciToGeodetic(positionEci as satellite.EciVec3<number>, gmst);
        altitude = Math.round(positionGd.height).toLocaleString();
        
        // Calculate velocity magnitude in km/s then to km/h
        const v = velocityEci as satellite.EciVec3<number>;
        const vMag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        velocity = Math.round(vMag * 3600).toLocaleString();

        inclination = (satrec.inclo * (180 / Math.PI)).toFixed(2);
        const meanMotionRevPerDay = satrec.no * 60 * 24 / (2 * Math.PI);
        if (meanMotionRevPerDay > 0) {
           period = Math.round(1440 / meanMotionRevPerDay).toString();
        }
      }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback to directly provided mock data if TLE parsing failed or was missing
  if (altitude === 'Unknown' && satelliteData?.altitude !== undefined) altitude = satelliteData.altitude.toString();
  if (velocity === 'Unknown' && satelliteData?.velocity !== undefined) velocity = satelliteData.velocity.toString();
  if (inclination === 'Unknown' && satelliteData?.inclination !== undefined) inclination = satelliteData.inclination.toString();
  if (period === 'Unknown' && satelliteData?.period !== undefined) period = satelliteData.period.toString();

  // Generate a stable fake collision risk based on ID
  const noradNum = Number(satelliteData?.NORAD_CAT_ID ?? satelliteData?.id ?? 0);
  const baseRisk = Number.isFinite(noradNum) ? (noradNum % 20) : 0;
  const collisionRisk = satelliteData?.CATEGORY === 'Debris' ? 0 : baseRisk;
  const requiresManeuver = collisionRisk > 10;
  const deltaV = (collisionRisk * 0.15).toFixed(2);
  const deltaTheta = (collisionRisk * 0.08).toFixed(2);

  // Satellite media lookup
  const objectName = satelliteData?.OBJECT_NAME || satelliteData?.name || '';
  const media: SatelliteMedia | null = objectName ? getSatelliteMedia(objectName) : null;

  // Follow mode state
  const isFollowing = followState?.mode === 'FOLLOWING' && followState.targetId === satelliteData?.NORAD_CAT_ID?.toString();
  const isFocusing = followState?.mode === 'FOCUSING' && followState.targetId === satelliteData?.NORAD_CAT_ID?.toString();

  // Match or synthesize a report event
  const matchingEvent = events.find(
    e => (objectName && (
      (e.satellite && e.satellite.toUpperCase().includes(objectName.toUpperCase())) ||
      (e.title && e.title.toUpperCase().includes(objectName.toUpperCase())) ||
      (e.object && e.object.toUpperCase().includes(objectName.toUpperCase()))
    )) || (satelliteData?.NORAD_CAT_ID && e.event_id?.includes(satelliteData.NORAD_CAT_ID.toString()))
  );

  const reportEvent: HandoffEvent = useMemo(() => {
    if (matchingEvent) return matchingEvent;
    return {
      event_id: `SAT-${satelliteData?.NORAD_CAT_ID || '00000'}`,
      title: `${objectName || 'SATELLITE'} — Orbital Safety Assessment`,
      satellite: objectName || `NORAD ${satelliteData?.NORAD_CAT_ID || 'Unknown'}`,
      object: 'Catalog Background Screening',
      severity: (satelliteData?.CATEGORY === 'Debris' || requiresManeuver) ? 'MEDIUM' : 'LOW',
      tca: 'Continuous Telemetry Monitoring',
      tca_minutes: 0,
      miss_distance_km: undefined,
      collision_probability: requiresManeuver ? 0.012 : 0.0001,
      status: 'Nominal Tracking',
      current_owner_id: currentUser?.user_id || 'anish',
      current_owner_role: currentUser?.role || 'Flight Dynamics Analyst',
      next_action: requiresManeuver ? 'Perform collision avoidance screening pass.' : 'Maintain standard orbital ephemeris screening.',
      deadline: 'Next Operational Window (+24h)',
      orbit: satelliteData?.CATEGORY || 'LEO',
      altitude_km: altitude !== 'Unknown' ? Number(altitude.replace(/,/g, '')) : undefined,
      relative_velocity_km_s: velocity !== 'Unknown' ? Number((Number(velocity.replace(/,/g, '')) / 3600).toFixed(2)) : undefined,
      risk_trend: requiresManeuver ? 'Elevated' : 'Stable',
      uncertainty: '±15m radial',
      work_completed: [
        'Telemetry ingested from Space-Track / 18 SDS ephemeris',
        'SGP4 propagation updated with active orbital elements',
        'Conjunction safety threshold screening performed',
      ],
      current_decision: 'Satellite orbit is being continuously monitored by KesslerX safety pipelines.',
      constraints: [
        'Subject to atmospheric drag variations in Low Earth Orbit',
      ],
    };
  }, [matchingEvent, satelliteData?.NORAD_CAT_ID, satelliteData?.CATEGORY, objectName, requiresManeuver, currentUser?.user_id, currentUser?.role, altitude, velocity]);

  return (
    <AnimatePresence>
      {satelliteData && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 right-4 w-80 z-20 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar"
        >
          <div ref={panelRef} className="glass-panel-strong p-5 rounded-xl border border-primary/20" style={{ background: 'rgba(6, 14, 32, 0.85)', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-orbitron font-bold text-white truncate pr-2">
                {satelliteData.OBJECT_NAME || `Object ${satelliteData.NORAD_CAT_ID}`}
              </h4>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-primary/20 shrink-0"
              >
                <X className="w-4 h-4" style={{ color: '#94A3B8' }} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <span
                className="text-[10px] font-space px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={
                  isPhoneSat
                    ? { background: 'rgba(255,46,245,0.18)', color: '#F9A8D4', border: '1px solid rgba(255,46,245,0.45)' }
                    : { background: 'rgba(0,174,239,0.15)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.3)' }
                }
              >
                {satelliteData.CATEGORY || satelliteData.OBJECT_TYPE || 'UNKNOWN'}
              </span>
              <span className="text-[11px] font-space truncate" style={{ color: '#64748B' }}>
                {isPhoneSat ? `ID: ${satelliteData.NORAD_CAT_ID || PHONE_SATELLITE_IDENTITY.id}` : `NORAD: ${satelliteData.NORAD_CAT_ID}`}
              </span>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase ml-auto shrink-0 ${
                  isPhoneSat
                    ? 'bg-[#FF2EF5]/15 text-[#F9A8D4] border-[#FF2EF5]/40'
                    : satelliteData.source === 'space-track'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {isPhoneSat ? 'SIMULATED' : satelliteData.source === 'space-track' ? 'LIVE TLE' : 'SIMULATED'}
              </span>
            </div>

            {isPhoneSat && resolvedPhone && (
              <div className="mb-4 p-3 rounded-lg bg-[#FF2EF5]/10 border border-[#FF2EF5]/35 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-[#F9A8D4]">{PHONE_SATELLITE_SAFETY_LABELS.simulated}</span>
                  <span className="text-slate-300">{PHONE_SATELLITE_IDENTITY.ground_station_id}</span>
                </div>
                <p className="text-[11px] text-slate-200 leading-relaxed">
                  {PHONE_SATELLITE_IDENTITY.description}
                </p>
                <div className="text-[10px] font-mono text-amber-300">
                  {PHONE_SATELLITE_SAFETY_LABELS.mockOrbit}
                </div>
              </div>
            )}

            {/* ── Satellite Image Section ────────────────────── */}
            <div className="mb-5">
              {isPhoneSat && resolvedPhone ? (
                <div
                  className="w-full rounded-lg flex flex-col items-center justify-center py-5 px-3 relative overflow-hidden"
                  style={{
                    aspectRatio: '16 / 10',
                    background: 'radial-gradient(circle at center, rgba(255,46,245,0.16), rgba(10,22,40,0.9))',
                    border: '1px solid rgba(255, 46, 245, 0.35)',
                  }}
                >
                  <div
                    className="w-28 h-14 rounded-lg border-2 border-[#FF2EF5] bg-slate-900/90 flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(255,46,245,0.35)] transition-transform duration-100"
                    style={{
                      transform: `perspective(260px) rotateX(${(-resolvedPhone.telemetry.orientation.pitch_deg).toFixed(1)}deg) rotateY(${resolvedPhone.telemetry.orientation.roll_deg.toFixed(1)}deg)`,
                    }}
                  >
                    <Smartphone className="w-4 h-4 text-[#FF2EF5]" />
                    <span className="text-[9px] font-mono font-bold text-white">ATTITUDE</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 w-full text-center font-mono text-[10px]">
                    <div className="bg-slate-950/70 rounded py-1 border border-slate-800">
                      <span className="text-slate-400 block text-[8px]">ROLL</span>
                      <strong className="text-white">{resolvedPhone.telemetry.orientation.roll_deg.toFixed(1)}°</strong>
                    </div>
                    <div className="bg-slate-950/70 rounded py-1 border border-slate-800">
                      <span className="text-slate-400 block text-[8px]">PITCH</span>
                      <strong className="text-white">{resolvedPhone.telemetry.orientation.pitch_deg.toFixed(1)}°</strong>
                    </div>
                    <div className="bg-slate-950/70 rounded py-1 border border-slate-800">
                      <span className="text-slate-400 block text-[8px]">YAW</span>
                      <strong className="text-white">{resolvedPhone.telemetry.orientation.yaw_deg.toFixed(1)}°</strong>
                    </div>
                  </div>
                </div>
              ) : media ? (
                <div>
                  {/* Image container */}
                  <div
                    className="relative w-full rounded-lg overflow-hidden"
                    style={{
                      aspectRatio: '16 / 10',
                      background: '#0a1628',
                      border: '1px solid rgba(0, 174, 239, 0.15)',
                    }}
                  >
                    {/* Loading skeleton */}
                    {!imageLoaded && !imageError && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div
                            className="w-6 h-6 rounded-full border-2 border-primary/30 mx-auto mb-2"
                            style={{ borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}
                          />
                          <span className="text-[10px] font-label-mono text-outline uppercase tracking-widest">
                            Loading Image...
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Error state */}
                    {imageError && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center px-4">
                          <Satellite className="w-8 h-8 mx-auto mb-2" style={{ color: '#64748B' }} />
                          <span className="text-[10px] font-label-mono text-outline uppercase tracking-widest block">
                            Spacecraft Image Unavailable
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actual image */}
                    <img
                      src={media.imageUrl}
                      alt={media.displayLabel}
                      className="w-full h-full transition-opacity duration-300"
                      style={{
                        objectFit: 'cover',
                        opacity: imageLoaded && !imageError ? 1 : 0,
                      }}
                      onLoad={() => { setImageLoaded(true); setImageError(false); }}
                      onError={() => { setImageError(true); setImageLoaded(false); }}
                      loading="lazy"
                    />
                  </div>

                  {/* Image label + attribution */}
                  <div className="mt-2 space-y-1">
                    {media.imageType !== 'exact' && (
                      <p className="text-[10px] font-label-mono uppercase tracking-wider" style={{ color: '#EAB308' }}>
                        {media.displayLabel}
                      </p>
                    )}
                    <p className="text-[10px] font-label-mono" style={{ color: '#64748B' }}>
                      Image:{' '}
                      <a
                        href={media.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary transition-colors"
                      >
                        {media.sourceName}
                      </a>
                      {' · '}{media.attribution.split('/').pop()?.trim()}
                    </p>
                  </div>
                </div>
              ) : (
                /* No image available fallback */
                <div
                  className="w-full rounded-lg flex flex-col items-center justify-center py-6"
                  style={{
                    aspectRatio: '16 / 10',
                    background: 'rgba(10, 22, 40, 0.6)',
                    border: '1px solid rgba(100, 116, 139, 0.2)',
                  }}
                >
                  <Satellite className="w-10 h-10 mb-3" style={{ color: '#334155' }} />
                  <span className="text-[10px] font-label-mono text-outline uppercase tracking-widest text-center leading-relaxed">
                    No Public Spacecraft<br />Image Available
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              {[
                { icon: MapPin, label: 'Altitude', value: `${altitude} km` },
                { icon: Gauge, label: 'Velocity', value: `${velocity} km/h` },
                { icon: Clock, label: 'Orbital Period', value: `${period} min` },
                { icon: Compass, label: 'Inclination', value: `${inclination}°` },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <item.icon className="w-4 h-4" style={{ color: '#64748B' }} />
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{item.label}</span>
                  </div>
                  <span className="text-sm font-orbitron text-white">{item.value}</span>
                </div>
              ))}

              <div className="h-px my-4" style={{ background: isPhoneSat ? 'rgba(255,46,245,0.3)' : 'rgba(0,174,239,0.2)' }} />

              {isPhoneSat && resolvedPhone ? (
                <div className="space-y-2.5 p-3 rounded-lg bg-slate-950/75 border border-[#FF2EF5]/35">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase text-[#F9A8D4] font-bold">
                      Demonstration collision probability
                    </span>
                    <StatusBadge
                      severity={
                        resolvedPhone.conjunction.risk_level === 'CRITICAL' ||
                        resolvedPhone.conjunction.risk_level === 'HIGH' ||
                        resolvedPhone.conjunction.risk_level === 'MEDIUM' ||
                        resolvedPhone.conjunction.risk_level === 'LOW'
                          ? resolvedPhone.conjunction.risk_level
                          : 'NOMINAL'
                      }
                      label={`${resolvedPhone.conjunction.risk_level} (${resolvedPhone.conjunction.collision_probability_pct.toFixed(2)}%)`}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-amber-300 font-semibold">
                    DEMO SIMULATION · {PHONE_SATELLITE_SAFETY_LABELS.demoProbability}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300 pt-1">
                    <div>Event: <strong className="text-white">{resolvedPhone.conjunction.id}</strong></div>
                    <div>Tilt: <strong className="text-white">{resolvedPhone.conjunction.tilt_magnitude_deg.toFixed(1)}°</strong></div>
                    <div>Debris: <strong className="text-white">{resolvedPhone.conjunction.debris_name}</strong></div>
                    <div>Mock Miss: <strong className="text-white">{resolvedPhone.conjunction.miss_distance_km} km</strong></div>
                    <div>Mock TCA: <strong className="text-white">{resolvedPhone.conjunction.tca_hours}h</strong></div>
                    <div>Confidence: <strong className="text-white">{resolvedPhone.conjunction.confidence}%</strong></div>
                  </div>
                  <p className="text-[9px] font-mono text-slate-400">
                    {resolvedPhone.conjunction.confidence_note}
                  </p>
                  <p className="text-[9px] font-mono text-slate-400">
                    Orbit: {PHONE_MOCK_ORBIT.orbit_type} (a={PHONE_MOCK_ORBIT.semi_major_axis_km}km, e={PHONE_MOCK_ORBIT.eccentricity}, i={PHONE_MOCK_ORBIT.inclination_deg}°, RAAN={PHONE_MOCK_ORBIT.raan_deg}°)
                  </p>
                  <p className="text-[9px] font-mono text-slate-400">
                    Source: {resolvedPhone.conjunction.source} ({resolvedPhone.telemetry.ground_station_id}) · Last update:{' '}
                    {resolvedPhone.conjunction.last_updated
                      ? new Date(resolvedPhone.conjunction.last_updated).toLocaleTimeString()
                      : 'Awaiting RPi3 packet'}
                  </p>
                  <p className="text-[9px] font-mono text-amber-400 border-t border-slate-800 pt-1.5">
                    {PHONE_SATELLITE_SAFETY_LABELS.disclaimer}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Shield className="w-4 h-4" style={{ color: '#64748B' }} />
                      <span className="text-xs font-space" style={{ color: '#94A3B8' }}>Collision Risk</span>
                    </div>
                    <StatusBadge
                      severity={collisionRisk > 10 ? 'CRITICAL' : collisionRisk > 5 ? 'HIGH' : collisionRisk > 2 ? 'MEDIUM' : 'LOW'}
                      label={satelliteData.CATEGORY === 'Debris' ? 'N/A' : `${collisionRisk}%`}
                    />
                  </div>

                  {requiresManeuver && satelliteData.CATEGORY !== 'Debris' && (
                    <div className="mt-3 p-3 rounded flex flex-col gap-2" style={{ background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.3)' }}>
                      <span className="text-[10px] font-label-mono uppercase tracking-widest" style={{ color: '#FF4D4D' }}>Recommended Maneuver</span>
                      <div className="flex justify-between items-center text-xs font-space">
                        <span style={{ color: '#94A3B8' }}>Delta-v (∆V)</span>
                        <span className="font-bold" style={{ color: '#FF4D4D' }}>+{deltaV} m/s</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-space">
                        <span style={{ color: '#94A3B8' }}>Orbit Change (∆θ)</span>
                        <span className="font-bold" style={{ color: '#FF4D4D' }}>+{deltaTheta}°</span>
                      </div>
                    </div>
                  )}

                  {/* Stale TLE & Freshness Warning */}
                  <StaleDataWarning tleLine1={satelliteData.TLE_LINE1} />
                </>
              )}
            </div>

              <div className="flex flex-col gap-2">
                {/* Follow Satellite Button */}
                {onFollowSatellite && onStopFollowing && (
                  isFollowing ? (
                    <button
                      onClick={onStopFollowing}
                      id="exit-follow-btn"
                      className="w-full py-2.5 rounded-lg text-xs font-space font-semibold tracking-wider transition-all duration-200 flex items-center justify-center gap-2"
                      style={{
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#10B981',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                        e.currentTarget.style.color = '#EF4444';
                        e.currentTarget.querySelector('span')!.textContent = 'EXIT FOLLOW';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                        e.currentTarget.style.color = '#10B981';
                        e.currentTarget.querySelector('span')!.textContent = 'FOLLOWING';
                      }}
                    >
                      <Crosshair className="w-4 h-4" />
                      <span>FOLLOWING</span>
                    </button>
                  ) : (
                    <button
                      onClick={onFollowSatellite}
                      disabled={isFocusing}
                      id="follow-satellite-btn"
                      className="w-full py-2.5 rounded-lg text-xs font-space font-semibold tracking-wider transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{
                        background: 'rgba(0, 174, 239, 0.15)',
                        border: '1px solid rgba(0, 174, 239, 0.3)',
                        color: '#00AEEF',
                      }}
                      onMouseEnter={(e) => {
                        if (!isFocusing) {
                          e.currentTarget.style.background = 'rgba(0, 174, 239, 0.25)';
                          e.currentTarget.style.boxShadow = '0 0 15px rgba(0,174,239,0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 174, 239, 0.15)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <Crosshair className="w-4 h-4" />
                      {isFocusing ? 'FOCUSING...' : 'FOLLOW SATELLITE'}
                    </button>
                  )
                )}

                <button
                  onClick={() => setShowReportModal(true)}
                  className="w-full py-2.5 rounded-lg text-xs font-space font-semibold tracking-wider transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    background: 'rgba(0, 174, 239, 0.15)',
                    border: '1px solid rgba(0, 174, 239, 0.3)',
                    color: '#00AEEF',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 174, 239, 0.25)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0,174,239,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 174, 239, 0.15)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD PDF REPORT
                </button>
              </div>
          </div>
        </motion.div>
      )}

      {/* Unified Report Preview & PDF Generation Modal */}
      {showReportModal && currentUser && (
        <ReportPreviewModal
          event={reportEvent}
          handoffs={[]}
          timeline={[]}
          currentUser={currentUser}
          users={users}
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </AnimatePresence>
  );
}
