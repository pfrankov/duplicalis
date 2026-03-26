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

  it('detects default exported components', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicalis-default-'));
    const file = path.join(dir, 'DefaultComp.tsx');
    fs.writeFileSync(file, 'export default function DefaultComp(){ return <div>default</div>; }');
    const result = parseFile(file, baseConfig);
    expect(result.components[0].name).toBe('DefaultComp');
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
});
