import { type Alignment, formatStation } from '@bridge/alignment';
import type { ProfileReadout } from '@bridge/drawing';
import type { Vec2, Vec3 } from '@bridge/geom';
import { sk } from '../i18n/sk.ts';
import { formatGrade, formatNumber } from './number.ts';

export type CursorInfo =
  | { source: 'plan'; point: Vec2; s: number | undefined; offset: number | undefined }
  | {
      source: 'profile';
      s: number | undefined;
      point?: Vec2 | undefined;
      /** hodnoty profilu pod kurzorom (Fáza 10b) */
      readout?: ProfileReadout | undefined;
    };

/** Text stavového riadka pre polohu kurzora v pôdoryse alebo v profile. */
export function formatCursor(cursor: CursorInfo, alignment: Alignment, origin: Vec3): string {
  const station = (s: number) => formatStation(alignment.stationing.toDisplay(s).station);
  if (cursor.source === 'plan') {
    const coords = `E ${formatNumber(cursor.point.x + origin.x, 3)}  N ${formatNumber(cursor.point.y + origin.y, 3)}`;
    if (cursor.s === undefined || cursor.offset === undefined)
      return `${sk.statusBar.outside}  ·  ${coords}`;
    return `${station(cursor.s)}  ·  ${sk.statusBar.offset} ${formatNumber(cursor.offset, 3)} m  ·  ${coords}`;
  }
  const profile = alignment.profile;
  const onGrade =
    cursor.s !== undefined && profile && cursor.s >= profile.startS && cursor.s <= profile.endS;
  const r = cursor.readout;
  if (r) {
    const b = sk.statusBar;
    const m = (v: number) => formatNumber(v, 3);
    const parts = [cursor.s === undefined ? b.outside : station(cursor.s)];
    if (r.grade !== undefined) parts.push(`${b.gradeLine} ${m(r.grade)}`);
    if (onGrade && cursor.s !== undefined)
      parts.push(`${b.grade} ${formatGrade(alignment.elevation(cursor.s).grade)}`);
    if (r.deckTop !== undefined && r.deckBottom !== undefined)
      parts.push(`${b.deck} ${m(r.deckTop)} / ${m(r.deckBottom)}`);
    if (r.terrain !== undefined) parts.push(`${b.terrain} ${m(r.terrain)}`);
    if (r.terrainLeft !== undefined) parts.push(`${b.terrainLeft} ${m(r.terrainLeft)}`);
    if (r.terrainRight !== undefined) parts.push(`${b.terrainRight} ${m(r.terrainRight)}`);
    if (r.clearance !== undefined) parts.push(`${b.clearance} ${formatNumber(r.clearance, 2)} m`);
    return parts.join('  ·  ');
  }
  if (cursor.s === undefined) return sk.statusBar.outside;
  if (!onGrade) return station(cursor.s);
  const p = alignment.elevation(cursor.s);
  return `${station(cursor.s)}  ·  ${sk.statusBar.elevation} ${formatNumber(p.z + origin.z, 3)} ${sk.statusBar.bpv}  ·  ${sk.statusBar.grade} ${formatGrade(p.grade)}`;
}
