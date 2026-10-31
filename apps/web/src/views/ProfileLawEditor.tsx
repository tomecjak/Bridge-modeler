import type {
  EdgeLaw,
  ParameterUnit,
  ProfileLaw,
  StationFunction,
  Superstructure,
} from '@bridge/model';
import { edgeBreaks, evaluateSuperstructure, type SectionContext } from '@bridge/sections';
import { useMemo } from 'react';
import { toDisplayUnits } from '../format/displayValue.ts';
import { sk } from '../i18n/sk.ts';
import type { ChartSample } from './chartSamples.ts';
import { ExpressionInput } from './ExpressionInput.tsx';
import { ValueChart } from './StationFunctionChart.tsx';
import { StationFunctionEditor } from './StationFunctionEditor.tsx';

interface Props {
  law: ProfileLaw;
  onChange: (law: ProfileLaw) => void;
  /** rozsah NK (zobrazované staničenie) */
  range: { from: number; to: number };
  /** predvolená hodnota parametra (pri návrate z okraja na staničnú funkciu) */
  defaultValue: string;
  /** krivky, ku ktorým sa dá okraj merať: osi z LandXML (okrem vlastnej osi cesty) a čiary v pôdoryse */
  curves: { alignments: readonly string[]; planLines: readonly { id: string; name: string }[] };
  /** náhľad výsledných hodnôt okraja */
  preview?:
    | { ctx: SectionContext; sup: Superstructure; parameter: string; unit: ParameterUnit }
    | undefined;
}

/** Priebeh parametra prierezu v NK: staničná funkcia alebo okraj podľa krivky (Fáza 8a). */
export function ProfileLawEditor({ law, onChange, range, defaultValue, curves, preview }: Props) {
  const t = sk.edgeLaw;
  const first: EdgeLaw['curve'] | undefined = curves.alignments[0]
    ? { type: 'alignment', name: curves.alignments[0] }
    : curves.planLines[0]
      ? { type: 'planLine', id: curves.planLines[0].id }
      : undefined;
  const curveKey = (c: EdgeLaw['curve']) => (c.type === 'alignment' ? `a:${c.name}` : `l:${c.id}`);
  return (
    <div className="sf-editor">
      <label className="field">
        <span>{t.source}</span>
        <select
          value={law.kind === 'edge' ? 'edge' : 'function'}
          onChange={(e) => {
            if (e.target.value === 'function') {
              onChange({ kind: 'constant', value: defaultValue });
            } else if (first) {
              onChange({ kind: 'edge', curve: first, side: 'left', add: '0' });
            }
          }}
        >
          <option value="function">{t.sources.function}</option>
          <option value="edge" disabled={!first}>
            {t.sources.edge}
          </option>
        </select>
      </label>
      {!first && law.kind !== 'edge' && <p className="hint">{t.noCurves}</p>}
      {law.kind !== 'edge' && (
        <StationFunctionEditor
          law={law as StationFunction}
          range={range}
          onChange={(next) => onChange(next)}
        />
      )}
      {law.kind === 'edge' && (
        <>
          <div className="segment-grid">
            <label className="field">
              <span>{t.curve}</span>
              <select
                value={curveKey(law.curve)}
                onChange={(e) => {
                  const v = e.target.value;
                  const curve: EdgeLaw['curve'] = v.startsWith('a:')
                    ? { type: 'alignment', name: v.slice(2) }
                    : { type: 'planLine', id: v.slice(2) };
                  onChange({ ...law, curve });
                }}
              >
                {/* odkaz na chýbajúcu krivku ostane viditeľný, kým ho projektant nezmení */}
                {!curves.alignments.some((a) => curveKey(law.curve) === `a:${a}`) &&
                  !curves.planLines.some((l) => curveKey(law.curve) === `l:${l.id}`) && (
                    <option value={curveKey(law.curve)}>{t.missing}</option>
                  )}
                {curves.alignments.length > 0 && (
                  <optgroup label={t.alignments}>
                    {curves.alignments.map((a) => (
                      <option key={a} value={`a:${a}`}>
                        {a}
                      </option>
                    ))}
                  </optgroup>
                )}
                {curves.planLines.length > 0 && (
                  <optgroup label={t.planLines}>
                    {curves.planLines.map((l) => (
                      <option key={l.id} value={`l:${l.id}`}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="field">
              <span>{t.side}</span>
              <select
                value={law.side}
                onChange={(e) => onChange({ ...law, side: e.target.value as EdgeLaw['side'] })}
              >
                <option value="left">{t.sides.left}</option>
                <option value="right">{t.sides.right}</option>
              </select>
            </label>
          </div>
          <div className="field">
            <span>{t.add}</span>
            <ExpressionInput
              value={law.add}
              ariaLabel={t.add}
              onCommit={(add) => onChange({ ...law, add })}
            />
          </div>
          <p className="hint">{t.hint}</p>
          {preview && <EdgePreview law={law} range={range} {...preview} />}
        </>
      )}
    </div>
  );
}

const SAMPLES = 120;

/** Výsledné hodnoty parametra po dĺžke NK (z prierezov, teda presne ako v 3D) so zlomami krivky. */
function EdgePreview({
  law,
  range,
  ctx,
  sup,
  parameter,
  unit,
}: {
  law: EdgeLaw;
  range: { from: number; to: number };
  ctx: SectionContext;
  sup: Superstructure;
  parameter: string;
  unit: ParameterUnit;
}) {
  const data = useMemo(() => {
    const axis = ctx.bridgeAxes.find((a) => a.id === sup.bridgeAxis);
    const road = axis ? ctx.alignments.get(axis.alignment) : undefined;
    if (!road) return undefined;
    const sFrom = road.stationing.fromDisplay(range.from);
    const sTo = road.stationing.fromDisplay(range.to);
    if (sFrom === undefined || sTo === undefined || !(sTo > sFrom)) return undefined;
    const breaks = edgeBreaks(ctx, law.curve, road).filter((s) => s > sFrom && s < sTo);
    const stations = [
      ...Array.from({ length: SAMPLES + 1 }, (_, i) => sFrom + ((sTo - sFrom) * i) / SAMPLES),
      ...breaks,
    ].sort((a, b) => a - b);
    const samples: ChartSample[] = stations.map((s) => {
      const v = evaluateSuperstructure(ctx, sup, s).parameters.get(parameter);
      return {
        sta: road.stationing.toDisplay(s).station,
        value: v === undefined ? undefined : toDisplayUnits(unit, v),
      };
    });
    return { samples, boundaries: breaks.map((s) => road.stationing.toDisplay(s).station) };
  }, [ctx, sup, law, range, parameter, unit]);
  if (!data) return null;
  return (
    <ValueChart
      samples={data.samples}
      range={range}
      unit={unit}
      boundaries={data.boundaries}
      title={parameter}
    />
  );
}
