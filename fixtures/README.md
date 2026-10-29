# Referenčné dáta

Vstupy a očakávané výsledky pre golden testy. Súbory sa needitujú ručne — pri zmene uveď zdroj
(projekt, verzia Civil 3D, dátum exportu) v `SOURCES.md` v príslušnom podadresári.

Potrebné dáta (PLAN.md, sekcia 5):

1. `alignment/` — LandXML z Civil 3D: os s klotoidami, niveleta s výškovými oblúkmi, ideálne aj skok v staničení.
2. `alignment/` — kontrolné body k tej istej osi (CSV): staničenie, Y, X, Z, smerník; ≥ 20 bodov vrátane stykov prvkov.
   Do `SOURCES.md` uveď, v akom systéme sú súradnice (EPSG:5514 záporné E/N alebo klasické kladné Y/X) a ako je meraný smerník.
3. `sections/` — výkres priečneho rezu dvojice NK (28 900 mm), ukážky pozdĺžneho rezu a pôdorysu.
4. `drawing/` — firemný štandard hladín, typov čiar a farieb pre DXF.
5. `bridge/` — malý referenčný most (2–3 polia) s dĺžkami polí a šikmosťami na end-to-end test.
