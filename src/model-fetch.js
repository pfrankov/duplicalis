import fs from 'fs';
import path from 'path';
import https from 'https';
import cliProgress from 'cli-progress';
import { getI18n } from './i18n.js';
import { createAtomicWriteTarget } from './fs-atomic.js';

const DEFAULT_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx',
];

export async function ensureModel(modelDir, modelRepo, showProgress = true, language) {
  const i18n = getI18n(language);
  if (!modelDir) throw new Error(i18n.errModelPathRequired);
  const targetDir = path.resolve(modelDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const missing = DEFAULT_FILES.filter((file) => !fs.existsSync(path.join(targetDir, file)));
  if (!missing.length) return;

  const bar = showProgress
    ? new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    : null;
  if (bar) bar.start(missing.length, 0);

  let completed = 0;
  for (const file of missing) {
    const url = `${modelRepo}/${file}`;
    const dest = path.join(targetDir, file);
    await downloadFile(url, dest, i18n);
    completed += 1;
    if (bar) bar.update(completed);
  }
  if (bar) bar.stop();
}

function downloadFile(url, dest, i18n, redirectCount = 0) {
  const MAX_REDIRECTS = 5;
  return new Promise((resolve, reject) => {
    const target = createAtomicWriteTarget(dest);
    const file = fs.createWriteStream(target.tempPath);
    let settled = false;
    let shouldCommit = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const rejectWithCleanup = (error) => {
      finish(() => target.cleanup(() => reject(error)));
    };

    const fail = (error) => {
      closeWritable(file, (closeError) => rejectWithCleanup(closeError || error));
    };

    const request = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        closeWritable(file, (closeError) => {
          if (closeError) {
            rejectWithCleanup(closeError);
            return;
          }
          if (redirectCount >= MAX_REDIRECTS) {
            rejectWithCleanup(new Error(`${i18n.errTooManyRedirectsPrefix} ${url}`));
            return;
          }
          const nextUrl = new URL(res.headers.location, url).toString();
          target.cleanup(() =>
            finish(() => resolve(downloadFile(nextUrl, dest, i18n, redirectCount + 1)))
          );
        });
        return;
      }
      if (res.statusCode !== 200) {
        fail(new Error(`${i18n.errDownloadFailedPrefix} ${url}: ${res.statusCode}`));
        return;
      }
      shouldCommit = true;
      res.pipe(file);
    });

    file.on('finish', () => {
      if (!shouldCommit || settled) {
        return;
      }
      closeWritable(file, (closeError) => {
        if (closeError) {
          rejectWithCleanup(closeError);
          return;
        }
        target.commit((renameError) => {
          if (renameError) {
            finish(() => reject(renameError));
            return;
          }
          finish(resolve);
        });
      });
    });
    request.on('error', fail);
    file.on('error', fail);
  });
}

function closeWritable(stream, callback) {
  stream.close((error) => callback(error));
}
