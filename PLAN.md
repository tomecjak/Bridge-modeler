# Plán — Modelér mostov

Stav: návrh v0.1 (2026-10-29). Úlohy sa odškrtávajú priebežne; poznámky pripisuj pod úlohu.

## 1. Cieľ MVP

Jeden most (jedna alebo dve NK) nad jednou osou z LandXML:
parametrický prierez NK s nábehmi a rozšíreniami → podpery na staničeniach → 3D náhľad →
priečne rezy, rozvinutý pozdĺžny rez a pôdorys do DXF → export IFC 4.3.

**V rozsahu MVP**
- import osi a nivelety z LandXML (priamka, oblúk, klotoida; tangenty, výškové oblúky; skoky v staničení)
- výrazy a parametre, parametre ako funkcie staničenia
- parametrický prierez NK (obrys aj dutiny)
- opory a piliere na staničeniach so šikmosťou, ložiská / kĺby
- 3D model ako trojuholníková sieť, 3D viewer
- 2D výkresy: priečny rez, rozvinutý pozdĺžny rez, pôdorys → SVG, DXF
- export IFC 4.3 s georeferenciou a osou
- uloženie projektu ako JSON

**Mimo MVP** (viď Fáza 8): import IFC, booleovské operácie a pohľady so skrytými hranami (OpenCascade),
terén, výmery, viac osí, detaily oceľových a spriahnutých NK, výstuž, predpätie, backend a spolupráca, ProjectWise.

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
| Výrazy | vlastný parser (podmnožina syntaxe vzorcov Revitu) | prevziať z editora prierezu, ak existuje |
| DXF | rozhodne ADR vo fáze 6 | knižnica vs. vlastný ASCII zapisovač |
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

interface ProfileDefinition {
  id: string; name: string;
  parameters: { name: string; unit: Parameter['unit']; default: number }[];
  points: { name: string; x: Expr; y: Expr }[];       // lokálny rámec prierezu (CLAUDE.md)
  loops: { name: string; role: 'outer' | 'void'; points: string[] }[];
}

interface Superstructure {
  id: string; name: string;
  alignmentId: string;
  from: Station; to: Station;
  offset: StationFunction;                            // posun osi NK od osi komunikácie
  profileId: string;
  parameterLaws: Record<string, StationFunction>;     // napr. h, bLeft, bRight, crossSlope
  reference: { point: string; verticalOffset: Expr }; // väzba bodu profilu na niveletu
  orientation: 'vertical' | 'normalToGrade';
}

interface Support {
  id: string; name: string;
  kind: 'abutment' | 'pier';
  alignmentId: string;
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

Fázy 6 a 7 sú na sebe nezávislé, poradie sa dá vymeniť.

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
  - `.github/workflows/ci.yml` (+ `pnpm build`). Ostáva: vytvoriť GitHub repo a pushnúť — až potom bude CI reálne zelené.
- [x] ADR 0001 stack a nástroje, 0002 doménový model ako zdroj pravdy, 0003 súradnice a jednotky
  - v ADR 0003 je konvencia lokálnych osí a smerníka *navrhnutá*, potvrdí sa golden testmi vo Fáze 1.

**Hotové, keď:** CI je zelené a `pnpm dev` zobrazí prázdnu aplikáciu s rozložením.

### Fáza 1 — Os z LandXML
- [ ] `packages/geom`: Vec2/Vec3, `Frame` (počiatok, tangenta, normála, binormála), rotácie, tolerancie
- [ ] parser LandXML: `Alignments/Alignment/CoordGeom` (Line, Curve, Spiral), `Profile/ProfAlign` (PVI, ParaCurve, CircCurve), `StaEquation`, `Units`; poradie bodov N E
- [ ] smerové vedenie: priamka, kružnicový oblúk, klotoida (Fresnelove integrály, presnosť ≤ 0,1 mm); iné typy prechodníc → chyba `UnsupportedSpiralType`
- [ ] niveleta: tangenty, parabolické a kružnicové výškové oblúky
- [ ] API: `evaluate(s) → { point, azimuth, grade, frame }` a `project(point) → { s, offset }`
- [ ] staničenie: prevod `s` ↔ zobrazované staničenie so skokmi, formátovač
- [ ] golden testy proti `fixtures/` (výpis z Civil 3D)
- [ ] UI: import LandXML (drag & drop), pôdorys osi so staničením, pozdĺžny profil nivelety, kurzor ukazuje staničenie a súradnice

**Hotové, keď:** ≥ 20 kontrolných staničení (aj v klotoidách a výškových oblúkoch) sedí s Civil 3D ≤ 1 mm a poloha aj smer sú spojité na stykoch prvkov.

### Fáza 2 — Výrazy, parametre, staničné funkcie
- [ ] `packages/expr`: tokenizer, parser (Pratt), AST, vyhodnotenie; `+ - * / ^`, porovnania, `and or not`, `if()`, `sin cos tan asin acos atan sqrt abs min max round roundup rounddown pi()`
- [ ] chybové hlásenia s pozíciou vo výraze
- [ ] graf závislostí parametrov: detekcia cyklov, topologické vyhodnotenie, cache
- [ ] `packages/model`: `StationFunction` (constant, piecewise s tvarmi linear / parabolic / circular, expression)
- [ ] zod schéma projektu, verzia schémy, kostra migrácií
- [ ] uloženie a otvorenie projektu (JSON súbor), autosave do IndexedDB
- [ ] UI: tabuľka parametrov, editor staničnej funkcie s grafom priebehu po staničení

**Hotové, keď:** parabolický nábeh má správnu hodnotu aj dotyčnicu na oboch koncoch (test), cyklus v parametroch dáva zrozumiteľnú chybu a projekt sa uloží a načíta bez straty.

### Fáza 3 — Prierez NK
- [ ] `ProfileDefinition`: pomenované body s výrazmi, obrysy a dutiny, parametre s predvolenými hodnotami
- [ ] zjednotiť formát s editorom priečneho rezu (viď Otvorené otázky)
- [ ] `evaluateProfile(superstructure, s) → Polygon2D[]` s dosadením staničných funkcií v `s`
- [ ] väzba na niveletu cez referenčný bod a zvislý posun (napr. hrúbka vozovky)
- [ ] priečny sklon ako parameter profilu (MVP), nie z LandXML
- [ ] kontroly: uzavretosť, samopretínanie, orientácia; plocha a ťažisko prierezu
- [ ] fixture: dvojica NK, celková šírka 28 900 mm (jedna NK 14 350, konzoly 1 700 a 900, hrúbka v osi 1 000, spodná šírka 13 650, medzera 200)
- [ ] UI: náhľad prierezu s posuvníkom staničenia a kótami hlavných rozmerov

**Hotové, keď:** fixture sedí s výkresom na všetkých kótach a zmena parametra sa prejaví v náhľade do 100 ms.

### Fáza 4 — Podpery a polia
- [ ] `Support`: opora / pilier, staničenie, šikmosť, voliteľný posun od osi
- [ ] typy v MVP: stenový pilier, pilier z jedného alebo viacerých stĺpov (rozmery, počet, rozostup); opora ako zjednodušený blok (úložný prah, driek, základ)
- [ ] uloženie: ložisko, vrubový kĺb alebo votknutie; výška uloženia ako parameter
- [ ] výška podpery od spodného povrchu NK po hornú hranu základu, prepočet pri zmene nivelety alebo NK
- [ ] ložiskové body z pomenovaných bodov profilu premietnuté na podperu
- [ ] polia odvodené z poradia podpier, validácia poradia a minimálnej dĺžky
- [ ] UI: zoznam podpier, pridanie podpery kliknutím na staničenie, editor parametrov

**Hotové, keď:** výšky podpier sa správne prepočítajú pri zmene nivelety alebo hrúbky NK a šikmá podpera má v pôdoryse správnu orientáciu (test).

### Fáza 5 — 3D model
- [ ] rozhranie `GeometryKernel` a implementácia `MeshKernel`
- [ ] sweep NK: adaptívne vzorkovanie (hustejšie v oblúkoch, na zlomoch staničných funkcií a pri podperách), triangulácia medzi prierezmi s rovnakou topológiou, uzavretie koncov
- [ ] orientácia prierezu podľa `Superstructure.orientation`
- [ ] podpery ako jednoduché telesá v lokálnych súradniciach
- [ ] generovanie vo Web Workeri, prenos cez transferable buffers, regenerácia len zmenených objektov
- [ ] viewer: lokálne súradnice, orbit, rezová rovina, výber objektu → panel vlastností

**Hotové, keď:** most dĺžky 200 m sa regeneruje do 1 s, pri priblížení nič netrasie a rez 3D siete na ľubovoľnom staničení sa zhoduje s 2D prierezom z fázy 3 (test).

### Fáza 6 — 2D výkresy
- [ ] výkresový model: čiara, polyline, šrafa, text, kóta, značka staničenia; hladiny, typy čiar, mierka
- [ ] firemný štandard hladín ako konfigurácia (JSON)
- [ ] priečny rez na zvolených staničeniach (NK a podpera, ak na staničení leží)
- [ ] rozvinutý pozdĺžny rez: horný a spodný povrch NK, podpery, niveleta, staničenia, výšky
- [ ] pôdorys: obrysy NK, os so staničením, podpery so šikmosťou
- [ ] export SVG (náhľad v aplikácii) a DXF (mm, hladiny, mierka; lokálne alebo S-JTSK súradnice)
- [ ] ADR: knižnica pre DXF vs. vlastný zapisovač

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

### Fáza 8 — Neskôr (backlog)
- OpenCascade (WASM) ako druhý `GeometryKernel`: booleovské operácie, presné telesá, pohľady so skrytými hranami
- IfcSectionedSolidHorizontal a IfcLinearPlacement
- rozšírenia definované v pôdoryse (okraj NK ako krivka), viac NK, zakrivené podpery
- terén z LandXML `Surfaces` do pozdĺžneho rezu
- výmery (objemy betónu, plochy) a export pre KUBATOR
- PDF výkresy s rámikom a pečiatkou
- desktopový balík (Tauri), ak bude prehliadač obmedzovať

## 5. Referenčné dáta (dodá Jakub)

1. LandXML z Civil 3D: os s klotoidami, niveleta s výškovými oblúkmi, ideálne aj skok v staničení.
2. Kontrolné body k tej istej osi z Civil 3D (CSV): staničenie, Y, X, Z, smerník; aspoň 20 bodov vrátane stykov prvkov.
3. Výkres priečneho rezu dvojice NK (28 900 mm) a ukážky pozdĺžneho rezu a pôdorysu z reálneho projektu.
4. Firemný štandard hladín, typov čiar a farieb pre DXF.
5. Malý referenčný most (2–3 polia) s dĺžkami polí a šikmosťami na end-to-end test.

## 6. Sledované riziká

| Riziko | Opatrenie |
|---|---|
| presnosť súradníc S-JTSK vo WebGL | lokálny počiatok od fázy 1, výpočty v double |
| dialekty LandXML, typy prechodníc | typované chyby, golden testy proti Civil 3D |
| orientácia prierezu, šikmé podpery | testy zhody 2D prierezu a 3D siete |
| podpora IFC 4.3 v cieľových aplikáciách | tesselovaná geometria, testy importu |
| rozrastanie rozsahu | nič mimo MVP bez zápisu do tohto plánu |

## 7. Otvorené otázky

- Existuje už repo editora priečneho rezu? Ak áno: presunúť ho do tohto monorepa ako balík, alebo zdieľať cez npm?
- Jednotky vo výrazoch: čisté čísla v SI, alebo zápis s jednotkami (`350 mm`) ako v Reviti?
- Uhly v goniometrických funkciách: stupne (ako Revit) alebo radiány?
- Formát zobrazenia staničenia a počet desatinných miest.
- K čomu sa vzťahuje niveleta: horný povrch vozovky v osi komunikácie, alebo iný bod?
- Pracovný názov, licencia a vlastníctvo (súkromný vs. firemný projekt).
- Hosting: stačí statický web bez backendu (predpoklad MVP)?
- Súradnice a smerník vo výpisoch z Civil 3D: EPSG:5514 (záporné E/N) alebo klasické S-JTSK (kladné Y/X)? Smerník od severu alebo od osi +X (juh), v ° alebo gon? *Predpoklad (ADR 0003): interne lokálne x = E, y = N, `azimuth` od +y v smere hodín; smerník S-JTSK = azimuth + π.*
- Pracovný scope balíkov `@bridge/*` — premenovať po rozhodnutí o názve?
