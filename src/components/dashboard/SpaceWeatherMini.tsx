import { motion } from 'framer-motion';
import { spaceWeather } from '../../data/mockData';
import { Sun, Wind, Zap, Activity } from 'lucide-react';

const items = [
  { label: 'Solar Activity', value: spaceWeather.solarActivity, icon: Sun, color: '#FFC107' },
  { label: 'Kp Index', value: `${spaceWeather.kpIndex}/9`, icon: Activity, color: spaceWeather.kpIndex > 4 ? '#FF4D4D' : '#00FF99' },
  { label: 'Solar Wind', value: `${spaceWeather.solarWind} km/s`, icon: Wind, color: '#00AEEF' },
  { label: 'Bz Component', value: `${spaceWeather.bz} nT`, icon: Zap, color: spaceWeather.bz < 0 ? '#FF4D4D' : '#00FF99' },
];

export default function SpaceWeatherMini() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
      className="glass-panel p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sun className="w-4 h-4" style={{ color: '#FFC107', filter: 'drop-shadow(0 0 6px rgba(255,193,7,0.5))' }} />
        <h3 className="text-sm font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
          SPACE WEATHER
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9 + i * 0.1 }}
            className="rounded-lg p-3 transition-all duration-200 hover:scale-105"
            style={{
              background: 'rgba(11, 18, 32, 0.6)',
              border: '1px solid rgba(0, 174, 239, 0.1)',
            }}
          >
            <item.icon className="w-4 h-4 mb-1.5" style={{ color: item.color }} />
            <p className="text-[10px] font-space mb-0.5" style={{ color: '#64748B' }}>{item.label}</p>
            <p className="text-sm font-orbitron font-bold" style={{ color: item.color }}>
              {item.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Animated sun */}
      <div className="mt-4 flex justify-center">
        <div className="relative">
          <div
            className="w-16 h-16 rounded-full"
            style={{
              background: 'radial-gradient(circle, #FFC107 0%, #FF8C00 40%, #FF4D4D 70%, transparent 100%)',
              boxShadow: '0 0 30px rgba(255, 193, 7, 0.4), 0 0 60px rgba(255, 140, 0, 0.2)',
              animation: 'pulse-glow 3s ease-in-out infinite',
            }}
          />
          {/* Corona rings */}
          {[0, 1, 2].map((ring) => (
            <div
              key={ring}
              className="absolute rounded-full"
              style={{
                inset: `${-8 - ring * 6}px`,
                border: `1px solid rgba(255, 193, 7, ${0.15 - ring * 0.04})`,
                animation: `pulse-glow ${3 + ring * 0.5}s ease-in-out infinite`,
                animationDelay: `${ring * 0.3}s`,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
