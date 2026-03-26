import fs from 'fs';
import crypto from 'crypto';
import { encode, decode } from 'msgpackr';
import { getI18n } from './i18n.js';
import { writeFileAtomicSync } from './fs-atomic.js';
import { parseFile } from './parser.js';
import { clearStyleCache } from './styles.js';
import { ensureComponentAnalysis, sameFileState, snapshotFileState } from './component-analysis.js';

const ANALYSIS_CACHE_VERSION = 1;

export function loadComponentsWithCache(files, config) {
  clearStyleCache();
  const cache = loadAnalysisCache(config.analysisCachePath, config.language);
  const fileStateMemo = new Map();
  const configFingerprint = fingerprintConfig(config);
  const cleaned = cleanAnalysisCache(cache, fileStateMemo);
  const stats = { hits: 0, misses: 0, cleaned };
  let dirty = false;
  const components = [];

  files.forEach((filePath) => {
    const cached = hydrateCachedFile(filePath, configFingerprint, cache, fileStateMemo);
    if (cached) {
      stats.hits += 1;
      components.push(...cached);
      return;
    }

    stats.misses += 1;
    const parsed = parseFile(filePath, config).components.map((component) =>
      attachAnalysis(component, ensureComponentAnalysis(component, config))
    );
    cache.files[filePath] = buildFileEntry(filePath, parsed, configFingerprint, fileStateMemo);
    dirty = true;
    components.push(...parsed);
  });

  if (dirty || cleaned > 0) {
    saveAnalysisCache(config.analysisCachePath, cache);
  }

  return { components, cacheStats: stats };
}

export function loadAnalysisCache(cachePath, language) {
  if (!cachePath || !fs.existsSync(cachePath)) {
    return { version: ANALYSIS_CACHE_VERSION, files: {} };
  }

  try {
    const raw = fs.readFileSync(cachePath);
    let parsed;
    try {
      parsed = decode(raw);
    } catch (decodeError) {
      parsed = JSON.parse(raw.toString('utf8'));
    }
    /* v8 ignore next */
    if (parsed.version !== ANALYSIS_CACHE_VERSION || !parsed.files) {
      return { version: ANALYSIS_CACHE_VERSION, files: {} };
    }
    return { version: ANALYSIS_CACHE_VERSION, files: parsed.files };
  } catch (error) {
    const i18n = getI18n(language);
    console.warn(`${i18n.errCacheReadPrefix} ${cachePath}: ${error.message}`);
    return { version: ANALYSIS_CACHE_VERSION, files: {} };
  }
}

export function saveAnalysisCache(cachePath, cache) {
  if (!cachePath) return;
  writeFileAtomicSync(cachePath, encode(cache));
}

function hydrateCachedFile(filePath, configFingerprint, cache, fileStateMemo) {
  const entry = cache.files?.[filePath];
  if (!entry) return null;
  /* v8 ignore next */
  if (entry.configFingerprint !== configFingerprint) return null;

  const fileState = memoizedFileState(filePath, fileStateMemo);
  if (!sameFileState(entry.fileState, fileState)) return null;
  if (
    !entry.components.every((component) =>
      component.dependencies.every((dep) =>
        sameFileState(dep, memoizedFileState(dep.filePath, fileStateMemo))
      )
    )
  ) {
    return null;
  }

  return entry.components.map((record) =>
    attachAnalysis({ ...record.component }, { ...record.analysis })
  );
}

function buildFileEntry(filePath, components, configFingerprint, fileStateMemo) {
  return {
    fileState: memoizedFileState(filePath, fileStateMemo),
    configFingerprint,
    components: components.map((component) => ({
      component: stripAnalysis(component),
      analysis: component.analysis,
      /* v8 ignore next */
      dependencies: component.analysis.styleDependencies || [],
    })),
  };
}

function attachAnalysis(component, analysis) {
  component.analysis = analysis;
  return component;
}

function stripAnalysis(component) {
  const rest = { ...component };
  delete rest.analysis;
  return rest;
}

function fingerprintConfig(config) {
  const hash = crypto.createHash('sha1');
  hash.update(
    JSON.stringify({
      allowIgnores: Boolean(config.allowIgnores),
      /* v8 ignore next */
      styleExtensions: [...(config.styleExtensions || [])].sort(),
    })
  );
  return hash.digest('hex');
}

function cleanAnalysisCache(cache, fileStateMemo) {
  /* v8 ignore next */
  if (!cache.files) return 0;
  let removed = 0;
  Object.entries(cache.files).forEach(([filePath, entry]) => {
    const sourceState = memoizedFileState(filePath, fileStateMemo);
    if (!sourceState.exists) {
      delete cache.files[filePath];
      removed += 1;
      return;
    }
    /* v8 ignore next */
    const deps = entry.components?.flatMap((component) => component.dependencies || []) || [];
    const invalidDependency = deps.some(
      (dep) => dep.exists && !memoizedFileState(dep.filePath, fileStateMemo).exists
    );
    if (invalidDependency) {
      delete cache.files[filePath];
      removed += 1;
    }
  });
  return removed;
}

function memoizedFileState(filePath, memo) {
  if (memo.has(filePath)) return memo.get(filePath);
  const state = snapshotFileState(filePath);
  memo.set(filePath, state);
  return state;
}
