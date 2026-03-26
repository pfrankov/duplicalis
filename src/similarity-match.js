import os from 'os';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import {
  findSimilaritiesSync,
  finalizeSimilarityState,
  hasCompare,
  mergeSimilarityStates,
  processPairRange,
} from './similarity-match-core.js';

const DEFAULT_MIN_ENTRIES_FOR_WORKERS = 512;

export function findSimilarities(entries, config) {
  const workerCount = resolveWorkerCount(entries.length, config);
  if (workerCount <= 1) {
    return findSimilaritiesSync(entries, config);
  }
  return findSimilaritiesWithWorkers(entries, config, workerCount);
}

async function findSimilaritiesWithWorkers(entries, config, workerCount) {
  const compare = hasCompare(config);
  const ranges = buildRanges(entries.length, workerCount);
  /* v8 ignore next */
  if (ranges.length <= 1) {
    return finalizeSimilarityState(
      processPairRange(entries, config, 0, entries.length, compare),
      config
    );
  }

  const workerPath = fileURLToPath(new URL('./similarity-match-worker.js', import.meta.url));
  const workerPayload = buildWorkerPayload(entries);
  const workerConfig = buildWorkerConfig(config);
  const partialStates = await Promise.all(
    ranges.map(
      (range) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(workerPath, {
            workerData: { ...workerPayload, config: workerConfig, compare, range },
          });
          worker.once('message', resolve);
          worker.once('error', reject);
          worker.once('exit', (code) => {
            /* v8 ignore next */
            if (code !== 0) reject(new Error(`Similarity worker exited with code ${code}`));
          });
        })
    )
  );

  return finalizeSimilarityState(mergeSimilarityStates(partialStates), config);
}

/* v8 ignore start */
function resolveWorkerCount(entryCount, config = {}) {
  const requested = Number(config.similarityWorkers || 0);
  const available = Math.max(1, resolveParallelism() - 1);
  if (requested === 1) return 1;
  if (requested > 1) return Math.min(requested, available, entryCount);
  const minEntries = Number(config.similarityWorkerMinEntries || DEFAULT_MIN_ENTRIES_FOR_WORKERS);
  if (entryCount < minEntries) return 1;
  return Math.min(available, entryCount);
}
/* v8 ignore stop */

/* v8 ignore start */
function resolveParallelism() {
  return typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
}
/* v8 ignore stop */

function buildRanges(entryCount, workerCount) {
  /* v8 ignore next */
  if (entryCount < 2 || workerCount <= 1) return [{ start: 0, end: entryCount }];

  const ranges = [];
  let start = 0;
  let remaining = workerCount;
  let remainingPairs = totalPairs(entryCount, start);

  while (remaining > 0 && start < entryCount - 1) {
    const targetPairs = Math.ceil(remainingPairs / remaining);
    let end = start + 1;
    let covered = 0;

    while (end < entryCount && covered < targetPairs) {
      covered += entryCount - 1 - (end - 1);
      end += 1;
    }

    ranges.push({ start, end: Math.min(end, entryCount - 1) });
    start = Math.min(end, entryCount - 1);
    remaining -= 1;
    remainingPairs = totalPairs(entryCount, start);
  }

  /* v8 ignore next */
  if (!ranges.length) return [{ start: 0, end: entryCount }];
  const last = ranges[ranges.length - 1];
  ranges[ranges.length - 1] = { start: last.start, end: entryCount - 1 };
  return ranges.filter((range) => range.start < range.end);
}

function totalPairs(entryCount, startIndex) {
  const remaining = entryCount - startIndex;
  return remaining > 1 ? (remaining * (remaining - 1)) / 2 : 0;
}

function buildWorkerPayload(entries) {
  const vectorSize = maxVectorSize(entries, 'vector');
  const styleSize = maxVectorSize(entries, 'styleVec');
  const vectorBuffer = new SharedArrayBuffer(
    Float64Array.BYTES_PER_ELEMENT * entries.length * vectorSize
  );
  const styleBuffer = new SharedArrayBuffer(
    Float64Array.BYTES_PER_ELEMENT * entries.length * styleSize
  );
  const vectorView = new Float64Array(vectorBuffer);
  const styleView = new Float64Array(styleBuffer);

  const workerEntries = entries.map((entry, index) => {
    vectorView.set(entry.vector, index * vectorSize);
    styleView.set(entry.styleVec, index * styleSize);
    return {
      vectorIndex: index,
      vectorLength: entry.vector.length,
      styleIndex: index,
      styleLength: entry.styleVec.length,
      component: {
        id: entry.component.id,
        name: entry.component.name,
        filePath: entry.component.filePath,
        props: entry.component.props,
        hooks: entry.component.hooks,
        logicTokens: entry.component.logicTokens,
        literals: entry.component.literals,
        jsxTags: entry.component.jsxTags,
        textNodes: entry.component.textNodes,
        classNames: entry.component.classNames,
        componentRefs: entry.component.componentRefs,
        isWrapper: entry.component.isWrapper,
        source: entry.component.source,
        isCompareTarget: entry.component.isCompareTarget,
      },
      stylePaths: entry.stylePaths,
      hasCssInJs: entry.hasCssInJs,
      hasStyles: entry.hasStyles,
    };
  });

  return {
    entries: workerEntries,
    vectorBuffer,
    vectorSize,
    styleBuffer,
    styleSize,
  };
}

function maxVectorSize(entries, key) {
  /* v8 ignore next */
  return entries.reduce((max, entry) => Math.max(max, entry[key]?.length || 0), 1);
}

function buildWorkerConfig(config) {
  return {
    similarityThreshold: config.similarityThreshold,
    highSimilarityThreshold: config.highSimilarityThreshold,
    maxSimilarityThreshold: config.maxSimilarityThreshold,
    minPathDistance: config.minPathDistance,
    disableAnalyses: config.disableAnalyses,
    language: config.language,
    limit: config.limit,
  };
}
