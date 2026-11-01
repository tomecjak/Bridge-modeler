/// Cloudflare Worker (ADR 0015, 0019): API `/api/*`; ostatné požiadavky obslúžia statické súbory aplikácie.
import { identify } from './access.ts';
import {
  type ApiError,
  deleteEntry,
  getEntry,
  type LibraryTable,
  listEntries,
  PROFILE_TABLE,
  SUPPORT_TABLE,
  saveEntry,
} from './library.ts';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** tím Cloudflare Access, napr. `firma.cloudflareaccess.com`; prázdne = lokálny vývoj */
  ACCESS_TEAM_DOMAIN?: string;
  /** AUD aplikácie Access; prázdne = lokálny vývoj (používateľ local@dev) */
  ACCESS_AUD?: string;
}

/** Odpoveď JSON so stavom. */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Najväčšie telo požiadavky [B] — prierez má jednotky kB. */
const MAX_BODY = 1_000_000;

const fail = (e: ApiError) => {
  const { status, ...body } = e;
  return json(body, status);
};

/** Firemné knižnice: adresa API → tabuľka (ADR 0015, 0019). */
const LIBRARIES: readonly [string, LibraryTable<{ id: string; name: string }>][] = [
  ['/api/library', PROFILE_TABLE],
  ['/api/support-library', SUPPORT_TABLE],
];

/**
 * API: `/api/health`, `/api/me`, firemná knižnica prierezov `/api/library[/:id]` (ADR 0015) a podpier
 * `/api/support-library[/:id]` (ADR 0019).
 */
export async function handleApi(request: Request, env: Env, user: string): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/health') return json({ ok: true });
  if (path === '/api/me') return json({ email: user });
  for (const [prefix, table] of LIBRARIES) {
    if (path === prefix) {
      if (request.method !== 'GET') return methodNotAllowed();
      return json({ entries: await listEntries(env.DB, table) });
    }
    if (!path.startsWith(`${prefix}/`)) continue;
    const rest = path.slice(prefix.length + 1);
    if (rest.length === 0 || rest.includes('/')) break;
    return entryRoute(request, env, user, table, decodeURIComponent(rest), url);
  }
  return fail({ status: 404, code: 'NotFound', message: 'Neznáma adresa API.' });
}

/** Jedna položka knižnice: GET, PUT (s očakávanou verziou), DELETE (`?version=`). */
async function entryRoute(
  request: Request,
  env: Env,
  user: string,
  table: LibraryTable<{ id: string; name: string }>,
  id: string,
  url: URL,
): Promise<Response> {
  if (request.method === 'GET') {
    const e = await getEntry(env.DB, table, id);
    return e ? json(e) : fail(notFound());
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BODY) {
      return fail({ status: 413, code: 'TooLarge', message: 'Položka je príliš veľká.' });
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail({ status: 400, code: 'InvalidJson', message: 'Telo požiadavky nie je JSON.' });
    }
    const r = await saveEntry(env.DB, table, id, body, user, new Date().toISOString());
    return r.ok ? json(r.value, r.status) : fail(r.error);
  }
  if (request.method === 'DELETE') {
    const v = url.searchParams.get('version');
    const r = await deleteEntry(env.DB, table, id, v === null ? undefined : Number(v));
    return r.ok ? new Response(null, { status: 204 }) : fail(r.error);
  }
  return methodNotAllowed();
}

const notFound = (): ApiError => ({
  status: 404,
  code: 'NotFound',
  message: 'Položka v knižnici neexistuje.',
});
const methodNotAllowed = () =>
  fail({ status: 405, code: 'MethodNotAllowed', message: 'Nepodporovaná metóda.' });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const who = await identify(request, env);
      if (!who.ok) return json({ code: who.code, message: who.message }, 401);
      try {
        return await handleApi(request, env, who.email);
      } catch (e) {
        // chyba databázy alebo kódu: záznam do logov Workera, projektantovi zrozumiteľná hláška
        console.error(e);
        return json(
          { code: 'ServerError', message: 'Chyba servera knižnice. Skúste to znova.' },
          500,
        );
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
