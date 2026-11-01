# Modelér mostov (pracovný názov)

Webová aplikácia na parametrické modelovanie mostov nad osou z LandXML.
Výstupy: 3D náhľad, 2D výkresy (SVG / DXF, neskôr PDF) a IFC 4.3.
Autor a doménový expert: Ing. Jakub Tomečko (projektant mostov).

- Plán, fázy a stav prác: `PLAN.md` — pred prácou si prečítaj sekciu aktuálnej fázy.
- Architektonické rozhodnutia: `docs/adr/NNNN-nazov.md` (krátke ADR: kontext, rozhodnutie, dôsledky).

## Princípy architektúry (nemeniť bez ADR)

1. **Zdrojom pravdy je doménový model projektu** (JSON validovaný schémou). Geometria, výkresy aj IFC sa z neho vždy generujú nanovo; výstupy sa nikdy needitujú priamo.
2. **IFC je iba výstup.** Nič sa z IFC nenačítava späť do modelu.
3. **Každý parameter prierezu a podpier môže byť funkciou staničenia** (konštanta, po častiach lineárna/parabolická zmena, výraz).
4. **Priečne rezy a pozdĺžny rez sa počítajú priamo z parametrov**, nie rezaním 3D telesa.
5. **Výpočtové balíky (`packages/*`) sú čistý TypeScript bez DOM** — bežia v prehliadači, vo Web Workeri aj v Node (testy). DOM, React a three.js patria len do `apps/web`.
6. **Geometrické jadro je za rozhraním `GeometryKernel`.** MVP používa vlastné trojuholníkové siete; OpenCascade (WASM) sa pridá neskôr bez zmeny doménového modelu.
7. **Deterministické generovanie:** rovnaký model → rovnaký výstup (stabilné poradie, stabilné ID/GUID odvodené z ID v modeli).

## Štruktúra repozitára

```
apps/web            React UI, 3D viewer, editory, Web Workery
packages/geom       vektory, matice, lokálne rámce, operácie s polyline/polygónmi
packages/alignment  import LandXML, výpočet smerového vedenia a nivelety, staničenie
packages/expr       parser a vyhodnocovanie výrazov parametrov (bez eval)
packages/model      schéma doménového modelu (zod), staničné funkcie, validácia, graf závislostí
packages/sections   prierez NK na staničení, rozvinutý pozdĺžny rez
packages/mesh       GeometryKernel, generovanie 3D sietí (sweep NK, podpery)
packages/terrain    terén: TIN z LandXML, výška v bode, rezy terénom
packages/drawing    2D výkresový model, hladiny, export SVG a DXF
packages/ifc        export IFC 4.3
fixtures/           referenčné LandXML, výpisy z Civil 3D, očakávané výsledky
tools/              pomocné skripty (napr. validácia IFC cez IfcOpenShell v Pythone)
docs/adr/           architektonické rozhodnutia
```

## Príkazy

```
pnpm install
pnpm dev          # vývojový server apps/web
pnpm test         # Vitest, všetky balíky
pnpm typecheck
pnpm lint
```

## Súradnice a jednotky

- Interne SI: metre, radiány, `number` (double). V doménových výpočtoch nikdy float32.
- Projekt má lokálny počiatok `crs.origin` v S-JTSK (EPSG:5514). 3D scéna a siete sú v lokálnych súradniciach; transformácia do S-JTSK až pri exporte (IFC `IfcMapConversion`, DXF podľa nastavenia).
- **LandXML ukladá body v poradí „northing easting [elevation]“** — pri parsovaní dávaj pozor na poradie osí a na orientáciu osí S-JTSK. Každú konverziu pokry testom.
- Staničenie: interne spojitá dĺžka po osi (`s`, m). Zobrazované staničenie rieši modul skokov v staničení (station equations) a formátovač.
- UI zadáva a zobrazuje rozmery v mm, uhly v °, sklony v %; výšky v m n. m. (Bpv). Prevod je výhradne na hranici UI ↔ model.
- Lokálny rámec prierezu: `x` priečne, kladné vpravo v smere staničenia; `y` nahor; počiatok v referenčnom bode NK na osi.

## Konvencie kódu

- TypeScript `strict`, ESM, pnpm workspaces. Žiadne `any` bez komentára prečo.
- Identifikátory v kóde anglicky podľa glosára nižšie; UI texty slovensky, sústredené v `apps/web/src/i18n/sk.ts`.
- Výpočtové funkcie sú čisté (bez vedľajších efektov) a malé; geometrické funkcie dostávajú tolerancie explicitne.
- Výrazový jazyk (`packages/expr`) nesmie používať `eval` ani `new Function`.
- Nová runtime závislosť len so záznamom v ADR (dôvod, licencia, veľkosť).
- Chyby vstupov (nepodporovaný prvok LandXML, cyklus v parametroch, neplatný prierez) sú typované a zrozumiteľné pre projektanta, nie len stack trace.

## Testy

- Vitest. Matematiku (os, klotoida, výškové oblúky, staničné funkcie, prierezy) píš **test-first**.
- Golden testy proti referenčným dátam vo `fixtures/`: poloha osi voči výpisu z Civil 3D ≤ 1 mm, smerník ≤ 1e-5 rad; vnútorná konzistencia ≤ 1e-6 m.
- Vlastnostné testy tam, kde to dáva zmysel (spojitosť osi na styku prvkov, uzavretosť polygónov prierezu).
- Pred každým commitom musí prejsť `pnpm typecheck && pnpm test`.

## Ako pracovať (pre Claude Code)

- Každú fázu z `PLAN.md` začni návrhom postupu (plan mode) a nechaj ho schváliť.
- Pracuj po úlohách z checklistu; po dokončení úlohu odškrtni v `PLAN.md` a doplň krátku poznámku (čo vzniklo, čo ostáva).
- Jeden commit = jedna úloha, správa commitu po anglicky v imperatíve.
- Pri inžinierskych otázkach (normy, konvencie výkresov, význam pojmu, tvar nábehu) sa **opýtaj, nehádaj**. Predpoklady zapíš do `PLAN.md` → Otvorené otázky.
- Ak chýbajú referenčné dáta pre golden test, vytvor test s `it.todo` a uveď, aké dáta treba dodať.

## Glosár SK → EN (názvy v kóde)

| Slovensky | V kóde |
|---|---|
| os (komunikácie) | `alignment` |
| smerové vedenie | `horizontal` / `HorizontalAlignment` |
| niveleta | `vertical` / `VerticalProfile` |
| staničenie | `station` (`s` = spojitá dĺžka) |
| skok v staničení | `StationEquation` |
| prechodnica (klotoida) | `spiral` (`clothoid`) |
| výškový (zakružovací) oblúk | `verticalCurve` |
| smerník | `azimuth` (rad) — slovo `bearing` je vyhradené pre ložisko |
| nosná konštrukcia (NK) | `superstructure` / `deck` |
| priečny rez, prierez | `crossSection`, `profile` |
| priečny sklon | `crossSlope` |
| nábeh | `haunch` |
| rozšírenie | `widening` |
| podpera | `support` |
| opora | `abutment` |
| pilier | `pier` |
| ložisko | `bearing` (v IFC `IfcBearing`) |
| os uloženia | `bearingLine` |
| rímsa | `edgeBeam` |
| pole, rozpätie | `span` |
| šikmosť, uhol kríženia | `skew` |
| základ | `foundation` |
| výkres | `drawingSheet` |
| zadanie (stavba, objekt) | `brief` |
| objednávateľ | `client` |
| kategória cesty | `roadCategory` |
| voľná šírka (na moste) | `freeWidth` |
| oblasť mosta | `studyArea` |
