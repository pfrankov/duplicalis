import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  writeFileAtomicSync,
  buildAtomicTempPath,
  createAtomicWriteTarget,
} from '../src/fs-atomic.js';

describe('fs atomic', () => {
  it('writes files atomically and creates parent directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-atomic-'));
    const target = path.join(dir, 'nested', 'file.txt');
    writeFileAtomicSync(target, 'hello', 'utf8');
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
    expect(fs.readdirSync(path.dirname(target)).every((name) => !name.includes('.tmp-'))).toBe(
      true
    );
  });

  it('cleans up temp files when rename fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-atomic-'));
    const target = path.join(dir, 'file.txt');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });
    expect(() => writeFileAtomicSync(target, 'hello', 'utf8')).toThrow('rename failed');
    expect(fs.readdirSync(dir)).toEqual([]);
    renameSpy.mockRestore();
  });

  it('ignores cleanup unlink failures and rethrows the original write error', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-atomic-'));
    const target = path.join(dir, 'file.txt');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('unlink failed');
    });
    expect(() => writeFileAtomicSync(target, 'hello', 'utf8')).toThrow('rename failed');
    renameSpy.mockRestore();
    unlinkSpy.mockRestore();
  });

  it('builds temp paths alongside the target file', () => {
    const target = path.join('/tmp', 'example.txt');
    const temp = buildAtomicTempPath(target);
    expect(temp.startsWith(`${target}.tmp-`)).toBe(true);
  });

  it('commits and cleans up async atomic write targets', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-atomic-'));
    const targetPath = path.join(dir, 'file.txt');
    const target = createAtomicWriteTarget(targetPath);
    fs.writeFileSync(target.tempPath, 'hello', 'utf8');
    await new Promise((resolve, reject) =>
      target.commit((error) => (error ? reject(error) : resolve()))
    );
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('hello');

    fs.writeFileSync(target.tempPath, 'temp', 'utf8');
    await new Promise((resolve) => target.cleanup(resolve));
    expect(fs.readdirSync(dir)).toEqual(['file.txt']);
  });
});
