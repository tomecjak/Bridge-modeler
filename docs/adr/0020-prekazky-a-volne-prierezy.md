# 0020 — Prekážky a voľné prierezy

- Stav: Prijaté
- Dátum: 2026-11-01

## Kontext

Rozpätia a šikmosť mosta určuje to, čo most premosťuje: cesta, železnica, vodný tok. Model zatiaľ prekážku
nepozná, takže projektant km a uhol kríženia odhaduje a voľná výška sa nekontroluje (PLAN.md, Fáza 10f, odpovede
12 a 13). Rozhodnutia projektanta z 2026-10-31 a z plan mode 10f (2026-11-01):
- prekážka má os z rôznych zdrojov: os z LandXML, čiara v pôdoryse, čiara z meračky alebo ručne zadané kríženie na
  km osi cesty;
- voľný prierez má predvoľbu podľa druhu prekážky; hodnoty nemáme overené, sú zástupné a v UI označené;
- voľný prierez cesty je rovnobežný s priečnym sklonom cesty;
- priechodný prierez železnice je zatiaľ zjednodušený obrys so skosenými hornými rohmi;
- pri vodnom toku stačí kóta hladiny Q100 s rezervou a brehové čiary.

Texty STN 73 6201 (voľné prierezy mostov) a STN EN 15273 (priechodné prierezy železníc) nie sú voľne dostupné.

## Rozhodnutie

**Prekážka** (`obstacles[]`) patrí k podkladom projektu (ako terén alebo čiary), nie k mostu:

| Pole | Význam |
|---|---|
| `kind` | `road`, `railway`, `water`, `fieldRoad`, `footpath`, `other` |
| `reference` | os prekážky: krivka (`CurveRef`: os z LandXML, čiara v pôdoryse, čiara meračky) alebo ručné kríženie `{ alignment, station, angle }` = priamka cez bod osi mosta na km pod uhlom kríženia |
| `level` | spodok voľného prierezu v osi prekážky: niveleta osi z LandXML, Z čiary meračky alebo konštanta (kóta TK, Q100) |
| `clearance` | voľný prierez: `left`, `right`, `height`, `slopeLeft`, `slopeRight`, `chamfer` (výrazy v m, sklony bez rozmeru) |

**Voľný prierez** je jeden tvar v reze kolmo na os prekážky:
- šírka vľavo a vpravo od osi;
- spodok aj vrch sú sklonené od osi o sklon vľavo a vpravo (kladný = klesá od osi);
- výška sa meria zvislo;
- horné rohy sa dajú skosiť o `chamfer` (vodorovne aj zvislo).

Predvoľba podľa druhu vyplní hodnoty:

| Druh | Výška | Šírka vľavo / vpravo | Sklony | Skosenie |
|---|---|---|---|---|
| cesta | 4,80 | 5,50 / 5,50 | 2,5 % | 0 |
| poľná cesta | 4,20 | 3,00 / 3,00 | 0 | 0 |
| chodník, cyklotrasa | 2,50 | 1,50 / 1,50 | 0 | 0 |
| železnica elektrifikovaná | 6,50 nad TK | 2,50 / 2,50 | 0 | 0,50 |
| železnica neelektrifikovaná | 5,00 nad TK | 2,50 / 2,50 | 0 | 0,50 |
| vodný tok | 0,50 nad Q100 | 10,00 / 10,00 | 0 | 0 |
| iná | 4,00 | 3,00 / 3,00 | 0 | 0 |

Všetky hodnoty sú zástupné, kým ich projektant nepotvrdí.

**Kríženie:**
- priesečník osi prekážky s osou mosta;
- výsledok: km osi cesty, uhol kríženia v konvencii `crossingAngle` (ADR 0008: od osi mosta proti smeru hodín,
  90° = kolmo) a úroveň spodku voľného prierezu;
- ručné kríženie má km a uhol priamo.

**Rez voľným prierezom** sa počíta z parametrov (princíp 4): bod pôdorysu sa prepočíta na súradnice voči osi
prekážky a vráti sa spodok a vrch voľného prierezu. Tá istá funkcia dáva:
- obrys v pozdĺžnom profile v ľubovoľnej osi (v osi mosta má šírku (l + r) / sin α);
- obrys v priečnom reze;
- pás v pôdoryse;
- hranol v 3D.

**Kontroly:**
- `ClearanceViolated` (chyba): spodok NK nad bodom voľného prierezu je nižšie ako jeho vrch. Hlási potrebnú
  a skutočnú voľnú výšku a km.
- `SupportInClearance` (chyba): pôdorys podpery zasahuje do pásu voľného prierezu.
- Minimálna voľná výška je výsledkom prekážky a kreslí sa ako kóta v profile.
- Prekážka sa kreslí a kontroluje v okolí mosta (do 40 m od pôdorysu NK).

**Súbor:** schéma v12 pridá `obstacles` (migrácia: prázdne pole), `CurveRef` dostane druh `survey` (ADR 0021).

## Dôsledky

- Km a uhol kríženia sú podkladom pre rozloženie polí (ukotvenie na kríženie, ADR 0017).
- Zmena nivelety, osi prekážky alebo prierezu NK sa hneď prejaví vo voľnej výške.
- Presný priechodný prierez železnice (polygón obrysu) a predvoľby z noriem treba doplniť od projektanta.
- Prietoková plocha pod mostom sa nepočíta.
