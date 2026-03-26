import { describe, it, expect } from 'vitest';
import { shouldIgnoreComponent, compilePatterns } from '../src/filters.js';

describe('filters', () => {
  it('compiles patterns safely and ignores by name', () => {
    const patterns = compilePatterns(['^Skip', '[invalid']);
    expect(patterns.length).toBe(1);
    const component = { name: 'SkipMe', jsxTags: [], componentRefs: [] };
    expect(shouldIgnoreComponent(component, { ignoreComponentNamePatterns: ['^Skip'] })).toBe(true);
    expect(
      shouldIgnoreComponent(
        { ...component, name: 'KeepMe' },
        { ignoreComponentNamePatterns: ['^Skip'] }
      )
    ).toBe(false);
  });

  it('ignores by usage tokens and allows multiple patterns', () => {
    const component = {
      name: 'Wrapper',
      jsxTags: ['Playground', 'div'],
      componentRefs: ['InnerThing'],
    };
    expect(
      shouldIgnoreComponent(component, {
        ignoreComponentNamePatterns: [],
        ignoreComponentUsagePatterns: ['Inner', '^Play'],
      })
    ).toBe(true);
    expect(
      shouldIgnoreComponent(component, {
        ignoreComponentNamePatterns: [],
        ignoreComponentUsagePatterns: ['Nope'],
      })
    ).toBe(false);
  });

  it('handles missing arrays and null patterns safely', () => {
    const component = { name: 'Ok', jsxTags: null, componentRefs: undefined };
    expect(compilePatterns(null).length).toBe(0);
    expect(
      shouldIgnoreComponent(component, {
        ignoreComponentNamePatterns: [],
        ignoreComponentUsagePatterns: [],
      })
    ).toBe(false);
  });

  it('caches compiled patterns per config object', () => {
    const config = {
      ignoreComponentNamePatterns: ['^Skip'],
      ignoreComponentUsagePatterns: ['Inner'],
    };
    const component = {
      name: 'SkipMe',
      jsxTags: ['InnerBox'],
      componentRefs: ['InnerThing'],
    };
    expect(shouldIgnoreComponent(component, config)).toBe(true);
    config.ignoreComponentNamePatterns = [];
    config.ignoreComponentUsagePatterns = [];
    expect(shouldIgnoreComponent({ ...component, name: 'KeepMe' }, config)).toBe(true);
  });
});
