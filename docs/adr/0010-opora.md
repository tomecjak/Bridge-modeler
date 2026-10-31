# 0010 — Opora s úložným prahom, záverným múrikom a krídlami

- Stav: Prijaté
- Dátum: 2026-10-31

## Kontext

Opora z ADR 0008 bola blok po úložný prah. Pre koncepciu mosta treba aj záverný múrik a krídla, nastaviteľné
parametricky, ale jednoducho. Referenčný most 212-00 (`fixtures/inbox/Vzorový most.pdf`) má plytké opory na pilótach:
úložný prah bez drieku a základu, záverný múrik za medzerou 0,08 m a krídla rovnobežné s osou mosta dĺžky 4,00 m.

## Rozhodnutie

Rozhodnutia projektanta z 2026-10-31. Rozmery sú výrazy v m, hrúbky a šírky sa merajú kolmo na os podpery,
polohy v reze opory `w` od osi ložísk, kladne smerom do poľa.

| Časť | Parametre | Geometria |
|---|---|---|
| úložný prah | `seatLength`, `seatHeight`, `frontOffset` | `w ∈ [frontOffset − seatLength, frontOffset]`, vrch = horná hrana podpery (lineárne medzi ložiskami), spodok = vrch − `seatHeight` |
| driek | `stemThickness` | pod prednou lícou prahu po hornú hranu základu; len ak je základ nižšie ako spodok prahu |
| záverný múrik | `backwallThickness`, `gap` | predná líca rovnobežne s osou podpery za koncom NK (medzera `gap` meraná v osi mosta), od spodku prahu po horný povrch NK na konci |
| krídla | `angle`, `length`, `thickness`, `support`, `endHeight` | z oboch koncov opory od zadnej líce smerom od poľa, uhol od osi mosta (0 = rovnobežné, + roztvorené von), vonkajšia líca v rovine konca opory |
| základ | `footing.thickness` = 0 | bez základu (prah na pilótach, pilóty sa nemodelujú) |

- Horná hrana múrika a krídel = horný povrch NK (na konci NK, mimo šírky NK sa drží okraj); krídlo pokračuje
  v sklone nivelety. Zavesené krídlo: spodná hrana od spodku prahu lineárne k `vrch − endHeight` na voľnom konci;
  založené krídlo siaha po hornú hranu základu.
- Zadná líca opory (koreň krídel) = zadná líca múrika alebo prahu, podľa toho, ktorá je ďalej od poľa.
- Uhly ostávajú v stupňoch (výkresy uvádzajú gony, prepočet robí projektant).
- Schéma v4; migrácia 3 → 4 ponechá pôvodné rozmery opory a doplní predvolené (`defaultAbutmentGeometry`, podľa 212-00).
- Celková dĺžka mosta = rozsah krajných bodov opôr (koncov krídel) premietnutý na os mosta.

## Dôsledky

- Opora je stále zložená z jednoduchých hranolov (prah, driek, múrik, krídla) bez booleovských operácií;
  prekryvy častí nevadia zobrazeniu ani objemom v MVP (výmery sú mimo MVP).
- Prechodová doska, rímsy na krídlach, pilóty a sklz sa nemodelujú.
- Šikmé krídlo je rovinná stena; zalomené alebo zakrivené krídla prídu až s presným geometrickým jadrom.
