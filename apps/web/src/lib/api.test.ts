import { afterEach, expect, it, vi } from 'vitest';
import { getHealth } from './api';
afterEach(() => vi.unstubAllGlobals());
it('validates successful API responses', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', service: 'fieldops-api' })))); expect(await getHealth()).toEqual({ status: 'ok', service: 'fieldops-api' }); });
it('rejects invalid contracts', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'unexpected' })))); await expect(getHealth()).rejects.toThrow(); });
it('rejects unsuccessful responses', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 }))); await expect(getHealth()).rejects.toThrow(); });
