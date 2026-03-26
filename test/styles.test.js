import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearStyleCache, loadStyles } from '../src/styles.js';

const config = { root: process.cwd() };

describe('styles', () => {
  beforeEach(() => {
    clearStyleCache();
  });

  it('reads style files and filters by class', () => {
    const component = {
      styleImports: ['./examples/Button'],
      classNames: ['btn', 'btn-primary'],
      source: '',
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toContain('btn-primary');
    expect(styleText).toContain('padding: 8px 12px;');
    expect(styleText).toContain('background: blue;');
    expect(styleText).not.toContain('btn-secondary');
  });

  it('captures full rule blocks and merges overlapping selectors', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-style-rules-'));
    const cssPath = path.join(dir, 'Combo.css');
    fs.writeFileSync(
      cssPath,
      `
      .btn.btn-primary {
        color: red;
        padding: 4px;
      }
      `
    );
    const component = {
      styleImports: [cssPath],
      classNames: ['btn', 'btn-primary'],
      source: '',
    };
    const { styleText } = loadStyles(component, { root: dir });
    expect(styleText).toContain('color: red;');
    expect(styleText.match(/btn\.btn-primary/g).length).toBe(1);
  });

  it('extracts css-in-js', () => {
    const component = {
      styleImports: [],
      classNames: [],
      source: 'const box = css`color: red;`',
    };
    const { styleText, hasCssInJs } = loadStyles(component, config);
    expect(styleText).toContain('color: red;');
    expect(hasCssInJs).toBe(true);
  });

  it('extracts styled(Component) css-in-js', () => {
    const component = {
      styleImports: [],
      classNames: [],
      source: 'const View = styled(Box)`padding: 8px; color: blue;`',
    };
    const { styleText, hasCssInJs } = loadStyles(component, config);
    expect(styleText).toContain('padding: 8px;');
    expect(hasCssInJs).toBe(true);
  });

  it('returns empty when style file missing', () => {
    const component = { styleImports: ['./examples/missing-style'], classNames: [], source: '' };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toBe('');
  });

  it('returns empty when selectors are malformed or missing braces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-style-broken-'));
    const cssPath = path.join(dir, 'Broken.css');
    fs.writeFileSync(cssPath, '.broken color: red;\n.bare { color: blue;');
    const component = {
      styleImports: [cssPath],
      classNames: ['broken', 'bare'],
      source: '',
    };
    const { styleText } = loadStyles(component, { root: dir });
    expect(styleText).toBe('');
  });

  it('skips missing style files even when class names are present', () => {
    const component = {
      styleImports: ['./examples/missing-style'],
      classNames: ['missing'],
      source: '',
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toBe('');
  });

  it('supports absolute style imports', () => {
    const component = {
      styleImports: [path.resolve('examples/Button.css')],
      classNames: ['btn'],
      source: '',
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toContain('btn');
  });

  it('derives class names from css-module usage to avoid loading full file', () => {
    const component = {
      styleImports: ['./examples/Box'],
      classNames: [],
      source:
        "import styles from './Box.css'; export const View = () => <div className={styles.base}>box</div>;",
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toContain('base');
    expect(styleText).not.toContain('box-body');
  });

  it('skips stylesheet content when no class names are detected', () => {
    const component = {
      styleImports: ['./examples/Button'],
      classNames: [],
      source: 'export const View = () => <div>unstyled</div>;',
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText.trim()).toBe('');
  });

  it('handles bracket access to css-module class names', () => {
    const component = {
      styleImports: ['./examples/BoxAlt'],
      classNames: [],
      source:
        "import styles from './BoxAlt.css'; const cls = styles['box-body']; export const View = () => <div className={styles['box-body']}>box</div>;",
    };
    const { styleText } = loadStyles(component, config);
    expect(styleText).toContain('box-body');
  });

  it('handles missing classNames and source fields gracefully', () => {
    const component = {
      styleImports: ['./examples/Button'],
    };
    const { styleText, hasCssInJs } = loadStyles(component, config);
    expect(styleText).toBe('');
    expect(hasCssInJs).toBe(false);
  });

  it('falls back to empty imports when styleImports is missing', () => {
    const component = {
      classNames: ['box'],
      source: '',
    };
    const { styleText, stylePaths } = loadStyles(component, config);
    expect(styleText).toBe('');
    expect(stylePaths).toEqual([]);
  });

  it('deduplicates repeated style imports and caches reads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-styles-'));
    const cssPath = path.join(dir, 'temp.css');
    fs.writeFileSync(cssPath, '.box { color: red; }');
    const spy = vi.spyOn(fs, 'readFileSync');
    const component = {
      styleImports: [cssPath, cssPath],
      classNames: ['box'],
      source: '',
    };
    loadStyles(component, { root: dir });
    loadStyles(component, { root: dir });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
