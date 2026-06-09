import { useState, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Satellite, Trash2, AlertTriangle, Target, CloudSun, BarChart3 } from 'lucide-react';
import MetricCard from '../components/dashboard/MetricCard';
import OrbitalCongestion from '../components/dashboard/OrbitalCongestion';
import CloseApproachTable from '../components/dashboard/CloseApproachTable';
import ObjectDetailsPanel from '../components/dashboard/ObjectDetailsPanel';
import { dashboardMetrics, type Satellite as SatType } from '../data/mockData';

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

const filterColors: Record<string, string> = {
  Communication: '#00AEEF',
  Debris: '#FF4D4D',
  ISS: '#FFFFFF',
  Weather: '#FFC107',
  Military: '#FF4D4D',
  GPS: '#00FF99',
  Scientific: '#9B59B6',
};

export default function Dashboard() {
  const [selectedObject, setSelectedObject] = useState<SatType | null>(null);
  const [filters, setFilters] = useState(defaultFilters);

  const toggleFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Page Title — subtle */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-orbitron font-bold text-white tracking-wide">
            Mission Control
          </h1>
          <p className="text-xs font-space mt-0.5" style={{ color: '#64748B' }}>
            Real-time orbital situational awareness
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-dot status-dot-success" />
          <span className="text-[10px] font-space" style={{ color: '#94A3B8' }}>All systems nominal</span>
        </div>
      </motion.div>

      {/* Metric Cards — 3 columns on medium, 6 on large */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          title="ACTIVE SATELLITES"
          value={dashboardMetrics.activeSatellites.value}
          icon={Satellite}
          color="#00AEEF"
          trend={dashboardMetrics.activeSatellites.trend}
          trendDir="up"
          delay={0.05}
        />
        <MetricCard
          title="TRACKED DEBRIS"
          value={dashboardMetrics.trackedDebris.value}
          icon={Trash2}
          color="#FFC107"
          trend={dashboardMetrics.trackedDebris.trend}
          trendDir="up"
          delay={0.1}
        />
        <MetricCard
          title="HIGH RISK OBJECTS"
          value={dashboardMetrics.highRiskObjects.value}
          icon={AlertTriangle}
          color="#FF4D4D"
          trend={dashboardMetrics.highRiskObjects.trend}
          trendDir="down"
          delay={0.15}
        />
        <MetricCard
          title="PREDICTED COLLISIONS"
          value={dashboardMetrics.predictedCollisions.value}
          icon={Target}
          color="#FF4D4D"
          trend={0}
          trendDir="neutral"
          delay={0.2}
        />
        <MetricCard
          title="SPACE WEATHER"
          value={dashboardMetrics.spaceWeatherIndex.value}
          icon={CloudSun}
          color="#FFC107"
          severity="MEDIUM"
          delay={0.25}
        />
        <MetricCard
          title="ORBITAL CONGESTION"
          value={dashboardMetrics.orbitalCongestion.value}
          icon={BarChart3}
          color="#FF4D4D"
          severity="HIGH"
          delay={0.3}
        />
      </div>

      {/* Globe Section — with inline filter bar above */}
      <div className="space-y-3">
        {/* Filter bar — horizontal above globe, not overlapping */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-panel px-4 py-2.5 flex items-center gap-4 flex-wrap"
        >
          <span className="text-[10px] font-space font-semibold tracking-widest flex-shrink-0" style={{ color: '#64748B' }}>
            OBJECT FILTERS
          </span>
          <div className="h-4 w-px flex-shrink-0" style={{ background: 'rgba(0,174,239,0.15)' }} />
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(filters).map(([key, enabled]) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleFilter(key)}
                  className="sr-only"
                />
                <div
                  className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-all duration-200"
                  style={{
                    borderColor: enabled ? filterColors[key] : 'rgba(148,163,184,0.3)',
                    background: enabled ? `${filterColors[key]}20` : 'transparent',
                  }}
                >
                  {enabled && (
                    <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke={filterColors[key]} strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] font-space group-hover:text-white transition-colors" style={{ color: enabled ? '#fff' : '#64748B' }}>
                  {key}
                </span>
              </label>
            ))}
          </div>
        </motion.div>

        {/* Globe */}
        <div className="relative">
          <Suspense
            fallback={
              <div
                className="w-full h-[460px] rounded-xl flex items-center justify-center"
                style={{ background: '#0B1220', border: '1px solid rgba(0,174,239,0.15)' }}
              >
                <div className="text-center">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-t-transparent mx-auto mb-3"
                    style={{ borderColor: 'rgba(0,174,239,0.3)', borderTopColor: 'transparent', animation: 'orbit 1s linear infinite' }}
                  />
                  <span className="text-xs font-space" style={{ color: '#94A3B8' }}>Initializing Globe...</span>
                </div>
              </div>
            }
          >
            <CesiumGlobe onSelectObject={setSelectedObject} filters={filters} />
          </Suspense>

          {/* Object Details Overlay */}
          <ObjectDetailsPanel satellite={selectedObject} onClose={() => setSelectedObject(null)} />
        </div>
      </div>

      {/* Lower Sections — single column with clean spacing */}
      <OrbitalCongestion />
      <CloseApproachTable />
    </div>
  );
}
