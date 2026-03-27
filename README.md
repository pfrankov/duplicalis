<div align="center">
  <img
    src="https://github.com/user-attachments/assets/7843722b-e6ed-4438-803d-95493006c0a0"
    alt="Duplicalis banner"
    width="300"
  />
  <h1>Duplicalis</h1>
  <p>Duplicate React Component Analyzer for large codebases.</p>
  <p>
    <a href="https://www.npmjs.com/package/duplicalis">
      <img alt="npm" src="https://img.shields.io/npm/v/duplicalis.svg" />
    </a>
    <img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" />
    <img alt="node" src="https://img.shields.io/badge/node-%3E=18-brightgreen.svg" />
    <img alt="type" src="https://img.shields.io/badge/type-module-informational.svg" />
  </p>
  <p>
    <a href="#-quick-start">Quick start</a> |
    <a href="#-architecture">Architecture</a> |
    <a href="#-configuration">Configuration</a> |
    <a href="#-usage-examples">Examples</a>
  </p>
</div>

Duplicalis helps you find duplicate or near-duplicate React components in your codebase. It analyzes
component logic, structure, and styles to identify components that can be refactored or merged.

It uses AI embeddings to understand structure even when variable names or formatting differ.

Parser mode follows file extensions: `.ts` files are parsed as TypeScript without JSX, while
`.tsx/.jsx/.js` keep JSX enabled. This avoids false JSX parsing on valid TypeScript angle-bracket
assertions and generics. Decorators stay enabled for both TypeScript and JavaScript parser modes so
MobX-style fields and other decorated classes in the same file do not break component scans.

The parser now runs on Rust-backed SWC, stores parsed component metadata and semantic
representations in a persistent analysis cache, and similarity matching can fan exact pair scoring
out across worker threads while still producing deterministic results.

<table>
  <tr valign="top">
    <td><img width="100%" src="https://github.com/user-attachments/assets/8840e100-8b43-49a7-8cc7-6a35228b0732" /></td>
    <td><img width="100%" src="https://github.com/user-attachments/assets/6adfb624-5b50-4245-ac95-2f6e0c4e8e19" />
</td>
  </tr>
</table>

## 🧭 Architecture

```text
+-------------------+
| bin/duplicalis.js |
+-------------------+
          |
          v
+-------------------------+
| src/cli.js              |
| - parse flags           |
| - resolve config path   |
| - save config(optional) |
+-------------------------+
          |
          v
+-------------------------+
| src/index.js            |
| orchestrates the scan   |
+-------------------------+
          |
          v
+-------------------------+      +------------------------+
| src/scanner.js          |----->| React source files     |
| deterministic discovery |      | (.tsx/.ts/.jsx/.js)    |
+-------------------------+      +------------------------+
          |
          v
+-------------------------+      +------------------------+
| src/parser.js           |----->| component metadata      |
| SWC single-pass parse   |      | props/hooks/JSX/etc.    |
+-------------------------+      +------------------------+
          |
          v
+-------------------------------+      +------------------------------+
| src/analysis-cache.js         |----->| persistent analysis cache    |
| parsed metadata + reps        |      | file/style-aware reuse       |
+-------------------------------+      +------------------------------+
          |
          v
+-------------------------+      +------------------------+
| src/styles.js           |----->| scoped style signals    |
| CSS / CSS-in-JS lookup  |      | class-linked CSS only   |
+-------------------------+      +------------------------+
          |
          v
+-------------------------------+
| src/representation.js         |
| semantic component snapshot   |
+-------------------------------+
          |
          v
+-------------------------------+      +------------------------------+
| src/similarity.js             |<---->| src/cache.js                 |
| embedComponents()             |      | persistent embedding cache   |
| - per-run memoization         |      +------------------------------+
| - vector assembly             |
+-------------------------------+
          |
          v
+-----------------------------------------------+
| embedding backend                             |
| src/embedding/local.js  -> ONNX local model   |
| src/embedding/remote.js -> OpenAI/Ollama API  |
| src/embedding/mock.js   -> deterministic test |
+-----------------------------------------------+
          |
          v
+-------------------------------+      +------------------------------+
| src/similarity.js             |----->| labels + suppression rules   |
| findSimilarities()            |      | prop/style/logic/wrapper/etc |
| - cached norms + meta         |      |                              |
| - worker-thread fanout        |      |                              |
+-------------------------------+      +------------------------------+
          |
          v
+-------------------------+
| src/output.js           |
| console + JSON/TXT      |
+-------------------------+

Supporting flows:
- src/model-fetch.js -> auto-download local model artifacts when local mode is enabled.
- src/fs-atomic.js -> atomic writes for cache, config, reports, and downloaded model files.
```

## 🚀 Quick Start

### 1. Run directly

You can run `duplicalis` without installing it:

```bash
npx duplicalis scan
```

### 2. Install as dependency

Or install it in your project:

```bash
npm install -D duplicalis
```

Then run:

```bash
npx duplicalis scan
```

This will:

1.  **Scan** your project for React components.
2.  **Download** a small, local AI model (first run only).
3.  **Analyze** components for similarity.
4.  **Report** findings in the console.

## 🏷️ Duplication Types

`duplicalis` categorizes matches to help you decide how to fix them:

| Label                   | Description                                                                                  |
| :---------------------- | :------------------------------------------------------------------------------------------- |
| `#prop-parameterizable` | Components are identical except for values (e.g., text, colors). Merge them by adding props. |
| `#copy-paste-variant`   | Very high similarity. Likely a copy-paste with minor edits.                                  |
| `#logic-duplicate`      | The internal logic (hooks, handlers) is the same, even if the UI looks different.            |
| `#style-duplicate`      | The styles are nearly identical, even if the component code differs.                         |
| `#wrapper-duplicate`    | Both components are thin wrappers around the same base component.                            |
| `#forked-clone`         | High similarity but with uneven changes. Suggests one should be the "canonical" version.     |

## ⚙️ Configuration

You can configure `duplicalis` via CLI flags or a `duplicalis.config.json` file.
Set `language` in the config file to localize console/report output.
By default, embeddings are cached in `.cache/duplicalis/embeddings.json` and parsed metadata plus
semantic representations are cached in `.cache/duplicalis/analysis.msgpack`.
Config-only tuning keys also include `analysisCachePath`, `similarityWorkers`, and
`similarityWorkerMinEntries` when you need to relocate the analysis cache or override worker fanout.

### Common Options

| Flag                   | Description                                                    | Default                      |
| :--------------------- | :------------------------------------------------------------- | :--------------------------- |
| `--threshold <number>` | Minimum similarity to report a pair (0.0 to 1.0).              | `0.85`                       |
| `--limit <number>`     | Max number of matches to show per component.                   | All                          |
| `--exclude <globs>`    | Patterns to exclude (e.g., `**/*.test.tsx`).                   | `node_modules`, `dist`, etc. |
| `--out <path>`         | Save the report to a JSON file.                                | None                         |
| `--compare <globs>`    | Only report pairs involving these files (e.g., changed files). | None                         |
| `--relative-paths`     | Show relative paths in output.                                 | `false`                      |
| `--lang <code>`        | Output language (`en`, `ru`, `es`, `fr`, `de`, `zh`).          | `en`                         |

### Advanced Options

| Flag                       | Description                                                                     | Default                  |
| :------------------------- | :------------------------------------------------------------------------------ | :----------------------- |
| `--include <globs>`        | Glob patterns for files to include.                                             | `**/*.{ts,tsx,js,jsx}`   |
| `--max-threshold <n>`      | Maximum similarity to report (e.g., `0.99` to skip exact clones).               | `1`                      |
| `--high-threshold <n>`     | Threshold for `almost-identical` label.                                         | `0.9`                    |
| `--min-path-distance <n>`  | Minimum folder distance between pairs (0 = same folder allowed).                | `0`                      |
| `--model <type>`           | Embedding backend: `local`, `remote`, or `mock`.                                | `local`                  |
| `--api-url <url>`          | Full embeddings endpoint for remote mode. Defaults to OpenAI `/v1/embeddings`.  | OpenAI `/v1/embeddings`  |
| `--api-key <key>`          | API key for authenticated remote embeddings. Not needed for local Ollama.       | —                        |
| `--api-model <name>`       | Model name for remote API.                                                      | `text-embedding-3-small` |
| `--api-timeout <ms>`       | Timeout for remote API calls.                                                   | `15000`                  |
| `--ignore-component-name`  | Regex to ignore components by name (e.g. `^Icon`).                              | —                        |
| `--ignore-component-usage` | Regex to ignore components that use specific components.                        | —                        |
| `--style-extensions`       | Style file extensions to analyze.                                               | `.css,.scss,.sass,.less` |
| `--model-path <path>`      | Path to local model files.                                                      | `models/...`             |
| `--model-repo <url>`       | URL to download model from.                                                     | Hugging Face             |
| `--auto-download-model`    | Automatically download model if missing.                                        | `true`                   |
| `--cache-path <path>`      | Custom path for the embedding cache.                                            | `.cache/duplicalis/...`  |
| `--config <path>`          | Path to a specific config file. Relative paths are resolved from the scan root. | `duplicalis.config.json` |
| `--no-progress`            | Disable progress bars (good for CI).                                            | —                        |
| `--no-ignores`             | Disable `// duplicalis-ignore-*` comments.                                      | —                        |
| `--save-config`            | Save current CLI flags to `duplicalis.config.json`.                             | —                        |
| `--disable-analyses`       | Disable specific labels (e.g., `style-duplicate`).                              | —                        |

## 📚 Usage Examples

### 1. Default Scan

Scans the current directory. Good for a general overview.

```bash
npx duplicalis scan
```

### 2. Strict Scan in Specific Folder

Scans only `src/components` for very high similarity matches.

```bash
npx duplicalis scan src/components --threshold 0.95
```

### 3. Compare Changed Files

Only shows duplicates involving files in `src/features`. Useful for checking new code against the existing codebase.

```bash
npx duplicalis scan . --compare "src/features/**/*.{ts,tsx}"
```

### 4. Ignore Tests and Stories

Reduces noise by excluding test files and Storybook stories.

```bash
npx duplicalis scan . --exclude "**/*.test.tsx" "**/*.stories.tsx"
```

### 5. Find Cross-Folder Duplicates

Ignores files in the same directory (distance < 2). Helps find duplicates scattered across the project.

```bash
npx duplicalis scan . --min-path-distance 2
```

### 6. Use Remote AI Model (OpenAI/Ollama)

Use a more powerful remote model for better accuracy.

```bash
# OpenAI
export MODEL=remote
export API_KEY=sk-...
npx duplicalis scan

# Ollama (local, no API key required)
export MODEL=remote
export API_URL=http://localhost:11434/v1/embeddings
export API_MODEL=embeddinggemma
npx duplicalis scan
```

Remote mode sends component representations to the configured embeddings endpoint. Use `local` mode when code must stay on-box.

### 7. Ignore Specific Components

Skip components with generic names (like `Icon...`) to reduce noise.

```bash
npx duplicalis scan . --ignore-component-name "^Icon"
```

### 8. CI/CD Pipeline Run

Run without progress bars and save the report to a JSON file for further processing.

```bash
npx duplicalis scan --no-progress --out report.json
```

### 9. Find Logic Duplicates Only

Disable style analysis to focus purely on shared logic (hooks, effects, handlers).

```bash
npx duplicalis scan --disable-analyses style-duplicate
```

### 10. Loose Scan for Refactoring

Lower the threshold to find components that are structurally similar but might have different content.

```bash
npx duplicalis scan --threshold 0.75 --limit 5
```

## 🛠️ Advanced Features

### Ignoring Files

Add comments to your code to skip analysis:

- `// duplicalis-ignore-file`: Skip the entire file.
- `// duplicalis-ignore-next`: Skip the next component.

### Persisting Config

Save your favorite flags to a config file so you don't have to type them every time:

```bash
npx duplicalis scan --threshold 0.9 --exclude "**/*.test.tsx" --save-config
```

Saved configs intentionally omit the resolved scan root and the default derived cache path so the file stays portable across machines and worktrees.

### Caching

Results are cached in `.cache/duplicalis/embeddings.json` to speed up future runs. Delete this file to force a fresh scan.

Within a single run, identical component representations are memoized before hitting the embedding backend, and cache/report/config writes use atomic file replacement to avoid partial files after interrupted runs.

## 🚢 Release Automation

GitHub Actions auto-publishes the package to npm from `.github/workflows/publish-npm.yml` when a new tag is pushed.

- Add the repository secret `NPM_TOKEN` in GitHub.
- Existing repository tags use the `vX.Y.Z` format (`v1.0.1`, `v1.1.0`), so this is the canonical tag style going forward.
- Push a tag that matches `package.json` version in that format, for example `v1.1.1`.
- The test suite is CI-safe on a clean checkout and does not require a pre-downloaded `models/all-MiniLM-L6-v2` tree.
- The workflow runs `npm ci`, `npm test`, and then `npm publish --provenance --access public`.

---

_Built for cleaner, more maintainable React codebases._
