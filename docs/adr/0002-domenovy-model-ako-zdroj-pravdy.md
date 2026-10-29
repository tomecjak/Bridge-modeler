# 0002 — Doménový model ako zdroj pravdy

- Stav: Prijaté
- Dátum: 2026-10-29

## Kontext

Most sa modeluje parametricky nad osou. Z toho istého modelu vznikajú 3D náhľad, 2D výkresy
(SVG, DXF) a IFC 4.3. Ak by sa ktorýkoľvek výstup dal upravovať priamo alebo načítať späť,
vznikli by viaceré nekonzistentné verzie pravdy a deterministické generovanie by nebolo možné.

## Rozhodnutie

1. **Jediným zdrojom pravdy je projektový súbor** — JSON validovaný zod schémou z `packages/model`
   (z nej sa exportuje aj JSON Schema). Obsahuje os (normalizovanú z LandXML), parametre,
   definície prierezov, NK, podpery a definície výkresov.
2. **Všetky výstupy sú odvodené** funkcie `f(model) → výstup`: geometria, siete, výkresy aj IFC sa vždy
   generujú nanovo. Žiadny výstup sa needituje priamo a neukladá sa ako súčasť projektu
   (cache je iba optimalizácia, nesmie meniť výsledok).
3. **IFC je iba výstup.** Z IFC sa nič nenačítava späť. LandXML je *vstup* — pri importe sa os
   normalizuje a uloží do projektu; projekt potom od pôvodného XML nezávisí.
4. **Priečne rezy a pozdĺžny rez sa počítajú priamo z parametrov** (prierez v staničení `s`),
   nie rezaním 3D telesa. Zhoda 2D rezu a 3D siete je predmetom testu, nie zdrojom dát.
5. **Determinizmus:** rovnaký model → bitovo rovnaký výstup. Stabilné poradie (podľa poradia v modeli
   alebo podľa ID, nikdy podľa poradia v `Map`/`Set` z nedeterministického zdroja), žiadne `Date.now()`
   ani náhodné čísla vo výstupoch; IFC `GlobalId` a iné ID sa odvodzujú hashovaním ID z modelu.
6. **Verzovanie:** súbor nesie `schemaVersion`; staršie verzie sa pri otvorení prevedú reťazcom
   čistých migrácií `vN → vN+1`, každá pokrytá testom.
7. Zmeny modelu v UI idú cez príkazy (undo/redo); výpočty dostávajú nemenný snapshot modelu.

## Dôsledky

- Výpočtové balíky sú čisté funkcie nad modelom → jednoduché testovanie a beh vo Web Workeri.
- Používateľ nemôže „doladiť“ výkres ručne v aplikácii; čo treba meniť, musí byť parameter modelu
  alebo nastavenie definície výkresu. Úpravy v CAD po exporte sú mimo aplikácie.
- Regenerácia musí byť dostatočne rýchla; inkrementalita sa rieši cache podľa závislostí, nie úpravou výstupov.
- Golden testy výstupov (DXF, IFC) sú možné vďaka determinizmu.
