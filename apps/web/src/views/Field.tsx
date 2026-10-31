import type { ReactNode } from 'react';

/** Pole formulára v paneli: popis nad ovládacím prvkom. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}
