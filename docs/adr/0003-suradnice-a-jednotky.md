# 0003 — Súradnice a jednotky

- Stav: Prijaté; konvencie označené *(navrhnuté)* sa potvrdia golden testmi vo Fáze 1
- Dátum: 2026-10-29

## Kontext

Projekty sú v S-JTSK so súradnicami rádovo stoviek kilometrov a výškami v Bpv. WebGL počíta vo float32
(≈ 7 platných číslic), takže absolútne súradnice by v 3D scéne „trasli“ na centimetre. Vstupy (LandXML
z Civil 3D) majú vlastné poradie osí a konvencie uhlov; UI pracuje v jednotkách zvyklých pre projektanta.
Každá nejednoznačnosť tu znamená chybu polohy mosta, preto konvencie fixujeme na jednom mieste.

## Rozhodnutie

**Jednotky v modeli a výpočtoch**
- SI: dĺžky v metroch, uhly v radiánoch, sklony ako bezrozmerné číslo (m/m). Typ `number` (double),
  v doménových výpočtoch nikdy float32. Float32 len pri odovzdaní siete do GPU, a to v lokálnych súradniciach.
- Prevody na mm, °, %, m n. m. sú **výhradne na hranici UI ↔ model** (`apps/web`). Výpočtové balíky
  o jednotkách UI nevedia.

**Súradnicový systém projektu**
- Referenčný systém: S-JTSK, **EPSG:5514** (Krovak East North): `E = −Y_JTSK`, `N = −X_JTSK`
  (na Slovensku záporné hodnoty). Výškový systém Bpv.
- Projekt má lokálny počiatok `crs.origin = { x: E₀, y: N₀, z: H₀ }` v EPSG:5514 / Bpv.
- **Lokálne súradnice** (všetky výpočty, siete, 3D scéna): pravotočivý systém
  `x = E − E₀` (na východ), `y = N − N₀` (na sever), `z = H − H₀` (nahor).
- Transformácia do S-JTSK iba pri exporte: IFC `IfcProjectedCRS` (EPSG:5514) + `IfcMapConversion`
  (posun = `crs.origin`, bez rotácie a mierky v MVP); DXF podľa nastavenia výkresu (lokálne alebo S-JTSK).
- Počiatok sa volí pri importe osi (napr. zaokrúhlený začiatok osi) a potom sa nemení bez prepočtu modelu.

**Smerník (`azimuth`)** *(navrhnuté)*
- Interne: uhol v rad od lokálnej osi `+y` (sever siete) **v smere hodinových ručičiek**, rozsah ⟨0, 2π).
- Geodetický smerník S-JTSK (od osi `+X_JTSK`, t. j. od juhu, v smere hodinových ručičiek) je
  `σ = azimuth + π (mod 2π)`. Prevod iba na hranici (import/export, zobrazenie), pokrytý testom.
- Ktorú konvenciu používa výpis z Civil 3D, sa overí na referenčných dátach (PLAN.md, sekcia 7).
- LandXML z Civil 3D (overené 2026-10-29): `dir` je v stupňoch od osi +E proti smeru hodinových ručičiek,
  preto `azimuth = π/2 − dir` (mod 2π). Konvenciu CSV výpisu ešte treba overiť.

**LandXML**
- Body sú v poradí **„northing easting [elevation]“**. Parser to prevedie na `{ x: E, y: N, z }` na jednom
  mieste; každá konverzia (poradie osí, znamienka, uhly `dir`, jednotky z elementu `Units`) má vlastný test.
- Podklady z Civil 3D sú v EPSG:5514 so zápornými E/N (potvrdené 2026-10-29). Ak súradnice v súbore
  nie sú v EPSG:5514 (napr. kladné Y/X klasického S-JTSK), import nahlási typovanú chybu — nie ticho prijme.

**Staničenie**
- Interne `s` = spojitá dĺžka po osi v metroch od začiatku osi (bez skokov).
- Zobrazované staničenie = `s` prepočítané cez skoky v staničení (`StationEquation`) a formátované
  formátovačom; obojsmerný prevod je samostatný modul s testami. Formát zobrazenia `km 1,234 567`
  (rozhodnuté 2026-10-29).

**Lokálny rámec prierezu**
- `x` priečne, kladné **vpravo** v smere staničenia; `y` **nahor**; počiatok v referenčnom bode NK na osi.
- Orientácia roviny prierezu voči zvislici (`vertical` / `normalToGrade`) je vlastnosť NK.

**Tolerancie**
- Geometrické funkcie dostávajú toleranciu ako explicitný parameter. Cieľové hodnoty z `CLAUDE.md`:
  poloha voči Civil 3D ≤ 1 mm, smerník ≤ 1e-5 rad, vnútorná konzistencia ≤ 1e-6 m.

## Dôsledky

- Všetko v 3D scéne je v rozsahu stoviek metrov od počiatku → float32 stačí na sub-mm presnosť.
- Každý vstupno-výstupný formát má jasne určené miesto prevodu; chyba v poradí osí sa prejaví v teste, nie v teréne.
- Konvencie označené *(navrhnuté)* sa po dodaní referenčných dát potvrdia alebo opravia novým ADR.
