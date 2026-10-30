# 0005 — Schéma projektu a stav aplikácie (zod, zustand, immer)

- Stav: Prijaté
- Dátum: 2026-10-30

## Kontext

Fáza 2 zavádza projektový súbor (ADR 0002) a prvé editory. Súbor treba pri otvorení validovať so
zrozumiteľnými chybami a schému publikovať ako JSON Schema. UI potrebuje jeden zdroj stavu projektu
s príkazmi a späť/znova od prvého editora, aby sa neskôr nemusel prerábať.

## Rozhodnutie

| Balík | Kde | Verzia | Licencia | Veľkosť (min+gzip) | Dôvod |
|---|---|---|---|---|---|
| zod | `packages/model` | 4.6.7 | MIT | ≈ 15 kB (časť, ktorú používame, menej) | schéma = typy + validácia s cestou k chybe; `z.toJSONSchema` pre export JSON Schema; beží v Node aj v prehliadači |
| zustand | `apps/web` | 5.0.16 | MIT | ≈ 1 kB | malý store bez boilerplate, selektory pre React |
| immer | `apps/web` | 11.2.9 | MIT | ≈ 5 kB | nemenné úpravy projektu a `produceWithPatches` → späť/znova ako zoznam patchov |

- Projekt v store je nemenný objekt `ProjectFile`; mení sa výhradne príkazmi (`dispatch`), každý príkaz
  uloží patche a inverzné patche do histórie. Výpočty dostávajú nemenný snapshot.
- Zod je len v `packages/model` (validácia na hranici súbor ↔ model). Výpočtové balíky pracujú s typmi
  odvodenými zo schémy, nie so zod objektmi.
- Verzie sú presne pripnuté.

## Dôsledky

- Nová časť modelu = rozšírenie zod schémy + migrácia + príkazy v store.
- Späť/znova funguje automaticky pre každý príkaz; netreba písať inverzné operácie ručne.
- Store je jediné miesto, kde UI mení model — ľahko sa pridá autosave a neskôr synchronizácia.
