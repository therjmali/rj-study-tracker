import { memo } from 'react';
import { User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { AppTab } from '../../types';

const MAIN_TABS: { id: AppTab; label: string; icon: string; activeIcon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: '🏠', activeIcon: '🏡' },
  { id: 'syllabus', label: 'Syllabus', icon: '📚', activeIcon: '📖' },
  { id: 'charts', label: 'Statistics', icon: '📊', activeIcon: '📈' },
  { id: 'revision', label: 'Revision', icon: '🧠', activeIcon: '🧠' },
  { id: 'gamification', label: 'AI Tutor', icon: '🤖', activeIcon: '🤖' },
];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onOpenProfile: () => void;
  srsDueCount?: number;
}

function SideNavInner({ activeTab, onTabChange, onOpenProfile, srsDueCount = 0 }: Props) {
  return (
    <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-border/10 material-thin h-[calc(100vh-56px)] sticky top-14 overflow-y-auto">
      <nav className="p-3 space-y-1 flex-1">
        {MAIN_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => onTabChange(tab.id)}
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 active:scale-[0.97]
                ${isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50 border border-transparent'}`}>
              {isActive && (
                <motion.div layoutId="sideNavActive"
                  className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/12"
                  transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.6 }} />
              )}
              <span className="text-sm relative z-10">{isActive ? tab.activeIcon : tab.icon}</span>
              <span className={`relative z-10 ${isActive ? 'font-bold' : ''}`}>{tab.label}</span>
              {tab.id === 'revision' && srsDueCount > 0 && (
                <span className="ml-auto relative z-10 w-5 h-5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/20">
                  {srsDueCount > 9 ? '9+' : srsDueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border/8 space-y-0.5">
        <button onClick={onOpenProfile}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-card/40 transition-all duration-200 active:scale-[0.98]">
          <UserIcon className="w-4 h-4" />
          <span>Profile & Settings</span>
        </button>
      </div>
    </aside>
  );
}

const SideNav = memo(SideNavInner);
export default SideNav;
