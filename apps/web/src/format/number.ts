const formatters = new Map<number, Intl.NumberFormat>();

/** Číslo v slovenskom formáte (desatinná čiarka, medzera ako oddeľovač tisícov). */
export function formatNumber(value: number, decimals: number): string {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('sk-SK', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  // −0 by sa zobrazilo ako „-0“
  const v = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
  return f.format(v).replace(/ | /g, ' ');
}

/** Sklon m/m → percentá. */
export const formatGrade = (grade: number, decimals = 3): string =>
  `${formatNumber(grade * 100, decimals)} %`;
