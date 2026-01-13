import { describe, it, expect } from 'vitest';
import { getI18n, resolveLanguage, resolveLanguageFromArgv, SUPPORTED_LANGS } from '../src/i18n.js';

describe('i18n', () => {
  it('normalizes and resolves language codes', () => {
    expect(resolveLanguage('ru')).toBe('ru');
    expect(resolveLanguage('ES')).toBe('es');
    expect(resolveLanguage('zh-CN')).toBe('zh');
    expect(resolveLanguage('  ')).toBe('en');
    expect(resolveLanguage('pt')).toBe('en');
  });

  it('derives language from argv flags', () => {
    expect(resolveLanguageFromArgv(['node', 'duplicalis', 'scan', '--lang', 'fr'])).toBe('fr');
    expect(resolveLanguageFromArgv(['node', 'duplicalis', '--lang=de'])).toBe('de');
    expect(resolveLanguageFromArgv(null, 'fr')).toBe('fr');
    expect(resolveLanguageFromArgv(['node', 'duplicalis'])).toBe('en');
  });

  it('exposes translated strings with fallback', () => {
    const ru = getI18n('ru');
    expect(ru.reportTitle).toContain('React');
    const fallback = getI18n('xx');
    expect(fallback.lang).toBe('en');
    expect(SUPPORTED_LANGS).toContain('es');
  });
});
