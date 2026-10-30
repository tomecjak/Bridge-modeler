/** Staničenie mimo rozsahu osi alebo nivelety. Vyhadzuje sa pri volaní mimo platného rozsahu. */
export class StationOutOfRangeError extends Error {
  readonly code: 'StationOutOfRange' | 'ProfileOutOfRange';

  constructor(
    kind: 'alignment' | 'profile',
    readonly s: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`station ${s} is outside the ${kind} range ⟨${min}, ${max}⟩`);
    this.name = 'StationOutOfRangeError';
    this.code = kind === 'alignment' ? 'StationOutOfRange' : 'ProfileOutOfRange';
  }
}
