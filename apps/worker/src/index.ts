/// Cloudflare Worker (ADR 0015): API `/api/*`; ostatné požiadavky obslúžia statické súbory aplikácie.

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

export async function handleApi(request: Request, _env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true });
  return json({ code: 'NotFound', message: 'Neznáma adresa API.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
