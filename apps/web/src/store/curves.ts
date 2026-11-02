import { type CurveRef, type Survey, surveyLineName } from '@bridge/model';

/** Kľúč krivky vo výberoch: `alignment:<meno>`, `planLine:<id>` alebo `survey:<id meračky>/<id čiary>`. */
export function curveKey(ref: CurveRef): string {
  if (ref.type === 'alignment') return `alignment:${ref.name}`;
  if (ref.type === 'planLine') return `planLine:${ref.id}`;
  return `survey:${ref.survey}/${ref.line}`;
}

/** Krivka z kľúča výberu; iný kľúč (napr. `station`) → undefined. */
export function curveFromKey(key: string): CurveRef | undefined {
  const colon = key.indexOf(':');
  const type = key.slice(0, colon);
  const value = key.slice(colon + 1);
  if (colon < 0) return undefined;
  if (type === 'alignment') return { type: 'alignment', name: value };
  if (type === 'planLine') return { type: 'planLine', id: value };
  if (type === 'survey') {
    const slash = value.lastIndexOf('/');
    if (slash > 0)
      return { type: 'survey', survey: value.slice(0, slash), line: value.slice(slash + 1) };
  }
  return undefined;
}

/** Čiary meračiek ako voľby výberu krivky (ADR 0021). */
export function surveyLineOptions(surveys: readonly Survey[]): { value: string; label: string }[] {
  return surveys.flatMap((s) =>
    s.lines.map((l) => ({
      value: curveKey({ type: 'survey', survey: s.id, line: l.id }),
      label: surveyLineName(s, l.id),
    })),
  );
}
