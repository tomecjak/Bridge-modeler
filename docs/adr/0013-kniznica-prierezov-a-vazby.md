# 0013 — Knižnica prierezov, šablóny a väzby bodov

- Stav: Prijaté
- Dátum: 2026-10-31

## Kontext

Fáza 8b robí z tabuľkového zadávania prierezu plnohodnotný editor. Projektant chce knižnicu prierezov
(šablóny typológií VŠB, vlastné prierezy, import a export). Ukladá sa v projekte a v súbore. Rozhranie má byť
pripravené na databázu, lebo ďalší krok je nasadenie na Cloudflare. Ďalej chce grafické kreslenie a väzby
bodov. Zdrojom pravdy ostáva doménový model (ADR 0002): bod je dvojica výrazov `x`, `y` (ADR 0007).

## Rozhodnutie

**Šablóny** (`packages/sections/src/templates/catalog.ts`): doska, vyľahčená doska, doskotrám, jednotrám,
jednotrám s nábehmi, dvojtrám, komora a komora s nábehmi. Kľúč `typology` zodpovedá tabuľke ekonomických rozpätí.
- Spoločný rámec: referenčný bod R v osi na hornom povrchu, vrch so sklonom q a spodok rovnobežný s vrchom.
- Predvolené rozmery sú typické pomery, nie projektové hodnoty (PLAN.md §7).
- Kruhové dutiny vyľahčenej dosky sú 16-uholníky. Ich počet je pevný (6), lebo body prierezu sú pevné.

**Knižnica** (`packages/model/src/library.ts`):
- Súbor `{ format: 'bridge-modeler/profile-library', version: 1, entries }`.
- Položka `{ id, name, typology?, description?, profile }` zodpovedá jednému riadku budúcej databázy.
- Asynchrónne rozhranie `ProfileLibrary` (`list`, `get`, `save`, `remove`) s implementáciami:
  - zabudované šablóny, len na čítanie;
  - prierezy projektu, cez príkazy store, takže so späť / znova;
  - importovaný súbor.
- Vloženie do projektu je kópia s novým id; pri zhode mena sa doplní poradové číslo.
- Cloudová implementácia príde s nasadením a za rovnakým rozhraním.

**Väzby bez riešiča** (`packages/sections/src/constraints.ts`):
- Väzba sa zapíše ako kanonické výrazy bodu. Druhy:
  - pevné súradnice;
  - relatívne k bodu;
  - zvislo pod bodom;
  - vodorovne s bodom;
  - na sklone;
  - na priamke AB;
  - priesečník priamok AB a CD;
  - zrkadlo podľa osi.
- V súbore je len výraz a väzba sa z neho rozpozná porovnaním s kanonickým tvarom.
- Ťahanie myšou mení len voľné číslo väzby (zaokrúhlené na mm). Body riadené parametrami, zrkadlom alebo
  priesečníkom sú zamknuté a editor ukáže, čo ich riadi.
- Odkaz je možný len na skoršie body (poradie výpočtu, ADR 0007).

**Editor** (pohľad Prierez pri vybranom priereze):
- Hodnoty parametrov sú z NK, ktorá prierez používa na zvolenom staničení, inak predvolené.
- Prichytávanie na mriežku 10 mm a zarovnanie s bodmi do 6 px.
- Každá úprava je jeden príkaz store.

## Dôsledky

- Schéma projektu sa nemení; súbor knižnice má vlastnú schému a verziu.
- Ručne upravený výraz, ktorý sa nezhoduje s kanonickým tvarom, editor berie ako parametrický (zamknutý bod).
- Premenlivý počet prvkov (napr. dutín alebo rebier) by potreboval generovanie bodov zo šablóny pri vyhodnotení.
  Zatiaľ sa nerobí.
