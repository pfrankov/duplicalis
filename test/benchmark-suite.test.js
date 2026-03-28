import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { canonicalPairKey, loadBenchmarkSuite } from '../src/benchmark-suite.js';

describe('benchmark suite', () => {
  it('loads the bundled suite and resolves absolute component ids', () => {
    const suite = loadBenchmarkSuite('benchmarks/react-component-duplicates-v1/manifest.json');
    const invoices = `${path.resolve('benchmarks/react-component-duplicates-v1/empty/NoInvoicesState.tsx')}#NoInvoicesState`;
    const orders = `${path.resolve('benchmarks/react-component-duplicates-v1/empty/NoOrdersState.tsx')}#NoOrdersState`;
    expect(suite.id).toBe('react-component-duplicates-v1');
    expect(suite.duplicateGroups).toHaveLength(12);
    expect(suite.hardNegativePairs).toHaveLength(16);
    expect(suite.positivePairs.has(canonicalPairKey(invoices, orders))).toBe(true);
  });

  it('throws when a reference omits the component name', () => {
    const manifestPath = writeManifest({
      duplicateGroups: [{ id: 'broken', components: ['cards/Card.tsx'] }],
    });
    expect(() => loadBenchmarkSuite(manifestPath)).toThrow(/must include "#"/);

    const missingRef = writeManifest({
      duplicateGroups: [{ id: 'broken', components: [null, 'cards/Card.tsx#Card'] }],
    });
    expect(() => loadBenchmarkSuite(missingRef)).toThrow(/must include "#"/);
  });

  it('throws when a group is invalid', () => {
    const noId = writeManifest({
      duplicateGroups: [{ components: ['a.tsx#A', 'b.tsx#B'] }],
    });
    expect(() => loadBenchmarkSuite(noId)).toThrow(/missing an id/);

    const tooSmall = writeManifest({
      duplicateGroups: [{ id: 'solo', components: ['a.tsx#A'] }],
    });
    expect(() => loadBenchmarkSuite(tooSmall)).toThrow(/at least two components/);

    const duplicateId = writeManifest({
      duplicateGroups: [
        { id: 'dup', components: ['a.tsx#A', 'b.tsx#B'] },
        { id: 'dup', components: ['c.tsx#C', 'd.tsx#D'] },
      ],
    });
    expect(() => loadBenchmarkSuite(duplicateId)).toThrow(/Duplicate benchmark group id/);

    const missingComponents = writeManifest({
      duplicateGroups: [{ id: 'missing-components' }],
    });
    expect(() => loadBenchmarkSuite(missingComponents)).toThrow(/at least two components/);
  });

  it('throws on overlapping or invalid hard negatives', () => {
    const overlap = writeManifest({
      duplicateGroups: [{ id: 'pair', components: ['a.tsx#A', 'b.tsx#B'] }],
      hardNegativePairs: [{ a: 'a.tsx#A', b: 'b.tsx#B' }],
    });
    expect(() => loadBenchmarkSuite(overlap)).toThrow(/overlaps a positive pair/);

    const duplicatePair = writeManifest({
      duplicateGroups: [{ id: 'pair', components: ['a.tsx#A', 'b.tsx#B'] }],
      hardNegativePairs: [
        { a: 'a.tsx#A', b: 'c.tsx#C' },
        { a: 'c.tsx#C', b: 'a.tsx#A' },
      ],
    });
    expect(() => loadBenchmarkSuite(duplicatePair)).toThrow(
      /Duplicate benchmark hard negative pair/
    );

    const selfPair = writeManifest({
      duplicateGroups: [{ id: 'pair', components: ['a.tsx#A', 'b.tsx#B'] }],
      hardNegativePairs: [{ a: 'c.tsx#C', b: 'c.tsx#C' }],
    });
    expect(() => loadBenchmarkSuite(selfPair)).toThrow(/repeats the same component/);
  });

  it('fills in optional manifest defaults on a valid minimal suite', () => {
    const manifestPath = writeRawManifest({
      duplicateGroups: [{ id: 'pair', components: ['a.tsx#A', 'b.tsx#B'] }],
    });
    const suite = loadBenchmarkSuite(manifestPath);
    expect(suite.id).toBe(path.basename(path.dirname(manifestPath)));
    expect(suite.name).toBe('React duplicate benchmark');
    expect(suite.description).toBe('');
    expect(suite.include).toEqual(['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js']);
    expect(suite.exclude).toEqual([]);
    expect(suite.styleExtensions).toEqual(['.css', '.scss', '.sass', '.less']);
  });

  it('allows an empty suite when duplicate groups are omitted', () => {
    const manifestPath = writeRawManifest({});
    const suite = loadBenchmarkSuite(manifestPath);
    expect(suite.duplicateGroups).toEqual([]);
    expect(suite.hardNegativePairs).toEqual([]);
    expect(suite.positivePairs.size).toBe(0);
  });
});

function writeManifest(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-benchmark-suite-'));
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        id: 'tmp-suite',
        duplicateGroups: data.duplicateGroups || [],
        hardNegativePairs: data.hardNegativePairs || [],
      },
      null,
      2
    )
  );
  return manifestPath;
}

function writeRawManifest(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-benchmark-suite-raw-'));
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));
  return manifestPath;
}
