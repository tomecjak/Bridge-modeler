# 0012 — 2D pohľady a export SVG / DXF

- Stav: Prijaté
- Dátum: 2026-10-31

## Kontext

Fáza 6 má dať pôdorys, rozvinutý pozdĺžny rez a priečny rez mosta do AutoCADu. Projektant rozhodol (2026-10-31):
nástroj slúži na prípravnú fázu, **výkresy sa v ňom nevytvárajú** (bez listov, rámikov a kót). Obsah sa zobrazuje
priamo v existujúcich pohľadoch a ich geometria sa exportuje do SVG a DXF, kde sa výkres dokončí. DXF je **všade
v metroch**, pôdorys voliteľne v S-JTSK, aby lícoval s podkladom z Civil 3D.

## Rozhodnutie

**Výkresový model** (`packages/drawing`, čistý TS): entity `polyline` a `text` v metroch na pevných hladinách
a mierka výkresu (výška písma 2,5 mm, vzory čiar). Zostavy `planDrawing`, `profileDrawing` a `sectionDrawing` berú
geometriu vypočítanú z parametrov (`packages/sections`: vzorky NK spoločné s 3D, rez NK a podpier v osi mosta,
obrys NK v pôdoryse; princíp 4). Pohľady v aplikácii kreslia tie isté entity, takže export zodpovedá zobrazeniu.

| Výkres | x | y | Mierka |
|---|---|---|---|
| pôdorys | E (lokálne alebo S-JTSK, záporné) | N | 1 : 200 |
| pozdĺžny rez | spojité staničenie osi cesty [m] | m n. m., **1 : 1 bez prevýšenia** | 1 : 200 |
| priečny rez | odsadenie od osi cesty vpravo [m] | m n. m. | 1 : 100 |

**Hladiny** (pevná sada, kým nebude firemný štandard): `OS_CESTY`, `OS_MOSTA`, `OS_PODPERY`, `STANICENIE`, `NK`,
`NK_DUTINY`, `PODPERY`, `ZAKLADY`, `LOZISKA`, `TEREN`, `NIVELETA`, `POPIS`; farby ACI a typy čiar CONTINUOUS / DASHED /
CENTER v `layers.ts`.

**DXF: vlastný zapisovač, nie knižnica.** Treba len LWPOLYLINE, TEXT, hladiny a typy čiar. Knižnica
(`@tarikjabiri/dxf`, MIT, 442 kB rozbalená) by bola runtime závislosť pre pár desiatok riadkov kódu. Zapisovač píše
ASCII DXF R2000 (AC1015):
- `$INSUNITS = 6` (m), `$EXTMIN` / `$EXTMAX` a pohľad `*Active` na celý výkres;
- všetkých 9 tabuliek (LTYPE, LAYER, STYLE Standard s arial.ttf, APPID ACAD, DIMSTYLE Standard, BLOCK_RECORD) a bloky
  `*Model_Space` / `*Paper_Space`;
- sekcia OBJECTS s koreňovým slovníkom a ACAD_GROUP;
- handle sa prideľujú postupne (deterministický výstup); diakritika ako `\U+XXXX`;
- vzory čiar v metroch pre mierku výkresu (`$LTSCALE` = 1).

**SVG**: samostatný súbor v mierke výkresu (rozmer v mm na papieri, `viewBox` v metroch), skupina pre každú hladinu.

**Kontrola**: unit testy štruktúry a `tools/validate_dxf.py` (ezdxf `audit`, len vývojový nástroj v Pythone
v `tools/.venv`, nie runtime závislosť) nad vzorovými výkresmi mosta 212-00 (`pnpm drawings:samples`).

## Dôsledky

- Otvorenie v AutoCADe a lícovanie pôdorysu s Civil 3D overí projektant. Ak AutoCAD súbor odmietne, prejde sa
  na knižnicu (nový ADR).
- Kóty, šrafy, rámik a pečiatka sa robia v AutoCADe; pozdĺžny rez sa prípadne prevýši tam (export je 1 : 1).
- Zmena názvov hladín na firemný štandard je zmena tabuľky `LAYERS`.
- Zostavy bežia v hlavnom vlákne; ak budú pri dlhých mostoch spomaľovať úpravy, presunú sa do workera 3D.
