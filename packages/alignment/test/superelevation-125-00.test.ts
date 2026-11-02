/**
 * Klopenie z LandXML (ADR 0022) na podkladoch z Civil 3D. Podklady sa neverzujú — bez nich sa testy preskočia.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAlignment, parseLandXml, suggestOrigin } from '../src/index.ts';

const file = resolve(import.meta.dirname, '../../../fixtures/inbox/125-00_C3D.xml');

describe.skipIf(!existsSync(file))('superelevation in the Civil 3D export 125-00', () => {
  it('reads all elements and rejects the data shifted between curves', () => {
    const { alignments } = parseLandXml(readFileSync(file, 'utf8'));
    const data = alignments.find((a) => a.name === '125-00');
    if (!data) throw new Error('chýba os 125-00');
    expect(data.superelevation).toHaveLength(11);
    const { alignment, issues } = createAlignment(data, suggestOrigin(data));
    expect(alignment.superelevation).toBeUndefined();
    const inconsistent = issues.filter((i) => i.code === 'SuperelevationInconsistent');
    expect(inconsistent.length).toBeGreaterThan(0);
    expect(inconsistent.every((i) => i.severity === 'warning')).toBe(true);
  });
});

/**
 * Golden test interpretácie klopenia (Referenčné dáta, bod 8). Chýba podklad — dodať do `fixtures/inbox/`: LandXML osi
 * s `Superelevation` z Civil 3D a k nej výkaz klopenia (Superelevation Report: staničenia nábehov, plné klopenie
 * a priečne sklony pruhov vľavo a vpravo), ideálne aj s oblúkmi doprava aj doľava.
 */
describe('superelevation — golden against a Civil 3D superelevation report', () => {
  it.todo('úseky plného klopenia a nábehov sa zhodujú so staničeniami výkazu ≤ 1 mm');
  it.todo(
    'znamienko FullSuperelev (kladné = klesá doprava) sedí s priečnym sklonom pravého pruhu vo výkaze',
  );
});
