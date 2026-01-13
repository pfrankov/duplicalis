import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';
import { loadConfig, resolveConfigPath, saveConfigFile } from './config.js';
import { getI18n, resolveLanguageFromArgv } from './i18n.js';
import { run } from './index.js';

dotenv.config();

export function createProgram(argv = process.argv) {
  const language = resolveLanguageFromArgv(argv, 'en');
  const i18n = getI18n(language);
  const program = new Command();
  program.name('duplicalis').description(i18n.cliDescription);

  program
    .command('help')
    .description(i18n.cliHelpCommand)
    .action(() => {
      program.outputHelp();
    });

  const scan = program
    .command('scan', { isDefault: true })
    .description(i18n.cliScanDescription)
    .argument('[target]', i18n.cliArgTarget)
    .option('-c, --cmd <path>', i18n.cliOptCmd)
    .option('-o, --out <path>', i18n.cliOptOut)
    .option('--include <globs...>', i18n.cliOptInclude)
    .option('--exclude <globs...>', i18n.cliOptExclude)
    .option('--threshold <number>', i18n.cliOptThreshold, parseFloat)
    .option('--high-threshold <number>', i18n.cliOptHighThreshold, parseFloat)
    .option('--max-threshold <number>', i18n.cliOptMaxThreshold, parseFloat)
    .option('--limit <number>', i18n.cliOptLimit, parseInt)
    .option('--model <model>', i18n.cliOptModel)
    .option('--model-path <path>', i18n.cliOptModelPath)
    .option('--model-repo <url>', i18n.cliOptModelRepo)
    .option('--auto-download-model', i18n.cliOptAutoDownloadModel)
    .option('--cache-path <path>', i18n.cliOptCachePath)
    .option('--no-progress', i18n.cliOptNoProgress)
    .option('--api-url <url>', i18n.cliOptApiUrl)
    .option('--api-key <key>', i18n.cliOptApiKey)
    .option('--api-model <name>', i18n.cliOptApiModel)
    .option('--api-timeout <ms>', i18n.cliOptApiTimeout, parseInt)
    .option('--disable-analyses <list...>', i18n.cliOptDisableAnalyses)
    .option('--style-extensions <list...>', i18n.cliOptStyleExtensions)
    .option('--ignore-component-name <patterns...>', i18n.cliOptIgnoreComponentName)
    .option('--ignore-component-usage <patterns...>', i18n.cliOptIgnoreComponentUsage)
    .option('--relative-paths', i18n.cliOptRelativePaths)
    .option('--min-path-distance <number>', i18n.cliOptMinPathDistance, parseInt)
    .option('--compare <globs...>', i18n.cliOptCompare)
    .option('--config <path>', i18n.cliOptConfig)
    .option('--save-config [path]', i18n.cliOptSaveConfig)
    .option('--no-ignores', i18n.cliOptNoIgnores)
    .option('--lang <code>', i18n.cliOptLang)
    .action(async (target, opts) => {
      const rootArg = opts.cmd || target || process.cwd();
      const resolvedRoot = path.resolve(rootArg);
      const configPath = resolveConfigPath(resolvedRoot, opts.config);
      const cliOptions = {
        root: resolvedRoot,
        out: opts.out,
        include: opts.include,
        exclude: opts.exclude,
        similarityThreshold: opts.threshold,
        highSimilarityThreshold: opts.highThreshold,
        maxSimilarityThreshold: opts.maxThreshold,
        limit: opts.limit,
        model: opts.model,
        modelPath: opts.modelPath,
        modelRepo: opts.modelRepo,
        autoDownloadModel: opts.autoDownloadModel,
        cachePath: opts.cachePath,
        showProgress: opts.progress,
        disableAnalyses: opts.disableAnalyses,
        styleExtensions: opts.styleExtensions,
        allowIgnores: opts.ignores,
        ignoreComponentNamePatterns: opts.ignoreComponentName,
        ignoreComponentUsagePatterns: opts.ignoreComponentUsage,
        relativePaths: opts.relativePaths,
        minPathDistance: opts.minPathDistance,
        compareGlobs: opts.compare,
        language: opts.lang,
        remote: {
          url: opts.apiUrl,
          apiKey: opts.apiKey,
          model: opts.apiModel,
          timeoutMs: opts.apiTimeout,
        },
      };
      const config = loadConfig({ ...cliOptions, config: configPath });
      if (opts.saveConfig !== undefined) {
        const provided = typeof opts.saveConfig === 'string' ? opts.saveConfig : null;
        const targetPath = provided
          ? path.isAbsolute(provided)
            ? provided
            : path.resolve(resolvedRoot, provided)
          : configPath;
        const savedPath = saveConfigFile(config, targetPath);
        config.configPath = savedPath;
        config.configSaved = true;
      } else {
        config.configPath = configPath;
      }
      await run(config);
    });

  program.addCommand(scan);
  return program;
}

export async function runCli(argv = process.argv) {
  const program = createProgram(argv);
  await program.parseAsync(argv);
  return program;
}

/* v8 ignore start -- only exercised when invoked as a standalone binary */
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
