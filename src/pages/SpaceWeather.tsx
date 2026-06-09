import { motion } from 'framer-motion';
import { Sun, Wind, Zap, Activity, Radio, Shield, ThermometerSun, Flame } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { solarActivityTimeline, spaceWeather } from '../data/mockData';

const customTooltipStyle = {
  backgroundColor: 'rgba(11, 18, 32, 0.95)',
  border: '1px solid rgba(0, 174, 239, 0.3)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '12px',
  fontFamily: 'Space Grotesk',
};

export default function SpaceWeather() {
  return (
    <div className="space-y-5 pb-16">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
          <Sun className="w-7 h-7" style={{ color: '#FFC107', filter: 'drop-shadow(0 0 8px rgba(255,193,7,0.5))' }} />
          Space Weather Center
        </h1>
        <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
          Solar activity monitoring and geomagnetic conditions
        </p>
      </motion.div>

      {/* Current Conditions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Solar Activity', value: spaceWeather.solarActivity, icon: Sun, color: '#FFC107' },
          { label: 'Kp Index', value: `${spaceWeather.kpIndex}/9`, icon: Activity, color: spaceWeather.kpIndex > 4 ? '#FF4D4D' : '#00FF99' },
          { label: 'Solar Wind', value: `${spaceWeather.solarWind} km/s`, icon: Wind, color: '#00AEEF' },
          { label: 'Bz Component', value: `${spaceWeather.bz} nT`, icon: Zap, color: spaceWeather.bz < 0 ? '#FF4D4D' : '#00FF99' },
          { label: 'Proton Flux', value: `${spaceWeather.protonFlux} pfu`, icon: Radio, color: '#9B59B6' },
          { label: 'X-Ray Flux', value: spaceWeather.xrayFlux, icon: Flame, color: '#FF8C00' },
          { label: 'Flare Class', value: spaceWeather.solarFlareClass, icon: ThermometerSun, color: '#FFC107' },
          { label: 'Radiation', value: 'Normal', icon: Shield, color: '#00FF99' },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-panel glass-panel-hover p-4"
          >
            <item.icon className="w-5 h-5 mb-2" style={{ color: item.color, filter: `drop-shadow(0 0 4px ${item.color})` }} />
            <p className="text-[10px] font-space tracking-wider mb-1" style={{ color: '#64748B' }}>{item.label}</p>
            <p className="text-lg font-orbitron font-bold" style={{ color: item.color }}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Sun Visualization + Kp Index */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sun Visualization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-5 flex flex-col items-center justify-center"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-6 self-start" style={{ color: '#94A3B8' }}>
            SOLAR ACTIVITY MONITOR
          </h3>
          <div className="relative">
            {/* Sun body */}
            <div
              className="w-40 h-40 rounded-full relative"
              style={{
                background: 'radial-gradient(circle at 40% 40%, #FFF176 0%, #FFC107 30%, #FF8C00 60%, #FF4D4D 90%)',
                boxShadow: '0 0 60px rgba(255,193,7,0.5), 0 0 120px rgba(255,140,0,0.3), 0 0 200px rgba(255,77,77,0.15)',
              }}
            >
              {/* Sunspots */}
              <div className="absolute w-4 h-3 rounded-full" style={{ background: 'rgba(200,100,0,0.5)', top: '35%', left: '30%' }} />
              <div className="absolute w-3 h-3 rounded-full" style={{ background: 'rgba(200,100,0,0.4)', top: '50%', left: '55%' }} />
              <div className="absolute w-2 h-2 rounded-full" style={{ background: 'rgba(200,100,0,0.3)', top: '30%', left: '60%' }} />
            </div>
            {/* Corona rings */}
            {[0, 1, 2, 3].map((ring) => (
              <div
                key={ring}
                className="absolute rounded-full"
                style={{
                  inset: `${-12 - ring * 10}px`,
                  border: `1px solid rgba(255, 193, 7, ${0.2 - ring * 0.04})`,
                  animation: `pulse-glow ${3 + ring * 0.8}s ease-in-out infinite`,
                  animationDelay: `${ring * 0.4}s`,
                }}
              />
            ))}
            {/* Solar flare */}
            <div
              className="absolute w-6 h-12 -right-3 top-1/3"
              style={{
                background: 'linear-gradient(90deg, rgba(255,193,7,0.4), transparent)',
                borderRadius: '0 50% 50% 0',
                animation: 'pulse-glow 2s ease-in-out infinite',
                filter: 'blur(3px)',
              }}
            />
          </div>
          <p className="mt-6 text-sm font-space" style={{ color: '#94A3B8' }}>Current Flare: <span style={{ color: '#FFC107' }}>{spaceWeather.xrayFlux}</span></p>
        </motion.div>

        {/* Kp Index Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            KP INDEX — 24HR
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={solarActivityTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Space Grotesk' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Bar dataKey="kp" radius={[4, 4, 0, 0]}>
                {solarActivityTimeline.map((entry, i) => (
                  <motion.rect key={i} fill={entry.kp > 5 ? '#FF4D4D' : entry.kp > 3 ? '#FFC107' : '#00FF99'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Solar Wind & Bz */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            SOLAR WIND SPEED
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={solarActivityTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Line type="monotone" dataKey="solarWind" stroke="#00AEEF" strokeWidth={2} dot={{ fill: '#00AEEF', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            Bz COMPONENT (IMF)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={solarActivityTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,174,239,0.1)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: 'rgba(0,174,239,0.15)' }} />
              <Tooltip contentStyle={customTooltipStyle} />
              <Line type="monotone" dataKey="bz" stroke="#FF4D4D" strokeWidth={2} dot={{ fill: '#FF4D4D', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}
