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

  // Status colour drives the rail, the tick and the status pill (kept on theme tokens so every theme stays readable)
  const rail = isComplete ? 'hsl(var(--state-complete-border))' : isInProgress ? 'hsl(var(--state-progress-border))' : 'transparent';

  return (
    <div
      onClick={onOpenDetail}
      className="group/topic relative w-full cursor-pointer overflow-hidden transition-[transform,box-shadow] duration-200 hover:shadow-md active:scale-[0.985]"
      style={{
        borderRadius: '16px',
        background: 'hsl(var(--card))',
        border: `1px solid ${isInProgress ? 'hsl(var(--state-progress-border) / 0.55)' : 'hsl(var(--border) / 0.55)'}`,
        padding: 'calc(var(--density-pad-y, 12px) - 1px) var(--density-pad-x, 12px)',
      }}
    >
      {/* Status rail (a thin coloured edge only when the topic has a state) */}
      <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full transition-colors" style={{ background: rail }} />

      <div className="flex items-start gap-2.5">
        {/* Status control — tap to cycle */}
        {selectMode ? (
          <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="shrink-0 mt-px" aria-label={selected ? 'Deselect topic' : 'Select topic'}>
            <div className={`w-[26px] h-[26px] rounded-lg border-2 flex items-center justify-center transition-all ${selected ? 'bg-primary border-primary' : 'border-muted-foreground/30 bg-muted/10'}`}>
              {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
            </div>
          </button>
        ) : (
          <button onClick={handleStatusCycle} aria-label={isComplete ? 'Completed — tap to change' : isInProgress ? 'In progress — tap to change' : 'Not started — tap to start'}
            className={`shrink-0 mt-px transition-transform active:scale-[0.75] ${pulseComplete ? 'animate-ping-once' : ''}`}>
            {isComplete ? (
              <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center" style={{ background: 'hsl(var(--state-complete-border))' }}>
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.2} />
              </div>
            ) : isInProgress ? (
              <div className="w-[26px] h-[26px] rounded-full border-2 flex items-center justify-center" style={{ borderColor: 'hsl(var(--state-progress-border))', background: 'hsl(var(--state-progress-bg))' }}>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'hsl(var(--state-progress-border))' }} />
              </div>
            ) : (
              <div className="w-[26px] h-[26px] rounded-full border-[1.75px]" style={{ borderColor: 'hsl(var(--muted-foreground) / 0.45)' }} />
            )}
          </button>
        )}

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold break-words"
            style={{
              fontSize: getSubjectFontSize('topic', subjectTopicFontSize) || 'var(--text-size-topic, 15px)',
              lineHeight: 1.35, letterSpacing: '-0.1px',
              color: 'hsl(var(--foreground))',
              opacity: isComplete ? 0.82 : 1,
            }}>
            {!selectMode && showTopicNumbers && displayNumber && (
              <button onClick={handleCopySR} aria-label="Copy topic name"
                className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded-md mr-1.5 align-[1px] font-mono text-[10px] font-bold bg-muted/60 text-muted-foreground active:scale-90 transition-transform">
                {displayNumber}
              </button>
            )}
            <HighlightText text={getDisplayTopicName(topic.name, hideHashSuffix)} query={searchQuery || ''} />
          </h3>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium">
              <Clock className="w-3 h-3 opacity-60" />{hasTime ? formatStudyTime(topic.timeSpent) : '0m'}
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              <Calendar className="w-3 h-3 opacity-60" />{hasDate ? formatDate(topic.completedDate!) : '—'}
            </span>
            {isComplete && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-bold" style={{ background: 'hsl(var(--state-complete-border) / 0.14)', color: 'hsl(var(--state-complete-accent))' }}>✓ Completed</span>
            )}
            {isInProgress && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-bold" style={{ background: 'hsl(var(--state-progress-border) / 0.16)', color: 'hsl(var(--state-progress-accent))' }}>⟳ In progress</span>
            )}
          </div>
        </div>

        {/* Right column: star + difficulty */}
        {!selectMode && (
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <button onClick={(e) => { e.stopPropagation(); navigator.vibrate?.(15); onToggleImportant(); }}
              aria-label={topic.important ? 'Remove from important' : 'Mark important'}
              className="p-0.5 transition-transform active:scale-[1.3]">
              <Star className={`w-[17px] h-[17px] ${topic.important ? 'fill-current' : ''}`}
                style={{ color: topic.important ? 'hsl(var(--star-gold))' : 'hsl(var(--muted-foreground) / 0.35)', filter: topic.important ? 'drop-shadow(0 1px 3px hsl(var(--star-gold) / 0.4))' : undefined }} />
            </button>
            <button onClick={handleDifficultyCycle} className="text-[13px] leading-none select-none active:scale-[0.7] transition-transform" title={`${topic.difficulty} — tap to change`}>
              {diffEmoji}
            </button>
          </div>
        )}
      </div>

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
