import { useState, useEffect, useCallback } from 'react';

const EXCLUDED_KEY = 'nursetrack-excluded-subjects';

function loadExcluded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(EXCLUDED_KEY) || '[]')); } catch { return new Set(); }
}

export function useExcludedSubjects() {
  const [excludedSubjects, setExcludedSubjects] = useState<Set<string>>(loadExcluded);

  useEffect(() => {
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...excludedSubjects]));
  }, [excludedSubjects]);

  // Listen for changes from other components
  useEffect(() => {
    const handler = () => setExcludedSubjects(loadExcluded());
    window.addEventListener('storage', handler);
    // Custom event for same-tab sync
    window.addEventListener('excluded-subjects-changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('excluded-subjects-changed', handler);
    };
  }, []);

  const toggleExclude = useCallback((id: string) => {
    setExcludedSubjects(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    // Notify other components in same tab
    setTimeout(() => window.dispatchEvent(new Event('excluded-subjects-changed')), 0);
  }, []);

  const setAll = useCallback((ids: Set<string>) => {
    setExcludedSubjects(ids);
    setTimeout(() => window.dispatchEvent(new Event('excluded-subjects-changed')), 0);
  }, []);

  return { excludedSubjects, toggleExclude, setAll };
}
