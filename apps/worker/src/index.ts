/// Cloudflare Worker (ADR 0015): API `/api/*`; ostatné požiadavky obslúžia statické súbory aplikácie.
import { type ApiError, deleteEntry, getEntry, listEntries, saveEntry } from './library.ts';

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

/** API: `/api/health`, `/api/me` a firemná knižnica prierezov `/api/library[/:id]` (ADR 0015). */
export async function handleApi(request: Request, env: Env, user: string): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/health') return json({ ok: true });
  if (path === '/api/me') return json({ email: user });
  if (path === '/api/library') {
    if (request.method !== 'GET') return methodNotAllowed();
    return json({ entries: await listEntries(env.DB) });
  }
  const m = /^\/api\/library\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1] as string);
    if (request.method === 'GET') {
      const e = await getEntry(env.DB, id);
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
      const r = await saveEntry(env.DB, id, body, user, new Date().toISOString());
      return r.ok ? json(r.value, r.status) : fail(r.error);
    }
    if (request.method === 'DELETE') {
      const v = url.searchParams.get('version');
      const r = await deleteEntry(env.DB, id, v === null ? undefined : Number(v));
      return r.ok ? new Response(null, { status: 204 }) : fail(r.error);
    }
    return methodNotAllowed();
  }
  return fail({ status: 404, code: 'NotFound', message: 'Neznáma adresa API.' });
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
    // identitu z Cloudflare Access doplní ďalší krok (ADR 0015); lokálne local@dev
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, 'local@dev');
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
