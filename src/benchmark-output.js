import path from 'path';
import chalk from 'chalk';
import { writeFileAtomicSync } from './fs-atomic.js';

export function emitBenchmarkReport(report, options = {}) {
  const { i18n, outPath } = options;
  console.log(chalk.bold(`\n${i18n.benchmarkTitle}`));
  console.log(`  ${i18n.benchmarkSuiteLabel}: ${report.suite.name} (${report.suite.id})`);
  console.log(
    `  ${i18n.benchmarkDatasetLabel}: ${report.suite.componentCount} ${i18n.benchmarkComponentsLabel} · ${report.suite.pairCount} ${i18n.benchmarkPairsLabel} · ${report.suite.positivePairs} ${i18n.benchmarkPositivesLabel} · ${report.suite.hardNegativePairs} ${i18n.benchmarkHardNegativesLabel}`
  );
  console.log(chalk.dim(`  ${i18n.benchmarkMetricNote}`));
  console.log('');
  renderGrid(buildRows(report, i18n));

  if (outPath) {
    writeFileAtomicSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(chalk.dim(`\n${i18n.benchmarkOutputWrittenPrefix} ${path.resolve(outPath)}`));
  }
}

function buildRows(report, i18n) {
  const headers = [
    i18n.benchmarkModelLabel,
    i18n.benchmarkScoreLabel,
    'AP',
    'MRR',
    'R@1',
    'R@3',
    i18n.benchmarkBestF1Label,
    i18n.benchmarkThresholdLabel,
    i18n.benchmarkGapLabel,
    i18n.benchmarkHardNegFpLabel,
  ];
  const rows = report.results.map((result) => [
    result.label,
    formatMetric(result.metrics.benchmarkScore),
    formatMetric(result.metrics.averagePrecision),
    formatMetric(result.metrics.meanReciprocalRank),
    formatMetric(result.metrics.recallAt1),
    formatMetric(result.metrics.recallAt3),
    formatMetric(result.metrics.bestF1),
    formatMetric(result.metrics.bestThreshold),
    formatMetric(result.metrics.separationGap),
    `${result.metrics.hardNegativeFp}/${result.metrics.hardNegativeTotal}`,
  ]);
  return { headers, rows };
}

function renderGrid({ headers, rows }) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length))
  );
  const separator = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  console.log(chalk.dim(separator));
  console.log(renderRow(headers, widths, chalk.bold));
  console.log(chalk.dim(separator));
  rows.forEach((row) => console.log(renderRow(row, widths)));
  console.log(chalk.dim(separator));
}

function renderRow(values, widths, formatter = (value) => value) {
  const cells = values.map((value, index) => ` ${formatter(value.padEnd(widths[index], ' '))} `);
  return `|${cells.join('|')}|`;
}

function formatMetric(value) {
  return Number(value).toFixed(4);
}
