import { type Frame, frameFromAzimuthGrade, type Vec2, type Vec3, vec2 } from '@bridge/geom';
import type { AlignmentData, HorizontalElementData } from './data.ts';
import { MissingProfileError } from './errors.ts';
import {
  buildHorizontal,
  type HorizontalAlignment,
  type HorizontalPoint,
  type HorizontalProjection,
} from './horizontal/horizontal.ts';
import type { AlignmentIssue } from './issues.ts';
import { createStationing, type Stationing } from './station/stationing.ts';
import { buildVertical, type ProfilePoint, type VerticalProfile } from './vertical/vertical.ts';

export interface AlignmentPoint {
  /** lokálne súradnice (x = E − E₀, y = N − N₀, z = H − H₀) */
  point: Vec3;
  azimuth: number;
  curvature: number;
  grade: number;
  frame: Frame;
}

export interface ElementInfo {
  index: number;
  kind: HorizontalElementData['kind'];
  sStart: number;
  sEnd: number;
  data: HorizontalElementData;
}

export interface Alignment {
  readonly name: string;
  readonly staStart: number;
  readonly length: number;
  readonly origin: Vec3;
  readonly horizontal: HorizontalAlignment;
  /** aktívna niveleta (prvá v dátach), ak existuje */
  readonly profile: VerticalProfile | undefined;
  readonly elements: readonly ElementInfo[];
  /** prevod s ↔ zobrazované staničenie so skokmi */
  readonly stationing: Stationing;
  evaluate(s: number): AlignmentPoint;
  evaluateHorizontal(s: number): HorizontalPoint;
  elevation(s: number): ProfilePoint;
  project(p: Vec2): HorizontalProjection | undefined;
}

/** Lokálny počiatok projektu: začiatok osi zaokrúhlený na 100 m, H₀ = 0 (ADR 0003). */
export function suggestOrigin(data: AlignmentData): Vec3 {
  const start = data.horizontal[0]?.start ?? vec2(0, 0);
  return { x: Math.round(start.x / 100) * 100, y: Math.round(start.y / 100) * 100, z: 0 };
}

/** Vytvorí vyhodnocovač osi v lokálnych súradniciach z normalizovaných dát. */
export function createAlignment(
  data: AlignmentData,
  origin: Vec3,
): { alignment: Alignment; issues: AlignmentIssue[] } {
  const scoped = (issue: AlignmentIssue): AlignmentIssue => ({ ...issue, alignment: data.name });
  const h = buildHorizontal(data.horizontal, vec2(origin.x, origin.y), data.length);
  const profileData = data.profiles[0];
  const v = profileData ? buildVertical(profileData, data.staStart) : { issues: [] };
  const issues = [...h.issues, ...v.issues].map(scoped);
  const elements = data.horizontal.map((e, index) => ({
    index,
    kind: e.kind,
    sStart: h.horizontal.boundaries[index] as number,
    sEnd: h.horizontal.boundaries[index + 1] as number,
    data: e,
  }));
  return {
    alignment: new EvaluatedAlignment(data, origin, h.horizontal, v.profile, elements),
    issues,
  };
}

class EvaluatedAlignment implements Alignment {
  readonly name: string;
  readonly staStart: number;
  readonly length: number;
  readonly stationing: Stationing;

  constructor(
    data: AlignmentData,
    readonly origin: Vec3,
    readonly horizontal: HorizontalAlignment,
    readonly profile: VerticalProfile | undefined,
    readonly elements: readonly ElementInfo[],
  ) {
    this.name = data.name;
    this.staStart = data.staStart;
    this.length = horizontal.length;
    this.stationing = createStationing(data.staStart, horizontal.length, data.stationEquations);
  }

  evaluateHorizontal(s: number): HorizontalPoint {
    return this.horizontal.evaluate(s);
  }

  elevation(s: number): ProfilePoint {
    if (!this.profile) throw new MissingProfileError(this.name);
    const p = this.profile.evaluate(s);
    return { z: p.z - this.origin.z, grade: p.grade };
  }

  evaluate(s: number): AlignmentPoint {
    const h = this.horizontal.evaluate(s);
    const v = this.elevation(s);
    const point = { x: h.point.x, y: h.point.y, z: v.z };
    return {
      point,
      azimuth: h.azimuth,
      curvature: h.curvature,
      grade: v.grade,
      frame: frameFromAzimuthGrade(point, h.azimuth, v.grade),
    };
  }

  project(p: Vec2): HorizontalProjection | undefined {
    return this.horizontal.project(p);
  }
}
