import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { banner } from './duplicalis.js';
import { duplicalisBanner } from './banner-text.js';
import { getI18n } from './i18n.js';

export function emitReport(entries, pairs = [], config, stats) {
  const i18n = getI18n(config?.language);
  const components = entries.map((entry) => ({
    id: entry.component.id,
    name: entry.component.name,
    filePath: relativize(entry.component.filePath, config.root, config.relativePaths),
    hasStyles: !!entry.styleText,
    hooks: entry.component.hooks.length,
    loc: entry.component.loc,
    snippet: trimSource(entry.component.source),
  }));

  const report = { components, pairs, stats };
  const outPath = config.out ? path.resolve(config.root, config.out) : null;
  if (outPath) {
    /* v8 ignore next */
    if (outPath.endsWith('.txt')) {
      fs.writeFileSync(outPath, toTextReport(report, entries, config), 'utf8');
    } else {
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    }
  }
  printConsole(report, config, outPath, entries, i18n);
}

function printConsole(report, config, outPath, entries, i18n) {
  printBanner();
  console.log('');
  printTextBanner();
  const mode = formatMode(config, i18n);
  console.log(chalk.bold(`\n${i18n.reportTitle}`));
  console.log(mode);
  printRunConfig(config, outPath, i18n);
  printMatches(report, config, entries, i18n);
  printStatsTable(report, outPath, i18n);
}

/* v8 ignore start */
function relativize(filePath, root, useRelative) {
  if (!filePath) return '';
  try {
    if (!useRelative) return filePath;
    const rel = path.relative(root || process.cwd(), filePath);
    return rel || filePath;
    /* v8 ignore next */
  } catch (_e) {
    return filePath;
  }
}
/* v8 ignore stop */

/* v8 ignore start */
function formatMode(config, i18n) {
  if (config.model === 'remote') {
    const remoteModel = config.remote?.model || i18n.notAvailable;
    const remoteUrl = config.remote?.url || i18n.notAvailable;
    return `${i18n.modeLabel}: ${i18n.modeRemoteLabel} (${remoteModel} @ ${remoteUrl})`;
  }
  if (config.model === 'mock') {
    return `${i18n.modeLabel}: ${i18n.modeMockLabel} (${i18n.modeMockDetail})`;
  }
  const autoDownload = config.autoDownloadModel ? i18n.on : i18n.off;
  return `${i18n.modeLabel}: ${i18n.modeLocalLabel} (${i18n.modePathLabel}: ${config.modelPath}, ${i18n.modeAutoDownloadLabel}: ${autoDownload})`;
}
/* v8 ignore stop */

function printRunConfig(config, outPath, i18n) {
  console.log(chalk.bold(i18n.runConfigTitle));
  console.log(`  ${i18n.labelRoot}: ${config.root}`);
  if (config.configPath) {
    const suffix = config.configSaved ? i18n.configUpdatedSuffix : '';
    console.log(`  ${i18n.labelConfig}: ${config.configPath}${suffix}`);
  }
  if (outPath) console.log(`  ${i18n.labelOutput}: ${outPath}`);
  console.log(`  ${i18n.labelCache}: ${config.cachePath || i18n.noneValue}`);
  console.log(
    `  ${i18n.labelThresholds}: ${i18n.thresholdsMinLabel} ${config.similarityThreshold} · ${i18n.thresholdsHighLabel} ${config.highSimilarityThreshold} · ${i18n.thresholdsMaxLabel} ${config.maxSimilarityThreshold ?? 1}`
  );
  const limitText =
    typeof config.limit === 'number' && Number.isFinite(config.limit)
      ? config.limit
      : i18n.allValue;
  console.log(`  ${i18n.labelLimit}: ${limitText}`);
  console.log(`  ${i18n.labelInclude}: ${(config.include || []).join(', ') || i18n.noneSymbol}`);
  console.log(`  ${i18n.labelExclude}: ${(config.exclude || []).join(', ') || i18n.noneSymbol}`);
  console.log(`  ${i18n.labelLanguage}: ${i18n.lang}`);
}

function printMatches(report, config, entries, i18n) {
  console.log(chalk.bold(`\n${i18n.topMatchesTitle}`));
  if (!report.pairs.length) {
    console.log(`  ${i18n.noneAboveThreshold}`);
    return;
  }
  const byId = new Map(entries.map((e) => [e.component.id, e]));
  const separator = chalk.dim('─'.repeat(80));
  const limit = Number.isFinite(config.limit) ? config.limit : report.pairs.length;
  const maxPairs = Math.min(limit, report.pairs.length);
  report.pairs.slice(0, maxPairs).forEach((pair, idx) => {
    const left = byId.get(pair.a);
    const right = byId.get(pair.b);
    console.log(`\n${separator}`);
    const number = chalk.black.bgYellow.bold(` ${String(idx + 1).padStart(2, ' ')} `);
    const title = `${number}  ${i18n.scoreLabel}: ${pair.similarity}`;
    console.log(chalk.bold(chalk.cyan(title)));
    const tagLine = pair.labels.length
      ? pair.labels.map((l) => `#${l}`).join('    ')
      : i18n.noneSymbol;
    console.log(chalk.white(tagLine));
    if (pair.hints?.length) {
      pair.hints.forEach((h) => console.log(chalk.gray(`  - ${h}`)));
    }
    printSnippetBlock('A', left?.component, config.root, config.relativePaths, i18n);
    printSnippetBlock('B', right?.component, config.root, config.relativePaths, i18n);
  });
  console.log(separator);
}

function printSnippetBlock(label, component, root, useRelative, i18n) {
  if (!component) return;
  console.log('');
  const displayPath = relativize(component.filePath, root, useRelative);
  const header = `${label}) ${component.name}`;
  console.log(chalk.yellow(header));
  console.log(chalk.gray(`    ${displayPath}`));
  const snippet = trimSource(component.source);
  if (!snippet.trim()) {
    console.log(`    ${i18n.noSnippet}`);
    return;
  }
  const highlighted = applyHighlight(snippet, component.filePath);
  const lines = highlighted.split('\n');
  lines.forEach((line) => console.log(`    ${line}`));
}

function trimSource(source = '') {
  const lines = source.split('\n').filter((l) => l.trim() !== '');
  const limited = lines.slice(0, 12);
  const processed = limited.map((line) => (line.length > 120 ? `${line.slice(0, 117)}...` : line));
  return processed.join('\n');
}

/* v8 ignore start */
function applyHighlight(snippet, filePath) {
  try {
    const language = detectLanguage(filePath);
    return highlight(snippet, { language, ignoreIllegals: true });
  } catch (error) {
    /* v8 ignore next */
    return snippet;
  }
}

function detectLanguage(filePath) {
  if (!filePath) return undefined;
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) return 'javascript';
  if (
    filePath.endsWith('.css') ||
    filePath.endsWith('.scss') ||
    filePath.endsWith('.sass') ||
    filePath.endsWith('.less')
  )
    return 'css';
  return undefined;
}
/* v8 ignore stop */

function printStatsTable(report, outPath, i18n) {
  console.log(chalk.bold(`\n${i18n.runStatsTitle}`));
  const rows = buildStatsRows(report, i18n);
  renderTable(rows);
  if (outPath) console.log(chalk.dim(`${i18n.jsonWrittenPrefix} ${outPath}`));
}

function buildStatsRows(report, i18n) {
  const stats = report.stats || {};
  const scorecard = stats.scorecard || {};
  const cache = stats.cache || {};
  const cacheParts = [
    cache.hits != null ? `${i18n.cacheHits} ${cache.hits}` : null,
    cache.misses != null ? `${i18n.cacheMisses} ${cache.misses}` : null,
    cache.cleaned != null ? `${i18n.cacheCleaned} ${cache.cleaned}` : null,
    cache.uncachedCount != null ? `${i18n.cacheUncached} ${cache.uncachedCount}` : null,
  ].filter(Boolean);
  const timingParts = [
    stats.scanMs != null ? `${i18n.timingScan} ${stats.scanMs}ms` : null,
    stats.parseMs != null ? `${i18n.timingParse} ${stats.parseMs}ms` : null,
    stats.embedMs != null ? `${i18n.timingEmbed} ${stats.embedMs}ms` : null,
    stats.similarityMs != null ? `${i18n.timingSimilarity} ${stats.similarityMs}ms` : null,
  ].filter(Boolean);
  const pairedCount = countPairedComponents(report.pairs);
  const componentCount = report.components.length;
  const coveragePercent =
    componentCount === 0 ? 0 : Math.round((pairedCount / componentCount) * 100);
  return [
    {
      label: i18n.statsMatchCoverage,
      value: `${pairedCount}/${componentCount} (${coveragePercent}%)`,
      emphasis: true,
    },
    { label: i18n.statsPairsReported, value: report.pairs.length },
    { label: i18n.statsPairsSuppressed, value: formatSuppression(scorecard, i18n) },
    { label: i18n.statsComponentsScanned, value: componentCount },
    { label: i18n.statsTimings, value: timingParts.join(' | ') || i18n.notAvailable },
    { label: i18n.statsCache, value: cacheParts.join(' | ') || i18n.notAvailable },
  ];
}

function renderTable(rows) {
  const normalized = rows.map((row) => ({
    label: row.label,
    value: String(row.value),
    emphasis: row.emphasis,
  }));
  const labelWidth = Math.max(...normalized.map((row) => row.label.length));
  const valueWidth = Math.max(...normalized.map((row) => row.value.length));
  const totalWidth = labelWidth + valueWidth + 7;
  const top = `┌${'─'.repeat(totalWidth - 2)}┐`;
  const divider = `├${'─'.repeat(totalWidth - 2)}┤`;
  const bottom = `└${'─'.repeat(totalWidth - 2)}┘`;
  console.log(chalk.dim(top));
  normalized.forEach((row, index) => {
    const label = row.label.padEnd(labelWidth, ' ');
    const valueText = row.value.padEnd(valueWidth, ' ');
    const renderedValue = row.emphasis ? chalk.black.bgYellow(` ${valueText} `) : ` ${valueText} `;
    const renderedLabel = ` ${label} `;
    console.log(`│${renderedLabel}│${renderedValue}│`);
    if (index === 0) console.log(chalk.dim(divider));
  });
  console.log(chalk.dim(bottom));
}

function formatSuppression(scorecard, i18n) {
  if (!scorecard || typeof scorecard.suppressedPairs !== 'number') return i18n.notAvailable;
  if (scorecard.suppressedPairs === 0) return '0';
  const reasons = scorecard.suppressionReasons || {};
  const parts = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} ${count}`);
  return `${scorecard.suppressedPairs}${parts.length ? ` (${parts.join(' | ')})` : ''}`;
}

function countPairedComponents(pairs) {
  const ids = new Set();
  pairs.forEach((pair) => {
    if (pair.a) ids.add(pair.a);
    if (pair.b) ids.add(pair.b);
  });
  return ids.size;
}

/* v8 ignore start */
function printBanner() {
  if (!banner) return;
  const width = process.stdout.columns || 80;
  const lines = banner.trimEnd().split('\n');
  lines.forEach((line) => {
    const trimmed = line.replace(/\s+$/, '');
    const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
    console.log(' '.repeat(pad) + colorizeLine(trimmed));
  });
}

function colorizeLine(line) {
  const shades = {
    ' ': ' ',
    // light to dark palette tuned to the provided reference
    '░': chalk.hex('#8b4f34')('░'),
    '▒': chalk.hex('#c67856')('▒'),
    '▓': chalk.hex('#f2a47f')('▓'),
    '█': chalk.hex('#f7c2a0')('█'),
  };
  let result = '';
  for (const char of line) {
    result += shades[char] || char;
  }
  return result;
}

function printTextBanner() {
  if (!duplicalisBanner) return;
  const width = process.stdout.columns || 80;
  const lines = duplicalisBanner.trim().split('\n');
  lines.forEach((line) => {
    const trimmed = line.replace(/\s+$/, '');
    const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
    console.log(' '.repeat(pad) + trimmed);
  });
}
/* v8 ignore stop */

function toTextReport(report, entries, config) {
  const byId = new Map(entries.map((e) => [e.component.id, e.component]));
  const lines = [];
  report.pairs.forEach((pair) => {
    const compA = byId.get(pair.a);
    const compB = byId.get(pair.b);
    const labels = pair.labels.length ? pair.labels.map((l) => `#${l}`).join('\t') : '-';
    lines.push(`${pair.similarity} | ${labels}`);
    if (compA) {
      lines.push(relativize(compA.filePath, config.root, config.relativePaths));
    }
    if (compB) {
      lines.push(relativize(compB.filePath, config.root, config.relativePaths));
    }
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}
