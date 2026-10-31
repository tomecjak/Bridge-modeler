import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearAccessKeys, identify } from '../src/access.ts';
import worker, { type Env } from '../src/index.ts';
import { testDatabase } from './d1.ts';

const TEAM = 'firma.cloudflareaccess.com';
const AUD = 'aud-123';

const b64url = (data: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? data : new Uint8Array(data)).toString('base64url');

let signer: CryptoKey;
let other: CryptoKey;
let jwks: { keys: (JsonWebKey & { kid: string })[] };
beforeAll(async () => {
  const alg = {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  };
  const pair = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  const foreign = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  signer = pair.privateKey;
  other = foreign.privateKey;
  jwks = {
    keys: [
      { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid: 'k1' },
    ],
  };
});
beforeEach(() => clearAccessKeys());

async function token(claims: Record<string, unknown>, key = signer, kid = 'k1') {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { aud: [AUD], email: 'jakub@firma.sk', exp: now + 600, iss: `https://${TEAM}` };
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
let fetched = 0;
const fakeFetch = (async (url: string) => {
  fetched++;
  expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify(jwks));
}) as typeof fetch;
const request = (jwt?: string) =>
  new Request('https://x/api/me', jwt ? { headers: { 'Cf-Access-Jwt-Assertion': jwt } } : {});

describe('identify (Cloudflare Access)', () => {
  it('accepts a valid token and caches the team keys', async () => {
    fetched = 0;
    expect(await identify(request(await token(good)), env, fakeFetch)).toEqual({
      ok: true,
      email: 'jakub@firma.sk',
    });
    await identify(request(await token(good)), env, fakeFetch);
    expect(fetched).toBe(1);
  });

  it('rejects a missing token, a wrong audience or issuer, an expired token and a foreign signature', async () => {
    const reject = async (r: Request) => (await identify(r, env, fakeFetch)).ok;
    expect(await reject(request())).toBe(false);
    expect(await reject(request(await token({ ...good, aud: ['iné'] })))).toBe(false);
    expect(
      await reject(request(await token({ ...good, iss: 'https://zly.cloudflareaccess.com' }))),
    ).toBe(false);
    expect(await reject(request(await token({ ...good, exp: now - 10 })))).toBe(false);
    expect(await reject(request(await token(good, other)))).toBe(false);
    expect(await reject(request(await token(good, signer, 'neznamy')))).toBe(false);
    expect(await reject(request('nie.je.jwt'))).toBe(false);
  });

  it('uses local@dev without an Access audience (local wrangler dev)', async () => {
    expect(await identify(request(), {}, fakeFetch)).toEqual({ ok: true, email: 'local@dev' });
  });

  it('makes the worker answer API calls without a valid token with 401', async () => {
    const e = { ...env, DB: testDatabase(), ASSETS: {} as Fetcher } as Env;
    const r = await worker.fetch(request() as Parameters<typeof worker.fetch>[0], e);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: 'Unauthorized' });
  });
});
