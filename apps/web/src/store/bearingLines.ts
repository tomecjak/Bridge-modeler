/**
 * Prvé voľné číslo osi uloženia v NK (osi sa číslujú 1 … n od začiatku mosta, ADR 0017); nečíselné názvy sa
 * preskočia.
 */
export function nextLineName(existing: readonly string[]): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}
