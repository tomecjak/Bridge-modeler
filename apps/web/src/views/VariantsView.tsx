import type { Vec2 } from '@bridge/geom';
import { sk } from '../i18n/sk.ts';
import type { ComparedVariant, VariantProfile } from '../store/variants.ts';
import { DrawingEntities } from './DrawingEntities.tsx';
import { comparisonRows } from './variantTable.ts';

interface Props {
  variants: readonly ComparedVariant[];
  /** pozdĺžne profily v poradí variantov (bez NK undefined) */
  profiles: readonly (VariantProfile | undefined)[];
  exaggeration: number;
  onActivate: (id: string) => void;
  onExportCsv: () => void;
  /** projekt nemá lokálny počiatok (os z LandXML) */
  noOrigin: boolean;
}

/** Šírka profilu v jednotkách viewBox a okraj [px]; SVG sa prispôsobí šírke pohľadu. */
const WIDTH = 1200;
const PAD = 16;
/** Horný okraj pre zvislé popisy osí uloženia nad NK [px]. */
const LABELS = 96;
/** Presah úseku profilu za most [m]. */
const MARGIN = 10;

/**
 * Pohľad Varianty (ADR 0024): tabuľka ukazovateľov po skupinách so zvýraznenou lepšou hodnotou a vysvetlivkami,
 * pod ňou pozdĺžne profily variantov v osi mosta v rovnakej mierke a s rovnakým prevýšením.
 */
export function VariantsView({
  variants,
  profiles,
  exaggeration,
  onActivate,
  onExportCsv,
  noOrigin,
}: Props) {
  const t = sk.variants;
  const groups = comparisonRows(variants);
  const partial = groups.some((g) => g.rows.some((r) => r.cells.some((c) => c.endsWith('*'))));

  const ranges = profiles.flatMap((p) => (p ? [p] : []));
  const from = Math.min(...ranges.map((p) => p.from)) - MARGIN;
  const to = Math.max(...ranges.map((p) => p.to)) + MARGIN;
  const k = (WIDTH - 2 * PAD) / (to - from);

  return (
    <div className="variants-view">
      <div className="checks-header">
        <h2 className="panel-title">{t.title}</h2>
        <span className="hint">{t.hint}</span>
        <button type="button" className="button variants-csv" onClick={onExportCsv}>
          {t.exportCsv}
        </button>
      </div>
      {noOrigin && <p className="panel-empty">{t.noOrigin}</p>}
      <table className="mini-table variants-table">
        <thead>
          <tr>
            <th>{t.indicator}</th>
            {variants.map((v) => (
              <th key={v.id} className="num">
                {v.active ? (
                  <>
                    <strong>{v.name}</strong> <span className="tag">{t.active}</span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="link"
                    title={t.activateTitle}
                    onClick={() => onActivate(v.id)}
                  >
                    {v.name}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.group}>
            <tr className="variants-group">
              <th colSpan={variants.length + 1}>{g.title}</th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.def.key}>
                <th scope="row" title={r.hint}>
                  {r.label}
                  {r.def.key === 'cost' && (
                    <span className="tag">{sk.variants.placeholderPrices}</span>
                  )}
                  <abbr className="variants-help" title={r.hint}>
                    ?
                  </abbr>
                </th>
                {r.cells.map((c, i) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: stĺpce sú varianty v poradí
                    key={i}
                    className={r.best.includes(i) ? 'num variant-best' : 'num'}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {partial && <p className="hint">{t.partial}</p>}

      <h3 className="panel-subtitle">{t.profiles}</h3>
      <p className="hint">{t.profilesHint(exaggeration)}</p>
      {variants.map((v, i) => {
        const profile = profiles[i];
        return (
          <figure key={v.id} className="variant-profile">
            <figcaption>{v.name}</figcaption>
            {profile && Number.isFinite(k) ? (
              <ProfileStrip
                profile={profile}
                from={from}
                to={to}
                k={k}
                exaggeration={exaggeration}
              />
            ) : (
              <p className="panel-empty">{t.noProfile}</p>
            )}
          </figure>
        );
      })}
    </div>
  );
}

/** Jeden profil v spoločnom úseku [from, to] dĺžky po osi mosta; výška podľa obsahu v úseku. */
function ProfileStrip({
  profile,
  from,
  to,
  k,
  exaggeration,
}: {
  profile: VariantProfile;
  from: number;
  to: number;
  k: number;
  exaggeration: number;
}) {
  const ys = profile.drawing.entities.flatMap((e) =>
    (e.kind === 'polyline' ? e.points : [e.at])
      .filter((p) => p.x >= from && p.x <= to)
      .map((p) => p.y),
  );
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
  const height = (yMax - yMin) * k * exaggeration + LABELS + PAD;
  const toScreen = (p: Vec2): Vec2 => ({
    x: PAD + (p.x - from) * k,
    y: LABELS + (yMax - p.y) * k * exaggeration,
  });
  return (
    <svg
      className="variant-profile-svg"
      viewBox={`0 0 ${WIDTH} ${height.toFixed(1)}`}
      role="img"
      aria-label={sk.variants.profiles}
    >
      <DrawingEntities entities={profile.drawing.entities} toScreen={toScreen} />
    </svg>
  );
}
