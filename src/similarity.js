import fs from 'fs';
import { buildRepresentation } from './representation.js';
import { loadStyles } from './styles.js';
import { labelPair } from './labels.js';
import { normalize, cosine } from './math.js';
import {
  loadCache,
  saveCache,
  buildCacheKey,
  modelKey,
  fingerprintRepresentation,
} from './cache.js';
import cliProgress from 'cli-progress';

const DEFAULT_WEIGHT = { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 };

/**
 * Generates embeddings for a list of components using the specified backend.
 * Handles caching to avoid re-embedding unchanged components.
 *
 * @param {Array<Object>} components - List of component metadata objects
 * @param {Object} backend - Embedding backend (local, remote, or mock)
 * @param {Object} config - Configuration object
 * @returns {Promise<{ entries: Array<Object>, cacheStats: Object }>} Component entries with vectors and cache statistics
 */
export async function embedComponents(components, backend, config) {
  const cache = loadCache(config.cachePath, config.language);
  const modelId = modelKey(config);
  let dirty = false;
  let cleaned = maybeCleanCache(cache, config);
  const cacheStats = { hits: 0, misses: 0, uncached: [] };
  const entries = [];
  const bar = config.showProgress
    ? new cliProgress.SingleBar({ clearOnComplete: true }, cliProgress.Presets.shades_classic)
    : null;
  bar?.start(components.length, 0);
  for (const component of components) {
    const { styleText, stylePaths, hasCssInJs } = loadStyles(component, config);
    const { codeRep, styleRep, structureRep, holisticRep } = buildRepresentation(
      component,
      styleText
    );
    const fingerprint = fingerprintRepresentation(
      codeRep,
      styleRep,
      styleText,
      structureRep,
      holisticRep
    );
    const cacheId = buildCacheKey(modelId, component.id);
    const cached = cache.entries?.[cacheId];

    let codeVec;
    let styleVec;
    let structureVec;
    let holisticVec;

    const fingerprintMatch = cached?.fingerprint === fingerprint;
    const cacheComplete = isCompleteCachedEntry(cached, fingerprint);
    if (cacheComplete) {
      cacheStats.hits += 1;
      ({ codeVec, styleVec, structureVec, holisticVec } = cached);
    } else {
      cacheStats.misses += 1;
      cacheStats.uncached.push(component.id);
      if (fingerprintMatch) {
        ({ codeVec, styleVec, structureVec, holisticVec } = cached);
      }
    }

    if (!codeVec) {
      codeVec = await backend.embed(codeRep);
      dirty = true;
    }
    const dimension = Math.max(1, codeVec.length);
    if (!styleVec) {
      styleVec = styleRep ? await backend.embed(styleRep) : zeroVector(dimension);
      dirty = true;
    }
    if (!structureVec) {
      structureVec = await backend.embed(structureRep);
      dirty = true;
    }
    if (!holisticVec) {
      holisticVec = await backend.embed(holisticRep);
      dirty = true;
    }

    const vector = combineVectors({ codeVec, styleVec, structureVec, holisticVec }, config.weight, {
      hasStyleSignal: Boolean((styleText || '').trim()),
    });
    entries.push({
      component,
      vector,
      codeVec,
      styleVec,
      structureVec,
      holisticVec,
      styleText,
      stylePaths,
      hasCssInJs,
      hasStyles: Boolean((styleText || '').trim()),
      representation: { codeRep, styleRep, structureRep, holisticRep },
    });
    cache.entries[cacheId] = {
      fingerprint,
      codeVec,
      styleVec,
      structureVec,
      holisticVec,
      filePath: component.filePath,
    };
    bar?.increment();
  }
  bar?.stop();
  if (dirty || cleaned > 0) {
    saveCache(config.cachePath, cache);
  }
  cacheStats.cleaned = cleaned;
  cacheStats.uncachedCount = cacheStats.uncached.length;
  return { entries, cacheStats };
}

/**
 * Compares component embeddings to find similar pairs.
 *
 * @param {Array<Object>} entries - List of component entries with vectors
 * @param {Object} config - Configuration object
 * @returns {{ pairs: Array<Object>, scorecard: Object }} Similar component pairs with similarity scores and labels plus aggregate stats
 */
export function findSimilarities(entries, config) {
  const pairs = [];
  const bestByComponent = new Map();
  let evaluatedPairs = 0;
  let similaritySum = 0;
  let maxSimilarity = 0;
  let suppressedPairs = 0;
  const suppressionReasons = {};
  const maxThreshold = config.maxSimilarityThreshold ?? 1;
  const compareEnabled = Array.isArray(config.compareGlobs) && config.compareGlobs.length > 0;

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const aTarget = entries[i].component.isCompareTarget;
      const bTarget = entries[j].component.isCompareTarget;
      if (compareEnabled && !(aTarget ^ bTarget)) {
        suppressedPairs += 1;
        suppressionReasons['compare-filter'] = (suppressionReasons['compare-filter'] || 0) + 1;
        continue;
      }
      const sim = cosine(entries[i].vector, entries[j].vector);
      evaluatedPairs += 1;
      similaritySum += sim;
      if (sim > maxSimilarity) maxSimilarity = sim;
      trackBestSimilarity(bestByComponent, entries[i].component.id, sim);
      trackBestSimilarity(bestByComponent, entries[j].component.id, sim);
      if (sim < config.similarityThreshold) continue;
      if (sim - maxThreshold > 1e-6) {
        suppressedPairs += 1;
        suppressionReasons['over-max-threshold'] =
          (suppressionReasons['over-max-threshold'] || 0) + 1;
        continue;
      }
      if (shouldSkipByPath(entries[i].component.filePath, entries[j].component.filePath, config)) {
        suppressedPairs += 1;
        suppressionReasons['near-path'] = (suppressionReasons['near-path'] || 0) + 1;
        continue;
      }
      const suppression = suppressPair(entries[i], entries[j]);
      if (suppression) {
        suppressedPairs += 1;
        suppressionReasons[suppression] = (suppressionReasons[suppression] || 0) + 1;
        continue;
      }
      const { labels, hints } = labelPair(entries[i], entries[j], sim, config);
      pairs.push({
        a: entries[i].component.id,
        b: entries[j].component.id,
        similarity: Number(sim.toFixed(4)),
        category: sim >= config.highSimilarityThreshold ? 'almost-identical' : 'near-duplicate',
        labels,
        hints,
      });
    }
  }
  /* v8 ignore next */
  const limited = limitMatches(pairs, config.limit);
  const scorecard = buildScorecard(
    bestByComponent,
    evaluatedPairs,
    similaritySum,
    maxSimilarity,
    suppressedPairs,
    suppressionReasons
  );
  return { pairs: limited, scorecard };
}

function limitMatches(pairs, limit) {
  if (limit == null || !Number.isFinite(limit)) {
    return pairs.sort((a, b) => b.similarity - a.similarity);
  }
  const counts = {};
  return pairs
    .sort((a, b) => b.similarity - a.similarity)
    .filter((pair) => {
      const aCount = counts[pair.a] || 0;
      const bCount = counts[pair.b] || 0;
      if (aCount >= limit || bCount >= limit) return false;
      counts[pair.a] = aCount + 1;
      counts[pair.b] = bCount + 1;
      return true;
    });
}

function combineVectors(vectors, weight = {}, options = {}) {
  const resolvedWeight = { ...DEFAULT_WEIGHT, ...weight };
  const parts = [
    { key: 'code', vec: vectors.codeVec, weight: resolvedWeight.code },
    {
      key: 'style',
      vec: vectors.styleVec,
      weight: options.hasStyleSignal === false ? 0 : resolvedWeight.style,
    },
    { key: 'structure', vec: vectors.structureVec, weight: resolvedWeight.structure },
    { key: 'holistic', vec: vectors.holisticVec, weight: resolvedWeight.holistic },
  ].filter((part) => Array.isArray(part.vec) && part.vec.length > 0 && part.weight > 0);

  if (!parts.length) return [];
  const size = Math.min(...parts.map((part) => part.vec.length));
  const totalWeight = parts.reduce((acc, part) => acc + part.weight, 0);
  const combined = new Array(size).fill(0);
  parts.forEach(({ vec, weight: w }) => {
    for (let i = 0; i < size; i += 1) {
      combined[i] += (vec[i] || 0) * (w / totalWeight);
    }
  });
  return normalize(combined);
}

function isCompleteCachedEntry(entry, fingerprint) {
  if (!entry || entry.fingerprint !== fingerprint) return false;
  return ['codeVec', 'styleVec', 'structureVec', 'holisticVec'].every(
    (key) => Array.isArray(entry[key]) && entry[key].length > 0
  );
}

function trackBestSimilarity(bestByComponent, componentId, similarity) {
  const current = bestByComponent.get(componentId) || 0;
  if (similarity > current) bestByComponent.set(componentId, similarity);
}

function buildScorecard(
  bestByComponent,
  evaluatedPairs,
  similaritySum,
  maxSimilarity,
  suppressedPairs,
  suppressionReasons
) {
  const bestValues = Array.from(bestByComponent.values());
  const meanSimilarity =
    evaluatedPairs === 0 ? 0 : Number((similaritySum / evaluatedPairs).toFixed(4));
  const minBestSimilarity =
    bestValues.length === 0 ? 0 : Number(Math.min(...bestValues).toFixed(4));
  const maxBestSimilarity =
    bestValues.length === 0 ? 0 : Number(Math.max(...bestValues).toFixed(4));
  return {
    meanSimilarity,
    maxSimilarity: Number(maxSimilarity.toFixed(4)),
    evaluatedPairs,
    coveredComponents: bestValues.length,
    suppressedPairs,
    suppressionReasons,
    minBestSimilarity,
    maxBestSimilarity,
  };
}

function zeroVector(length = 1) {
  return new Array(length).fill(0);
}

function suppressPair(entryA, entryB) {
  return (
    compositionSuppression(entryA.component, entryB.component) ||
    wrapperSuppression(entryA.component, entryB.component) ||
    lowSignalSuppression(entryA.component, entryB.component)
  );
}

function compositionSuppression(compA, compB) {
  const refsA = new Set(compA.componentRefs || []);
  const refsB = new Set(compB.componentRefs || []);
  if (refsA.has(compB.name) || refsB.has(compA.name)) {
    return 'component-composition';
  }
  return null;
}

function wrapperSuppression(compA, compB) {
  if (!isWrapperLike(compA) || !isWrapperLike(compB)) return null;
  if (differentWrappedBases(compA.componentRefs, compB.componentRefs))
    return 'wrapper-different-base';
  const baseA = dominantTag(compA);
  const baseB = dominantTag(compB);
  const sharedBase = baseA && baseA === baseB;
  const noCustomLogic =
    listLength(compA.logicTokens) + listLength(compB.logicTokens) === 0 &&
    listLength(compA.hooks) + listLength(compB.hooks) === 0;
  const leanText = listLength(compA.textNodes) + listLength(compB.textNodes) <= 3;
  const leanLiterals = listLength(compA.literals) + listLength(compB.literals) <= 6;
  if (sharedBase || (noCustomLogic && leanText && leanLiterals)) {
    return 'wrapper-specialization';
  }
  return null;
}

function lowSignalSuppression(compA, compB) {
  const shortEnough =
    countNonEmptyLines(compA.source) <= 16 && countNonEmptyLines(compB.source) <= 16;
  if (!shortEnough) return null;
  const propSurface = hasProps(compA) || hasProps(compB);
  const wrapperish = isWrapperLike(compA) || isWrapperLike(compB);
  if (!propSurface && !wrapperish) return null;
  const signalA = componentSignal(compA);
  const signalB = componentSignal(compB);
  if (signalA <= 2 && signalB <= 2) return 'low-signal-pair';
  return null;
}

function isWrapperLike(component) {
  if (component.isWrapper) return true;
  const tiny = countNonEmptyLines(component.source) <= 8;
  const shallowTree = new Set(component.jsxTags || []).size <= 2;
  const hasPropSurface = hasProps(component);
  const noLogic = (component.logicTokens?.length || 0) + (component.hooks?.length || 0) === 0;
  const limitedText = (component.textNodes?.length || 0) <= 2;
  return tiny && shallowTree && hasPropSurface && noLogic && limitedText;
}

function dominantTag(component) {
  const tags = Array.isArray(component.jsxTags) ? component.jsxTags : [];
  if (!tags.length) return null;
  const counts = tags.reduce((acc, tag) => {
    if (!acc[tag]) acc[tag] = 0;
    acc[tag] += 1;
    return acc;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

function componentSignal(component) {
  const buckets = [
    new Set(component.logicTokens || []).size,
    new Set(component.hooks || []).size,
    new Set(component.classNames || []).size,
    new Set(component.textNodes || []).size,
    new Set(component.props?.names || []).size,
  ];
  return buckets.reduce((acc, size) => acc + Math.min(size, 2), 0);
}

function countNonEmptyLines(source = '') {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function hasProps(component) {
  return (component.props?.names?.length || 0) + (component.props?.spreads || 0) > 0;
}

function listLength(list) {
  return Array.isArray(list) ? list.length : 0;
}

function differentWrappedBases(refsA = [], refsB = []) {
  if (!refsA.length || !refsB.length) return false;
  const setA = new Set(refsA);
  return !refsB.some((ref) => setA.has(ref));
}

function shouldSkipByPath(pathA, pathB, config) {
  const minDistance = Number(config.minPathDistance || 0);
  if (minDistance <= 0) return false;
  const distance = pathDistance(pathA, pathB);
  return distance < minDistance;
}

function pathDistance(pathA = '', pathB = '') {
  const partsA = splitDirs(pathA);
  const partsB = splitDirs(pathB);
  const maxIdx = Math.max(partsA.length, partsB.length);
  for (let i = 1; i <= maxIdx; i += 1) {
    const a = partsA[partsA.length - i];
    const b = partsB[partsB.length - i];
    if (a !== b) return i; // diverged at this depth from the bottom
    /* v8 ignore next */
    if (a === undefined || b === undefined) return i;
  }
  return 0;
}

function splitDirs(filePath) {
  /* v8 ignore next */
  if (!filePath) return [];
  return filePath
    .split(/[/\\]+/)
    .filter(Boolean)
    .slice(0, -1); // drop filename
}

function maybeCleanCache(cache, config) {
  if (!cache.entries || Math.random() > (config.cleanProbability || 0)) return 0;
  let removed = 0;
  Object.entries(cache.entries).forEach(([key, entry]) => {
    const filePath = entry?.filePath || extractFilePathFromCacheKey(key);
    if (filePath && !fs.existsSync(filePath)) {
      delete cache.entries[key];
      removed += 1;
    }
  });
  return removed;
}

function extractFilePathFromCacheKey(key) {
  if (!key) return null;
  const separatorIndex = key.lastIndexOf(':');
  if (separatorIndex === -1) return null;
  return key.slice(separatorIndex + 1).split('#')[0];
}
