import { labelPair } from './labels.js';
import { dot } from './math.js';

const componentMetaCache = new WeakMap();
const entryMetaCache = new WeakMap();

export function findSimilaritiesSync(entries, config) {
  const state = processPairRange(entries, config, 0, entries.length, hasCompare(config));
  return finalizeSimilarityState(state, config);
}

export function processPairRange(
  entries,
  config,
  startIndex,
  endIndex,
  compare = hasCompare(config)
) {
  const state = makeState();
  primeComponentMeta(entries);

  for (let i = startIndex; i < endIndex; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      addResult(state, entries[i], entries[j], evalPair(entries[i], entries[j], config, compare));
    }
  }

  return state;
}

export function mergeSimilarityStates(states = []) {
  const merged = makeState();

  states.forEach((state) => {
    /* v8 ignore next */
    merged.pairs.push(...(state.pairs || []));
    /* v8 ignore next */
    merged.checked += state.checked || 0;
    /* v8 ignore next */
    merged.sum += state.sum || 0;
    /* v8 ignore next */
    merged.max = Math.max(merged.max, state.max || 0);
    /* v8 ignore next */
    merged.suppressed += state.suppressed || 0;

    /* v8 ignore next */
    Object.entries(state.best || {}).forEach(([id, similarity]) => {
      trackBest(merged.best, id, similarity);
    });

    /* v8 ignore next */
    Object.entries(state.reasons || {}).forEach(([reason, count]) => {
      merged.reasons[reason] = (merged.reasons[reason] || 0) + count;
    });
  });

  return merged;
}

export function finalizeSimilarityState(state, config) {
  return {
    pairs: limitPairs(state.pairs, config.limit),
    scorecard: makeScorecard(state),
  };
}

export function hasCompare(config) {
  return Array.isArray(config.compareGlobs) && config.compareGlobs.length > 0;
}

function makeState() {
  return {
    pairs: [],
    best: {},
    checked: 0,
    sum: 0,
    max: 0,
    suppressed: 0,
    reasons: {},
  };
}

function evalPair(a, b, config, compare) {
  const left = getComponentMeta(a.component);
  const right = getComponentMeta(b.component);
  if (skipCompare(a, b, compare)) return { suppression: 'compare-filter' };

  const similarity = pairSimilarity(a, b);
  if (similarity < config.similarityThreshold) return { similarity };
  if (similarity - (config.maxSimilarityThreshold ?? 1) > 1e-6) {
    return { similarity, suppression: 'over-max-threshold' };
  }
  if (skipByPath(left.pathDirs, right.pathDirs, config)) {
    return { similarity, suppression: 'near-path' };
  }

  const suppression = suppressPair(a.component, b.component, left, right);
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

function pairSimilarity(a, b) {
  const left = getEntryMeta(a);
  const right = getEntryMeta(b);
  return cosineWithMeta(a.vector, b.vector, left.norm, right.norm);
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
  const current = best[id] || 0;
  if (similarity > current) best[id] = similarity;
}

function makeScorecard(state) {
  const values = Object.values(state.best);
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

function primeComponentMeta(entries) {
  entries.forEach((entry) => {
    getComponentMeta(entry.component);
    getEntryMeta(entry);
  });
}

function getComponentMeta(component) {
  if (componentMetaCache.has(component)) {
    return componentMetaCache.get(component);
  }
  const meta = {
    refs: component.componentRefs || [],
    refsSet: new Set(component.componentRefs || []),
    topTag: topTagFrom(component.jsxTags),
    signalScore: calcSignalScore(component),
    hasProps: hasProps(component),
    nonEmptyLines: countNonEmptyLines(component.source),
    jsxTagKinds: new Set(component.jsxTags || []).size,
    logicAndHooks: (component.logicTokens?.length || 0) + (component.hooks?.length || 0),
    textCount: component.textNodes?.length || 0,
    pathDirs: splitDirs(component.filePath),
  };
  componentMetaCache.set(component, meta);
  return meta;
}

function getEntryMeta(entry) {
  if (entryMetaCache.has(entry)) {
    return entryMetaCache.get(entry);
  }
  const meta = { norm: vectorNorm(entry.vector) };
  entryMetaCache.set(entry, meta);
  return meta;
}

function suppressPair(a, b, left, right) {
  return (
    suppressComposition(a, b, left, right) ||
    suppressWrapper(a, b, left, right) ||
    suppressLowSignal(a, b, left, right)
  );
}

function cosineWithMeta(a, b, aNorm, bNorm) {
  const denom = aNorm * bNorm;
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

function suppressComposition(a, b, left, right) {
  return left.refsSet.has(b.name) || right.refsSet.has(a.name) ? 'component-composition' : null;
}

function suppressWrapper(a, b, left, right) {
  if (!isWrapper(a, left) || !isWrapper(b, right)) return null;
  if (differentRefs(left.refs, right.refs)) return 'wrapper-different-base';

  const sameBase = left.topTag && left.topTag === right.topTag;
  const plain =
    len(a.logicTokens) + len(b.logicTokens) === 0 &&
    len(a.hooks) + len(b.hooks) === 0 &&
    len(a.textNodes) + len(b.textNodes) <= 3 &&
    len(a.literals) + len(b.literals) <= 6;

  return sameBase || plain ? 'wrapper-specialization' : null;
}

function suppressLowSignal(a, b, left, right) {
  const short = left.nonEmptyLines <= 16 && right.nonEmptyLines <= 16;
  if (!short) return null;
  if (!left.hasProps && !right.hasProps && !isWrapper(a, left) && !isWrapper(b, right)) {
    return null;
  }
  return left.signalScore <= 2 && right.signalScore <= 2 ? 'low-signal-pair' : null;
}

function isWrapper(component, meta = getComponentMeta(component)) {
  if (component.isWrapper) return true;
  return (
    meta.nonEmptyLines <= 8 &&
    meta.jsxTagKinds <= 2 &&
    meta.hasProps &&
    meta.logicAndHooks === 0 &&
    meta.textCount <= 2
  );
}

function topTagFrom(tags = []) {
  if (!tags.length) return null;
  const counts = tags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function calcSignalScore(component) {
  const parts = [
    new Set(component.logicTokens || []).size,
    new Set(component.hooks || []).size,
    new Set(component.classNames || []).size,
    new Set(component.textNodes || []).size,
    new Set(component.props?.names || []).size,
  ];
  return parts.reduce((sum, size) => sum + Math.min(size, 2), 0);
}

function countNonEmptyLines(source = '') {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function vectorNorm(vector = []) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) {
    sum += vector[i] * vector[i];
  }
  return Math.sqrt(sum);
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

function skipByPath(aDirs, bDirs, config) {
  const min = Number(config.minPathDistance || 0);
  return min > 0 && pathDistance(aDirs, bDirs) < min;
}

function pathDistance(left = [], right = []) {
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
