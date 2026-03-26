import fs from 'fs';
import path from 'path';
import { buildRepresentation } from './representation.js';
import { loadStyles } from './styles.js';

export function ensureComponentAnalysis(component, config) {
  const fingerprint = fingerprintComponent(component);
  if (component.analysis?.fingerprint === fingerprint) return component.analysis;

  const styles = loadStyles(component, config);
  const representation = buildRepresentation(component, styles.styleText);
  const analysis = {
    fingerprint,
    styleText: styles.styleText,
    stylePaths: styles.stylePaths,
    hasCssInJs: styles.hasCssInJs,
    hasStyles: Boolean((styles.styleText || '').trim()),
    representation,
    styleDependencies: buildDependencyStates(styles.stylePaths, config.root),
  };
  component.analysis = analysis;
  return analysis;
}

export function buildDependencyStates(stylePaths = [], root = process.cwd()) {
  return Array.from(
    new Set(stylePaths.map((stylePath) => resolveStyleDependency(stylePath, root)))
  ).map((resolvedPath) => snapshotFileState(resolvedPath));
}

export function snapshotFileState(filePath) {
  /* v8 ignore next */
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    return { filePath, exists: false };
  }

  const stat = fs.statSync(filePath);
  return {
    filePath,
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

export function sameFileState(left, right) {
  /* v8 ignore next */
  if (!left || !right) return false;
  if (left.filePath !== right.filePath || left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return (
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
  );
}

export function resolveStyleDependency(stylePath, root = process.cwd()) {
  /* v8 ignore next */
  return stylePath.startsWith('.') ? path.resolve(root, stylePath) : stylePath;
}

function fingerprintComponent(component) {
  return JSON.stringify({
    source: component.source,
    props: component.props,
    hooks: component.hooks,
    logicTokens: component.logicTokens,
    literals: component.literals,
    jsxTags: component.jsxTags,
    jsxPaths: component.jsxPaths,
    textNodes: component.textNodes,
    classNames: component.classNames,
    componentRefs: component.componentRefs,
    returnsCount: component.returnsCount,
    styleImports: component.styleImports,
    isWrapper: component.isWrapper,
  });
}
