# Configuration

`duplicalis` can be configured with CLI flags, environment variables, or `duplicalis.config.json`.

The CLI loads `.env` from the directory where you run the command before reading its defaults.
For model and remote API settings, precedence is: CLI flags, config file, existing environment
variables, `.env`, then built-in defaults. Importing the library alone does not load `.env`.

## Common Flags

| Flag                   | Description                                                    | Default                      |
| :--------------------- | :------------------------------------------------------------- | :--------------------------- |
| `--threshold <number>` | Minimum similarity to report a pair (0.0 to 1.0).              | `0.85`                       |
| `--limit <number>`     | Max number of matches to show per component.                   | All                          |
| `--exclude <globs>`    | Patterns to exclude (for example `**/*.test.tsx`).             | `node_modules`, `dist`, etc. |
| `--out <path>`         | Save the report to JSON.                                       | None                         |
| `--compare <globs>`    | Only report pairs involving these files.                       | None                         |
| `--relative-paths`     | Show paths relative to the scan root.                          | `false`                      |
| `--lang <code>`        | Output language: `en`, `ru`, `es`, `fr`, `de`, `zh`.          | `en`                         |

## Full Flag Reference

| Flag                       | Description                                                                     | Default                  |
| :------------------------- | :------------------------------------------------------------------------------ | :----------------------- |
| `--include <globs>`        | Glob patterns for files to include.                                             | `**/*.{ts,tsx,js,jsx}`   |
| `--max-threshold <n>`      | Maximum similarity to report.                                                   | `1`                      |
| `--high-threshold <n>`     | Threshold for `almost-identical`.                                               | `0.9`                    |
| `--min-path-distance <n>`  | Minimum folder distance between reported pairs.                                 | `0`                      |
| `--model <type>`           | Embedding backend: `local`, `remote`, or `mock`.                                | `local`                  |
| `--api-url <url>`          | Full embeddings endpoint for remote mode.                                       | OpenAI `/v1/embeddings`  |
| `--api-key <key>`          | API key for authenticated remote endpoints.                                     | —                        |
| `--api-model <name>`       | Model name for remote API.                                                      | `text-embedding-3-small` |
| `--api-timeout <ms>`       | Timeout for remote API calls.                                                   | `15000`                  |
| `--ignore-component-name`  | Regex to ignore components by name.                                             | —                        |
| `--ignore-component-usage` | Regex to ignore components that render matching components.                     | —                        |
| `--style-extensions`       | Style file extensions to analyze.                                               | `.css,.scss,.sass,.less` |
| `--model-path <path>`      | Path to local model files.                                                      | `models/...`             |
| `--model-repo <url>`       | URL to download the local model from.                                           | Hugging Face             |
| `--auto-download-model`    | Automatically download the local model when missing.                            | `true`                   |
| `--cache-path <path>`      | Custom path for the embedding cache.                                            | `.cache/duplicalis/...`  |
| `--config <path>`          | Path to a specific config file. Relative paths are resolved from the scan root. | `duplicalis.config.json` |
| `--no-progress`            | Disable progress bars.                                                          | —                        |
| `--no-ignores`             | Disable `// duplicalis-ignore-*` comments.                                      | —                        |
| `--save-config`            | Save current CLI flags to `duplicalis.config.json`.                             | —                        |
| `--disable-analyses`       | Disable specific labels such as `style-duplicate`.                              | —                        |

## Remote Models

OpenAI:

```bash
export MODEL=remote
export API_KEY=sk-...
npx duplicalis scan
```

OpenRouter:

```bash
export MODEL=remote
export API_URL=https://openrouter.ai/api/v1/embeddings
export API_KEY=sk-or-...
export API_MODEL=openai/text-embedding-3-small
npx duplicalis scan
```

Ollama:

```bash
export MODEL=remote
export API_URL=http://localhost:11434/v1/embeddings
export API_MODEL=embeddinggemma
npx duplicalis scan
```

Remote mode sends component representations to the configured endpoint. Use `local` mode when code
must stay on-box.

## Ignore Comments

- `// duplicalis-ignore-file` skips the whole file
- `// duplicalis-ignore-next` skips the next component

## Saved Configs

`--save-config` writes the current settings to `duplicalis.config.json` or another target path.

Saved configs intentionally omit:

- the resolved scan root
- the default derived cache path

That keeps the file portable across machines and worktrees.

Saving settings does not copy `remote.apiKey` from the environment, CLI, or another config file.
If the destination file already contains an API key, that value is preserved without being
overwritten by the current run's key. The active run keeps using its resolved credentials.
Prefer `API_KEY` for credentials and keep keys out of version control
([API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)).

## Caching

- Embeddings are cached in `.cache/duplicalis/embeddings.json`
- Parsed metadata and semantic representations are cached in `.cache/duplicalis/analysis.msgpack`

Within one run, identical component representations are memoized before hitting the embedding
backend.

Remote cache entries are scoped to both the normalized endpoint and model. The cache stores a
hash of this identity rather than the endpoint URL, which may contain private query parameters.
Changing only the API key or timeout does not invalidate embeddings. Legacy remote entries without
an endpoint identity are not reused, so the first remote scan after upgrading recomputes embeddings
and may incur API charges. Local and mock caches are unchanged.
