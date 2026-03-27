import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { barMock, getMock } = vi.hoisted(() => ({
  barMock: { start: vi.fn(), update: vi.fn(), stop: vi.fn() },
  getMock: vi.fn(),
}));

vi.mock('cli-progress', () => {
  function SingleBar() {
    return barMock;
  }
  return {
    default: { SingleBar, Presets: { shades_classic: {} } },
    SingleBar,
    Presets: { shades_classic: {} },
  };
});

vi.mock('https', () => ({
  default: { get: getMock },
  get: getMock,
}));

import { ensureModel } from '../src/model-fetch.js';

describe('model fetch', () => {
  beforeEach(() => {
    barMock.start.mockReset();
    barMock.update.mockReset();
    barMock.stop.mockReset();
    getMock.mockReset();
  });

  it('downloads missing files and shows progress', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 200;
      cb(stream);
      process.nextTick(() => {
        stream.end('data');
      });
      return { on: vi.fn() };
    });
    await ensureModel(dir, 'https://example.com/model', true);
    expect(barMock.start).toHaveBeenCalled();
    expect(barMock.stop).toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'onnx/model_quantized.onnx'))).toBe(true);
  });

  it('skips download when files exist', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    fs.mkdirSync(path.join(dir, 'onnx'));
    const files = [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      'vocab.txt',
      'onnx/model_quantized.onnx',
    ];
    files.forEach((f) => fs.writeFileSync(path.join(dir, f), 'x'));
    getMock.mockClear();
    await ensureModel(dir, 'https://example.com/model', false);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('rejects on non-200 responses', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 500;
      cb(stream);
      process.nextTick(() => stream.end());
      return { on: vi.fn() };
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(/500/);
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
  });

  it('handles network errors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    getMock.mockImplementation(() => ({
      on: (event, handler) => {
        if (event === 'error') handler(new Error('boom'));
      },
    }));
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow('boom');
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
  });

  it('ignores duplicate request error notifications after settling', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    getMock.mockImplementation(() => {
      const request = {
        on(event, handler) {
          if (event === 'error') {
            process.nextTick(() => {
              handler(new Error('boom'));
              handler(new Error('boom again'));
            });
          }
          return request;
        },
      };
      return request;
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow('boom');
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
  });

  it('throws when model path is missing', async () => {
    await expect(ensureModel('', 'https://example.com/model', false)).rejects.toThrow(/Model path/);
  });

  it('follows redirects', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    let call = 0;
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      if (call === 0) {
        stream.statusCode = 302;
        stream.headers = { location: 'https://redirected/model' };
      } else {
        stream.statusCode = 200;
      }
      call += 1;
      cb(stream);
      process.nextTick(() => stream.end('ok'));
      return { on: vi.fn() };
    });
    await ensureModel(dir, 'https://example.com/model', false);
    expect(fs.existsSync(path.join(dir, 'onnx/model_quantized.onnx'))).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(7); // first call redirects then retries
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
  });

  it('fails after too many redirects', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 302;
      stream.headers = { location: url };
      cb(stream);
      process.nextTick(() => stream.end());
      return { on: vi.fn() };
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(
      /Too many redirects/
    );
  });

  it('ignores late finish events after redirect cleanup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    const renameSpy = vi.spyOn(fs, 'rename');
    const file = new PassThrough();
    file.close = (cb) => {
      cb();
      process.nextTick(() => file.emit('finish'));
    };
    const streamSpy = vi.spyOn(fs, 'createWriteStream').mockReturnValue(file);
    try {
      getMock.mockImplementation((url, cb) => {
        const stream = new PassThrough();
        stream.statusCode = 302;
        stream.headers = { location: url };
        cb(stream);
        process.nextTick(() => stream.end());
        return { on: vi.fn() };
      });
      await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(
        /Too many redirects/
      );
      expect(renameSpy).not.toHaveBeenCalled();
      expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
    } finally {
      streamSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });

  it('cleans up temp files when redirect handling fails while closing the temp file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    const file = new PassThrough();
    file.close = (cb) => cb(new Error('close failed'));
    const streamSpy = vi.spyOn(fs, 'createWriteStream').mockReturnValue(file);
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 302;
      stream.headers = { location: 'https://redirected/model' };
      cb(stream);
      process.nextTick(() => stream.end());
      return { on: vi.fn() };
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(
      'close failed'
    );
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
    streamSpy.mockRestore();
  });

  it('cleans up temp files when closing the downloaded file fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    const file = new PassThrough();
    file.close = (cb) => cb(new Error('close failed'));
    const streamSpy = vi.spyOn(fs, 'createWriteStream').mockReturnValue(file);
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 200;
      cb(stream);
      process.nextTick(() => stream.end('data'));
      return { on: vi.fn() };
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(
      'close failed'
    );
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
    streamSpy.mockRestore();
  });

  it('cleans up temp files when renaming the downloaded file fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-model-'));
    const renameSpy = vi
      .spyOn(fs, 'rename')
      .mockImplementation((_from, _to, cb) => cb(new Error('rename failed')));
    getMock.mockImplementation((url, cb) => {
      const stream = new PassThrough();
      stream.statusCode = 200;
      cb(stream);
      process.nextTick(() => stream.end('data'));
      return { on: vi.fn() };
    });
    await expect(ensureModel(dir, 'https://example.com/model', false)).rejects.toThrow(
      'rename failed'
    );
    expect(fs.readdirSync(dir).every((name) => !name.includes('.tmp-'))).toBe(true);
    renameSpy.mockRestore();
  });
});
