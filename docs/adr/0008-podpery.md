# 0008 — Podpery, uloženie a polia

- Stav: Prijaté, doplnené ADR 0019 (založenie podľa terénu, ložiská z prierezu)
- Dátum: 2026-10-30

## Kontext

Fáza 4 pridáva opory a piliere so šikmosťou, uloženie NK a výšku podpery, ktorá sa musí prepočítať pri zmene
nivelety alebo NK. Konvencie zadal projektant 2026-10-30 (PLAN.md §7).

## Rozhodnutie

**Podpera** (`Support`) patrí jednej NK (pri dvojici NK sú podpery samostatné) a leží na jej osi mosta na
zobrazovanom staničení. Typy: stenový pilier, pilier zo stĺpov (kruhové aj obdĺžnikové, počet a osová
vzdialenosť), zjednodušená opora (úložný prah, driek); každá má základ (dĺžka, šírka, hrúbka). Rozmery sú výrazy
v m nad globálnymi parametrami.

**Šikmosť = uhol kríženia α** medzi osou mosta (v smere staničenia) a osou podpery, meraný **proti smeru
hodinových ručičiek** pri pohľade zhora; 90° = kolmá podpera.

**Ložiská** sú zadané priečnou vzdialenosťou x od osi NK (+ vpravo). Ložisko leží na osi podpery, preto má
staničenie `s₀ − x · cot α` (os mosta sa v okolí podpery považuje za priamu). Spodok NK nad ložiskom sa zistí rezom
prierezu NK na staničení ložiska v mieste x (princíp 4 — z parametrov, nie z 3D telesa).

**Výška:** horná hrana podpery = spodok NK − výška uloženia (ložisko + podložiskový blok; pri votknutí 0);
**horná hrana základu je kóta v m n. m.** zadaná pri podpere; výška podpery = horná hrana − horná hrana základu.
Terén výšku neovplyvňuje (rozhodnuté 2026-10-30).

**Polia** sa odvodia z poradia podpier NK; dĺžka poľa je rozdiel spojitého staničenia osi mosta. Opory majú byť na
koncoch, piliere medzi nimi; pole kratšie ako globálny parameter `minSpan` (predvolene 5 m) je chyba. Prekročenie
ekonomického rozpätia typu NK (tabuľka VŠB, štítok `typology` profilu) je len informatívne upozornenie.

**Súbor:** `schemaVersion` 3 pridáva `supports`; migrácia 2 → 3 doplní prázdne pole.

## Dôsledky

- Zmena nivelety, posunu osi mosta alebo výšky NK sa prejaví vo výške podpery bez ďalšieho zásahu.
- Podpera v oblúku je zjednodušene vztiahnutá k dotyčnici osi mosta v mieste podpery.
- Geometria podpier (pôdorys, pohľad) je podkladom pre 3D telesá vo Fáze 5.
