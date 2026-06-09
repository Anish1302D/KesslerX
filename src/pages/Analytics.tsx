import { motion } from 'framer-motion';
import { BarChart3, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { analyticsData, countryData } from '../data/mockData';

const customTooltipStyle = {
  backgroundColor: 'rgba(11, 18, 32, 0.95)',
  border: '1px solid rgba(0, 174, 239, 0.3)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '12px',
  fontFamily: 'Space Grotesk',
};

export default function Analytics() {
  return (
    <div className="space-y-5 pb-16">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
          <BarChart3 className="w-7 h-7" style={{ color: '#00AEEF', filter: 'drop-shadow(0 0 8px rgba(0,174,239,0.5))' }} />
          Analytics
        </h1>
        <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
          Executive orbital intelligence and trend analysis
        </p>
      </motion.div>

      {/* Satellite & Debris Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
              SATELLITE GROWTH
            </h3>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#00FF99' }} />
              <span className="text-[10px] font-space" style={{ color: '#00FF99' }}>+803%</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={analyticsData}>
              <defs>
                <linearGradient id="satGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00AEEF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00AEEF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Area type="monotone" dataKey="satellites" stroke="#00AEEF" fill="url(#satGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
              DEBRIS GROWTH
            </h3>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#FF4D4D' }} />
              <span className="text-[10px] font-space" style={{ color: '#FF4D4D' }}>+123%</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={analyticsData}>
              <defs>
                <linearGradient id="debGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFC107" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FFC107" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Area type="monotone" dataKey="debris" stroke="#FFC107" fill="url(#debGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Country Ownership & Collision Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            COUNTRY OWNERSHIP
          </h3>
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={250}>
              <PieChart>
                <Pie
                  data={countryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="satellites"
                  stroke="none"
                  paddingAngle={2}
                >
                  {countryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={customTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 pl-4">
              {countryData.map((item) => (
                <div key={item.country} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{item.country}</span>
                  </div>
                  <span className="text-xs font-orbitron text-white">{item.satellites.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            COLLISION TRENDS
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analyticsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Bar dataKey="collisions" fill="#FF4D4D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Orbital Utilization */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-5"
      >
        <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
          ORBITAL UTILIZATION TIMELINE
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analyticsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
            <Tooltip contentStyle={customTooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Space Grotesk', color: '#94A3B8' }} />
            <Line type="monotone" dataKey="satellites" stroke="#00AEEF" strokeWidth={2} dot={{ fill: '#00AEEF', r: 3 }} name="Satellites" />
            <Line type="monotone" dataKey="debris" stroke="#FFC107" strokeWidth={2} dot={{ fill: '#FFC107', r: 3 }} name="Debris" />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
