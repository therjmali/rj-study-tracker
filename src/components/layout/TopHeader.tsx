import { isImageAvatar } from '../../lib/avatar';
import { useState, memo } from 'react';
import { useAppIcon } from '@/platform/appIcon';
import { Stethoscope, Sun, Moon, Flame, Search, Cloud, CloudOff, Loader2, Bell, Wheat, GraduationCap, X, Contrast } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { User, ThemeMode, StudentMode } from '../../types';
import { getAppName } from '../../lib/brandConfig';
import ConnectionStatusPill from './ConnectionStatusPill';
import { useSameImage } from '../../lib/imageSimilarity';

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

function AppIcon({ mode, suppressCustom = false }: { mode?: StudentMode; suppressCustom?: boolean }) {
  const custom = useAppIcon();
  if (custom && !suppressCustom) return <img src={custom.dataUrl} alt="" className="w-full h-full object-cover rounded-[inherit]" draggable={false} />;
  if (mode === 'agriculture') return <Wheat className="w-4 h-4 text-primary-foreground" />;
  if (mode === 'nursing') return <Stethoscope className="w-4 h-4 text-primary-foreground" />;
  return <GraduationCap className="w-4 h-4 text-primary-foreground" />;
}

function TopHeaderInner({ user, pct, onOpenProfile, themeMode, onToggleTheme, level, xpProgress = 0, onOpenSearch, syncStatus = 'idle', dueReminders = 0, onOpenReminders, studentMode, onNavigateHome, onOpenCloudData, streakDays = 0, todayTopicsDone = 0, onLevelClick }: Props) {
  const isLight = themeMode === 'light' || themeMode === 'vyxel';
  // If the custom app logo is the same picture as the profile photo, show the stock mark on the left so the
  // same face never appears twice in the header (the photo stays on the right, where the profile opens).
  const customIcon = useAppIcon();
  const avatarImg = isImageAvatar(user.avatar) ? user.avatar : null;
  const logoDuplicatesAvatar = useSameImage(customIcon?.dataUrl, avatarImg);
  const isAncient = themeMode === 'ancient';
  const isGlass = themeMode === 'glass';
  const appName = getAppName(studentMode);
  const [streakBannerDismissed, setStreakBannerDismissed] = useState(false);
  const hour = new Date().getHours();
  const showStreakWarning = !streakBannerDismissed && hour >= 18 && todayTopicsDone === 0 && streakDays > 2;

  return (
    <>
    <header className="sticky top-0 z-50 px-3 pt-2 pb-1.5 pointer-events-auto will-change-transform" style={{ transform: 'translateZ(0)' }}>
      <div className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] border border-white/10 bg-white/[0.03] dark:bg-black/[0.4] px-3 sm:px-4 py-2 shadow-[0_18px_48px_-26px_rgba(0,0,0,0.8)] backdrop-blur-md max-w-6xl mx-auto">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.10),transparent_30%)]" />

        <div className="relative flex items-center justify-between gap-2">
          {/* Left: App icon + name */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <button onClick={onNavigateHome} className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center shadow-[0_8px_20px_-10px_hsl(var(--primary))] shrink-0 hover:scale-105 active:scale-95 transition-all border border-primary/20" aria-label="Go to Home">
              <AppIcon mode={studentMode} suppressCustom={logoDuplicatesAvatar} />
            </button>
            <button onClick={onNavigateHome} className="font-heading text-foreground text-[15px] sm:text-[16px] font-black tracking-tight hover:text-primary transition-colors truncate min-w-[3.25rem]">
              {appName}
            </button>
            <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black leading-none border border-primary/15 shrink-0 tracking-widest uppercase">PRO</span>
          </div>

          {/* Center: Sync + Net + Progress */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Unified connection + cloud status (offline / unreachable / syncing / synced) */}
            <ConnectionStatusPill onClick={onOpenCloudData} />
            {/* Progress bar */}
            <div className="hidden md:flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono font-bold">{pct}%</span>
            </div>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1.5">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 shadow-sm transition-all hover:border-foreground/20 active:scale-95"
                aria-label="Search (Ctrl+K)"
              >
                <Search className="w-4 h-4 text-foreground/70" />
              </button>
            )}

            {level && onLevelClick && (
              <button onClick={onLevelClick} className="hidden xs:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/10 border border-primary/15 shrink-0 hover:bg-primary/20 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                <span className="text-xs leading-none">{level.icon}</span>
                <span className="text-[10px] font-black font-mono text-primary">Lv.{level.level}</span>
                <div className="w-7 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${xpProgress}%` }} />
                </div>
              </button>
            )}

            {onOpenReminders && (
              <button
                type="button"
                onClick={onOpenReminders}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 shadow-sm transition-all hover:border-foreground/20 active:scale-95"
                aria-label="Reminders"
              >
                <Bell className="w-4 h-4 text-foreground/70" />
                {dueReminders > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] font-black flex items-center justify-center animate-pulse">
                    {dueReminders > 9 ? '9+' : dueReminders}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 shadow-sm transition-all hover:border-foreground/20 active:scale-95"
              aria-label="Toggle theme"
            >
              {isGlass ? <Contrast className="w-4 h-4 text-foreground/70" /> : isLight ? <Moon className="w-4 h-4 text-foreground/70" /> : isAncient ? <Sun className="w-4 h-4 text-foreground/70" /> : <Flame className="w-4 h-4 text-foreground/70" />}
            </button>

            <button
              type="button"
              onClick={onOpenProfile}
              className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0 border border-primary/25 hover:scale-105 active:scale-95 transition-all overflow-hidden shadow-sm"
              aria-label="Open profile"
            >
              {isImageAvatar(user.avatar) ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-base">{user.avatar}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
    {showStreakWarning && (
      <div className="bg-chart-4/10 border-b border-chart-4/15 backdrop-blur-md">
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
