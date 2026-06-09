import { useState, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Satellite, Trash2, AlertTriangle, Target, CloudSun, BarChart3 } from 'lucide-react';
import MetricCard from '../components/dashboard/MetricCard';
import OrbitalCongestion from '../components/dashboard/OrbitalCongestion';
import CloseApproachTable from '../components/dashboard/CloseApproachTable';
import SpaceWeatherMini from '../components/dashboard/SpaceWeatherMini';
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

export default function Dashboard() {
  const [selectedObject, setSelectedObject] = useState<SatType | null>(null);
  const [filters, setFilters] = useState(defaultFilters);

  const toggleFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        <MetricCard
          title="ACTIVE SATELLITES"
          value={dashboardMetrics.activeSatellites.value}
          icon={Satellite}
          color="#00AEEF"
          trend={dashboardMetrics.activeSatellites.trend}
          trendDir="up"
          delay={0.1}
        />
        <MetricCard
          title="TRACKED DEBRIS"
          value={dashboardMetrics.trackedDebris.value}
          icon={Trash2}
          color="#FFC107"
          trend={dashboardMetrics.trackedDebris.trend}
          trendDir="up"
          delay={0.15}
        />
        <MetricCard
          title="HIGH RISK OBJECTS"
          value={dashboardMetrics.highRiskObjects.value}
          icon={AlertTriangle}
          color="#FF4D4D"
          trend={dashboardMetrics.highRiskObjects.trend}
          trendDir="down"
          delay={0.2}
        />
        <MetricCard
          title="PREDICTED COLLISIONS"
          value={dashboardMetrics.predictedCollisions.value}
          icon={Target}
          color="#FF4D4D"
          trend={0}
          trendDir="neutral"
          delay={0.25}
        />
        <MetricCard
          title="SPACE WEATHER"
          value={dashboardMetrics.spaceWeatherIndex.value}
          icon={CloudSun}
          color="#FFC107"
          severity="MEDIUM"
          delay={0.3}
        />
        <MetricCard
          title="ORBITAL CONGESTION"
          value={dashboardMetrics.orbitalCongestion.value}
          icon={BarChart3}
          color="#FF4D4D"
          severity="HIGH"
          delay={0.35}
        />
      </div>

      {/* Globe + Filters */}
      <div className="relative">
        <Suspense
          fallback={
            <div
              className="w-full h-[500px] rounded-xl flex items-center justify-center"
              style={{ background: '#0B1220', border: '1px solid rgba(0,174,239,0.2)' }}
            >
              <div className="text-center">
                <div
                  className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-3"
                  style={{ borderColor: 'rgba(0,174,239,0.3)', borderTopColor: 'transparent', animation: 'orbit 1s linear infinite' }}
                />
                <span className="text-sm font-space" style={{ color: '#94A3B8' }}>Initializing Globe...</span>
              </div>
            </div>
          }
        >
          <CesiumGlobe onSelectObject={setSelectedObject} filters={filters} />
        </Suspense>

        {/* Object Details Overlay */}
        <ObjectDetailsPanel satellite={selectedObject} onClose={() => setSelectedObject(null)} />

        {/* Filter Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-4 left-4 glass-panel-strong p-3 z-10"
        >
          <h4 className="text-[10px] font-space font-semibold tracking-widest mb-2" style={{ color: '#94A3B8' }}>
            OBJECT FILTERS
          </h4>
          <div className="space-y-1.5">
            {Object.entries(filters).map(([key, enabled]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleFilter(key)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded border flex items-center justify-center transition-all duration-200"
                  style={{
                    borderColor: enabled ? '#00AEEF' : 'rgba(148,163,184,0.3)',
                    background: enabled ? 'rgba(0,174,239,0.2)' : 'transparent',
                  }}
                >
                  {enabled && (
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#00AEEF" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-space group-hover:text-white transition-colors" style={{ color: enabled ? '#fff' : '#64748B' }}>
                  {key}
                </span>
              </label>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Lower Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OrbitalCongestion />
        <SpaceWeatherMini />
      </div>

      <CloseApproachTable />
    </div>
  );
}
