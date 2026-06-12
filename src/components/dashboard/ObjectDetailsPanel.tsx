import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Gauge, Clock, Compass, Shield } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import * as satellite from 'satellite.js';

interface ObjectDetailsPanelProps {
  satelliteData: any | null;
  onClose: () => void;
}

export default function ObjectDetailsPanel({ satelliteData, onClose }: ObjectDetailsPanelProps) {
  // Parse TLE to get real stats
  let altitude = 'Unknown';
  let velocity = 'Unknown';
  let inclination = 'Unknown';
  let period = 'Unknown';

  if (satelliteData && satelliteData.TLE_LINE1 && satelliteData.TLE_LINE2) {
    try {
      const satrec = satellite.twoline2satrec(satelliteData.TLE_LINE1, satelliteData.TLE_LINE2);
      const positionAndVelocity = satellite.propagate(satrec, new Date());
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
    } catch (e) {
      // Fallback
    }
  }

  // Generate a stable fake collision risk based on ID
  const collisionRisk = satelliteData ? (satelliteData.NORAD_CAT_ID % 15) : 0;

  return (
    <AnimatePresence>
      {satelliteData && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 right-4 w-72 z-20 glass-panel-strong p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-orbitron font-bold text-white truncate pr-2">
              {satelliteData.OBJECT_NAME || `Object ${satelliteData.NORAD_CAT_ID}`}
            </h4>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[rgba(0,174,239,0.2)] shrink-0"
            >
              <X className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span
              className="text-[10px] font-space px-2 py-0.5 rounded-full uppercase"
              style={{ background: 'rgba(0,174,239,0.15)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.3)' }}
            >
              {satelliteData.OBJECT_TYPE || 'UNKNOWN'}
            </span>
            <span className="text-[10px] font-space" style={{ color: '#64748B' }}>NORAD: {satelliteData.NORAD_CAT_ID}</span>
          </div>

          <div className="space-y-3">
            {[
              { icon: MapPin, label: 'Altitude', value: `${altitude} km` },
              { icon: Gauge, label: 'Velocity', value: `${velocity} km/h` },
              { icon: Clock, label: 'Orbital Period', value: `${period} min` },
              { icon: Compass, label: 'Inclination', value: `${inclination}°` },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <item.icon className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
                  <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{item.label}</span>
                </div>
                <span className="text-xs font-orbitron text-white">{item.value}</span>
              </div>
            ))}

            <div className="h-px" style={{ background: 'rgba(0,174,239,0.15)' }} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
                <span className="text-xs font-space" style={{ color: '#94A3B8' }}>Collision Risk</span>
              </div>
              <StatusBadge
                severity={collisionRisk > 8 ? 'HIGH' : collisionRisk > 3 ? 'MEDIUM' : 'LOW'}
                label={`${collisionRisk}%`}
              />
            </div>
          </div>

          <button
            className="mt-4 w-full py-2 rounded-lg text-xs font-space font-semibold tracking-wider transition-all duration-200"
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
            VIEW FULL DETAILS
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
