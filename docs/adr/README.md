# Architektonické rozhodnutia (ADR)

Krátke záznamy o rozhodnutiach, ktoré menia architektúru, princípy z `CLAUDE.md` alebo pridávajú
runtime závislosť. Číslovanie `NNNN-nazov.md`, záznam sa po prijatí nemení — nahradí ho nový ADR
(v starom sa stav zmení na *Nahradené ADR NNNN*).

| ADR | Názov | Stav |
|---|---|---|
| [0001](0001-stack-a-nastroje.md) | Stack a nástroje | Prijaté |
| [0002](0002-domenovy-model-ako-zdroj-pravdy.md) | Doménový model ako zdroj pravdy | Prijaté |
| [0003](0003-suradnice-a-jednotky.md) | Súradnice a jednotky | Prijaté (časť konvencií navrhnutá, overí sa vo Fáze 1) |
| [0004](0004-xml-parser.md) | XML parser pre LandXML | Prijaté |
| [0005](0005-schema-a-stav-aplikacie.md) | Schéma projektu a stav aplikácie (zod, zustand, immer) | Prijaté |
| [0006](0006-vyrazy-a-stanicne-funkcie.md) | Výrazy parametrov a staničné funkcie | Prijaté |
| [0007](0007-os-mosta-a-prierez.md) | Os mosta a parametrický prierez NK | Prijaté |
| [0008](0008-podpery.md) | Podpery, uloženie a polia | Prijaté |
| [0009](0009-3d-model.md) | 3D model a viewer | Prijaté |
| [0010](0010-opora.md) | Opora s úložným prahom, záverným múrikom a krídlami | Prijaté |
| [0011](0011-teren.md) | Terén: uloženie, zdroje a súradnice | Prijaté |
| [0012](0012-2d-vystupy-dxf.md) | 2D pohľady a export SVG / DXF | Prijaté |
| [0013](0013-kniznica-prierezov-a-vazby.md) | Knižnica prierezov, šablóny a väzby bodov | Prijaté |

## Šablóna

```markdown
# NNNN — Názov

- Stav: Navrhnuté | Prijaté | Nahradené ADR NNNN
- Dátum: RRRR-MM-DD

## Kontext
Prečo treba rozhodnúť, aké sú obmedzenia.

## Rozhodnutie
Čo sme zvolili. Pri závislosti: dôvod, licencia, veľkosť.

## Dôsledky
Čo z toho vyplýva — výhody, nevýhody, čo bude treba urobiť.
```
