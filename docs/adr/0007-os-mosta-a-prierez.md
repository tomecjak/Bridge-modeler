# 0007 — Os mosta a parametrický prierez NK

- Stav: Prijaté
- Dátum: 2026-10-30

## Kontext

Most sa nemusí viazať priamo na os cesty: dvojica NK má každá svoju os, NK leží pod vozovkou a projektant ju
chce posúvať vľavo/vpravo a hore/dole (rozhodnutie z 2026-10-29). Prierez NK musí byť parametrický, s parametrami
meniteľnými po staničení (princíp 3), a jeho rezy sa počítajú priamo z parametrov (princíp 4). Referenčný výkres:
rez E–E dvojice NK R2 (PLAN.md §7).

## Rozhodnutie

**Os mosta** (`BridgeAxis`) je posun osi cesty: bod na staničení `s` = bod osi cesty + `h(s)` · vodorovná
normála vpravo; výška = niveleta(`s`) + `v(s)`. `h` a `v` sú staničné funkcie (m) nad globálnymi parametrami;
predvolene `h = 0`, `v = −hrúbka vozovky` — os mosta leží na hornom povrchu NK. Staničenie osi mosta = staničenie
osi cesty. Samostatná os z vlastného LandXML je mimo MVP.

**Definícia prierezu** (`ProfileDefinition`): parametre s predvolenými výrazmi, pomenované body s výrazmi `x`, `y`
v rámci prierezu (x vpravo v smere staničenia, y nahor, m), obrysy (`outer`) a dutiny (`void`) ako zoznamy bodov a
**referenčný bod**, ktorý leží na osi mosta. Výrazy bodov vidia parametre profilu, globálne parametre, `sta` a
súradnice skôr definovaných bodov ako `Bod_x`, `Bod_y`; odkaz na neskorší bod je chyba (poradie = poradie výpočtu).

**NK** (`Superstructure`): os mosta, rozsah `from`–`to` (zobrazované staničenie, ADR 0006), profil, priebehy
parametrov profilu po staničení (`parameterLaws`, prepíšu predvolené hodnoty) a orientácia roviny prierezu
(`vertical` | `normalToGrade`).

**Konvencie tvaru** (odpovede projektanta 2026-10-30): výška NK sa meria **zvislo**; priečny sklon je parameter
profilu; podhľad konzoly aj nábeh môžu byť priamky; **rímsy nie sú súčasťou prierezu NK** — budú samostatné
prvky (`edgeBeam`).

**Kontroly prierezu:** obrys aj dutiny musia byť uzavreté, bez samopretínania; obrys proti smeru hodinových
ručičiek, dutiny v smere (pri opačnom poradí sa otočia a nahlási upozornenie); dutina musí ležať vnútri obrysu.

**Súbor:** `schemaVersion` 2 pridáva `bridgeAxes`, `profiles`, `superstructures`; migrácia 1 → 2 doplní prázdne polia.

## Dôsledky

- Ten istý profil slúži obom NK dvojice s inými parametrami (šírky, spodok).
- Výška NK a hrúbky sú zvislé rozmery; pri orientácii `normalToGrade` sa prierez ako celok natočí podľa nivelety.
- Rímsy, chodníky a zvodidlá prídu ako samostatné prvky viazané na okraje NK.
