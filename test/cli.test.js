import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const { barMock } = vi.hoisted(() => ({
  barMock: { start: vi.fn(), update: vi.fn(), stop: vi.fn(), increment: vi.fn() },
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

import { createProgram, runCli } from '../src/cli.js';

describe('cli', () => {
  beforeEach(() => {
    barMock.start.mockReset();
    barMock.update.mockReset();
    barMock.stop.mockReset();
    barMock.increment.mockReset();
  });

  it('runs with mock model adapter and writes report', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-'));
    const out = path.join(dir, 'cli-report.json');
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      'examples',
      '--model',
      'mock',
      '--out',
      out,
      '--threshold',
      '0.8',
      '--limit',
      '1',
    ]);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('accepts positional path as cmd', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-'));
    const out = path.join(dir, 'cli-report.json');
    await runCli([
      'node',
      'duplicalis',
      'scan',
      'examples',
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
    ]);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('accepts bare positional path without command', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-'));
    const out = path.join(dir, 'cli-report.json');
    await runCli([
      'node',
      'duplicalis',
      'examples',
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
    ]);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('shows help command', async () => {
    let output = '';
    const write = process.stdout.write;
    process.stdout.write = (chunk) => {
      output += String(chunk);
      return true;
    };
    await runCli(['node', 'duplicalis', 'help']);
    process.stdout.write = write;
    expect(output.match(/scan \[options\] \[target\]/g)).toHaveLength(1);
  });

  it('shows help text after parse errors', async () => {
    let stderr = '';
    const write = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderr += String(chunk);
      return true;
    };
    const program = createProgram(['node', 'duplicalis', 'scan', '--unknown-option']);
    program.exitOverride();
    await expect(
      program.parseAsync(['node', 'duplicalis', 'scan', '--unknown-option'])
    ).rejects.toBeDefined();
    process.stderr.write = write;
    expect(stderr).toContain('Usage: duplicalis scan');
    expect(stderr).toContain('unknown option');
  });

  it('falls back to cwd when no path provided', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-'));
    const out = path.join(dir, 'cli-report.json');
    await runCli(['node', 'duplicalis', 'scan', '--model', 'mock', '--out', out, '--limit', '1']);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('runs the benchmark command with a mock model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-benchmark-cli-'));
    const out = path.join(dir, 'benchmark.json');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli([
      'node',
      'duplicalis',
      'benchmark',
      '--models',
      'mock',
      '--out',
      out,
      '--cache-path',
      path.join(dir, 'cache.json'),
      '--no-progress',
    ]);
    spy.mockRestore();
    expect(fs.existsSync(out)).toBe(true);
  });

  it('runs the benchmark command without optional output paths', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli(['node', 'duplicalis', 'benchmark', '--models', 'mock', '--no-progress']);
    spy.mockRestore();
  });

  it('persists config when --save-config is passed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-'));
    const out = path.join(dir, 'cli-report.json');
    const configPath = path.join(dir, 'duplicalis.config.json');
    await runCli([
      'node',
      'duplicalis',
      'scan',
      'examples',
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
      '--save-config',
      configPath,
    ]);
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(saved.model).toBe('mock');
    expect(saved.limit).toBe(1);
    expect(saved.root).toBeUndefined();
    expect(saved.cachePath).toBeUndefined();

    const relRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-rel-'));
    const relReport = path.join(relRoot, 'cli-report.json');
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      relRoot,
      '--model',
      'mock',
      '--out',
      relReport,
      '--limit',
      '1',
      '--save-config',
      'configs/duplicalis.config.json',
    ]);
    expect(fs.existsSync(path.join(relRoot, 'configs/duplicalis.config.json'))).toBe(true);
    const relSaved = JSON.parse(
      fs.readFileSync(path.join(relRoot, 'configs/duplicalis.config.json'), 'utf8')
    );
    expect(relSaved.cachePath).toBeUndefined();

    const flagOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-flag-'));
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      flagOnlyRoot,
      '--model',
      'mock',
      '--limit',
      '1',
      '--save-config',
    ]);
    expect(fs.existsSync(path.join(flagOnlyRoot, 'duplicalis.config.json'))).toBe(true);
  });

  it('preserves showProgress from config when the CLI flag is not passed', async () => {
    const root = createCliFixture({ showProgress: false });
    const out = path.join(root, 'cli-report.json');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      root,
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
    ]);
    spy.mockRestore();
    expect(barMock.start).not.toHaveBeenCalled();
  });

  it('lets --no-progress explicitly override config', async () => {
    const root = createCliFixture({ showProgress: true });
    const out = path.join(root, 'cli-report.json');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      root,
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
      '--no-progress',
    ]);
    spy.mockRestore();
    expect(barMock.start).not.toHaveBeenCalled();
  });

  it('preserves allowIgnores from config when the CLI flag is not passed', async () => {
    const root = createCliFixture({ allowIgnores: false, ignored: true });
    const out = path.join(root, 'cli-report.json');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      root,
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
      '--no-progress',
    ]);
    spy.mockRestore();
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report.components).toHaveLength(1);
  });

  it('lets --no-ignores explicitly override config', async () => {
    const root = createCliFixture({ allowIgnores: true, ignored: true });
    const out = path.join(root, 'cli-report.json');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCli([
      'node',
      'duplicalis',
      'scan',
      '--cmd',
      root,
      '--model',
      'mock',
      '--out',
      out,
      '--limit',
      '1',
      '--no-progress',
      '--no-ignores',
    ]);
    spy.mockRestore();
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report.components).toHaveLength(1);
  });

  it('allows importing the CLI module when argv[1] is missing', () => {
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('./src/cli.js'); process.stdout.write('ok');"],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(output).toBe('ok');
  });
});

function createCliFixture(config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-fixture-'));
  const source = config.ignored
    ? `// duplicalis-ignore-file\nexport function Sample() {\n  return <div>demo</div>;\n}\n`
    : `export function Sample() {\n  return <div>demo</div>;\n}\n`;
  fs.writeFileSync(path.join(root, 'Sample.tsx'), source);
  fs.writeFileSync(path.join(root, 'duplicalis.config.json'), JSON.stringify(config, null, 2));
  return root;
}
