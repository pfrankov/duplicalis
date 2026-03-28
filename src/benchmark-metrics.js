import { dot } from './math.js';
import { canonicalPairKey } from './benchmark-suite.js';
import { findSimilarities } from './similarity.js';

export async function evaluateBenchmark(entries, suite, config = {}) {
  const byId = new Map(entries.map((entry) => [entry.component.id, entry]));
  ensureReferencedComponents(byId, suite.referencedComponentIds);

  const scoredPairs = scorePairs(entries, suite);
  const ranking = rankByComponent(entries, suite.relatedByComponent);
  const threshold = await findBestReportThreshold(entries, suite, scoredPairs, config);
  const minPositiveScore = extremeScore(scoredPairs, (pair) => pair.isPositive, 'min');
  const maxHardNegativeScore = extremeScore(scoredPairs, (pair) => pair.isHardNegative, 'max');
  const hardNegativePrecision = computeHardNegativePrecision(
    threshold.hardNegativeFp,
    suite.hardNegativePairs.length
  );
  const benchmarkScore = computeBenchmarkScore(
    threshold.f1,
    averagePrecision(scoredPairs, suite.positivePairs.size),
    hardNegativePrecision
  );
  return {
    componentCount: entries.length,
    pairCount: scoredPairs.length,
    positivePairs: suite.positivePairs.size,
    hardNegativePairs: suite.hardNegativePairs.length,
    averagePrecision: roundMetric(averagePrecision(scoredPairs, suite.positivePairs.size)),
    meanReciprocalRank: roundMetric(ranking.meanReciprocalRank),
    recallAt1: roundMetric(ranking.recallAt1),
    recallAt3: roundMetric(ranking.recallAt3),
    bestF1: roundMetric(threshold.f1),
    bestThreshold: roundMetric(threshold.threshold),
    precisionAtBestF1: roundMetric(threshold.precision),
    recallAtBestF1: roundMetric(threshold.recall),
    hardNegativeFp: threshold.hardNegativeFp,
    hardNegativeTotal: suite.hardNegativePairs.length,
    hardNegativePrecision: roundMetric(hardNegativePrecision),
    meanPositiveScore: roundMetric(meanScore(scoredPairs, (pair) => pair.isPositive)),
    meanHardNegativeScore: roundMetric(meanScore(scoredPairs, (pair) => pair.isHardNegative)),
    minPositiveScore: roundMetric(minPositiveScore),
    maxHardNegativeScore: roundMetric(maxHardNegativeScore),
    separationGap: roundMetric(minPositiveScore - maxHardNegativeScore),
    benchmarkScore: roundMetric(benchmarkScore),
  };
}

function ensureReferencedComponents(byId, expected = new Set()) {
  expected.forEach((id) => {
    if (!byId.has(id)) {
      throw new Error(`Benchmark manifest references a missing component: ${id}`);
    }
  });
}

function scorePairs(entries, suite) {
  const hardNegativePairs = new Set(
    suite.hardNegativePairs.map((pair) => canonicalPairKey(pair.a, pair.b))
  );
  const pairs = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i].component.id;
      const b = entries[j].component.id;
      const key = canonicalPairKey(a, b);
      pairs.push({
        a,
        b,
        key,
        score: dot(entries[i].vector, entries[j].vector),
        isPositive: suite.positivePairs.has(key),
        isHardNegative: hardNegativePairs.has(key),
      });
    }
  }
  return pairs.sort((left, right) => right.score - left.score);
}

function rankByComponent(entries, relatedByComponent) {
  let total = 0;
  let reciprocalRank = 0;
  let recallAt1 = 0;
  let recallAt3 = 0;

  entries.forEach((entry) => {
    const positives = relatedByComponent.get(entry.component.id);
    if (!positives?.size) return;
    const ranked = entries
      .filter((candidate) => candidate !== entry)
      .map((candidate) => ({
        id: candidate.component.id,
        score: dot(entry.vector, candidate.vector),
      }))
      .sort((left, right) => right.score - left.score);

    const firstHit = ranked.findIndex((candidate) => positives.has(candidate.id));
    total += 1;
    /* v8 ignore next */
    if (firstHit === -1) return;
    reciprocalRank += 1 / (firstHit + 1);
    if (firstHit === 0) recallAt1 += 1;
    if (ranked.slice(0, 3).some((candidate) => positives.has(candidate.id))) {
      recallAt3 += 1;
    }
  });

  return {
    meanReciprocalRank: total ? reciprocalRank / total : 0,
    recallAt1: total ? recallAt1 / total : 0,
    recallAt3: total ? recallAt3 / total : 0,
  };
}

function averagePrecision(scoredPairs, positiveCount) {
  if (!positiveCount) return 0;
  let hits = 0;
  let sum = 0;
  scoredPairs.forEach((pair, index) => {
    if (!pair.isPositive) return;
    hits += 1;
    sum += hits / (index + 1);
  });
  return sum / positiveCount;
}

async function findBestReportThreshold(entries, suite, scoredPairs, config) {
  if (!scoredPairs.length || suite.positivePairs.size === 0) {
    return { threshold: 1, precision: 0, recall: 0, f1: 0, hardNegativeFp: 0 };
  }

  const thresholds = uniqueThresholds(scoredPairs);
  const hardNegativeKeys = new Set(
    suite.hardNegativePairs.map((pair) => canonicalPairKey(pair.a, pair.b))
  );
  let best = {
    threshold: thresholds[0] + 1e-6,
    precision: 0,
    recall: 0,
    f1: 0,
    hardNegativeFp: 0,
  };

  for (const threshold of thresholds) {
    const candidate = await evaluateReportedPairsAtThreshold(
      entries,
      suite,
      config,
      threshold,
      hardNegativeKeys
    );
    if (compareThresholds(candidate, best) > 0) best = candidate;
  }

  return best;
}

async function evaluateReportedPairsAtThreshold(
  entries,
  suite,
  config,
  threshold,
  hardNegativeKeys
) {
  const result = await findSimilarities(entries, buildReportConfig(config, threshold));
  const reportedKeys = new Set(result.pairs.map((pair) => canonicalPairKey(pair.a, pair.b)));
  const tp = countMatches(reportedKeys, suite.positivePairs);
  const fp = reportedKeys.size - tp;
  const hardNegativeFp = countMatches(reportedKeys, hardNegativeKeys);
  return makeThresholdCandidate(threshold, tp, fp, suite.positivePairs.size, hardNegativeFp);
}

export function makeThresholdCandidate(threshold, tp, fp, positiveCount, hardNegativeFp) {
  const predicted = tp + fp;
  const precision = tp / predicted;
  const recall = tp / positiveCount;
  const scoreSum = precision + recall;
  const f1 = scoreSum === 0 ? 0 : (2 * precision * recall) / scoreSum;
  return { threshold, precision, recall, f1, hardNegativeFp };
}

function uniqueThresholds(scoredPairs) {
  return Array.from(new Set(scoredPairs.map((pair) => pair.score)));
}

export function buildReportConfig(config, threshold) {
  return {
    similarityThreshold: threshold,
    highSimilarityThreshold: config.highSimilarityThreshold ?? 0.9,
    maxSimilarityThreshold: config.maxSimilarityThreshold ?? 1,
    minPathDistance: config.minPathDistance ?? 0,
    disableAnalyses: config.disableAnalyses || [],
    language: config.language || 'en',
    limit: null,
    compareGlobs: [],
    similarityWorkers: 1,
  };
}

function countMatches(source, expected) {
  let count = 0;
  expected.forEach((value) => {
    if (source.has(value)) count += 1;
  });
  return count;
}

function computeHardNegativePrecision(hardNegativeFp, hardNegativeTotal) {
  if (hardNegativeTotal === 0) return 1;
  return 1 - hardNegativeFp / hardNegativeTotal;
}

export function computeBenchmarkScore(bestF1, averagePrecisionValue, hardNegativePrecision) {
  return (
    ((bestF1 || 0) * 0.45 +
      (averagePrecisionValue || 0) * 0.3 +
      (hardNegativePrecision || 0) * 0.25) *
    100
  );
}

export function compareThresholds(candidate, best) {
  const keys = ['f1', 'precision', 'recall', 'threshold'];
  for (const key of keys) {
    const delta = candidate[key] - best[key];
    if (Math.abs(delta) > 1e-9) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function meanScore(scoredPairs, predicate) {
  const matches = scoredPairs.filter(predicate);
  if (!matches.length) return 0;
  return matches.reduce((sum, pair) => sum + pair.score, 0) / matches.length;
}

function extremeScore(scoredPairs, predicate, mode) {
  const matches = scoredPairs.filter(predicate).map((pair) => pair.score);
  if (!matches.length) return 0;
  return mode === 'min' ? Math.min(...matches) : Math.max(...matches);
}

function roundMetric(value) {
  return Number(value.toFixed(4));
}
