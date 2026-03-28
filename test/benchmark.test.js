import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveBenchmarkResultLabel,
  runBenchmark,
  sortBenchmarkResults,
} from '../src/benchmark.js';
import { getI18n } from '../src/i18n.js';

describe('benchmark runner', () => {
  it('runs the bundled suite with a mock backend and writes JSON output', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-benchmark-'));
    const outPath = path.join(dir, 'benchmark.json');
    const config = {
      root: path.resolve('.'),
      include: ['**/*.tsx'],
      exclude: ['**/node_modules/**'],
      styleExtensions: ['.css'],
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      limit: null,
      cachePath: path.join(dir, 'cache.json'),
      analysisCachePath: path.join(dir, 'analysis.msgpack'),
      model: 'mock',
      modelPath: 'models/all-MiniLM-L6-v2',
      modelRepo: '',
      autoDownloadModel: false,
      remote: {},
      showProgress: false,
      language: 'en',
      weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
      disableAnalyses: [],
      allowIgnores: true,
      ignoreComponentNamePatterns: [],
      ignoreComponentUsagePatterns: [],
      compareGlobs: [],
      relativePaths: false,
      minPathDistance: 0,
      cleanProbability: 0,
    };

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = await runBenchmark(config, {
      models: ['mock', 'mock'],
      outPath,
      i18n: getI18n('en'),
    });
    log.mockRestore();

    expect(report.results).toHaveLength(2);
    expect(report.results[0].metrics.pairCount).toBeGreaterThan(0);
    expect(report.results[0].stats.embedMs).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(outPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(written.suite.id).toBe('react-component-duplicates-v1');
    expect(written.results).toHaveLength(2);
  });

  it('honors an explicit benchmark cache path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-benchmark-cache-'));
    const cachePath = path.join(dir, 'custom-cache.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runBenchmark(
      {
        root: path.resolve('.'),
        include: ['**/*.tsx'],
        exclude: [],
        styleExtensions: ['.css'],
        cachePath: path.join(dir, 'base-cache.json'),
        analysisCachePath: path.join(dir, 'base-analysis.msgpack'),
        model: 'mock',
        modelPath: 'models/all-MiniLM-L6-v2',
        modelRepo: '',
        autoDownloadModel: false,
        remote: {},
        showProgress: false,
        language: 'en',
        weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
        disableAnalyses: [],
        allowIgnores: true,
        ignoreComponentNamePatterns: [],
        ignoreComponentUsagePatterns: [],
        compareGlobs: [],
        relativePaths: false,
        minPathDistance: 0,
        cleanProbability: 0,
      },
      {
        models: ['mock'],
        cachePath,
        i18n: getI18n('en'),
      }
    );
    log.mockRestore();
    expect(fs.existsSync(cachePath)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'analysis.msgpack'))).toBe(true);
  });

  it('sorts benchmark results by score, then F1, AP, then MRR', () => {
    const results = sortBenchmarkResults([
      { metrics: { benchmarkScore: 70, bestF1: 0.8, averagePrecision: 0.7, meanReciprocalRank: 0.5 } },
      { metrics: { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.9, meanReciprocalRank: 0.1 } },
      { metrics: { benchmarkScore: 90, bestF1: 0.9, averagePrecision: 0.4, meanReciprocalRank: 0.1 } },
      { metrics: { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.9, meanReciprocalRank: 0.6 } },
      { metrics: { benchmarkScore: 80, bestF1: 0.85, averagePrecision: 0.2, meanReciprocalRank: 0.1 } },
      { metrics: { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.95, meanReciprocalRank: 0.2 } },
    ]);

    expect(results.map((result) => result.metrics)).toEqual([
      { benchmarkScore: 90, bestF1: 0.9, averagePrecision: 0.4, meanReciprocalRank: 0.1 },
      { benchmarkScore: 80, bestF1: 0.85, averagePrecision: 0.2, meanReciprocalRank: 0.1 },
      { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.95, meanReciprocalRank: 0.2 },
      { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.9, meanReciprocalRank: 0.6 },
      { benchmarkScore: 80, bestF1: 0.8, averagePrecision: 0.9, meanReciprocalRank: 0.1 },
      { benchmarkScore: 70, bestF1: 0.8, averagePrecision: 0.7, meanReciprocalRank: 0.5 },
    ]);
  });

  it('resolves benchmark result labels for local and remote models', () => {
    expect(
      resolveBenchmarkResultLabel({ kind: 'local' }, { modelPath: '/tmp/models/my-local-model' })
    ).toBe('Local my-local-model');
    expect(resolveBenchmarkResultLabel({ kind: 'remote', label: 'Remote model' }, {})).toBe(
      'Remote model'
    );
  });

  it('falls back to config language when benchmark i18n is not passed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const report = await runBenchmark(
      {
        root: path.resolve('.'),
        include: ['**/*.tsx'],
        exclude: [],
        styleExtensions: ['.css'],
        cachePath: path.join(os.tmpdir(), 'duplicalis-benchmark-fallback-cache.json'),
        analysisCachePath: path.join(os.tmpdir(), 'duplicalis-benchmark-fallback-analysis.msgpack'),
        model: 'mock',
        modelPath: 'models/all-MiniLM-L6-v2',
        modelRepo: '',
        autoDownloadModel: false,
        remote: {},
        showProgress: false,
        language: 'en',
        weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
        disableAnalyses: [],
        allowIgnores: true,
        ignoreComponentNamePatterns: [],
        ignoreComponentUsagePatterns: [],
        compareGlobs: [],
        relativePaths: false,
        minPathDistance: 0,
        cleanProbability: 0,
      },
      { models: ['mock'] }
    );
    log.mockRestore();
    expect(report.results).toHaveLength(1);
  });
});
