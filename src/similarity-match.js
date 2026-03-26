import { labelPair } from './labels.js';
import { cosine } from './math.js';

export function findSimilarities(entries, config) {
  const state = makeState();
  const compare = hasCompare(config);

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      addResult(state, entries[i], entries[j], evalPair(entries[i], entries[j], config, compare));
    }
  }

  return {
    pairs: limitPairs(state.pairs, config.limit),
    scorecard: makeScorecard(state),
  };
}

function makeState() {
  return {
    pairs: [],
    best: new Map(),
    checked: 0,
    sum: 0,
    max: 0,
    suppressed: 0,
    reasons: {},
  };
}

function hasCompare(config) {
  return Array.isArray(config.compareGlobs) && config.compareGlobs.length > 0;
}

function evalPair(a, b, config, compare) {
  if (skipCompare(a, b, compare)) return { suppression: 'compare-filter' };

  const similarity = cosine(a.vector, b.vector);
  if (similarity < config.similarityThreshold) return { similarity };
  if (similarity - (config.maxSimilarityThreshold ?? 1) > 1e-6) {
    return { similarity, suppression: 'over-max-threshold' };
  }
  if (skipByPath(a.component.filePath, b.component.filePath, config)) {
    return { similarity, suppression: 'near-path' };
  }

  const suppression = suppressPair(a, b);
  if (suppression) return { similarity, suppression };

  const labeled = labelPair(a, b, similarity, config);
  return {
    similarity,
    pair: {
      a: a.component.id,
      b: b.component.id,
      similarity: Number(similarity.toFixed(4)),
      category:
        similarity >= config.highSimilarityThreshold ? 'almost-identical' : 'near-duplicate',
      labels: labeled.labels,
      hints: labeled.hints,
    },
  };
}

function skipCompare(a, b, compare) {
  if (!compare) return false;
  return !(a.component.isCompareTarget ^ b.component.isCompareTarget);
}

function addResult(state, a, b, result) {
  if (typeof result.similarity === 'number') {
    state.checked += 1;
    state.sum += result.similarity;
    state.max = Math.max(state.max, result.similarity);
    trackBest(state.best, a.component.id, result.similarity);
    trackBest(state.best, b.component.id, result.similarity);
  }
  if (result.suppression) {
    state.suppressed += 1;
    state.reasons[result.suppression] = (state.reasons[result.suppression] || 0) + 1;
  }
  if (result.pair) {
    state.pairs.push(result.pair);
  }
}

function limitPairs(pairs, limit) {
  const sorted = [...pairs].sort((a, b) => b.similarity - a.similarity);
  if (limit == null || !Number.isFinite(limit)) return sorted;

  const counts = {};
  return sorted.filter((pair) => {
    const aCount = counts[pair.a] || 0;
    const bCount = counts[pair.b] || 0;
    if (aCount >= limit || bCount >= limit) return false;
    counts[pair.a] = aCount + 1;
    counts[pair.b] = bCount + 1;
    return true;
  });
}

function trackBest(best, id, similarity) {
  const current = best.get(id) || 0;
  if (similarity > current) best.set(id, similarity);
}

function makeScorecard(state) {
  const values = Array.from(state.best.values());
  const mean = state.checked === 0 ? 0 : Number((state.sum / state.checked).toFixed(4));
  const min = values.length === 0 ? 0 : Number(Math.min(...values).toFixed(4));
  const max = values.length === 0 ? 0 : Number(Math.max(...values).toFixed(4));
  return {
    meanSimilarity: mean,
    maxSimilarity: Number(state.max.toFixed(4)),
    evaluatedPairs: state.checked,
    coveredComponents: values.length,
    suppressedPairs: state.suppressed,
    suppressionReasons: state.reasons,
    minBestSimilarity: min,
    maxBestSimilarity: max,
  };
}

function suppressPair(a, b) {
  return (
    suppressComposition(a.component, b.component) ||
    suppressWrapper(a.component, b.component) ||
    suppressLowSignal(a.component, b.component)
  );
}

function suppressComposition(a, b) {
  const left = new Set(a.componentRefs || []);
  const right = new Set(b.componentRefs || []);
  return left.has(b.name) || right.has(a.name) ? 'component-composition' : null;
}

function suppressWrapper(a, b) {
  if (!isWrapper(a) || !isWrapper(b)) return null;
  if (differentRefs(a.componentRefs, b.componentRefs)) return 'wrapper-different-base';

  const sameBase = topTag(a) && topTag(a) === topTag(b);
  const plain =
    len(a.logicTokens) + len(b.logicTokens) === 0 &&
    len(a.hooks) + len(b.hooks) === 0 &&
    len(a.textNodes) + len(b.textNodes) <= 3 &&
    len(a.literals) + len(b.literals) <= 6;

  return sameBase || plain ? 'wrapper-specialization' : null;
}

function suppressLowSignal(a, b) {
  const short = nonEmptyLines(a.source) <= 16 && nonEmptyLines(b.source) <= 16;
  if (!short) return null;
  if (!hasProps(a) && !hasProps(b) && !isWrapper(a) && !isWrapper(b)) return null;
  return signalScore(a) <= 2 && signalScore(b) <= 2 ? 'low-signal-pair' : null;
}

function isWrapper(component) {
  if (component.isWrapper) return true;
  return (
    nonEmptyLines(component.source) <= 8 &&
    new Set(component.jsxTags || []).size <= 2 &&
    hasProps(component) &&
    (component.logicTokens?.length || 0) + (component.hooks?.length || 0) === 0 &&
    (component.textNodes?.length || 0) <= 2
  );
}

function topTag(component) {
  const tags = Array.isArray(component.jsxTags) ? component.jsxTags : [];
  if (!tags.length) return null;
  const counts = tags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function signalScore(component) {
  const parts = [
    new Set(component.logicTokens || []).size,
    new Set(component.hooks || []).size,
    new Set(component.classNames || []).size,
    new Set(component.textNodes || []).size,
    new Set(component.props?.names || []).size,
  ];
  return parts.reduce((sum, size) => sum + Math.min(size, 2), 0);
}

function nonEmptyLines(source = '') {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function hasProps(component) {
  return (component.props?.names?.length || 0) + (component.props?.spreads || 0) > 0;
}

function len(list) {
  return Array.isArray(list) ? list.length : 0;
}

function differentRefs(a = [], b = []) {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  return !b.some((value) => set.has(value));
}

function skipByPath(a, b, config) {
  const min = Number(config.minPathDistance || 0);
  return min > 0 && pathDistance(a, b) < min;
}

function pathDistance(a = '', b = '') {
  const left = splitDirs(a);
  const right = splitDirs(b);
  const max = Math.max(left.length, right.length);

  for (let i = 1; i <= max; i += 1) {
    const leftPart = left[left.length - i];
    const rightPart = right[right.length - i];
    if (leftPart !== rightPart) return i;
    /* v8 ignore next */
    if (leftPart === undefined || rightPart === undefined) return i;
  }

  return 0;
}

function splitDirs(filePath) {
  /* v8 ignore next */
  if (!filePath) return [];
  return filePath
    .split(/[/\\]+/)
    .filter(Boolean)
    .slice(0, -1);
}
