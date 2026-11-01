import { type Alignment, formatStation } from '@bridge/alignment';
import type { Vec2, Vec3 } from '@bridge/geom';
import { sk } from '../i18n/sk.ts';
import { formatGrade, formatNumber } from './number.ts';

export type CursorInfo =
  | { source: 'plan'; point: Vec2; s: number | undefined; offset: number | undefined }
  | { source: 'profile'; s: number | undefined; point?: Vec2 | undefined };

/** Text stavového riadka pre polohu kurzora v pôdoryse alebo v profile. */
export function formatCursor(cursor: CursorInfo, alignment: Alignment, origin: Vec3): string {
  const station = (s: number) => formatStation(alignment.stationing.toDisplay(s).station);
  if (cursor.source === 'plan') {
    const coords = `E ${formatNumber(cursor.point.x + origin.x, 3)}  N ${formatNumber(cursor.point.y + origin.y, 3)}`;
    if (cursor.s === undefined || cursor.offset === undefined)
      return `${sk.statusBar.outside}  ·  ${coords}`;
    return `${station(cursor.s)}  ·  ${sk.statusBar.offset} ${formatNumber(cursor.offset, 3)} m  ·  ${coords}`;
  }
  if (cursor.s === undefined) return sk.statusBar.outside;
  const profile = alignment.profile;
  if (!profile || cursor.s < profile.startS || cursor.s > profile.endS) return station(cursor.s);
  const p = alignment.elevation(cursor.s);
  return `${station(cursor.s)}  ·  ${sk.statusBar.elevation} ${formatNumber(p.z + origin.z, 3)} ${sk.statusBar.bpv}  ·  ${sk.statusBar.grade} ${formatGrade(p.grade)}`;
}
