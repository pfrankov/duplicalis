import fs from 'fs';
import cliProgress from 'cli-progress';
import { buildRepresentation } from './representation.js';
import { loadStyles } from './styles.js';
import { normalize } from './math.js';
import {
  loadCache,
  saveCache,
  buildCacheKey,
  modelKey,
  fingerprintRepresentation,
} from './cache.js';

const DEFAULT_WEIGHT = { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 };
const VEC_KEYS = ['codeVec', 'styleVec', 'structureVec', 'holisticVec'];

export async function embedComponents(components, backend, config) {
  const cache = loadCache(config.cachePath, config.language);
  const modelId = modelKey(config);
  const cleaned = cleanCache(cache, config);
  const stats = { hits: 0, misses: 0, uncached: [] };
  const entries = [];
  const memo = new Map();
  const bar = createBar(config.showProgress, components.length);
  let dirty = false;

  for (const component of components) {
    const result = await embedComponent(component, backend, config, cache, modelId, stats, memo);
    entries.push(result.entry);
    cache.entries[result.cacheId] = result.cacheValue;
    dirty = dirty || result.dirty;
    bar?.increment();
  }

  bar?.stop();
  if (dirty || cleaned > 0) {
    saveCache(config.cachePath, cache);
  }
  stats.cleaned = cleaned;
  stats.uncachedCount = stats.uncached.length;
  return { entries, cacheStats: stats };
}

function createBar(show, total) {
  if (!show) return null;
  const bar = new cliProgress.SingleBar(
    { clearOnComplete: true },
    cliProgress.Presets.shades_classic
  );
  bar.start(total, 0);
  return bar;
}

async function embedComponent(component, backend, config, cache, modelId, stats, memo) {
  const styles = loadStyles(component, config);
  const rep = buildRepresentation(component, styles.styleText);
  const cached = getCached(component, rep, styles.styleText, cache, modelId, stats);
  const vecs = await embedMissing(cached.vectors, rep, backend, memo);
  const hasStyles = Boolean((styles.styleText || '').trim());
  return {
    entry: {
      component,
      vector: combineVectors(vecs.vectors, config.weight, hasStyles),
      ...vecs.vectors,
      styleText: styles.styleText,
      stylePaths: styles.stylePaths,
      hasCssInJs: styles.hasCssInJs,
      hasStyles,
      representation: rep,
    },
    cacheId: cached.cacheId,
    cacheValue: {
      fingerprint: cached.fingerprint,
      ...vecs.vectors,
      filePath: component.filePath,
    },
    dirty: vecs.dirty || !cached.complete,
  };
}

function getCached(component, rep, styleText, cache, modelId, stats) {
  const fingerprint = fingerprintRepresentation(
    rep.codeRep,
    rep.styleRep,
    styleText,
    rep.structureRep,
    rep.holisticRep
  );
  const cacheId = buildCacheKey(modelId, component.id);
  const entry = cache.entries?.[cacheId];
  const complete = hasAllVectors(entry, fingerprint);

  if (complete) {
    stats.hits += 1;
    return { cacheId, fingerprint, complete, vectors: pickVecs(entry) };
  }

  stats.misses += 1;
  stats.uncached.push(component.id);
  return {
    cacheId,
    fingerprint,
    complete,
    vectors: entry?.fingerprint === fingerprint ? pickVecs(entry) : {},
  };
}

function pickVecs(entry = {}) {
  const { codeVec, styleVec, structureVec, holisticVec } = entry;
  return { codeVec, styleVec, structureVec, holisticVec };
}

async function embedMissing(vectors, rep, backend, memo) {
  const code = await getVec(vectors.codeVec, rep.codeRep, backend, memo);
  const size = Math.max(1, code.value.length);
  const style = await getVec(vectors.styleVec, rep.styleRep, backend, memo, size);
  const structure = await getVec(vectors.structureVec, rep.structureRep, backend, memo);
  const holistic = await getVec(vectors.holisticVec, rep.holisticRep, backend, memo);
  return {
    vectors: {
      codeVec: code.value,
      styleVec: style.value,
      structureVec: structure.value,
      holisticVec: holistic.value,
    },
    dirty: code.dirty || style.dirty || structure.dirty || holistic.dirty,
  };
}

async function getVec(current, rep, backend, memo, size = 1) {
  if (current) return { value: current, dirty: false };
  if (!rep) return { value: zeroVec(size), dirty: true };
  return getMemo(rep, backend, memo);
}

async function getMemo(rep, backend, memo) {
  if (memo.has(rep)) {
    return { value: await memo.get(rep), dirty: false };
  }
  const pending = Promise.resolve(backend.embed(rep)).catch((error) => {
    memo.delete(rep);
    throw error;
  });
  memo.set(rep, pending);
  return { value: await pending, dirty: true };
}

function combineVectors(vectors, weight = {}, hasStyles) {
  const resolved = { ...DEFAULT_WEIGHT, ...weight };
  const parts = [
    { vec: vectors.codeVec, weight: resolved.code },
    { vec: vectors.styleVec, weight: hasStyles ? resolved.style : 0 },
    { vec: vectors.structureVec, weight: resolved.structure },
    { vec: vectors.holisticVec, weight: resolved.holistic },
  ].filter((part) => Array.isArray(part.vec) && part.vec.length > 0 && part.weight > 0);

  if (!parts.length) return [];
  const size = Math.min(...parts.map((part) => part.vec.length));
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const out = new Array(size).fill(0);

  parts.forEach(({ vec, weight: value }) => {
    for (let i = 0; i < size; i += 1) {
      out[i] += (vec[i] || 0) * (value / total);
    }
  });

  return normalize(out);
}

function hasAllVectors(entry, fingerprint) {
  if (!entry || entry.fingerprint !== fingerprint) return false;
  return VEC_KEYS.every((key) => Array.isArray(entry[key]) && entry[key].length > 0);
}

function zeroVec(size = 1) {
  return new Array(size).fill(0);
}

function cleanCache(cache, config) {
  if (!cache.entries || Math.random() > (config.cleanProbability || 0)) return 0;
  let removed = 0;

  Object.entries(cache.entries).forEach(([key, entry]) => {
    const filePath = entry?.filePath || fileFromKey(key);
    if (filePath && !fs.existsSync(filePath)) {
      delete cache.entries[key];
      removed += 1;
    }
  });

  return removed;
}

function fileFromKey(key) {
  if (!key) return null;
  const index = key.lastIndexOf(':');
  if (index === -1) return null;
  return key.slice(index + 1).split('#')[0];
}
