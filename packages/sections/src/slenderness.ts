import type { ModelIssue, Superstructure } from '@bridge/model';
import type { EvaluatedLoop } from './profile.ts';
import type { Span, SpanResult } from './spans.ts';
import { evaluateSuperstructure, type SectionContext } from './superstructure.ts';

/** Rozsah L/h (od, do) poľa a nad podperou. */
export interface SlendernessRange {
  field: readonly [number, number];
  support?: readonly [number, number];
}

/**
 * Orientačná štíhlosť spojitých predpätých NK L/h podľa typológie prierezu (PLAN.md §7, TODO statik; ADR 0022).
 * Len upozornenie; po potvrdení statikom sa zmení len táto tabuľka.
 */
export const SLENDERNESS: Readonly<Record<string, SlendernessRange>> = {
  slab: { field: [25, 30] },
  voidedSlab: { field: [22, 28] },
  slabBeam: { field: [15, 20] },
  singleBeam: { field: [15, 20] },
  twinBeam: { field: [15, 20] },
  singleBeamHaunched: { field: [20, 25] },
  box: { field: [18, 25] },
  boxHaunched: { field: [30, 50], support: [16, 20] },
};

/** Zvislá hrúbka obrysu na zvislici `x`: súčet úsekov zvislice vnútri polygónu. */
function thicknessAt(polygon: EvaluatedLoop['polygon'], x: number): number {
  const ys: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b || (a.x - x) * (b.x - x) >= 0) continue;
    ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  ys.sort((p, q) => p - q);
  let sum = 0;
  for (let i = 0; i + 1 < ys.length; i += 2) sum += (ys[i + 1] as number) - (ys[i] as number);
  return sum;
}

/**
 * Konštrukčná výška prierezu = najväčšia zvislá hrúbka vonkajších obrysov (dutiny sa nerátajú, ADR 0022). Hrúbka je
 * medzi vrcholmi lineárna, preto sa meria tesne vedľa každého vrcholu (± `eps`, aby zvislica nešla cez vrchol).
 */
export function sectionDepth(loops: readonly EvaluatedLoop[], eps: number): number {
  let best = 0;
  for (const l of loops) {
    if (l.role !== 'outer') continue;
    for (const p of l.polygon)
      for (const x of [p.x - eps, p.x + eps]) best = Math.max(best, thicknessAt(l.polygon, x));
  }
  return best;
}

/**
 * Štíhlosť NK (ADR 0022): v strede každého poľa L/h voči rozsahu typológie, pri typoch s rozsahom nad podperou aj na
 * vnútorných osiach uloženia (L = dlhšie susedné pole). h z hlavného prierezu NK (nie priečnika). Mimo rozsahu na
 * ktorúkoľvek stranu → upozornenie `Slenderness`; typológia bez hodnôt sa nekontroluje.
 */
export function slendernessIssues(
  ctx: SectionContext,
  sup: Superstructure,
  spans: Pick<SpanResult, 'spans'>,
  eps: number,
): ModelIssue[] {
  const profile = ctx.profiles.find((p) => p.id === sup.profile);
  const range = profile?.typology ? SLENDERNESS[profile.typology] : undefined;
  if (!profile?.typology || !range) return [];
  const typology = profile.typology;
  const depthAt = (s: number) =>
    sectionDepth(evaluateSuperstructure(ctx, sup, s, profile).loops, eps);
  const issues: ModelIssue[] = [];
  const check = (
    where: 'field' | 'support',
    label: string,
    s: number,
    length: number,
    [min, max]: readonly [number, number],
  ) => {
    const depth = depthAt(s);
    if (!(depth > 0) || !(length > 0)) return;
    const ratio = length / depth;
    if (ratio >= min && ratio <= max) return;
    issues.push({
      code: 'Slenderness',
      where,
      label,
      depth,
      length,
      ratio,
      min,
      max,
      typology,
      severity: 'warning',
    });
  };
  const list: readonly Span[] = spans.spans;
  list.forEach((span, i) => {
    check('field', String(i + 1), (span.from.s + span.to.s) / 2, span.length, range.field);
  });
  if (range.support)
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1] as Span;
      const after = list[i] as Span;
      check(
        'support',
        after.from.line.name,
        after.from.s,
        Math.max(before.length, after.length),
        range.support,
      );
    }
  return issues;
}
