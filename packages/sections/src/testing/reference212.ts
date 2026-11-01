/**
 * Referenčný most 212-00 pre testy (prehľadný výkres `fixtures/inbox/Vzorový most.pdf`, neverzuje sa).
 * Os cesty je syntetická priamka so sklonom −0,64 % cez km 9,307 81 / 318,512 m n. m. (rozhodnutie 2026-10-31);
 * súradnice sú vymyslené. Rozmery z výkresu: polia 16,00 + 23,00 + 16,00 m (kolmo 14,10 / 20,26 / 14,10),
 * NK 56,00 m, premostenie 53,20 m (predsadenie prahu 0,90 m), celková dĺžka 65,84 m (krídla 4,00 m, opora 0,84 m,
 * medzera 0,08 m v osi mosta), šikmosť 68,71 g,
 * NK h = 1,20 m + vozovka 0,09 m, výška uloženia 0,45 m, horná hrana prahu opôr 316,772 a 316,417 m n. m. (prah
 * výšky 1,10 m priamo na pilótach).
 */
import type { AlignmentData } from '@bridge/alignment';
import { createAlignment } from '@bridge/alignment';
import {
  type BearingLine,
  buildParameterSet,
  createEmptyProject,
  defaultAbutmentGeometry,
  defaultFoundation,
  levelFoundation,
  type ProjectFile,
  type Superstructure,
  type Support,
} from '@bridge/model';
import { evaluateBearingLine, evaluateSupport, type SupportContext } from '../supports.ts';
import { singleDeckExample } from '../templates/singleBeamHaunched.ts';

export const GRADE = -0.0064;
export const STA1 = 9307.81;
export const Z1 = 318.512;
export const STATIONS = [9307.81, 9323.81, 9346.81, 9362.81];
/** 68,71 g → ° */
export const ANGLE = (68.71 * 360) / 400;
export const SIN = Math.sin((ANGLE * Math.PI) / 180);

function road(): AlignmentData {
  const staStart = 9250;
  const length = 200;
  const az = 1.1;
  const start = { x: -512345.6, y: -1187654.3 };
  const end = { x: start.x + length * Math.sin(az), y: start.y + length * Math.cos(az) };
  const z = (sta: number) => Z1 + GRADE * (sta - STA1);
  return {
    name: 'I/68 syntetická',
    staStart,
    length,
    horizontal: [{ kind: 'line', length, start, end }],
    stationEquations: [],
    profiles: [
      {
        name: 'niveleta',
        pvis: [
          { station: staStart, elevation: z(staStart) },
          { station: staStart + length, elevation: z(staStart + length) },
        ],
      },
    ],
  };
}

export function reference212Project(): ProjectFile {
  const data = road();
  const ex = singleDeckExample(data.name, STA1 - 0.5, (STATIONS[3] as number) + 0.5, {
    deck: 'nk',
    profile: 'jt',
    axis: 'os',
  });
  const deck: Superstructure = {
    ...(ex.superstructures[0] as Superstructure),
    parameterLaws: {
      bL: { kind: 'constant', value: '8.25' },
      bR: { kind: 'constant', value: '8.25' },
      h: { kind: 'constant', value: '1.2' },
    },
  };
  const line = (i: number): BearingLine => ({
    id: `l${i + 1}`,
    name: String(i + 1),
    superstructure: 'nk',
    station: STATIONS[i] as number,
    crossingAngle: String(ANGLE),
  });
  const support = (i: number): Support => {
    const abutment = i === 0 || i === 3;
    return {
      id: `p${i + 1}`,
      name: String(i + 1),
      kind: abutment ? 'abutment' : 'pier',
      bearingLine: `l${i + 1}`,
      offset: '0',
      geometry: abutment
        ? {
            ...defaultAbutmentGeometry('20'),
            // kóty výkresu v osi mosta (ADR 0018): predsadenie 0,90, koniec NK 0,50, medzera 0,08, múrik 0,84;
            // prah od zadnej líce múrika = 2,32 v osi mosta = 2,05 kolmo na os opory
            frontOffset: '0.9',
            endOffset: '0.5',
            gap: '0.08',
            backwallThickness: '0.84',
            seatHeight: '1.1',
          }
        : { type: 'wall', thickness: '1.2', length: '7.5' },
      footing: abutment
        ? { length: '0', width: '0', thickness: '0' }
        : { length: '9', width: '6.5', thickness: '1.5' },
      connection: 'bearing',
      bearingHeight: '0.45',
      bearings: ['-1.25', '1.25'],
      // opory: prah priamo na pilótach (výška podpery = výška prahu); piliere: základová škára z výkresu
      // (horná hrana základu 311,07 / 311,18 − hrúbka 1,5)
      foundation: abutment
        ? { ...defaultFoundation('abutment'), height: '1.1' }
        : levelFoundation(i === 1 ? '309.57' : '309.68'),
    };
  };
  return {
    ...createEmptyProject('212-00'),
    crs: { epsg: 5514, origin: { x: -512300, y: -1187600, z: 0 } },
    alignments: [data],
    bridgeAxes: ex.bridgeAxes,
    profiles: [ex.profile],
    superstructures: [deck],
    bearingLines: [0, 1, 2, 3].map(line),
    supports: [0, 1, 2, 3].map(support),
  };
}

export function evaluateReference212() {
  const p = reference212Project();
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const { alignment } = createAlignment(p.alignments[0] as AlignmentData, origin);
  const ctx: SupportContext = {
    alignments: new Map([[alignment.name, alignment]]),
    parameters: buildParameterSet([]),
    bridgeAxes: p.bridgeAxes,
    profiles: p.profiles,
    planLines: p.planLines,
    superstructures: p.superstructures,
    bearingLines: p.bearingLines,
  };
  const lines = p.bearingLines.map((l) => evaluateBearingLine(ctx, l));
  const results = p.supports.map((s) => evaluateSupport(ctx, s));
  const deck = p.superstructures[0] as Superstructure;
  const sFrom = alignment.stationing.fromDisplay(deck.from) as number;
  const sTo = alignment.stationing.fromDisplay(deck.to) as number;
  return { p, ctx, alignment, lines, results, deck, sFrom, sTo };
}
