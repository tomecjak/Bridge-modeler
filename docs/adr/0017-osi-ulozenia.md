# 0017 — Osi uloženia a rozloženie polí

- Stav: Prijaté
- Dátum: 2026-11-01

## Kontext

Podľa ADR 0008 má každá podpera vlastné staničenie a uhol kríženia a polia sa odvodia z poradia podpier. Projektant
pracuje inak (odpoveď 21, 2026-11-01): najprv rozmiestni osi uloženia (rozpätia, šikmosť) a až potom na ne vkladá
opory a piliere. NK sa okolo osi uloženia neskôr mení, napríklad pre priečnik (10d). Fáza 10c pridáva aj ťahanie
podpier, zadanie rozpätia na kóte a dialóg „Rozloženie polí“. Všetky tri potrebujú posúvať polohu bez ohľadu na to,
či na osi už podpera stojí.

## Rozhodnutie

**Os uloženia** (`bearingLine`) je samostatný prvok projektu. Patrí jednej NK a má:
- číslo (`name`);
- zobrazované staničenie osi cesty v osi mosta (`station`, rovnaký význam ako doteraz `support.station`);
- uhol kríženia (`crossingAngle`, výraz v °, konvencia ADR 0008).

V pôdoryse je to priamka cez bod osi mosta, otočená o uhol kríženia od dotyčnice.

**Podpera vždy stojí na osi uloženia** (`support.bearingLine`) a preberá z nej NK, polohu aj šikmosť. Polia NK sa
počítajú z osí uloženia, aj keď na nich ešte nie sú podpery. Kontroly polí:
- poradie opôr a pilierov platí pre osi s podperou;
- os bez podpery je upozornenie;
- dve podpery na jednej osi sú chyba.

**Úpravy polohy** (rozhodnutia 2026-11-01):
- **Ťahanie:** posunie sa len ťahaná os, prichytáva sa dĺžka poľa pred ňou (od predchádzajúcej osi) po 0,5 m po osi
  mosta. Ctrl posunie aj všetky ďalšie osi, Shift ťahá bez prichytávania.
- **Zadanie rozpätia na kóte:** zmení sa len to pole. Osi na strane poľa vzdialenejšej od vybranej podpery sa
  posunú, bez výberu tie smerom ku koncu (rozhodnutie 2026-10-31).
- **Rozloženie polí** (napr. „16 + 23 + 16“, „3×20“) s ukotvením od začiatku, od konca alebo symetricky okolo km:
  - existujúce podpery sa zachovajú a presunú;
  - opory ostanú na krajných osiach, piliere sa priradia podľa poradia;
  - chýbajúce podpery sa doplnia zvoleným typom, nadbytočné sa odstránia;
  - osi sa prečíslujú 1 … n od začiatku.
- **Koniec NK:** pri posune krajnej osi sa posunie aj koniec NK so zachovaným presahom za os (meraným v osi mosta).
  Je to dočasné, kým väzbu konca NK na oporu nezavedie Fáza 10d.
- Každá úprava je jeden krok späť (príkaz `batch`).

**Súbor:** schéma v8 pridáva `bearingLines`. Podpera stráca `superstructure`, `station` a `crossingAngle`
a dostáva `bearingLine`. Migrácia 7 → 8 vytvorí každej podpere os `bl-<id podpery>` s jej názvom, NK, staničením
a uhlom.

## Dôsledky

- Poloha a šikmosť podpery majú jeden zdroj pravdy. Posun osi posunie podperu aj ložiská bez ďalšieho zásahu.
- Rozpätia sa dajú navrhnúť a skontrolovať pred voľbou typu podpier.
- Os uloženia sa kreslí v pôdoryse aj v profile (hladina `supportAxis` / `OS_PODPERY`), aj bez podpery.
- Na os uloženia sa vo Fáze 10d naviaže koniec NK a zmena prierezu NK (priečnik).
- Podpera na dvojici NK ostáva samostatná pre každú NK (ADR 0008), každá NK má vlastné osi uloženia.
