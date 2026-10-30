/** Podpis vstavanej funkcie: povolený počet argumentov (max = Infinity pre variadické). */
export interface FunctionSignature {
  min: number;
  max: number;
}

/** Vstavané funkcie (podmnožina vzorcov Revitu, PLAN.md Fáza 2). Názvy sa porovnávajú bez ohľadu na veľkosť písmen. */
export const SIGNATURES: Readonly<Record<string, FunctionSignature>> = {
  if: { min: 3, max: 3 },
  and: { min: 1, max: Number.POSITIVE_INFINITY },
  or: { min: 1, max: Number.POSITIVE_INFINITY },
  not: { min: 1, max: 1 },
  sin: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  tan: { min: 1, max: 1 },
  asin: { min: 1, max: 1 },
  acos: { min: 1, max: 1 },
  atan: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  min: { min: 1, max: Number.POSITIVE_INFINITY },
  max: { min: 1, max: Number.POSITIVE_INFINITY },
  round: { min: 1, max: 1 },
  roundup: { min: 1, max: 1 },
  rounddown: { min: 1, max: 1 },
  pi: { min: 0, max: 0 },
  exp: { min: 1, max: 1 },
  ln: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
};

export const FUNCTION_NAMES: readonly string[] = Object.keys(SIGNATURES);
