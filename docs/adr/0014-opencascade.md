# 0014 — OpenCascade (WASM) ako druhé geometrické jadro

- Stav: Prijaté (schválil projektant 2026-10-31)
- Dátum: 2026-10-31

## Kontext

Fáza 8c pridáva presné telesá a booleovské operácie (rozhodnutie projektanta 2026-10-31):
- konce NK orezané rovinou opory;
- opora zjednotená s krídlami;
- vrch piliera po podhľad NK;
- export STEP.

Princíp 6: jadro je za rozhraním `GeometryKernel`, doménový model sa nemení. Nová runtime závislosť potrebuje ADR
(dôvod, licencia, veľkosť).

## Prieskum (2026-10-31, Node 26, NK 212-00)

| | `occt-wasm` 5.11.0 | `replicad-opencascadejs` 1.1.0 | `opencascade.js` 1.1.1 |
|---|---|---|---|
| WASM / brotli | 21,2 MB / 4,56 MB | 23,0 MB / 4,84 MB | ≈ 60 MB / ≈ 9 MB (podľa dokumentácie) |
| licencia | obal MIT OR Apache-2.0, WASM LGPL-2.1-only | LGPL-2.1-only | LGPL-2.1-only |
| API | typované TS, handly v aréne (bez `.delete()`), XCAF, worker | holé väzby OCCT (emscripten), ručná správa pamäte | holé väzby, posledné vydanie 2023 |
| inicializácia (Node) | 58 ms | 110 ms | — |
| udržiavanie | aktívne (vydanie 2026-10-30), jeden autor | aktívne (replicad) | neudržiavané |

Výsledky s `occt-wasm` na NK 212-00 (vzorky z `sampleSuperstructure`, priamkový loft):
- loft 137 ms;
- objem 622,944 m³, zhodný s `MeshKernel` na 1e-9;
- dva rezy polpriestorom 426 ms;
- zjednotenie opory (4 hranoly) 18 ms;
- tesselácia 39 ms;
- STEP AP214 s menami telies (XCAF) 122 ms, 1,1 MB.

## Rozhodnutie

**`occt-wasm` 5.11.0** (presná verzia) ako druhé jadro v novom balíku `packages/occt`:

| Balík | Kde | Dôvod | Licencia | Veľkosť |
|---|---|---|---|---|
| `occt-wasm` 5.11.0 | packages/occt; v aplikácii len lenivo vo vlastnom Web Workeri | presné telesá (loft, hranol), booleovské operácie, objem, tesselácia, STEP s menami | obal MIT OR Apache-2.0, WASM LGPL-2.1-only | JS ≈ 0,1 MB, WASM 21,2 MB (4,56 MB brotli) |

- **LGPL-2.1:** `.wasm` sa nemení a servíruje sa ako samostatný súbor z vlastnej URL (`OcctKernel.init({ wasm })`),
  takže ho používateľ môže nahradiť. Do aplikácie pribudne oznámenie o licencii s odkazom na zdroj OCCT a occt-wasm.
  Projekt je súkromný (`UNLICENSED`); dynamické načítanie samostatného modulu LGPL pripúšťa. Toto nie je právne
  stanovisko — pri distribúcii mimo firmy treba overiť.
- **Načítanie:** len keď projektant zapne „Presný model“ alebo spustí export STEP. Vlastný worker, mimo workera
  sietí. Bežný 3D náhľad ostáva na `MeshKernel` (rýchly, bez sťahovania).
- **Determinizmus (princíp 7):** v hlavičke STEP sa časová pečiatka `FILE_NAME` nahradí pevnou hodnotou; mená telies
  sú „názov (id)“ z modelu.
- **Presnosť zobrazenia:** tesselácia OCCT vracia `Float32Array`. Teleso sa pred tesseláciou posunie k počiatku svojej
  obálky (rovnako ako siete v ADR 0009), aby sa nestrácala presnosť.
- **Prehliadače:** WASM SIMD, tail calls a výnimky; Chrome / Edge 114+, Safari 17.2+, Firefox 121+. Staršie
  prehliadače presný model neponúknu, `MeshKernel` funguje ďalej.
- **Cloudflare:** súbor WASM má 21,2 MB, teda je pod limitom 25 MiB na súbor (Pages); prenos sa komprimuje.

## Dôsledky

- `GeometryKernel` dostane booleovské operácie, objem a export STEP. `MeshKernel` booleovské operácie nevie, scéna
  pri ňom ponechá dnešné aproximácie (ADR 0009).
- Riziko mladej knižnice s jedným autorom: rozhranie `GeometryKernel` umožní prejsť na `replicad-opencascadejs`
  bez zmeny modelu a scény (rovnaké jadro OCCT, iné väzby).
- Testy jadra OCCT bežia v Node (Vitest); WASM sa načíta zo súboru balíka.
