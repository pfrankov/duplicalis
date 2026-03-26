import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { run } from '../src/index.js';

describe('end-to-end run', () => {
  it('produces report with labeled duplicates', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-report-'));
    const out = path.join(dir, 'report.json');
    const config = {
      root: path.resolve('.'),
      include: ['examples/**/*.ts', 'examples/**/*.tsx'],
      exclude: ['**/node_modules/**'],
      similarityThreshold: 0.7,
      highSimilarityThreshold: 0.9,
      limit: 5,
      model: 'mock',
      out,
      styleExtensions: ['.css'],
      disableAnalyses: [],
      allowIgnores: true,
      remote: {},
      weight: { code: 0.7, style: 0.3 },
    };
    await run(config);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const primarySecondary = report.pairs.find(
      (p) => p.a.includes('PrimaryButton') && p.b.includes('SecondaryButton')
    );
    expect(primarySecondary).toBeUndefined();

    const stylePair = report.pairs.find(
      (p) => p.a.includes('StyleBox') && p.b.includes('StyleBoxAlt')
    );
    expect(stylePair?.labels).toContain('style-duplicate');

    const wrapperPair = report.pairs.find((p) => p.labels.includes('wrapper-duplicate'));
    expect(wrapperPair).toBeDefined();

    expect(report.stats?.scorecard?.coveredComponents).toBeGreaterThan(0);
    expect(report.stats?.scorecard?.suppressionReasons?.['wrapper-specialization']).toBeGreaterThan(
      0
    );
    const ids = report.components.map((c) => c.id);
    expect(ids.some((id) => id.includes('examples/Ignored.tsx'))).toBe(false);
  });

  it('filters components by name and usage patterns', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-filter-'));
    const out = path.join(dir, 'report.json');
    const file = path.join(dir, 'Play.tsx');
    fs.writeFileSync(
      file,
      `
      import { Playground } from './Playground';
      export const KeepMe = () => <div>ok</div>;
      export const SkipMe = () => <Playground Component={KeepMe} />;
      `
    );
    const config = {
      root: dir,
      include: [`${dir}/**/*.tsx`],
      exclude: [],
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 1,
      limit: 5,
      model: 'mock',
      out,
      styleExtensions: ['.css'],
      disableAnalyses: [],
      allowIgnores: true,
      remote: {},
      weight: { code: 0.7, style: 0.3 },
      ignoreComponentNamePatterns: ['^Skip'],
      ignoreComponentUsagePatterns: ['Playground'],
    };
    await run(config);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report.components.some((c) => c.name === 'SkipMe')).toBe(false);
    expect(report.components.some((c) => c.name === 'KeepMe')).toBe(true);
  });

  it('honors compare globs to report only target vs baseline pairs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-compare-'));
    const out = path.join(dir, 'report.json');
    const config = {
      root: path.resolve('.'),
      include: ['examples/CardA.tsx', 'examples/CardB.tsx'],
      exclude: ['**/node_modules/**'],
      similarityThreshold: 0.7,
      highSimilarityThreshold: 0.9,
      limit: 5,
      model: 'mock',
      out,
      styleExtensions: ['.css'],
      disableAnalyses: [],
      allowIgnores: true,
      remote: {},
      weight: { code: 0.7, style: 0.3 },
      compareGlobs: ['examples/CardA.tsx'],
    };
    await run(config);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report.pairs.length).toBe(1);
    const pair = report.pairs[0];
    expect(pair.a.includes('CardA')).toBe(true);
    expect(pair.b.includes('CardB')).toBe(true);
  });
});
