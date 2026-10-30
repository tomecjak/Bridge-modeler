# 0009 — 3D model a viewer

- Stav: Prijaté
- Dátum: 2026-10-30

## Kontext

Fáza 5 generuje z doménového modelu 3D model (NK a podpery) a zobrazuje ho v prehliadači. Požiadavky
z `PLAN.md`: most dĺžky 200 m sa regeneruje do 1 s, pri priblížení nič netrasie (súradnice S-JTSK
sú rádovo stovky km, WebGL počíta vo float32) a rez 3D siete sa zhoduje s 2D prierezom z Fázy 3.
Geometrické jadro má byť za rozhraním, aby sa neskôr dalo pridať OpenCascade (princíp 6).

## Rozhodnutie

**Geometrické jadro (`packages/mesh`)**
- `GeometryKernel<S>`: `loft(sections)`, `prism(pôdorys | časti, spodok(p), vrch(p))`, `tessellate(S)`.
  MVP: `MeshKernel`, kde teleso je priamo `TriangleMesh` (polohy `Float64Array` v lokálnych súradniciach,
  normály `Float32Array`, indexy `Uint32Array`). Uzávery a pôdorysy triangulujeme vlastnou trianguláciou
  s dutinami (`geom/triangulate.ts`, ear clipping); knižnica nie je potrebná.
- Loft: každá hrana prierezu má vlastný pás vrcholov (ostré hrany prierezu), normály sa priemerujú len pozdĺž osi.
- **Vzorkovanie NK**: všetky zlomy presne (prvky osi, PVC/PVT, hranice úsekov priebehov, skoky v staničení,
  podpery a ložiská), medzi nimi krok podľa tolerancie tetivy **2 mm** pre najvzdialenejší bod prierezu
  (oblúky, prechodnice, výškové oblúky, parabolické a kružnicové priebehy), najviac **2 m**. Pri vnútornej
  hranici úseku aj vzorka 1 mm pred ňou, aby sa skok hodnoty zobrazil ako zvislá plocha.
- Prierezy rovnakej topológie (počet obrysov a bodov) tvoria jeden loft; pri zmene topológie sa loft uzavrie.
- **Konce NK** (rozhodnutie projektanta 2026-10-30): ak je krajná podpera NK opora, koniec je rovnobežný s jej osou,
  inak kolmý na os mosta. Bod prierezu v priečnej polohe x končí na staničení `s_konca − x·cot α`
  (ako ložiská v ADR 0008, lokálne priamy úsek): body za koncovou plochou sa na ňu pritiahnu, body pred ňou
  sa predĺžia pozdĺž dotyčnice osi mosta.
- **Podpery**: základ ako kváder, driek / stĺpy / opora ako hranol od hornej hrany základu po hornú hranu podpery;
  horná plocha je rovinná medzi susednými ložiskami (pôdorys sa rozdelí na pásy), ložiská ako kvádre
  0,6 × 0,6 m s výškou uloženia.
- **Scéna**: `buildScene(projekt, cache)` vráti siete po objektoch s ID z modelu v stabilnom poradí. Cache podľa
  kľúča vstupov objektu: NK = prvok, profil, os mosta, os cesty, počiatok, parametre a staničenia / šikmosť jej podpier;
  podpera = prvok, jej NK, profil, os mosta, os cesty, počiatok, parametre. Zmena rozmeru piliera teda prepočíta
  len ten pilier, zmena globálneho parametra všetko.

**Zobrazenie (`apps/web`)**
- **three.js priamo**, bez `@react-three/fiber` (odchýlka od `PLAN.md`, sekcia 2): siete prichádzajú z workera
  po objektoch a vymieňajú sa imperatívne; fiber by pridal 9 tranzitívnych závislostí (scheduler, its-fine,
  zustand, buffer…) bez úžitku. Obal `SceneView` (~300 riadkov) drží scénu, kameru, orbit, výber a rezové roviny.
- **Bez trasenia**: každá sieť má vrcholy relatívne k stredu svojej obálky vo float32 a `position` = stred v double;
  matica model–pohľad sa skladá na CPU v double, do GPU idú len malé čísla. Logaritmický hĺbkový buffer
  (detail ložiska aj celý most bez z-fightingu). Scéna v lokálnych súradniciach, os z nahor.
- **Web Worker** + Comlink: worker dostane projekt (štruktúrovaná kópia JSON), drží cache a vráti len zmenené siete
  ako transferable buffre. Požiadavky „posledná vyhráva“ — počas výpočtu sa zmeny zlúčia.
- 3D záložka sa načíta lenivo (`React.lazy`), three.js je v samostatnom chunku; React a zod v samostatných
  vendor chunkoch. Limit upozornenia na veľkosť chunku je 600 kB (three.js sa ďalej deliť nedá).

**Runtime závislosti pridané teraz**

| Balík | Kde | Dôvod | Licencia | Veľkosť (min / gzip) |
|---|---|---|---|---|
| `three` 0.186.1 | apps/web (lenivý chunk) | WebGL rendering, orbit (`three/addons`) | MIT | ≈ 560 kB / 140 kB |
| `comlink` 4.4.2 | apps/web (worker) | RPC s Web Workerom, transferable buffre | Apache-2.0 | ≈ 4 kB / 1,7 kB |

Dev: `@types/three` 0.186.0.

## Dôsledky

- Výpočet scény mosta 200 m trvá ≈ 20 ms (test v Node aj meranie v prehliadači), cieľ 1 s je so zásobou.
- Rez siete (`sliceMesh`) sa zhoduje s 2D prierezom ≤ 2 mm na ľubovoľnom staničení a ≤ 1e-6 m na staničeniach vzoriek
  (test pre zvislú aj kolmú rovinu prierezu); `sliceMesh` poslúži aj výkresom.
- Šikmý koniec a zalomená horná plocha podpier sú v MVP aproximácie (lokálne priama os, rovinné pásy);
  presné telesá a booleovské operácie prídu s OpenCascade za rovnakým rozhraním.
- Výmena renderera alebo prechod na fiber sa dotkne len `apps/web/src/viewer`.
