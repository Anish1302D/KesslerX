import { motion } from 'framer-motion';
import { alerts } from '../../data/mockData';
import AlertStack from '../alerts/AlertStack';
import OrbitalRiskGauge from '../dashboard/OrbitalRiskGauge';

export default function RightPanel() {
  return (
    <motion.aside
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-[340px] h-full flex-shrink-0 overflow-y-auto p-4 space-y-4 hidden xl:block"
      style={{
        background: 'rgba(5, 8, 22, 0.6)',
        borderLeft: '1px solid rgba(0, 174, 239, 0.1)',
      }}
    >
      {/* Orbital Risk Index */}
      <OrbitalRiskGauge value={72} status="HIGH" />

      {/* Live Alerts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
            LIVE ALERTS
          </h3>
          <span
            className="text-[10px] font-space px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255, 77, 77, 0.15)', color: '#FF4D4D', border: '1px solid rgba(255,77,77,0.3)' }}
          >
            {alerts.length} active
          </span>
        </div>
        <AlertStack alerts={alerts} />
      </div>
    </motion.aside>
  );
}
