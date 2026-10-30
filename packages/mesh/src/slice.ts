import type { Vec3 } from '@bridge/geom';
import type { TriangleMesh } from './mesh.ts';

export interface Plane {
  origin: Vec3;
  /** jednotková normála */
  normal: Vec3;
}

/**
 * Rez siete rovinou → uzavreté polyline (posledný bod sa neopakuje); pri neuzavretej sieti aj otvorené.
 * Vrchol presne v rovine sa počíta na kladnú stranu, priesečník hrany sa počíta v kanonickom poradí jej
 * koncov, takže susedné trojuholníky dajú bitovo zhodné body (aj pri zdvojených vrcholoch siete).
 */
export function sliceMesh(mesh: TriangleMesh, plane: Plane): Vec3[][] {
  const p = mesh.positions;
  const { origin: o, normal: n } = plane;
  const nv = p.length / 3;
  const d = new Float64Array(nv);
  for (let i = 0; i < nv; i++) {
    d[i] =
      ((p[3 * i] as number) - o.x) * n.x +
      ((p[3 * i + 1] as number) - o.y) * n.y +
      ((p[3 * i + 2] as number) - o.z) * n.z;
  }
  const point = (i: number): [number, number, number] => [
    p[3 * i] as number,
    p[3 * i + 1] as number,
    p[3 * i + 2] as number,
  ];
  const less = (a: number, b: number) => {
    const pa = point(a);
    const pb = point(b);
    for (let k = 0; k < 3; k++) if (pa[k] !== pb[k]) return (pa[k] as number) < (pb[k] as number);
    return false;
  };
  const cut = (i: number, j: number): Vec3 => {
    const [a, b] = less(i, j) ? [i, j] : [j, i];
    const da = d[a] as number;
    const t = da / (da - (d[b] as number));
    const pa = point(a);
    const pb = point(b);
    return {
      x: pa[0] + t * (pb[0] - pa[0]),
      y: pa[1] + t * (pb[1] - pa[1]),
      z: pa[2] + t * (pb[2] - pa[2]),
    };
  };

  const segments: [Vec3, Vec3][] = [];
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]] as [number, number, number];
    const side = v.map((i) => (d[i] as number) >= 0);
    const crossing: Vec3[] = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e] as number;
      const b = v[(e + 1) % 3] as number;
      if (side[e] !== side[(e + 1) % 3]) crossing.push(cut(a, b));
    }
    if (crossing.length === 2) segments.push(crossing as [Vec3, Vec3]);
  }
  return chain(segments);
}

const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;

function chain(segments: readonly [Vec3, Vec3][]): Vec3[][] {
  const at = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segments.length);
  const next = (p: Vec3): [number, Vec3] | undefined => {
    for (const i of at.get(key(p)) ?? []) {
      if (used[i]) continue;
      const [a, b] = segments[i] as [Vec3, Vec3];
      return [i, key(a) === key(p) ? b : a];
    }
    return undefined;
  };
  const out: Vec3[][] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const [a, b] = segments[i] as [Vec3, Vec3];
    const line = [a, b];
    for (let step = next(b); step; step = next(line[line.length - 1] as Vec3)) {
      used[step[0]] = 1;
      line.push(step[1]);
    }
    // neuzavretý reťazec: pokračovať aj od začiatku
    if (key(line[line.length - 1] as Vec3) !== key(a)) {
      for (let step = next(a); step; step = next(line[0] as Vec3)) {
        used[step[0]] = 1;
        line.unshift(step[1]);
      }
    } else {
      line.pop();
    }
    out.push(line);
  }
  return out;
}
