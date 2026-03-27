import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { parseFile } from '../src/parser.js';

const baseConfig = { allowIgnores: true, styleExtensions: ['.css', '.scss'] };

describe('parser', () => {
  it('extracts component metadata', () => {
    const file = path.resolve('examples/PrimaryButton.tsx');
    const result = parseFile(file, baseConfig);
    expect(result.ignoredFile).toBe(false);
    expect(result.components.length).toBe(1);
    const comp = result.components[0];
    expect(comp.name).toBe('PrimaryButton');
    expect(comp.classNames).toContain('btn');
    expect(comp.styleImports[0]).toContain('Button.css');
    expect(comp.hooks.length).toBe(0);
  });

  it('ignores file with marker', () => {
    const file = path.resolve('examples/Ignored.tsx');
    const result = parseFile(file, baseConfig);
    expect(result.components.length).toBe(0);
    expect(result.ignoredFile).toBe(true);
  });

  it('ignores component with marker', () => {
    const file = path.resolve('examples/IgnoredComponent.tsx');
    const result = parseFile(file, baseConfig);
    expect(result.components.length).toBe(1);
    expect(result.components[0].name).toBe('KeepMe');
  });

  it('captures class components, member calls, and spread props', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-'));
    const file = path.join(dir, 'Temp.tsx');
    fs.writeFileSync(
      file,
      `
      import React, { Component } from 'react';
      import './Temp.css';
      import 'normalize.css';
      const util = { run() {} };
      export const TempComp = function TempComp({ value, ...rest }) {
        const count = 3;
        util.run();
        function helper() { return value; }
        helper();
        return <span className="c"><Foo.Bar />{value}{count}</span>;
      };
      class Legacy extends React.Component {
        render() { return <div>legacy</div>; }
      }
      class Another extends Component {
        render() { return <div>another</div>; }
      }
      `
    );
    const result = parseFile(file, baseConfig);
    const temp = result.components.find((c) => c.name === 'TempComp');
    expect(temp.props.spreads).toBe(1);
    expect(temp.logicTokens).toContain('run');
    expect(temp.literals).toContain('3');
    expect(temp.componentRefs).toContain('Foo');
    const legacy = result.components.find((c) => c.name === 'Legacy');
    expect(legacy).toBeDefined();
    const another = result.components.find((c) => c.name === 'Another');
    expect(another).toBeDefined();
  });

  it('extracts component refs from member expressions and skips unsupported roots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-refs-'));
    const file = path.join(dir, 'Refs.tsx');
    fs.writeFileSync(
      file,
      `
      export function Refs() {
        return <Widget icon={Icons.Add} fallback={factory().Thing} />;
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].componentRefs).toContain('Icons');
    expect(result.components[0].componentRefs).not.toContain('factory');
  });

  it('handles call expressions with unsupported callee shapes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-calls-'));
    const file = path.join(dir, 'Calls.tsx');
    fs.writeFileSync(
      file,
      `
      export function Calls() {
        factory()();
        return <div />;
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].logicTokens).not.toContain('factory');
  });

  it('ignores lowercase class names and lowercase JSX member roots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-lowercase-'));
    const file = path.join(dir, 'Lowercase.tsx');
    fs.writeFileSync(
      file,
      `
      class bad extends Component {
        render() { return <div>bad</div>; }
      }

      export function Wrapper() {
        return <foo.Bar />;
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('Wrapper');
    expect(result.components[0].componentRefs).not.toContain('foo');
  });

  it('ignores classes that do not extend a React component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-parser-plain-class-'));
    const file = path.join(dir, 'Plain.tsx');
    fs.writeFileSync(
      file,
      `
      class Plain {
        render() { return <div>plain</div>; }
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(0);
  });

  it('respects allowIgnores flag and handles components without params', () => {
    const file = path.resolve('examples/Ignored.tsx');
    const result = parseFile(file, { ...baseConfig, allowIgnores: false });
    expect(result.components.length).toBe(1);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-noprops-'));
    const tmpFile = path.join(tmpDir, 'NoProps.tsx');
    fs.writeFileSync(tmpFile, 'export function NoProps(){ return <div />; }');
    const res = parseFile(tmpFile, baseConfig);
    expect(res.components[0].props.names.length).toBe(0);
  });

  it('handles aliased object props and unsupported param patterns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-param-shapes-'));
    const aliased = path.join(dir, 'Aliased.tsx');
    const arrayParam = path.join(dir, 'ArrayParam.tsx');
    fs.writeFileSync(aliased, 'export function Aliased({ title: heading, count }){ return <div />; }');
    fs.writeFileSync(arrayParam, 'export function ArrayParam([value]){ return <div />; }');
    const aliasedResult = parseFile(aliased, baseConfig);
    const arrayResult = parseFile(arrayParam, baseConfig);
    expect(aliasedResult.components[0].props.names).toContain('title');
    expect(aliasedResult.components[0].props.names).toContain('count');
    expect(arrayResult.components[0].props.names).toEqual([]);
  });

  it('detects default exported components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-default-'));
    const file = path.join(dir, 'DefaultComp.tsx');
    fs.writeFileSync(file, 'export default function DefaultComp(){ return <div>default</div>; }');
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('DefaultComp');
  });

  it('falls back to filename for anonymous default exports and tolerates missing style extensions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-anon-default-'));
    const file = path.join(dir, 'AnonComp.tsx');
    fs.writeFileSync(file, 'export default () => <div className="x">anon</div>;');
    const result = parseFile(file, { allowIgnores: true });
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('AnonComp');
  });

  it('ignores default exports that are not React components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-non-component-defaults-'));
    const badClass = path.join(dir, 'BadClass.tsx');
    const literal = path.join(dir, 'Literal.tsx');
    fs.writeFileSync(
      badClass,
      `
      export default class extends factory() {
        render() { return <div>bad</div>; }
      }
      `
    );
    fs.writeFileSync(literal, 'export default 42;');
    expect(parseFile(badClass, baseConfig).components).toHaveLength(0);
    expect(parseFile(literal, baseConfig).components).toHaveLength(0);
  });

  it('detects named default exported class components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-default-class-named-'));
    const file = path.join(dir, 'LegacyNamed.tsx');
    fs.writeFileSync(
      file,
      `
      import React from 'react';
      export default class LegacyNamed extends React.Component {
        render() { return <div>legacy</div>; }
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('LegacyNamed');
  });

  it('detects anonymous default exported class components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-default-class-'));
    const file = path.join(dir, 'LegacyDefault.tsx');
    fs.writeFileSync(
      file,
      `
      import React from 'react';
      export default class extends React.Component {
        render() { return <div>legacy</div>; }
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('LegacyDefault');
  });

  it('skips classes with unsupported super class shapes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-weird-class-'));
    const file = path.join(dir, 'Weird.tsx');
    fs.writeFileSync(
      file,
      `
      class Weird extends factory() {
        render() { return <div>weird</div>; }
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(0);
  });

  it('falls back to Unknown for unsupported JSX tag node types', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-unknown-jsx-'));
    const file = path.join(dir, 'Namespaced.tsx');
    fs.writeFileSync(file, 'export function Namespaced(){ return <svg:path />; }');
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].jsxTags).toContain('Unknown');
  });

  it('parses .ts files without forcing JSX mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-ts-only-'));
    const file = path.join(dir, 'assertion.ts');
    fs.writeFileSync(
      file,
      `
      type Foo = { value: string };
      type Bar = { value: string };
      const value = <Foo | Bar>source;
      export const helper = () => value;
      `
    );
    expect(() => parseFile(file, baseConfig)).not.toThrow();
    const result = parseFile(file, baseConfig);
    expect(result.ignoredFile).toBe(false);
    expect(result.components.length).toBe(0);
  });

  it('parses .js files with JSX enabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-jsx-js-'));
    const file = path.join(dir, 'Widget.js');
    fs.writeFileSync(
      file,
      `
      export function Widget() {
        return <section className="widget">ok</section>;
      }
      `
    );
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('Widget');
    expect(result.components[0].jsxTags).toContain('section');
  });

  it('parses .ts files that use decorated class fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-ts-decorators-'));
    const file = path.join(dir, 'store.ts');
    fs.writeFileSync(
      file,
      `
      class ModalStore {
        @observable
        private currentModalDescriptor: string | null = null;
      }

      export const helper = () => new ModalStore();
      `
    );
    expect(() => parseFile(file, baseConfig)).not.toThrow();
    const result = parseFile(file, baseConfig);
    expect(result.ignoredFile).toBe(false);
    expect(result.components).toHaveLength(0);
  });

  it('parses .tsx files when decorated support classes coexist with components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-tsx-decorators-'));
    const file = path.join(dir, 'DecoratedWidget.tsx');
    fs.writeFileSync(
      file,
      `
      class ModalStore {
        @observable
        private currentModalDescriptor: string | null = null;
      }

      export function DecoratedWidget() {
        return <section>ok</section>;
      }
      `
    );
    expect(() => parseFile(file, baseConfig)).not.toThrow();
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('DecoratedWidget');
  });

  it('parses .js files with decorators before export on class components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-js-decorators-'));
    const file = path.join(dir, 'DecoratedExport.js');
    fs.writeFileSync(
      file,
      `
      import React from 'react';

      @observer
      export class DecoratedExport extends React.Component {
        render() {
          return <div>ok</div>;
        }
      }
      `
    );
    expect(() => parseFile(file, baseConfig)).not.toThrow();
    const result = parseFile(file, baseConfig);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].name).toBe('DecoratedExport');
  });
});
