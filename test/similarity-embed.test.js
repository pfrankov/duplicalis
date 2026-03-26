import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { loadCache, saveCache } from '../src/cache.js';
import { MockEmbeddingBackend } from '../src/embedding/mock.js';
import { embedComponents } from '../src/similarity.js';
import { baseComponent } from './similarity-fixtures.js';

describe('similarity embedding', () => {
  it('creates a progress bar when embedding progress is enabled', async () => {
    const backend = new MockEmbeddingBackend(4);
    const { entries } = await embedComponents([baseComponent('A', 'one')], backend, {
      weight: { code: 0.7, style: 0.3 },
      styleExtensions: ['.css'],
      root: process.cwd(),
      showProgress: true,
    });
    expect(entries).toHaveLength(1);
  });

  it('respects limit and custom weights', async () => {
    const components = [
      baseComponent('A', 'one'),
      baseComponent('B', 'one two'),
      baseComponent('C', 'one two three'),
    ];
    const backend = new MockEmbeddingBackend(4);
    const { entries } = await embedComponents(components, backend, {
      weight: { code: 0.5, style: 0.5 },
      styleExtensions: ['.css'],
      root: process.cwd(),
    });
    const counts = {};
    entries.forEach((entry) => {
      counts[entry.component.id] = entry.vector.length;
    });
    expect(Object.keys(counts)).toHaveLength(3);
  });

  it('re-embeds when content changes and cleans missing files randomly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cache-test-'));
    const cachePath = path.join(dir, 'cache.json');
    const compFile = path.join(dir, 'Comp.tsx');
    fs.writeFileSync(compFile, 'export const Comp = () => "a";');
    const components = [baseComponent(compFile, fs.readFileSync(compFile, 'utf8'))];
    const backend = { embed: vi.fn(async (text) => new Array(4).fill(text.length)) };
    const config = {
      weight: { code: 1, style: 0 },
      styleExtensions: [],
      root: dir,
      cachePath,
      showProgress: false,
      cleanProbability: 0,
    };

    await embedComponents(components, backend, config);
    expect(backend.embed).toHaveBeenCalledTimes(3);

    backend.embed.mockClear();
    await embedComponents(components, backend, config);
    expect(backend.embed).toHaveBeenCalledTimes(0);

    backend.embed.mockClear();
    fs.writeFileSync(compFile, 'export const Comp = () => "b";');
    components[0].source = fs.readFileSync(compFile, 'utf8');
    components[0].jsxTags.push('span');
    await embedComponents(components, backend, config);
    expect(backend.embed).toHaveBeenCalledTimes(3);

    const cache = loadCache(cachePath);
    cache.entries['local:missing#missing'] = { fingerprint: 'x', codeVec: [1], styleVec: [1] };
    saveCache(cachePath, cache);

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    await embedComponents(components, backend, {
      weight: { code: 1, style: 0 },
      styleExtensions: [],
      root: dir,
      cachePath,
      showProgress: false,
      cleanProbability: 1,
    });
    randomSpy.mockRestore();

    expect(loadCache(cachePath).entries['local:missing#missing']).toBeUndefined();
  });

  it('ignores malformed cache keys during cleanup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-bad-cache-'));
    const cachePath = path.join(dir, 'cache.json');
    saveCache(cachePath, {
      version: 1,
      entries: {
        '': { fingerprint: 'x', codeVec: [1], styleVec: [1], structureVec: [1], holisticVec: [1] },
        nocolon: {
          fingerprint: 'y',
          codeVec: [1],
          styleVec: [1],
          structureVec: [1],
          holisticVec: [1],
        },
      },
    });
    const backend = { embed: vi.fn(async () => [1, 0, 0]) };

    await embedComponents([baseComponent('Tmp', 'tmp')], backend, {
      weight: { code: 1, style: 0 },
      styleExtensions: [],
      root: dir,
      cachePath,
      showProgress: false,
      cleanProbability: 1,
    });

    const cache = loadCache(cachePath);
    expect(cache.entries['']).toBeDefined();
    expect(cache.entries.nocolon).toBeDefined();
  });

  it('memoizes identical representations within a single run', async () => {
    const backend = { embed: vi.fn(async (text) => new Array(4).fill(text.length)) };
    const shared = {
      name: 'Shared',
      props: { names: [], spreads: 0 },
      hooks: [],
      logicTokens: [],
      literals: [],
      jsxTags: ['div'],
      jsxPaths: [],
      textNodes: [],
      classNames: [],
      returnsCount: 1,
      styleImports: [],
      isWrapper: false,
      source: 'export function Shared() { return <div />; }',
    };

    await embedComponents(
      [
        { ...shared, id: 'a#Shared', filePath: 'a.tsx' },
        { ...shared, id: 'b#Shared', filePath: 'b.tsx' },
      ],
      backend,
      {
        weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
        styleExtensions: ['.css'],
        root: process.cwd(),
        showProgress: false,
      }
    );

    expect(backend.embed).toHaveBeenCalledTimes(3);
  });

  it('clears failed memoized embeddings so errors do not poison later requests', async () => {
    const backend = {
      embed: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const component = {
      ...baseComponent('Shared', 'export function Shared() { return <div />; }'),
      id: 'a#Shared',
      filePath: 'a.tsx',
    };

    await expect(
      embedComponents([component], backend, {
        weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
        styleExtensions: ['.css'],
        root: process.cwd(),
        showProgress: false,
      })
    ).rejects.toThrow('boom');

    expect(backend.embed).toHaveBeenCalledTimes(1);
  });

  it('returns empty combined vector when weights are zeroed', async () => {
    const backend = { embed: vi.fn(async () => [1, 1, 1]) };
    const { entries } = await embedComponents([baseComponent('Zero', 'zero')], backend, {
      weight: { code: 0, style: 0, structure: 0, holistic: 0 },
      styleExtensions: [],
      root: process.cwd(),
      showProgress: false,
    });
    expect(entries[0].vector).toEqual([]);
  });

  it('ignores style weight when no style signal is present', async () => {
    const backend = { embed: vi.fn(async () => [1, 0]) };
    const { entries } = await embedComponents(
      [{ ...baseComponent('NoStyles', 'plain'), classNames: [], styleImports: [] }],
      backend,
      {
        weight: { code: 1, style: 1, structure: 0, holistic: 0 },
        styleExtensions: [],
        root: process.cwd(),
        showProgress: false,
      }
    );
    expect(entries[0].styleVec).toEqual([0, 0]);
    expect(entries[0].vector).toEqual([1, 0]);
  });

  it('upgrades partial cache entries and rebuilds structure vectors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-partial-cache-'));
    const cachePath = path.join(dir, 'cache.json');
    const component = {
      ...baseComponent('Partial', 'export const Partial = () => <div />;', {
        filePath: path.join(dir, 'Partial.tsx'),
        jsxPaths: ['a>b>c>d>e>f>g'],
        textNodes: ['hello'],
      }),
    };
    const backend = { embed: vi.fn(async () => [1, 1, 1, 1]) };
    const config = {
      weight: { code: 1, style: 0 },
      styleExtensions: [],
      root: dir,
      cachePath,
      showProgress: false,
      cleanProbability: 0,
    };

    await embedComponents([component], backend, config);
    const cache = loadCache(cachePath);
    const key = Object.keys(cache.entries)[0];
    cache.entries[key] = { fingerprint: cache.entries[key].fingerprint, codeVec: [1, 1, 1, 1] };
    saveCache(cachePath, cache);
    backend.embed.mockClear();
    backend.embed.mockImplementation(async () => [2, 2, 2, 2]);

    await embedComponents([component], backend, config);
    expect(backend.embed).toHaveBeenCalledTimes(2);
  });
});
