# 0001 — Stack a nástroje

- Stav: Prijaté
- Dátum: 2026-10-29

## Kontext

Aplikácia beží v prehliadači bez backendu (predpoklad MVP). Výpočtové balíky musia bežať
v prehliadači, vo Web Workeri aj v Node (testy) — princíp 5 v `CLAUDE.md`. Projekt vyvíja
jeden človek s Claude Code, takže nástroje majú byť jednoduché, rýchle a s minimom konfigurácie.

## Rozhodnutie

**Monorepo a jazyk**
- pnpm workspaces (`apps/*`, `packages/*`), `packageManager: pnpm@12.6.0`, Node ≥ 24 (`.nvmrc` = 24 LTS).
- TypeScript, ESM (`"type": "module"`). Spoločný `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `moduleResolution: "bundler"`, `ES2023`.
- Balíky v `packages/*` majú `lib` **bez `DOM`** — prístup k `window`/`document` je chyba kompilácie
  (princíp 5 vynútený nástrojom, nie len dohodou). `apps/web` má `DOM`.
- *Doplnené 2026-10-30:* `erasableSyntaxOnly` — len syntax, ktorú Node vie spustiť odstránením typov
  (bez parametrických vlastností, `enum`, `namespace`), aby skripty v `tools/` mohli importovať balíky priamo.
- Interné balíky sa nebuildujú: `"exports": { ".": "./src/index.ts" }`. Vite aj Vitest čítajú TS priamo.
  Ak bude niekedy treba balík publikovať, pridá sa build krok.
- Typecheck: `pnpm -r typecheck` → `tsc --noEmit` v každom balíku. Project references sa pridajú, ak to bude pomalé.
- Balíky majú scope `@bridge/*` (pracovný; premenuje sa po rozhodnutí o názve projektu).

**Vrstvenie balíkov** (šípka = „závisí od“; závislosti `workspace:*` sa pridávajú až pri prvom použití)

```
geom ← alignment
expr ← model ← sections ← mesh, drawing
                 alignment, mesh ← ifc
apps/web → všetky balíky
```

Cyklické závislosti medzi balíkmi sú zakázané.

**Nástroje**
- Lint + format: **Biome** (jediná dev závislosť pre lint aj formátovanie, rýchly, jedna konfigurácia).
  `noExplicitAny` je chyba; výnimka iba cez `// biome-ignore lint/suspicious/noExplicitAny: <dôvod>`,
  čo napĺňa pravidlo „žiadne `any` bez komentára prečo“. Nevýhoda oproti typescript-eslint:
  chýbajú pravidlá s typovou informáciou (napr. `no-floating-promises`); ak budú chýbať, rozhodne nový ADR.
- Testy: Vitest, koreňový `vitest.config.ts` s `test.projects` (každý balík a `apps/web` ako projekt), prostredie `node`.
  Playwright pre e2e neskôr.
- CI: GitHub Actions — `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`.

**UI a ďalší stack** (zo `PLAN.md`, sekcia 2): Vite, React, Zustand + immer patches pre undo/redo, zod,
three.js cez @react-three/fiber, Web Worker + Comlink, fast-xml-parser. Každá z týchto knižníc
okrem Reactu sa pridá až vo fáze, kde sa použije, s doplnením tohto ADR alebo novým ADR (licencia, veľkosť).

**Runtime závislosti pridané teraz**

| Balík | Kde | Dôvod | Licencia | Veľkosť (min+gzip) |
|---|---|---|---|---|
| `react` | apps/web | UI | MIT | ≈ 3 kB |
| `react-dom` | apps/web | UI | MIT | ≈ 55 kB |

Dev závislosti (nejdú do bundlu): `typescript`, `vitest`, `@biomejs/biome`, `vite`, `@vitejs/plugin-react`, `@types/*`.

## Dôsledky

- Jeden príkaz z koreňa (`pnpm typecheck && pnpm lint && pnpm test`) overí celý repozitár; CI robí to isté.
- Nový balík = `package.json` + `tsconfig.json` (extends base) + `src/index.ts` + test; Vitest ho nájde automaticky.
- Zmena verzie Node alebo pnpm sa robí na jednom mieste (`.nvmrc`, `packageManager`).
