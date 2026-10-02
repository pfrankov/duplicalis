import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { loadCache, saveCache, modelKey, fingerprintRepresentation } from '../src/cache.js';
import { embedComponents } from '../src/similarity.js';
import { parseFile } from '../src/parser.js';
import { loadConfig } from '../src/config.js';

describe('cache', () => {
  it('loads empty cache when missing or invalid', () => {
    const missing = loadCache('/tmp/does-not-exist.json');
    expect(missing.entries).toBeDefined();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cache-'));
    const file = path.join(dir, 'cache.json');
    fs.writeFileSync(file, 'not json');
    const invalid = loadCache(file);
    expect(invalid.entries).toBeDefined();
  });

  it('saves cache to disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cache-'));
    const file = path.join(dir, 'cache.json');
    saveCache(file, { version: 1, entries: { a: 1 } });
    expect(fs.existsSync(file)).toBe(true);
  });

  it('resets cache on version mismatch or missing entries', () => {
    expect(loadCache(undefined).entries).toBeDefined();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cache-'));
    const badVersion = path.join(dir, 'cache1.json');
    fs.writeFileSync(badVersion, JSON.stringify({ version: 0, entries: { stale: true } }));
    expect(loadCache(badVersion).entries).toEqual({});
    const missingEntries = path.join(dir, 'cache2.json');
    fs.writeFileSync(missingEntries, JSON.stringify({ version: 1 }));
    expect(loadCache(missingEntries).entries).toEqual({});
  });

  it('builds model key and fingerprints representations', () => {
    const cfg = loadConfig({ model: 'remote', remote: { model: 'm' } });
    expect(modelKey(cfg)).toMatch(/^remote:[a-f0-9]{64}$/);
    const cfgNoModel = loadConfig({ model: 'remote', remote: { model: '' } });
    expect(modelKey(cfgNoModel)).not.toBe(modelKey(cfg));
    expect(modelKey(loadConfig({ model: 'local', modelPath: 'x' }))).toBe('local:x');
    expect(modelKey(loadConfig({ model: 'mock' }))).toBe('mock');
    const fp = fingerprintRepresentation('code', 'style', 'css');
    expect(fp).toHaveLength(40);
    const fpEmpty = fingerprintRepresentation();
    expect(fpEmpty).toHaveLength(40);
  });

  it('reuses cached embeddings for unchanged files', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cache-'));
    const cachePath = path.join(cacheDir, 'cache.json');
    const config = loadConfig({ root: 'examples', model: 'mock', cachePath });
    const backend = { embed: vi.fn(async () => [1, 0, 0, 0]) };
    const components = parseFile(path.join('examples', 'CardA.tsx'), config).components;

    await embedComponents(components, backend, config);
    expect(backend.embed).toHaveBeenCalled();

    backend.embed.mockClear();
    await embedComponents(components, backend, config);
    expect(backend.embed).not.toHaveBeenCalled();
  });
});
