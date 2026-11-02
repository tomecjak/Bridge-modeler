import type { AlignmentData, HorizontalElementData } from '../data.ts';

/** Minimálny zapisovač LandXML pre testy (body v poradí N E, smery v stupňoch od +E proti smeru hodín). */
export function toLandXml(data: AlignmentData): string {
  const pt = (tag: string, p: { x: number; y: number }) => `<${tag}>${p.y} ${p.x}</${tag}>`;
  const radius = (r: number | null) => (r === null ? 'INF' : String(r));
  const element = (e: HorizontalElementData): string => {
    switch (e.kind) {
      case 'line':
        return `<Line length="${e.length}">${pt('Start', e.start)}${pt('End', e.end)}</Line>`;
      case 'arc':
        return `<Curve rot="${e.rotation}" crvType="arc" length="${e.length}" radius="${e.radius}">${pt('Start', e.start)}${pt('Center', e.center)}${pt('End', e.end)}</Curve>`;
      case 'spiral': {
        const dirStart = (((Math.PI / 2 - e.startAzimuth) * 180) / Math.PI + 720) % 360;
        return `<Spiral length="${e.length}" radiusStart="${radius(e.radiusStart)}" radiusEnd="${radius(e.radiusEnd)}" rot="${e.rotation}" spiType="clothoid" dirStart="${dirStart}">${pt('Start', e.start)}${pt('End', e.end)}</Spiral>`;
      }
    }
  };
  const profiles = data.profiles
    .map(
      (p) =>
        `<Profile><ProfAlign name="${p.name}">${p.pvis
          .map((v) => {
            const text = `${v.station} ${v.elevation}`;
            if (!v.curve) return `<PVI>${text}</PVI>`;
            if (v.curve.kind === 'parabolic')
              return `<ParaCurve length="${v.curve.length}">${text}</ParaCurve>`;
            return `<CircCurve length="${v.curve.length}" radius="${v.curve.radius}">${text}</CircCurve>`;
          })
          .join('')}</ProfAlign></Profile>`,
    )
    .join('');
  const tags = [
    ['BeginRunoutSta', 'beginRunout'],
    ['BeginRunoffSta', 'beginRunoff'],
    ['FullSuperSta', 'fullSuper'],
    ['FullSuperelev', 'fullSuperelev'],
    ['RunoffSta', 'runoff'],
    ['StartofRunoutSta', 'startOfRunout'],
    ['EndofRunoutSta', 'endOfRunout'],
  ] as const;
  const superelevation = (data.superelevation ?? [])
    .map(
      (e) =>
        `<Superelevation staStart="${e.staStart}" staEnd="${e.staEnd}">${tags
          .map(([tag, key]) => (e[key] === undefined ? '' : `<${tag}>${e[key]}</${tag}>`))
          .join('')}</Superelevation>`,
    )
    .join('');
  const equations = data.stationEquations
    .map(
      (q) =>
        `<StaEquation staInternal="${q.staInternal}" staBack="${q.staBack}" staAhead="${q.staAhead}"/>`,
    )
    .join('');
  return `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
<Units><Metric linearUnit="meter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
<Alignments><Alignment name="${data.name}" length="${data.length}" staStart="${data.staStart}">
<CoordGeom>${data.horizontal.map(element).join('')}</CoordGeom>${profiles}${equations}${superelevation}
</Alignment></Alignments></LandXML>`;
}
