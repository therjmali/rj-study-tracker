import { useState, useEffect, memo } from 'react';
import { Star, Clock, Calendar, Check } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '../shared/ConfirmDialog';
import type { SubTopic, TopicStatus } from '../../types';
import { formatDate, formatStudyTime, getCleanName, getDisplayTopicName, getSubjectFontSize } from '../../lib/utils';
import HighlightText from '../shared/HighlightText';

const DIFF_EMOJI: Record<string, string> = { Easy: '🟢', Medium: '🟡', Hard: '🔴' };

interface Props {
  topic: SubTopic;
  subjectId: string;
  unitId: string;
  onToggle: () => void;
  onToggleImportant: () => void;
  onOpenDetail: () => void;
  onOpenPomodoro?: () => void;
  onOpenTimer?: () => void;
  onCycleStatus?: (newStatus: TopicStatus) => void;
  onCycleDifficulty?: () => void;
  selectMode: boolean;
  selected: boolean;
  onSelect: () => void;
  universalNumber?: number;
  searchQuery?: string;
  autoNumber?: string;
  subjectShortName?: string;
  subjectColor?: string;
  totalInUnit?: number;
  indexInUnit?: number;
  showTopicNumbers?: boolean;
  hideHashSuffix?: boolean;
  subjectTopicFontSize?: string;
}


const TopicRow = memo(function TopicRow({
  topic, onToggle, onToggleImportant, onOpenDetail, onCycleStatus, onCycleDifficulty,
  selectMode, selected, onSelect, universalNumber, searchQuery, autoNumber,
  subjectColor, showTopicNumbers = true, hideHashSuffix, subjectTopicFontSize,
}: Props) {
  const [pulseComplete, setPulseComplete] = useState(false);
  const [showUncompleteConfirm, setShowUncompleteConfirm] = useState(false);
  const status: TopicStatus = topic.status || (topic.completed ? 'complete' : 'incomplete');
  const displayNumber = universalNumber != null ? String(universalNumber) : autoNumber;
  const hasTime = topic.timeSpent > 0;
  const hasDate = !!topic.completedDate;
  const diffEmoji = DIFF_EMOJI[topic.difficulty] || '🟡';
  const isComplete = status === 'complete';
  const isInProgress = status === 'in_process';
  const isNotStarted = !isComplete && !isInProgress;

  useEffect(() => {
    if (pulseComplete) {
      const t = setTimeout(() => setPulseComplete(false), 600);
      return () => clearTimeout(t);
    }
  }, [pulseComplete]);

  const handleStatusCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(30);

    // If uncompleting (complete → incomplete), show confirmation
    if (isComplete) {
      setShowUncompleteConfirm(true);
      return;
    }

    setPulseComplete(true);
    if (onCycleStatus) {
      const next: TopicStatus = status === 'incomplete' ? 'in_process' : status === 'in_process' ? 'complete' : 'incomplete';
      onCycleStatus(next);
    } else {
      onToggle();
    }
  };

  const handleConfirmUncomplete = () => {
    setShowUncompleteConfirm(false);
    setPulseComplete(true);
    if (onCycleStatus) {
      onCycleStatus('incomplete');
    } else {
      onToggle();
    }
    toast('↩️ Topic marked incomplete', { duration: 2000 });
  };

  const handleDifficultyCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(15);
    if (onCycleDifficulty) onCycleDifficulty();
  };

  const handleCopySR = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.vibrate?.(25);
    const cleanName = getCleanName(topic.name);
    navigator.clipboard.writeText(cleanName);
    toast('📋 Copied!', { description: cleanName.length > 50 ? cleanName.slice(0, 50) + '…' : cleanName, duration: 1500 });
  };

  // Clean border — subtle green for complete, orange for in-progress, neutral for not started
  const borderColor = isInProgress
    ? 'hsl(var(--state-progress-border) / 0.5)'
    : 'hsl(var(--border) / 0.6)';

  return (
    <div
      onClick={onOpenDetail}
      className="relative w-full cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.985]"
      style={{
        borderRadius: '18px',
        background: 'hsl(var(--card))',
        border: `1.5px solid ${borderColor}`,
        padding: 'var(--density-pad-y, 14px) var(--density-pad-x, 16px) calc(var(--density-pad-y, 14px) + 4px)',
      }}
    >
      {/* Left Accent Strip */}
      {subjectColor && (
        <div className="absolute top-0 left-0 w-[4px] h-full rounded-l-[18px]" style={{ backgroundColor: subjectColor }} />
      )}

      {/* Row 1: Status icon + number + title + difficulty */}
      <div className="flex items-start gap-2.5">
        {/* Status icon — tap to cycle */}
        {selectMode ? (
          <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="shrink-0 mt-0.5">
            <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
              selected ? 'bg-primary border-primary' : 'border-muted-foreground/25 bg-muted/10'
            }`}>
              {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
            </div>
          </button>
        ) : (
          <button
            onClick={handleStatusCycle}
            className={`shrink-0 mt-0.5 transition-all active:scale-[0.75] ${pulseComplete ? 'animate-ping-once' : ''}`}
            title={isComplete ? 'Completed — tap to change' : isInProgress ? 'In Progress — tap to change' : 'Tap to start'}
          >
            {isComplete ? (
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'hsl(var(--state-complete-border))' }}>
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              </div>
            ) : isInProgress ? (
              <div className="w-6 h-6 rounded-md border-2 flex items-center justify-center" style={{ borderColor: 'hsl(var(--state-progress-border))', background: 'hsl(var(--state-progress-bg))' }}>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'hsl(var(--state-progress-border))' }} />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-md border-[1.5px] flex items-center justify-center" style={{ borderColor: 'hsl(var(--border))', background: 'transparent' }} />
            )}
          </button>
        )}

        {/* Number badge — small beside status */}
        {!selectMode && showTopicNumbers && displayNumber && (
          <button
            onClick={handleCopySR}
            className="shrink-0 mt-0.5 active:scale-[0.85] transition-all"
          >
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-md font-mono text-[10px] font-bold"
              style={{
                backgroundColor: 'hsl(var(--muted) / 0.5)',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {displayNumber}
            </span>
          </button>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold leading-snug break-words"
            style={{
              fontSize: getSubjectFontSize('topic', subjectTopicFontSize) || 'var(--text-size-topic, 16px)',
              lineHeight: '1.4',
              letterSpacing: '-0.15px',
              color: isNotStarted && !hasTime && !hasDate ? 'hsl(var(--foreground) / 0.8)' : 'hsl(var(--foreground))',
            }}
          >
            {isInProgress && (
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle animate-pulse" style={{ background: 'hsl(var(--state-progress-border))' }} />
            )}
            <HighlightText text={getDisplayTopicName(topic.name, hideHashSuffix)} query={searchQuery || ''} />
          </h3>
        </div>

        {/* Difficulty emoji */}
        {!selectMode && (
          <button
            onClick={handleDifficultyCycle}
            className="shrink-0 mt-0.5 text-sm leading-none select-none active:scale-[0.7] transition-transform"
            title={`${topic.difficulty} — tap to change`}
          >
            {diffEmoji}
          </button>
        )}
      </div>

      {/* Row 2: Bottom metadata row — single horizontal line */}
      <div className="flex items-center gap-3 text-[12px]" style={{ marginTop: 'var(--density-gap, 10px)', color: 'hsl(var(--muted-foreground))' }}>
        <span className="inline-flex items-center gap-1 font-medium">
          <Clock className="w-3 h-3" style={{ opacity: 0.5 }} />
          {hasTime ? formatStudyTime(topic.timeSpent) : '0m'}
        </span>

        <span className="inline-flex items-center gap-1 font-medium">
          <Calendar className="w-3 h-3" style={{ opacity: 0.5 }} />
          {hasDate ? formatDate(topic.completedDate!) : '—/—/—'}
        </span>

        {/* Completed label */}
        {isComplete && (
          <span className="font-semibold" style={{ color: 'hsl(var(--state-complete-accent))' }}>
            ✓ COMPLETED
          </span>
        )}
        {isInProgress && (
          <span className="font-semibold" style={{ color: 'hsl(var(--state-progress-accent))' }}>
            ⟳ In Progress
          </span>
        )}

        {/* Star — pushed to right */}
        <button
          onClick={(e) => { e.stopPropagation(); navigator.vibrate?.(15); onToggleImportant(); }}
          className="inline-flex items-center justify-center transition-all active:scale-[1.3] ml-auto shrink-0"
        >
          <Star
            className={`w-4 h-4 transition-all ${topic.important ? 'fill-current' : ''}`}
            style={{
              color: topic.important ? 'hsl(var(--star-gold))' : 'hsl(var(--muted-foreground) / 0.25)',
              filter: topic.important ? 'drop-shadow(0 1px 3px hsl(var(--star-gold) / 0.4))' : undefined,
            }}
          />
        </button>
      </div>

      {/* Status Line — 4px bar at bottom */}
      <div
        className="absolute bottom-0 left-3 right-3 h-[4px] rounded-full transition-all duration-500"
        style={{
          backgroundColor: isInProgress
            ? 'hsl(var(--state-progress-border))'
            : 'hsl(var(--border) / 0.3)',
        }}
      />

      {/* Uncomplete Confirmation Dialog */}
      <ConfirmDialog
        open={showUncompleteConfirm}
        onClose={() => setShowUncompleteConfirm(false)}
        onConfirm={handleConfirmUncomplete}
        title="Uncomplete Topic?"
        description={`You are about to mark "${getDisplayTopicName(topic.name, hideHashSuffix)}" as incomplete. This will remove it from your completed count.`}
        severity="warning"
        confirmLabel="Mark Incomplete"
        details={[
          ...(hasTime ? [`This topic has ${formatStudyTime(topic.timeSpent)} of study time — it will be preserved.`] : []),
          'Completion date will be removed.',
        ]}
      />
    </div>
  );
});

export default TopicRow;
