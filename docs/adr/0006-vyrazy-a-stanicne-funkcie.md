# 0006 — Výrazy parametrov a staničné funkcie

- Stav: Prijaté
- Dátum: 2026-10-30

## Kontext

Parametre prierezu a podpier sa zadávajú výrazmi a môžu sa meniť po staničení (princíp 3). Treba určiť
jednotky čísel vo výrazoch, význam staničenia vo výrazoch a v hraniciach úsekov a tvar nábehov.
Odpovede projektanta z 2026-10-30 (PLAN.md §7).

## Rozhodnutie

**Výrazový jazyk** (`packages/expr`): podmnožina syntaxe vzorcov Revitu, vlastný parser bez `eval`.
Operátory `+ - * / ^`, porovnania `< > = <= >= <>` (rovnosť s relatívnou toleranciou 1e-9), funkcie
`if and or not sin cos tan asin acos atan sqrt abs min max round roundup rounddown pi exp ln log`.
Desatinná bodka, čiarka oddeľuje argumenty. Názvy parametrov: písmená (aj s diakritikou), číslice, `_`.

**Jednotky vo výrazoch:** dĺžky v **m**, uhly v **°**, sklony v **m/m**. Goniometrické funkcie pracujú
v stupňoch (ako Revit). Model prevádza uhlové parametre na radiány až pri odovzdaní geometrii; UI zobrazuje
vyhodnotené hodnoty v mm / ° / %.

**Staničenie:** vo výrazoch premenná `sta` a hranice úsekov `from`/`to` sú **zobrazované staničenie**
(ako na výkrese). Model ho ukladá tak, ako ho projektant zadal; na spojité `s` sa prevádza pri vyhodnotení
cez `Stationing` (ADR 0003). Hranica v medzere alebo v prekryve skoku v staničení je typovaný problém.

**Staničná funkcia:** `constant` (výraz), `piecewise` (nadväzujúce úseky `from–to`, hodnoty `v0`, `v1`
ako výrazy, tvar `linear` / `parabolic` / `circular`, `vertexAt` = koniec s vodorovnou dotyčnicou),
`expression` (výraz s `sta`).
- parabola s vrcholom na začiatku: `v = v0 + (v1 − v0)·t²`, na konci: `v = v1 + (v0 − v1)·(1 − t)²`, `t ∈ ⟨0, 1⟩`;
- kružnica (len dĺžkové parametre): dotyčnica vo vrchole vodorovná, prechádza oboma koncovými bodmi,
  `R = (L² + Δ²) / (2|Δ|)`.

**Parametre** tvoria graf závislostí; cyklus a neznámy názov sú chyby s cestou / polohou vo výraze.
Parameter je závislý od staničenia, ak jeho funkcia nie je konštantná, odkazuje na `sta` alebo na
parameter závislý od staničenia; nezávislé sa vyhodnocujú raz.

## Dôsledky

- Projektant píše vzorce ako v Reviti, ale s dĺžkami v metroch (`h0 + 0.35`).
- Projekt zostáva čitateľný (staničenia ako na výkrese); pri zmene skokov v staničení sa hranice nemenia.
- Kružnicový nábeh pre uhlové alebo bezrozmerné parametre nemá zmysel → validácia ho odmietne.
