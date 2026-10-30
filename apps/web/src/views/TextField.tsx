import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** Textové pole s potvrdením Enterom / opustením poľa (jeden krok späť/znova), Escape vráti pôvodnú hodnotu. */
export function TextField({ value, onCommit, ariaLabel, className }: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="text"
      className={className}
      value={draft}
      aria-label={ariaLabel}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}
