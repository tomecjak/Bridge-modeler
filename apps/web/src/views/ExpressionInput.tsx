import { parse } from '@bridge/expr';
import { useEffect, useState } from 'react';
import { formatExprError } from '../i18n/modelIssues.ts';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

/**
 * Pole pre výraz: úprava lokálne, potvrdenie Enterom alebo opustením poľa (jeden krok späť/znova).
 * Syntaktickú chybu ukáže hneď pod poľom s vyznačeným miestom; prázdne pole so zástupným textom chybou nie je.
 */
export function ExpressionInput({ value, onCommit, ariaLabel, placeholder }: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const parsed = parse(draft);
  const error = parsed.ok || (draft === '' && placeholder) ? undefined : parsed.error;

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className="expr-input">
      <input
        type="text"
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={error !== undefined}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {error && (
        <div className="expr-error" role="alert">
          <code>
            {draft.slice(0, error.span.start)}
            <mark>
              {draft.slice(error.span.start, Math.max(error.span.end, error.span.start + 1)) || ' '}
            </mark>
            {draft.slice(Math.max(error.span.end, error.span.start + 1))}
          </code>
          <span>{formatExprError(error)}</span>
        </div>
      )}
    </div>
  );
}
