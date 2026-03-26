import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { emitReport } from '../src/output.js';

vi.mock('cli-highlight', () => ({
  highlight: vi.fn((code) => `<<${code}>>`),
}));

describe('output', () => {
  it('writes report even when no pairs are found', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
    };
    const entries = [
      {
        component: { id: 'a#A', name: 'A', filePath: 'a', hooks: [], loc: null },
        styleText: '',
      },
    ];
    const pairs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
    expect(fs.existsSync(path.join(dir, 'out.json'))).toBe(true);
  });

  it('skips writing a report when no output is provided', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = { root: dir, similarityThreshold: 0.5, highSimilarityThreshold: 0.9 };
    const entries = [
      {
        component: { id: 'a#A', name: 'A', filePath: 'a', hooks: [], loc: null },
        styleText: '',
      },
    ];
    const pairs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
    expect(fs.readdirSync(dir).length).toBe(0);
  });

  it('prints snippets and mode info', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'remote',
      modelPath: 'models/x',
      autoDownloadModel: false,
      remote: { model: 'm', url: 'https://api.example.com' },
      include: ['src/**/*'],
      exclude: ['**/*.spec.tsx'],
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: 'a',
          hooks: [],
          loc: null,
          source: 'const A = () => {};',
        },
        styleText: '',
      },
      {
        component: { id: 'b#B', name: 'B', filePath: 'b', hooks: [], loc: null, source: '' },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.9, category: 'near-duplicate', labels: [], hints: [] },
    ];
    const stats = {
      scanMs: 1,
      parseMs: 2,
      embedMs: 3,
      similarityMs: 4,
      scorecard: {
        meanSimilarity: 0.4,
        maxSimilarity: 0.9,
        minBestSimilarity: 0.4,
        maxBestSimilarity: 0.9,
        evaluatedPairs: 2,
        coveredComponents: 2,
        suppressedPairs: 2,
        suppressionReasons: { 'wrapper-specialization': 1, 'low-signal-pair': 1 },
      },
      cache: { hits: 1, misses: 2, cleaned: 0, uncachedCount: 3 },
    };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config, stats);
    spy.mockRestore();
  });

  it('covers hint, truncation, and mock mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      modelPath: 'models/x',
      autoDownloadModel: true,
      remote: {},
    };
    const longLine = 'x'.repeat(200);
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: 'a',
          hooks: [],
          loc: null,
          source: `${longLine}\nnext`,
        },
        styleText: '',
      },
    ];
    const pairs = [
      {
        a: 'a#A',
        b: 'missing#B',
        similarity: 0.95,
        category: 'almost-identical',
        labels: ['logic-duplicate'],
        hints: ['refactor'],
      },
    ];
    const stats = {
      scanMs: 0,
      parseMs: 0,
      embedMs: 0,
      similarityMs: 0,
      scorecard: {
        meanSimilarity: 0,
        maxSimilarity: 0,
        minBestSimilarity: 0,
        maxBestSimilarity: 0,
        evaluatedPairs: 1,
        coveredComponents: 1,
        suppressedPairs: 1,
        suppressionReasons: {},
      },
    };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config, stats);
    spy.mockRestore();
  });

  it('writes txt output with compact pairs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'report.txt',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: path.join(dir, 'a.tsx'),
          hooks: [],
          loc: null,
          source: '',
        },
        styleText: '',
      },
      {
        component: {
          id: 'b#B',
          name: 'B',
          filePath: path.join(dir, 'b.tsx'),
          hooks: [],
          loc: null,
          source: '',
        },
        styleText: '',
      },
    ];
    const pairs = [
      {
        a: 'a#A',
        b: 'b#B',
        similarity: 0.9,
        category: 'near-duplicate',
        labels: ['logic-duplicate', 'copy-paste-variant'],
        hints: [],
      },
    ];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
    const txt = fs.readFileSync(path.join(dir, 'report.txt'), 'utf8').trim().split('\n');
    expect(txt[0]).toBe('0.9 | #logic-duplicate\t#copy-paste-variant');
    expect(txt[1]).toBe(path.join(dir, 'a.tsx'));
    expect(txt[2]).toBe(path.join(dir, 'b.tsx'));
  });

  it('writes txt output with dash when labels are missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'plain.txt',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: path.join(dir, 'a.tsx'),
          hooks: [],
          loc: null,
          source: '',
        },
        styleText: '',
      },
      {
        component: {
          id: 'b#B',
          name: 'B',
          filePath: path.join(dir, 'b.tsx'),
          hooks: [],
          loc: null,
          source: '',
        },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.8, category: 'near-duplicate', labels: [], hints: [] },
    ];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
    const txt = fs.readFileSync(path.join(dir, 'plain.txt'), 'utf8').trim().split('\n');
    expect(txt[0]).toBe('0.8 | -');
    expect(txt[1]).toBe(path.join(dir, 'a.tsx'));
    expect(txt[2]).toBe(path.join(dir, 'b.tsx'));
  });

  it('applies syntax highlighting', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: 'a.tsx',
          hooks: [],
          loc: null,
          source: 'const A = 1;',
        },
        styleText: '',
      },
      {
        component: {
          id: 'b#B',
          name: 'B',
          filePath: 'b.tsx',
          hooks: [],
          loc: null,
          source: 'const B = 2;',
        },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.9, category: 'near-duplicate', labels: [], hints: [] },
    ];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
  });

  it('reports stats when pairs are partial and suppressions are zero', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: { id: 'a#A', name: 'A', filePath: 'a.tsx', hooks: [], loc: null, source: '' },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', category: 'near-duplicate', similarity: 0.5, labels: [], hints: [] },
      { b: 'b#B', category: 'near-duplicate', similarity: 0.4, labels: [], hints: [] },
    ];
    const stats = {
      scorecard: {
        maxSimilarity: 0.5,
        minBestSimilarity: 0.4,
        maxBestSimilarity: 0.5,
        suppressedPairs: 0,
        suppressionReasons: {},
      },
    };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config, stats);
    spy.mockRestore();
  });

  it('renders stats even when no components are present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport([], [], config, { scorecard: { suppressedPairs: 0, suppressionReasons: {} } });
    spy.mockRestore();
  });

  it('prints suppression summary even when reasons are empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: { id: 'a#A', name: 'A', filePath: 'a.tsx', hooks: [], loc: null, source: '' },
        styleText: '',
      },
      {
        component: { id: 'b#B', name: 'B', filePath: 'b.tsx', hooks: [], loc: null, source: '' },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.5, category: 'near-duplicate', labels: [], hints: [] },
    ];
    const stats = {
      scorecard: {
        maxSimilarity: 0.5,
        minBestSimilarity: 0.5,
        maxBestSimilarity: 0.5,
        suppressedPairs: 2,
      },
    };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config, stats);
    spy.mockRestore();
  });

  it('highlights css and handles missing paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: 'a.css',
          hooks: [],
          loc: null,
          source: '.a { color: red; }',
        },
        styleText: '',
      },
      {
        component: {
          id: 'b#B',
          name: 'B',
          filePath: '',
          hooks: [],
          loc: null,
          source: 'const x = 1;',
        },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.9, category: 'near-duplicate', labels: [], hints: [] },
    ];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    spy.mockRestore();
  });

  it('respects console top limit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-output-'));
    const config = {
      root: dir,
      out: 'out.json',
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      model: 'mock',
      remote: {},
      limit: 1,
    };
    const entries = [
      {
        component: {
          id: 'a#A',
          name: 'A',
          filePath: 'a.tsx',
          hooks: [],
          loc: null,
          source: 'const A = 1;',
        },
        styleText: '',
      },
      {
        component: {
          id: 'b#B',
          name: 'B',
          filePath: 'b.tsx',
          hooks: [],
          loc: null,
          source: 'const B = 2;',
        },
        styleText: '',
      },
      {
        component: {
          id: 'c#C',
          name: 'C',
          filePath: 'c.tsx',
          hooks: [],
          loc: null,
          source: 'const C = 3;',
        },
        styleText: '',
      },
    ];
    const pairs = [
      { a: 'a#A', b: 'b#B', similarity: 0.99, category: 'almost-identical', labels: [], hints: [] },
      { a: 'a#A', b: 'c#C', similarity: 0.98, category: 'almost-identical', labels: [], hints: [] },
    ];
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitReport(entries, pairs, config);
    const calls = spy.mock.calls.flat().filter((line) => String(line).includes('score: 0.99'));
    expect(calls.length).toBe(1);
    spy.mockRestore();
  });
});
