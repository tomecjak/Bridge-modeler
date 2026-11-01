import type { BearingLine, Superstructure, Support } from '@bridge/model';
import type { DeckRange } from '@bridge/sections';
import type { Command } from './commands.ts';

/** Nová podpera na osi (typ z dialógu): druh, id osi, názov a spojité staničenie osi. */
export type SupportFactory = (
  kind: Support['kind'],
  lineId: string,
  name: string,
  s: number,
) => Support;

export interface SpanLayoutPlan {
  deck: Superstructure;
  /** osi uloženia a podpery projektu */
  lines: readonly BearingLine[];
  supports: readonly Support[];
  /** nové polohy osí (spojité staničenie) a rozsah NK (`layoutStations`) */
  stations: readonly number[];
  range: DeckRange;
  /** spojité → zobrazované staničenie osi cesty */
  toDisplay: (s: number) => number;
  /** uhol kríženia všetkých osí (výraz v °) */
  angle: string;
  /** odsadenie konca NK e krajných opôr s prahom (ADR 0018) [m]; bez neho sa nemení */
  endOffset?: number;
  newSupport: SupportFactory;
  newId: (prefix: string) => string;
}

/** Zobrazované staničenie na 0,1 mm (bez šumu z prevodu dĺžky po osi mosta). */
const round = (station: number) => Math.round(station * 1e4) / 1e4;

/**
 * Rozloženie polí NK jedným krokom späť (ADR 0017, rozhodnutie 2026-11-01): osi sa prečíslujú 1 … n od začiatku
 * a dostanú spoločný uhol kríženia; existujúce podpery sa zachovajú a presunú (opory na krajné osi, piliere na
 * vnútorné podľa poradia), chýbajúce sa doplnia z `newSupport`, nadbytočné sa odstránia. NK dostane nový rozsah
 * a krajné opory s prahom odsadenie konca NK `endOffset` (konce odvodené z opôr zosúladí store, ADR 0018).
 * Osi s podperami si nechajú id, takže podpery ostanú na svojich osiach.
 */
export function planSpanLayout(p: SpanLayoutPlan): Command {
  const n = p.stations.length;
  const own = p.lines
    .filter((l) => l.superstructure === p.deck.id)
    .sort((a, b) => a.station - b.station);
  const ownSupports = own.flatMap((l) => p.supports.filter((s) => s.bearingLine === l.id));
  const abutments = ownSupports.filter((s) => s.kind === 'abutment');
  const piers = ownSupports.filter((s) => s.kind === 'pier');
  const lineStation = (s: Support) => own.find((l) => l.id === s.bearingLine)?.station ?? 0;

  const assigned: (Support | undefined)[] = Array.from({ length: n }, () => undefined);
  const [first] = abutments;
  const last = abutments.at(-1);
  if (abutments.length >= 2 && n >= 2) {
    assigned[0] = first;
    assigned[n - 1] = last;
  } else if (first && n >= 1) {
    // jediná opora ostane na bližšom konci NK
    const nearStart = lineStation(first) - p.deck.from <= p.deck.to - lineStation(first);
    assigned[nearStart ? 0 : n - 1] = first;
  }
  piers.slice(0, Math.max(0, n - 2)).forEach((s, k) => {
    assigned[k + 1] = s;
  });
  const kept = new Set(assigned.flatMap((s) => (s ? [s.id] : [])));
  const surplus = ownSupports.filter((s) => !kept.has(s.id));

  // id osí: os podpery, ktorá na nej ostáva; inak ďalšia nepoužitá os NK; inak nová
  const usedLines = new Set<string>();
  const lineIds = assigned.map((s) => {
    if (!s || usedLines.has(s.bearingLine)) return undefined;
    usedLines.add(s.bearingLine);
    return s.bearingLine;
  });
  const spare = own.filter((l) => !usedLines.has(l.id)).map((l) => l.id);
  const ids = lineIds.map((id) => {
    const value = id ?? spare.shift() ?? p.newId('bl');
    usedLines.add(value);
    return value;
  });
  const existingLines = new Set(own.map((l) => l.id));

  const commands: Command[] = [
    ...surplus.map((s): Command => ({ type: 'removeElement', collection: 'supports', id: s.id })),
    ...spare.map((id): Command => ({ type: 'removeElement', collection: 'bearingLines', id })),
  ];
  const added: BearingLine[] = [];
  ids.forEach((id, i) => {
    const line = {
      name: String(i + 1),
      superstructure: p.deck.id,
      station: round(p.toDisplay(p.stations[i] as number)),
      crossingAngle: p.angle,
    };
    if (existingLines.has(id))
      commands.push({ type: 'updateElement', collection: 'bearingLines', id, changes: line });
    else added.push({ id, ...line });
  });

  // podpera presunutá na inú os (napr. dve podpery na jednej osi) a nové podpery
  const removed = new Set(surplus.map((s) => s.id));
  const names = new Set(p.supports.filter((s) => !removed.has(s.id)).map((s) => s.name));
  const created: Support[] = [];
  assigned.forEach((s, i) => {
    const id = ids[i] as string;
    if (s) {
      const g = s.geometry;
      const atEnd = i === 0 || i === n - 1;
      const endOffset =
        atEnd &&
        p.endOffset !== undefined &&
        g.type === 'abutment' &&
        g.construction === 'bearing' &&
        Number(g.endOffset) !== p.endOffset
          ? { geometry: { ...g, endOffset: String(p.endOffset) } }
          : {};
      if (s.bearingLine !== id || 'geometry' in endOffset)
        commands.push({
          type: 'updateElement',
          collection: 'supports',
          id: s.id,
          changes: { ...(s.bearingLine !== id ? { bearingLine: id } : {}), ...endOffset },
        });
      return;
    }
    const kind = i === 0 || i === n - 1 ? 'abutment' : 'pier';
    const name = supportName(String(i + 1), kind, names, kept.size === 0);
    names.add(name);
    created.push(p.newSupport(kind, id, name, p.stations[i] as number));
  });
  if (added.length > 0 || created.length > 0)
    commands.push({ type: 'addElements', bearingLines: added, supports: created });
  commands.push({
    type: 'updateElement',
    collection: 'superstructures',
    id: p.deck.id,
    changes: { from: round(p.toDisplay(p.range.sFrom)), to: round(p.toDisplay(p.range.sTo)) },
  });
  return { type: 'batch', commands };
}

/**
 * Názov novej podpery: na NK bez podpier číslo osi (ako na výkrese), ak je voľné; inak O / P s prvým voľným číslom,
 * aby sa nemiešalo s doterajším pomenovaním.
 */
function supportName(
  lineName: string,
  kind: Support['kind'],
  used: ReadonlySet<string>,
  byLine: boolean,
): string {
  if (byLine && !used.has(lineName)) return lineName;
  const prefix = kind === 'abutment' ? 'O' : 'P';
  let k = 1;
  while (used.has(`${prefix}${k}`)) k++;
  return `${prefix}${k}`;
}
