import { findSourceFiles } from '../src/scanner.js';
import { loadComponentsWithCache } from '../src/analysis-cache.js';
import { createEmbeddingBackend } from '../src/embedding/index.js';
import { embedComponents } from '../src/similarity.js';
import { loadBenchmarkSuite } from '../src/benchmark-suite.js';
import { dot } from '../src/math.js';

const suite = loadBenchmarkSuite('benchmarks/react-component-duplicates-v1/manifest.json');
const config = {
  root: suite.root,
  include: suite.include,
  exclude: suite.exclude,
  styleExtensions: suite.styleExtensions,
  cachePath: null,
  analysisCachePath: null,
  model: 'remote',
  modelPath: 'models/all-MiniLM-L6-v2',
  modelRepo: '',
  autoDownloadModel: false,
  showProgress: false,
  language: 'en',
  weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
  disableAnalyses: [],
  allowIgnores: true,
  ignoreComponentNamePatterns: [],
  ignoreComponentUsagePatterns: [],
  compareGlobs: [],
  relativePaths: false,
  minPathDistance: 0,
  cleanProbability: 0,
};

const files = await findSourceFiles(config);
const parsed = loadComponentsWithCache(files, config);

const results = {};
for (const modelId of ['openai/text-embedding-3-small', 'openai/text-embedding-3-large']) {
  const cfg = {
    ...config,
    remote: {
      url: process.env.API_URL,
      apiKey: process.env.API_KEY,
      model: modelId,
      timeoutMs: 120000,
    },
  };
  const backend = await createEmbeddingBackend(cfg);
  const embedded = await embedComponents(parsed.components, backend, cfg);
  const byId = new Map(embedded.entries.map((e) => [e.component.id, e]));

  const posScores = [];
  for (const key of suite.positivePairs) {
    const [a, b] = key.split('::');
    const ea = byId.get(a);
    const eb = byId.get(b);
    if (ea && eb) {
      posScores.push({
        a: a.split('#')[1],
        b: b.split('#')[1],
        score: dot(ea.vector, eb.vector),
      });
    }
  }
  posScores.sort((x, y) => x.score - y.score);

  const hnScores = [];
  for (const pair of suite.hardNegativePairs) {
    const ea = byId.get(pair.a);
    const eb = byId.get(pair.b);
    if (ea && eb) {
      hnScores.push({
        a: pair.a.split('#')[1],
        b: pair.b.split('#')[1],
        score: dot(ea.vector, eb.vector),
      });
    }
  }
  hnScores.sort((x, y) => y.score - x.score);

  results[modelId] = { posScores, hnScores };
}

const small = results['openai/text-embedding-3-small'];
const large = results['openai/text-embedding-3-large'];

console.log('\n=== POSITIVE PAIRS (sorted by small score asc) ===');
console.log(
  'Pair'.padEnd(45) + 'Small'.padStart(8) + 'Large'.padStart(8) + 'Delta'.padStart(8)
);
for (const sp of small.posScores) {
  const lp = large.posScores.find((l) => l.a === sp.a && l.b === sp.b);
  const ls = lp ? lp.score : 0;
  const delta = ls - sp.score;
  console.log(
    `${sp.a} / ${sp.b}`.padEnd(45) +
      sp.score.toFixed(4).padStart(8) +
      ls.toFixed(4).padStart(8) +
      delta.toFixed(4).padStart(8)
  );
}

console.log('\n=== HARD NEGATIVE PAIRS (sorted by small score desc) ===');
console.log(
  'Pair'.padEnd(50) + 'Small'.padStart(8) + 'Large'.padStart(8) + 'Delta'.padStart(8)
);
for (const sp of small.hnScores) {
  const lp = large.hnScores.find((l) => l.a === sp.a && l.b === sp.b);
  const ls = lp ? lp.score : 0;
  const delta = ls - sp.score;
  console.log(
    `${sp.a} / ${sp.b}`.padEnd(50) +
      sp.score.toFixed(4).padStart(8) +
      ls.toFixed(4).padStart(8) +
      delta.toFixed(4).padStart(8)
  );
}

console.log('\n=== OVERLAP ZONE ===');
const smallMinPos = Math.min(...small.posScores.map((p) => p.score));
const smallMaxHN = Math.max(...small.hnScores.map((p) => p.score));
const largeMinPos = Math.min(...large.posScores.map((p) => p.score));
const largeMaxHN = Math.max(...large.hnScores.map((p) => p.score));
console.log(`Small: min pos = ${smallMinPos.toFixed(4)}, max HN = ${smallMaxHN.toFixed(4)}, gap = ${(smallMinPos - smallMaxHN).toFixed(4)}`);
console.log(`Large: min pos = ${largeMinPos.toFixed(4)}, max HN = ${largeMaxHN.toFixed(4)}, gap = ${(largeMinPos - largeMaxHN).toFixed(4)}`);

// Show which HN pairs cross into positives zone for large
console.log('\n=== LARGE: HN pairs above min-positive threshold ===');
for (const lp of large.hnScores) {
  if (lp.score >= largeMinPos) {
    console.log(`  ${lp.a} / ${lp.b}: ${lp.score.toFixed(4)} (min pos = ${largeMinPos.toFixed(4)})`);
  }
}
