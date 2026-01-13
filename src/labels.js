import { cosine } from './math.js';
import { getI18n } from './i18n.js';

export function labelPair(entryA, entryB, similarity, config) {
  const i18n = getI18n(config?.language);
  const context = buildContext(entryA, entryB, similarity, config, i18n);
  const labels = [];
  const hints = [];

  runCheck(labels, hints, wrapperCheck(context));
  runCheck(labels, hints, styleCheck(context));
  runCheck(labels, hints, logicCheck(context));
  runCheck(labels, hints, copyCheck(context));
  runCheck(labels, hints, propCheck(context));
  runCheck(labels, hints, forkCheck(context, labels));

  return { labels, hints };
}

function runCheck(labels, hints, result) {
  if (!result) return;
  labels.push(result.label);
  if (result.hint) hints.push(result.hint);
}

function buildContext(entryA, entryB, similarity, config, i18n) {
  return {
    entryA,
    entryB,
    similarity,
    config,
    i18n,
    logicOverlap: overlap(entryA.component.logicTokens, entryB.component.logicTokens),
    literalOverlap: overlap(entryA.component.literals, entryB.component.literals),
    styleSimilarity: cosine(entryA.styleVec, entryB.styleVec),
    tokenOverlap: textOverlap(entryA.component.source, entryB.component.source),
    lineDiff: Math.abs(lineCount(entryA.component.source) - lineCount(entryB.component.source)),
    hasProps:
      (entryA.component.props?.names?.length || 0) > 0 &&
      (entryB.component.props?.names?.length || 0) > 0,
    hasStyles: entryA.hasStyles || entryB.hasStyles,
    stylePathsA: entryA.stylePaths || [],
    stylePathsB: entryB.stylePaths || [],
    hasCssInJsA: Boolean(entryA.hasCssInJs),
    hasCssInJsB: Boolean(entryB.hasCssInJs),
  };
}

function wrapperCheck(ctx) {
  if (isDisabled(ctx.config, 'wrapper-duplicate')) return null;
  if (ctx.entryA.component.isWrapper && ctx.entryB.component.isWrapper) {
    return {
      label: 'wrapper-duplicate',
      hint: ctx.i18n.hintWrapper,
    };
  }
  return null;
}

function styleCheck(ctx) {
  if (isDisabled(ctx.config, 'style-duplicate')) return null;
  if (!ctx.hasStyles) return null;
  const sharedPaths = intersect(ctx.stylePathsA, ctx.stylePathsB);
  const uniqueA = difference(ctx.stylePathsA, sharedPaths);
  const uniqueB = difference(ctx.stylePathsB, sharedPaths);
  const sharedOnly = sharedPaths.length > 0 && !ctx.hasCssInJsA && !ctx.hasCssInJsB;
  const onlySharedSources = sharedOnly && uniqueA.length === 0 && uniqueB.length === 0;
  if (onlySharedSources) return null;
  if (ctx.styleSimilarity >= 0.8) {
    return {
      label: 'style-duplicate',
      hint: ctx.i18n.hintStyle,
    };
  }
  return null;
}

function logicCheck(ctx) {
  if (isDisabled(ctx.config, 'logic-duplicate')) return null;
  if (ctx.logicOverlap >= 0.6) {
    return {
      label: 'logic-duplicate',
      hint: ctx.i18n.hintLogic,
    };
  }
  return null;
}

function copyCheck(ctx) {
  if (isDisabled(ctx.config, 'copy-paste-variant')) return null;
  if (ctx.similarity >= 0.95 || ctx.tokenOverlap >= 0.9) {
    return {
      label: 'copy-paste-variant',
      hint: ctx.i18n.hintCopy,
    };
  }
  return null;
}

function propCheck(ctx) {
  if (isDisabled(ctx.config, 'prop-parameterizable')) return null;
  const highSimilarity = ctx.similarity >= ctx.config.highSimilarityThreshold;
  if (highSimilarity && (ctx.literalOverlap >= 0.4 || ctx.hasProps)) {
    return {
      label: 'prop-parameterizable',
      hint: ctx.i18n.hintProp,
    };
  }
  return null;
}

function forkCheck(ctx, labels) {
  if (isDisabled(ctx.config, 'forked-clone')) return null;
  const eligible =
    ctx.similarity >= ctx.config.similarityThreshold && labels.length === 0 && ctx.lineDiff >= 4;
  if (eligible) {
    return {
      label: 'forked-clone',
      hint: ctx.i18n.hintFork,
    };
  }
  return null;
}

function overlap(listA, listB) {
  if (!listA.length || !listB.length) return 0;
  const a = new Set(listA);
  const b = new Set(listB);
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(a.size, b.size);
}

function textOverlap(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  return overlap(tokensA, tokensB);
}

function tokenize(text) {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function lineCount(text) {
  return text.split('\n').length;
}

function isDisabled(config, label) {
  /* v8 ignore next */
  return (config.disableAnalyses || []).includes(label);
}

function intersect(listA = [], listB = []) {
  const setB = new Set(listB);
  return Array.from(new Set(listA.filter((item) => setB.has(item))));
}

function difference(list = [], subtract = []) {
  const remove = new Set(subtract);
  return list.filter((item) => !remove.has(item));
}
