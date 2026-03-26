import fs from 'fs';
import path from 'path';
import { parseSync } from '@swc/core';
import { IGNORE_COMPONENT_MARKER, IGNORE_FILE_MARKER } from './config.js';

const TYPE_SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.cts', '.mts']);
const JSX_EXTENSIONS = new Set(['.js', '.jsx', '.tsx', '.mjs', '.cjs']);
const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const WALK_SKIP_KEYS = new Set([
  'span',
  'ctxt',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
  'typeParams',
  'superTypeParams',
  'implements',
  'raw',
  'interpreter',
  'with',
  'phase',
]);

/**
 * Parses a single file to extract React components and their metadata.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {Object} config - Configuration object
 * @returns {{ components: Array<Object>, ignoredFile: boolean }} Extracted components and ignore status
 */
export function parseFile(filePath, config) {
  const code = fs.readFileSync(filePath, 'utf8');
  if (config.allowIgnores && code.includes(IGNORE_FILE_MARKER)) {
    return { components: [], ignoredFile: true };
  }

  const ast = parseSync(code, getParserOptions(filePath));
  const context = buildContext(code, filePath, config, ast);
  const components = [];

  walkNode(ast, null, (node, _parent) => {
    if (isStyleImport(node, context.styleExtensions)) {
      context.styleImports.push(resolveImportPath(filePath, node.source.value));
      return;
    }
    const descriptor = resolveComponentDescriptor(node, filePath);
    if (!descriptor || isIgnoredNode(descriptor.ignoreNode, context)) return;
    components.push(buildComponent(descriptor.node, descriptor.name, context));
  });

  return { components, ignoredFile: false };
}

function buildContext(code, filePath, config, ast) {
  return {
    code,
    filePath,
    styleExtensions: config.styleExtensions || [],
    allowIgnores: Boolean(config.allowIgnores),
    lines: config.allowIgnores ? code.split('\n') : null,
    lineStarts: buildLineStarts(code),
    spanOffset: resolveSpanOffset(ast),
    styleImports: [],
  };
}

function getParserOptions(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isTypeScript = TYPE_SCRIPT_EXTENSIONS.has(ext);
  const jsx = JSX_EXTENSIONS.has(ext);

  return {
    syntax: isTypeScript ? 'typescript' : 'ecmascript',
    tsx: isTypeScript ? jsx : undefined,
    jsx: isTypeScript ? undefined : jsx,
    comments: false,
    target: 'es2020',
  };
}

function walkNode(node, parent, enter, exit) {
  /* v8 ignore next */
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walkNode(child, parent, enter, exit));
    return;
  }
  if (typeof node.type !== 'string') return;

  enter?.(node, parent);

  for (const key in node) {
    if (WALK_SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (!value || typeof value !== 'object') continue;
    walkNode(value, node, enter, exit);
  }

  exit?.(node, parent);
}

function resolveComponentDescriptor(node, filePath) {
  return (
    resolveNamedFunction(node) ||
    resolveComponentVariable(node) ||
    resolveNamedClass(node) ||
    resolveDefaultExport(node, filePath)
  );
}

function resolveNamedFunction(node) {
  if (node.type !== 'FunctionDeclaration') return null;
  const name = identifierValue(node.identifier);
  return isPascalCase(name) ? makeDescriptor(node, name) : null;
}

function resolveComponentVariable(node) {
  if (node.type !== 'VariableDeclarator') return null;
  const name = identifierValue(node.id);
  return isComponentVariable(node) ? makeDescriptor(node.init, name, node) : null;
}

function resolveNamedClass(node) {
  if (node.type !== 'ClassDeclaration') return null;
  const name = identifierValue(node.identifier);
  return isReactComponent(node) ? makeDescriptor(node, name) : null;
}

function resolveDefaultExport(node, filePath) {
  if (node.type === 'ExportDefaultDeclaration') {
    return resolveDefaultDeclaration(node.decl, filePath, node);
  }
  if (node.type === 'ExportDefaultExpression') {
    return resolveDefaultExpression(node.expression, filePath, node);
  }
  return null;
}

function resolveDefaultDeclaration(declaration, filePath, ignoreNode) {
  if (isFunctionLike(declaration)) {
    return makeDescriptor(declaration, defaultComponentName(declaration, filePath), ignoreNode);
  }
  if (isReactComponent(declaration, true)) {
    return makeDescriptor(declaration, defaultComponentName(declaration, filePath), ignoreNode);
  }
  return null;
}

function resolveDefaultExpression(expression, filePath, ignoreNode) {
  return isFunctionLike(expression)
    ? makeDescriptor(expression, defaultComponentName(expression, filePath), ignoreNode)
    : null;
}

function makeDescriptor(node, name, ignoreNode = node) {
  return { node, name, ignoreNode };
}

function defaultComponentName(node, filePath) {
  return identifierValue(node.identifier) || path.basename(filePath, path.extname(filePath));
}

function isStyleImport(node, styleExtensions) {
  return node.type === 'ImportDeclaration' && isStylePath(node.source.value, styleExtensions);
}

function buildComponent(node, name, context) {
  const meta = {
    id: `${context.filePath}#${name}`,
    name,
    filePath: context.filePath,
    loc: spanToLoc(node.span, context.code.length, context.lineStarts, context.spanOffset),
    props: extractProps(node),
    hooks: [],
    logicTokens: [],
    literals: [],
    jsxTags: [],
    jsxPaths: [],
    textNodes: [],
    classNames: [],
    componentRefs: [],
    returnsCount: 0,
    styleImports: context.styleImports,
    isWrapper: false,
    source: sliceSource(node.span, context.code, context.spanOffset),
  };

  seedRootLogicToken(meta, node);

  const jsxStack = [];
  walkNode(
    node,
    null,
    (innerNode, parent) => {
      collectComponentNodeMeta(meta, jsxStack, innerNode, parent);
    },
    (innerNode) => {
      if (innerNode.type === 'JSXElement') {
        jsxStack.pop();
      }
    }
  );

  meta.isWrapper = detectWrapper(meta);
  return meta;
}

function seedRootLogicToken(meta, node) {
  if (node.type !== 'FunctionExpression') return;
  const name = identifierValue(node.identifier);
  if (name) meta.logicTokens.push(name);
}

function collectComponentNodeMeta(meta, jsxStack, node, parent) {
  return (
    collectJsxElement(meta, jsxStack, node) ||
    collectJsxOpening(meta, node) ||
    collectJsxText(meta, node) ||
    collectCall(meta, node) ||
    collectFunctionLogic(meta, node) ||
    collectArrowLogic(meta, node, parent) ||
    collectLiteral(meta, node)
  );
}

function collectJsxElement(meta, jsxStack, node) {
  if (node.type !== 'JSXElement') return false;
  const tag = extractJsxTag(node.opening.name);
  jsxStack.push(tag);
  meta.jsxTags.push(tag);
  meta.jsxPaths.push(jsxStack.join('>'));
  return true;
}

function collectJsxOpening(meta, node) {
  if (node.type !== 'JSXOpeningElement') return false;
  const attrs = extractAttributes(node.attributes);
  meta.classNames.push(...attrs.classNames);
  meta.literals.push(...attrs.literals);
  meta.componentRefs.push(...attrs.componentRefs);
  const tagRef = componentRefFromName(node.name);
  if (tagRef) meta.componentRefs.push(tagRef);
  meta.returnsCount += 1;
  return true;
}

function collectJsxText(meta, node) {
  if (node.type !== 'JSXText') return false;
  const value = node.value.trim();
  if (value) meta.textNodes.push(value);
  return true;
}

function collectCall(meta, node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee?.type === 'Identifier' && callee.value.startsWith('use')) {
    meta.hooks.push(callee.value);
  } else if (callee?.type === 'MemberExpression') {
    const name = identifierValue(callee.property);
    if (name) meta.logicTokens.push(name);
  }
  return true;
}

function collectFunctionLogic(meta, node) {
  if (node.type !== 'FunctionDeclaration') return false;
  const name = identifierValue(node.identifier);
  if (name) meta.logicTokens.push(name);
  return true;
}

function collectArrowLogic(meta, node, parent) {
  if (node.type !== 'ArrowFunctionExpression' || parent?.type !== 'VariableDeclarator') {
    return false;
  }
  const name = identifierValue(parent.id);
  if (name) meta.logicTokens.push(name);
  return true;
}

function collectLiteral(meta, node) {
  if (node.type === 'StringLiteral') {
    meta.literals.push(node.value);
    return true;
  }
  if (node.type === 'NumericLiteral') {
    meta.literals.push(String(node.value));
    return true;
  }
  return false;
}

function extractProps(node) {
  if (!isFunctionLike(node)) return { names: [], spreads: 0 };
  const param = firstParamPattern(node);
  if (!param) return { names: [], spreads: 0 };
  if (param.type === 'Identifier') {
    return { names: [param.value], spreads: 0 };
  }
  if (param.type === 'ObjectPattern') {
    return extractObjectPatternProps(param);
  }
  return { names: [], spreads: 0 };
}

function firstParamPattern(node) {
  /* v8 ignore next */
  const [param] = node.params || [];
  if (!param) return null;
  return param.type === 'Parameter' ? param.pat : param;
}

function extractObjectPatternProps(pattern) {
  const names = [];
  let spreads = 0;

  pattern.properties.forEach((prop) => {
    if (prop.type === 'AssignmentPatternProperty') {
      const name = identifierValue(prop.key);
      if (name) names.push(name);
      return;
    }
    if (prop.type === 'KeyValuePatternProperty') {
      const name = identifierValue(prop.key);
      if (name) names.push(name);
      return;
    }
    if (prop.type === 'RestElement') {
      spreads += 1;
    }
  });

  return { names, spreads };
}

function extractAttributes(attributes = []) {
  const classNames = [];
  const literals = [];
  const componentRefs = [];

  attributes.forEach((attr) => {
    if (attr.type === 'JSXAttribute') {
      if (attr.name.value === 'className' && attr.value?.type === 'StringLiteral') {
        classNames.push(...attr.value.value.split(/\s+/).filter(Boolean));
      }
      if (attr.value?.type === 'StringLiteral') {
        literals.push(attr.value.value);
      }
      if (attr.value?.type === 'JSXExpressionContainer') {
        const ref = extractComponentRef(attr.value.expression);
        if (ref) componentRefs.push(ref);
      }
      return;
    }
    if (attr.type === 'SpreadElement') {
      literals.push('spread');
    }
  });

  return { classNames, literals, componentRefs };
}

function extractComponentRef(expression) {
  if (expression?.type === 'Identifier' && isPascalCase(expression.value)) return expression.value;
  if (expression?.type === 'MemberExpression') {
    const root = memberRoot(expression);
    return isPascalCase(root) ? root : null;
  }
  return null;
}

function memberRoot(node) {
  /* v8 ignore next */
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Identifier') return node.value;
  if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
    return memberRoot(node.object);
  }
  return null;
}

function componentRefFromName(nameNode) {
  if (nameNode?.type === 'Identifier') {
    return isPascalCase(nameNode.value) ? nameNode.value : null;
  }
  if (nameNode?.type === 'JSXMemberExpression') {
    const root = memberRoot(nameNode);
    return isPascalCase(root) ? root : null;
  }
  return null;
}

function isComponentVariable(node) {
  return (
    node?.type === 'VariableDeclarator' &&
    isPascalCase(identifierValue(node.id)) &&
    isFunctionLike(node.init)
  );
}

function isReactComponent(node, allowAnonymous = false) {
  const name = identifierValue(node?.identifier);
  /* v8 ignore next */
  if (!name && !allowAnonymous) return false;
  if (name && !isPascalCase(name)) return false;
  if (!node?.superClass) return false;
  if (node.superClass.type === 'MemberExpression') {
    const prop = identifierValue(node.superClass.property);
    return prop === 'Component';
  }
  if (node.superClass.type === 'Identifier') {
    return ['Component', 'PureComponent'].includes(node.superClass.value);
  }
  return false;
}

function isFunctionLike(node) {
  return (
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function identifierValue(node) {
  return node?.type === 'Identifier' ? node.value : null;
}

function isPascalCase(name) {
  return !!name && PASCAL_CASE_RE.test(name);
}

function extractJsxTag(nameNode) {
  if (nameNode?.type === 'Identifier') return nameNode.value;
  if (nameNode?.type === 'JSXMemberExpression') {
    /* v8 ignore next */
    return identifierValue(nameNode.property) || 'Unknown';
  }
  return 'Unknown';
}

function detectWrapper(meta) {
  const tiny = meta.source.split('\n').filter((line) => line.trim()).length <= 12;
  const smallJsx = meta.jsxTags.length <= 2;
  const mostlyProps =
    (meta.props.names.length > 0 || meta.props.spreads > 0) && meta.literals.length <= 4;
  const singleReturn = meta.returnsCount <= 2;
  return tiny && smallJsx && mostlyProps && singleReturn;
}

function isStylePath(source, extensions) {
  return extensions.some((ext) => source.endsWith(ext));
}

function resolveImportPath(fromFile, importPath) {
  return importPath.startsWith('.') ? path.resolve(path.dirname(fromFile), importPath) : importPath;
}

function isIgnoredNode(node, context) {
  if (!context.allowIgnores || !node?.span || !context.lines) return false;
  const loc = spanToLoc(node.span, context.code.length, context.lineStarts, context.spanOffset);
  /* v8 ignore next */
  if (!loc) return false;
  const startIndex = loc.start.line - 1;
  for (let i = Math.max(0, startIndex - 2); i < startIndex; i += 1) {
    if (context.lines[i].includes(IGNORE_COMPONENT_MARKER)) return true;
  }
  return false;
}

function sliceSource(span, code, spanOffset = 0) {
  /* v8 ignore next */
  if (!span) return '';
  const start = clampOffset(normalizeSpanValue(span.start, spanOffset) - 1, code.length);
  const end = clampOffset(normalizeSpanValue(span.end, spanOffset) - 1, code.length);
  return code.slice(start, Math.max(start, end));
}

function spanToLoc(span, length, lineStarts, spanOffset = 0) {
  /* v8 ignore next */
  if (!span) return null;
  return {
    start: offsetToLoc(
      clampOffset(normalizeSpanValue(span.start, spanOffset) - 1, length),
      lineStarts
    ),
    end: offsetToLoc(clampOffset(normalizeSpanValue(span.end, spanOffset) - 1, length), lineStarts),
  };
}

function buildLineStarts(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToLoc(offset, lineStarts) {
  const lineIndex = findLineIndex(offset, lineStarts);
  return {
    line: lineIndex + 1,
    column: offset - lineStarts[lineIndex],
  };
}

function findLineIndex(offset, lineStarts) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, high);
}

function clampOffset(offset, length) {
  return Math.max(0, Math.min(length, offset));
}

function resolveSpanOffset(ast) {
  /* v8 ignore next */
  return Math.max(0, (ast?.span?.start || 1) - 1);
}

function normalizeSpanValue(value, spanOffset) {
  return Math.max(1, value - spanOffset);
}
