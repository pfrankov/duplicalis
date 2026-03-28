import path from 'path';
import { findSourceFiles } from './scanner.js';
import { loadComponentsWithCache } from './analysis-cache.js';
import { createEmbeddingBackend } from './embedding/index.js';
import { embedComponents } from './similarity.js';
import { getI18n } from './i18n.js';
import {
  DEFAULT_BENCHMARK_MANIFEST,
  buildBenchmarkModelConfig,
  resolveBenchmarkModels,
  resolveLocalBenchmarkLabel,
} from './benchmark-defaults.js';
import { loadBenchmarkSuite } from './benchmark-suite.js';
import { evaluateBenchmark } from './benchmark-metrics.js';
import { emitBenchmarkReport } from './benchmark-output.js';

export async function runBenchmark(baseConfig, options = {}) {
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_BENCHMARK_MANIFEST);
  const suite = loadBenchmarkSuite(manifestPath);
  const benchmarkConfig = buildBenchmarkConfig(baseConfig, suite, options.cachePath);
  const files = await findSourceFiles(benchmarkConfig);
  const parsed = loadComponentsWithCache(files, benchmarkConfig);
  const components = parsed.components;
  const models = resolveBenchmarkModels(options.models);
  const results = [];

  for (const spec of models) {
    const startedAt = Date.now();
    const modelConfig = buildBenchmarkModelConfig(benchmarkConfig, spec);
    const backend = await createEmbeddingBackend(modelConfig);
    const embedded = await embedComponents(components, backend, modelConfig);
    const metrics = await evaluateBenchmark(embedded.entries, suite, modelConfig);
    results.push({
      id: spec.id,
      kind: spec.kind,
      label: resolveBenchmarkResultLabel(spec, modelConfig),
      metrics,
      stats: {
        embedMs: Date.now() - startedAt,
        cache: embedded.cacheStats,
      },
    });
  }

  const sorted = sortBenchmarkResults(results);
  const report = {
    suite: {
      id: suite.id,
      name: suite.name,
      description: suite.description,
      manifestPath,
      root: suite.root,
      componentCount: components.length,
      pairCount: (components.length * (components.length - 1)) / 2,
      positivePairs: suite.positivePairs.size,
      hardNegativePairs: suite.hardNegativePairs.length,
    },
    generatedAt: new Date().toISOString(),
    results: sorted,
  };

  emitBenchmarkReport(report, {
    i18n: options.i18n || getI18n(baseConfig.language),
    outPath: options.outPath,
  });
  return report;
}

function buildBenchmarkConfig(baseConfig, suite, explicitCachePath) {
  const cachePath = explicitCachePath
    ? path.resolve(explicitCachePath)
    : path.join(path.dirname(baseConfig.cachePath), 'benchmarks', suite.id, 'embeddings.json');
  return {
    ...baseConfig,
    root: suite.root,
    include: suite.include,
    exclude: suite.exclude,
    styleExtensions: suite.styleExtensions,
    cachePath,
    analysisCachePath: path.join(path.dirname(cachePath), 'analysis.msgpack'),
    out: null,
  };
}

export function sortBenchmarkResults(results) {
  return [...results].sort((left, right) => {
    if (right.metrics.benchmarkScore !== left.metrics.benchmarkScore) {
      return right.metrics.benchmarkScore - left.metrics.benchmarkScore;
    }
    if (right.metrics.bestF1 !== left.metrics.bestF1) {
      return right.metrics.bestF1 - left.metrics.bestF1;
    }
    if (right.metrics.averagePrecision !== left.metrics.averagePrecision) {
      return right.metrics.averagePrecision - left.metrics.averagePrecision;
    }
    return right.metrics.meanReciprocalRank - left.metrics.meanReciprocalRank;
  });
}

export function resolveBenchmarkResultLabel(spec, config) {
  return spec.kind === 'local' ? resolveLocalBenchmarkLabel(config) : spec.label;
}
