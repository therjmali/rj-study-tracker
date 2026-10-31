import { memo, useMemo } from 'react';
import { splitForHighlight, tokenizeQuery } from '../../lib/searchUtils';

interface Props {
  text: string;
  /** Raw query string — it is tokenised so multi-word searches highlight every word. */
  query: string;
  className?: string;
}

/** Highlights every search token inside `text`. Safe for empty / non-string input. */
function HighlightTextInner({ text, query, className }: Props) {
  const parts = useMemo(() => {
    const safe = String(text ?? '');
    const tokens = tokenizeQuery(query || '');
    return splitForHighlight(safe, tokens);
  }, [text, query]);

  if (parts.length === 1 && !parts[0].hit) return <>{parts[0].text}</>;
  return (
    <>
      {parts.map((p, i) => p.hit
        ? <mark key={i} className={className || 'bg-chart-4/30 text-inherit rounded-sm px-0.5 font-bold'}>{p.text}</mark>
        : <span key={i}>{p.text}</span>)}
    </>
  );
}

const HighlightText = memo(HighlightTextInner);
export default HighlightText;
