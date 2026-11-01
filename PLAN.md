# Plán — Modelér mostov

Stav: návrh v0.1 (2026-10-29). Úlohy sa odškrtávajú priebežne; poznámky pripisuj pod úlohu.

## 1. Cieľ MVP

Jeden most (jedna alebo dve NK) nad jednou osou z LandXML:
parametrický prierez NK s nábehmi a rozšíreniami → podpery na staničeniach → 3D náhľad →
priečne rezy, rozvinutý pozdĺžny rez a pôdorys do DXF → export IFC 4.3.
Nástroj by mal slúžiť ako taký rýchly modeler pre vytváranie koncepcie mostov, nie do úplných detialov, ale skôr rozloženie a staničenie podpier, využitie nejakého typu nosnej konštrukcie, nejakýho typockého drieku a podobne a ukázenie modelu v teréne, alebo v niečom podobnom.

**V rozsahu MVP**
- import osi a nivelety z LandXML (priamka, oblúk, klotoida; tangenty, výškové oblúky; skoky v staničení)
- výrazy a parametre, parametre ako funkcie staničenia
- parametrický prierez NK (obrys aj dutiny)
- opory a piliere na staničeniach so šikmosťou, ložiská / kĺby
- 3D model ako trojuholníková sieť, 3D viewer
- 2D výkresy: priečny rez, rozvinutý pozdĺžny rez, pôdorys → SVG, DXF
- terén: import povrchu (TIN) z LandXML, zobrazenie v 3D, terénna čiara v pozdĺžnom a priečnom reze
- export IFC 4.3 s georeferenciou a osou
- uloženie projektu ako JSON

**Mimo MVP** (viď Fáza 8): import IFC, booleovské operácie a pohľady so skrytými hranami (OpenCascade),
výmery, viac osí, detaily oceľových a spriahnutých NK, výstuž, predpätie, backend a spolupráca, ProjectWise.

## 2. Technologický stack

| Oblasť | Voľba | Poznámka |
|---|---|---|
| Monorepo | pnpm workspaces | štruktúra v `CLAUDE.md` |
| Build / dev | Vite | |
| UI | React + TypeScript (strict) | |
| Stav aplikácie | Zustand + undo/redo cez príkazy (immer patches) | |
| Validácia modelu | zod (+ export JSON Schema) | verzia schémy v súbore projektu |
| 3D | three.js cez @react-three/fiber | lokálne súradnice |
| Výpočty mimo UI | Web Worker + Comlink | transferable buffers |
| LandXML | fast-xml-parser | beží aj v Node (testy) |
| Výrazy | vlastný parser (podmnožina syntaxe vzorcov Revitu) | čísla v SI, goniometria v stupňoch |
| DXF | vlastný zapisovač DXF R2000 | ADR 0012 |
| IFC | rozhodne ADR vo fáze 7 (kandidát web-ifc, schéma IFC4X3) | validácia IfcOpenShell (Python) v `tools/` |
| Testy | Vitest; neskôr Playwright pre e2e | |
| Lint / format | ESLint + Prettier alebo Biome | ADR 0001 |

## 3. Náčrt doménového modelu

Orientačný návrh pre fázy 1–4; finálna podoba v `packages/model` (zod schéma).

```ts
type Station = number;            // spojitá dĺžka po osi [m]
type Expr = string;               // výraz, napr. "h0 + (h1 - h0) * 0.5"

interface ProjectFile {
  schemaVersion: string;
  name: string;
  crs: { epsg: 5514; origin: { x: number; y: number; z: number } };  // lokálny počiatok v S-JTSK
  alignments: Alignment[];        // normalizované z LandXML, uložené v projekte
  bridgeAxes: BridgeAxis[];       // os mosta odvodená od osi cesty
  parameters: Parameter[];        // globálne parametre projektu
  profiles: ProfileDefinition[];
  superstructures: Superstructure[];
  supports: Support[];
  drawings: DrawingDefinition[];
}

interface Parameter { name: string; value: Expr; unit: 'length' | 'angle' | 'slope' | 'none'; }

type StationFunction =
  | { kind: 'constant'; value: Expr }
  | { kind: 'piecewise'; segments: Segment[] }        // nábehy, rozšírenia
  | { kind: 'expression'; expr: Expr };               // výraz s premennou s

interface Segment {
  from: Station; to: Station;
  v0: Expr; v1: Expr;
  shape: 'linear' | 'parabolic' | 'circular';
  vertexAt?: 'start' | 'end';                         // kde má parabola nulovú dotyčnicu
}

interface BridgeAxis {                                // nezávislá od osi cesty, posúvateľná
  id: string; name: string;
  alignmentId: string;
  horizontalOffset: StationFunction;                  // + vpravo; predvolene 0
  verticalOffset: StationFunction;                    // + nahor; predvolene −hrúbka vozovky
}

interface ProfileDefinition {
  id: string; name: string;
  parameters: { name: string; unit: Parameter['unit']; default: number }[];
  points: { name: string; x: Expr; y: Expr }[];       // lokálny rámec prierezu (CLAUDE.md)
  loops: { name: string; role: 'outer' | 'void'; points: string[] }[];
}

interface Superstructure {
  id: string; name: string;
  bridgeAxisId: string;
  from: Station; to: Station;
  profileId: string;
  parameterLaws: Record<string, StationFunction>;     // napr. h, bLeft, bRight, crossSlope
  referencePoint: string;                             // bod profilu, ktorý leží na osi mosta
  orientation: 'vertical' | 'normalToGrade';
}

interface Support {
  id: string; name: string;
  kind: 'abutment' | 'pier';
  bridgeAxisId: string;
  station: Station;
  skew: Expr;                                         // šikmosť voči kolmici na os
  type: 'wall' | 'columns' | 'abutmentBlock';
  parameters: Record<string, Expr>;
  connection: 'bearing' | 'hinge' | 'fixed';          // ložisko, vrubový kĺb, votknutie
  bearings: { profilePoint: string; height: Expr }[];
}

interface DrawingDefinition {
  id: string;
  kind: 'crossSection' | 'longitudinalSection' | 'plan';
  stations?: Station[];
  scale: number;                                      // napr. 50 = 1:50
  layerStandard: string;                              // id konfigurácie hladín
}
```

## 4. Fázy

Fázy 6 a 7 sú na sebe nezávislé, poradie sa dá vymeniť. Fáza 5b (terén) závisí len od fázy 1 a viewera z fázy 5.

### Fáza 0 — Kostra projektu
- [x] pnpm monorepo, spoločný `tsconfig` (strict), lint a format
  - `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); balíky bez `DOM` aj bez Node typov — prístup k `document`/`process` zlyhá v typechecku. Lint a format: Biome (ADR 0001), Markdown sa neformátuje.
- [x] Vitest pre všetky balíky, `pnpm test` z koreňa
  - koreňový `vitest.config.ts` s `test.projects`; nový balík sa zaradí automaticky.
- [x] `apps/web`: Vite + React, rozloženie: vľavo strom projektu, v strede 3D/2D, vpravo vlastnosti
  - CSS grid (hlavička, 3 panely, stavový riadok), prepínač 3D/2D s prázdnymi plochami, texty v `src/i18n/sk.ts`, svetlá/tmavá téma podľa systému.
- [x] prázdne balíky podľa `CLAUDE.md`, každý s `index.ts` a jedným testom
  - scope `@bridge/*` (pracovný), bez build kroku (`exports` → `src/index.ts`); `fixtures/README.md` so zoznamom potrebných dát.
- [x] GitHub Actions: typecheck, lint, test
  - `.github/workflows/ci.yml` (+ `pnpm build`). Ostáva: Jakub vytvorí GitHub repo a pushne — až potom bude CI reálne zelené.
- [x] ADR 0001 stack a nástroje, 0002 doménový model ako zdroj pravdy, 0003 súradnice a jednotky
  - v ADR 0003 je konvencia lokálnych osí a smerníka *navrhnutá*, potvrdí sa golden testmi vo Fáze 1.

**Hotové, keď:** CI je zelené a `pnpm dev` zobrazí prázdnu aplikáciu s rozložením.

### Fáza 1 — Os z LandXML
- [x] `packages/geom`: Vec2/Vec3, `Frame` (počiatok, tangenta, normála, binormála), rotácie, tolerancie
  - aj normalizácia uhlov, azimut ↔ vektor, Gauss–Legendre kvadratúra. `Frame.normal` = vodorovne vpravo, `binormal` ≈ nahor.
- [x] parser LandXML: `Alignments/Alignment/CoordGeom` (Line, Curve, Spiral), `Profile/ProfAlign` (PVI, ParaCurve, CircCurve), `StaEquation`, `Units`; poradie bodov N E
  - fast-xml-parser (ADR 0004). Výstup `AlignmentData` (JSON, absolútne EPSG:5514) + typované problémy bez textov; kladné súradnice → `CoordinateSystemMismatch`.
- [x] smerové vedenie: priamka, kružnicový oblúk, klotoida (Fresnelove integrály, presnosť ≤ 0,1 mm); iné typy prechodníc → chyba `UnsupportedSpiralType`
  - všeobecná klotoida (aj R₁ → R₂) cez Gauss–Legendre; zhoda s radom Fresnelových integrálov ≤ 1e-10 m. Každý prvok začína v bode z LandXML; nesúlad konca > 1 mm → `GeometryMismatch`, zlom smeru > 1e-5 rad → `DirectionMismatch`.
- [x] niveleta: tangenty, parabolické a kružnicové výškové oblúky
  - kružnicový oblúk ako presná kružnica z polomeru (atribút `length` sa nepoužíva, viď Otvorené otázky). Mimo rozsahu → `ProfileOutOfRange`.
- [x] API: `evaluate(s) → { point, azimuth, grade, frame }` a `project(point) → { s, offset }`
  - `createAlignment(data, origin)`, `suggestOrigin` (začiatok osi na 100 m, H₀ = 0), `evaluateHorizontal`, `elevation`, `elements`, `stationing`.
- [x] staničenie: prevod `s` ↔ zobrazované staničenie so skokmi, formátovač
  - skoky vpred (medzera) aj späť (prekryv → región); `formatStation` / `parseStation` (`km 1,234 567`, `1+234.567`, metre). Overené len synteticky — podklad so skokom chýba.
- [x] golden testy proti `fixtures/` (výpis z Civil 3D)
  - SO 171-11-01: 74 bodov osi max 0,050 mm a 3,7e-9 rad, 28 bodov stykov prvkov, 89 bodov nivelety max 0,049 mm (odchýlky = zaokrúhlenie výkazov). Dáta sa neverzujú: `pnpm fixtures:convert` → `fixtures/local/`; bez nich sa golden testy preskočia, CI beží na syntetickej osi (round trip LandXML). Os 101-00: `it.todo` (chýbajú výkazy).
- [x] UI: import LandXML (drag & drop), pôdorys osi so staničením, pozdĺžny profil nivelety, kurzor ukazuje staničenie a súradnice
  - SVG s vlastným pan/zoom (koliesko, ťahanie, dvojklik = prispôsobiť), farby podľa typu prvku, profil s prevýšením 10×, kurzor synchronizovaný medzi pôdorysom a profilom, problémy po slovensky v paneli vlastností. Ostáva: výber nivelety, ak je ich v súbore viac (berie sa prvá); parsovanie vo Workeri (Fáza 5).

**Hotové, keď:** ≥ 20 kontrolných staničení (aj v klotoidách a výškových oblúkoch) sedí s Civil 3D ≤ 1 mm a poloha aj smer sú spojité na stykoch prvkov.

### Fáza 2 — Výrazy, parametre, staničné funkcie
- [x] `packages/expr`: tokenizer, parser (Pratt), AST, vyhodnotenie; `+ - * / ^`, porovnania, `and or not`, `if()`, `sin cos tan asin acos atan sqrt abs min max round roundup rounddown pi()`
  - aj `exp ln log`, porovnania `<= >= <>`, rovnosť s toleranciou 1e-9, typová kontrola number/boolean, lenivé `if`. Goniometria v stupňoch (ADR 0006). Bez `eval`.
- [x] chybové hlásenia s pozíciou vo výraze
  - každá chyba nesie `span`; UI podčiarkne miesto vlnovkou a vypíše slovenskú hlášku (vrátane rady „desatinná bodka“ pri čiarke).
- [x] graf závislostí parametrov: detekcia cyklov, topologické vyhodnotenie, cache
  - cyklus s cestou (`b → c → b`), neznámy odkaz, šírenie neplatnosti (`DependsOnInvalid`), rozlíšenie parametrov závislých od staničenia; nezávislé sa vyhodnotia raz.
- [x] `packages/model`: `StationFunction` (constant, piecewise s tvarmi linear / parabolic / circular, expression)
  - hranice úsekov a premenná `sta` = zobrazované staničenie (ADR 0006), kontrola medzier/prekryvov a hraníc v skoku staničenia (`validateStations`); kružnica len pre dĺžky; test hodnoty aj dotyčnice nábehu na oboch koncoch.
- [x] zod schéma projektu, verzia schémy, kostra migrácií
  - `schemaVersion: "1"`, `openProject` / `serializeProject` (stabilné poradie kľúčov), chyby s cestou v súbore; JSON Schema v `docs/schema/project.schema.json` (`pnpm schema:export`, test stráži aktuálnosť). zod/zustand/immer v ADR 0005. Zapnuté `erasableSyntaxOnly` (ADR 0001).
- [x] uloženie a otvorenie projektu (JSON súbor), autosave do IndexedDB
  - Nový / Otvoriť / Uložiť (`<názov>.bridge.json`), autosave s oneskorením 1 s a obnova pri štarte; store so späť/znova (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) cez immer patches. Import LandXML ukladá os do projektu.
- [x] UI: tabuľka parametrov, editor staničnej funkcie s grafom priebehu po staničení
  - záložka Parametre (hodnoty na zvolenom staničení v mm/°/%), parametre v strome projektu, editor úsekov v pravom paneli, graf s hranicami úsekov a ukazovateľom hodnoty. Premenovanie parametra prepíše odkazy vo všetkých výrazoch (na úrovni tokenov, jeden krok späť/znova).

**Hotové, keď:** parabolický nábeh má správnu hodnotu aj dotyčnicu na oboch koncoch (test), cyklus v parametroch dáva zrozumiteľnú chybu a projekt sa uloží a načíta bez straty.

### Fáza 3 — Prierez NK
- [x] `ProfileDefinition`: pomenované body s výrazmi, obrysy a dutiny, parametre s predvolenými hodnotami
  - body vidia parametre profilu, globálne parametre, `sta` a skoršie body ako `Bod_x`, `Bod_y` (ADR 0007). Schéma v2 + migrácia 1 → 2.
- [x] os mosta: posun od osi cesty (vodorovný a zvislý ako staničné funkcie), predvolene na osi cesty so zvislým posunom o hrúbku vozovky
  - `evaluateBridgeAxis`; pri premennom vodorovnom posune sa smer berie z osi cesty (zanedbateľná odchýlka).
- [x] základný editor prierezu: definovanie základných prvkov (body, obrysy, dutiny, parametre); plný editor vo Fáze 8
  - tabuľky parametrov, bodov a obrysov v pravom paneli; premenovanie parametra / bodu prepíše odkazy. Editory NK a osi mosta (priebehy cez `StationFunctionEditor`).
- [x] `evaluateProfile(superstructure, s) → Polygon2D[]` s dosadením staničných funkcií v `s`
  - `evaluateSuperstructure(ctx, nk, s)` v `packages/sections` vráti obrysy, plochu, ťažisko, bod osi mosta a transformáciu do lokálnych súradníc.
- [x] väzba referenčného bodu profilu na os mosta
  - orientácia roviny prierezu `vertical` / `normalToGrade` (test kolmosti na niveletu).
- [x] priečny sklon ako parameter profilu (MVP), nie z LandXML
  - parameter `q` šablóny (kladný = klesá doprava); spodok rovnobežný alebo vodorovný (`spodokRovnobezny`).
- [x] kontroly: uzavretosť, samopretínanie, orientácia; plocha a ťažisko prierezu
  - `geom/polygon.ts`; obrys sa pri opačnom poradí otočí s upozornením, dutina musí byť vnútri obrysu.
- [x] fixture: dvojica NK podľa rezu E–E (`Dvojica NK.png`): celkom 29 400 mm, ľavá NK 15 400 / pravá 13 800, spodná šírka trámu 5 000 / 4 000, výška v osi 1 700 (zvislo), konzola 200 na konci a 500 pri nábehu, priečny sklon 4,5 %
  - šablóna „Jednotrám s nábehmi“ + `twinDeckExample`; test kót: šírky betónu 14 650 / 13 050, spodok 4 850 + 5 000 + 4 800 a 4 550 + 4 000 + 4 500, výška 1 700 (s vozovkou 1 790), konzola 200 / 500, sklon 4,5 %, medzera 900 s osou R2 uprostred.
- [x] UI: náhľad prierezu s posuvníkom staničenia a kótami hlavných rozmerov
  - záložka Prierez (šírka, výška v osi, plocha, ťažisko), vloženie príkladu dvojice NK; 1 000 prierezov za ~33 ms (test), v prehliadači 0,4–3 ms na zmenu.

**Hotové, keď:** fixture sedí s výkresom na všetkých kótach a zmena parametra sa prejaví v náhľade do 100 ms.

### Fáza 4 — Podpery a polia
- [x] `Support`: opora / pilier, staničenie, šikmosť, voliteľný posun od osi
  - šikmosť = uhol kríženia (90° = kolmá, proti smeru hodín od osi mosta); podpera patrí jednej NK; schéma v3 + migrácia 2 → 3 (ADR 0008).
- [x] typy v MVP: stenový pilier, pilier z jedného alebo viacerých stĺpov (rozmery, počet, rozostup); opora ako zjednodušený blok (úložný prah, driek, základ)
  - stĺpy kruhové aj obdĺžnikové; pôdorys podpery a základu (`supportPlan`) a pohľad v rovine prierezu (`supportElevation`).
  - 2026-10-31: opora s úložným prahom, voliteľným driekom a základom, záverným múrikom a krídlami (zavesené / založené, uhol od osi mosta), schéma v4 (ADR 0010); celková dĺžka mosta po konce krídel v zozname polí.
- [x] uloženie: ložisko, vrubový kĺb alebo votknutie; výška uloženia ako parameter
- [x] výška podpery od spodného povrchu NK po hornú hranu základu, prepočet pri zmene nivelety alebo NK
  - horná hrana základu = kóta v m n. m.; spodok NK nad ložiskom z rezu prierezu; testy: niveleta +0,5 m → výška +0,5 m, h 1,7 → 1,9 m → výška −0,2 m.
- [x] ložiskové body z pomenovaných bodov profilu premietnuté na podperu
  - podľa rozhodnutia 2026-10-30 zadané priečnymi vzdialenosťami od osi NK (nie pomenovanými bodmi); ložisko leží na osi podpery, staničenie `s₀ − x·cot α`.
- [x] polia odvodené z poradia podpier, validácia poradia a minimálnej dĺžky
  - opory na koncoch, piliere medzi, duplicitné staničenie, `minSpan` (globálny parameter, predvolene 5 m); informatívne upozornenie nad ekonomickým rozpätím (VŠB) podľa `typology` profilu.
- [x] UI: zoznam podpier, pridanie podpery kliknutím na staničenie, editor parametrov
  - „Pridať podperu“ v pôdoryse (klik na os → NK s najbližšou osou, pri konci NK opora); obrysy v pôdoryse, značky v profile, pohľad v priereze, editor s výškami pri ložiskách, polia v editore NK.

**Hotové, keď:** výšky podpier sa správne prepočítajú pri zmene nivelety alebo hrúbky NK a šikmá podpera má v pôdoryse správnu orientáciu (test).

### Fáza 5 — 3D model
- [x] rozhranie `GeometryKernel` a implementácia `MeshKernel`
  - `loft`, `prism` (aj po častiach so zalomenou hornou plochou), `tessellate`; sieť v double, normály a indexy pre GPU; triangulácia s dutinami v `geom`; rez siete rovinou `sliceMesh` (ADR 0009).
- [x] sweep NK: adaptívne vzorkovanie (hustejšie v oblúkoch, na zlomoch staničných funkcií a pri podperách), triangulácia medzi prierezmi s rovnakou topológiou, uzavretie koncov
  - tolerancia tetivy 2 mm, krok najviac 2 m, vzorka 1 mm pred skokom priebehu; pri zmene topológie nový loft. Konce NK rovnobežné s krajnou oporou (rozhodnutie 2026-10-30), inak kolmé.
- [x] orientácia prierezu podľa `Superstructure.orientation`
  - cez `toWorld` z Fázy 3; test zhody rezu pre `vertical` aj `normalToGrade`.
- [x] podpery ako jednoduché telesá v lokálnych súradniciach
  - základ, driek / stĺpy (kruh, obdĺžnik) / opora po hornú hranu podpery (rovinná medzi ložiskami), ložiská 0,6 × 0,6 m.
- [x] generovanie vo Web Workeri, prenos cez transferable buffers, regenerácia len zmenených objektov
  - Comlink, „posledná vyhráva“; cache podľa kľúča vstupov objektu (rozmer piliera prepočíta len pilier, šikmosť opory aj jej NK).
- [x] viewer: lokálne súradnice, orbit, rezová rovina, výber objektu → panel vlastností
  - three.js priamo (bez fiber, ADR 0009), lenivý chunk; siete relatívne k stredu + logaritmický hĺbkový buffer; „Prispôsobiť“ na výber alebo celý model; rez na staničení prierezu s uzávermi NK; výber v 3D aj v strome otvorí editor.

**Hotové, keď:** most dĺžky 200 m sa regeneruje do 1 s, pri priblížení nič netrasie a rez 3D siete na ľubovoľnom staničení sa zhoduje s 2D prierezom z fázy 3 (test).

### Fáza 5b — Terén
- [x] `packages/terrain`: TIN (body, trojuholníky) v lokálnych súradniciach, priestorový index, `elevationAt(x, y)` (mimo povrchu → typovaná chyba / `undefined`)
  - `createTin` s pravidelnou mriežkou buniek, mimo povrchu `undefined`; mriežka rastra sa prevádza na TIN (`gridToTin`), 100 tis. trojuholníkov + 10 tis. dotazov < 1 s (test).
- [x] import LandXML `Surfaces/Surface/Definition` (`Pnts`, `Faces`), poradie bodov N E Z; viac povrchov v súbore → výber
  - `parseSurfaces` s typovanými chybami (jednotky, EPSG:5514, neznáme body, typ povrchu); plochy `i="1"` sa vynechajú; dialóg importu so zaškrtnutím povrchov.
- [x] import DMR 5.0 z ÚGKK (formát podľa vzorky, pravdepodobne GeoTIFF raster) → rovnaké rozhranie ako TIN (`elevationAt`, rezy); ADR k knižnici na čítanie rastra
  - geotiff.js (ADR 0011), číta sa len okno koridoru, lenivý chunk; JTSK03 = JTSK; overené na GeoTIFF vygenerovanom v teste — **vzorka DMR od ÚGKK ešte chýba**.
  - 2026-10-31: **DMR 5.0 sa stiahne automaticky** zo služby ZBGIS (`LLS_DMR5/MapServer`, `identify` po dávkach 2 000 bodov, postup z Mini-IFC-tools) po zapnutí „Terén“ v 3D, keď projekt terén nemá; priebeh, zrušenie, „Stiahnuť znova“, atribúcia © ÚGKK SR CC BY 4.0. Overené na reálnej službe (koridor 212-00 presunutý do pokrytia LLS: 18 724 bodov za ~20 s).
- [x] orezanie povrchu na koridor okolo osi mosta (šírka ako parameter), aby sa veľké DMR dali používať v prehliadači
  - pás `halfWidth` (60 m) v rozsahu NK ± `margin` (50 m), bez NK celá os; TIN aj mriežka (úseky riadkov) v lokálnych súradniciach na mm.
- [x] rez terénom: pozdĺž osi (pre pozdĺžny rez) a pozdĺž priečnej čiary na staničení (pre priečny rez) → polyline so zlomami na hranách TIN
  - `cutPolyline`, `profileAlong` (os nahradená tetivami ≤ 1 m), `crossSection`; čiara sa mimo povrchu preruší; terénna čiara v pozdĺžnom profile a v priereze.
- [x] ADR: kde je terén uložený (v projektovom JSON vs. samostatný súbor/asset) a ako sa udržiava determinizmus
  - ADR 0011: v projekte (schéma v5), orezaný na koridor, zaokrúhlený na mm, stabilné poradie.
- [x] viewer: terén ako polopriehľadná sieť, zapínanie/vypínanie
  - prepínač „Terén“, sieť relatívne k stredu, reže ju aj rezová rovina; worker 3D terén nedostáva.
  - 2026-10-31: stiahnutý DMR pokrýva obdĺžnik E/N okolo mosta (okraj 50 m); na teréne podklad ortofotomapa alebo mapa ZBGIS (WMS, ako Mini-IFC-tools), voľba „Podklad“ v 3D s atribúciou.
- [ ] golden test: výška v kontrolných bodoch voči Civil 3D ≤ 1 mm
  - `packages/terrain/src/golden.test.ts` ako `it.todo` — treba LandXML povrchu, výkaz profilu terénu po osi a vzorku DMR 5.0 (2026-10-31).

**Hotové, keď:** povrch z Civil 3D aj DMR 5.0 sa načítajú, v 3D lícuje s mostom a rez terénom sa zhoduje s pozdĺžnym profilom terénu z Civil 3D ≤ 1 mm (test).

### Fáza 6 — 2D výkresy
Rozhodnutie 2026-10-31: výkresy sa v nástroji nevytvárajú (bez listov, rámikov a kót). Obsah je dynamicky v pohľadoch
Pôdorys, Pozdĺžny profil a Prierez a ich geometria sa exportuje do DXF / SVG, kde sa výkres dokončí v AutoCADe (ADR 0012).
- [x] rozvinutý pozdĺžny rez: horný a spodný povrch NK, podpery, niveleta, terén, staničenia, výšky
  - `deckLongitudinal` (rez obrysom aj dutinami v osi mosta) a `cutAlongAxis` (prah, múrik, driek, stena, stĺpy, základ) z parametrov; vzorky NK spoločné s 3D (`sampleSuperstructure`). V profile výber NK a prevýšenia 1–10×; terén po osi mosta; nad podperou zvislý popis s názvom a staničením. Kóty a výškové popisy sa nerobia (rozhodnutie 2026-10-31).
- [x] terénna čiara v priečnom reze
  - už z Fázy 5b; je v exporte priečneho rezu (hladina `TEREN`).
- [x] pôdorys: obrysy NK, os so staničením, podpery so šikmosťou
  - `deckOutline` s koncami rovnobežnými s oporou (zhoda s 3D sieťou ± 2 mm), os mosta, podpery, základy, ložiská, os podpery s názvom; v exporte staničenie každých 20 m, popis každých 100 m.
- [x] export SVG (náhľad v aplikácii) a DXF (mm, hladiny, mierka; lokálne alebo S-JTSK súradnice)
  - „Export“ v každom pohľade; DXF R2000 **v metroch** (rozhodnutie 2026-10-31), pôdorys v S-JTSK alebo lokálne, pozdĺžny rez 1 : 1 (x = staničenie, y = m n. m.), priečny rez x = odsadenie od osi cesty; texty 2,5 mm pre mierku 1 : 200 / 1 : 100. Vzory mosta 212-00 (`pnpm drawings:samples`) prechádzajú kontrolou ezdxf (`tools/validate_dxf.py`) bez chýb. **Otvorenie v AutoCADe a lícovanie s Civil 3D treba overiť** (projektant).
- [x] ADR: knižnica pre DXF vs. vlastný zapisovač
  - ADR 0012: vlastný zapisovač (LWPOLYLINE, TEXT, hladiny, typy čiar), bez runtime závislosti.

**Hotové, keď:** DXF sa otvorí v AutoCADe so správnymi hladinami a jednotkami, rozmery v reze sedia s modelom a pôdorys v S-JTSK lícuje s podkladom z Civil 3D.

### Fáza 7 — Export IFC 4.3
- [ ] ADR: web-ifc vs. vlastný zapisovač STEP; schéma IFC4X3_ADD2
- [ ] priestorová štruktúra: IfcProject → IfcSite → IfcBridge → IfcBridgePart (nosná konštrukcia, spodná stavba)
- [ ] georeferencia: IfcProjectedCRS (EPSG:5514) + IfcMapConversion, výškový systém Bpv
- [ ] IfcAlignment: sémantika (IfcAlignmentHorizontal / Vertical a ich segmenty) aj geometria (IfcCompositeCurve, IfcGradientCurve)
- [ ] mapovanie prvkov na triedy a PredefinedType IFC 4.3 (NK, rímsy, piliere, opory, základy, ložiská) — overiť v špecifikácii, zapísať do ADR
- [ ] geometria v MVP: IfcTriangulatedFaceSet
- [ ] vlastnosti: štandardné Pset + vlastná Pset s kľúčovými parametrami (staničenie, šikmosť, rozmery)
- [ ] stabilné GlobalId odvodené z ID v modeli
- [ ] `tools/validate_ifc.py` (IfcOpenShell) v CI; ručne buildingSMART validation service

**Hotové, keď:** súbor prejde validáciou a otvorí sa správne umiestnený v Revite, Civil 3D a v jednom nezávislom prehliadači (napr. BIMvision alebo Bonsai).

### Fáza 8 — Okraj NK z krivky, editor prierezu, OpenCascade
Rozhodnutie 2026-10-31: Fáza 7 (IFC) sa odkladá, kým nebude projekt vyladený. Z backlogu sa robí okraj NK podľa krivky,
plnohodnotný editor prierezu s knižnicou a OpenCascade; poradie 8a → 8b → 8c.

#### 8a — Okraj NK podľa krivky
- [x] schéma v6: čiary v pôdoryse (`planLines`) a priebeh parametra profilu `edge` (vzdialenosť od osi mosta ku krivke kolmo na os + prídavok); migrácia 5 → 6
  - doplnok ADR 0007; typované chyby `EdgeCurveNotFound`, `EdgeCurveNotReached`.
- [x] výpočet vzdialenosti ku krivke (os z LandXML alebo čiara), zlomy vo vzorkovaní NK
  - `edgeDistance` (os: odhad z polyline + sečnicová metóda, ≤ 1e-10 m), `edgeBreaks`; 3D sa prepočíta aj pri zmene krivky. Test na 212-00: obrys v pôdoryse na krivkách ± 2 mm, 3D sieť zhodná s obrysom; lokálny test na osiach 125-00 (vnútorná konzistencia ≤ 1e-6 m).
- [x] čiary v pôdoryse: kreslenie, úprava vrcholov, editor, hladina `CIARY`
  - „Nakresliť čiaru“ (klik, dvojklik / Enter, Esc), ťahanie vrcholov vybranej čiary, tabuľka vrcholov v S-JTSK; ďalšie osi projektu sa zobrazia v pôdoryse a idú do exportu.
- [x] „Okraj podľa krivky“ v editore NK s grafom výsledných hodnôt
  - „Zadanie: okraj podľa krivky“ pri parametri NK: krivka, strana, prídavok [m]; graf z prierezov so zlomami krivky. Overené v prehliadači (212-00 s rozbiehavou osou okraja: šírka na km 9,335 31 = 17 353 mm podľa výpočtu).

**Hotové, keď:** NK s okrajmi podľa osí z Civil 3D sa v pôdoryse aj v 3D drží krivky (± 2 mm). — *2026-10-31:* overené na syntetickej osi okraja; `125_L` / `125_R` sú krátke oblúky napojenia (≈ 23 m), nie okraje popri moste — na reálny test treba os okraja vozovky popri moste.

#### 8b — Editor prierezu a knižnica
- [x] šablóny typológií VŠB: doska, vyľahčená doska, jednotrám, doskotrám, dvojtrám, komora, komora s nábehmi
  - `templates/catalog.ts` (ADR 0013); testy: bez chýb, šírka / výška podľa parametrov, plochy proti ručnému výpočtu. Rozmery sú predpoklad (Otvorené otázky).
- [x] knižnica prierezov: v projekte, import / export súboru; rozhranie pripravené na databázu (Cloudflare)
  - formát `bridge-modeler/profile-library` v1, `ProfileLibrary` (šablóny, projekt, súbor); dialóg „Knižnica prierezov“ v pohľade Prierez s náhľadmi, vložením, exportom vybraných a importom (projektový súbor odmietne zrozumiteľnou hláškou).
- [x] väzby bodov ako výrazy (relatívne, zvislo / vodorovne, sklon, priamka, priesečník, zrkadlo), bez numerického riešiča
  - `constraints.ts`: kanonické výrazy, rozpoznanie, ťahanie voľnej hodnoty (mm), väzba z aktuálnej polohy; v editore výber druhu a skorších bodov.
- [x] grafický editor v pohľade Prierez: body, obrysy, ťahanie, prichytávanie, prepojenie s tabuľkou
  - pri vybranom priereze: nástroje vybrať / ťahať, pridať bod, obrys (dutina / vonkajší), odstrániť; mriežka 10 mm a zarovnanie s bodmi; Shift + klik meria; zamknutý bod ukáže riadiace parametre; výber bodu zvýrazní riadok tabuľky. Overené v prehliadači vrátane späť / znova.

**Hotové, keď:** prierez sa dá vložiť z knižnice, upraviť ťahaním a väzbami so späť / znova a exportovať do knižnice.

#### 8c — OpenCascade (WASM)
- [x] prieskum knižníc (veľkosť, rýchlosť, licencia LGPL-2.1) → ADR na schválenie
  - ADR 0014 (schválené 2026-10-31): `occt-wasm` 5.11.0; na NK 212-00 loft 137 ms, objem zhodný so sieťou, rezy koncov 426 ms, STEP s menami 122 ms; 4,6 MB brotli.
- [x] `GeometryKernel` s booleovskými operáciami a exportom STEP; balík `packages/occt`
  - voliteľné `cut`, `union`, `subtract`, `volume` v rozhraní (MeshKernel ich nemá); `OcctGeometryKernel`: priamkový loft s dutinami, hranol zošitý zo stien (nerovinná stena → vejár trojuholníkov), tesselácia bez straty presnosti, STEP s menami.
- [x] presná scéna: konce NK orezané rovinou opory, opora zjednotená s krídlami, vrch piliera po podhľad NK
  - `exactScene`: objem NK zhodný so sieťou, konce v rovinách opôr ≤ 1e-6 m, od podpery sa odčíta NK, ak doň zasahuje; ložiská zvlášť. Most 212-00: 1,1 s.
- [x] 3D prepínač „Presný model“ a export STEP (deterministický)
  - vlastný worker, načíta sa len po zapnutí; pri chybe návrat na sieť. „Export STEP“ v S-JTSK alebo lokálne, v metroch (ADR 0014, doplnok k jednotkám), pevná hlavička. Oznámenie o licencii LGPL-2.1 v 3D. Overené v prehliadači a v produkčnom builde.

**Hotové, keď:** presný model sa zobrazí v 3D, objemy sedia so sieťou ± 0,5 % a STEP sa otvorí vo FreeCADe / Civil 3D. — *2026-10-31:* objemy a STEP overené testami (spätné načítanie, súradnice v S-JTSK v m); **otvorenie STEP vo FreeCADe / Civil 3D overí projektant**.

### Fáza 9 — Nasadenie na Cloudflare
Rozhodnutie 2026-10-31: jeden Cloudflare Worker so statickými súbormi aplikácie a API; v databáze (D1) len firemná
knižnica prierezov, projekty ostávajú ako súbory; prístup cez Cloudflare Access; nasadenie automaticky z GitHubu;
adresa `*.workers.dev` (ADR 0015).
- [x] `apps/worker`: statické súbory (jednostránková aplikácia) a API, `wrangler.jsonc`
  - API len pre `/api/*`, ostatné obslúži Cloudflare priamo; WASM ako `application/wasm`; náhľadové URL vypnuté. Overené lokálne cez `wrangler dev`.
- [x] D1: tabuľka knižnice prierezov, API (zoznam, uloženie s kontrolou verzie, odstránenie)
  - migrácia `0001_profile_library.sql`; `PUT` s `expectedVersion` (409 s autorom zmeny), `DELETE ?version=`; chyby JSON so slovenskou hláškou, chyba servera → 500. Testy nad `node:sqlite` so skutočnou migráciou.
- [x] overenie identity z Cloudflare Access (JWT) vo Workeri, `/api/me`
  - RS256 cez WebCrypto, kľúče tímu s cache, `aud` / vydavateľ / expirácia; bez nastavenia Access len localhost (`local@dev`), nasadený Worker inak vráti 401.
- [x] „Firemná knižnica“ v dialógu Knižnica prierezov (vložiť, uložiť z projektu, odstrániť, konflikt verzií)
  - zdroj sa zobrazí, ak `/api/me` odpovie; autor a čas zmeny pri položke; overené v prehliadači cez `wrangler dev` (uloženie, nová relácia, zmena kolegu → konflikt, odstránenie).
- [x] návod na nastavenie účtu (D1, napojenie GitHubu, Access) a nasadenie
  - `docs/nasadenie.md`. **Na projektantovi:** vytvoriť D1 a doplniť `database_id`, napojiť repozitár, zapnúť Access a doplniť `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`, pushnúť `main`.

**Hotové, keď:** push do main nasadí aplikáciu na `*.workers.dev`, otvorí sa až po prihlásení cez Access a dvaja
kolegovia vidia a upravujú tú istú knižnicu prierezov. — *2026-10-31:* pripravené a overené lokálne; nasadenie čaká na kroky v účte Cloudflare a push.

### Fáza 10 — Návrhový workflow mosta
Rozhodnutie 2026-10-31: UI má viesť prvotným návrhom mosta od trasy z LandXML (aj juniora) a slúžiť ako podklad
na ďalšie spracovanie, vizualizáciu pre investora a interné konzultácie kvality návrhu. Cieľový postup:
1 Zadanie (stavba, objekt, kategória cesty) → 2 Podklady (LandXML, terén, meračka DXF) → 3 Oblasť mosta →
4 Prekážky → 5 Prierez NK a rímsy → 6 Polia a podpery → 7 Kontroly → 8 Varianty → 9 Výstupy. Každá podfáza sa
pred začatím rozpracuje v plan mode; otázky a odpovede sú v Otvorených otázkach (Fáza 10). Každá zmena schémy =
nová verzia + migrácia + test (dnes v6). Poradie podfáz: 10a → 10g, 10i (rímsy), 10h.

#### 10a — Zadanie, postup a oblasť mosta
- [x] panel „Postup“ v ľavom stĺpci: kroky 1–9 so stavom (hotové / upozornenie / chýba) z projektu a issues, tlačidlá do správneho pohľadu, krátka nápoveda; nie vynútený sprievodca, strom prvkov ostáva pod ním
  - *2026-10-31:* **zrušené** (rozhodnutie projektanta) — nahrádza ho rozhranie v štýle CAD (10a2, ADR 0016).
  - `store/workflow.ts` (`workflowSteps`, test) a `layout/WorkflowPanel.tsx`; zatiaľ 6 krokov (Zadanie, Podklady, Oblasť mosta, Prierez NK, Polia a podpery, Výstupy) — Prekážky, Kontroly a Varianty pribudnú v 10f, 10g, 10h. Rozbalený krok má nápovedu a tlačidlá (import, stiahnutie DMR, vyznačenie oblasti, vloženie NK, pridanie podpery v pôdoryse, pohľady). Strom „Prvky projektu“ je zbaliteľný pod postupom.
- [x] krok „Zadanie“: stavba (názov, číslo), objekt (číslo a názov), kategória prevádzanej cesty → voľná šírka na moste (s ručnou úpravou pri rozšírení); návrh ďalších údajov v plan mode 10a; schéma v7
  - `brief` v projekte (schéma v7, migrácia 6 → 7): stavba, objekt, objednávateľ, zodpovedný projektant, vypracoval, druh mosta, prekážka, kategória, voľná šírka. Voľná šírka = ručná hodnota, inak b z označenia kategórie (`parseRoadCategory`, STN 73 6102; rozhodnutie 2026-10-31); v UI v mm s tlačidlom „Podľa kategórie“. Editor zadania vpravo (`layout/BriefPanel.tsx`) má aj názov projektu (súbor). Krok vyžaduje kategóriu cesty len pri cestnom moste alebo nezadanom druhu mosta.
- [x] oblasť mosta v projekte (`studyArea`: os, od, do; schéma v7), zadanie ťahom v pozdĺžnom profile alebo staničeniami; riadi rozsah novej NK (namiesto 25 % nivelety) a koridor terénu bez NK (namiesto celej osi)
  - nástroj „Oblasť mosta“ v profile (ťah, celé metre, Esc), šrafovaný pás s popismi, zvýraznený úsek osi v pôdoryse, panel od / do / dĺžka / zrušiť. Terén: `bridgeRanges` (NK → oblasť → celá os); bez NK a oblasti na osi dlhšej ako 2 km sa nesťahuje a postup otvorí krok Oblasť mosta. „Prispôsobiť“ priblíži na oblasť (inak NK), „Celá os“ ukáže celú os.
- [x] „Stiahnuť terén“ aj z pozdĺžneho profilu; „Prejsť na staničenie“ a priblíženie na oblasť v pôdoryse aj profile
  - „Prejsť na“ vycentruje profil aj pôdorys so zachovanou mierkou. Overené na reálnej službe ZBGIS: os 125-00, oblasť 200 m za 15 s; os SO 171-11-01 leží mimo pokrytia DMR 5.0 (typovaná hláška).
- [x] vloženie NK výberom typológie s náhľadmi (z knižnice prierezov) namiesto dvoch pevných tlačidiel
  - `layout/DeckInsertDialog.tsx`: šablóny, firemná knižnica a prierezy projektu (`useProfileSources`, spoločné s knižnicou), názov, od / do z oblasti, posun osi mosta; os, kópia prierezu a NK jedným krokom späť (`deckFromProfile`, test pre všetky šablóny). Príklad dvojice NK ostáva v dialógu.

**Hotové, keď:** junior otvorí trasu dlhú 12 km, vyznačí oblasť, stiahne terén a vloží NK bez prepisovania staničení. — *2026-10-31:* overené v prehliadači na osiach SO 171-11-01 (723 m) a 125-00 (557 m); **dlhú trasu (12 km) treba overiť** — v inboxe nie je (`Trasa LandXML.xml` alebo `R4_Lip-Stroc-Trasa.xml`).

#### 10a2 — Rozhranie v štýle CAD (ADR 0016)
Rozhodnutie 2026-10-31: UI ako projekčná aplikácia (Revit, AutoCAD); panel Postup sa ruší úplne.
- [x] ribbon ako v Revite: menu Súbor (nový, otvoriť, uložiť, export), karty Domov, Vložiť, Upraviť, Pohľad, Správa; panel rýchleho prístupu (uložiť, späť, znova); vlastné SVG ikony; pohľady bez vlastných líšt, stav nástrojov v `App.tsx`; odstránenie panela Postup
  - `layout/ribbon/` (Ribbon, AppMenu, TitleBar, `ribbonTabs`), `icons/Icon.tsx`; nástroje (`ViewTool`), Prispôsobiť / Celá os (`FitRequest`), prevýšenie a 3D prepínače v App; Esc ruší nástroj, stavový riadok ukazuje výzvu nástroja. Export DXF / SVG / STEP v menu Súbor (STEP po výpočte presného modelu v 3D). Priečny rez, 3D a editor prierezu majú spodný pruh (staničenie, stav). Ribbon sa zbalí dvojklikom na kartu.
- [x] prehliadač projektu: pohľady, model hierarchicky (os cesty → os mosta → NK → podpery, oblasť mosta), podklady, prierezy, parametre; ikony, zbalenie, kontextové menu, dvojklik priblíži
  - `store/browserTree.ts` (`browserTree`, test), `layout/ProjectBrowser.tsx`; NK s prierezom a poliami v popise, podpery podľa staničenia, Nepriradené pre prvky bez nadradeného; F2 / Delete, kontextové menu (priblížiť, premenovať, duplikovať, odstrániť); zbalenie sa pamätá v prehliadači.
- [x] vlastnosti ako mriežka v Revite (výber typu, skupiny Názov | Hodnota, dialógy „…“); bez výberu vlastnosti aktívneho pohľadu; os cesty, oblasť mosta, terén, čiara, os mosta; dialóg Informácie o projekte (zadanie)
  - `layout/properties/` (PropertyGrid, Dialog, `simpleSheets`, test); Esc bez nástroja zruší výber.
- [x] vlastnosti podpery a NK v mriežke (priebehy a ložiská v dialógoch)
  - `elementSheets` (`supportSheet`, `deckSheet`, test): typ podpery / prierez NK ako výber typu, opora po častiach, ložiská s vypočítanými výškami v dialógu, parametre prierezu so súhrnom priebehu a dialógom s grafom.
- [x] vlastnosti prierezu, dialóg bodov a obrysov, nástroje editora prierezu v kontextovej karte
  - `profileSheet` (test), `ProfileTablesDialog` (tabuľky z bývalého `ElementPanel`); nástroje a druh obrysu v App, prvé Esc ukončí nástroj, druhé zruší výber.
- [x] kontextová karta „Upraviť | typ“, Duplikovať a Premenovať
  - `contextualTab` podľa druhu (NK: podpera, prierez, rez; podpera: rez; čiara: vrcholy; terén: stiahnuť znova; os mosta: posuny); `store/duplicate.ts` (test): podpera s ďalším číslom posunutá o 5 m, NK s kópiou osi mosta, čiara posunutá o 5 m; Premenovať začne premenovanie v prehliadači.
  - *Ostáva:* panel parametra v pohľade Parametre ostal formulár (tabuľka parametrov je pohľad); ikony sú jednoduché a dajú sa vylepšiť podľa firemných zvyklostí.

**Hotové, keď:** všetky doterajšie funkcie sú dostupné z ribbonu, prehliadača a vlastností, pohľady nemajú vlastné lišty a úprava podpery aj NK v mriežke má späť / znova. — *2026-10-31:* overené v prehliadači (Chrome bez okna) na SO 171-11-01 a 125-00, svetlá aj tmavá téma.

#### 10b — Os mosta: dĺžky, profil v ľubovoľnej osi, merania, kóty
Rozhodnutie 2026-11-01: dĺžky po osi mosta sa merajú vodorovne (priemet do pôdorysu); „Merať“ v profile aj v pôdoryse.
- [x] prevod `s` osi cesty ↔ dĺžka po osi mosta (integrál √((1 − κh)² + h′²), κ > 0 oblúk doprava, Gauss–Legendre), test-first: priamka, oblúk L = Δs·(1 ∓ h/R), premenný posun, konzistencia ≤ 1e-6 m
  - `packages/sections/src/axisLength.ts` (`bridgeAxisLength`: tabuľka po ≤ 5 m, Newton s bisekciou pre spätný prevod, posun mimo rozsahu priebehu = krajná hodnota); 12 km os ≈ 25 ms. Posun bez odkazov na globálne parametre ich nevyhodnocuje (`lawReferences`).
- [x] rozpätia, dĺžka NK, dĺžka premostenia (líca úložných prahov v osi mosta) a celková dĺžka po osi mosta; len vzdialenosti po osi (kolmé a šikmé rieši až výkres, rozhodnutie 2026-10-31); fixtúra 212-00: predsadenie 0,90 a dĺžka prahu 2,05 sú na výkrese v osi mosta → × sin α
  - `bridgeLengths` (NK, premostenie z priesečníka prednej líce prahu s osou mosta, celková = NK + presahy opôr po dotyčnici, v osi okolo stredu strán), `evaluateSpans` s prevodom `measure`; vlastnosti NK majú aj dĺžku premostenia. Testy: 212-00 a os posunutá o 7 m dovnútra oblúka R 300.
- [x] pozdĺžny profil v zvolenej osi: os cesty / os mosta / okraj NK / iná os z LandXML / čiara v pôdoryse (neskôr os prekážky); pri osi mosta x = rozvinutá dĺžka, popis v km osi cesty; rez NK z parametrov (priesečník čiary s rovinou prierezu vo vzorkách NK → zvislica v odsadení, šikmé konce), export pozdĺžneho rezu v aktívnej osi, doplnok ADR 0007
  - `ProfileLine` (`packages/sections/src/profileLine.ts`), `deckCutAlong`, `profileCuts` / `profileTicks` / `profileGrade` v `packages/drawing`; „Os profilu“ v ribbone (Pohľad) a vo vlastnostiach pohľadu, kontextová karta NK „Profil v osi mosta“ a čiary „Profil v čiare“, čiara profilu zvýraznená v pôdoryse, kurzor z profilu sa v pôdoryse ukáže na čiare profilu. Predvolená os = os mosta vybranej NK.
- [x] terén rezaný na ľavom a pravom okraji NK premietnutý do profilu v osi mosta inými farbami (vidno priečny sklon terénu)
  - `profileEdgeLines` (okraje z obrysu NK, za koncami +30 m rovnobežne), prekrytie s legendou (len na obrazovke), prepínač „Terén na okrajoch“ v ribbone a vo vlastnostiach pohľadu. Overené na 125-00 s povrchom z LandXML.
- [x] odčítanie pod kurzorom v profile: niveleta, horný povrch a spodok NK, terén (v osi aj na okrajoch), výška spodku NK nad terénom
  - `profileReadout` (pri viacerých povrchoch najvyšší terén), značky v profile a čiarkovaná výška spodku NK nad terénom; stavový riadok má odčítanie vľavo a hlásenia vpravo.
- [x] nástroj „Merať“: v profile Δ dĺžka, Δ výška, sklon (skutočné hodnoty pri prevýšení), v pôdoryse vzdialenosť, ΔE, ΔN, smerník; prichytávanie na vrcholy, Shift bez prichytávania; dočasné
  - Upraviť → Merať (`views/measure.ts`, test); smer v pôdoryse ako azimut od severu v smere hodinových ručičiek (predpoklad, viď Otvorené otázky).
- [x] zapínateľné kóty len na obrazovke (rozpätia, dĺžka NK, premostenie, celková, neskôr voľná výška) v profile a pôdoryse, rozloženie ako na výkrese 212-00; do DXF nejdú (ADR 0012 platí)
  - `bridgeDimensions` (test na 212-00), `views/Dimensions.tsx`; v profile nad NK rozpätia, dĺžka NK a celková, pod NK premostenie (v osi cesty a osi mosta); v pôdoryse reťazce rovnobežné s osou mosta na vonkajšej strane. Prepínač „Kóty“ (Pohľad, vlastnosti pohľadu), predvolene zapnuté.
  - *Ostáva:* čiastkové kóty presahu opory (krídlo 4,00 · múrik 0,84 · medzera 0,08) sú zatiaľ jedna hodnota 4,92 — rozdelia sa s novou parametrizáciou opory v 10d; pri malom priblížení sa texty krátkych úsekov prekrývajú.

**Hotové, keď:** na 212-00 kóty ukazujú 16,00 + 23,00 + 16,00, NK 56,00, premostenie 53,20 a celkovú dĺžku 65,84 a na posunutej osi v oblúku sedia rozpätia s dĺžkou po osi mosta (test). — *2026-11-01:* overené testami (`bridgeLengths`, `bridgeDimensions`) aj v prehliadači (Chrome bez okna) na 212-00, 125-00 a SO 171-11-01.

#### 10c — Polia v pozdĺžnom profile
- [ ] osi uloženia (odpoveď 21, 2026-11-01): projektant najprv rozmiestni osi uloženia (rozpätia, šikmosť) a až potom na ne vloží podperu alebo oporu — upresniť v plan mode 10c (samostatný prvok alebo vlastnosť NK, väzba podpery na os uloženia)
- [ ] pridanie podpery klikom aj v pozdĺžnom profile
- [ ] ťahanie podpier v profile (aj v pôdoryse pozdĺž osi) s prichytávaním dĺžky poľa po osi mosta po 0,5 m (nie km), Shift = bez prichytávania, živé kóty, jeden krok späť; staničenie v editore podpery ostáva ľubovoľné
- [ ] úprava rozpätia kliknutím na kótu a zadaním hodnoty: zmení sa len upravené pole a všetky podpery za ním (na strane od vybranej podpery) sa posunú, celková dĺžka mosta sa zmení (rozhodnutie 2026-10-31)
- [ ] „Rozloženie polí“: „16 + 23 + 16“ / „3×20“, ukotvenie od začiatku / od konca / symetricky okolo km (predvolene kríženie s prekážkou), spoločný uhol kríženia, typ piliera a opory z knižnice; nahradí podpery NK jedným krokom späť
- [ ] spoločná šikmosť: v editore NK „použiť uhol na všetky podpery“

**Hotové, keď:** most 212-00 vznikne z „16 + 23 + 16“ a šikmosti jedným dialógom a ťahanie piliera mení rozpätia v kroku prichytávania.

#### 10d — Opora a koniec NK
- [ ] workshop s projektantom: náčrt rezu opory v osi mosta s pomenovanými rozmermi (predsadenie prahu pred os uloženia, odsadenie konca NK od osi uloženia, medzera NK – múrik, odsadenie NK od prahu = priestor pre ložiská, šírka a výška prahu, hrúbka múrika, krídla, typ opory) → doplnok ADR 0010 alebo nové ADR
- [ ] nová parametrizácia opory v schéme + migrácia; typy opôr vrátane rámovej a integrovanej konštrukcie (bez ložísk)
- [ ] koniec NK odvodený od opory (os uloženia ± odsadenie konca NK), NK sa natiahne a posúva s oporou; väzba sa dá odomknúť (ručné od/do)
- [ ] rozmery opory v pozdĺžnom smere (predsadenie prahu, dĺžka prahu, odsadenie konca NK, medzera, hrúbka múrika) sa zadávajú v osi mosta ako kóty na výkrese (rozhodnutie 2026-11-01); migrácia z merania kolmo na os opory (ADR 0010)
- [ ] NK pripravená na zmenu prierezu okolo osi uloženia, napr. priečnik (odpoveď 21, 2026-11-01) — tvar a parametre upresniť v plan mode 10d
- [ ] nápoveda s náčrtom (SVG schéma s kótami) pri parametroch opory; rovnaký mechanizmus neskôr pre pilier a prierez

**Hotové, keď:** 212-00 dá z parametrov opory NK 56,00, premostenie 53,20 a celkovú dĺžku 65,84 (test) a posun opory posunie koniec NK.

#### 10e — Podpery: založenie podľa terénu, firemná knižnica
- [ ] režimy založenia: podľa terénu (predvolený pre piliere; horná hrana základu = terén v osi podpery − krytie 0,5 m) / výška podpery / kóta základovej škáry; pri oporách volí režim projektant (plošné alebo hlbinné založenie); terén do `evaluateSupport` ako čistá funkcia, bez terénu dnešné pravidlo s upozornením; migrácia `foundationTop` → kóta
- [ ] upozornenie, keď je základ nad terénom
- [ ] predvolené ložiská odvodené od prierezu NK: v 1/4 šírky spodnej plochy od okraja (spodok 4 m → 1 m od okraja, ložiská 2 m od seba; odpoveď 20, 2026-11-01); viac trámov a komora upresniť v plan mode 10e
- [ ] firemná knižnica podpier: pomenované typy (geometria, základ, ložiská, uloženie) s náhľadom; šablóny, projekt, súbor, D1 (formát `bridge-modeler/support-library` v1, doplnok ADR 0008 a 0015)
- [ ] šablóny: stenový pilier, jeden stĺp, dva stĺpy, opora na pilótach (212-00), masívna opora — rozmery potvrdí projektant

**Hotové, keď:** nový pilier stojí základom v teréne, zmena režimu prepočíta výšku a typ z firemnej knižnice sa vloží jedným klikom.

#### 10f — Prekážky a meračka
- [ ] prekážka (spoločný podklad): typ (cesta, železnica, vodný tok, poľná cesta, chodník, iná), referencia (os z LandXML / čiara v pôdoryse / čiara z meračky), výška (niveleta / Z čiary / konštanta, napr. Q100), voľný prierez s predvoľbou podľa typu; nové ADR
- [ ] kríženie osi mosta s prekážkou → km a uhol kríženia (konvencia `crossingAngle`); ukotvenie a šikmosť pre 10c
- [ ] kríženie zadané aj ručne na trase (km): v pozdĺžnom profile šrafovaná čiara s označením staničenia a popisom prekážky; vloženie prechodového (voľného) prierezu cesty (nastaviteľná šírka a výška) alebo priechodného prierezu železnice — predpisy naštudovať na začiatku 10f, hodnoty potvrdí projektant
- [ ] voľný prierez v profile v osi mosta (šírka / sin α), v priečnom reze, v 3D a v profile v osi prekážky; vodný tok = kóta hladiny Q100 + rezerva a brehové čiary (bez prietokovej plochy)
- [ ] kontroly `ClearanceViolated` (s hodnotou), `SupportInClearance`; kóta minimálnej voľnej výšky
- [ ] podklad mapy (ortofoto, mapa ZBGIS) aj v pôdoryse, ako v 3D (odpoveď 23, 2026-11-01)
- [ ] import meračky DXF (len 2D podklad, bez TIN — odpoveď 23): vlastná čítačka (`POINT`, `TEXT`, `LINE`, `LWPOLYLINE`, `POLYLINE`, `INSERT` len poloha), výšky bodov z textov na zvolených hladinách (viď Zistené z podkladov), výber hladín, orezanie na oblasť mosta, uloženie do projektu na mm (vzor ADR 0011); zobrazenie v pôdoryse, 3D a v rezoch; nové ADR a balík `packages/survey` (doplniť do CLAUDE.md)

**Hotové, keď:** vetva z LandXML ako prekážka „cesta“ dá km a uhol kríženia, voľný prierez sa ukáže vo všetkých pohľadoch, znížená niveleta vyvolá `ClearanceViolated` a čiara z DXF meračky sa dá použiť ako prekážka.

#### 10g — Kontroly
- [ ] panel „Kontroly“: issues zoskupené (geometria, rozpätia, štíhlosť, voľná výška a podpery v prekážke, klopenie, založenie) s odkazom na prvok
- [ ] štíhlosť h/L: tabuľka orientačných hodnôt podľa typológie (len upozornenie; TODO statik v Otvorených otázkach)
- [ ] parser `Superelevation` z LandXML (typované problémy) a kontrola parametra `q` v rozsahu NK: NK v nábehu klopenia, plné klopenie ≠ `q` (tolerancia 0,1 %) → upozornenie; ak LandXML klopenie neobsahuje, kontrola sa nezobrazuje
- [ ] pomer krajného a vnútorného poľa mimo 0,7 – 0,8 → upozornenie (nie chyba)

**Hotové, keď:** všetky kontroly sú na jednom mieste a interpretáciu klopenia overí golden test na podklade s výkazom klopenia.

#### 10i — Rímsy (pred 10h)
- [ ] rímsa (`edgeBeam`) ako samostatný prvok na okraji NK (rozhodnutie 2026-10-30): parametrický prierez z knižnice (šírka, výška, sklon 4 % k vozovke), vedená po okraji NK v rozsahu NK; schéma + ADR
- [ ] zobrazenie v priečnom reze, pôdoryse, pozdĺžnom reze a 3D; export DXF (hladina `RIMSY`) a STEP
- [ ] voľná šírka na moste medzi rímsami a kontrola voči zadaniu (kategória cesty, krok 1)
- [ ] parameter prierezu NK naviazaný na voľnú šírku zo zadania (vstavané meno vo výrazoch, napr. `freeWidth`; odpoveď 22, 2026-11-01)

**Hotové, keď:** dvojica NK z rezu E–E má rímsy podľa výkresu (`Dvojica NK.png`) a voľná šírka medzi rímsami sedí s kótami (test).

#### 10h — Varianty a ukazovatele
- [ ] varianty v jednom projekte: `variants` + `activeVariant`; prvky mosta (os mosta, prierezy, NK, rímsy, podpery) nesú `variant`, podklady (osi, terén, meračka, prekážky, čiary, oblasť mosta) sú spoločné; globálne parametre spoločné s možnosťou prepísať hodnotu vo variante; migrácia → „Variant A“; nové ADR
- [ ] duplikovať / premenovať / odstrániť variant (nové id s prepisom odkazov, jeden krok späť)
- [ ] ukazovatele (čistá funkcia, každý s vysvetlivkou v UI): dispozícia (polia, piliere, opory, rozpätia, dĺžky, šírka, min. uhol kríženia), plocha mosta a pôdorysná plocha NK, objem NK (∫A·dL), objem spodnej stavby, ekvivalentná hrúbka NK, výšky pilierov, podpery v prekážke, počet ložísk a mostných závesov, voľná výška a rezerva, max. pole / ekonomické, štíhlosť, pomer krajné / vnútorné pole
- [ ] plocha mosta = pôdorysná plocha vrátane ríms (pri konštantnej šírke = dĺžka premostenia × šírka vrátane ríms)
- [ ] orientačná cena: €/m² plochy mosta podľa typológie, zatiaľ zástupné hodnoty zreteľne označené (skutočné dodá projektant)
- [ ] porovnanie variantov: tabuľka so zvýraznenou najlepšou hodnotou, pozdĺžne profily variantov pod sebou v rovnakej mierke; voliteľne CSV

**Hotové, keď:** dva varianty 212-00 (3 polia jednotrám / 1 pole komora) sa porovnajú v tabuľke a objem NK sedí s ručným výpočtom (A·L pri konštantnom priereze) a so sieťou ± 0,5 %.

### Backlog
- IfcSectionedSolidHorizontal a IfcLinearPlacement (s Fázou 7)
- zakrivené a zalomené podpery, import okraja NK z DXF
- výmery (objemy betónu, plochy) a export pre KUBATOR
- projekty v cloude (R2), vlastná doména

## 5. Referenčné dáta (dodá Jakub)

1. LandXML z Civil 3D: os s klotoidami, niveleta s výškovými oblúkmi, ideálne aj skok v staničení.
2. Kontrolné body k tej istej osi z Civil 3D (CSV): staničenie, Y, X, Z, smerník; aspoň 20 bodov vrátane stykov prvkov.
3. Výkres priečneho rezu dvojice NK (28 900 mm) a ukážky pozdĺžneho rezu a pôdorysu z reálneho projektu.
4. Firemný štandard hladín, typov čiar a farieb pre DXF.
5. Malý referenčný most (2–3 polia) s dĺžkami polí a šikmosťami na end-to-end test. — *dodané 2026-10-31:* most 212-00 (`Vzorový most.pdf`), test `packages/mesh/src/reference212.test.ts` na syntetickej osi.
6. Povrch terénu z Civil 3D (LandXML `Surface`) v okolí toho istého mosta a pozdĺžny profil terénu po osi (výkaz) na golden test.
7. Vzorka meračky existujúceho stavu v DXF (Fáza 10f) — *dodané 2026-10-31:* `Meracka skutocneho stavu.dxf` (rozbor v Zistené z podkladov).
8. Výkres alebo výkaz klopenia k osi, ktorej LandXML obsahuje `Superelevation` (125-00 alebo 101-00; `Trasa LandXML.xml` v inboxe chýba) — Fáza 10g.
9. Hodnoty voľných prierezov podľa typu prekážky alebo odkaz na normu (Fáza 10f).
10. Potvrdené hodnoty štíhlosti NK od statika (Fáza 10g) a rozmery firemných typov podpier (Fáza 10e).

## 6. Sledované riziká

| Riziko | Opatrenie |
|---|---|
| presnosť súradníc S-JTSK vo WebGL | lokálny počiatok od fázy 1, výpočty v double |
| dialekty LandXML, typy prechodníc | typované chyby, golden testy proti Civil 3D |
| orientácia prierezu, šikmé podpery | testy zhody 2D prierezu a 3D siete |
| veľké DMR (milióny trojuholníkov) v prehliadači | orezanie na koridor, priestorový index, výpočet vo Web Workeri |
| podpora IFC 4.3 v cieľových aplikáciách | tesselovaná geometria, testy importu |
| rozrastanie rozsahu | nič mimo MVP bez zápisu do tohto plánu |

## 7. Otvorené otázky

- Služba ZBGIS `LLS_DMR5` nie je zmluvne garantovaná (firewall, limity); pri výpadku ostáva import súboru. Body mimo pokrytia LLS sa neposielajú a ostanú bez terénu.
- Terén (Fáza 5b) čaká na podklady: LandXML povrchu z Civil 3D, výkaz pozdĺžneho profilu terénu po osi a vzorka DMR 5.0 (GeoTIFF). Dovtedy sú golden testy `it.todo` a import je overený len na syntetických súboroch. *Predpoklady:* GeoTIFF má výšky v prvom kanáli v m Bpv; `PixelIsArea` (pôvod v rohu bunky), ak súbor neuvádza inak.
- `CircCurve` (kružnicový výškový oblúk): znamená atribút `length` dĺžku oblúka, alebo jeho vodorovný priemet? *Predpoklad:* oblúk sa počíta presne z polomeru a sklonov tangent, `length` sa ignoruje. Overiť na podklade s kružnicovým výškovým oblúkom.
- Staničenia PVI pri osi so skokmi v staničení: *predpoklad:* LandXML ich uvádza v spojitom (internom) staničení `staStart + s`. Overiť na podklade so skokom.
- Sklon stien trámu a vodorovná dĺžka nábehu nie sú na výkrese okótované. *Predpoklad:* steny 5 : 1 (zvislo : vodorovne), výška steny `hW` = 300 mm, vodorovná dĺžka nábehu `bN` = 1 450 mm, nábeh priamkový; sú to parametre šablóny, ktoré projektant upraví.
- Os mosta pri dvojici NK: vodorovné posuny −7,75 m / +7,00 m sú odvodené z výkresu za predpokladu, že os R2 (os cesty) leží v strede medzi NK. Ak je os cesty v LandXML inde (napr. na okraji vozovky), posuny treba upraviť.
- Podpera v oblúku: os podpery a staničenia ložísk sa počítajú od dotyčnice osi mosta v mieste podpery (`s₀ − x·cot α`). Pri malých polomeroch a veľkej šikmosti môže byť treba presnejšie riešenie — overiť na reálnom moste.
- Predvolené rozmery novej podpery (stena 1,2 × 4 m, ložiská ±1,8 m, výška uloženia 0,35 m, základ 8 m pod NK pri pilieri a 5 m pri opore) sú len východisko — chceš firemné predvolené hodnoty?
- Opora (ADR 0010), *predpoklady:* bočné líca opory sú rovnobežné s osou mosta a prechádzajú koncami opory na osi ložísk (`length` sa meria pozdĺž osi podpery); krídla začínajú na zadnej líci opory (ďalej od poľa z prahu a múrika); predná líca drieku = predná líca prahu; základ opory leží pod stredom prahu. Pri krídle s uhlom ≠ 0 je bočná líca opory stále rovnobežná s osou mosta.
- Referenčný most 212-00: test používa šikmosť 68,71 g pre všetky podpery (výkres má 68,40 – 68,94 g), preto kolmé rozpätia sedia na ± 2 cm; prierez je šablóna jednotrámu (šírka 16,50 m, h = 1,20 m), výšky sa overujú len v osi podpery (horná hrana prahu opôr ± 5 mm). Os I/68 je syntetická priamka −0,64 %; ak bude LandXML osi, test sa doplní o polohu.
- Rez v 3D vyplní len prierezy NK; prerezané podpery sú zobrazené otvorené (bez výplne). Výplň podpier sa doplní s výkresmi (Fáza 6), ak bude treba.
- Hladiny DXF (ADR 0012) sú predpoklad, kým nebude firemný štandard: `OS_CESTY`, `OS_MOSTA`, `OS_PODPERY`, `STANICENIE`, `NK`, `NK_DUTINY`, `PODPERY`, `ZAKLADY`, `LOZISKA`, `TEREN`, `NIVELETA`, `POPIS` (farby ACI, typy čiar CONTINUOUS / DASHED / CENTER). Výška textu 2,5 mm v mierke 1 : 200 (pôdorys, pozdĺžny rez) a 1 : 100 (priečny rez). Pošli štandard alebo iné názvy, ak treba.
- Pozdĺžny rez sa exportuje 1 : 1 a reže sa len v osi mosta (bez pohľadu na časti za rezom, napr. krídla). Ak treba prevýšenie alebo pohľad, doplní sa.
- Okraj NK podľa krivky (Fáza 8a), *predpoklady:* vzdialenosť sa meria vodorovne kolmo na os mosta (v rovine prierezu) a okraj sa hľadá najviac 50 m od osi (bližší priesečník na danej strane); prídavok sa zadáva výrazom v m ako ostatné výrazy. Podklad: v `125-00_C3D.xml` sú `125_L` / `125_R` krátke oblúky napojenia pri km 0,004 – 0,020 — pre skutočný test treba os okraja vozovky popri moste.
- Šablóny prierezov (Fáza 8b, ADR 0013), *predpoklady:* tvary podľa schém VŠB bez kót, spodok rovnobežný s vrchom, priečny sklon 2,5 %. Predvolené rozmery [m]: doska h 1,0 / spodok 7,0 / koniec 0,30; vyľahčená doska h 1,2 / spodok 9,0 / 6 dutín ⌀ 0,8 po 1,3; doskotrám h 1,2 / doska 0,30 / 2 rebrá 2,4 po 5,6; jednotrám h 2,0 / spodok trámu 4,0 / steny 5 : 1 / konzola 0,25 → 0,45; dvojtrám h 2,5 / trámy 1,1 → 0,8 po 6,0 / doska 0,30; komora h 3,5 / 7,0 hore / 5,0 dole / steny 0,45 / dosky 0,28 a 0,25; komora s nábehmi h 4,0 / nábehy 1,2 × 0,3 hore a 0,6 × 0,2 dole. Šírky NK 12 – 14 m. Opravte podľa firemných zvyklostí.
- Premenovanie globálneho parametra dnes prepíše odkazy len v ostatných globálnych parametroch, nie v priebehoch NK, posunoch osi mosta, predvolených hodnotách profilu ani v podperách (zistené 2026-10-31). Doplniť?
- Golden testy a CI: podklady sa neverzujú, takže CI k nim nemá prístup. *Predpoklad:* testy proti reálnym podkladom bežia len lokálne (ak dáta chýbajú, preskočia sa) a CI overuje syntetické osi so známou geometriou.
- Fáza 10b, *predpoklady:* (1) smer v nástroji Merať je azimut od severu v smere hodinových ručičiek, nie geodetický smerník S-JTSK — treba smerník? (2) okraj NK pre profil a terén na okrajoch = krajný bod prierezu NK; po pridaní ríms (10i) sa môže brať vonkajší okraj rímsy. (3) odčítanie terénu pri viacerých povrchoch berie najvyšší. (4) čiara v pôdoryse a okraj NK sa v profile popisujú km osi cesty v päte kolmice.
- **TODO (statik): štíhlosť NK** pre kontrolu vo Fáze 10g. Kým nebudú potvrdené hodnoty, platia orientačné
  (*predpoklad:* spojité predpäté NK, h = výška v osi, len upozornenie): doska L/25 – L/30; vyľahčená doska
  L/22 – L/28; doskotrám, jednotrám, dvojtrám L/15 – L/20; jednotrám s nábehmi v poli L/20 – L/25; komora
  L/18 – L/25; komora s nábehmi nad podperou L/16 – L/20, v poli L/30 – L/50.

### Otázky k Fáze 10 (2026-10-31)

Stačí zodpovedať pred začatím danej podfázy; *predpoklad* platí, kým nepríde odpoveď.

Pred 10b / 10c:
1. Zmena jedného rozpätia (ťahaním alebo zadaním): *predpoklad:* posunú sa všetky nasledujúce podpery (zmení sa celková dĺžka), so Shift sa zachová celková dĺžka a zmení susedné pole. Alebo naopak?
*odpoveď* ak vyberiem podperu a zmením rozpätie, tak sa zmení len to, ktoré som prepísal a na tú stranu sa všetky ostatné podpery presunú, čiže sa zmení celková dĺžka mosta.
2. Krok prichytávania rozpätí: *predpoklad* 0,5 m (ponuka 0,1 / 0,25 / 0,5 / 1,0).
*odpoveď* súhlasím, ale v staničení si bude môcť člvoek zmeniť ľubovoľne.
3. Plocha mosta: vzor z praxe (STN 73 6200 čl. 60 a 61, napr. 39,75 × 14,0 = 556,5 m²) = dĺžka premostenia × šírka mosta. Ktorá šírka (celková šírka NK vrátane ríms, alebo medzi zábradliami)? Pri premenlivej šírke priemer, alebo plocha z pôdorysu?
*odpoveď* šírka vrátene ríms, čo vlastne aj doplňa to že je potrebné pridať ešte nástroj ktorý bude modelovať na NK rímsy. Pri pemenlivej šírke by to bola pôdorysná plocha.
4. Dĺžka premostenia = vzdialenosť líc úložných prahov v osi mosta (212-00: 56,00 − 2 × (0,50 + 0,90) = 53,20), kolmá = × sin α (⊥46,85)?
*odpoveď* merať len vzdialosť po osi. kolmú a šikmá vzdialensoť sa rieši až potom vo výkrese.
5. Merania v profile uložiť do projektu (na konzultácie), alebo stačia dočasné? *Predpoklad:* dočasné.
*odpoveď* dočasné.
6. Pozdĺžny profil v ďalších osiach: ktoré sú najdôležitejšie (os prekážky, okraj NK, ľubovoľná čiara)?
*odpoveď* okraj NK napríklad je odbrý príkald kvli prmenlivosti terénu, dobrá by bola možnosť aj teren rezaný na okrajoch mosta premiesť do pozdlžného profilu v osi mosta, inými farbami napr. aby bolo vidno ak osa mení terén.

Pred 10d / 10e:
7. Opora: čo znamená „odsadenie od NK“, bočný presah opory za okraj NK, alebo niečo pozdĺžne? Modelovať prechodovú dosku (len vizuálne)? Iné typy opôr okrem plytkej na pilótach, masívnej a integrovanej?
*odpoveď* odsadeni od NK myslím vzdielensoť medzi úložním prahom a spodnou hranou nosnej konštrukcie, čiže pristor pre ložiská. Mohlo by byť potom celkovo nejaká konštrukcia rámu, alebo integrovoného mostu.
8. Koniec NK odvodiť automaticky od opory (*predpoklad*), alebo nechať zadaný ručne s upozornením na nesúlad?
*odpoveď* koniec NK odvoiť od opory, z možnosťou odomknúť. Ale fungovalo by to tak že má mvloženú oporu a nastavím jej predsadenie pred uloženie a potom odsadenie od uloženia + medzera medzi NK a oporou, pdoľa toho sa aj nosná konštrukcia natiahne, čiže ka budem potom posúvať oporu, nosná konštrukcia sa bude posúvať s ňou.
9. Krytie základu pod terénom: *predpoklad* 1,0 m, aj pre opory. Pri vodnom toku pod dno + rezerva?
*odpoveď* stáčí 0,5 m, väčšina podpier je veľká, pri oporách by som to nechal na uživateľovli, záleži, čo je zlaožená plošne alebo hlbine.
10. Ložiská predvolene odvodiť od prierezu (napr. pod stenami trámu), alebo stačí typ podpery z knižnice?
*odpoveď* odvodiť od prierezu, nejakú 1,4 od kraja, celé číslo.

Pred 10f:
11. Ukazovatele (10h): sedí zoznam? Treba aj orientačnú cenu (€/m² podľa typológie)? Kto dodá jednotkové ceny?
*odpoveď* vytvor zatiaľ s nejakými placeholdrami, skutočné ceny hodnoty doriešim neskôr.
12. Voľné prierezy: hodnoty predvolieb (diaľnica a rýchlostná cesta, cesty I. – III. triedy, miestna, poľná cesta, chodník, železnica elektrifikovaná a neelektrifikovaná, vodný tok Q100 + rezerva) alebo odkaz na normu. Hodnoty sa nehádajú; dovtedy sa zadávajú ručne.
*odpoveď* súhlasím, taktiež by som pridal možnosť si určite na trase kríženie a následne v rámci pozlžného profilu vložiť napríkald prehcodový prierez cesty (nastaviteľná šírka a výška) alebo prechodový prierez pre železnicu. Skús si naštudovať predpisy. Taktiež by sa vložila. čiakrovaná čiara z označením staničenia a možnosoťu popsíať o akú prekážku sa jedná.
13. Vodný tok: stačí kóta hladiny Q100 + rezerva a brehové čiary z meračky, alebo treba aj prietokovú plochu pod mostom?
*odpoveď* stačí
14. Meračka DXF: ako geodet zapisuje výšky (3D polyline, bod s textom kóty, blok s atribútom)? Sú súradnice záporné S-JTSK? Robiť z bodov meračky aj terén (TIN), alebo stačí DMR / povrch z Civil 3D?
*odpoveď* sú v mínusových hodnotách do podkladov ti hodín nejaký príklad meračky, môžeš si našťudovať.

Pred 10g / 10h:
15. Ďalšie limity v kontrolách: max. výška piliera, min. uhol kríženia, pomer krajné / vnútorné pole (orientačne 0,75 – 0,8)?
*odpoveď* pomer krajrné vnútorné pole 0,7-0,8, súhalsím, upozorniť nie trvať.
16. Varianty: globálne parametre spoločné pre všetky varianty (*predpoklad*), alebo vlastné?
*odpoveď* mať možnosť aj aj
17. Klopenie: `Superelevation` v `125-00_C3D.xml` je neúplné (rozsahy nesedia so staničeniami vnútri) — interpretácia sa overí na výkaze klopenia (Referenčné dáta, bod 8).
*odpoveď* ak sú zadené v LandXML tak konfrontovať, pokiaľ nie, tka neukazovať

Celkovo:
18. Sedí poradie krokov postupu 1–8? Chýba krok „Zadanie“ (stavba, objekt, kategória cesty), ktorý by predvyplnil predvoľby (šírky, voľné prierezy)?
*odpoveď* Môže byť ešte prvý krok, kdey uživateľ zadá názov stavby, číslo a názov objektu, vyebrie kategóriu cesty, ktorá bdefinuje potom voľnú šírku na moste (+ ručnú úprava v príprade rošírenia a podobne). Ak ťa napadnú ešte nejaké údaje, skús navrhnúť.
19. Sedí poradie podfáz 10a → 10h? Prekážky (10f bez DXF) sa dajú posunúť hneď za 10b.
*odpoveď* sedí

Nové otázky (2026-10-31, z odpovedí vyššie):
20. Ložiská z prierezu „≈ 1,4 m od kraja, celé číslo“: meria sa 1,4 m od okraja spodnej plochy prierezu (spodku trámu, komory)? Čo sa zaokrúhľuje na celé číslo: počet ložísk, alebo poloha (napr. na celé dm)? — pred 10e 
*odpoveď* 1/4, čiže napr, ak spodná hrana má 4 metre, tak ložiská budú 1 meter od okraja a 1 meter od osi mosta, čiže 2 metra od seba
21. Opora: „predsadenie pred uloženie“ = predná líca prahu pred osou uloženia (212-00: 0,90) a „odsadenie od uloženia“ = koniec NK za osou uloženia (212-00: 0,50)? — potvrdí sa na workshope 10d
*rozhodnutie 2026-11-01 (plan mode 10b):* rozmery opory v pozdĺžnom smere sa po prerobení v 10d zadávajú v osi mosta, ako kóty na výkrese (dnes kolmo na os opory, ADR 0010).
*odpoveď* presne tak - taktiež nech je nosná konštrukcia pripravená na zmenu prierezu, napr. pre vytvorenie priečnika, riešil by so mto najskôr tak že by som rozhodil jedntlivé osi uloženia a až potom na tie oci by som vkldal podpery/opory. Čiže aj nosná konštrukcia bude mať možnosť od oci ulaženia mož%t vytvorenia priečnika okolo osili
22. Kategórie ciest pre krok Zadanie: zoznam kategórií (STN 73 6101) a k nim voľná šírka na moste — dodáš tabuľku, alebo ju mám naštudovať a dať na potvrdenie? — pred 10a
*odpoveď (2026-10-31, v plan mode 10a):* voľná šírka na moste = b z označenia kategórie (C 9,5/70 → 9,5 m), vždy ručne upraviteľná; tabuľka z STN 73 6201 sa doplní neskôr. *Predpoklad:* návrhy kategórií vo výbere (`ROAD_CATEGORY_SUGGESTIONS`: C 7,5/60, C 9,5/70, C 11,5/80, R 22,5/100, R 24,5/120, D 26,5/120) sú len ukážky, kým nepríde tabuľka — oprav ich, ak nezodpovedajú platným normám.
*odpoveď* bolo by fajn aby v rámci prierezo NK sa dal parameter naviazať na voľnú šírku na moste
23. Meračka: robiť z bodov meračky aj terén (TIN), ktorý má v zameranom území prednosť pred DMR? Body v ukážke majú výšky len v textoch a línie sú 2D. — pred 10f
*odpoveď* nerobiť, meračku nechávať ako 2D podkad, príjemne by bolo v 2D pôdorysnom pohľade nechať ozbraziť ortofotomapu a mapu ako aj v 3D pohľade

### Zistené z podkladov

`fixtures/inbox/Meracka skutocneho stavu.dxf` (dodané 2026-10-31; zameranie existujúceho klenbového priepustu, ≈ 74 × 37 m, výšky 800,97 – 813,36 m Bpv):
- DXF AC1018 (AutoCAD 2004), `$INSUNITS` = 6 (m), súradnice záporné S-JTSK: x = E (≈ −302 7xx), y = N (≈ −1 199 0xx) — rovnaká orientácia ako pôdorys v S-JTSK v našom exporte.
- **Všetko má Z = 0.** Výška bodu je len v texte: `POINT` na `Vrstva 23` (152), číslo bodu `TEXT` na `Vrstva 4` presne v bode, výška `TEXT` na `Vrstva 5` ≈ 0,39 m vľavo od bodu (ručne posunuté až 0,82 m), časť výšok presunutá na hladinu `Skryté výšky od výkresu` (33). Kód bodu `TEXT` na `Vrstva 23` (`asf` 35, `hs` 27, `ps` 20, `klenba` 18, `rimsa` 8, `stlp` 7, `kamen` 7, `priepust` 6, `murik` 5, …).
- Línie podľa objektov (`asfalt`, `kamen`, `klenba`, `kocky`, `murik`, `priepust`, `rimsa`) sú 2D `LWPOLYLINE` / `LINE`; svahové šrafy ako bloky `INSERT` na `srafy_svahove`.
- Dôsledok pre import (10f): priradenie výšky k bodu podľa najbližšieho textu na zvolených hladinách výšok (s limitom vzdialenosti a kontrolou jednoznačnosti), typované problémy pre bod bez výšky a výšku bez bodu; výška línií z bodov meračky alebo z terénu.

`fixtures/inbox/Trasa LandXML.xml` (Civil 3D 2024, os 101-00, export 2026-06-10):
- Hlavička uvádza `epsgCode="2065"` (klasický S-JTSK), ale súradnice sú záporné E/N (EPSG:5514). Import preto nesmie veriť `epsgCode`; rozhoduje znamienko súradníc.
- Body sú v poradí N E (napr. `-1166863.09 -384315.69` → N = −1 166 863, E = −384 316).
- `dir`, `dirStart`, `dirEnd` sú v decimálnych stupňoch a merajú sa **od osi +E proti smeru hodinových ručičiek** (matematický uhol). Overené na úseku Line: vypočítaný smer 201,733604°, v súbore 201.733604221824. Platí teda `azimuth = π/2 − dir` (mod 2π).
- Os má dĺžku 12 527,25 m a obsahuje 7× Line, 14× Curve a 26× Spiral, všetky typu `clothoid`, aj zostavy prechodnica–prechodnica bez priamky (inflexia). Skok v staničení v súbore nie je.
- Niveleta: 2× PVI a 6× ParaCurve (parabolické výškové oblúky).
- Súbor obsahuje aj `CrossSects` (359) a `Superelevation` (14). V MVP sa ignorujú, prečítajú sa len os a niveleta.
- Kontrolné body k osi 101-00 zatiaľ nie sú; golden testy používajú os SO 171-11-01 (nižšie).

`fixtures/inbox/125-00_C3D.xml` (Civil 3D, export 2026-10-23, dodané 2026-10-31): osi `125-00` (557,37 m), `125_R`, `125_L` a povrchy `125-00_Povrch` a `125-00_HTU`; hlavička opäť `epsgCode="2065"`. Môže slúžiť na golden test terénu, chýba k nemu výkaz profilu terénu po osi.

`fixtures/inbox/SO 171-11-01.xml` + `CivilReport*.html` (Civil 3D 2023 export osi, výkazy z českej lokalizácie Civil 3D, 2026-10-29) — **hlavný podklad pre golden testy Fázy 1**:
- Os „Trasa 171-11-01“, dĺžka 723,35 m, staničenie od 0. Prvky: 4× Line (jedna len 0,042 m medzi dvoma prechodnicami), 6× Spiral (`clothoid`, aj nesymetrické dĺžky 89,998 / 69,939 m), 4× Curve (R 65,14 – 290 m). Súradnice EPSG:5514, záporné, poradie N E, hlavička opäť `epsgCode="2065"`.
- Niveleta pokrýva celú os: 2× PVI, 5× ParaCurve.
- `CivilReport.html` — prírastkové staničenie osi, krok 10 m, 74 bodov: staničenie, súradnice na 0,1 mm, smer dotyčnice. **Pozor na označenie stĺpcov:** stĺpec „Y“ obsahuje Northing (≈ −1 069 538), stĺpec „X“ Easting (≈ −617 210). Smer je zapísaný ako `S 126.4824.3992 (smv)` = severný azimut v tvare stupne.minútyseknudy (126°48′24,3992″), meraný od severu v smere hodinových ručičiek. Overené na prvej priamke: z LandXML `dir` = 323,193222° vychádza azimut 90° − 323,193222° = 126,806778° = 126°48′24,40″.
- `CivilReport2.html` — Station and Curve Report: styky prvkov (TS, SC, CS, ST, PC, PT), súradnice na 1 mm, smery ako kvadrantové smerníky (`S 53° 11' 35.6008" E`), staničenie v stovkovom tvare `1+58.761` = 158,761 m, parametre prechodníc (A, X, Y, P, K, Theta).
- `CivilReport3.html` — prírastkové staničenie nivelety, krok 10 m + body PVC, PVT, PVI, najnižšie body; výška na 0,1 mm, sklon v % na 6 desatinných miest; 89 riadkov.
- Pokrytie stačí na kritérium Fázy 1 (≥ 20 bodov vrátane prechodníc a výškových oblúkov).
- **Sklon vo výkaze nivelety** nie je dotyčnicový sklon v bode, ale sklon sečnice od predchádzajúceho riadku výkazu (overené: km 0,040 → (293,9135 − 294,0061) / 7,5345 = −1,2293 %). Golden test porovnáva sečnicu.
- **Zlom smeru 7,0″ v podkladoch:** 0,042 m priamka medzi prechodnicami (prvok č. 5, km 0,248 759) má `dir` 353,297799°, predchádzajúca prechodnica končí smerom 353,299737°. Aplikácia to hlási ako upozornenie; ide o nepresnosť návrhu v Civil 3D, nie chybu výpočtu.

`fixtures/inbox/*.png` + `Rozpätia mostov.pdf` (VŠB-TU Ostrava, Betonové mosty; dodané 2026-10-30):
- Typologické schémy prierezov NK bez kót: doska, doska + tyčové prefabrikáty (prefa riešenie), jednotrám / jednotrám s nábehmi, dvojtrám, komora / komora s nábehmi; v PDF navyše vyľahčená doska, doskotrám, mestský viadukt (nízka komora), zavesený / visutý.
- Tabuľka ekonomických rozpätí medziľahlých polí spojitých betónových mostov v ČR: doska ~21 m, vyľahčená doska ~30, doskotrám ~30, jednotrám ~35, jednotrám s nábehmi ~45, dvojtrám ~45, mestský viadukt ~35–45, prefa ~40, komora ~70, komora s nábehmi ~150, oblúk ~150, zavesený ~90–150, visutý ~90–250 (lávka).
- Využitie: šablóny typov prierezu vo Fáze 3 (parametrické profily podľa typológie) a upozornenie na rozpätie mimo ekonomického rozsahu vo Fáze 4 (len informatívne).

`fixtures/inbox/Dvojica NK.png` (rez E–E, M 1:100, rýchlostná cesta R2 Rožňava – Prešov; dodané 2026-10-30) — kóty v mm:
- Celkom 29 400 = ľavá NK 15 400 + 100 + 100 (os R2 medzi nimi) + pravá NK 13 800.
- Ľavá NK zhora: 1 750 (350 + 750 + 650; služobný chodník, zvodidlo H3) + 12 750 (500 + 500 + 3 × 3 500 + 250 + 500 + 500; jazdné pruhy) + 900 (rímsa pri strednom deliacom páse).
  Zdola: 400 + 14 650 + 350; spodok 4 850 + **5 000** (spodná šírka trámu) + 4 800.
- Pravá NK zhora: 900 + 11 250 (500 + 500 + 2 × 3 500 + 250 + 2 500 + 500) + 1 650 (650 + 750 + 250).
  Zdola: 350 + 13 050 + 400; spodok 4 550 + **4 000** (2 000 + 2 000 okolo osi NK) + 4 500.
- **Os NK = os spodnej šírky trámu**; výška NK v osi **1 700**, s vozovkou **1 790** (vozovka 90). Priečny sklon vozovky **4,5 %** jednostranne (na oboch NK rovnakým smerom — klopenie), rímsy 4 % k vozovke. Betón NK C40/50, rímsy C35/45.
- Tvar: jednotrám s nábehmi — tenká konzola so šikmým podhľadom, prechod do trámu veľkým oblúkovým nábehom, krátke šikmé steny, spodok trámu približne rovnobežný s priečnym sklonom. Rímsy sú samostatné prvky na koncoch konzol.

### Rozhodnuté (2026-10-29)

| Otázka | Rozhodnutie |
|---|---|
| Editor priečneho rezu | vlastný editor v tejto aplikácii; v MVP len definovanie základných prvkov prierezu, plnohodnotný editor neskôr (Fáza 8) |
| Jednotky vo výrazoch | čisté čísla v SI; zápis s jednotkami (`350 mm`) prípadne neskôr |
| Uhly v goniometrických funkciách | stupne (ako Revit); model interne v radiánoch, prevod len vo vnútri `sin/cos/tan/asin/acos/atan` |
| Formát staničenia | `km 1,234 567` (km, desatinná čiarka, metre na mm) |
| Vzťažný bod | NK sa viaže na **os mosta**, nezávislú od osi cesty, posúvateľnú vľavo/vpravo a hore/dole; predvolene leží na osi cesty so zvislým posunom o hrúbku vozovky |
| Názov, licencia | súkromný projekt, bez licencie (`UNLICENSED`); scope `@bridge/*` ostáva |
| Zvislý posun osi mosta | predvolene −hrúbka vozovky; os mosta leží na hornom povrchu NK (nie je to limit, len predvolená hodnota) |
| Os mosta v MVP | len posun osi cesty (vodorovný a zvislý); samostatná os z vlastného LandXML prípadne neskôr |
| Záporné staničenia | zobrazujú sa so znamienkom mínus, napr. `km -1,296 651` |
| Rozsah nivelety | mimo rozsahu nivelety je výška nedefinovaná → typovaná chyba; most musí ležať v rozsahu nivelety |
| Podklady | `fixtures/inbox/` sa neverzuje, podklady nie sú v histórii gitu |
| Zdroj terénu | povrch z Civil 3D (LandXML `Surface`) aj DMR 5.0 z ÚGKK |
| Terén a podpery | v MVP len vizuálny podklad a terénna čiara vo výkresoch; výška podpier ani hĺbka základov sa od terénu neodvíja |
| Terén v IFC | voliteľný export, rozhodne sa vo fáze 7 |
| Premenovanie parametra | automaticky prepíše odkazy v ostatných výrazoch (2026-10-30) |
| `round()` | zaokrúhľuje „od nuly“ ako Revit: round(2,5) = 3, round(−2,5) = −3 (2026-10-30) |
| Fixture prierezu Fázy 3 | rez E–E dvojice NK (29 400 mm) z `Dvojica NK.png`, nie pôvodných 28 900 mm (2026-10-30) |
| Konzola NK | hrúbka 200 mm na konci, 500 mm na začiatku nábehu, podhľad priamkový (2026-10-30) |
| Nábeh NK | stačí priamka (oblúk nie je nutný) (2026-10-30) |
| Spodok trámu | rovnobežný s vozovkou alebo vodorovný — voliteľné; na výkrese rovnobežný (2026-10-30) |
| Rímsy | samostatné prvky (`edgeBeam`), nie súčasť prierezu NK (2026-10-30) |
| Výška NK | meria sa zvislo (2026-10-30) |
| Hosting | statický web bez backendu; ďalší krok po Fáze 8 je nasadenie na Cloudflare s databázou (2026-10-31) |
| Súradnice | EPSG:5514, záporné E/N (potvrdené) |
| GitHub | repo vytvoril Jakub (`tomecjak/Bridge-modeler`); podklady sa nahrávajú do `fixtures/inbox/` |
| Koniec NK | rovnobežný s osou krajnej opory, staničenie „od/do“ v osi NK; prierez sa za koncovú rovinu predlžuje pozdĺž dotyčnice (2026-10-30, potvrdené 2026-10-31) |
| Opora | úložný prah, voliteľný driek a základ (hrúbka 0 = bez základu), záverný múrik po horný povrch NK, krídla s uhlom od osi mosta, zavesené alebo založené (2026-10-31, ADR 0010) |
| Jednotka uhla kríženia | ostávajú stupne; gony z výkresov prepočíta projektant (2026-10-31) |
| DMR 5.0 | GeoTIFF raster; JTSK03 (EPSG:8353) sa považuje za totožné s EPSG:5514 (2026-10-31, ADR 0011) |
| Uloženie terénu | v projekte, orezaný na koridor okolo osi mosta (2026-10-31, ADR 0011) |
| 2D výstupy | bez výkresov a kót v nástroji; obsah v pohľadoch, export pôdorysu, pozdĺžneho a priečneho rezu do DXF / SVG (2026-10-31, ADR 0012) |
| Jednotky DXF | metre vo všetkých výkresoch; pôdorys lokálne alebo v S-JTSK (2026-10-31) |
| Workflow UI | UI riadené postupom návrhu mosta (Fáza 10), použiteľné aj pre juniorov (2026-10-31) |
| Podklad prekážky | rôzne zdroje; najčastejšie meračka existujúceho stavu v DXF (DWG uložené ako DXF), ďalej osi z LandXML (2026-10-31) |
| Voľný prierez | predvoľby podľa typu prekážky; hodnoty dodá projektant (2026-10-31) |
| Poloha opôr | určuje projektant (svah kužeľa väčšinou 1 : 1,5, prekážky); nástroj ju nenavrhuje, pomáha meraním výšok terén – spodok NK (2026-10-31) |
| Staničenie podpier | zadáva a popisuje sa v km osi cesty; dĺžky, rozpätia, kóty a pozdĺžny rez sa merajú v osi mosta (2026-10-31) |
| Pozdĺžny profil | v osi cesty, v osi mosta aj v ďalších osiach alebo čiarach podľa výberu (2026-10-31) |
| Štíhlosť NK | orientačné hodnoty, kým statik nedodá potvrdené (2026-10-31) |
| Založenie podpier | predvolene horná hrana základu pod terénom v osi podpery; projektant môže zadať výšku podpery alebo kótu základovej škáry (2026-10-31) |
| Priečny sklon NK | konštanta v priereze; kontrola voči `Superelevation` v LandXML s upozornením na nesúlad (2026-10-31) |
| Varianty | v jednom projekte so spoločnými podkladmi a porovnaním ukazovateľov (2026-10-31) |
| Kóty | len v pohľadoch aplikácie (rozpätia, dĺžky, voľná výška); export DXF ostáva bez kót, ADR 0012 platí (2026-10-31) |
| Knižnica podpier | jednoduché firemné typy podpier na vizuálny návrh, nie detailné (2026-10-31) |
| Zadanie | prvý krok postupu: stavba, objekt, kategória cesty → voľná šírka na moste s ručnou úpravou (2026-10-31) |
| Úprava rozpätia | zmení sa len upravené pole, podpery za ním sa posunú, celková dĺžka sa zmení; prichytávanie po 0,5 m, staničenie v editore ľubovoľné (2026-10-31) |
| Dĺžky mosta | len po osi mosta; kolmé a šikmé vzdialenosti rieši výkres (2026-10-31) |
| Plocha mosta | pôdorysná plocha vrátane ríms; rímsy treba modelovať (Fáza 10i) (2026-10-31) |
| Merania v profile | dočasné, neukladajú sa (2026-10-31) |
| Terén na okrajoch NK | premietnuť do pozdĺžneho profilu v osi mosta inými farbami (2026-10-31) |
| Koniec NK | odvodený od opory, posúva sa s ňou; väzba sa dá odomknúť (2026-10-31) |
| Odsadenie NK od opory | priestor pre ložiská medzi úložným prahom a spodkom NK (2026-10-31) |
| Krytie základov | piliere 0,5 m pod terénom; pri oporách volí projektant (2026-10-31) |
| Ložiská | predvolene odvodené od prierezu NK (2026-10-31) |
| Orientačná cena | zástupné hodnoty €/m², skutočné dodá projektant (2026-10-31) |
| Prekážka na trase | kríženie zadané aj ručne km; v profile šrafovaná čiara so staničením a popisom, voľný prierez cesty alebo železnice (2026-10-31) |
| Vodný tok | kóta Q100 + rezerva a brehové čiary stačia (2026-10-31) |
| Pomer polí | krajné / vnútorné 0,7 – 0,8, len upozornenie (2026-10-31) |
| Klopenie | kontrola len ak ho LandXML obsahuje (2026-10-31) |
| Parametre vo variantoch | spoločné s možnosťou prepísať vo variante (2026-10-31) |
| Rozhranie | ako projekčná aplikácia (Revit, AutoCAD): ribbon podľa druhu práce (Súbor, Domov, Vložiť, Upraviť, Pohľad, Správa), prehliadač projektu (pohľady + model hierarchicky), vlastnosti ako mriežka; panel Postup zrušený (2026-10-31, ADR 0016) |
| Ložiská z prierezu | v 1/4 šírky spodnej plochy od okraja (2026-11-01) |
| Osi uloženia | najprv sa rozmiestnia osi uloženia, potom sa na ne vkladajú podpery a opory; NK pripravená na priečnik okolo osi uloženia (2026-11-01) |
| Rozmery opory | predsadenie, dĺžka prahu, odsadenie konca NK, medzera a múrik sa zadávajú v osi mosta (od 10d; 2026-11-01) |
| Voľná šírka v priereze | parameter prierezu NK sa dá naviazať na voľnú šírku zo zadania (2026-11-01) |
| Meračka | len 2D podklad, bez TIN; ortofoto a mapa aj v pôdoryse (2026-11-01) |
| Dĺžky po osi mosta | vodorovne, priemet do pôdorysu (2026-11-01) |
| Merať | v profile aj v pôdoryse, dočasné (2026-11-01) |
