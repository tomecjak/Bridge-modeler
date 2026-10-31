import { describe, it } from 'vitest';

/**
 * Golden testy terénu voči Civil 3D (PLAN.md, Fáza 5b). Chýbajú podklady — dodať do `fixtures/inbox/`:
 * 1. LandXML povrchu (`Surfaces/Surface`, TIN) z Civil 3D v okolí mosta, ideálne k osi SO 171-11-01 alebo 212-00;
 * 2. výkaz pozdĺžneho profilu terénu po osi z Civil 3D (Profile → Incremental Station Report pre povrchový profil,
 *    krok 10 m + zlomy) a niekoľko kontrolných bodov E, N, Z na povrchu;
 * 3. vzorku DMR 5.0 (GeoTIFF dlaždica z ÚGKK) pokrývajúcu to isté územie.
 */
describe('terén — golden voči Civil 3D', () => {
  it.todo('výška povrchu v kontrolných bodoch sa zhoduje s Civil 3D ≤ 1 mm');
  it.todo('rez terénom po osi sa zhoduje s pozdĺžnym profilom terénu z Civil 3D ≤ 1 mm');
  it.todo('DMR 5.0 (GeoTIFF) sa načíta a v koridore lícuje s povrchom z Civil 3D');
});
