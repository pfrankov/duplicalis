import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSync } from '@swc/core';
import { afterEach, describe, expect, it } from 'vitest';
import { parseFile } from '../src/parser.js';

const config = { allowIgnores: true, styleExtensions: [] };
const directories = [];

function fixture(code, name = 'Components.tsx') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-spans-'));
  directories.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, code);
  return file;
}

function expectSource(component, source, code) {
  expect(component.source).toBe(source);
  const start = code.indexOf(source);
  expect(start).toBeGreaterThanOrEqual(0);
  const location = (offset) => {
    const lines = code.slice(0, offset).split(/\r\n|[\n\r\u2028\u2029]/);
    return { line: lines.length, column: lines.at(-1).length };
  };
  expect(component.loc).toEqual({
    start: location(start),
    end: location(start + source.length),
  });
}

afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('parser source spans', () => {
  it.each([
    ['', ''],
    ['\n\n  ', '\n\n'],
    ['// heading\n\n', '\n// trailing comment'],
    ['/* Привет 😀 */\n\t// 你好\n  ', ' /* trailing */ '],
    ['\uFEFF', ''],
    ['\uFEFF/* heading */\n', ''],
    ['#!/usr/bin/env node\n\n', '\n'],
    ['\uFEFF#!/usr/bin/env node\n', '\n'],
  ])('preserves exact source and locations after prefix %j', (prefix, suffix) => {
    const source = 'function Button(){ return <button>你好 😀</button>; }';
    const code = `${prefix}${source}${suffix}`;
    const result = parseFile(fixture(code), config);
    expect(result.components).toHaveLength(1);
    expectSource(result.components[0], source, code);
  });

  it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
    'uses original lines and UTF-16 columns with line ending %j',
    (newline) => {
      const first = `function First(){${newline}  return <div>é Ж 你好 😀</div>;${newline}}`;
      const second = '() => <span>é 😀</span>';
      const code = `// 😀 heading${newline}${newline}${first}${newline}const label = '你好 😀'; const Second = ${second};`;
      const result = parseFile(fixture(code), config);
      expect(result.components.map((component) => component.name)).toEqual(['First', 'Second']);
      expectSource(result.components[0], first, code);
      expectSource(result.components[1], second, code);
    }
  );

  it('keeps offsets independent across repeated files and unrelated SWC parses', () => {
    const firstSource = 'function First(){ return <div>Привет 😀</div>; }';
    const secondSource = 'function Second(){ return <span>你好</span>; }';
    const firstCode = `/* heading */\n\n${firstSource}`;
    const secondCode = `const text = 'é 😀';\n${secondSource}`;
    const first = fixture(firstCode, 'First.tsx');
    const second = fixture(secondCode, 'Second.jsx');
    for (const [file, code, source] of [
      [first, firstCode, firstSource],
      [second, secondCode, secondSource],
      [first, firstCode, firstSource],
    ]) {
      parseSync("const unrelated = '😀';", { syntax: 'ecmascript' });
      expectSource(parseFile(file, config).components[0], source, code);
    }
  });

  it('preserves nested functions, function expressions, classes, and default exports', () => {
    const nested = 'function Nested(){ return <i>😀</i>; }';
    const outer = `function Outer(){\n  ${nested}\n  return <Nested />;\n}`;
    const expression = 'function Named(){ return <b>é</b>; }';
    const legacy = 'class Legacy extends React.Component { render(){ return <p>你好</p>; } }';
    const anonymous = 'function(){ return <em>Ж</em>; }';
    const code = `// header\n${outer}\nconst Expression = ${expression};\n${legacy}\nexport default ${anonymous}`;
    const components = parseFile(fixture(code), config).components;
    expect(components.map((component) => component.name)).toEqual([
      'Outer',
      'Nested',
      'Expression',
      'Legacy',
      'Components',
    ]);
    [outer, nested, expression, legacy, anonymous].forEach((source, index) =>
      expectSource(components[index], source, code)
    );
  });

  it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
    'applies ignore-next to the original source lines with %j',
    (newline) => {
      const hidden = 'function Hidden(){ return <p>😀</p>; }';
      const shown = 'function Shown(){ return <p>你好</p>; }';
      const code = `// duplicalis-ignore-next${newline}${hidden}${newline}${newline}${newline}${shown}`;
      const file = fixture(code);
      const ignored = parseFile(file, config).components;
      expect(ignored.map((component) => component.name)).toEqual(['Shown']);
      expectSource(ignored[0], shown, code);
      const included = parseFile(file, { ...config, allowIgnores: false }).components;
      expect(included).toHaveLength(2);
      expectSource(included[0], hidden, code);
      expectSource(included[1], shown, code);
    }
  );

  it.each(['', '// 😀', '/* 你好 */\n', '\uFEFF\r\n'])(
    'keeps empty and trivia-only files empty: %j',
    (code) => {
      expect(parseFile(fixture(code), config)).toEqual({ components: [], ignoredFile: false });
    }
  );
});
