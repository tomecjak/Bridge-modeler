# 0021 — Meračka v DXF a balík `survey`

- Stav: Prijaté
- Dátum: 2026-11-01

## Kontext

Najčastejší podklad prekážky je zameranie existujúceho stavu (meračka) v DXF (rozhodnutie 2026-10-31). Projektant
nechce z meračky robiť terén (odpoveď 23): stačí 2D podklad s výškami bodov. Vzorka
`fixtures/inbox/Meracka skutocneho stavu.dxf` (rozbor v PLAN.md, Zistené z podkladov):
- AutoCAD 2004 (AC1018), metre, kódovanie ANSI_1250, súradnice záporné S-JTSK (x = E, y = N);
- všetky entity majú Z = 0, výška bodu je len v texte vedľa bodu;
- čiary sú 2D `LWPOLYLINE` a `LINE`, šrafy bloky `INSERT`.

## Rozhodnutie

**Balík `packages/survey`** (čistý TypeScript bez DOM) s vlastnou čítačkou DXF, bez novej závislosti:
- ASCII DXF: hlavička (`$INSUNITS`, `$DWGCODEPAGE`), tabuľka hladín s farbami, sekcia `ENTITIES`;
- entity `POINT`, `TEXT`, `LINE`, `LWPOLYLINE` (oblúkové úseky `bulge` sa zanedbajú), `POLYLINE` / `VERTEX`,
  `INSERT` (len poloha a blok); ostatné sa spočítajú ako preskočené;
- kódovanie z `$DWGCODEPAGE` (ANSI_1250 → windows-1250), jednotky mm a cm sa prepočítajú na m;
- binárny DXF sa nepodporuje (typovaný problém).

**Výšky bodov:**
- k bodu na zvolených hladinách bodov sa priradí najbližší číselný text na zvolených hladinách výšok do 1,0 m;
- každý text patrí najviac jednému bodu (najbližšiemu);
- číslo a kód bodu sú texty presne v bode na ďalších zvolených hladinách;
- typované problémy: bod bez výšky, výška bez bodu, nejednoznačná výška;
- vrchol čiary dostane výšku bodu meračky do 0,05 m, inak ostane bez výšky.

**Uloženie v projekte** (`surveys[]`, vzor ADR 0011):
- meno, pôvodný súbor, hladiny, body (x, y, z?, číslo, kód), čiary (id, hladina, vrcholy x, y, z?, uzavretá);
- lokálne súradnice projektu zaokrúhlené na mm;
- import môže orezať meračku na koridor oblasti mosta, čiara ostane celá, ak má vrchol vnútri;
- projekt bez počiatku dostane počiatok z meračky ako pri importe osi.

**Použitie:**
- čiara meračky je krivka (`CurveRef` druhu `survey`) pre os prekážky (ADR 0020) aj pre okraj NK;
- meračka sa kreslí v pôdoryse, v 3D a v rezoch (priesečníky čiar s rovinou rezu, body do 1 m od nej).

**Súbor:** schéma v13 pridá `surveys` (migrácia: prázdne pole).

**Doplnok 2026-11-02 — import v aplikácii** (predpoklady v PLAN.md §7, otázky 24 a 25):
- čiary dostanú id `L1`, `L2`, … v poradí súboru po orezaní; v UI sa volajú „meračka: hladina n“ (n = poradie na hladine);
- orezanie rovnakým koridorom ako terén (pás okolo osi cesty, ADR 0011); body mimo koridoru sa vynechajú;
- výška čiary medzi zameranými vrcholmi je lineárna po dĺžke čiary, na koncoch výška krajného zameraného vrcholu;
  čiara bez výšok leží v 3D na teréne a v reze sa nekreslí; úroveň prekážky `line` používa tú istú výšku;
- typy výsledku čítania v balíku `survey` sa volajú `Extracted*`, uložené typy `Survey*` sú v `packages/model`;
- výšky bodov sa v pôdoryse kreslia na samostatnej hladine `MERACKA_VYSKY` (na obrazovke až pri priblížení).

## Dôsledky

- Meračku netreba konvertovať v inom programe; stačí DXF uložené z DWG.
- Z meračky nevzniká terén. Výška čiary je známa len v zameraných bodoch.
- Oblúky (`ARC`, `CIRCLE`, `ELLIPSE`), šrafy a výšky v blokoch s atribútmi sa zatiaľ neimportujú.
