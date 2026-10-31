/**
 * Identita z Cloudflare Access (ADR 0015): Access stojí pred Workerom a do požiadavky pridá podpísaný JWT
 * `Cf-Access-Jwt-Assertion`. Worker ho overí sám (obrana do hĺbky): RS256 cez WebCrypto, kľúče tímu Access
 * (s cache), `aud`, vydavateľ a expirácia. Bez `ACCESS_AUD` (lokálny `wrangler dev`) je používateľ `local@dev`.
 */

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type Identity =
  | { ok: true; email: string }
  | { ok: false; code: 'Unauthorized'; message: string };

/** Ako dlho sa držia kľúče tímu Access [ms] (Access ich strieda zriedka, pri neznámom `kid` sa načítajú znova). */
const KEYS_TTL = 60 * 60 * 1000;
const keyCache = new Map<string, { at: number; keys: Map<string, CryptoKey> }>();

/** Vyprázdni cache kľúčov (testy). */
export function clearAccessKeys(): void {
  keyCache.clear();
}

const deny = (message: string): Identity => ({ ok: false, code: 'Unauthorized', message });

function decode(part: string): Uint8Array {
  const b64 = part
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(part.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const decodeJson = (part: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decode(part)));

async function teamKeys(
  team: string,
  fetchFn: typeof fetch,
  refresh: boolean,
): Promise<Map<string, CryptoKey>> {
  const cached = keyCache.get(team);
  if (cached && !refresh && Date.now() - cached.at < KEYS_TTL) return cached.keys;
  const r = await fetchFn(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Access certs ${r.status}`);
  const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    map.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    );
  }
  keyCache.set(team, { at: Date.now(), keys: map });
  return map;
}

/** Overí JWT z Access a vráti e-mail používateľa. */
export async function identify(
  request: Request,
  env: AccessEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Identity> {
  if (!env.ACCESS_AUD) return { ok: true, email: 'local@dev' };
  const team = env.ACCESS_TEAM_DOMAIN;
  if (!team) return deny('Chýba nastavenie tímu Cloudflare Access.');
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return deny('Chýba prihlásenie cez Cloudflare Access.');
  const parts = jwt.split('.');
  if (parts.length !== 3) return deny('Neplatný token prihlásenia.');
  const [head, body, sig] = parts as [string, string, string];
  try {
    const header = decodeJson(head);
    const claims = decodeJson(body);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      return deny('Nepodporovaný token.');
    }
    let key = (await teamKeys(team, fetchFn, false)).get(header.kid);
    key ??= (await teamKeys(team, fetchFn, true)).get(header.kid);
    if (!key) return deny('Neznámy kľúč tokenu.');
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decode(sig),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!valid) return deny('Neplatný podpis tokenu.');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(env.ACCESS_AUD)) return deny('Token nie je pre túto aplikáciu.');
    if (claims.iss !== `https://${team}`) return deny('Token vydal iný tím Access.');
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      return deny('Prihlásenie vypršalo.');
    }
    if (typeof claims.email !== 'string') return deny('Token neobsahuje e-mail.');
    return { ok: true, email: claims.email };
  } catch {
    return deny('Neplatný token prihlásenia.');
  }
}
