import { vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import { useEffect, useState } from 'react';
import { formatNumber } from '../../format/number.ts';
import { sk } from '../../i18n/sk.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { Dialog } from './Dialog.tsx';

/** Súradnica v m na 3 desatinné miesta (desatinná čiarka aj bodka, medzery ignoruje). */
function CoordinateField({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
}) {
  const text = formatNumber(value, 3);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const parse = (v: string) => {
    // slovenský formát: medzery v tisícoch, desatinná čiarka, znak mínus U+2212
    const n = Number(v.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
    return Number.isFinite(n) && v.trim() !== '' ? Math.round(n * 1000) / 1000 : undefined;
  };
  return (
    <input
      type="text"
      className="mono"
      value={draft}
      aria-label={ariaLabel}
      aria-invalid={parse(draft) === undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = parse(draft);
        if (v === undefined) setDraft(text);
        else if (Math.abs(v - value) > 5e-4) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(text);
      }}
    />
  );
}

/** Vrcholy čiary v pôdoryse v S-JTSK (Fáza 8a); každá zmena je jeden krok späť. */
export function PlanLineVerticesDialog({
  lineId,
  onClose,
}: {
  lineId: string;
  onClose: () => void;
}) {
  const line = useProject((s) => s.project.planLines.find((l) => l.id === lineId));
  const origin = useProject((s) => s.project.crs.origin) ?? { x: 0, y: 0, z: 0 };
  const t = sk.planLines;
  if (!line) return null;
  const setPoints = (points: PlanLine['points']) =>
    projectStore.getState().dispatch({
      type: 'updateElement',
      collection: 'planLines',
      id: line.id,
      changes: { points },
    });
  const last = line.points.at(-1);
  const prev = line.points.at(-2);
  return (
    <Dialog icon="line" title={`${t.vertices}: ${line.name}`} onClose={onClose}>
      <table className="mini-table">
        <thead>
          <tr>
            <th>#</th>
            <th>E [m]</th>
            <th>N [m]</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {line.points.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: vrchol čiary je určený poradím
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <CoordinateField
                  ariaLabel={`${i + 1} E`}
                  value={p.x + origin.x}
                  onCommit={(e) =>
                    setPoints(line.points.map((q, j) => (j === i ? vec2(e - origin.x, q.y) : q)))
                  }
                />
              </td>
              <td>
                <CoordinateField
                  ariaLabel={`${i + 1} N`}
                  value={p.y + origin.y}
                  onCommit={(n) =>
                    setPoints(line.points.map((q, j) => (j === i ? vec2(q.x, n - origin.y) : q)))
                  }
                />
              </td>
              <td>
                {line.points.length > 2 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${t.removeVertex} ${i + 1}`}
                    onClick={() => setPoints(line.points.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button"
        disabled={!last}
        onClick={() => {
          if (!last) return;
          // nový vrchol v predĺžení posledného úseku (alebo 10 m na východ)
          const d = prev ? vec2(last.x - prev.x, last.y - prev.y) : vec2(10, 0);
          setPoints([...line.points, vec2(last.x + d.x, last.y + d.y)]);
        }}
      >
        {t.addVertex}
      </button>
      <p className="hint">{t.vertexHint}</p>
    </Dialog>
  );
}
