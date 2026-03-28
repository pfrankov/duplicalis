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

It uses AI embeddings plus AST-based analysis, so it can catch near-duplicates even when variable
names or formatting differ.

<table>
  <tr valign="top">
    <td><img width="100%" src="https://github.com/user-attachments/assets/8840e100-8b43-49a7-8cc7-6a35228b0732" /></td>
    <td><img width="100%" src="https://github.com/user-attachments/assets/6adfb624-5b50-4245-ac95-2f6e0c4e8e19" />
</td>
  </tr>
</table>

## 🧭 Architecture

```text
                     +----------------------+
                     | CLI / Config         |
                     +----------+-----------+
                                |
                                v
 +------------------+   +-------+--------+   +----------------------+
 | React Source     |<->| Analysis Core  |<->| Analysis Cache       |
 | files            |   | parse + style  |   +----------------------+
 +------------------+   | + representations|
                        +-------+--------+
                                |
                                v
                        +-------+--------+   +----------------------+
                        | Embedding Layer |<->| Embedding Cache      |
                        +-------+--------+   +----------------------+
                                |
                                v
                        +-------+--------+
                        | Embedding      |
                        | Backend        |
                        | local / remote |
                        | / mock         |
                        +-------+--------+
                                |
                                v
                        +-------+--------+
                        | Matching +     |
                        | Labels         |
                        +-------+--------+
                                |
                                v
                        +----------------+
                        | Console / JSON |
                        | reports        |
                        +----------------+
```

Developer-focused architecture notes live in [ARCHITECTURE.md](./ARCHITECTURE.md).

## 🚀 Quick Start

Run directly:

```bash
npx duplicalis scan
```

Or install it:

```bash
npm install -D duplicalis
npx duplicalis scan
```

First run downloads the local model automatically.

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

## ⚙️ Common Options

| Flag                   | Description                                                    | Default                      |
| :--------------------- | :------------------------------------------------------------- | :--------------------------- |
| `--threshold <number>` | Minimum similarity to report a pair (0.0 to 1.0).              | `0.85`                       |
| `--limit <number>`     | Max number of matches to show per component.                   | All                          |
| `--exclude <globs>`    | Patterns to exclude (e.g., `**/*.test.tsx`).                   | `node_modules`, `dist`, etc. |
| `--out <path>`         | Save the report to a JSON file.                                | None                         |
| `--compare <globs>`    | Only report pairs involving these files (e.g., changed files). | None                         |
| `--relative-paths`     | Show relative paths in output.                                 | `false`                      |
| `--lang <code>`        | Output language (`en`, `ru`, `es`, `fr`, `de`, `zh`).          | `en`                         |

## 📊 Model Snapshot

This is the current bundled-suite snapshot with the live 45/30/25 benchmark score. The table below
is intentionally simplified. `Score` is a benchmark fit score where **higher is better**. For the
full methodology, metrics, tradeoffs, and detailed results, see [BENCHMARK.md](./BENCHMARK.md).

Snapshot date: **March 28, 2026**

| Model                  | Score |
| :--------------------- | ----: |
| all-mpnet-base-v2      |  98.9 |
| Gemini Embedding 001   |  98.8 |
| Multilingual-E5-Large  |  98.7 |
| OpenAI 3 small         |  98.6 |
| BGE-M3                 |  96.3 |
| OpenAI 3 large         |  94.9 |
| Local all-MiniLM-L6-v2 |  93.6 |
| Qwen3 Embedding 8B     |  92.0 |

## 📚 More Docs

- Full configuration and flag reference: [CONFIGURATION.md](./CONFIGURATION.md)
- Release flow: [RELEASE.md](./RELEASE.md)

## 📚 Usage Examples

### 1. Default Scan

```bash
npx duplicalis scan
```

### 2. Compare Changed Files

```bash
npx duplicalis scan . --compare "src/features/**/*.{ts,tsx}"
```

### 3. Use a Remote Model

```bash
export MODEL=remote
export API_URL=https://openrouter.ai/api/v1/embeddings
export API_KEY=sk-or-...
export API_MODEL=openai/text-embedding-3-small
npx duplicalis scan
```

### 4. Save a JSON Report

```bash
npx duplicalis scan --no-progress --out report.json
```

### 5. Save Your Defaults

```bash
npx duplicalis scan --threshold 0.9 --exclude "**/*.test.tsx" --save-config
```

---

_Built for cleaner, more maintainable React codebases._
