# 0023 — Rímsy a voľná šírka

- Stav: Prijaté
- Dátum: 2026-11-02

## Kontext

Krok 5 postupu návrhu je „Prierez NK a rímsy“ (Fáza 10i). Rímsy sú samostatné prvky, nie súčasť prierezu NK
(rozhodnutie 2026-10-30). Okraj NK určuje šírku NK, vonkajší okraj rímsy šírku mosta (2026-11-01). Šírka mosta je
potrebná pre plochu mosta (10h). Voľná šírka medzi rímsami sa má kontrolovať voči zadaniu (kategória cesty, krok 1)
a parameter prierezu NK sa má dať naviazať na voľnú šírku (odpoveď 22). Na výkrese E–E (`Dvojica NK.png`) sú šírky
ríms a voľné šírky okótované (12 750 a 11 250 mm), výšky a nos rímsy nie.

## Rozhodnutie

Rozhodnutia projektanta z plan mode 10i (2026-11-02).

**Prvok:** `EdgeBeam { id, name, superstructure, side, profile, parameterLaws }` v `ProjectFile.edgeBeams`
(schéma v15). Rímsa patrí NK, ide po celej jej dĺžke a končí v rovine konca NK (šikmo ako NK). Odstránenie NK
odstráni aj jej rímsy.

**Prierez rímsy** je `ProfileDefinition` s typológiou `edgeBeam` — rovnaký editor, knižnica a výrazy ako pri NK.
Výber prierezu NK a priečnika ho neponúka.
- Rámec: referenčný bod je okraj NK = krajný bod vonkajších obrysov hlavného prierezu NK na danej strane (pri zhode
  x vyšší); x smeruje von od NK, y nahor. Prierez sa definuje pre pravú rímsu, ľavá sa zrkadlí.
- Vstavané meno `qNK` = sklon horného povrchu NK pri okraji, kladný = klesá von od NK (z hornej hrany obrysu NK pri
  okraji). V páse priečnika sa rímsa kotví na hlavný prierez NK.
- Šablóna „Rímsa“: L-tvar s nosom cez koniec konzoly, spodok na hornom povrchu NK; parametre b (šírka), c (presah
  za okraj NK), hI (výška vnútornej líca nad NK), hN (hĺbka nosa pod okrajom NK), p (sklon hornej plochy k vozovke,
  absolútny). Zástupné rozmery b 0,90 / c 0,35 / hI 0,25 / hN 0,40 m, p 4 %.

**Šírky:** voľná šírka = vodorovná vzdialenosť vnútorných hrán ľavej a pravej rímsy (bod rímsy najbližšie k NK,
pri zhode vyšší) v rovine prierezu; šírka mosta = vzdialenosť vonkajších hrán ríms (bez rímsy okraj NK).

**Voľná šírka:** NK má voliteľnú požadovanú voľnú šírku (`Superstructure.freeWidth`), inak platí hodnota zo
zadania. Kontrola na vzorkách NK (konce, osi uloženia, stredy polí) hlási upozornenie, len ak je voľná šírka menšia
o viac ako 1 mm; bez požadovanej hodnoty alebo bez oboch ríms sa nekontroluje. Vo výrazoch NK je vstavané meno
`volnaSirka` s hodnotou tej NK (globálny parameter s týmto menom nie je povolený).

**Zobrazenie:** hladina `RIMSY`; priečny rez a pôdorys s obrysom rímsy, v pozdĺžnom profile pohľad na rímsu (horná
vonkajšia hrana a spodok nosa), 3D a STEP ako samostatné teleso.

## Dôsledky

- Rímsa využíva vzorky, sweep a lofty NK; jej výpočet nemení prierez NK.
- Spodok rímsy je priamka so sklonom horného povrchu NK pri okraji; zlom horného povrchu pod rímsou sa zanedbá.
- Nos rímsy sa do kontroly voľnej výšky pod mostom zatiaľ nezapočítava (otázka 28).
- Rozmery šablóny sú zástupné, kým nepríde firemný detail rímsy.
