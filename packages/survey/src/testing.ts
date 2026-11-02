/** Skladanie malých ASCII DXF pre testy: skupiny (kód, hodnota) po riadkoch. */

export type Groups = readonly (readonly [number, string | number])[];

const lines = (groups: Groups) => groups.flatMap(([c, v]) => [String(c).padStart(3), String(v)]);

export interface DxfSpec {
  /** premenné hlavičky: meno → skupiny hodnoty */
  header?: Record<string, Groups>;
  /** hladiny: meno, farba (záporná = vypnutá), príznaky */
  layers?: readonly { name: string; color?: number; flags?: number }[];
  /** entity: typ a skupiny */
  entities?: readonly { type: string; groups: Groups }[];
}

export function dxfText(spec: DxfSpec, eol = '\r\n'): string {
  const out: string[] = [];
  out.push(
    ...lines([
      [0, 'SECTION'],
      [2, 'HEADER'],
    ]),
  );
  for (const [name, groups] of Object.entries(spec.header ?? {}))
    out.push(...lines([[9, name], ...groups]));
  out.push(...lines([[0, 'ENDSEC']]));
  out.push(
    ...lines([
      [0, 'SECTION'],
      [2, 'TABLES'],
      [0, 'TABLE'],
      [2, 'LAYER'],
      [70, 1],
    ]),
  );
  for (const l of spec.layers ?? [])
    out.push(
      ...lines([
        [0, 'LAYER'],
        [100, 'AcDbSymbolTableRecord'],
        [2, l.name],
        [70, l.flags ?? 0],
        [62, l.color ?? 7],
      ]),
    );
  out.push(
    ...lines([
      [0, 'ENDTAB'],
      [0, 'ENDSEC'],
    ]),
  );
  out.push(
    ...lines([
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]),
  );
  for (const e of spec.entities ?? []) out.push(...lines([[0, e.type], ...e.groups]));
  out.push(
    ...lines([
      [0, 'ENDSEC'],
      [0, 'EOF'],
    ]),
  );
  return out.join(eol) + eol;
}

export const point = (layer: string, x: number, y: number, z = 0) => ({
  type: 'POINT',
  groups: [
    [8, layer],
    [10, x],
    [20, y],
    [30, z],
  ] as Groups,
});

/** TEXT; `align` = bod zarovnania (kód 11) pri vodorovnom zarovnaní `h` (72). */
export const text = (
  layer: string,
  x: number,
  y: number,
  value: string,
  align?: { x: number; y: number; h: number; v?: number },
) => ({
  type: 'TEXT',
  groups: [
    [8, layer],
    [10, x],
    [20, y],
    [30, 0],
    [40, 0.2],
    [1, value],
    ...(align
      ? ([
          [72, align.h],
          [11, align.x],
          [21, align.y],
          [31, 0],
          [73, align.v ?? 0],
        ] as Groups)
      : []),
  ] as Groups,
});

export const lwpolyline = (layer: string, pts: readonly [number, number][], closed = false) => ({
  type: 'LWPOLYLINE',
  groups: [
    [8, layer],
    [90, pts.length],
    [70, closed ? 1 : 0],
    ...pts.flatMap(([x, y]) => [
      [10, x],
      [20, y],
    ]),
  ] as Groups,
});
