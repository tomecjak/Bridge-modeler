import { useEffect, useState } from 'react';
import { sk } from '../i18n/sk.ts';
import { Field } from '../views/Field.tsx';

interface Props {
  title: string;
  confirm: string;
  initial: string;
  /** mená ostatných variantov; meno musí byť jedinečné */
  taken: readonly string[];
  onConfirm: (name: string) => void;
  onClose: () => void;
}

/** Meno nového alebo premenovaného variantu (ADR 0024): neprázdne a jedinečné, Enter potvrdí, Esc zavrie. */
export function VariantNameDialog({ title, confirm, initial, taken, onConfirm, onClose }: Props) {
  const t = sk.variants.dialog;
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const error = trimmed === '' ? t.empty : taken.includes(trimmed) ? t.taken : undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const submit = () => {
    if (!error) onConfirm(trimmed);
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="variant-name-title">
        <h2 id="variant-name-title" className="panel-title">
          {title}
        </h2>
        <Field label={t.name}>
          <input
            type="text"
            value={name}
            aria-label={t.name}
            // biome-ignore lint/a11y/noAutofocus: dialog má jediné pole
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </Field>
        {error && <p className="issue issue-error">{error}</p>}
        <div className="toolbar modal-actions">
          <span className="toolbar-separator" />
          <button type="button" className="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="button primary" disabled={!!error} onClick={submit}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
