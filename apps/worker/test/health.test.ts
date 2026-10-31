import { describe, expect, it } from 'vitest';
import worker, { type Env, handleApi } from '../src/index.ts';

const env = {
  ASSETS: { fetch: async () => new Response('index') },
} as unknown as Env;

describe('worker routing', () => {
  it('answers the health check and unknown API paths as JSON', async () => {
    const ok = await handleApi(new Request('https://x/api/health'), env);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const missing = await handleApi(new Request('https://x/api/nic'), env);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'NotFound' });
  });

  it('serves everything outside /api from the static assets', async () => {
    const r = await worker.fetch(new Request('https://x/plan'), env);
    expect(await r.text()).toBe('index');
  });
});
