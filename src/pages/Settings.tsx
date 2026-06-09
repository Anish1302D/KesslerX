import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Monitor, Bell, Key, Globe, Shield, Palette, Save } from 'lucide-react';

interface SettingGroup {
  id: string;
  label: string;
  icon: typeof Monitor;
  settings: Array<{
    id: string;
    label: string;
    description: string;
    type: 'toggle' | 'select' | 'input';
    value: any;
    options?: string[];
  }>;
}

const settingGroups: SettingGroup[] = [
  {
    id: 'display', label: 'Display', icon: Monitor,
    settings: [
      { id: 'theme', label: 'Theme', description: 'Dashboard color scheme', type: 'select', value: 'Dark Aerospace', options: ['Dark Aerospace', 'Midnight', 'Cyber'] },
      { id: 'animations', label: 'Animations', description: 'Enable UI animations and transitions', type: 'toggle', value: true },
      { id: 'particles', label: 'Background Particles', description: 'Floating particle effects', type: 'toggle', value: true },
      { id: 'density', label: 'Information Density', description: 'Amount of data shown per panel', type: 'select', value: 'Standard', options: ['Compact', 'Standard', 'Expanded'] },
    ],
  },
  {
    id: 'notifications', label: 'Notifications', icon: Bell,
    settings: [
      { id: 'collision', label: 'Collision Alerts', description: 'Notifications for conjunction events', type: 'toggle', value: true },
      { id: 'weather', label: 'Space Weather Alerts', description: 'Solar storm and geomagnetic warnings', type: 'toggle', value: true },
      { id: 'debris', label: 'Debris Alerts', description: 'New debris detection notifications', type: 'toggle', value: true },
      { id: 'sound', label: 'Alert Sounds', description: 'Audible notifications for critical events', type: 'toggle', value: false },
    ],
  },
  {
    id: 'api', label: 'API Configuration', icon: Key,
    settings: [
      { id: 'cesium', label: 'Cesium Ion Token', description: 'Access token for 3D globe imagery', type: 'input', value: '' },
      { id: 'ai', label: 'AI API Key', description: 'Gemini or OpenAI API key for AI Copilot', type: 'input', value: '' },
      { id: 'spacetrack', label: 'Space-Track Credentials', description: 'Login for TLE data access', type: 'input', value: '' },
    ],
  },
  {
    id: 'globe', label: 'Globe Settings', icon: Globe,
    settings: [
      { id: 'autorotate', label: 'Auto Rotate', description: 'Globe auto-rotation when idle', type: 'toggle', value: true },
      { id: 'labels', label: 'Object Labels', description: 'Show satellite/debris labels', type: 'toggle', value: true },
      { id: 'orbits', label: 'Orbit Paths', description: 'Display orbital trajectory lines', type: 'toggle', value: true },
      { id: 'quality', label: 'Render Quality', description: 'Globe rendering quality', type: 'select', value: 'High', options: ['Low', 'Medium', 'High', 'Ultra'] },
    ],
  },
];

export default function Settings() {
  const [activeGroup, setActiveGroup] = useState('display');
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {};
    settingGroups.forEach((g) => g.settings.forEach((s) => { v[s.id] = s.value; }));
    return v;
  });

  const currentGroup = settingGroups.find((g) => g.id === activeGroup)!;

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
          <SettingsIcon className="w-7 h-7" style={{ color: '#94A3B8' }} />
          Settings
        </h1>
        <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
          Configure your KesslerX environment
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Settings Navigation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-3 space-y-1"
        >
          {settingGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200"
              style={{
                background: activeGroup === group.id ? 'rgba(0,174,239,0.1)' : 'transparent',
                color: activeGroup === group.id ? '#00AEEF' : '#94A3B8',
                borderLeft: activeGroup === group.id ? '3px solid #00AEEF' : '3px solid transparent',
              }}
            >
              <group.icon className="w-4 h-4" />
              <span className="text-sm font-space">{group.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Settings Panel */}
        <motion.div
          key={activeGroup}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-3 glass-panel p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <currentGroup.icon className="w-5 h-5" style={{ color: '#00AEEF' }} />
            <h3 className="text-lg font-space font-semibold text-white">{currentGroup.label}</h3>
          </div>

          <div className="space-y-4">
            {currentGroup.settings.map((setting) => (
              <div
                key={setting.id}
                className="flex items-center justify-between p-4 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.03)]"
                style={{ border: '1px solid rgba(0,174,239,0.08)' }}
              >
                <div>
                  <p className="text-sm font-space font-medium text-white">{setting.label}</p>
                  <p className="text-xs font-inter mt-0.5" style={{ color: '#64748B' }}>{setting.description}</p>
                </div>

                {setting.type === 'toggle' && (
                  <button
                    onClick={() => setValues((v) => ({ ...v, [setting.id]: !v[setting.id] }))}
                    className="w-11 h-6 rounded-full transition-all duration-200 relative"
                    style={{
                      background: values[setting.id] ? 'rgba(0,174,239,0.3)' : 'rgba(148,163,184,0.2)',
                      border: `1px solid ${values[setting.id] ? 'rgba(0,174,239,0.5)' : 'rgba(148,163,184,0.3)'}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full absolute top-0.5 transition-all duration-200"
                      style={{
                        left: values[setting.id] ? '24px' : '2px',
                        background: values[setting.id] ? '#00AEEF' : '#64748B',
                        boxShadow: values[setting.id] ? '0 0 8px rgba(0,174,239,0.5)' : 'none',
                      }}
                    />
                  </button>
                )}

                {setting.type === 'select' && (
                  <select
                    value={values[setting.id]}
                    onChange={(e) => setValues((v) => ({ ...v, [setting.id]: e.target.value }))}
                    className="text-xs font-space px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                    style={{
                      background: 'rgba(11,18,32,0.8)',
                      color: '#fff',
                      border: '1px solid rgba(0,174,239,0.2)',
                    }}
                  >
                    {setting.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {setting.type === 'input' && (
                  <input
                    type="password"
                    value={values[setting.id]}
                    onChange={(e) => setValues((v) => ({ ...v, [setting.id]: e.target.value }))}
                    placeholder="Enter key..."
                    className="text-xs font-space px-3 py-1.5 rounded-lg outline-none w-64"
                    style={{ background: 'rgba(11,18,32,0.8)', color: '#fff', border: '1px solid rgba(0,174,239,0.2)' }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-space text-sm font-semibold transition-all duration-200 hover:scale-105"
              style={{ background: 'rgba(0,174,239,0.2)', border: '1px solid rgba(0,174,239,0.4)', color: '#00AEEF' }}
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
