import fs from 'fs';
import path from 'path';
import { getI18n, resolveLanguage } from './i18n.js';

export const IGNORE_FILE_MARKER = 'duplicalis-ignore-file';
export const IGNORE_COMPONENT_MARKER = 'duplicalis-ignore-next';

const DEFAULT_CONFIG = {
  root: process.cwd(),
  include: ['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/*.d.ts'],
  styleExtensions: ['.css', '.scss', '.sass', '.less'],
  out: null,
  similarityThreshold: 0.85,
  highSimilarityThreshold: 0.9,
  maxSimilarityThreshold: 1,
  limit: null,
  cachePath: null,
  /* v8 ignore next */
  showProgress: process.stdout.isTTY && process.env.PROGRESS !== 'false',
  cleanProbability: 0.01,
  model: process.env.MODEL || 'local',
  modelPath: process.env.MODEL_PATH || 'models/all-MiniLM-L6-v2',
  modelRepo:
    process.env.MODEL_REPO || 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main',
  autoDownloadModel: process.env.AUTO_DOWNLOAD_MODEL !== 'false',
  compareGlobs: [],
  remote: {
    url: process.env.API_URL || '',
    apiKey: process.env.API_KEY || '',
    model: process.env.API_MODEL || 'text-embedding-3-small',
    timeoutMs: Number(process.env.API_TIMEOUT || 15000),
  },
  weight: { code: 0.55, style: 0.2, structure: 0.15, holistic: 0.1 },
  disableAnalyses: [],
  allowIgnores: true,
  ignoreComponentNamePatterns: [],
  ignoreComponentUsagePatterns: [],
  relativePaths: false,
  minPathDistance: 0,
  language: 'en',
};

export function resolveConfigPath(root, configOption) {
  const resolvedRoot = root ? path.resolve(root) : process.cwd();
  return configOption
    ? path.resolve(configOption)
    : path.join(resolvedRoot, 'duplicalis.config.json');
}

export function loadConfig(cliOptions = {}) {
  const root = cliOptions.root ? path.resolve(cliOptions.root) : process.cwd();
  const configPath = resolveConfigPath(root, cliOptions.config);
  const cliLanguage = resolveLanguage(cliOptions.language, DEFAULT_CONFIG.language);
  const fileConfig = stripUndefined(readConfigFile(configPath, cliLanguage));
  const cleanedCli = stripUndefined(cliOptions);
  const merged = { ...DEFAULT_CONFIG, root, ...fileConfig, ...cleanedCli };
  merged.language = resolveLanguage(merged.language, DEFAULT_CONFIG.language);
  if (!merged.cachePath) {
    merged.cachePath = path.join(root, '.cache', 'duplicalis', 'embeddings.json');
  }
  merged.weight = mergeObjects(DEFAULT_CONFIG.weight, fileConfig?.weight, cliOptions.weight);
  merged.remote = mergeObjects(DEFAULT_CONFIG.remote, fileConfig?.remote, cliOptions.remote);
  merged.include = pick(cliOptions.include, fileConfig?.include, DEFAULT_CONFIG.include);
  merged.exclude = mergeArrays(DEFAULT_CONFIG.exclude, fileConfig?.exclude, cliOptions.exclude);
  merged.limit = pick(cliOptions.limit, fileConfig?.limit, DEFAULT_CONFIG.limit);
  merged.maxSimilarityThreshold = pick(
    cliOptions.maxSimilarityThreshold,
    fileConfig?.maxSimilarityThreshold,
    DEFAULT_CONFIG.maxSimilarityThreshold
  );
  merged.styleExtensions = pick(
    cliOptions.styleExtensions,
    fileConfig?.styleExtensions,
    DEFAULT_CONFIG.styleExtensions
  );
  merged.disableAnalyses = mergeArrays(
    DEFAULT_CONFIG.disableAnalyses,
    fileConfig?.disableAnalyses,
    cliOptions.disableAnalyses
  );
  merged.showProgress = pick(
    cliOptions.showProgress,
    fileConfig?.showProgress,
    DEFAULT_CONFIG.showProgress
  );
  merged.cleanProbability = Number(
    pick(cliOptions.cleanProbability, fileConfig?.cleanProbability, DEFAULT_CONFIG.cleanProbability)
  );
  merged.relativePaths = pick(
    cliOptions.relativePaths,
    fileConfig?.relativePaths,
    DEFAULT_CONFIG.relativePaths
  );
  merged.minPathDistance = Number(
    pick(cliOptions.minPathDistance, fileConfig?.minPathDistance, DEFAULT_CONFIG.minPathDistance)
  );
  merged.ignoreComponentNamePatterns = mergeArrays(
    DEFAULT_CONFIG.ignoreComponentNamePatterns,
    fileConfig?.ignoreComponentNamePatterns,
    cliOptions.ignoreComponentNamePatterns
  );
  merged.ignoreComponentUsagePatterns = mergeArrays(
    DEFAULT_CONFIG.ignoreComponentUsagePatterns,
    fileConfig?.ignoreComponentUsagePatterns,
    cliOptions.ignoreComponentUsagePatterns
  );
  merged.compareGlobs = mergeArrays(
    DEFAULT_CONFIG.compareGlobs,
    fileConfig?.compareGlobs,
    cliOptions.compareGlobs
  );
  merged.configPath = configPath;
  if (cliOptions.model) merged.model = cliOptions.model;
  delete merged.config;
  return merged;
}

function readConfigFile(configPath, language) {
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const i18n = getI18n(language);
    throw new Error(`${i18n.errConfigReadPrefix} ${configPath}: ${error.message}`);
  }
}

function mergeArrays(...arrays) {
  return arrays.filter(Boolean).flat();
}

function mergeObjects(base, fromFile, fromCli) {
  return Object.entries({ ...base, ...(fromFile || {}), ...(fromCli || {}) }).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    },
    {}
  );
}

function pick(cliValue, fileValue, fallback) {
  return cliValue ?? fileValue ?? fallback;
}

function stripUndefined(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.filter((v) => v !== undefined);
  return Object.entries(value).reduce((acc, [key, val]) => {
    if (val === undefined) return acc;
    const cleaned = stripUndefined(val);
    if (cleaned !== undefined && (typeof cleaned !== 'object' || Object.keys(cleaned).length > 0)) {
      acc[key] = cleaned;
    }
    return acc;
  }, {});
}

export function saveConfigFile(config, targetPath) {
  const resolvedPath = path.resolve(targetPath);
  const existing = stripUndefined(readConfigFile(resolvedPath));
  const merged = mergeObjects(existing, pickSavable(config));
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

const SAVABLE_KEYS = [
  'root',
  'include',
  'exclude',
  'styleExtensions',
  'out',
  'similarityThreshold',
  'highSimilarityThreshold',
  'maxSimilarityThreshold',
  'limit',
  'cachePath',
  'showProgress',
  'cleanProbability',
  'model',
  'modelPath',
  'modelRepo',
  'autoDownloadModel',
  'compareGlobs',
  'remote',
  'weight',
  'disableAnalyses',
  'allowIgnores',
  'ignoreComponentNamePatterns',
  'ignoreComponentUsagePatterns',
  'relativePaths',
  'minPathDistance',
  'language',
];

function pickSavable(config) {
  return SAVABLE_KEYS.reduce((acc, key) => {
    if (config[key] !== undefined) acc[key] = stripUndefined(config[key]);
    return acc;
  }, {});
}
