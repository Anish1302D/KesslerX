import { motion } from 'framer-motion';
import { FileText, Download, Eye, Clock, Shield } from 'lucide-react';
import { reports } from '../data/mockData';
import StatusBadge from '../components/ui/StatusBadge';

const riskColors: Record<string, string> = {
  NOMINAL: '#00FF99',
  MODERATE: '#FFC107',
  ELEVATED: '#FF8C00',
  HIGH: '#FF4D4D',
};

const typeIcons: Record<string, string> = {
  daily: '📋',
  weekly: '📊',
  quarterly: '📈',
  special: '🛰️',
};

export default function Reports() {
  return (
    <div className="space-y-5 pb-16">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7" style={{ color: '#00AEEF', filter: 'drop-shadow(0 0 8px rgba(0,174,239,0.5))' }} />
            Reports
          </h1>
          <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
            Orbital situation reports and risk assessments
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-space text-sm font-semibold transition-all duration-200 hover:scale-105"
          style={{ background: 'rgba(0,174,239,0.15)', border: '1px solid rgba(0,174,239,0.3)', color: '#00AEEF' }}
        >
          <FileText className="w-4 h-4" />
          Generate Report
        </button>
      </motion.div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Reports', value: '156', color: '#00AEEF', icon: FileText },
          { label: 'This Week', value: '5', color: '#00E5FF', icon: Clock },
          { label: 'Pending Review', value: '2', color: '#FFC107', icon: Eye },
          { label: 'Risk Escalations', value: '3', color: '#FF4D4D', icon: Shield },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            className="glass-panel glass-panel-hover p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>{card.label}</span>
              <card.icon className="w-4 h-4" style={{ color: card.color }} />
            </div>
            <span className="text-2xl font-orbitron font-bold" style={{ color: card.color }}>{card.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report, i) => (
          <motion.div
            key={report.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="glass-panel glass-panel-hover p-5 cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{typeIcons[report.type]}</span>
                <div>
                  <h4 className="text-sm font-space font-medium text-white">{report.title}</h4>
                  <p className="text-[10px] font-space mt-0.5" style={{ color: '#64748B' }}>{report.date} · {report.pages} pages</p>
                </div>
              </div>
              <StatusBadge
                severity={report.riskLevel === 'HIGH' ? 'HIGH' : report.riskLevel === 'ELEVATED' ? 'MEDIUM' : report.riskLevel === 'MODERATE' ? 'MEDIUM' : 'NOMINAL'}
                label={report.riskLevel}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <span
                className="text-[10px] font-space px-2 py-1 rounded-full"
                style={{
                  background: report.status === 'Ready' ? 'rgba(0,255,153,0.1)' : 'rgba(255,193,7,0.1)',
                  color: report.status === 'Ready' ? '#00FF99' : '#FFC107',
                  border: `1px solid ${report.status === 'Ready' ? 'rgba(0,255,153,0.2)' : 'rgba(255,193,7,0.2)'}`,
                }}
              >
                {report.status === 'Ready' ? '✓ Ready' : '⟳ Generating...'}
              </span>

              <div className="flex gap-2">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-space transition-all duration-200 hover:scale-105"
                  style={{ background: 'rgba(0,174,239,0.1)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.2)' }}
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-space transition-all duration-200 hover:scale-105"
                  style={{ background: 'rgba(0,255,153,0.1)', color: '#00FF99', border: '1px solid rgba(0,255,153,0.2)' }}
                  disabled={report.status !== 'Ready'}
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
