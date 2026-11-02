# 0022 — Kontroly a klopenie z LandXML

- Stav: Prijaté
- Dátum: 2026-11-02

## Kontext

Krok 7 postupu návrhu (Fáza 10g) sú kontroly. Problémy modelu sú dnes rozptýlené: počty chýb v prehliadači, riadky
vo vlastnostiach prvku a problémy súboru LandXML pod stromom. Prierez NK sa navyše kontroluje len na staničení
zobrazeného rezu. Chýbajú tri kontroly z rozhodnutí 2026-10-31: pomer krajného a vnútorného poľa (0,7 – 0,8, len
upozornenie), štíhlosť NK (orientačné L/h, kým statik nedodá potvrdené) a priečny sklon NK voči klopeniu
z LandXML (len ak ho LandXML obsahuje). LandXML z Civil 3D zapisuje klopenie do prvkov `Superelevation`;
v podklade 125-00 sú údaje posunuté medzi prvkami (otázka 17).

## Rozhodnutie

Rozhodnutia projektanta z plan mode 10g (2026-11-02).

**Panel Kontroly** je karta vo výreze (vedľa Parametre). Všetky problémy sa zbierajú na jednom mieste
v skupinách: geometria, rozpätia, štíhlosť, voľná výška a podpery v prekážke, klopenie, založenie a ostatné. Každý
riadok odkazuje na prvok (klik vyberie, dvojklik priblíži). V stavovom riadku je počet chýb a upozornení. Prierez
každej NK sa pre kontroly vyhodnotí na vzorkách (konce NK, osi uloženia, stredy polí), nielen v zobrazenom reze.
Problémy sa skladajú len z typovaných kódov; mapovanie kódov na skupiny je jedna tabuľka, ktorú pokrýva test.

**Pomer polí:** prvé / druhé a posledné / predposledné pole mimo 0,7 – 0,8 → upozornenie (pri ≥ 3 poliach).

**Štíhlosť:** orientačná tabuľka L/h podľa typológie prierezu (PLAN.md §7, TODO statik). h je najväčšia zvislá
hrúbka prierezu NK: v strede poľa, pri typoch s nábehmi aj nad podperou (hlavný prierez, nie priečnik). L je dĺžka
poľa po osi mosta. Upozorní sa mimo rozsahu na obe strany (štíhla aj masívna).

**Klopenie:**
- `Superelevation` sa číta pri importe osi a ukladá v `AlignmentData.superelevation` (schéma v14, pole voliteľné);
  staré projekty ho nemajú, kým sa os neimportuje znova;
- znamienko `FullSuperelev`: kladné = klesá doprava, čiže rovnako ako parameter `q` prierezu (q = e / 100); podľa
  125-00 (4 z 5 oblúkov) treba overiť na výkaze klopenia;
- diagram: plné klopenie od `FullSuperSta` po `RunoffSta`, nábehy od `BeginRunoutSta` / `BeginRunoffSta` po
  `FullSuperSta` a od `RunoffSta` po `StartofRunoutSta` / `EndofRunoutSta`;
- nekonzistentné údaje (zlé poradie staničení, plné klopenie mimo rozsahu prvku o viac ako 1 m) → upozornenie
  a kontrola `q` sa pre os vynechá;
- NK v nábehu → upozornenie; v úseku plného klopenia |q − e| > 0,1 % → upozornenie.

## Dôsledky

- Kontroly sú čisté funkcie v `packages/sections` (polia, štíhlosť, klopenie) a v `apps/web/src/store/checks.ts`
  (zber a skupiny); nový kód problému musí mať skupinu, inak test zlyhá.
- Kontrola klopenia je overená len na syntetických osiach; golden test čaká na výkaz klopenia (Referenčné dáta,
  bod 8). Kým nepríde, je interpretácia predpoklad.
- Hodnoty štíhlosti sú orientačné; po potvrdení statikom sa zmení len tabuľka.
