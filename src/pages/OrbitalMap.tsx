import { Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe2, Layers, Search, Maximize2 } from 'lucide-react';
import ObjectDetailsPanel from '../components/dashboard/ObjectDetailsPanel';
import type { Satellite } from '../data/mockData';

const CesiumGlobe = lazy(() => import('../components/dashboard/CesiumGlobe'));

const defaultFilters: Record<string, boolean> = {
  Communication: true,
  Debris: true,
  ISS: true,
  Weather: true,
  Military: true,
  GPS: true,
  Scientific: true,
};

export default function OrbitalMap() {
  const [selectedObject, setSelectedObject] = useState<Satellite | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [showFilters, setShowFilters] = useState(true);

  const toggleFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
            <Globe2 className="w-7 h-7" style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.5))' }} />
            Orbital Map
          </h1>
          <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
            Full-screen interactive orbital visualization
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-space transition-all duration-200"
            style={{ background: 'rgba(0,174,239,0.1)', border: '1px solid rgba(0,174,239,0.2)', color: '#00AEEF' }}
          >
            <Layers className="w-3.5 h-3.5" />
            Filters
          </button>
        </div>
      </motion.div>

      {/* Globe */}
      <div className="flex-1 relative rounded-xl overflow-hidden">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#0B1220', border: '1px solid rgba(0,174,239,0.2)' }}>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-3"
                  style={{ borderColor: 'rgba(0,174,239,0.3)', borderTopColor: 'transparent', animation: 'orbit 1s linear infinite' }} />
                <span className="text-sm font-space" style={{ color: '#94A3B8' }}>Loading Orbital Map...</span>
              </div>
            </div>
          }
        >
          <div className="h-full [&>div]:!h-full [&>div>div]:!h-full">
            <CesiumGlobe onSelectObject={setSelectedObject} filters={filters} />
          </div>
        </Suspense>

        {/* Object Details */}
        <ObjectDetailsPanel satellite={selectedObject} onClose={() => setSelectedObject(null)} />

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 left-4 glass-panel-strong p-4 z-10 w-56"
          >
            <h4 className="text-[10px] font-space font-semibold tracking-widest mb-3" style={{ color: '#94A3B8' }}>
              LAYER CONTROLS
            </h4>
            <div className="space-y-2">
              {Object.entries(filters).map(([key, enabled]) => {
                const colors: Record<string, string> = {
                  Communication: '#00AEEF', Debris: '#FF4D4D', ISS: '#FFFFFF', Weather: '#FFC107',
                  Military: '#FF4D4D', GPS: '#00FF99', Scientific: '#9B59B6',
                };
                return (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                    <input type="checkbox" checked={enabled} onChange={() => toggleFilter(key)} className="sr-only" />
                    <div className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                      style={{ borderColor: enabled ? colors[key] : 'rgba(148,163,184,0.3)', background: enabled ? `${colors[key]}20` : 'transparent' }}>
                      {enabled && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke={colors[key]} strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="w-2 h-2 rounded-full" style={{ background: colors[key] }} />
                    <span className="text-xs font-space" style={{ color: enabled ? '#fff' : '#64748B' }}>{key}</span>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
