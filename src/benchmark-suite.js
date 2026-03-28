import fs from 'fs';
import path from 'path';

export function loadBenchmarkSuite(manifestPath) {
  const resolvedPath = path.resolve(manifestPath);
  const root = path.dirname(resolvedPath);
  const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const duplicateGroups = (raw.duplicateGroups || []).map((group) => ({
    id: group.id,
    label: group.label || 'near-duplicate',
    components: uniqueRefs(group.components || []).map((ref) => resolveComponentRef(root, ref)),
  }));
  const hardNegativePairs = (raw.hardNegativePairs || []).map((pair) => ({
    a: resolveComponentRef(root, pair.a),
    b: resolveComponentRef(root, pair.b),
    reason: pair.reason || '',
  }));

  validateGroups(duplicateGroups);
  validateHardNegatives(duplicateGroups, hardNegativePairs);

  const positivePairs = new Set();
  const relatedByComponent = new Map();
  duplicateGroups.forEach((group) => {
    for (let i = 0; i < group.components.length; i += 1) {
      for (let j = i + 1; j < group.components.length; j += 1) {
        const a = group.components[i];
        const b = group.components[j];
        positivePairs.add(canonicalPairKey(a, b));
        linkRelated(relatedByComponent, a, b);
      }
    }
  });

  return {
    id: raw.id || path.basename(root),
    name: raw.name || 'React duplicate benchmark',
    description: raw.description || '',
    root,
    manifestPath: resolvedPath,
    include: raw.include || ['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js'],
    exclude: raw.exclude || [],
    styleExtensions: raw.styleExtensions || ['.css', '.scss', '.sass', '.less'],
    duplicateGroups,
    hardNegativePairs,
    positivePairs,
    relatedByComponent,
    referencedComponentIds: referencedIds(duplicateGroups, hardNegativePairs),
  };
}

export function canonicalPairKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function resolveComponentRef(root, ref) {
  const value = String(ref || '');
  const index = value.lastIndexOf('#');
  if (index === -1) {
    throw new Error(`Benchmark component reference must include "#": ${value}`);
  }
  const filePath = value.slice(0, index);
  const name = value.slice(index + 1);
  return `${path.resolve(root, filePath)}#${name}`;
}

function validateGroups(groups) {
  const ids = new Set();
  groups.forEach((group) => {
    if (!group.id) throw new Error('Benchmark duplicate group is missing an id.');
    if (ids.has(group.id)) throw new Error(`Duplicate benchmark group id: ${group.id}`);
    ids.add(group.id);
    if (group.components.length < 2) {
      throw new Error(`Benchmark group "${group.id}" must contain at least two components.`);
    }
  });
}

function validateHardNegatives(groups, pairs) {
  const positives = new Set();
  groups.forEach((group) => {
    for (let i = 0; i < group.components.length; i += 1) {
      for (let j = i + 1; j < group.components.length; j += 1) {
        positives.add(canonicalPairKey(group.components[i], group.components[j]));
      }
    }
  });

  const seen = new Set();
  pairs.forEach((pair) => {
    const key = canonicalPairKey(pair.a, pair.b);
    if (pair.a === pair.b) {
      throw new Error(`Benchmark hard negative pair repeats the same component: ${pair.a}`);
    }
    if (positives.has(key)) {
      throw new Error(`Benchmark hard negative overlaps a positive pair: ${key}`);
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate benchmark hard negative pair: ${key}`);
    }
    seen.add(key);
  });
}

function linkRelated(map, a, b) {
  if (!map.has(a)) map.set(a, new Set());
  if (!map.has(b)) map.set(b, new Set());
  map.get(a).add(b);
  map.get(b).add(a);
}

function uniqueRefs(values = []) {
  return Array.from(new Set(values));
}

function referencedIds(groups, pairs) {
  const ids = new Set();
  groups.forEach((group) => group.components.forEach((id) => ids.add(id)));
  pairs.forEach((pair) => {
    ids.add(pair.a);
    ids.add(pair.b);
  });
  return ids;
}
