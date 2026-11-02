import type { ProfileDefinition } from '@bridge/model';
import { evaluateProfileDefinition, previewScope, profileParameterValues } from '@bridge/sections';
import { useMemo } from 'react';

const W = 132;
const H = 52;
const PAD = 4;

/** Náhľad tvaru prierezu s predvolenými hodnotami parametrov (knižnica prierezov). */
export function ProfileThumbnail({ profile }: { profile: ProfileDefinition }) {
  const path = useMemo(() => {
    const none = previewScope(profile, () => undefined);
    const values = profileParameterValues(profile, {}, none, 0).values;
    const loops = evaluateProfileDefinition(profile, values, none, 0).loops;
    const pts = loops.flatMap((l) => l.polygon);
    if (pts.length === 0) return undefined;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const k = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
    const ox = (W - k * (maxX - minX)) / 2;
    const oy = (H - k * (maxY - minY)) / 2;
    return loops
      .map(
        (l) =>
          `${l.polygon
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'}${(ox + k * (p.x - minX)).toFixed(1)},${(oy + k * (maxY - p.y)).toFixed(1)}`,
            )
            .join('')}Z`,
      )
      .join('');
  }, [profile]);
  return (
    <svg className="profile-thumb" width={W} height={H} aria-hidden="true">
      {path && <path d={path} fillRule="evenodd" />}
    </svg>
  );
}
