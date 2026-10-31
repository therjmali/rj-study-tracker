import { useState, memo } from 'react';
import { useAppIcon } from '@/platform/appIcon';
import { Stethoscope, Sun, Moon, Flame, Search, Cloud, CloudOff, Loader2, Bell, Wheat, GraduationCap, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { User, ThemeMode, StudentMode } from '../../types';
import { getAppName } from '../../lib/brandConfig';

interface Props {
  user: User;
  pct: number;
  onOpenProfile: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  level?: { level: number; title: string; icon: string };
  xpProgress?: number;
  onOpenSearch?: () => void;
  syncStatus?: 'idle' | 'syncing' | 'saved' | 'error';
  dueReminders?: number;
  onOpenReminders?: () => void;
  studentMode?: StudentMode;
  onNavigateHome?: () => void;
  onOpenCloudData?: () => void;
  streakDays?: number;
  todayTopicsDone?: number;
  onLevelClick?: () => void;
}

function AppIcon({ mode }: { mode?: StudentMode }) {
  const custom = useAppIcon();
  if (custom) return <img src={custom.dataUrl} alt="" className="w-full h-full object-cover rounded-[inherit]" draggable={false} />;
  if (mode === 'agriculture') return <Wheat className="w-4 h-4 text-primary-foreground" />;
  if (mode === 'nursing') return <Stethoscope className="w-4 h-4 text-primary-foreground" />;
  return <GraduationCap className="w-4 h-4 text-primary-foreground" />;
}

function TopHeaderInner({ user, pct, onOpenProfile, themeMode, onToggleTheme, level, xpProgress = 0, onOpenSearch, syncStatus = 'idle', dueReminders = 0, onOpenReminders, studentMode, onNavigateHome, onOpenCloudData, streakDays = 0, todayTopicsDone = 0, onLevelClick }: Props) {
  const isLight = themeMode === 'light';
  const isAncient = themeMode === 'ancient';
  const appName = getAppName(studentMode);
  const [streakBannerDismissed, setStreakBannerDismissed] = useState(false);

  const hour = new Date().getHours();
  const showStreakWarning = !streakBannerDismissed && hour >= 18 && todayTopicsDone === 0 && streakDays > 2;

  return (
    <>
    <header className="glass-header sticky top-0 z-50">
      <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-6xl mx-auto">
        {/* Left: App icon + name */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <button onClick={onNavigateHome} className="w-8 h-8 rounded-[10px] overflow-hidden bg-primary flex items-center justify-center shadow-sm shrink-0 hover:scale-105 active:scale-95 transition-transform" aria-label="Go to Home">
            <AppIcon mode={studentMode} />
          </button>
          <button onClick={onNavigateHome} className="font-heading text-foreground text-[15px] hidden sm:inline hover:text-primary transition-colors truncate">{appName}</button>
          <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/8 text-primary font-extrabold leading-none border border-primary/10 shrink-0 tracking-wider">PRO</span>
        </div>

        {/* Center: Sync + Progress */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Sync indicator — clickable */}
          <button
            onClick={onOpenCloudData}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/30 active:scale-90 transition-all"
            title="View stored data"
          >
            {syncStatus === 'syncing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/60" />}
            {syncStatus === 'saved' && <Cloud className="w-3.5 h-3.5 text-secondary/80" />}
            {syncStatus === 'error' && <CloudOff className="w-3.5 h-3.5 text-destructive/80" />}
            {syncStatus === 'idle' && <Cloud className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </button>
          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono font-semibold">{pct}%</span>
          </div>
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-0.5">
          {onOpenSearch && (
            <Button variant="ghost" size="icon" onClick={onOpenSearch}
              className="w-8 h-8 rounded-xl shrink-0" aria-label="Search (Ctrl+K)">
              <Search className="w-[15px] h-[15px] text-muted-foreground" />
            </Button>
          )}

          {level && onLevelClick && (
            <button onClick={onLevelClick} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/8 border border-primary/12 shrink-0 hover:bg-primary/15 hover:scale-105 active:scale-95 transition-all cursor-pointer">
              <span className="text-xs leading-none">{level.icon}</span>
              <span className="text-[10px] font-bold font-mono text-primary">Lv.{level.level}</span>
              <div className="w-8 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${xpProgress}%` }} />
              </div>
            </button>
          )}
          {level && !onLevelClick && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/8 border border-primary/12 shrink-0">
              <span className="text-xs leading-none">{level.icon}</span>
              <span className="text-[10px] font-bold font-mono text-primary">Lv.{level.level}</span>
              <div className="w-8 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${xpProgress}%` }} />
              </div>
            </div>
          )}

          {onOpenReminders && (
            <Button variant="ghost" size="icon" onClick={onOpenReminders}
              className="w-8 h-8 rounded-xl shrink-0 relative" aria-label="Reminders">
              <Bell className="w-[15px] h-[15px] text-muted-foreground" />
              {dueReminders > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-black flex items-center justify-center animate-pulse">
                  {dueReminders > 9 ? '9+' : dueReminders}
                </span>
              )}
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={onToggleTheme}
            className="w-8 h-8 rounded-xl shrink-0" aria-label="Toggle theme">
            {isLight ? <Moon className="w-[15px] h-[15px] text-muted-foreground" /> : isAncient ? <Sun className="w-[15px] h-[15px] text-muted-foreground" /> : <Flame className="w-[15px] h-[15px] text-muted-foreground" />}
          </Button>

          <button onClick={onOpenProfile}
            className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0 border border-primary/12 hover:bg-primary/15 hover:scale-105 active:scale-95 transition-all ml-0.5 overflow-hidden ring-2 ring-primary/8 ring-offset-1 ring-offset-background">
            {user.avatar?.startsWith('http') ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user.avatar
            )}
          </button>
        </div>
      </div>
    </header>
    {showStreakWarning && (
      <div className="sticky top-14 z-40 bg-chart-4/10 border-b border-chart-4/15 backdrop-blur-md">
        <div className="flex items-center justify-center gap-2 px-4 py-2 max-w-6xl mx-auto">
          <Flame className="w-3.5 h-3.5 text-chart-4 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-chart-4">
            🔥 Your {streakDays}-day streak will break at midnight! Study 1 topic to keep it alive.
          </span>
          <button onClick={() => setStreakBannerDismissed(true)} className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-chart-4/15 transition-colors shrink-0 ml-1">
            <X className="w-3 h-3 text-chart-4/60" />
          </button>
        </div>
      </div>
    )}
    </>
  );
}

const TopHeader = memo(TopHeaderInner);
export default TopHeader;
