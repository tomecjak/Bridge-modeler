# 0018 — Opora v osi mosta, koniec NK z opory a priečniky

- Stav: Prijaté
- Dátum: 2026-11-01
- Nahrádza: ADR 0010

## Kontext

Podľa ADR 0010 má opora rozmery merané kolmo na os opory a koniec NK sa zadáva ručne (od / do). Záverný múrik sa
ku koncu NK len prispôsobí. Projektant to chce inak:
- pozdĺžne rozmery opory sa zadávajú v osi mosta, ako kóty na výkrese (rozhodnutie 2026-11-01);
- koniec NK sa odvodí od opory a dá sa odomknúť (odpoveď 8);
- okolo osi uloženia sa NK môže zmeniť na priečnik s iným prierezom (odpoveď 21).

Na výkrese 212-00 sú v osi mosta kótované predsadenie prahu 0,90, odsadenie konca NK 0,50, medzera 0,08 a múrik
0,84. Dĺžka prahu 2,05 je kolmo na os opory: 2,32 × sin 61,84° = 2,05, pričom 2,32 = 0,84 + 0,08 + 0,50 + 0,90.
Prah teda siaha od zadnej líce múrika po prednú lícu.

## Rozhodnutie

Rozhodnutia projektanta z workshopu 2026-11-01. Rozmery sú výrazy v m. Pozdĺžne rozmery sa merajú v osi mosta od
osi uloženia a v reze kolmo na os opory sa násobia sin α.

**Opora s prahom a ložiskami** (`construction: 'bearing'`):

| Kóta | Parameter | Význam |
|---|---|---|
| a | `frontOffset` | predná líca prahu pred osou uloženia (smerom do poľa) |
| e | `endOffset` | koniec NK za osou uloženia (odsadenie konca NK) |
| g | `gap` | medzera koniec NK – záverný múrik |
| t | `backwallThickness` | hrúbka záverného múrika |
| h_p | `seatHeight` | výška prahu pod hornou hranou podpery |
| — | `stemThickness` | hrúbka drieku pod prednou lícou prahu (len ak je základ nižšie ako spodok prahu) |

- Prah siaha od zadnej líce múrika po prednú lícu, jeho dĺžka t + g + e + a sa nezadáva.
- Zadná líca múrika je zadná líca opory a koreň krídel.
- Múrik ide od spodku prahu po horný povrch NK, polohu berie zo skutočného konca NK.

**Monolitická opora** (`construction: 'monolithic'`, integrovaná aj rámová):
- stena hrúbky t_s (`wallThickness`, v osi mosta) so stredom na osi uloženia;
- NK končí na zadnej líci steny;
- bez múrika, medzery a ložísk, uloženie votknuté;
- stena ide od spodku NK po základ: rámová opora na pätke, integrovaná na pilótach (bez základu).

**Spoločné:**
- `length` = dĺžka pozdĺž osi podpery medzi vonkajšími lícami krídel;
- krídla (`wings`) sa nemenia (ADR 0010);
- predná líca prahu alebo steny určuje dĺžku premostenia;
- koniec krídel určuje celkovú dĺžku mosta.

**Koniec NK z opory.** Každý koniec NK má režim `ends.start` / `ends.end`:
- `abutment` (predvolene): koniec sa odvodí z opory na krajnej osi uloženia NK. Pri opore s prahom je to os ∓ e,
  pri monolitickej os ∓ t_s/2, merané vodorovne po osi mosta.
- `manual`: platí zadané od / do.
- Bez opory na krajnej osi platí od / do aj pri `abutment`.

Aplikácia po každom príkaze zosúladí od / do NK s oporami a zapíše ich do modelu v tom istom kroku späť. Súbor je
preto vždy konzistentný. Pri odvodenom konci je šikmý koniec NK rovnobežný s krajnou osou uloženia. Odomknutie
ponechá aktuálne staničenie.

**Priečnik.** Os uloženia môže mať `crossbeam: { profile, width }`:
- v páse rovnobežnom s osou uloženia má NK iný prierez, vybraný z prierezov projektu;
- šírka sa meria v osi mosta: vnútorný priečnik leží symetricky okolo osi, koncový od čela NK;
- parametre prierezu priečnika s rovnakým menom ako v NK (bL, bR, q, h …) preberajú priebeh NK, ostatné majú
  predvolené hodnoty;
- šablóna „Priečnik – plný blok“ je východisko pre koncové aj vnútorné tvary;
- NK sa v 3D a vo výkresoch skladá z úsekov NK a priečnikov so šikmými hranicami rovnobežnými s osou uloženia.

**Súbor:** schéma v9. Migrácia 8 → 9:
- a, t a hrúbku drieku prepočíta z merania kolmo na os opory do osi mosta (÷ sin α; pri uhle zadanom výrazom vznikne
  výraz);
- e nastaví na doterajší rozdiel staničení konca NK a krajnej osi;
- `ends` nastaví na `abutment` tam, kde na krajnej osi stojí opora;
- `seatLength` odstráni.

## Dôsledky

- Posun opory alebo zmena e posunie koniec NK bez ďalšieho zásahu. Dĺžka NK, premostenie a celková dĺžka idú z kót
  opory.
- Opora s doteraz kratším prahom, ako je zadná líca múrika, dostane po migrácii dlhší prah (podľa výkresu 212-00).
- Prierez na staničení (pohľad Prierez) sa pri šikmom priečniku určuje podľa polohy v osi mosta. Časť prierezu pri
  okraji môže v skutočnosti ešte patriť susednému úseku.
- Prechodová doska, rímsy na krídlach, pilóty a sklz sa naďalej nemodelujú.
