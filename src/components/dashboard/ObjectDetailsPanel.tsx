import { motion, AnimatePresence } from 'framer-motion';
import type { Satellite } from '../../data/mockData';
import { X, MapPin, Gauge, Clock, Compass, Shield } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';

interface ObjectDetailsPanelProps {
  satellite: Satellite | null;
  onClose: () => void;
}

export default function ObjectDetailsPanel({ satellite, onClose }: ObjectDetailsPanelProps) {
  return (
    <AnimatePresence>
      {satellite && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 right-4 w-72 z-20 glass-panel-strong p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-orbitron font-bold text-white">{satellite.name}</h4>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[rgba(0,174,239,0.2)]"
            >
              <X className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span
              className="text-[10px] font-space px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,174,239,0.15)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.3)' }}
            >
              {satellite.type}
            </span>
            <span className="text-[10px] font-space" style={{ color: '#64748B' }}>{satellite.country}</span>
          </div>

          <div className="space-y-3">
            {[
              { icon: MapPin, label: 'Altitude', value: `${satellite.altitude.toLocaleString()} km` },
              { icon: Gauge, label: 'Velocity', value: `${satellite.velocity.toLocaleString()} km/h` },
              { icon: Clock, label: 'Orbital Period', value: `${satellite.period} min` },
              { icon: Compass, label: 'Inclination', value: `${satellite.inclination}°` },
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
                severity={satellite.collisionRisk > 5 ? 'HIGH' : satellite.collisionRisk > 2 ? 'MEDIUM' : 'LOW'}
                label={`${satellite.collisionRisk}%`}
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
