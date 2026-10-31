import { describe, expect, it, vi } from 'vitest';
import worker, { type Env, handleApi } from '../src/index.ts';

const env = {
  ASSETS: { fetch: async () => new Response('index') },
} as unknown as Env;

describe('worker routing', () => {
  it('answers the health check and unknown API paths as JSON', async () => {
    const ok = await handleApi(new Request('https://x/api/health'), env, 'local@dev');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const missing = await handleApi(new Request('https://x/api/nic'), env, 'local@dev');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'NotFound' });
  });

  it('serves everything outside /api from the static assets', async () => {
    const r = await worker.fetch(new Request('https://x/plan'), env);
    expect(await r.text()).toBe('index');
  });

  it('turns a failing database into a JSON 500 with a readable message', async () => {
    const broken = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('D1_ERROR');
        },
      },
    } as unknown as Env;
    const output = (globalThis as unknown as { console: { error: (...a: unknown[]) => void } })
      .console;
    const quiet = vi.spyOn(output, 'error').mockImplementation(() => undefined);
    const r = await worker.fetch(new Request('https://x/api/library'), broken);
    quiet.mockRestore();
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ code: 'ServerError' });
  });
});
