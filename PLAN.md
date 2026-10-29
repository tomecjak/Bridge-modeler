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
- [ ] os mosta: posun od osi cesty (vodorovný a zvislý ako staničné funkcie), predvolene na osi cesty so zvislým posunom o hrúbku vozovky
- [ ] základný editor prierezu: definovanie základných prvkov (body, obrysy, dutiny, parametre); plný editor vo Fáze 8
- [ ] `evaluateProfile(superstructure, s) → Polygon2D[]` s dosadením staničných funkcií v `s`
- [ ] väzba referenčného bodu profilu na os mosta
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

### Fáza 5b — Terén
- [ ] `packages/terrain`: TIN (body, trojuholníky) v lokálnych súradniciach, priestorový index, `elevationAt(x, y)` (mimo povrchu → typovaná chyba / `undefined`)
- [ ] import LandXML `Surfaces/Surface/Definition` (`Pnts`, `Faces`), poradie bodov N E Z; viac povrchov v súbore → výber
- [ ] orezanie povrchu na koridor okolo osi mosta (šírka ako parameter), aby sa veľké DMR dali používať v prehliadači
- [ ] rez terénom: pozdĺž osi (pre pozdĺžny rez) a pozdĺž priečnej čiary na staničení (pre priečny rez) → polyline so zlomami na hranách TIN
- [ ] ADR: kde je terén uložený (v projektovom JSON vs. samostatný súbor/asset) a ako sa udržiava determinizmus
- [ ] viewer: terén ako polopriehľadná sieť, zapínanie/vypínanie
- [ ] golden test: výška v kontrolných bodoch voči Civil 3D ≤ 1 mm

**Hotové, keď:** povrch z Civil 3D sa načíta, v 3D lícuje s mostom a rez terénom sa zhoduje s pozdĺžnym profilom terénu z Civil 3D ≤ 1 mm (test).

### Fáza 6 — 2D výkresy
- [ ] výkresový model: čiara, polyline, šrafa, text, kóta, značka staničenia; hladiny, typy čiar, mierka
- [ ] firemný štandard hladín ako konfigurácia (JSON)
- [ ] priečny rez na zvolených staničeniach (NK a podpera, ak na staničení leží)
- [ ] rozvinutý pozdĺžny rez: horný a spodný povrch NK, podpery, niveleta, terén, staničenia, výšky
- [ ] terénna čiara v priečnom reze
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
- výmery (objemy betónu, plochy) a export pre KUBATOR
- PDF výkresy s rámikom a pečiatkou
- desktopový balík (Tauri), ak bude prehliadač obmedzovať
- plnohodnotný editor priečneho rezu (grafické kreslenie, väzby, knižnica prierezov)

## 5. Referenčné dáta (dodá Jakub)

1. LandXML z Civil 3D: os s klotoidami, niveleta s výškovými oblúkmi, ideálne aj skok v staničení.
2. Kontrolné body k tej istej osi z Civil 3D (CSV): staničenie, Y, X, Z, smerník; aspoň 20 bodov vrátane stykov prvkov.
3. Výkres priečneho rezu dvojice NK (28 900 mm) a ukážky pozdĺžneho rezu a pôdorysu z reálneho projektu.
4. Firemný štandard hladín, typov čiar a farieb pre DXF.
5. Malý referenčný most (2–3 polia) s dĺžkami polí a šikmosťami na end-to-end test.
6. Povrch terénu z Civil 3D (LandXML `Surface`) v okolí toho istého mosta a pozdĺžny profil terénu po osi (výkaz) na golden test.

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

- Smerník vo výkazoch kontrolných bodov z Civil 3D: návod žiada North Azimuth v decimálnych stupňoch ([docs/navod-kontrolne-body-civil3d.md](docs/navod-kontrolne-body-civil3d.md)); overí sa po dodaní. (V LandXML je konvencia už zistená, pozri nižšie.)
- Terén — zdroj: len LandXML povrch z Civil 3D, alebo aj iné formáty (napr. DMR 5.0 z ÚGKK ako GeoTIFF/LAS)? *Predpoklad MVP:* len LandXML `Surface`.
- Terén a podpery: má sa výška podpery / hĺbka základu odvíjať od terénu (napr. horná hrana základu X m pod terénom), alebo je terén len vizuálny podklad? *Predpoklad:* v MVP len vizuálny podklad a terénna čiara vo výkresoch.
- Terén v IFC: exportovať ho (napr. `IfcGeographicElement` s `TERRAIN`), alebo nie? *Predpoklad:* voliteľne, rozhodne sa vo fáze 7.
- Golden testy a CI: podklady sa neverzujú, takže CI k nim nemá prístup. *Predpoklad:* testy proti reálnym podkladom bežia len lokálne (ak dáta chýbajú, preskočia sa) a CI overuje syntetické osi so známou geometriou.

### Zistené z podkladov

`fixtures/inbox/Trasa LandXML.xml` (Civil 3D 2024, os 101-00, export 2026-06-10):
- Hlavička uvádza `epsgCode="2065"` (klasický S-JTSK), ale súradnice sú záporné E/N (EPSG:5514). Import preto nesmie veriť `epsgCode`; rozhoduje znamienko súradníc.
- Body sú v poradí N E (napr. `-1166863.09 -384315.69` → N = −1 166 863, E = −384 316).
- `dir`, `dirStart`, `dirEnd` sú v decimálnych stupňoch a merajú sa **od osi +E proti smeru hodinových ručičiek** (matematický uhol). Overené na úseku Line: vypočítaný smer 201,733604°, v súbore 201.733604221824. Platí teda `azimuth = π/2 − dir` (mod 2π).
- Os má dĺžku 12 527,25 m a obsahuje 7× Line, 14× Curve a 26× Spiral, všetky typu `clothoid`, aj zostavy prechodnica–prechodnica bez priamky (inflexia). Skok v staničení v súbore nie je.
- Niveleta: 2× PVI a 6× ParaCurve (parabolické výškové oblúky).
- Súbor obsahuje aj `CrossSects` (359) a `Superelevation` (14). V MVP sa ignorujú, prečítajú sa len os a niveleta.
- Do golden testov ešte chýbajú kontrolné body (staničenie, E, N, Z, smerník) — návod na export: [docs/navod-kontrolne-body-civil3d.md](docs/navod-kontrolne-body-civil3d.md).

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
| Hosting | statický web bez backendu |
| Súradnice | EPSG:5514, záporné E/N (potvrdené) |
| GitHub | repo vytvoril Jakub (`tomecjak/Bridge-modeler`); podklady sa nahrávajú do `fixtures/inbox/` |
