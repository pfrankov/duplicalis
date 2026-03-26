import { describe, expect, it } from 'vitest';
import { findSimilarities } from '../src/similarity.js';
import { makeEntry } from './similarity-fixtures.js';
import { mergeSimilarityStates } from '../src/similarity-match-core.js';

describe('similarity matching', () => {
  it('returns all matches when limit is not provided', () => {
    const entries = [makeEntry('A', [1, 0]), makeEntry('B', [1, 0]), makeEntry('C', [1, 0])];
    const { pairs } = findSimilarities(entries, {
      similarityThreshold: 0.1,
      highSimilarityThreshold: 0.9,
    });
    expect(pairs.length).toBe(3);
  });

  it('skips pairs below threshold', () => {
    const { pairs } = findSimilarities([makeEntry('A', [1, 0]), makeEntry('B', [0, 1])], {
      similarityThreshold: 1,
      highSimilarityThreshold: 1,
      limit: 1,
    });
    expect(pairs.length).toBe(0);
  });

  it('tracks coverage and best similarity stats alongside limited pairs', () => {
    const entries = [makeEntry('A', [1, 0]), makeEntry('B', [0.6, 0.8]), makeEntry('C', [0, 1])];
    const { pairs, scorecard } = findSimilarities(entries, {
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      limit: 1,
    });
    expect(scorecard.coveredComponents).toBe(3);
    expect(scorecard.minBestSimilarity).toBeCloseTo(0.6, 4);
    expect(scorecard.maxBestSimilarity).toBeCloseTo(0.8, 4);
    expect(pairs.length).toBe(1);
  });

  it('handles runs without comparable pairs', () => {
    const result = findSimilarities([makeEntry('Solo', [1, 0])], {
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      limit: 2,
    });
    expect(result.pairs).toEqual([]);
    expect(result.scorecard.coveredComponents).toBe(0);
    expect(result.scorecard.maxSimilarity).toBe(0);
  });

  it('treats zero-norm vectors as non-matches instead of crashing', () => {
    const { pairs, scorecard } = findSimilarities(
      [makeEntry('ZeroA', [0, 0]), makeEntry('ZeroB', [0, 0])],
      {
        similarityThreshold: 0.1,
        highSimilarityThreshold: 0.9,
        limit: 2,
      }
    );
    expect(pairs).toEqual([]);
    expect(scorecard.maxSimilarity).toBe(0);
  });

  it('suppresses expected wrapper and low-signal pairs', () => {
    const entries = [
      makeEntry('WrapperA', [1, 0, 0], {
        isWrapper: true,
        props: { names: ['variant'], spreads: 0 },
        jsxTags: ['Button'],
        source: 'export const WrapperA = () => <Button variant="a" />;',
      }),
      makeEntry('WrapperB', [1, 0, 0], {
        isWrapper: true,
        props: { names: ['variant'], spreads: 0 },
        jsxTags: ['Button'],
        source: 'export const WrapperB = () => <Button variant="b" />;',
      }),
      makeEntry('TinyA', [0, 1, 0], {
        props: { names: ['size'], spreads: 0 },
        jsxTags: ['Box'],
        source: 'const TinyA = () => <Box size="s" />;',
      }),
      makeEntry('TinyB', [0, 1, 0], {
        props: { names: ['size'], spreads: 0 },
        jsxTags: ['Box'],
        source: 'const TinyB = () => <Box size="l" />;',
      }),
      makeEntry('RealA', [0, 0, 1], {
        logicTokens: ['fetch'],
        source: 'const RealA = () => { useEffect(); return <div />; };',
      }),
      makeEntry('RealB', [0, 0, 1], {
        logicTokens: ['fetch'],
        source: 'const RealB = () => { useEffect(); return <div />; };',
      }),
      makeEntry('WrapperC', [0, 0.5, 0.5], {
        isWrapper: true,
        props: { names: ['size'], spreads: 0 },
        jsxTags: ['Card'],
        literals: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        source: 'export const WrapperC = () => <Card size="l" />;',
      }),
      makeEntry('WrapperD', [0, 0.5, 0.5], {
        isWrapper: true,
        props: { names: ['size'], spreads: 0 },
        jsxTags: ['Pane'],
        literals: ['1', '2', '3', '4', '5', '6', '7'],
        source: 'export const WrapperD = () => <Pane size="m" />;',
      }),
    ];
    const { pairs, scorecard } = findSimilarities(entries, {
      similarityThreshold: 0.9,
      highSimilarityThreshold: 0.95,
      limit: 3,
    });
    const ids = pairs.map((pair) => [pair.a, pair.b].sort().join('|'));
    expect(ids).toContain('RealA#RealA|RealB#RealB');
    expect(ids.length).toBe(1);
    expect(scorecard.suppressedPairs).toBe(3);
    expect(scorecard.suppressionReasons['wrapper-specialization']).toBe(2);
    expect(scorecard.suppressionReasons['low-signal-pair']).toBe(1);
  });

  it('suppresses wrappers that pin different base components', () => {
    const { pairs, scorecard } = findSimilarities(
      [
        makeEntry('TopAudioPlayerPlayground', [0.9, 0.9], {
          props: { names: ['Component'], spreads: 0 },
          jsxTags: ['Playground'],
          componentRefs: ['TopAudioPlayer'],
          isWrapper: true,
          source:
            'export const TopAudioPlayerPlayground = () => <Playground Component={TopAudioPlayer} />;',
        }),
        makeEntry('TopAudioPlayerActionPlayground', [0.9, 0.9], {
          props: { names: ['Component'], spreads: 0 },
          jsxTags: ['Playground'],
          componentRefs: ['TopAudioPlayerAction'],
          isWrapper: true,
          source:
            'export const TopAudioPlayerActionPlayground = () => <Playground Component={TopAudioPlayerAction} />;',
        }),
      ],
      { similarityThreshold: 0.7, highSimilarityThreshold: 0.9, limit: 2 }
    );
    expect(pairs.length).toBe(0);
    expect(scorecard.suppressionReasons['wrapper-different-base']).toBe(1);
  });

  it('respects a maximum similarity threshold', () => {
    const { pairs, scorecard } = findSimilarities(
      [makeEntry('HighA', [1, 0]), makeEntry('HighB', [1, 0])],
      {
        similarityThreshold: 0.5,
        highSimilarityThreshold: 0.9,
        maxSimilarityThreshold: 0.8,
        limit: 2,
      }
    );
    expect(pairs.length).toBe(0);
    expect(scorecard.suppressionReasons['over-max-threshold']).toBe(1);
  });

  it('suppresses direct composition relationships', () => {
    const { pairs, scorecard } = findSimilarities(
      [makeEntry('Parent', [1, 0], { componentRefs: ['Child'] }), makeEntry('Child', [1, 0])],
      {
        similarityThreshold: 0.5,
        highSimilarityThreshold: 0.9,
        maxSimilarityThreshold: 1,
        limit: 2,
      }
    );
    expect(pairs.length).toBe(0);
    expect(scorecard.suppressionReasons['component-composition']).toBe(1);
  });

  it('skips pairs that are too close by path distance', () => {
    const near = findSimilarities(
      [
        makeEntry('A', [1, 0], {
          filePath: '/repo/ui/ButtonA.tsx',
          componentId: '/repo/ui/ButtonA.tsx#A',
        }),
        makeEntry('B', [1, 0], {
          filePath: '/repo/ui/ButtonB.tsx',
          componentId: '/repo/ui/ButtonB.tsx#B',
        }),
      ],
      {
        similarityThreshold: 0.5,
        highSimilarityThreshold: 0.9,
        maxSimilarityThreshold: 1,
        minPathDistance: 1,
        limit: 2,
      }
    );
    expect(near.pairs.length).toBe(0);
    expect(near.scorecard.suppressionReasons['near-path']).toBe(1);

    const far = findSimilarities(
      [
        makeEntry('A', [1, 0], {
          filePath: '/repo/ui/button/ButtonA.tsx',
          componentId: '/repo/ui/button/ButtonA.tsx#A',
        }),
        makeEntry('B', [1, 0], {
          filePath: '/repo/components/ButtonB.tsx',
          componentId: '/repo/components/ButtonB.tsx#B',
        }),
      ],
      {
        similarityThreshold: 0.5,
        highSimilarityThreshold: 0.9,
        maxSimilarityThreshold: 1,
        minPathDistance: 1,
        limit: 2,
      }
    );
    expect(far.pairs.length).toBe(1);
  });

  it('suppresses sparse components even when metadata is missing', () => {
    const { pairs, scorecard } = findSimilarities(
      [
        makeEntry('LooseA', [1, 1], {
          props: { spreads: 1 },
          hooks: undefined,
          logicTokens: undefined,
          literals: ['1', '2', '3', '4', '5', '6', '7'],
          jsxTags: undefined,
          jsxPaths: undefined,
          textNodes: undefined,
          classNames: undefined,
          source: '',
        }),
        makeEntry('LooseB', [1, 1], {
          props: { spreads: 1 },
          hooks: undefined,
          logicTokens: undefined,
          literals: ['1', '2', '3', '4', '5', '6', '7'],
          jsxTags: undefined,
          jsxPaths: undefined,
          textNodes: undefined,
          classNames: undefined,
          source: '',
        }),
      ],
      { similarityThreshold: 0.5, highSimilarityThreshold: 0.9, limit: 2 }
    );
    expect(pairs.length).toBe(0);
    expect(scorecard.suppressedPairs).toBe(1);
    expect(scorecard.suppressionReasons['low-signal-pair']).toBe(1);
  });

  it('handles low-signal pairs when props metadata is missing entirely', () => {
    const { pairs, scorecard } = findSimilarities(
      [
        makeEntry('SparseA', [1, 1], { props: undefined, isWrapper: true, source: '' }),
        makeEntry('SparseB', [1, 1], { props: undefined, source: '' }),
      ],
      { similarityThreshold: 0.5, highSimilarityThreshold: 0.9, limit: 2 }
    );
    expect(pairs.length).toBe(0);
    expect(scorecard.suppressionReasons['low-signal-pair']).toBe(1);
  });

  it('keeps higher-signal long components in the report', () => {
    const source = new Array(20).fill('return <div />;').join('\n');
    const { pairs, scorecard } = findSimilarities(
      [
        makeEntry('BigA', [1, 0], {
          props: { names: ['children'], spreads: 0 },
          source,
        }),
        makeEntry('BigB', [1, 0], {
          props: { names: ['children'], spreads: 0 },
          source,
        }),
      ],
      { similarityThreshold: 0.8, highSimilarityThreshold: 0.9, limit: 2 }
    );
    expect(pairs.length).toBe(1);
    expect(scorecard.suppressedPairs).toBe(0);
  });

  it('keeps short components when they carry enough signal', () => {
    const rich = {
      props: { names: ['value'], spreads: 0 },
      hooks: ['useEffect'],
      logicTokens: ['handleClick'],
      literals: ['ok'],
      jsxTags: ['Pane'],
      textNodes: ['label'],
      classNames: ['rich'],
      source: 'const Comp = () => <Pane>text</Pane>;',
    };
    const { pairs, scorecard } = findSimilarities(
      [makeEntry('RichA', [0.5, 0.5], rich), makeEntry('RichB', [0.5, 0.5], rich)],
      { similarityThreshold: 0.8, highSimilarityThreshold: 0.9, limit: 2 }
    );
    expect(pairs.length).toBe(1);
    expect(scorecard.suppressedPairs).toBe(0);
  });

  it('filters pairs to compare targets when compare globs are provided', () => {
    const entries = [
      makeEntry('Changed', [1, 0], {
        filePath: '/repo/ui/Changed.tsx',
        isCompareTarget: true,
      }),
      makeEntry('BaselineA', [1, 0], {
        filePath: '/repo/ui/BaselineA.tsx',
        isCompareTarget: false,
      }),
      makeEntry('BaselineB', [1, 0], {
        filePath: '/repo/ui/BaselineB.tsx',
        isCompareTarget: false,
      }),
      makeEntry('ChangedToo', [1, 0], {
        filePath: '/repo/ui/ChangedToo.tsx',
        isCompareTarget: true,
      }),
    ];
    const { pairs, scorecard } = findSimilarities(entries, {
      similarityThreshold: 0.1,
      highSimilarityThreshold: 0.9,
      limit: 10,
      compareGlobs: ['**/Changed*.tsx'],
    });
    const ids = pairs.map((pair) => [pair.a, pair.b].sort().join('|'));
    expect(
      ids.some((pair) => pair.includes('Changed#Changed') && pair.includes('BaselineA#BaselineA'))
    ).toBe(true);
    expect(
      ids.some(
        (pair) => pair.includes('ChangedToo#ChangedToo') && pair.includes('BaselineB#BaselineB')
      )
    ).toBe(true);
    expect(
      ids.some(
        (pair) => pair.includes('BaselineA#BaselineA') && pair.includes('BaselineB#BaselineB')
      )
    ).toBe(false);
    expect(
      ids.some((pair) => pair.includes('Changed#Changed') && pair.includes('ChangedToo#ChangedToo'))
    ).toBe(false);
    expect(scorecard.suppressionReasons['compare-filter']).toBeGreaterThan(0);
  });

  it('produces the same result when worker threads are enabled', async () => {
    const entries = [
      makeEntry('A', [1, 0]),
      makeEntry('B', [1, 0]),
      makeEntry('C', [0.7, 0.3]),
      makeEntry('D', [0, 1]),
    ];
    const config = {
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      limit: 10,
      similarityWorkers: 2,
      similarityWorkerMinEntries: 0,
    };
    const serial = findSimilarities(entries, {
      ...config,
      similarityWorkers: 1,
    });
    const parallel = await findSimilarities(entries, config);
    expect(parallel).toEqual(serial);
  });

  it('falls back to local processing when worker ranges collapse to one chunk', async () => {
    const result = await findSimilarities(
      [makeEntry('A', [1, 0]), makeEntry('B', [1, 0])],
      {
        similarityThreshold: 0.1,
        highSimilarityThreshold: 0.9,
        limit: 10,
        similarityWorkers: 2,
        similarityWorkerMinEntries: 0,
      }
    );
    expect(result.pairs).toHaveLength(1);
  });

  it('merges partial worker states deterministically', () => {
    const merged = mergeSimilarityStates([
      {
        pairs: [{ a: 'A', b: 'B', similarity: 0.9, category: 'near-duplicate', labels: [], hints: [] }],
        best: { A: 0.9 },
        checked: 1,
        sum: 0.9,
        max: 0.9,
        suppressed: 1,
        reasons: { x: 1 },
      },
      {
        pairs: [{ a: 'C', b: 'D', similarity: 0.8, category: 'near-duplicate', labels: [], hints: [] }],
        best: { B: 0.9, C: 0.8 },
        checked: 2,
        sum: 1.4,
        max: 0.8,
        suppressed: 2,
        reasons: { x: 1, y: 1 },
      },
    ]);
    expect(merged.pairs).toHaveLength(2);
    expect(merged.checked).toBe(3);
    expect(merged.sum).toBeCloseTo(2.3, 6);
    expect(merged.max).toBe(0.9);
    expect(merged.best.A).toBe(0.9);
    expect(merged.best.B).toBe(0.9);
    expect(merged.reasons).toEqual({ x: 2, y: 1 });
  });

  it('merges suppression scorecards correctly across worker ranges', async () => {
    const entries = [
      makeEntry('A', [1, 0]),
      makeEntry('B', [1, 0]),
      makeEntry('C', [1, 0]),
      makeEntry('D', [1, 0]),
    ];
    const result = await findSimilarities(entries, {
      similarityThreshold: 0.5,
      highSimilarityThreshold: 0.9,
      maxSimilarityThreshold: 0.8,
      limit: 10,
      similarityWorkers: 2,
      similarityWorkerMinEntries: 0,
    });
    expect(result.pairs).toEqual([]);
    expect(result.scorecard.suppressedPairs).toBe(6);
    expect(result.scorecard.suppressionReasons['over-max-threshold']).toBe(6);
  });
});
