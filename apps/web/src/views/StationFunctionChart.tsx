import { formatStation } from '@bridge/alignment';
import type { Parameter, ParameterSet, ParameterUnit } from '@bridge/model';
import { type PointerEvent, useMemo, useState } from 'react';
import { DISPLAY_UNIT_LABEL } from '../format/displayValue.ts';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import { type ChartSample, sampleParameter } from './chartSamples.ts';
import { useElementSize } from './useElementSize.ts';
import { niceStep } from './viewTransform.ts';

interface Props {
  parameter: Parameter;
  set: ParameterSet;
  range: { from: number; to: number };
}

const HEIGHT = 200;
const PAD = { left: 52, right: 12, top: 24, bottom: 26 };

/** Priebeh globálneho parametra po staničení s hranicami úsekov. */
export function StationFunctionChart({ parameter, set, range }: Props) {
  const samples = useMemo(() => sampleParameter(set, parameter, range), [set, parameter, range]);
  const boundaries =
    parameter.law.kind === 'piecewise'
      ? [...new Set(parameter.law.segments.flatMap((s) => [s.from, s.to]))]
      : [];
  return (
    <ValueChart
      samples={samples}
      range={range}
      unit={parameter.unit}
      boundaries={boundaries}
      title={parameter.name}
    />
  );
}

interface ValueChartProps {
  /** hodnoty v zobrazovaných jednotkách */
  samples: readonly ChartSample[];
  range: { from: number; to: number };
  unit: ParameterUnit;
  /** zobrazované staničenia zvýraznených hraníc (úseky, zlomy krivky) */
  boundaries?: readonly number[];
  title: string;
}

/** Priebeh hodnoty po staničení: jedna čiara, hranice úsekov, zameriavač s hodnotou. */
export function ValueChart({
  samples,
  range,
  unit: valueUnit,
  boundaries = [],
  title,
}: ValueChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number>();

  const values = samples.flatMap((s) => (s.value === undefined ? [] : [s.value]));
  const width = size.width;
  if (values.length === 0 || width === 0) {
    return (
      <div ref={ref} className="chart">
        {values.length === 0 && <p className="panel-empty">{sk.chart.noValues}</p>}
      </div>
    );
  }

  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  if (maxV - minV < 1e-9) {
    const pad = Math.max(1, Math.abs(maxV) * 0.1);
    minV -= pad;
    maxV += pad;
  }
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (sta: number) => PAD.left + ((sta - range.from) / (range.to - range.from)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - minV) / (maxV - minV)) * plotH;

  const yStep = niceStep((maxV - minV) / 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(minV / yStep) * yStep; v <= maxV + 1e-9; v += yStep) yTicks.push(v);
  const xStep = niceStep(((range.to - range.from) * 90) / plotW);
  const xTicks: number[] = [];
  for (let s = Math.ceil(range.from / xStep) * xStep; s <= range.to + 1e-9; s += xStep)
    xTicks.push(s);

  // čiara s prerušením tam, kde funkcia nie je definovaná
  const paths: string[] = [];
  let current = '';
  for (const s of samples) {
    if (s.value === undefined) {
      if (current) paths.push(current);
      current = '';
      continue;
    }
    current += `${current ? 'L' : 'M'}${x(s.sta).toFixed(1)},${y(s.value).toFixed(1)}`;
  }
  if (current) paths.push(current);

  const hovered = hover === undefined ? undefined : samples[hover];
  const unit = DISPLAY_UNIT_LABEL[valueUnit];
  const decimals = valueUnit === 'length' ? 1 : 3;

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const sta = range.from + ((e.clientX - rect.left - PAD.left) / plotW) * (range.to - range.from);
    let best = 0;
    samples.forEach((s, i) => {
      if (Math.abs(s.sta - sta) < Math.abs((samples[best] as (typeof samples)[number]).sta - sta))
        best = i;
    });
    setHover(best);
  }

  return (
    <div ref={ref} className="chart">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${sk.chart.title}: ${title}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(undefined)}
      >
        <g className="chart-grid">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
              <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
                {formatNumber(v, yStep < 1 ? 2 : 0)}
              </text>
            </g>
          ))}
          {xTicks.map((s) => (
            <text
              key={s}
              x={x(s)}
              y={HEIGHT - 8}
              textAnchor={x(s) > width - 40 ? 'end' : x(s) < PAD.left + 30 ? 'start' : 'middle'}
            >
              {formatStation(s, 0)}
            </text>
          ))}
          <text x={PAD.left - 6} y={4} textAnchor="end" dominantBaseline="hanging">
            {unit}
          </text>
        </g>
        {boundaries.map((b) => (
          <line
            key={b}
            className="chart-boundary"
            x1={x(b)}
            x2={x(b)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
          />
        ))}
        {paths.map((d) => (
          <path key={d.slice(0, 24)} className="chart-line" d={d} />
        ))}
        {hovered && (
          <g className="chart-hover">
            <line x1={x(hovered.sta)} x2={x(hovered.sta)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
            {hovered.value !== undefined && (
              <circle cx={x(hovered.sta)} cy={y(hovered.value)} r={4} />
            )}
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(x(hovered.sta) + 8, 0), width - 150), top: PAD.top }}
        >
          <strong>
            {hovered.value === undefined ? '—' : `${formatNumber(hovered.value, decimals)} ${unit}`}
          </strong>
          <span>{formatStation(hovered.sta)}</span>
        </div>
      )}
    </div>
  );
}
