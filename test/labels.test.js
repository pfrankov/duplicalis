import { describe, it, expect } from 'vitest';
import { labelPair } from '../src/labels.js';
import { getI18n } from '../src/i18n.js';

const baseConfig = { similarityThreshold: 0.8, highSimilarityThreshold: 0.9, disableAnalyses: [] };

function entry(name, source, extras = {}) {
  return {
    component: {
      id: name,
      name,
      filePath: `${name}.tsx`,
      logicTokens: [],
      literals: [],
      isWrapper: false,
      source,
      ...extras,
    },
    styleVec: [1, 0],
  };
}

describe('labels', () => {
  it('applies multiple labels and hints', () => {
    const a = entry('A', 'line1\nline2\nline3', {
      logicTokens: ['toggle', 'fetch'],
      literals: ['primary', 'yes'],
      isWrapper: true,
    });
    const b = entry('B', 'line1\nline2\nline3', {
      logicTokens: ['toggle', 'fetch'],
      literals: ['primary', 'no'],
      isWrapper: true,
    });
    const { labels, hints } = labelPair(a, b, 0.96, baseConfig);
    expect(labels).toContain('wrapper-duplicate');
    expect(labels).toContain('logic-duplicate');
    expect(labels).toContain('copy-paste-variant');
    expect(labels).toContain('prop-parameterizable');
    expect(hints.some((h) => h.includes('props'))).toBe(true);
  });

  it('labels forked clone when others disabled', () => {
    const config = { ...baseConfig, disableAnalyses: ['logic-duplicate', 'copy-paste-variant', 'prop-parameterizable'] };
    const a = entry('A', 'line1\nline2\nline3\nline4\nline5', { logicTokens: [], literals: [] });
    const b = entry('B', 'line1', { logicTokens: [], literals: [] });
    const { labels } = labelPair(a, b, 0.85, config);
    expect(labels).toContain('forked-clone');
  });

  it('respects disabled analyses flags', () => {
    const config = {
      ...baseConfig,
      disableAnalyses: [
        'style-duplicate',
        'logic-duplicate',
        'copy-paste-variant',
        'prop-parameterizable',
        'forked-clone',
        'wrapper-duplicate',
      ],
    };
    const a = entry('A', 'text', { isWrapper: true });
    const b = entry('B', 'text', { isWrapper: true });
    a.styleVec = [1, 1];
    b.styleVec = [1, 1];
    const { labels } = labelPair(a, b, 0.99, config);
    expect(labels.length).toBe(0);
  });

  it('skips style label when similarity comes only from a shared stylesheet', () => {
    const sharedPaths = ['/styles/shared.css'];
    const a = {
      component: {
        id: 'A',
        name: 'A',
        filePath: 'A.tsx',
        logicTokens: [],
        literals: [],
        isWrapper: false,
        source: '',
      },
      styleVec: [1, 1],
      stylePaths: sharedPaths,
      hasStyles: true,
      hasCssInJs: false,
    };
    const b = {
      ...a,
      component: { ...a.component, id: 'B', name: 'B', filePath: 'B.tsx' },
    };
    const { labels } = labelPair(a, b, 0.92, baseConfig);
    expect(labels).not.toContain('style-duplicate');
  });

  it('keeps style label when there are inline or unique styles beyond shared files', () => {
    const sharedPaths = ['/styles/shared.css'];
    const a = {
      component: {
        id: 'A2',
        name: 'A2',
        filePath: 'A2.tsx',
        logicTokens: [],
        literals: [],
        isWrapper: false,
        source: 'const styles = css`color:red;`;',
      },
      styleVec: [1, 1],
      stylePaths: sharedPaths,
      hasStyles: true,
      hasCssInJs: true,
    };
    const b = {
      component: {
        id: 'B2',
        name: 'B2',
        filePath: 'B2.tsx',
        logicTokens: [],
        literals: [],
        isWrapper: false,
        source: '',
      },
      styleVec: [1, 1],
      stylePaths: [...sharedPaths, '/styles/other.css'],
      hasStyles: true,
      hasCssInJs: false,
    };
    const { labels } = labelPair(a, b, 0.92, baseConfig);
    expect(labels).toContain('style-duplicate');
  });

  it('uses prop presence to trigger prop-parameterizable label', () => {
    const a = entry('A4', 'text', { props: { names: ['variant'], spreads: 0 } });
    const b = entry('B4', 'text', { props: { names: ['variant'], spreads: 0 } });
    const { labels } = labelPair(a, b, 0.95, baseConfig);
    expect(labels).toContain('prop-parameterizable');
  });

  it('skips prop label when only one side has props', () => {
    const a = entry('A5', 'text', { props: { names: ['variant'], spreads: 0 } });
    const b = entry('B5', 'text', {});
    const { labels } = labelPair(a, b, 0.95, baseConfig);
    expect(labels).not.toContain('prop-parameterizable');
  });

  it('omits style label when styles differ meaningfully', () => {
    const a = entry('A3', '', { isWrapper: false });
    const b = entry('B3', '', { isWrapper: false });
    a.styleVec = [1, 0];
    b.styleVec = [0, 1];
    a.stylePaths = ['/styles/a.css'];
    b.stylePaths = ['/styles/b.css'];
    a.hasStyles = true;
    b.hasStyles = true;
    const { labels } = labelPair(a, b, 0.5, baseConfig);
    expect(labels).not.toContain('style-duplicate');
  });

  it('localizes hints when language is provided', () => {
    const config = { ...baseConfig, language: 'es' };
    const a = entry('LA', 'line1\nline2', { isWrapper: true });
    const b = entry('LB', 'line1\nline2', { isWrapper: true });
    const { hints } = labelPair(a, b, 0.5, config);
    expect(hints).toContain(getI18n('es').hintWrapper);
  });
});
