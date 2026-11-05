import { readableInk } from '../../lib/utils';
import { motion } from 'framer-motion';

interface Props {
  shortName: string;
  color: string;
  subjectId: string;
  onNavigate?: (tab: string, filter?: Record<string, string>) => void;
  /** Show as badge (colored bg) or plain text */
  variant?: 'badge' | 'text' | 'dot';
  className?: string;
}

/**
 * Reusable clickable subject name.
 * Tapping navigates to that subject's syllabus.
 */
export default function SubjectLink({ shortName, color, subjectId, onNavigate, variant = 'badge', className = '' }: Props) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate?.('syllabus', { subjectId });
  };

  if (!onNavigate) {
    // Fallback: render non-clickable
    if (variant === 'text') {
      return <span className={`text-[11px] font-bold ${className}`} style={{ color: readableInk(color) }}>{shortName}</span>;
    }
    if (variant === 'dot') {
      return (
        <span className={`flex items-center gap-1 text-[11px] font-bold ${className}`}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span style={{ color: readableInk(color) }}>{shortName}</span>
        </span>
      );
    }
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}
        style={{ backgroundColor: color + '20', color: readableInk(color) }}>
        {shortName}
      </span>
    );
  }

  if (variant === 'text') {
    return (
      <motion.button
        onClick={handleClick}
        whileTap={{ scale: 0.95 }}
        className={`text-[11px] font-bold cursor-pointer hover:underline decoration-1 underline-offset-2 transition-all hover:brightness-110 active:scale-95 ${className}`}
        style={{ color: readableInk(color) }}
        title={`Open ${shortName} in Syllabus`}
      >
        {shortName}
      </motion.button>
    );
  }

  if (variant === 'dot') {
    return (
      <motion.button
        onClick={handleClick}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center gap-1 text-[11px] font-bold cursor-pointer hover:underline decoration-1 underline-offset-2 transition-all hover:brightness-110 ${className}`}
        title={`Open ${shortName} in Syllabus`}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span style={{ color: readableInk(color) }}>{shortName}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer hover:brightness-110 hover:shadow-sm transition-all active:scale-95 ${className}`}
      style={{ backgroundColor: color + '20', color: readableInk(color) }}
      title={`Open ${shortName} in Syllabus`}
    >
      {shortName}
    </motion.button>
  );
}
