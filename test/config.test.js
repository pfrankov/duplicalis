import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { loadConfig, resolveConfigPath, saveConfigFile } from '../src/config.js';

describe('config', () => {
  it('merges defaults with file and cli options', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-config-'));
    const configPath = path.join(dir, 'duplicalis.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ similarityThreshold: 0.5, include: ['src/**/*.ts'] })
    );
    const config = loadConfig({ config: configPath, exclude: ['**/*.spec.ts'], model: 'mock' });
    expect(config.similarityThreshold).toBe(0.5);
    expect(config.exclude).toContain('**/*.spec.ts');
    expect(config.model).toBe('mock');
  });

  it('handles missing config file', () => {
    const config = loadConfig({ config: 'missing.json' });
    expect(config.include.length).toBeGreaterThan(0);
  });

  it('throws on invalid config', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-config-'));
    const configPath = path.join(dir, 'duplicalis.config.json');
    fs.writeFileSync(configPath, '{bad json');
    expect(() => loadConfig({ config: configPath })).toThrow(/Failed to read config file/);
  });

  it('keeps defaults when cli options are undefined', () => {
    const config = loadConfig({});
    expect(config.modelPath).toBe('models/all-MiniLM-L6-v2');
    expect(config.autoDownloadModel).toBe(true);
    expect(config.remote.url).toBe('https://api.openai.com/v1/embeddings');
    expect(config.cachePath.endsWith(path.join('.cache', 'duplicalis', 'embeddings.json'))).toBe(
      true
    );
  });

  it('accepts model flag', () => {
    const config = loadConfig({ model: 'mock' });
    expect(config.model).toBe('mock');
  });

  it('accepts multiple include/exclude globs', () => {
    const config = loadConfig({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.spec.ts', '**/*.stories.tsx'],
    });
    expect(config.include).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
    expect(config.exclude).toEqual(
      expect.arrayContaining(['**/*.spec.ts', '**/*.stories.tsx', '**/node_modules/**'])
    );
  });

  it('deduplicates merged array settings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-config-'));
    const configPath = path.join(dir, 'duplicalis.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ exclude: ['**/node_modules/**', '**/*.spec.ts'] })
    );
    const config = loadConfig({ config: configPath, exclude: ['**/*.spec.ts'] });
    expect(config.exclude.filter((value) => value === '**/node_modules/**')).toHaveLength(1);
    expect(config.exclude.filter((value) => value === '**/*.spec.ts')).toHaveLength(1);
  });

  it('resolves config path relative to cwd when root is missing', () => {
    const expected = path.join(process.cwd(), 'duplicalis.config.json');
    expect(resolveConfigPath()).toBe(expected);
  });

  it('resolves relative config paths from the scan root', () => {
    const root = path.join(process.cwd(), 'examples');
    expect(resolveConfigPath(root, 'configs/duplicalis.config.json')).toBe(
      path.join(root, 'configs', 'duplicalis.config.json')
    );
  });

  it('saves the current run config to disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-config-save-'));
    const configPath = resolveConfigPath(dir);
    const config = loadConfig({
      root: dir,
      include: ['src/**/*.tsx'],
      exclude: ['**/node_modules/**'],
      similarityThreshold: 0.92,
      config: configPath,
    });
    const savedPath = saveConfigFile(
      { ...config, exclude: [...config.exclude, '**/.cache/**'] },
      configPath
    );
    const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    expect(saved.similarityThreshold).toBe(0.92);
    expect(saved.include).toContain('src/**/*.tsx');
    expect(saved.exclude).toContain('**/.cache/**');
    expect(saved.root).toBeUndefined();
    expect(saved.cachePath).toBeUndefined();
  });

  it('omits default cache path even when root is not provided', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-config-save-'));
    const target = path.join(dir, 'duplicalis.config.json');
    saveConfigFile(
      {
        model: 'mock',
        cachePath: path.join(process.cwd(), '.cache', 'duplicalis', 'embeddings.json'),
      },
      target
    );
    const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(saved.cachePath).toBeUndefined();
  });
});
