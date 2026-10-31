import { createContext, useContext } from 'react';
import type { GlobalTimerState, GlobalTimerActions } from '../hooks/useGlobalTimer';

interface TimerContextType {
  state: GlobalTimerState;
  actions: GlobalTimerActions;
}

const TimerContext = createContext<TimerContextType | null>(null);

export const TimerProvider = TimerContext.Provider;

export function useTimer(): TimerContextType {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be inside TimerProvider');
  return ctx;
}
