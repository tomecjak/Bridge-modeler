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

/** Os nemá niveletu, a preto nemá výšky. */
export class MissingProfileError extends Error {
  readonly code = 'MissingProfile';

  constructor(readonly alignment: string) {
    super(`alignment "${alignment}" has no vertical profile`);
    this.name = 'MissingProfileError';
  }
}
