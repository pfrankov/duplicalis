import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { pipelineMock, env } = vi.hoisted(() => {
  const pm = vi.fn(() => Promise.reject(new Error('missing model')));
  const envObj = {};
  return { pipelineMock: pm, env: envObj };
});

vi.mock('@xenova/transformers', () => ({
  default: { env, pipeline: pipelineMock },
  env,
  pipeline: pipelineMock,
}));

import transformers from '@xenova/transformers';
import { MockEmbeddingBackend } from '../src/embedding/mock.js';
import { RemoteEmbeddingBackend } from '../src/embedding/remote.js';
import { LocalEmbeddingBackend } from '../src/embedding/local.js';
import { createEmbeddingBackend } from '../src/embedding/index.js';
import * as modelFetch from '../src/model-fetch.js';

function createLocalModelFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-local-model-'));
  fs.mkdirSync(path.join(dir, 'onnx'));
  fs.writeFileSync(path.join(dir, 'onnx/model_quantized.onnx'), 'x');
  return dir;
}

describe('embeddings', () => {
  beforeEach(() => {
    transformers.pipeline.mockReset();
    transformers.pipeline.mockImplementation(() => Promise.reject(new Error('missing model')));
    global.fetch = undefined;
  });

  it('produces deterministic mock embeddings', async () => {
    const backend = new MockEmbeddingBackend(8);
    const v1 = await backend.embed('hello world');
    const v2 = await backend.embed('hello world');
    expect(v1).toHaveLength(8);
    expect(v1).toEqual(v2);
  });

  it('calls remote embedding API', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'https://api.example.com',
      apiKey: 'key',
      model: 'm',
      timeoutMs: 5000,
    });
    const vec = await backend.embed('text');
    expect(vec[0]).toBe(1);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('uses the default OpenAI embeddings endpoint when url is omitted', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
    }));
    const backend = new RemoteEmbeddingBackend({ apiKey: 'key', model: 'm' });
    await backend.embed('text');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ model: 'm', input: 'text' }),
      })
    );
  });

  it('throws when OpenAI auth is missing', () => {
    expect(() => new RemoteEmbeddingBackend({ url: '', apiKey: '', model: 'm' })).toThrow();
  });

  it('allows local Ollama-compatible embeddings without an API key', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [[1, 0, 0]] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'http://localhost:11434/api/embed',
      apiKey: '',
      model: 'embeddinggemma',
    });
    const vec = await backend.embed('text');
    expect(vec[0]).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embed',
      expect.objectContaining({
        body: JSON.stringify({ model: 'embeddinggemma', input: 'text' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('normalizes base URLs to an embeddings endpoint', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'http://localhost:11434',
      apiKey: '',
      model: 'embeddinggemma',
    });
    await backend.embed('text');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ model: 'embeddinggemma', input: 'text' }),
      })
    );
  });

  it('normalizes versioned base URLs to an embeddings endpoint', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'http://localhost:11434/v1',
      apiKey: '',
      model: 'embeddinggemma',
    });
    await backend.embed('text');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ model: 'embeddinggemma', input: 'text' }),
      })
    );
  });

  it('keeps legacy Ollama embeddings payload compatibility', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: [1, 0, 0] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'http://localhost:11434/api/embeddings',
      apiKey: '',
      model: 'embeddinggemma',
    });
    const vec = await backend.embed('text');
    expect(vec[0]).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({
        body: JSON.stringify({ model: 'embeddinggemma', prompt: 'text' }),
      })
    );
  });

  it('surfaces remote errors', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'https://api.example.com',
      apiKey: 'key',
      model: 'm',
      timeoutMs: 5000,
    });
    await expect(backend.embed('text')).rejects.toThrow(/500/);
  });

  it('throws when remote response lacks embedding', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{}] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'https://api.example.com',
      apiKey: 'key',
      model: 'm',
      timeoutMs: 5000,
    });
    await expect(backend.embed('text')).rejects.toThrow(/missing embedding/);
  });

  it('normalizes zero remote vectors', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [0, 0] }] }),
    }));
    const backend = new RemoteEmbeddingBackend({
      url: 'https://api.example.com',
      apiKey: 'key',
      model: 'm',
      timeoutMs: 5000,
    });
    const vec = await backend.embed('text');
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('throws when local model is unavailable', async () => {
    const backend = new LocalEmbeddingBackend({ modelPath: 'models/missing-model' });
    await expect(backend.embed('some text')).rejects.toThrow();
  });

  it('throws when onnx directory is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-no-onnx-'));
    const backend = new LocalEmbeddingBackend({ modelPath: dir });
    await expect(backend.embed('text')).rejects.toThrow(/ONNX directory/);
  });

  it('throws when onnx directory has no model files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-empty-onnx-'));
    fs.mkdirSync(path.join(dir, 'onnx'));
    const backend = new LocalEmbeddingBackend({ modelPath: dir });
    await expect(backend.embed('text')).rejects.toThrow(/ONNX model files/);
  });

  it('uses local model path when pipeline resolves', async () => {
    const modelPath = createLocalModelFixture();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [0, 0] }));
    const backend = new LocalEmbeddingBackend({ modelPath });
    const vec = await backend.embed('text');
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('reuses a loaded pipeline', async () => {
    const modelPath = createLocalModelFixture();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [1, 1] }));
    const backend = new LocalEmbeddingBackend({ modelPath });
    await backend.embed('first');
    await backend.embed('second');
    expect(transformers.pipeline).toHaveBeenCalledTimes(1);
  });

  it('auto-downloads model when enabled', async () => {
    const modelPath = createLocalModelFixture();
    const ensureSpy = vi.spyOn(modelFetch, 'ensureModel').mockResolvedValue();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [1, 1] }));
    const backend = new LocalEmbeddingBackend({
      modelPath,
      autoDownloadModel: true,
      modelRepo: 'https://example.com/model',
    });
    await backend.embed('text');
    expect(ensureSpy).toHaveBeenCalledWith(
      path.resolve(modelPath),
      'https://example.com/model',
      true,
      'en'
    );
    ensureSpy.mockRestore();
  });

  it('downloads the model only once per backend instance', async () => {
    const modelPath = createLocalModelFixture();
    const ensureSpy = vi.spyOn(modelFetch, 'ensureModel').mockResolvedValue();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [1, 1] }));
    const backend = new LocalEmbeddingBackend({
      modelPath,
      autoDownloadModel: true,
      modelRepo: 'https://example.com/model',
    });
    await backend.embed('first');
    await backend.embed('second');
    expect(ensureSpy).toHaveBeenCalledTimes(1);
    ensureSpy.mockRestore();
  });

  it('passes progress preference to local auto-downloads via the factory', async () => {
    const modelPath = createLocalModelFixture();
    const ensureSpy = vi.spyOn(modelFetch, 'ensureModel').mockResolvedValue();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [1, 1] }));
    const backend = await createEmbeddingBackend({
      model: 'local',
      modelPath,
      autoDownloadModel: true,
      modelRepo: 'https://example.com/model',
      showProgress: false,
      remote: {},
    });
    await backend.embed('text');
    expect(ensureSpy).toHaveBeenCalledWith(
      path.resolve(modelPath),
      'https://example.com/model',
      false,
      'en'
    );
    ensureSpy.mockRestore();
  });

  it('throws when local config is invalid', async () => {
    await expect(
      createEmbeddingBackend({ model: 'local', modelPath: '', remote: {} })
    ).rejects.toThrow();
  });

  it('creates remote backend via factory', async () => {
    const backend = await createEmbeddingBackend({
      model: 'remote',
      remote: { url: 'https://api.example.com', apiKey: 'key', model: 'm', timeoutMs: 1000 },
    });
    expect(typeof backend.embed).toBe('function');
  });

  it('creates mock backend via factory', async () => {
    const backend = await createEmbeddingBackend({ model: 'mock' });
    const vec = await backend.embed('text');
    expect(vec.length).toBeGreaterThan(0);
  });

  it('creates local backend via factory', async () => {
    const modelPath = createLocalModelFixture();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [0, 1] }));
    const backend = await createEmbeddingBackend({
      model: 'local',
      modelPath,
      autoDownloadModel: false,
      remote: {},
    });
    const vec = await backend.embed('text');
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('defaults to local when model is not set', async () => {
    const modelPath = createLocalModelFixture();
    transformers.pipeline.mockResolvedValue(async () => ({ data: [0, 1] }));
    const backend = await createEmbeddingBackend({
      modelPath,
      autoDownloadModel: false,
      remote: {},
    });
    const vec = await backend.embed('text');
    expect(vec.length).toBeGreaterThan(0);
  });
});
