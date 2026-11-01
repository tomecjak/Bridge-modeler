import type { AbutmentGeometry } from '@bridge/model';
import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';

interface Props {
  construction: AbutmentGeometry['construction'];
  /** vyhodnotené rozmery opory [m] (chýbajúce = len písmeno) */
  values: Readonly<Record<string, number | undefined>>;
}

/** Vodorovná kóta nad náčrtom: čiara, značky a písmeno s hodnotou. */
function HDim({
  x0,
  x1,
  y,
  letter,
  value,
}: {
  x0: number;
  x1: number;
  y: number;
  letter: string;
  value: number | undefined;
}) {
  const label = value === undefined ? letter : `${letter} ${formatNumber(value, 2)}`;
  return (
    <g className="sketch-dim">
      <line x1={x0} y1={y} x2={x1} y2={y} />
      {[x0, x1].map((x) => (
        <line key={x} className="sketch-tick" x1={x - 3} y1={y + 3} x2={x + 3} y2={y - 3} />
      ))}
      <text x={(x0 + x1) / 2} y={y - 4} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/** Zvislá kóta vpravo od náčrtu. */
function VDim({
  x,
  y0,
  y1,
  letter,
  value,
}: {
  x: number;
  y0: number;
  y1: number;
  letter: string;
  value: number | undefined;
}) {
  const label = value === undefined ? letter : `${letter} ${formatNumber(value, 2)}`;
  return (
    <g className="sketch-dim">
      <line x1={x} y1={y0} x2={x} y2={y1} />
      {[y0, y1].map((y) => (
        <line key={y} className="sketch-tick" x1={x - 3} y1={y + 3} x2={x + 3} y2={y - 3} />
      ))}
      <text x={x + 5} y={(y0 + y1) / 2 + 3}>
        {label}
      </text>
    </g>
  );
}

/**
 * Náčrt rezu opory v osi mosta s kótami (ADR 0018, nie v mierke): začiatok mosta, pole vpravo. Opora s prahom:
 * predsadenie a, odsadenie konca NK e, medzera g, múrik t, výška prahu h_p; monolitická opora: stena t_s so stredom
 * na osi uloženia. Písmená zodpovedajú popisom parametrov v mriežke vlastností.
 */
export function AbutmentSketch({ construction, values }: Props) {
  const t = sk.supports.sketch;
  return (
    <svg
      className="abutment-sketch"
      viewBox="0 0 320 170"
      role="img"
      aria-label={construction === 'monolithic' ? t.monolithic : t.bearing}
    >
      {construction === 'monolithic' ? (
        <>
          {/* krídlo, stena, základ, NK */}
          <polygon className="sketch-concrete" points="24,40 120,40 120,150 24,96" />
          <rect className="sketch-concrete" x={120} y={40} width={44} height={110} />
          <rect className="sketch-concrete" x={100} y={150} width={84} height={12} />
          <rect className="sketch-deck" x={120} y={40} width={200} height={26} />
          <line className="sketch-axis" x1={142} y1={24} x2={142} y2={166} />
          <HDim x0={120} x1={164} y={18} letter="t_s" value={values.wallThickness} />
          <text className="sketch-note" x={200} y={84}>
            {t.deck}
          </text>
          <text className="sketch-note" x={36} y={60}>
            {t.wing}
          </text>
        </>
      ) : (
        <>
          {/* krídlo, múrik, prah, NK a ložisko */}
          <polygon className="sketch-concrete" points="20,40 96,40 96,118 20,78" />
          <rect className="sketch-concrete" x={96} y={40} width={34} height={38} />
          <rect className="sketch-concrete" x={96} y={78} width={118} height={40} />
          <rect className="sketch-deck" x={140} y={40} width={180} height={24} />
          <polygon className="sketch-bearing" points="178,64 190,64 184,76" />
          <line className="sketch-axis" x1={184} y1={24} x2={184} y2={160} />
          <HDim x0={96} x1={130} y={18} letter="t" value={values.backwallThickness} />
          <HDim x0={130} x1={140} y={32} letter="g" value={values.gap} />
          <HDim x0={140} x1={184} y={18} letter="e" value={values.endOffset} />
          <HDim x0={184} x1={214} y={32} letter="a" value={values.frontOffset} />
          <VDim x={226} y0={78} y1={118} letter="h_p" value={values.seatHeight} />
          <text className="sketch-note" x={250} y={58}>
            {t.deck}
          </text>
          <text className="sketch-note" x={110} y={104}>
            {t.seat}
          </text>
          <text className="sketch-note" x={30} y={60}>
            {t.wing}
          </text>
        </>
      )}
      <text className="sketch-note" x={construction === 'monolithic' ? 148 : 190} y={164}>
        {t.bearingLine}
      </text>
    </svg>
  );
}
