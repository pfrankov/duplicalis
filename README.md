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
    <a href="#-configuration">Configuration</a> |
    <a href="#-usage-examples">Examples</a>
  </p>
</div>

Duplicalis helps you find duplicate or near-duplicate React components in your codebase. It analyzes
component logic, structure, and styles to identify components that can be refactored or merged.

It uses AI embeddings to understand structure even when variable names or formatting differ.

<table>
  <tr valign="top">
    <td><img width="100%" src="https://github.com/user-attachments/assets/8840e100-8b43-49a7-8cc7-6a35228b0732" /></td>
    <td><img width="100%" src="https://github.com/user-attachments/assets/6adfb624-5b50-4245-ac95-2f6e0c4e8e19" />
</td>
  </tr>
</table>


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

| Label | Description |
| :--- | :--- |
| `#prop-parameterizable` | Components are identical except for values (e.g., text, colors). Merge them by adding props. |
| `#copy-paste-variant` | Very high similarity. Likely a copy-paste with minor edits. |
| `#logic-duplicate` | The internal logic (hooks, handlers) is the same, even if the UI looks different. |
| `#style-duplicate` | The styles are nearly identical, even if the component code differs. |
| `#wrapper-duplicate` | Both components are thin wrappers around the same base component. |
| `#forked-clone` | High similarity but with uneven changes. Suggests one should be the "canonical" version. |

## ⚙️ Configuration

You can configure `duplicalis` via CLI flags or a `duplicalis.config.json` file.
Set `language` in the config file to localize console/report output.

### Common Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--threshold <number>` | Minimum similarity to report a pair (0.0 to 1.0). | `0.85` |
| `--limit <number>` | Max number of matches to show per component. | All |
| `--exclude <globs>` | Patterns to exclude (e.g., `**/*.test.tsx`). | `node_modules`, `dist`, etc. |
| `--out <path>` | Save the report to a JSON file. | None |
| `--compare <globs>` | Only report pairs involving these files (e.g., changed files). | None |
| `--relative-paths` | Show relative paths in output. | `false` |
| `--lang <code>` | Output language (`en`, `ru`, `es`, `fr`, `de`, `zh`). | `en` |

### Advanced Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--include <globs>` | Glob patterns for files to include. | `**/*.{ts,tsx,js,jsx}` |
| `--max-threshold <n>` | Maximum similarity to report (e.g., `0.99` to skip exact clones). | `1` |
| `--high-threshold <n>` | Threshold for `almost-identical` label. | `0.9` |
| `--min-path-distance <n>` | Minimum folder distance between pairs (0 = same folder allowed). | `0` |
| `--model <type>` | Embedding backend: `local`, `remote`, or `mock`. | `local` |
| `--api-url <url>` | URL for remote embeddings (OpenAI/Ollama). | — |
| `--api-key <key>` | API key for remote embeddings. | — |
| `--api-model <name>` | Model name for remote API. | `text-embedding-3-small` |
| `--api-timeout <ms>` | Timeout for remote API calls. | `15000` |
| `--ignore-component-name` | Regex to ignore components by name (e.g. `^Icon`). | — |
| `--ignore-component-usage` | Regex to ignore components that use specific components. | — |
| `--style-extensions` | Style file extensions to analyze. | `.css,.scss,.sass,.less` |
| `--model-path <path>` | Path to local model files. | `models/...` |
| `--model-repo <url>` | URL to download model from. | Hugging Face |
| `--auto-download-model` | Automatically download model if missing. | `true` |
| `--cache-path <path>` | Custom path for the embedding cache. | `.cache/duplicalis/...` |
| `--config <path>` | Path to a specific config file. | `duplicalis.config.json` |
| `--no-progress` | Disable progress bars (good for CI). | — |
| `--no-ignores` | Disable `// duplicalis-ignore-*` comments. | — |
| `--save-config` | Save current CLI flags to `duplicalis.config.json`. | — |
| `--disable-analyses` | Disable specific labels (e.g., `style-duplicate`). | — |

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

# Ollama (Local)
export MODEL=remote
export API_URL=http://localhost:11434/api/embeddings
export API_MODEL=bge-m3
npx duplicalis scan
```

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

### Caching
Results are cached in `.cache/duplicalis/embeddings.json` to speed up future runs. Delete this file to force a fresh scan.

---
*Built for cleaner, more maintainable React codebases.*
