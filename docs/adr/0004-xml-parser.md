# 0004 — XML parser pre LandXML

- Stav: Prijaté
- Dátum: 2026-10-30

## Kontext

Import osi (a neskôr terénu) číta LandXML. Parser musí bežať v prehliadači, vo Web Workeri aj v Node
(testy) — princíp 5. `DOMParser` vo Web Workeri ani v Node nie je, vlastný XML parser by bol zbytočná práca
a zdroj chýb (entity, CDATA, kódovanie). V `CoordGeom` záleží na poradí prvkov rôznych typov
(Line, Spiral, Curve), takže parser musí vedieť zachovať poradie.

## Rozhodnutie

Používame **fast-xml-parser** v balíku `@bridge/alignment` (neskôr aj `@bridge/terrain`).

| | |
|---|---|
| Verzia | 5.11.2 (presne pripnutá) |
| Licencia | MIT |
| Veľkosť | parser ≈ 65 kB min, ≈ 22 kB gzip; jediná závislosť `strnum` (MIT) |
| Prečo | čistý JS bez DOM, beží všade; režim `preserveOrder` zachová poradie prvkov; rýchly aj na veľkých súboroch (TIN) |

Použitie je zapuzdrené v `packages/alignment/src/landxml/xml.ts` (navigácia v strome), zvyšok kódu
s knižnicou priamo nepracuje. Hodnoty sa čítajú ako reťazce a čísla parsuje náš kód, aby neplatná hodnota
skončila typovanou chybou, nie tichým `NaN`.

## Dôsledky

- Výmena knižnice sa dotkne jedného súboru.
- Veľké LandXML (terén s miliónmi bodov) môžu vyžadovať prúdové čítanie; rieši sa vo Fáze 5b.
