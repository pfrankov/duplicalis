import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { decode, encode } from 'msgpackr';
import { loadComponentsWithCache } from '../src/analysis-cache.js';
import { embedComponents } from '../src/similarity-embed.js';
import { MockEmbeddingBackend } from '../src/embedding/mock.js';

const directories = [];

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-pipeline-'));
  directories.push(dir);
  const source = 'function Button(){ return <button className={styles.button}>你好 😀</button>; }';
  const code = `// Привет 😀\r\n\r\nimport styles from './Button.css';\r\n${source}`;
  const file = path.join(dir, 'Button.tsx');
  fs.writeFileSync(file, code);
  fs.writeFileSync(path.join(dir, 'Button.css'), '.button { color: red; }');
  return { dir, source, file };
}

afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parser span pipeline', () => {
  it('rebuilds old analysis and changed embeddings before reusing the corrected caches', async () => {
    const { dir, source, file } = fixture();
    const config = {
      root: dir,
      allowIgnores: true,
      styleExtensions: ['.css'],
      analysisCachePath: path.join(dir, 'analysis.msgpack'),
      cachePath: path.join(dir, 'embeddings.msgpack'),
      model: 'mock',
      showProgress: false,
    };
    const initial = loadComponentsWithCache([file], config);
    const cache = decode(fs.readFileSync(config.analysisCachePath));
    const record = cache.files[file].components[0];
    // Preserve the file state and config fingerprint of a valid old cache.
    cache.version = 1;
    record.component.source = 'truncated source';
    record.component.loc.start.line = 1;
    record.analysis.representation.holisticRep = 'SOURCE truncated source';
    fs.writeFileSync(config.analysisCachePath, encode(cache));

    const backend = new MockEmbeddingBackend();
    await embedComponents(
      [{ ...initial.components[0], source: 'truncated source' }],
      backend,
      config
    );
    const rebuilt = loadComponentsWithCache([file], config);
    expect(rebuilt.cacheStats).toEqual({ hits: 0, misses: 1, cleaned: 0 });
    const [component] = rebuilt.components;
    expect(component.source).toBe(source);
    expect(component.loc).toEqual({
      start: { line: 4, column: 0 },
      end: { line: 4, column: source.length },
    });
    expect(component.analysis.styleText).toBe('.button { color: red; }');
    expect(component.analysis.representation.holisticRep).toContain(`SOURCE ${source}`);
    const embedded = await embedComponents(rebuilt.components, backend, config);
    expect(embedded.cacheStats.misses).toBe(1);
    expect(decode(fs.readFileSync(config.analysisCachePath)).version).toBe(2);

    const warm = loadComponentsWithCache([file], config);
    expect(warm.cacheStats).toEqual({ hits: 1, misses: 0, cleaned: 0 });
    expect(warm.components).toEqual(rebuilt.components);
    const warmEmbedded = await embedComponents(warm.components, backend, config);
    expect(warmEmbedded.cacheStats.hits).toBe(1);
    expect(warmEmbedded.entries[0].representation).toEqual(embedded.entries[0].representation);
  });

  it('writes exact Unicode snippets and locations in cold and warm CLI reports', () => {
    const { dir, source } = fixture();
    const second = 'function Second(){ return <span>é 😀</span>; }';
    fs.writeFileSync(path.join(dir, 'Second.jsx'), `/* heading */\n\n${second}`);
    const cli = path.resolve('bin/duplicalis.js');
    const reports = ['cold.json', 'warm.json'].map((out) => {
      execFileSync(
        process.execPath,
        [cli, 'scan', '.', '--model', 'mock', '--no-progress', '--out', out],
        {
          cwd: dir,
          env: {
            ...process.env,
            HOME: dir,
            XDG_CACHE_HOME: path.join(dir, 'cache'),
            MODEL: 'mock',
            AUTO_DOWNLOAD_MODEL: 'false',
            API_KEY: '',
          },
          stdio: 'pipe',
        }
      );
      return JSON.parse(fs.readFileSync(path.join(dir, out), 'utf8'));
    });
    for (const report of reports) {
      expect(report.components.map((component) => component.name)).toEqual(['Button', 'Second']);
      expect(report.components[0]).toMatchObject({
        snippet: source,
        hasStyles: true,
        loc: { start: { line: 4, column: 0 }, end: { line: 4, column: source.length } },
      });
      expect(report.components[1]).toMatchObject({
        snippet: second,
        loc: { start: { line: 3, column: 0 }, end: { line: 3, column: second.length } },
      });
    }
    expect(reports[0].stats.analysisCache).toEqual({ hits: 0, misses: 2, cleaned: 0 });
    expect(reports[1].stats.analysisCache).toEqual({ hits: 2, misses: 0, cleaned: 0 });
    expect(reports[1].stats.cache.hits).toBe(2);
    expect(reports[1].components).toEqual(reports[0].components);
    expect(reports[1].pairs).toEqual(reports[0].pairs);
  });
});
