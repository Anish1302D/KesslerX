import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const colors: Record<string, string> = {
  LEO: '#FF4D4D',
  MEO: '#FFC107',
  GEO: '#00AEEF',
};

const labels: Record<string, string> = {
  LEO: 'Low Earth Orbit',
  MEO: 'Medium Earth Orbit',
  GEO: 'Geostationary Orbit',
};

// Fallback data
const defaultCongestion: Record<string, number> = {
  LEO: 78,
  MEO: 32,
  GEO: 18,
};

export default function OrbitalCongestion() {
  const [congestion, setCongestion] = useState(defaultCongestion);

  useEffect(() => {
    const fetchCongestion = async () => {
      try {
        const res = await fetch(`${API}/api/congestion`);
        if (!res.ok) return;
        const data = await res.json();
        setCongestion({
          LEO: Math.round((data.leo?.density ?? 0.78) * 100),
          MEO: Math.round((data.meo?.density ?? 0.32) * 100),
          GEO: Math.round((data.geo?.density ?? 0.18) * 100),
        });
      } catch {
        // Keep fallback values
      }
    };
    fetchCongestion();
    const interval = setInterval(fetchCongestion, 60000);
    return () => clearInterval(interval);
  }, []);

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
        {Object.entries(congestion).map(([orbit, value], i) => (
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
