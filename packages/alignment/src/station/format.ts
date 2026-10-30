/**
 * Zobrazované staničenie vo formáte `km 1,234 567` (km, desatinná čiarka, celé metre, medzera,
 * desatinné miesta metrov); záporné so znamienkom mínus `km -1,296 651` (PLAN.md §7).
 */
export function formatStation(station: number, decimals = 3): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(station) * factor);
  const negative = station < 0 && rounded !== 0;
  const wholeMeters = Math.floor(rounded / factor);
  const km = Math.floor(wholeMeters / 1000);
  const meters = String(wholeMeters % 1000).padStart(3, '0');
  const fraction = decimals > 0 ? ` ${String(rounded % factor).padStart(decimals, '0')}` : '';
  return `km ${negative ? '-' : ''}${km},${meters}${fraction}`;
}

/**
 * Rozpozná staničenie zadané projektantom: `km 1,234 567`, `1,234567`, `1+234.567` alebo metre `1234.567`.
 * Pri neplatnom vstupe vráti `undefined`.
 */
export function parseStation(text: string): number | undefined {
  let t = text.trim().replace(/^km\s*/i, '');
  let sign = 1;
  if (t.startsWith('-')) {
    sign = -1;
    t = t.slice(1).trim();
  }
  const compact = t.replace(/\s+/g, '');
  let value: number | undefined;
  if (/^\d+\+\d+([.,]\d*)?$/.test(compact)) {
    const [km, meters] = compact.split('+') as [string, string];
    value = Number(km) * 1000 + Number(meters.replace(',', '.'));
  } else if (/^\d+,\d*$/.test(compact)) {
    const [km, rest] = compact.split(',') as [string, string];
    const digits = rest.padEnd(3, '0');
    value = Number(km) * 1000 + Number(`${digits.slice(0, 3)}.${digits.slice(3) || '0'}`);
  } else if (/^\d+(\.\d*)?$/.test(compact)) {
    value = Number(compact);
  }
  return value === undefined || !Number.isFinite(value) ? undefined : sign * value;
}
