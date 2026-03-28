import path from 'path';
import { fileURLToPath } from 'url';

const BENCHMARK_ROOT = fileURLToPath(
  new URL('../benchmarks/react-component-duplicates-v1/', import.meta.url)
);

export const DEFAULT_BENCHMARK_MANIFEST = path.join(BENCHMARK_ROOT, 'manifest.json');

const PRESETS = [
  { id: 'local', kind: 'local', label: 'Local all-MiniLM-L6-v2', aliases: ['baseline-local'] },
  { id: 'mock', kind: 'mock', label: 'Mock hash', aliases: [] },
  {
    id: 'openai/text-embedding-3-small',
    kind: 'remote',
    label: 'OpenAI 3 small',
    aliases: ['text-embedding-3-small', 'openai-small'],
  },
  {
    id: 'openai/text-embedding-3-large',
    kind: 'remote',
    label: 'OpenAI 3 large',
    aliases: ['text-embedding-3-large', 'openai-large'],
  },
  {
    id: 'google/gemini-embedding-001',
    kind: 'remote',
    label: 'Gemini Embedding 001',
    aliases: ['gemini-embedding-001', 'gemini'],
  },
  {
    id: 'qwen/qwen3-embedding-8b',
    kind: 'remote',
    label: 'Qwen3 Embedding 8B',
    aliases: ['qwen3-embedding-8b', 'qwen'],
  },
  {
    id: 'baai/bge-m3',
    kind: 'remote',
    label: 'BGE-M3',
    aliases: ['bge-m3', 'bge'],
  },
  {
    id: 'intfloat/multilingual-e5-large',
    kind: 'remote',
    label: 'Multilingual-E5-Large',
    aliases: ['multilingual-e5-large', 'e5-large', 'e5'],
  },
  {
    id: 'sentence-transformers/all-mpnet-base-v2',
    kind: 'remote',
    label: 'all-mpnet-base-v2',
    aliases: ['all-mpnet-base-v2', 'mpnet'],
  },
];

const PRESET_BY_ID = new Map();
const PRESET_BY_ALIAS = new Map();

PRESETS.forEach((preset) => {
  PRESET_BY_ID.set(preset.id, preset);
  PRESET_BY_ALIAS.set(preset.id, preset.id);
  preset.aliases.forEach((alias) => PRESET_BY_ALIAS.set(alias, preset.id));
});

export const DEFAULT_BENCHMARK_MODEL_IDS = [
  'local',
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
  'google/gemini-embedding-001',
  'qwen/qwen3-embedding-8b',
  'baai/bge-m3',
  'intfloat/multilingual-e5-large',
  'sentence-transformers/all-mpnet-base-v2',
];

export function resolveBenchmarkModels(selected = DEFAULT_BENCHMARK_MODEL_IDS) {
  const requested =
    Array.isArray(selected) && selected.length ? selected : DEFAULT_BENCHMARK_MODEL_IDS;
  return requested.map((value) => {
    const normalized = PRESET_BY_ALIAS.get(value) || value;
    const preset = PRESET_BY_ID.get(normalized);
    if (preset) return { ...preset };
    return { id: normalized, kind: 'remote', label: normalized, aliases: [] };
  });
}

export function buildBenchmarkModelConfig(baseConfig, spec) {
  if (spec.kind === 'mock') {
    return { ...baseConfig, model: 'mock', remote: { ...baseConfig.remote } };
  }
  if (spec.kind === 'local') {
    return { ...baseConfig, model: 'local', remote: { ...baseConfig.remote } };
  }
  return {
    ...baseConfig,
    model: 'remote',
    remote: { ...baseConfig.remote, model: spec.id },
  };
}

export function resolveLocalBenchmarkLabel(config) {
  const modelPath = config?.modelPath || 'models/all-MiniLM-L6-v2';
  return `Local ${path.basename(modelPath)}`;
}
