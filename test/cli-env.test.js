import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const cliPath = path.resolve('bin/duplicalis.js');
const cliUrl = pathToFileURL(path.resolve('src/cli.js')).href;
const configUrl = pathToFileURL(path.resolve('src/config.js')).href;
const roots = [];
const appEnv = [
  'MODEL',
  'MODEL_PATH',
  'MODEL_REPO',
  'AUTO_DOWNLOAD_MODEL',
  'API_URL',
  'API_KEY',
  'API_MODEL',
  'API_TIMEOUT',
  'PROGRESS',
  'DOTENV_KEY',
];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function environment(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (appEnv.includes(key) || key.startsWith('DOTENV_CONFIG_')) delete env[key];
  }
  return { ...env, AUTO_DOWNLOAD_MODEL: 'false', ...overrides };
}

function fixture(envText = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-cli-env-'));
  roots.push(root);
  if (envText) fs.writeFileSync(path.join(root, '.env'), envText);
  return root;
}

function inspectConfig(root, env = {}, preload = cliUrl) {
  const script = `
    await import(${JSON.stringify(preload)});
    const { loadConfig } = await import(${JSON.stringify(configUrl)});
    const config = loadConfig();
    config.remote.apiKey = config.remote.apiKey === 'fixture-only-key';
    console.log(JSON.stringify(config));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      env: environment(env),
      encoding: 'utf8',
      timeout: 20000,
    })
  );
}

describe('CLI environment initialization', () => {
  it('loads .env settings before config defaults are captured', () => {
    const root = fixture(
      [
        'MODEL=remote',
        'MODEL_PATH=fixture-model',
        'MODEL_REPO=https://model.invalid',
        'API_URL=http://127.0.0.1:9/embeddings',
        'API_KEY=fixture-only-key',
        'API_MODEL=fixture-model',
        'API_TIMEOUT=4321',
      ].join('\n')
    );
    const config = inspectConfig(root);
    expect(config.model).toBe('remote');
    expect(config.modelPath).toBe('fixture-model');
    expect(config.modelRepo).toBe('https://model.invalid');
    expect(config.remote).toEqual({
      url: 'http://127.0.0.1:9/embeddings',
      apiKey: true,
      model: 'fixture-model',
      timeoutMs: 4321,
    });
  });

  it('keeps existing process variables above .env and ignores preload-only options', () => {
    const root = fixture('MODEL=remote\nAPI_MODEL=dotenv-model\n');
    const other = path.join(root, 'other.env');
    fs.writeFileSync(other, 'MODEL=local\nAPI_MODEL=other-model\n');
    const config = inspectConfig(root, {
      MODEL: 'mock',
      DOTENV_CONFIG_OVERRIDE: 'true',
      DOTENV_CONFIG_PATH: other,
    });
    expect(config.model).toBe('mock');
    expect(config.remote.model).toBe('dotenv-model');
  });

  it('keeps config-file and CLI settings above environment defaults', () => {
    const root = fixture('MODEL=remote\nAPI_MODEL=dotenv-model\nAPI_KEY=fixture-only-key\n');
    fs.writeFileSync(
      path.join(root, 'duplicalis.config.json'),
      JSON.stringify({
        model: 'mock',
        remote: { model: 'config-model' },
      })
    );
    const output = execFileSync(
      process.execPath,
      [cliPath, 'scan', '--no-progress', '--api-model', 'cli-model', '--save-config'],
      {
        cwd: root,
        env: environment({ MODEL: 'local', API_MODEL: 'shell-model' }),
        encoding: 'utf8',
      }
    );
    const savedText = fs.readFileSync(path.join(root, 'duplicalis.config.json'), 'utf8');
    const saved = JSON.parse(savedText);
    expect(saved.model).toBe('mock');
    expect(saved.remote.model).toBe('cli-model');
    expect(saved.remote).not.toHaveProperty('apiKey');
    expect(savedText + output).not.toContain('fixture-only-key');
  });

  it('keeps library-only imports from loading .env', () => {
    const root = fixture('MODEL=remote\nAPI_KEY=fixture-only-key\n');
    const libraryUrl = pathToFileURL(path.resolve('src/index.js')).href;
    const config = inspectConfig(root, {}, libraryUrl);
    expect(config.model).toBe('local');
    expect(config.remote.apiKey).toBe(false);
  });

  it('works without a .env file', () => {
    const config = inspectConfig(fixture(), { MODEL: 'mock' });
    expect(config.model).toBe('mock');
    expect(config.remote.apiKey).toBe(false);
  });

  it('uses .env authentication in a real CLI scan without logging or saving the key', async () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, 'Card.tsx'),
      'export function Card() { return <div>hello</div>; }'
    );
    const requests = [];
    const server = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      requests.push({ authorization: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ embedding: [1, 0] }] }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'MODEL=remote',
        `API_URL=http://127.0.0.1:${server.address().port}/v1/embeddings`,
        'API_KEY=fixture-only-key',
        'API_MODEL=fixture-model',
      ].join('\n')
    );
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cliPath, 'scan', '--no-progress', '--save-config'], {
          cwd: root,
          env: environment(),
          timeout: 20000,
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, output }));
      });
      expect(result.code).toBe(0);
      expect(requests).toHaveLength(3);
      expect(requests.every((req) => req.authorization === 'Bearer fixture-only-key')).toBe(true);
      expect(requests.every((req) => req.body.model === 'fixture-model')).toBe(true);
      const savedText = fs.readFileSync(path.join(root, 'duplicalis.config.json'), 'utf8');
      expect(JSON.parse(savedText).remote).not.toHaveProperty('apiKey');
      expect(savedText + result.output).not.toContain('fixture-only-key');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
