import path from 'path';
import { describe, it, expect } from 'vitest';
import { findSourceFiles } from '../src/scanner.js';

describe('scanner', () => {
  it('finds files with default patterns when include is missing', async () => {
    const files = await findSourceFiles({
      root: path.resolve('examples'),
      exclude: [],
    });
    expect(files.some((f) => f.endsWith('PrimaryButton.tsx'))).toBe(true);
  });

  it('falls back to defaults when include is empty', async () => {
    const files = await findSourceFiles({
      root: path.resolve('examples'),
      include: [],
      exclude: [],
    });
    expect(files.length).toBeGreaterThan(0);
  });

  it('returns files in stable sorted order', async () => {
    const files = await findSourceFiles({
      root: path.resolve('examples'),
      exclude: [],
    });
    const sorted = [...files].sort((a, b) => a.localeCompare(b));
    expect(files).toEqual(sorted);
  });
});
