import { isMainThread, parentPort, workerData } from 'worker_threads';
import { processPairRange } from './similarity-match-core.js';

export function runSimilarityWorker(data = workerData, port = parentPort) {
  const entries = materializeEntries(data);
  const { config, compare, range } = data;
  const state = processPairRange(entries, config, range.start, range.end, compare);
  port?.postMessage(state);
  return state;
}

/* v8 ignore next */
if (!isMainThread && parentPort && workerData) runSimilarityWorker();

function materializeEntries({ entries, vectorBuffer, vectorSize, styleBuffer, styleSize }) {
  const vectorView = new Float64Array(vectorBuffer);
  const styleView = new Float64Array(styleBuffer);
  return entries.map((entry) => ({
    ...entry,
    vector: viewRow(vectorView, entry.vectorIndex, vectorSize, entry.vectorLength),
    styleVec: viewRow(styleView, entry.styleIndex, styleSize, entry.styleLength),
  }));
}

function viewRow(view, index, size, length) {
  const start = index * size;
  return view.subarray(start, start + length);
}
