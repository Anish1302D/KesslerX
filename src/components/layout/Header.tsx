import { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';

export default function Header() {
  const [utcTime, setUtcTime] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setUtcTime(
        now.toISOString().replace('T', '  ').substring(0, 21) + ' UTC'
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      className="h-16 flex items-center justify-between px-6 z-40 flex-shrink-0"
      style={{
        background: 'rgba(5, 8, 22, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0, 174, 239, 0.1)',
      }}
    >
      {/* Search Bar */}
      <div className="flex-1 max-w-xl">
        <div
          className="relative flex items-center rounded-xl px-4 py-2.5 transition-all duration-300"
          style={{
            background: 'rgba(11, 18, 32, 0.8)',
            border: searchFocused
              ? '1px solid rgba(0, 174, 239, 0.5)'
              : '1px solid rgba(0, 174, 239, 0.15)',
            boxShadow: searchFocused
              ? '0 0 20px rgba(0, 174, 239, 0.15)'
              : 'none',
          }}
        >
          <Search className="w-4 h-4 mr-3 flex-shrink-0" style={{ color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="Search satellites, debris, events..."
            className="bg-transparent border-none outline-none text-sm font-space w-full"
            style={{ color: '#fff' }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd
            className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-space"
            style={{ background: 'rgba(0,174,239,0.1)', color: '#94A3B8', border: '1px solid rgba(0,174,239,0.2)' }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-5 ml-6">
        {/* UTC Clock */}
        <div className="hidden lg:flex flex-col items-end">
          <span className="text-[10px] font-space tracking-widest" style={{ color: '#64748B' }}>
            MISSION TIME
          </span>
          <span className="text-sm font-orbitron tracking-wider" style={{ color: '#00E5FF' }}>
            {utcTime}
          </span>
        </div>

        {/* Divider */}
        <div className="h-8 w-px hidden lg:block" style={{ background: 'rgba(0,174,239,0.2)' }} />

        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.1)]"
          style={{ color: '#94A3B8' }}
        >
          <Bell className="w-5 h-5" />
          <span
            className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: '#FF4D4D',
              color: '#fff',
              boxShadow: '0 0 8px rgba(255, 77, 77, 0.6)',
              animation: 'blink 2s ease-in-out infinite',
            }}
          >
            3
          </span>
        </button>

        {/* User Avatar */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.1)]"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #00AEEF, #00E5FF)',
              boxShadow: '0 0 12px rgba(0, 174, 239, 0.3)',
            }}
          >
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-space font-medium text-white">Commander</p>
            <p className="text-[10px] font-space" style={{ color: '#64748B' }}>ADMIN</p>
          </div>
        </button>
      </div>
    </header>
  );
}
