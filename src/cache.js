import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { encode, decode } from 'msgpackr';
import { getI18n } from './i18n.js';

const CACHE_VERSION = 1;

export function loadCache(cachePath, language) {
  if (!cachePath) return { version: CACHE_VERSION, entries: {} };
  if (!fs.existsSync(cachePath)) return { version: CACHE_VERSION, entries: {} };
  try {
    const raw = fs.readFileSync(cachePath);
    let parsed;
    try {
      parsed = decode(raw);
    } catch (decodeError) {
      parsed = JSON.parse(raw.toString('utf8'));
    }
    if (parsed.version !== CACHE_VERSION || !parsed.entries) {
      return { version: CACHE_VERSION, entries: {} };
    }
    return parsed;
  } catch (error) {
    const i18n = getI18n(language);
    console.warn(`${i18n.errCacheReadPrefix} ${cachePath}: ${error.message}`);
    return { version: CACHE_VERSION, entries: {} };
  }
}

export function saveCache(cachePath, cache) {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, encode(cache));
}

export function buildCacheKey(modelKey, componentId) {
  return `${modelKey}:${componentId}`;
}

export function modelKey(config) {
  if (config.model === 'remote') return `remote:${config.remote?.model || ''}`;
  if (config.model === 'mock') return 'mock';
  return `local:${config.modelPath}`;
}

export function fingerprintRepresentation(
  codeRep,
  styleRep,
  styleText = '',
  structureRep = '',
  holisticRep = ''
) {
  const hash = crypto.createHash('sha1');
  hash.update(codeRep || '');
  hash.update(styleRep || '');
  hash.update(styleText || '');
  hash.update(structureRep || '');
  hash.update(holisticRep || '');
  return hash.digest('hex');
}
