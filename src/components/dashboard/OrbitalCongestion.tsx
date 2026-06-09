import { motion } from 'framer-motion';
import { orbitalCongestion } from '../../data/mockData';

const colors: Record<string, string> = {
  LEO: '#FF4D4D',
  MEO: '#FFC107',
  GEO: '#00AEEF',
  HEO: '#00FF99',
};

const labels: Record<string, string> = {
  LEO: 'Low Earth Orbit',
  MEO: 'Medium Earth Orbit',
  GEO: 'Geostationary Orbit',
  HEO: 'Highly Elliptical Orbit',
};

export default function OrbitalCongestion() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="glass-panel p-5"
    >
      <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
        ORBITAL CONGESTION
      </h3>

      <div className="space-y-4">
        {Object.entries(orbitalCongestion).map(([orbit, value], i) => (
          <div key={orbit}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-orbitron font-bold text-white">{orbit}</span>
                <span className="text-[10px] font-space" style={{ color: '#64748B' }}>{labels[orbit]}</span>
              </div>
              <span className="text-sm font-orbitron font-bold" style={{ color: colors[orbit] }}>
                {value}%
              </span>
            </div>
            <div className="progress-bar-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 1.5, delay: 0.8 + i * 0.15, ease: 'easeOut' }}
                className="progress-bar-fill"
                style={{
                  background: `linear-gradient(90deg, ${colors[orbit]}80, ${colors[orbit]})`,
                  boxShadow: `0 0 10px ${colors[orbit]}40`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
