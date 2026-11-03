# 0025 — Vzhľad: tokeny farieb, svetlá a tmavá téma, písmo IBM Plex

- Stav: Prijaté
- Dátum: 2026-11-02

## Kontext

Projektant chcel moderný vzhľad aplikácie. Návrh vznikol ako plátno s tromi obrazovkami v tmavej aj svetlej
verzii: pracovná plocha s 3D, 2D výkresy a parametre so staničnou funkciou. Rozloženie z ADR 0016 (ribbon,
prehliadač projektu, vlastnosti) sa nemení, mení sa len vzhľad.

Doteraz bola téma len podľa systému (`prefers-color-scheme`). Farby boli v `styles.css` rozdelené do
niekoľkých blokov `:root`. Akcent (modrý) slúžil naraz na výber aj na os cesty.

## Rozhodnutie

- **Tokeny farieb** sú v jednom bloku na začiatku `apps/web/src/styles.css`. Svetlá téma je v `:root`, tmavá
  téma v `:root[data-theme="dark"]` a pri systémovej tmavej téme v `:root:not([data-theme="light"])`.
- **Akcent je jantárový** (`--accent`) a označuje výber, aktívny nástroj a hlavné tlačidlo.
  Os cesty má vlastnú modrú (`--axis-line`), aj v 3D scéne.
  - `--accent-text`: tmavší odtieň na text, aby mal kontrast aspoň 4,5 : 1.
  - `--on-accent`: farba textu na akcentovom pozadí.
- **Farby prvkov mosta** vo výkresoch sú tokeny podľa typu konštrukcie (doplnené 2026-11-03):
  - NK `--el-deck` je oceľovosivá, rímsy `--el-edge-beam` svetlejší betón, podpery `--el-support` teplá
    betónová, ložiská `--el-bearing` tyrkysová;
  - obrys je vo farbe textu, vybraný prvok má jantárovú výplň `--el-selected` a obrys `--accent`;
  - os mosta a niveleta sú modré ako os cesty (`--axis-line`), grafy priebehov používajú akcent.
- **Voľba témy** v hornej lište sa prepína v poradí systém → svetlá → tmavá.
  - Ukladá sa do `localStorage` ako nastavenie prehliadača, nie do projektu (princíp 1 v `CLAUDE.md`).
  - Nastavuje sa na `<html data-theme>`. 3D scéna si po udalosti `bridge-theme-change` prečíta nové farby.
- **Písmo** je IBM Plex Sans na rozhranie a IBM Plex Mono na čísla (stavový riadok, výrazy).
  - Načítava sa z Google Fonts odkazom v `index.html`; ide o licenciu SIL Open Font License 1.1.
  - Do balíka sa nepridáva žiadny npm balík. Prenáša sa asi 60–90 kB woff2 pre použité rezy.
  - Bez pripojenia sa použije systémové písmo (`--font-sans`, `--font-mono`), rozhranie funguje ďalej.

## Dôsledky

- Nová farba = nový token v oboch témach. Komponenty nepoužívajú pevné hex hodnoty.
- Svetlú aj tmavú tému treba pri zmene vzhľadu skontrolovať obe.
- Načítanie písma je požiadavka na externú doménu. Ak to bude prekážať (offline, súkromie), písmo sa pribalí
  do `apps/web/public` bez zmeny CSS okrem `@font-face`.
