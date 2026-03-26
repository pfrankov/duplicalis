import { findSourceFiles } from './scanner.js';
import { loadComponentsWithCache } from './analysis-cache.js';
import { createEmbeddingBackend } from './embedding/index.js';
import { embedComponents, findSimilarities } from './similarity.js';
import { emitReport } from './output.js';
import { shouldIgnoreComponent } from './filters.js';
import micromatch from 'micromatch';
import path from 'path';

/**
 * Main execution entry point.
 * Scans, parses, embeds, and finds similarities between components.
 *
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
export async function run(config) {
  const stats = {};
  const scanStart = Date.now();
  const files = await findSourceFiles(config);
  stats.scanMs = Date.now() - scanStart;

  const parseStart = Date.now();
  const parsed = loadComponentsWithCache(files, config);
  let components = parsed.components;
  components = components.filter((component) => !shouldIgnoreComponent(component, config));
  markCompareTargets(components, config);
  stats.parseMs = Date.now() - parseStart;
  stats.analysisCache = parsed.cacheStats;

  const backend = await createEmbeddingBackend(config);
  const embedStart = Date.now();
  const { entries, cacheStats } = await embedComponents(components, backend, config);
  stats.embedMs = Date.now() - embedStart;
  stats.cache = cacheStats;

  const similarityStart = Date.now();
  const { pairs, scorecard } = await findSimilarities(entries, config);
  stats.similarityMs = Date.now() - similarityStart;
  stats.scorecard = scorecard;

  emitReport(entries, pairs, config, stats);
}

function markCompareTargets(components, config) {
  const globs = config.compareGlobs || [];
  if (!globs.length) return;
  components.forEach((component) => {
    component.isCompareTarget = isCompareMatch(component.filePath, config.root, globs);
  });
}

function isCompareMatch(filePath, root, globs) {
  const rel = path.relative(root, filePath);
  return micromatch.isMatch(filePath, globs) || micromatch.isMatch(rel, globs);
}
