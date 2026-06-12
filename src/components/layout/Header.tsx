import { useState, useEffect } from 'react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [utcTime, setUtcTime] = useState('');
  const [utcDate, setUtcDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${h}:${m}:${s} UTC`);
      
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      setUtcDate(now.toLocaleDateString('en-US', options));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex justify-between items-center w-full px-container-margin py-4 bg-background/20 backdrop-blur-xl border-b border-outline-variant/10 z-30 sticky top-0">
      <div className="flex items-center gap-4 md:gap-8 flex-1">
        <button 
          className="md:hidden p-2 -ml-2 text-on-surface hover:bg-surface-container-highest/30 rounded-full flex items-center justify-center"
          onClick={onMenuClick}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="relative w-full max-w-xl group hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 group-focus-within:text-primary transition-colors">search</span>
          <input className="w-full bg-surface-container-low/50 border border-outline-variant/30 rounded-lg py-2 pl-10 pr-12 text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all font-label-mono outline-none text-on-surface" placeholder="Search satellites, debris, events, missions..." type="text"/>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-outline-variant/40 rounded px-1.5 py-0.5 pointer-events-none">
            <span className="text-[10px] font-bold text-on-surface-variant/50">⌘</span>
            <span className="text-[10px] font-bold text-on-surface-variant/50">K</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end mr-4">
          <div className="font-label-mono text-label-mono text-primary uppercase font-bold tracking-widest">{utcTime}</div>
          <div className="text-[10px] text-on-surface-variant/60 font-medium">{utcDate}</div>
        </div>
        <div className="flex items-center gap-4 border-l border-outline-variant/20 pl-6">
          <button className="relative w-10 h-10 flex items-center justify-center hover:bg-surface-container-highest/30 rounded-full transition-all group active:scale-90">
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-tertiary-container rounded-full border border-background"></span>
          </button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-highest/30 rounded-full transition-all group active:scale-90">
            <span className="material-symbols-outlined text-on-surface-variant">hub</span>
          </button>
          <div className="flex items-center gap-3 ml-2 hover:bg-surface-container-highest/20 p-1 rounded-full pr-4 transition-all cursor-pointer">
            <img alt="Mission Control Admin" className="w-9 h-9 rounded-full border border-primary/40 p-0.5 object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDm3N00za-MnqYNglVs61SUAZJ2JvtNFpGys8mraVCvcLRdJMbg0foa49BvTT6HmsMed4vqc7uw9GV9gBmPTiS3y-TAev8HCj1AsW2D1KJMD4IaV1oYw-anLN4gSm8nYHdlaPYhgG391oVk_4i0ByMB-UMZsUpA0uOq-uUbEcPMiYygJt6Ytp4N3Yz0C0u0leB1jnl4SyEGLjcLfj7WHPgvtWS48ZahBcxX8PYdZIZk6a6ifW9KhPed0PBlGpAa5U4THW7P71bHcqQ"/>
            <div className="hidden lg:block">
              <div className="text-xs font-bold leading-none text-on-surface">Mission Control</div>
              <div className="text-[10px] text-on-surface-variant font-label-mono mt-0.5">Admin</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
