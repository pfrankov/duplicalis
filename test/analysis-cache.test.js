import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  loadAnalysisCache,
  loadComponentsWithCache,
  saveAnalysisCache,
} from '../src/analysis-cache.js';
import {
  resolveStyleDependency,
  sameFileState,
  snapshotFileState,
} from '../src/component-analysis.js';

describe('analysis cache', () => {
  it('reuses cached parsed components and representations for unchanged files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-cache-'));
    const css = path.join(dir, 'Button.css');
    const file = path.join(dir, 'Button.tsx');
    fs.writeFileSync(css, '.btn { color: red; }');
    fs.writeFileSync(
      file,
      `
      import './Button.css';
      export function Button({ label }) {
        return <button className="btn">{label}</button>;
      }
      `
    );
    const config = {
      root: dir,
      allowIgnores: true,
      styleExtensions: ['.css'],
      analysisCachePath: path.join(dir, 'analysis.msgpack'),
    };

    const first = loadComponentsWithCache([file], config);
    const second = loadComponentsWithCache([file], config);

    expect(first.cacheStats.misses).toBe(1);
    expect(second.cacheStats.hits).toBe(1);
    expect(second.components[0].analysis.representation.codeRep).toContain('COMPONENT Button');
  });

  it('loads empty analysis cache when missing or invalid and saves caches to disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-read-'));
    const cachePath = path.join(dir, 'analysis.msgpack');
    expect(loadAnalysisCache(cachePath).files).toEqual({});

    fs.writeFileSync(cachePath, 'not valid');
    expect(loadAnalysisCache(cachePath).files).toEqual({});

    fs.writeFileSync(cachePath, JSON.stringify({ version: 0, files: { stale: true } }));
    expect(loadAnalysisCache(cachePath).files).toEqual({});

    saveAnalysisCache(cachePath, { version: 1, files: { ok: {} } });
    expect(loadAnalysisCache(cachePath).files.ok).toBeDefined();
  });

  it('invalidates cached representations when a dependent stylesheet changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-style-'));
    const css = path.join(dir, 'Card.css');
    const file = path.join(dir, 'Card.tsx');
    fs.writeFileSync(css, '.card { color: red; }');
    fs.writeFileSync(
      file,
      `
      import './Card.css';
      export function Card() {
        return <div className="card">x</div>;
      }
      `
    );
    const config = {
      root: dir,
      allowIgnores: true,
      styleExtensions: ['.css'],
      analysisCachePath: path.join(dir, 'analysis.msgpack'),
    };

    loadComponentsWithCache([file], config);
    fs.writeFileSync(css, '.card { color: blue; }');

    const reloaded = loadComponentsWithCache([file], config);
    expect(reloaded.cacheStats.misses).toBe(1);
    expect(reloaded.components[0].analysis.styleText).toContain('blue');
  });

  it('invalidates cached parsed analysis when the source file changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-source-'));
    const file = path.join(dir, 'Badge.tsx');
    fs.writeFileSync(
      file,
      `
      export function Badge() {
        return <div>red</div>;
      }
      `
    );
    const config = {
      root: dir,
      allowIgnores: true,
      styleExtensions: ['.css'],
      analysisCachePath: path.join(dir, 'analysis.msgpack'),
    };

    loadComponentsWithCache([file], config);
    fs.writeFileSync(
      file,
      `
      export function Badge() {
        return <div>blue</div>;
      }
      `
    );

    const reloaded = loadComponentsWithCache([file], config);
    expect(reloaded.cacheStats.misses).toBe(1);
    expect(reloaded.components[0].source).toContain('blue');
  });

  it('cleans deleted source or dependency entries from the analysis cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-clean-'));
    const css = path.join(dir, 'Panel.css');
    const file = path.join(dir, 'Panel.tsx');
    const cachePath = path.join(dir, 'analysis.msgpack');
    fs.writeFileSync(css, '.panel { color: red; }');
    fs.writeFileSync(
      file,
      `
      import './Panel.css';
      export function Panel() {
        return <div className="panel">x</div>;
      }
      `
    );
    const config = {
      root: dir,
      allowIgnores: true,
      styleExtensions: ['.css'],
      analysisCachePath: cachePath,
    };

    loadComponentsWithCache([file], config);
    fs.unlinkSync(css);
    loadComponentsWithCache([], config);
    expect(loadAnalysisCache(cachePath).files[file]).toBeUndefined();

    fs.writeFileSync(css, '.panel { color: red; }');
    loadComponentsWithCache([file], config);
    fs.unlinkSync(file);
    loadComponentsWithCache([], config);
    expect(loadAnalysisCache(cachePath).files[file]).toBeUndefined();
  });

  it('tracks missing dependency states consistently', () => {
    const missing = snapshotFileState('/tmp/definitely-missing-duplicalis.css');
    expect(missing.exists).toBe(false);
    expect(sameFileState(missing, snapshotFileState('/tmp/definitely-missing-duplicalis.css'))).toBe(
      true
    );
    const existingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-analysis-state-'));
    const existing = path.join(existingDir, 'ok.css');
    fs.writeFileSync(existing, '.x{}');
    expect(sameFileState(missing, snapshotFileState(existing))).toBe(false);
    expect(resolveStyleDependency(existing, existingDir)).toBe(existing);
  });
});
