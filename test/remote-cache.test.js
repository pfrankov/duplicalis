import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { loadCache, modelKey, saveCache } from '../src/cache.js';
import { loadConfig } from '../src/config.js';
import { parseFile } from '../src/parser.js';
import { embedComponents } from '../src/similarity.js';

const endpoint = 'https://provider.example/v1/embeddings';
const keyFor = (remote) => modelKey({ model: 'remote', remote });

describe('remote embedding cache', () => {
  it.each([
    'https://other.example/v1/embeddings',
    'https://provider.example/deployments/other/embeddings',
    'https://provider.example/v1/embeddings?deployment=other',
    'https://provider.example:8443/v1/embeddings',
    'http://provider.example/v1/embeddings',
  ])('separates the same model at %s', (url) => {
    expect(keyFor({ url, model: 'shared-model' })).not.toBe(
      keyFor({ url: endpoint, model: 'shared-model' })
    );
  });

  it.each([
    undefined,
    '',
    'https://api.openai.com',
    'https://api.openai.com/',
    'https://api.openai.com/v1',
    'https://api.openai.com/v1/',
    'https://API.OPENAI.COM:443/v1/embeddings/',
  ])('reuses the normalized default endpoint for %s', (url) => {
    expect(keyFor({ url, model: 'm' })).toBe(
      keyFor({ url: 'https://api.openai.com/v1/embeddings', model: 'm' })
    );
  });

  it('distinguishes models without persisting endpoint secrets', () => {
    const url = 'https://test-user:test-password@provider.example/v1?token=test-token';
    const key = keyFor({ url, model: 'm', apiKey: 'test-api-key' });
    expect(key).toMatch(/^remote:[a-f0-9]{64}$/);
    expect(key).not.toBe(keyFor({ url, model: 'other' }));
    expect(key).toBe(keyFor({ url, model: 'm', apiKey: 'rotated-key', timeoutMs: 1000 }));
    expect(key).not.toBe(keyFor({ url: url.replace('test-token', 'other-token'), model: 'm' }));
    expect(keyFor()).toBe(keyFor({ model: '' }));
  });

  it('re-embeds after an endpoint switch and reuses each endpoint separately', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-remote-cache-'));
    const config = loadConfig({
      root: path.resolve('examples'),
      model: 'remote',
      remote: { url: endpoint, model: 'shared-model' },
      cachePath: path.join(dir, 'cache.json'),
      cleanProbability: 0,
      showProgress: false,
    });
    const components = parseFile(path.resolve('examples/CardA.tsx'), config).components;
    const first = { embed: vi.fn(async () => [1, 0]) };
    await embedComponents(components, first, config);

    const secondConfig = {
      ...config,
      remote: { ...config.remote, url: 'https://other.example/v1/embeddings?token=test-token' },
    };
    const second = { embed: vi.fn(async () => [0, 1, 0]) };
    const result = await embedComponents(components, second, secondConfig);
    expect(result.cacheStats.misses).toBe(components.length);
    expect(result.entries[0].codeVec).toEqual([0, 1, 0]);
    expect(second.embed).toHaveBeenCalled();

    second.embed.mockClear();
    const repeated = await embedComponents(components, second, secondConfig);
    expect(repeated.cacheStats.hits).toBe(components.length);
    expect(second.embed).not.toHaveBeenCalled();

    first.embed.mockClear();
    const original = await embedComponents(components, first, config);
    expect(original.cacheStats.hits).toBe(components.length);
    expect(original.entries[0].codeVec).toEqual([1, 0]);
    expect(first.embed).not.toHaveBeenCalled();
    expect(JSON.stringify(loadCache(config.cachePath))).not.toContain('test-token');
  });

  it('does not reuse legacy remote entries with an unknown endpoint', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-remote-legacy-'));
    const config = loadConfig({
      root: path.resolve('examples'),
      model: 'remote',
      remote: { url: endpoint, model: 'shared-model' },
      cachePath: path.join(dir, 'cache.json'),
      cleanProbability: 0,
      showProgress: false,
    });
    const components = parseFile(path.resolve('examples/CardA.tsx'), config).components;
    await embedComponents(components, { embed: async () => [1, 0] }, config);
    const cache = loadCache(config.cachePath);
    const [entry] = Object.values(cache.entries);
    cache.entries = { [`remote:shared-model:${components[0].id}`]: entry };
    saveCache(config.cachePath, cache);

    const backend = { embed: vi.fn(async () => [0, 1, 0]) };
    const result = await embedComponents(components, backend, config);
    expect(result.cacheStats.hits).toBe(0);
    expect(result.entries[0].codeVec).toEqual([0, 1, 0]);
    expect(backend.embed).toHaveBeenCalled();
  });
});
