import { formatStation } from '@bridge/alignment';
import type { SupportResult } from '@bridge/sections';
import { useState } from 'react';
import { formatNumber } from '../../format/number.ts';
import { sk } from '../../i18n/sk.ts';
import { projectStore, useProject } from '../../store/projectStore.ts';
import { ExpressionInput } from '../../views/ExpressionInput.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Ložiská podpery (ADR 0008, 0019): priečne vzdialenosti od osi NK (výrazy v m) a vypočítané staničenie, horná hrana
 * podpery a výška pri každom ložisku; „Podľa prierezu NK“ ich nahradí ložiskami zo spodných plôch prierezu. Každá
 * zmena je jeden krok späť.
 */
export function BearingsDialog({
  supportId,
  result,
  derive,
  onClose,
}: {
  supportId: string;
  result: SupportResult | undefined;
  /** ložiská z prierezu NK na osi podpery (prázdne = nedajú sa určiť) */
  derive: () => readonly number[];
  onClose: () => void;
}) {
  const [message, setMessage] = useState<string>();
  const support = useProject((s) => s.project.supports.find((x) => x.id === supportId));
  const s = sk.supports;
  if (!support) return null;
  const setBearings = (bearings: string[]) =>
    projectStore.getState().dispatch({
      type: 'updateElement',
      collection: 'supports',
      id: support.id,
      changes: { bearings },
    });
  return (
    <Dialog icon="bearing" title={sk.properties.bearingsTitle(support.name)} onClose={onClose}>
      <table className="mini-table">
        <thead>
          <tr>
            <th>{s.bearingX}</th>
            <th className="num">{s.bearingStation}</th>
            <th className="num">{s.seat}</th>
            <th className="num">{s.height}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {support.bearings.map((b, i) => {
            const r = result?.bearings.find((x) => x.index === i);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: ložiská sú určené poradím
              <tr key={i}>
                <td>
                  <ExpressionInput
                    value={b}
                    ariaLabel={`${s.bearingX} ${i + 1}`}
                    onCommit={(v) => setBearings(support.bearings.map((x, j) => (j === i ? v : x)))}
                  />
                </td>
                <td className="num">{r ? formatStation(r.station) : '—'}</td>
                <td className="num">{r ? formatNumber(r.seat, 3) : '—'}</td>
                <td className="num">{r ? formatNumber(r.height, 3) : '—'}</td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${sk.parameters.remove} ${i + 1}`}
                    onClick={() => setBearings(support.bearings.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="toolbar">
        <button
          type="button"
          className="button"
          onClick={() => setBearings([...support.bearings, '0'])}
        >
          {s.addBearing}
        </button>
        <button
          type="button"
          className="button"
          title={s.bearingsFromDeckTitle}
          onClick={() => {
            const xs = derive();
            if (xs.length === 0) setMessage(s.bearingsFromDeckFailed);
            else {
              setMessage(undefined);
              setBearings(xs.map(String));
            }
          }}
        >
          {s.bearingsFromDeck}
        </button>
      </div>
      {message && <p className="hint">{message}</p>}
      {result && result.bearings.length > 0 && (
        <p className="hint">
          {s.heightRange(formatNumber(result.height.min, 3), formatNumber(result.height.max, 3))}
        </p>
      )}
    </Dialog>
  );
}
