# 0016 — Rozhranie v štýle CAD: ribbon, prehliadač projektu, vlastnosti

- Stav: Prijaté
- Dátum: 2026-10-31

## Kontext

Rozhranie z Fáz 0 až 10a malo:
- hlavičku s tlačidlami,
- vlastné lišty nástrojov v každom pohľade (pôdorys, profil, prierez, 3D),
- vľavo panel Postup a plochý strom prvkov,
- vpravo formuláre editorov.

Projektant (rozhodnutie 2026-10-31) chce rozhranie podobné projekčným aplikáciám (Revit, AutoCAD). Panel Postup
sa mu nepáči a ruší sa úplne. Doménový model sa nemení.

## Rozhodnutie

- **Ribbon ako v Revite (podľa druhu práce)**:
  - menu Súbor (nový, otvoriť, uložiť, export),
  - karty Domov (prvky mosta, oblasť, kreslenie), Vložiť (LandXML, terén, prierez z knižnice), Upraviť
    (odstrániť, duplikovať, premenovať), Pohľad (navigácia, prevýšenie, 3D prepínače, okná), Správa
    (informácie o projekte, parametre, knižnica),
  - kontextová karta „Upraviť | typ“ pri výbere prvku.
  - Nad ribbonom je panel rýchleho prístupu (uložiť, späť, znova).
- **Pohľady nemajú vlastné lišty nástrojov.** Stav nástrojov a pohľadov drží `App.tsx` a pohľady ho dostávajú
  ako props:
  - aktívny nástroj, prevýšenie, celá os, požiadavka na prispôsobenie, prepínače 3D.
  - Esc zruší aktívny nástroj.
- **Prehliadač projektu** vľavo:
  - pohľady,
  - model hierarchicky (os cesty → os mosta → NK → podpery podľa staničenia, oblasť mosta),
  - podklady, prierezy, parametre.
  - Strom počíta čistá funkcia z projektu a výsledkov výpočtu.
- **Vlastnosti** vpravo ako mriežka v Revite: výber typu navrchu, zbaliteľné skupiny Názov | Hodnota.
  - Zložité hodnoty (priebehy po staničení, body prierezu, vrcholy čiary) sa upravujú v dialógoch cez „…“.
  - Bez výberu sa zobrazia vlastnosti aktívneho pohľadu.
  - Mapovanie prvok → riadky sú čisté funkcie.
- **Ikony** sú vlastné SVG komponenty v `apps/web/src/icons/`, bez novej runtime závislosti.
  Ikony mostných prvkov (NK, pilier, opora) by v bežných knižniciach aj tak neboli.

## Dôsledky

- Nástroje sú na jednom mieste a pohľady majú viac plochy.
- Pridanie nástroja = tlačidlo v ribbone + stav v `App.tsx`.
- Zložité editory sa nemuseli prepísať; presunuli sa do dialógov.
- `App.tsx` drží viac stavu rozhrania. Ak ešte narastie, presunie sa do samostatného store rozhrania
  (zustand, ADR 0005).
- Panel Postup a výpočet stavov krokov (`workflowSteps`) sa odstraňujú.
  Zadanie je v „Správa → Informácie o projekte“.
