import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BENCHMARK_MANIFEST,
  DEFAULT_BENCHMARK_MODEL_IDS,
  buildBenchmarkModelConfig,
  resolveBenchmarkModels,
  resolveLocalBenchmarkLabel,
} from '../src/benchmark-defaults.js';

describe('benchmark defaults', () => {
  it('resolves the default shortlist', () => {
    const models = resolveBenchmarkModels();
    expect(models.map((model) => model.id)).toEqual(DEFAULT_BENCHMARK_MODEL_IDS);
    expect(models[0].kind).toBe('local');
    expect(models[1].kind).toBe('remote');
    expect(resolveBenchmarkModels([]).map((model) => model.id)).toEqual(
      DEFAULT_BENCHMARK_MODEL_IDS
    );
  });

  it('resolves aliases and custom remote ids', () => {
    const models = resolveBenchmarkModels(['openai-small', 'mock', 'custom/provider-model']);
    expect(models[0]).toMatchObject({ id: 'openai/text-embedding-3-small', kind: 'remote' });
    expect(models[1]).toMatchObject({ id: 'mock', kind: 'mock' });
    expect(models[2]).toMatchObject({ id: 'custom/provider-model', kind: 'remote' });
  });

  it('builds backend configs for local, mock, and remote presets', () => {
    const base = {
      model: 'local',
      modelPath: 'models/all-MiniLM-L6-v2',
      remote: { apiKey: 'secret', url: 'https://example.com/v1/embeddings', model: 'ignore-me' },
    };

    expect(buildBenchmarkModelConfig(base, { kind: 'local' })).toMatchObject({
      model: 'local',
      remote: base.remote,
    });
    expect(buildBenchmarkModelConfig(base, { kind: 'mock' })).toMatchObject({
      model: 'mock',
      remote: base.remote,
    });
    expect(
      buildBenchmarkModelConfig(base, { kind: 'remote', id: 'openai/text-embedding-3-small' })
    ).toMatchObject({
      model: 'remote',
      remote: { ...base.remote, model: 'openai/text-embedding-3-small' },
    });
  });

  it('derives the local label from the configured model path', () => {
    expect(resolveLocalBenchmarkLabel({ modelPath: '/tmp/models/custom-minilm' })).toBe(
      'Local custom-minilm'
    );
    expect(resolveLocalBenchmarkLabel({})).toBe('Local all-MiniLM-L6-v2');
  });

  it('ships a bundled manifest', () => {
    expect(path.basename(DEFAULT_BENCHMARK_MANIFEST)).toBe('manifest.json');
  });
});
