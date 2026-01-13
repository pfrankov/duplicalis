import en from './i18n/en.js';
import ru from './i18n/ru.js';
import es from './i18n/es.js';
import fr from './i18n/fr.js';
import de from './i18n/de.js';
import zh from './i18n/zh.js';

export const SUPPORTED_LANGS = ['en', 'ru', 'es', 'fr', 'de', 'zh'];

const MESSAGES = { en, ru, es, fr, de, zh };

function normalizeLanguage(value) {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  const cleaned = trimmed.split(/[.@]/)[0];
  const primary = cleaned.split(/[-_]/)[0];
  return SUPPORTED_LANGS.includes(primary) ? primary : null;
}

export function resolveLanguage(value, fallback = 'en') {
  return normalizeLanguage(value) || fallback;
}

export function resolveLanguageFromArgv(argv = [], fallback = 'en') {
  if (!Array.isArray(argv)) return resolveLanguage(undefined, fallback);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lang') {
      return resolveLanguage(argv[i + 1], fallback);
    }
    if (typeof arg === 'string' && arg.startsWith('--lang=')) {
      return resolveLanguage(arg.slice('--lang='.length), fallback);
    }
  }
  return resolveLanguage(undefined, fallback);
}

export function getI18n(language) {
  const resolved = resolveLanguage(language);
  const base = MESSAGES.en;
  const selected = MESSAGES[resolved];
  return { ...base, ...selected, lang: resolved };
}
