import { describe, expect, it } from 'vitest';
import {
  buildReportConfig,
  compareThresholds,
  computeBenchmarkScore,
  evaluateBenchmark,
  makeThresholdCandidate,
} from '../src/benchmark-metrics.js';
import { canonicalPairKey } from '../src/benchmark-suite.js';
import { makeEntry } from './similarity-fixtures.js';

describe('benchmark metrics', () => {
  it('computes ranking and reported-threshold metrics from pair scores', async () => {
    const entries = [
      makeEntry('A', [1, 0]),
      makeEntry('B', [0.98, 0.02]),
      makeEntry('C', [0, 1]),
      makeEntry('D', [0.05, 0.95]),
    ];
    const suite = {
      positivePairs: new Set([canonicalPairKey('A#A', 'B#B'), canonicalPairKey('C#C', 'D#D')]),
      hardNegativePairs: [
        { a: 'A#A', b: 'C#C' },
        { a: 'B#B', b: 'D#D' },
      ],
      relatedByComponent: new Map([
        ['A#A', new Set(['B#B'])],
        ['B#B', new Set(['A#A'])],
        ['C#C', new Set(['D#D'])],
        ['D#D', new Set(['C#C'])],
      ]),
      referencedComponentIds: new Set(['A#A', 'B#B', 'C#C', 'D#D']),
    };

    const metrics = await evaluateBenchmark(entries, suite, {
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      minPathDistance: 0,
      disableAnalyses: [],
      language: 'en',
    });
    expect(metrics.componentCount).toBe(4);
    expect(metrics.positivePairs).toBe(2);
    expect(metrics.averagePrecision).toBe(1);
    expect(metrics.meanReciprocalRank).toBe(1);
    expect(metrics.recallAt1).toBe(1);
    expect(metrics.recallAt3).toBe(1);
    expect(metrics.bestF1).toBe(1);
    expect(metrics.hardNegativeFp).toBe(0);
    expect(metrics.separationGap).toBeGreaterThan(0);
    expect(metrics.benchmarkScore).toBe(100);
  });

  it('handles a leading false positive threshold bucket', async () => {
    const entries = [
      makeEntry('A', [1, 0]),
      makeEntry('B', [0.95, 0.05]),
      makeEntry('C', [0.9, 0.1]),
    ];
    const suite = {
      positivePairs: new Set([canonicalPairKey('B#B', 'C#C')]),
      hardNegativePairs: [{ a: 'A#A', b: 'B#B' }],
      relatedByComponent: new Map([
        ['B#B', new Set(['C#C'])],
        ['C#C', new Set(['B#B'])],
      ]),
      referencedComponentIds: new Set(['A#A', 'B#B', 'C#C']),
    };

    const metrics = await evaluateBenchmark(entries, suite, {
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      minPathDistance: 0,
      disableAnalyses: [],
      language: 'en',
    });
    expect(metrics.bestF1).toBeGreaterThan(0);
    expect(metrics.precisionAtBestF1).toBeLessThanOrEqual(1);
    expect(metrics.separationGap).toBeLessThan(0);
    expect(metrics.benchmarkScore).toBeLessThan(100);
  });

  it('reports threshold metrics from the actual similarity pipeline, including suppressions', async () => {
    const entries = [
      makeEntry('WrapperA', [1, 0], {
        isWrapper: true,
        props: { names: ['tone'], spreads: 0 },
        componentRefs: ['ButtonBase'],
        jsxTags: ['ButtonBase'],
        source: 'export function WrapperA({ tone }) { return <ButtonBase tone={tone} />; }',
      }),
      makeEntry('WrapperB', [0.99, 0.01], {
        isWrapper: true,
        props: { names: ['tone'], spreads: 0 },
        componentRefs: ['ButtonBase'],
        jsxTags: ['ButtonBase'],
        source: 'export function WrapperB({ tone }) { return <ButtonBase tone={tone} />; }',
      }),
    ];
    const suite = {
      positivePairs: new Set([canonicalPairKey('WrapperA#WrapperA', 'WrapperB#WrapperB')]),
      hardNegativePairs: [],
      relatedByComponent: new Map([
        ['WrapperA#WrapperA', new Set(['WrapperB#WrapperB'])],
        ['WrapperB#WrapperB', new Set(['WrapperA#WrapperA'])],
      ]),
      referencedComponentIds: new Set(['WrapperA#WrapperA', 'WrapperB#WrapperB']),
    };

    const metrics = await evaluateBenchmark(entries, suite, {
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      minPathDistance: 0,
      disableAnalyses: [],
      language: 'en',
    });

    expect(metrics.averagePrecision).toBe(1);
    expect(metrics.bestF1).toBe(0);
    expect(metrics.recallAtBestF1).toBe(0);
  });

  it('throws when the suite references a missing component', async () => {
    const suite = {
      positivePairs: new Set(),
      hardNegativePairs: [],
      relatedByComponent: new Map(),
      referencedComponentIds: new Set(['missing.tsx#Missing']),
    };
    await expect(evaluateBenchmark([makeEntry('A', [1, 0])], suite)).rejects.toThrow(
      /missing component/
    );
  });

  it('returns zeroed metrics when the suite has no positives', async () => {
    const suite = {
      positivePairs: new Set(),
      hardNegativePairs: [],
      relatedByComponent: new Map(),
      referencedComponentIds: new Set(['A#A']),
    };
    const metrics = await evaluateBenchmark([makeEntry('A', [1, 0])], suite);
    expect(metrics.pairCount).toBe(0);
    expect(metrics.averagePrecision).toBe(0);
    expect(metrics.bestF1).toBe(0);
    expect(metrics.meanHardNegativeScore).toBe(0);
    expect(metrics.separationGap).toBe(0);
    expect(metrics.benchmarkScore).toBe(25);
  });

  it('compares thresholds with deterministic tie-breaking', () => {
    expect(
      compareThresholds(
        { f1: 0.8, precision: 0.7, recall: 0.9, threshold: 0.6 },
        { f1: 0.8, precision: 0.7, recall: 0.9, threshold: 0.6 }
      )
    ).toBe(0);
    expect(
      compareThresholds(
        { f1: 0.8, precision: 0.8, recall: 0.7, threshold: 0.5 },
        { f1: 0.8, precision: 0.7, recall: 0.9, threshold: 0.6 }
      )
    ).toBe(1);
    expect(
      compareThresholds(
        { f1: 0.7, precision: 0.9, recall: 0.9, threshold: 0.7 },
        { f1: 0.8, precision: 0.7, recall: 0.9, threshold: 0.6 }
      )
    ).toBe(-1);
  });

  it('builds reported-threshold candidates and report configs explicitly', () => {
    expect(makeThresholdCandidate(0.9, 0, 1, 2, 1)).toMatchObject({
      threshold: 0.9,
      precision: 0,
      recall: 0,
      f1: 0,
      hardNegativeFp: 1,
    });
    expect(makeThresholdCandidate(0.8, 2, 1, 2, 0)).toMatchObject({
      threshold: 0.8,
      precision: 2 / 3,
      recall: 1,
      f1: 0.8,
      hardNegativeFp: 0,
    });

    expect(buildReportConfig({}, 0.7)).toMatchObject({
      similarityThreshold: 0.7,
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      minPathDistance: 0,
      disableAnalyses: [],
      language: 'en',
      limit: null,
      compareGlobs: [],
      similarityWorkers: 1,
    });
    expect(
      buildReportConfig(
        {
          highSimilarityThreshold: 0.95,
          maxSimilarityThreshold: 0.99,
          minPathDistance: 2,
          disableAnalyses: ['style-duplicate'],
          language: 'ru',
        },
        0.8
      )
    ).toMatchObject({
      similarityThreshold: 0.8,
      highSimilarityThreshold: 0.95,
      maxSimilarityThreshold: 0.99,
      minPathDistance: 2,
      disableAnalyses: ['style-duplicate'],
      language: 'ru',
      similarityWorkers: 1,
    });

    expect(computeBenchmarkScore(1, 1, 1)).toBe(100);
    expect(computeBenchmarkScore(0.5, 0.5, 0.5)).toBe(50);
  });
});
