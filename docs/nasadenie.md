# Nasadenie na Cloudflare

Aplikácia beží ako jeden Cloudflare Worker (ADR 0015):
- statické súbory = build `apps/web`;
- API firemnej knižnice prierezov nad databázou D1;
- prístup chráni Cloudflare Access.

Nasadzuje sa automaticky pri každom pushnutí do `main`. Konfigurácia je v `apps/worker/wrangler.jsonc`.

Kroky 1 – 4 sa robia raz, v účte Cloudflare.

## 1. Databáza D1

```sh
pnpm install
cd apps/worker
npx wrangler login
npx wrangler d1 create modeler-mostov
```

Príkaz vypíše `database_id`. Vlož ho do `apps/worker/wrangler.jsonc` (`d1_databases[0].database_id`) a commitni.
Tabuľky vytvorí nasadenie samo (`wrangler d1 migrations apply`).

## 2. Napojenie GitHubu (Workers Builds)

V dashboarde: **Workers & Pages → Create → Import a repository → GitHub → `tomecjak/Bridge-modeler`**.

| Nastavenie | Hodnota |
|---|---|
| Project name | `modeler-mostov` (musí sa zhodovať s `name` vo `wrangler.jsonc`) |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `pnpm deploy` (migrácie D1 a `wrangler deploy`) |
| Build variables | `NODE_VERSION` = `24` (projekt vyžaduje Node 24+) |

Ak build nenájde správnu verziu pnpm, pridaj premennú `PNPM_VERSION` = `12.6.0`. Ak krok migrácií hlási chybu
oprávnenia, pridaj tokenu buildov (Settings → Builds → API token) oprávnenie **D1: Edit**.

## 3. Cloudflare Access

1. **Worker `modeler-mostov` → Settings → Domains & Routes → `workers.dev` → Enable Cloudflare Access.**
2. V **Zero Trust → Access → Applications** otvor vytvorenú aplikáciu a uprav politiku:
   - Action: Allow;
   - Include: Emails (zoznam) alebo Emails ending in (napr. `@firma.sk`);
   - prihlásenie jednorazovým kódom e-mailom funguje bez ďalšieho nastavenia.
3. Do `apps/worker/wrangler.jsonc` doplň a commitni:
   - `ACCESS_TEAM_DOMAIN`: doména tímu, napr. `firma.cloudflareaccess.com` (Zero Trust → Settings → Custom pages,
     „Team domain“);
   - `ACCESS_AUD`: Application Audience (AUD) Tag z prehľadu aplikácie Access.

Kým tieto hodnoty chýbajú, nasadený Worker firemnú knižnicu odmietne (`401`) a aplikácia ju nezobrazí.
Zvyšok aplikácie funguje.

## 4. Prvé nasadenie

Pushni `main`. Build v **Workers & Pages → modeler-mostov → Deployments** má prejsť krokmi:
- inštalácia;
- `pnpm build`;
- migrácie;
- nasadenie.

Aplikácia je na `https://modeler-mostov.<účet>.workers.dev`.

**Kontrola:**
- Otvorenie adresy v anonymnom okne vyžiada prihlásenie Access.
- Po prihlásení: záložka Prierez → Knižnica prierezov → „Firemná knižnica (prihlásený …)“.
- Ulož prierez z projektu. Kolega ho uvidí po otvorení knižnice.
- Ak obaja zmenia tú istú položku, druhý dostane hlášku o konflikte a knižnica sa znova načíta.

## Lokálny vývoj

```sh
pnpm dev:worker      # build aplikácie, migrácie lokálnej D1 a Worker na http://127.0.0.1:8787
```

Pre vývoj s okamžitým obnovovaním (HMR) spusti v jednom termináli `pnpm --filter @bridge/worker dev`
a v druhom `pnpm dev`. Vite presmeruje `/api` na Worker. Bez Workera aplikácia funguje a firemná knižnica sa skryje.
Lokálne je používateľ `local@dev` a dáta sú v `apps/worker/.wrangler` (neverzuje sa).
