import type { Alignment } from '@bridge/alignment';
import {
  type DeckDrawingData,
  type Drawing,
  profileCuts,
  profileDrawing,
  profileEdgeLines,
} from '@bridge/drawing';
import { type Vec2, vec2 } from '@bridge/geom';
import type { PlanLine } from '@bridge/model';
import {
  type AxisLength,
  alignmentProfileLine,
  bridgeAxisProfileLine,
  type ProfileLine,
  polylineProfileLine,
  roadProfileLine,
} from '@bridge/sections';
import { useMemo } from 'react';
import { sk } from '../i18n/sk.ts';
import { type TerrainTin, terrainProfilesAlong } from './terrain.ts';

/**
 * Os pozdĺžneho profilu (Fáza 10b) ako hodnota výberu: `road`, `bridgeAxis`, `edge:left`, `edge:right`,
 * `alignment:<názov osi>`, `line:<id čiary>`.
 */
export type ProfileAxisKey = string;

/** Terénne čiary na ľavom a pravom okraji NK premietnuté do profilu v osi mosta (u, výška v m n. m.). */
export interface EdgeTerrain {
  left: Vec2[][];
  right: Vec2[][];
}

export interface ProfileAxisOption {
  value: ProfileAxisKey;
  label: string;
}

interface ProfileSources {
  road: Alignment;
  /** NK, ktorej os mosta, okraje a rez sa ukazujú */
  deck: DeckDrawingData | undefined;
  /** os mosta NK (id) a jej prevod na dĺžku po osi */
  measure: AxisLength | undefined;
  others: readonly Alignment[];
  planLines: readonly PlanLine[];
}

/** Ponúkané osi profilu: os cesty, os mosta a okraje vybranej NK, ďalšie osi z LandXML a čiary v pôdoryse. */
export function profileAxisOptions(src: ProfileSources): ProfileAxisOption[] {
  const a = sk.profileAxes;
  const deck = src.deck;
  return [
    { value: 'road', label: a.road(src.road.name) },
    ...(deck && src.measure
      ? [
          { value: 'bridgeAxis', label: a.bridgeAxis(deck.name) },
          { value: 'edge:left', label: a.edgeLeft(deck.name) },
          { value: 'edge:right', label: a.edgeRight(deck.name) },
        ]
      : []),
    ...src.others.map((o) => ({ value: `alignment:${o.name}`, label: a.alignment(o.name) })),
    ...src.planLines
      .filter((l) => l.points.length >= 2)
      .map((l) => ({ value: `line:${l.id}`, label: a.planLine(l.name) })),
  ];
}

/** Predvolená os profilu: os mosta vybranej NK, bez NK os cesty. */
export function defaultProfileAxis(src: Pick<ProfileSources, 'deck' | 'measure'>): ProfileAxisKey {
  return src.deck && src.measure ? 'bridgeAxis' : 'road';
}

/** Čiara profilu pre zvolenú os; neplatná voľba (zmazaná čiara, NK bez osi) → predvolená os. */
export function buildProfileLine(key: ProfileAxisKey, src: ProfileSources): ProfileLine {
  const { road, deck, measure } = src;
  if (key === 'bridgeAxis' && measure) return bridgeAxisProfileLine(road, measure);
  if ((key === 'edge:left' || key === 'edge:right') && deck && measure) {
    const edge = key === 'edge:left' ? deck.outline.left : deck.outline.right;
    if (edge.length >= 2) return polylineProfileLine('deckEdge', edge, road);
  }
  if (key.startsWith('alignment:')) {
    const other = src.others.find((o) => o.name === key.slice('alignment:'.length));
    if (other) return alignmentProfileLine(other, road);
  }
  if (key.startsWith('line:')) {
    const line = src.planLines.find((l) => l.id === key.slice('line:'.length));
    if (line && line.points.length >= 2) return polylineProfileLine('planLine', line.points, road);
  }
  const fallback = defaultProfileAxis(src);
  return fallback === 'bridgeAxis' && measure
    ? bridgeAxisProfileLine(road, measure)
    : roadProfileLine(road);
}

/** Pozdĺžny profil v zvolenej osi: čiara, ponuka osí a výkres (NK, podpery, terén pozdĺž čiary). */
export function useProfileView(input: {
  key: ProfileAxisKey | undefined;
  road: Alignment | undefined;
  deck: DeckDrawingData | undefined;
  measure: AxisLength | undefined;
  others: readonly Alignment[];
  planLines: readonly PlanLine[];
  tins: readonly TerrainTin[];
  /** terén na okrajoch NK v profile v osi mosta */
  edgeTerrain: boolean;
}): {
  line: ProfileLine | undefined;
  options: ProfileAxisOption[];
  axis: ProfileAxisKey;
  drawing: Drawing | undefined;
  /** terén na ľavom a pravom okraji NK (u, výška v m n. m.); len v osi mosta, nejde do exportu */
  edgeTerrain: EdgeTerrain | undefined;
} {
  const { key, road, deck, measure, others, planLines, tins } = input;
  const options = useMemo(
    () => (road ? profileAxisOptions({ road, deck, measure, others, planLines }) : []),
    [road, deck, measure, others, planLines],
  );
  const fallback = defaultProfileAxis({ deck, measure });
  const axis = key && options.some((o) => o.value === key) ? key : fallback;
  const line = useMemo(
    () => (road ? buildProfileLine(axis, { road, deck, measure, others, planLines }) : undefined),
    [axis, road, deck, measure, others, planLines],
  );
  const drawing = useMemo(() => {
    if (!line) return undefined;
    const cuts = deck ? profileCuts(deck, line, measure) : undefined;
    const path = line.points.map((p) => ({ s: p.u, point: p.point }));
    const terrain = terrainProfilesAlong(tins, path, line.road.origin.z).flatMap((t) =>
      t.runs.map((r) => r.map((p) => ({ u: p.s, z: p.z }))),
    );
    return profileDrawing({
      line,
      decks: cuts && deck ? [{ id: deck.id, cut: cuts.deck }] : [],
      supports: cuts?.supports ?? [],
      terrain,
    });
  }, [line, deck, measure, tins]);
  const showEdges = input.edgeTerrain;
  const edgeTerrain = useMemo(() => {
    if (!showEdges || line?.kind !== 'bridgeAxis' || !deck || !measure || tins.length === 0)
      return undefined;
    const { left, right } = profileEdgeLines(deck, measure);
    const runs = (edge: typeof left) =>
      terrainProfilesAlong(tins, edge, line.road.origin.z).flatMap((t) =>
        t.runs.map((r) => r.map((p) => vec2(p.s, p.z))),
      );
    return { left: runs(left), right: runs(right) };
  }, [showEdges, line, deck, measure, tins]);
  return { line, options, axis, drawing, edgeTerrain };
}
