import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import traverseImport from '@babel/traverse';
import * as t from '@babel/types';
import { IGNORE_COMPONENT_MARKER, IGNORE_FILE_MARKER } from './config.js';

const BASE_PARSER_PLUGINS = [
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
  'objectRestSpread',
];
const TYPE_SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.cts', '.mts']);
const JSX_EXTENSIONS = new Set(['.js', '.jsx', '.tsx', '.mjs', '.cjs']);
const traverse = traverseImport.default || traverseImport;

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
  const ast = parser.parse(code, getParserOptions(filePath));
  /* v8 ignore next */
  const styleImports = collectStyleImports(ast, filePath, config.styleExtensions || []);
  const components = [];

  traverse(ast, {
    enter(pathObj) {
      const component = maybeBuildComponent(pathObj, code, filePath, styleImports, config);
      if (component) components.push(component);
    },
  });

  return { components, ignoredFile: false };
}

function getParserOptions(filePath) {
  return {
    sourceType: 'unambiguous',
    plugins: resolveParserPlugins(filePath),
  };
}

function resolveParserPlugins(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const plugins = [...BASE_PARSER_PLUGINS];
  if (TYPE_SCRIPT_EXTENSIONS.has(ext)) {
    plugins.push('typescript');
  }
  if (JSX_EXTENSIONS.has(ext)) {
    plugins.push('jsx');
  }
  return plugins;
}

function maybeBuildComponent(pathObj, code, filePath, styleImports, config) {
  const node = pathObj.node;
  if (isIgnoredNode(pathObj, config, code)) return null;
  /* v8 ignore start */
  const handlers = [
    () =>
      t.isFunctionDeclaration(node) && isPascalCase(node.id?.name)
        ? buildComponent(pathObj, node.id.name, code, filePath, styleImports)
        : null,
    () => {
      if (!t.isVariableDeclarator(node) || !isComponentVariable(node)) return null;
      const initPath = pathObj.get('init');
      return buildComponent(initPath, node.id.name, code, filePath, styleImports);
    },
    /* v8 ignore next */
    () =>
      t.isClassDeclaration(node) && isReactComponent(node)
        ? buildComponent(pathObj, node.id?.name || 'DefaultExport', code, filePath, styleImports)
        : null,
    () => {
      /* v8 ignore next */
      if (!t.isExportDefaultDeclaration(node) || !isFunctionLike(node.declaration)) return null;
      const name = node.declaration.id?.name || path.basename(filePath, path.extname(filePath));
      const declPath = pathObj.get('declaration');
      return buildComponent(declPath, name, code, filePath, styleImports);
    },
  ];
  for (const handler of handlers) {
    const component = handler();
    if (component) return component;
  }
  /* v8 ignore stop */
  return null;
}

/* v8 ignore start */
function collectStyleImports(ast, filePath, styleExtensions) {
  const imports = [];
  traverse(ast, {
    ImportDeclaration(pathObj) {
      const source = pathObj.node.source.value;
      /* v8 ignore next */
      if (isStylePath(source, styleExtensions)) {
        imports.push(resolveImportPath(filePath, source));
      }
    },
  });
  return imports;
}
/* v8 ignore stop */

function buildComponent(pathObj, name, code, filePath, styleImports) {
  const node = pathObj.node;
  const meta = {
    id: `${filePath}#${name}`,
    name,
    filePath,
    /* v8 ignore next */ loc: node.loc || null,
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
    styleImports,
    isWrapper: false,
    source: sliceSource(node, code),
  };

  const jsxStack = [];
  pathObj.traverse({
    JSXElement: {
      enter(innerPath) {
        const tag = extractJsxTag(innerPath.node.openingElement.name);
        jsxStack.push(tag);
        meta.jsxTags.push(tag);
        meta.jsxPaths.push(jsxStack.join('>'));
      },
      exit() {
        jsxStack.pop();
      },
    },
    JSXOpeningElement(innerPath) {
      const { classNames, literals, componentRefs } = extractAttributes(innerPath.node.attributes);
      meta.classNames.push(...classNames);
      meta.literals.push(...literals);
      meta.componentRefs.push(...componentRefs);
      const tagRef = componentRefFromName(innerPath.node.name);
      if (tagRef) meta.componentRefs.push(tagRef);
      meta.returnsCount += 1;
    },
    JSXText(innerPath) {
      const value = innerPath.node.value.trim();
      if (value) meta.textNodes.push(value);
    },
    CallExpression(innerPath) {
      const callee = innerPath.node.callee;
      if (t.isIdentifier(callee) && callee.name.startsWith('use')) {
        meta.hooks.push(callee.name);
      } else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        meta.logicTokens.push(callee.property.name);
      }
    },
    FunctionDeclaration(innerPath) {
      if (innerPath.node.id?.name) meta.logicTokens.push(innerPath.node.id.name);
    },
    ArrowFunctionExpression(innerPath) {
      if (t.isVariableDeclarator(innerPath.parent) && innerPath.parent.id?.name) {
        meta.logicTokens.push(innerPath.parent.id.name);
      }
    },
    StringLiteral(innerPath) {
      meta.literals.push(innerPath.node.value);
    },
    NumericLiteral(innerPath) {
      meta.literals.push(String(innerPath.node.value));
    },
  });

  meta.isWrapper = detectWrapper(meta);
  return meta;
}

/* v8 ignore start */
function extractProps(node) {
  if (!isFunctionLike(node)) return { names: [], spreads: 0 };
  if (!node.params?.length) return { names: [], spreads: 0 };
  const param = node.params[0];
  if (t.isIdentifier(param)) {
    return { names: [param.name], spreads: 0 };
  }
  if (t.isObjectPattern(param)) {
    const names = param.properties
      .filter((prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key))
      .map((prop) => prop.key.name);
    return { names, spreads: countSpreads(param.properties) };
  }
  return { names: [], spreads: 0 };
}

function countSpreads(props) {
  return props.filter((prop) => t.isRestElement(prop)).length;
}

function extractAttributes(attributes) {
  const classNames = [];
  const literals = [];
  const componentRefs = [];
  attributes.forEach((attr) => {
    if (t.isJSXAttribute(attr)) {
      if (attr.name.name === 'className' && t.isStringLiteral(attr.value)) {
        classNames.push(...attr.value.value.split(/\s+/).filter(Boolean));
      }
      if (t.isStringLiteral(attr.value)) literals.push(attr.value.value);
      if (t.isJSXExpressionContainer(attr.value)) {
        const ref = extractComponentRef(attr.value.expression);
        if (ref) componentRefs.push(ref);
      }
    } else if (t.isJSXSpreadAttribute(attr)) {
      literals.push('spread');
    }
  });
  return { classNames, literals, componentRefs };
}

function sliceSource(node, code) {
  if (!node.loc) return '';
  const lines = code.split('\n').slice(node.loc.start.line - 1, node.loc.end.line);
  return lines.join('\n');
}

function extractComponentRef(expression) {
  if (t.isIdentifier(expression) && isPascalCase(expression.name)) return expression.name;
  if (t.isMemberExpression(expression)) {
    const root = memberRoot(expression);
    if (root && isPascalCase(root)) return root;
  }
  return null;
}

function memberRoot(memberExpression) {
  if (t.isIdentifier(memberExpression.object) || t.isJSXIdentifier?.(memberExpression.object)) {
    return memberExpression.object.name;
  }
  if (
    t.isMemberExpression(memberExpression.object) ||
    t.isJSXMemberExpression(memberExpression.object)
  ) {
    return memberRoot(memberExpression.object);
  }
  return null;
}

function componentRefFromName(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return isPascalCase(nameNode.name) ? nameNode.name : null;
  }
  if (t.isJSXMemberExpression(nameNode)) {
    const root = memberRoot(nameNode);
    return root && isPascalCase(root) ? root : null;
  }
  return null;
}

function isComponentVariable(node) {
  return t.isIdentifier(node.id) && isPascalCase(node.id.name) && isFunctionLike(node.init);
}

function isReactComponent(node) {
  if (!t.isIdentifier(node.id) || !isPascalCase(node.id.name)) return false;
  if (!node.superClass) return false;
  if (t.isMemberExpression(node.superClass)) {
    return node.superClass.property.name === 'Component';
  }
  if (t.isIdentifier(node.superClass)) {
    return ['Component', 'PureComponent'].includes(node.superClass.name);
  }
  return false;
}

function isFunctionLike(node) {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  );
}

function isPascalCase(name) {
  return !!name && /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function extractJsxTag(nameNode) {
  if (t.isJSXIdentifier(nameNode)) return nameNode.name;
  if (t.isJSXMemberExpression(nameNode) && t.isJSXIdentifier(nameNode.property)) {
    return nameNode.property.name;
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
  if (importPath.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), importPath);
  }
  return importPath;
}

function isIgnoredNode(pathObj, config, code) {
  if (!config.allowIgnores) return false;
  const comments = (pathObj.node.leadingComments || []).map((c) => c.value);
  if (comments.some((text) => text.includes(IGNORE_COMPONENT_MARKER))) return true;
  if (!code || !pathObj.node.loc) return false;
  const lines = code.split('\n');
  const startIndex = pathObj.node.loc.start.line - 1;
  for (let i = Math.max(0, startIndex - 2); i < startIndex; i += 1) {
    if (lines[i].includes(IGNORE_COMPONENT_MARKER)) return true;
  }
  return false;
}
/* v8 ignore stop */
