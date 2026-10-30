/** Staničenie mimo rozsahu osi alebo nivelety. Vyhadzuje sa pri volaní mimo platného rozsahu. */
export class StationOutOfRangeError extends Error {
  readonly code: 'StationOutOfRange' | 'ProfileOutOfRange';
  readonly s: number;
  readonly min: number;
  readonly max: number;

  constructor(kind: 'alignment' | 'profile', s: number, min: number, max: number) {
    super(`station ${s} is outside the ${kind} range ⟨${min}, ${max}⟩`);
    this.name = 'StationOutOfRangeError';
    this.s = s;
    this.min = min;
    this.max = max;
    this.code = kind === 'alignment' ? 'StationOutOfRange' : 'ProfileOutOfRange';
  }
}

/** Os nemá niveletu, a preto nemá výšky. */
export class MissingProfileError extends Error {
  readonly code = 'MissingProfile';
  readonly alignment: string;

  constructor(alignment: string) {
    super(`alignment "${alignment}" has no vertical profile`);
    this.name = 'MissingProfileError';
    this.alignment = alignment;
  }
}
