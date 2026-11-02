# 0024 — Varianty a ukazovatele

- Stav: Prijaté
- Dátum: 2026-11-02

## Kontext

Krok 8 postupu návrhu je „Varianty“ (Fáza 10h): v jednom projekte viac návrhov mosta nad tými istými podkladmi
a ich porovnanie ukazovateľmi (pre investora a interné konzultácie). Podklady (osi, terén, meračka, prekážky, čiary,
oblasť mosta, zadanie) sú spoločné, prvky mosta sa medzi variantmi líšia. Globálne parametre majú byť spoločné
s možnosťou prepísať hodnotu vo variante (odpoveď 16). Celý výpočet, výkresy, 3D, STEP, IFC, normalizátory store aj
cache čítajú kolekcie prvkov mosta priamo z projektu (`project.superstructures` a pod.) na desiatkach miest.

## Rozhodnutie

**Pracovná kópia aktívneho variantu.** Prvky aktívneho variantu (`bridgeAxes`, `profiles`, `superstructures`,
`edgeBeams`, `bearingLines`, `supports`) sú na najvyššej úrovni projektu ako doteraz; neaktívne varianty majú svoje
prvky uložené celé vo `variants[].elements` (schéma v16, migrácia 15 → 16 vytvorí „Variant A“).
`Variant { id, name, parameters, elements? }`, `ProjectFile.activeVariant`; schéma stráži, že aktívny variant
`elements` nemá a ostatné áno.
- Prepnutie variantu = výmena kolekcií (jeden príkaz, jeden krok späť). Výpočty a exporty pracujú vždy s aktívnym
  variantom a nič nefiltrujú podľa variantu.
- Duplikovanie variantu skopíruje prvky **s rovnakými id** — varianty sa nikdy nepočítajú spolu, takže sa id
  nezrazia; výber, cache 3D a GUID v IFC ostanú pre zodpovedajúce prvky stabilné.
- `variants[].parameters` = prepísané priebehy globálnych parametrov (id parametra → priebeh). Výpočet berie
  `effectiveParameters(project)` = spoločné parametre s prepismi aktívneho variantu.
- Porovnanie počíta každý variant z `variantProject(project, id)` (projekt s daným variantom ako aktívnym) tými istými
  čistými funkciami.

**Ukazovatele** (čisté funkcie, každý s vysvetlivkou v UI):
- dispozícia: polia a rozpätia, max. pole voči ekonomickému rozpätiu typológie, počet pilierov a opôr, dĺžky (NK,
  premostenie, celková), šírky (NK, mosta, voľná), min. uhol kríženia;
- plocha mosta = pôdorysná plocha obrysu mosta vrátane ríms medzi prednými lícami úložných prahov (pri konštantnej
  šírke dĺžka premostenia × šírka mosta; odpoveď 3), pôdorysná plocha NK;
- objem NK = ∫A·dL po osi mosta (bez ríms; rímsy zvlášť), objem spodnej stavby (podpery vrátane základov, bez
  ložísk), ekvivalentná hrúbka NK = objem NK / pôdorysná plocha NK;
- výšky pilierov, podpery v prekážke, počet ložísk, najmenšia voľná výška a rezerva, štíhlosť, pomer krajné /
  vnútorné pole;
- orientačná cena = plocha mosta × €/m² podľa typológie hlavného prierezu z tabuľky v kóde — **zástupné hodnoty**,
  skutočné dodá projektant.
Mostné závery sa nepočítajú (rozhodnutie 2026-11-02).

## Dôsledky

- Existujúci kód sa variantmi nemení; kolekcie neaktívnych variantov sa normalizujú (konce NK, terén podpier) až pri
  porovnaní alebo po prepnutí.
- Súbor projektu je asymetrický (aktívny variant hore, ostatné vo `variants`); čitateľ JSON vidí aktívny návrh tam,
  kde doteraz.
- Prepnutie variantu je krok v histórii späť. Exporty (DXF, STEP, IFC) sú z aktívneho variantu.
- Ak bude treba zobraziť varianty spolu (napr. v jednej 3D scéne), id prvkov sa budú musieť rozlíšiť.
