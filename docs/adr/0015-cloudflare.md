# 0015 — Nasadenie na Cloudflare: Worker so statickými súbormi, D1 a Access

- Stav: Prijaté, doplnené ADR 0019 (firemná knižnica podpier v D1)
- Dátum: 2026-10-31

## Kontext

Aplikácia bola doteraz statický web bez backendu (PLAN.md §7). Po Fáze 8 ju projektant chce nasadiť na Cloudflare
s databázou. Rozhodnutia z 2026-10-31:
- v databáze je len firemná knižnica prierezov, projekty ostávajú ako súbory a v prehliadači;
- prístup cez Cloudflare Access;
- nasadenie automaticky z GitHubu;
- adresa `*.workers.dev`.

Rozhranie `ProfileLibrary` je od Fázy 8b asynchrónne práve kvôli databáze (ADR 0013).

## Rozhodnutie

**Jeden Worker so statickými súbormi** (`apps/worker`):
- statické súbory sú build `apps/web/dist` v režime jednostránkovej aplikácie;
- API `/api/*` je v tom istom Workeri;
- jedna doména a jedno nasadenie, Access chráni aplikáciu aj API;
- súbor WASM OpenCascade (21,2 MB) je pod limitom 25 MiB na súbor.

Statické súbory Workera odporúča Cloudflare namiesto Pages a v rovnakom projekte dovoľujú API aj D1.

**D1** — tabuľka `profile_library`:
- jeden riadok = jedna `LibraryEntry`, prierez je uložený ako JSON overený `LibraryEntrySchema`;
- každý riadok má `version` a záznam, kto a kedy ho vytvoril a zmenil;
- uloženie s `expectedVersion` vráti pri nesúhlase `409`, takže kolegovia si neprepíšu zmeny potichu;
- migrácie sú SQL súbory v `apps/worker/migrations` a pri nasadení sa spúšťajú `wrangler d1 migrations apply`.

**Identita:**
- Access stojí pred Workerom, Worker navyše overí JWT `Cf-Access-Jwt-Assertion`:
  - RS256 cez WebCrypto, kľúče z certifikátov tímu Access (s cache);
  - kontrola `aud` a expirácie.
- E-mail z tokenu sa zapisuje do knižnice.
- Na JWT sa nepoužije knižnica, je to ~60 riadkov nad štandardným WebCrypto. Bez `ACCESS_AUD` (lokálny
  `wrangler dev`) je používateľ `local@dev`.

**Nástroje (vývojové, nie runtime v prehliadači):**

| Balík | Kde | Dôvod | Licencia |
|---|---|---|---|
| `wrangler` 4.156.0 | apps/worker (dev) | lokálny Worker s D1, migrácie, nasadenie | MIT OR Apache-2.0 |
| `@cloudflare/workers-types` | apps/worker (dev) | typy prostredia Workera | MIT OR Apache-2.0 |

Runtime Workera tvorí len `@bridge/model` (zod). Testy API bežia vo Vitest/Node: zabudovaný `node:sqlite` nahrádza
D1 a spúšťa skutočnú migráciu.

**Nasadenie:** Cloudflare Workers Builds napojené na `tomecjak/Bridge-modeler` (main). Build je `pnpm build`,
nasadenie `pnpm --filter @bridge/worker deploy` (migrácie a potom `wrangler deploy`). Nastavenie účtu popisuje
`docs/nasadenie.md`.

## Dôsledky

- Rozhodnutie „Hosting: statický web bez backendu“ sa mení. Aplikácia funguje ďalej aj bez Workera (`pnpm dev`),
  firemná knižnica sa vtedy len skryje.
- Projekty v cloude (R2) a vlastná doména sú v backlogu.
- `database_id` D1 a údaje Access (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) sú konfigurácia účtu, nie tajomstvá. Patria
  do `wrangler.jsonc`.
