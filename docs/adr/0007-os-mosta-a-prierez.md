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

**Doplnok 2026-10-31 — okraj NK podľa krivky (Fáza 8a, schéma v6).** Parameter profilu v NK môže namiesto staničnej
funkcie sledovať krivku v pôdoryse (`parameterLaws[p] = { kind: 'edge', curve, side, add }`). Hodnota je vodorovná
vzdialenosť od osi mosta ku krivke, meraná po vodorovnej normále osi mosta (v rovine prierezu), kladná na stranu
`side`, plus prídavok `add` (výraz v m). Krivka je iná os z LandXML (podľa názvu, stačí smerové vedenie) alebo čiara
v pôdoryse (`planLines`, lokálne súradnice na mm). Vrcholy čiary a styky prvkov osi sa premietnu na os cesty a vzorkujú
sa presne. Hľadá sa najbližší priesečník na danej strane do 50 m; inak `EdgeCurveNotReached`. Globálne parametre
a os mosta ostávajú pri staničných funkciách.

**Doplnok 2026-11-01 — dĺžka po osi mosta a profil v ľubovoľnej čiare (Fáza 10b).**
- Dĺžky mosta sa merajú **vodorovne po osi mosta**:
  - rozpätia, dĺžka NK, dĺžka premostenia a celková dĺžka;
  - dĺžka je priemet do pôdorysu, bez sklonu nivelety.
- Dĺžka po osi mosta je L(s) = ∫ √((1 − κ·h)² + h′²) ds:
  - κ je krivosť osi cesty, kladná pre oblúk doprava;
  - h je vodorovný posun osi mosta;
  - integruje sa Gauss–Legendre medzi zlommi (styky prvkov osi, hranice úsekov h, skoky v staničení).
- Mimo rozsahu priebehu h sa h drží na hodnote krajného bodu, aby bol prevod spojitý na celej osi cesty.
  Kreslenie osi mosta v pôdoryse (`bridgeAxisPlan`) berie mimo rozsahu 0.
- Staničenie podpier a NK sa ďalej zadáva v km osi cesty (päta kolmice na os cesty).
- Dĺžka premostenia je vzdialenosť priesečníkov prednej líce úložných prahov s osou mosta.
- **Pozdĺžny profil** sa kreslí v zvolenej čiare: os cesty, os mosta, ľavý alebo pravý okraj NK, iná os z LandXML
  alebo čiara v pôdoryse.
  - x je rozvinutá dĺžka čiary `u`. Pri inej osi z LandXML je to jej staničenie, inde sa popisuje km osi cesty
    v päte kolmice.
  - Rez NK sa počíta z parametrov: v každej vzorke NK sa nájde priesečník čiary s rovinou prierezu, zvislica
    v tomto odsadení pretne obrysy a dutiny prierezu.
  - Šikmé konce NK sa riadia koncovými rovinami ako obrys NK. Okraj NK sa reže 1 mm dnu.
  - V osi mosta sa používa presný rez v osi s x = L(s).

## Dôsledky

- Ten istý profil slúži obom NK dvojice s inými parametrami (šírky, spodok).
- Výška NK a hrúbky sú zvislé rozmery; pri orientácii `normalToGrade` sa prierez ako celok natočí podľa nivelety.
- Rímsy, chodníky a zvodidlá prídu ako samostatné prvky viazané na okraje NK.
