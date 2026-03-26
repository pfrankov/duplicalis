export function baseComponent(id, source, extra = {}) {
  const rawProps = valueOr(extra, 'props', { names: [], spreads: 0 });
  const props = rawProps ? { names: [], spreads: 0, ...rawProps } : rawProps;
  return {
    id: extra.componentId || `${id}#${id}`,
    name: extra.name || id,
    filePath: extra.filePath || `${id}.tsx`,
    props,
    hooks: valueOr(extra, 'hooks', []),
    logicTokens: valueOr(extra, 'logicTokens', []),
    literals: valueOr(extra, 'literals', []),
    jsxTags: valueOr(extra, 'jsxTags', ['div']),
    jsxPaths: valueOr(extra, 'jsxPaths', []),
    textNodes: valueOr(extra, 'textNodes', []),
    classNames: valueOr(extra, 'classNames', []),
    componentRefs: extra.componentRefs,
    returnsCount: extra.returnsCount ?? 1,
    styleImports: valueOr(extra, 'styleImports', []),
    isWrapper: extra.isWrapper || false,
    source,
    isCompareTarget: extra.isCompareTarget,
  };
}

export function makeEntry(id, vector, extra = {}) {
  const {
    codeVec = vector,
    styleVec = vector,
    structureVec = vector,
    holisticVec = vector,
    hasStyles = false,
    source = '',
    ...componentExtra
  } = extra;

  return {
    component: baseComponent(id, source, componentExtra),
    vector,
    codeVec,
    styleVec,
    structureVec,
    holisticVec,
    hasStyles,
  };
}

function valueOr(object, key, fallback) {
  return Object.hasOwn(object, key) ? object[key] : fallback;
}
