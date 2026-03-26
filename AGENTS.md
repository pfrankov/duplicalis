# Repository Guidelines

## Maintenance & Documentation

- Keep AGENTS.md and README.md in lockstep with any meaningful behavior or UX change; prune stale details to keep both compact.
- Keep the architecture diagram in README.md aligned with the actual code at all times. Direction is always code -> diagram: update the diagram after any factual architecture change, never the other way around.
- Prioritize clear UX and documentation for a global audience (not just native English readers); keep CLI/report text transparent.
- When you need external library/tool details, fetch official docs via the Context7 tool instead of ad-hoc searches.

## Tool Purpose & Problem Domain

**duplicalis** is a CLI tool for detecting duplicate and near-duplicate React components in large codebases. It addresses a common problem in component libraries: Developer A creates ComponentA, then Developer B creates ComponentB that is 80–95% similar in behavior, structure, and styling but not textually identical.

### Primary Goals

- Identify duplicate or near-duplicate React components using semantic analysis (embeddings + AST).
- Surface components that are almost identical and could be unified via props/configuration.
- Detect copy-paste patterns where reuse of the original would be preferable.

### Duplication Patterns Detected

The tool labels similarity matches with specific duplication classes:

| Label                  | Description                                                                      |
| :--------------------- | :------------------------------------------------------------------------------- |
| `prop-parameterizable` | Components differ mainly by prop values/sets; could be unified via props.        |
| `copy-paste-variant`   | Very high semantic + textual similarity; looks like copy with small edits.       |
| `logic-duplicate`      | Internal logic (hooks, handlers) is similar even if JSX/styles differ.           |
| `style-duplicate`      | Styles are nearly identical even if component code differs.                      |
| `forked-clone`         | High similarity but larger uneven differences; suggest canonical implementation. |
| `wrapper-duplicate`    | Many thin wrappers around the same base component.                               |

### Key Design Decisions

- **Imports treated as low-signal**: Import statements are normalized/summarized; they don't dominate similarity scores.
- **Component as primary unit**: One component = one chunk. Multi-component files are handled separately.
- **Semantic representation over raw text**: AST-based extraction preserves structure while ignoring irrelevant whitespace/comments.
- **Parser mode is extension-aware**: Rust-backed SWC parsing keeps `.ts` files out of JSX mode to avoid angle-bracket TypeScript syntax being misread as JSX; `.tsx/.jsx/.js` keep JSX enabled.
- **Parser walk is single-pass**: Style imports and component metadata are collected in one SWC AST walk, and component source slices come from normalized node spans instead of repeated line splitting.
- **Parsed analysis is cached persistently**: Parsed component metadata plus semantic representations are stored in a file-aware cache and invalidated when source files or dependent stylesheets change.
- **Path-agnostic embeddings**: File-system paths are excluded from the embedded representation so similarity scores reflect code/style only, not folder layout.
- **Pluggable embedding backend**: Local model by default; remote API opt-in via env vars.
- **Remote trust boundary is explicit**: Remote mode sends component representations to the configured embeddings endpoint; local mode keeps analysis on-box.
- **O(n²) similarity acceptable**: For up to a few thousand components; basic mitigations (top-N neighbors, early pruning) applied.
- **Similarity inner loop is cached**: Pair scoring reuses precomputed vector norms and per-component metadata so repeated comparisons do less work.
- **Exact similarity can parallelize**: Larger scans can shard the exact O(n²) pair evaluation across worker threads while keeping merge order and final reports deterministic.
- **Style signals are scoped**: CSS is included only when we can map it to detected class names (including `styles.foo`/`styles['foo']`), keeping full matching rule blocks (selectors + declarations) plus CSS-in-JS snippets. Plain imports without class usage are ignored, style weights are zeroed when no style signal exists, and `style-duplicate` labels are skipped when similarity is explained solely by a shared stylesheet with no inline/unique styles.
- **Cache cleanup is file-aware**: Cache entries keep the originating file path; cleanup removes only entries whose source files are gone and tolerates malformed cache keys.
- **Style reads are memoized per run**: Stylesheets are read once per absolute path to keep scans fast when many components share the same CSS.
- **Embedding work is memoized per run**: Identical component representations reuse the same in-memory embedding request within a single scan, reducing duplicate backend work before cache persistence.
- **File discovery is deterministic**: Scans normalize, deduplicate, and sort discovered files so reports and cache behavior stay stable across runs.
- **Stats favor signal over noise**: Console table highlights match coverage, reported/suppressed pairs (with top reasons), timings, and cache activity; low-value noise metrics stay out.
- **Console banners**: Runs print a centered pixel banner plus a wordmark banner before the report; they are console-only and never written to output files.
- **Compare mode**: `--compare <globs...>` marks “target” files; only target-vs-non-target pairs are reported (no target-vs-target or baseline-vs-baseline).
- **Writes are atomic**: Cache/config/report files and downloaded model artifacts are written via temp-file swap, reducing partial-file corruption on interrupted runs.

## Project Structure & Module Organization

- `bin/duplicalis.js` wires the executable and hands off to `src/cli.js`; `src/index.js` orchestrates scans, embeddings, similarity, and reporting.
- Core modules live in `src/` (e.g., `scanner.js` for file discovery, `parser.js` for component extraction, `embedding/` for local/remote backends, `similarity.js` for scoring, `output.js` for report emission). Keep new utilities in this folder and favor single-purpose files.
- Keep code files under 500 lines of cohesive code. Split by responsibility before files become long, mixed, or hard to scan.
- Tests sit in `test/*.test.js` and mirror module names. Use `examples/` as fixtures for realistic component pairs. `coverage/` is generated output; `models/` stores the default ONNX embedding model.
- Keep test files and test groupings under 500 lines of cohesive code as well; split oversized suites by behavior or module seam.
- Runtime artifacts land in `.cache/duplicalis/embeddings.json` and `.cache/duplicalis/analysis.msgpack`; keep them untracked. Configuration is read from `duplicalis.config.json` when present.

## Build, Test, and Development Commands

- `npm install` to bootstrap.
- `npm start` shows CLI help; typical local run: `node ./bin/duplicalis.js scan examples --threshold 0.9`.
- `npm run lint` (ESLint rules + complexity guard), `npm run format` / `npm run format:check` (Prettier over `src/**/*.js`).
- `npm test` or `npm run coverage` runs Vitest with V8 coverage thresholds enforced.
- Tests must stay self-contained in CI; do not rely on a pre-downloaded `models/all-MiniLM-L6-v2` tree when a temporary fixture or mock is enough.
- Use `--save-config [path]` to persist the current run options into `duplicalis.config.json` (or another path) so future runs inherit them.
- npm publishing is automated by `.github/workflows/publish-npm.yml` on tag pushes; it expects a GitHub Actions secret named `NPM_TOKEN`. Repository history uses `v`-prefixed tags (`v1.0.1`, `v1.1.0`), so `vX.Y.Z` is the canonical release format even though the workflow still accepts both styles.

## Coding Style & Naming Conventions

- ES modules only (`type: module`); keep imports relative and explicit. Prefer kebab-case filenames in `src/` and lowerCamelCase symbols.
- Prettier settings: 2-space indent, single quotes, trailing commas (es5), `printWidth: 100`. `.prettierignore` skips heavy assets (`models/`, `coverage/`, JSON).
- ESLint: `eslint:recommended` plus `complexity` <= 10, `max-lines` <= 500 for code/test files (ignoring blank lines and comments), and unused-arg ignore pattern `^_`. Console use is allowed.
- Husky + lint-staged auto-format `src/**/*.js` on commit; run format manually if touching other paths.
- Add brief JSDoc on exported functions when behavior is non-obvious.

## Testing Guidelines

- Framework: Vitest (`test/*.test.js`). Coverage gates are 100% for lines/branches/functions/statements; add or adjust tests before merging.
- Keep test names descriptive (`<module>.test.js` with `describe`/`it` mirroring public API). Use `examples/` components as fixtures instead of synthetic strings when possible.
- Prefer unit-level assertions; mock network/model downloads where needed. Include regression cases when fixing bugs.

## Commit & Pull Request Guidelines

- Use short, imperative commit messages (e.g., `fix: tighten embedding cache handling`). Squash optional; keep history readable.
- PRs should summarize intent, list key changes, and call out config/env impacts (`MODEL`, `API_KEY`, paths). Attach relevant CLI or test output when behavior changes.
- Ensure lint, format:check, and test commands pass before requesting review; avoid committing generated artifacts (`coverage/`, `.cache/`, downloaded `models/`).

## Configuration & Model Handling

- `dotenv` loads `.env`; notable vars: `MODEL` (`local|remote|mock`), `MODEL_PATH`, `MODEL_REPO`, `API_KEY`, `API_URL`, `API_MODEL`, `API_TIMEOUT`. Prefer `duplicalis.config.json` for repo-shared defaults, env vars for secrets.
- Output language is set via `--lang` or `language` in `duplicalis.config.json` (`en`, `ru`, `es`, `fr`, `de`, `zh`).
- Models are auto-downloaded when missing (`AUTO_DOWNLOAD_MODEL` true by default) and the download is memoized per process. When disabling auto-download, make sure a usable ONNX file lives under `<model>/onnx/`.
- `--save-config` merges resolved run settings into the target config file (defaults to `<root>/duplicalis.config.json`) but intentionally does not persist the resolved `root` or default derived `cachePath`, keeping saved configs portable across machines and worktrees.

### Embedding Backend Selection

| Mode              | Description                                                                                                         | When to use                                      |
| :---------------- | :------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------- |
| `local` (default) | Uses local ONNX model (`all-MiniLM-L6-v2`). No network calls.                                                       | Offline/privacy-sensitive environments.          |
| `remote`          | OpenAI-compatible API. Defaults to OpenAI `/v1/embeddings`; local Ollama-style endpoints can run without `API_KEY`. | Better accuracy or when local model is too slow. |
| `mock`            | Returns deterministic vectors.                                                                                      | Testing only.                                    |

### Remote API Configuration

```bash
export MODEL=remote
export API_KEY=sk-...                    # Required for OpenAI
export API_URL=https://api.openai.com/v1/embeddings  # Optional, defaults to OpenAI embeddings endpoint
export API_MODEL=text-embedding-3-small  # Optional
export API_TIMEOUT=30000                 # Optional, milliseconds
```

## Autonomous Review & Refactor Workflow

- Prefer first-party installed review workflows (`security-best-practices`, `security-threat-model`, `security-ownership-map`) when changes touch remote I/O, model fetching, or other trust boundaries.
- Preserve CLI flags, config schema, output shape, and duplication labels unless the user explicitly asks for an API change.
- Fix declared guardrails first: failing lint, excessive complexity, misleading docs, or behavior that contradicts README.md/AGENTS.md.
- Treat `MODEL=remote`, `API_URL`, `API_KEY`, `MODEL_REPO`, and model auto-download as trust boundaries; document any code-egress or supply-chain impact before changing them.
- Prefer OpenAI-compatible `/v1/embeddings` endpoints for remote providers; local Ollama endpoints may be unauthenticated.

---

## Ignore Mechanisms

### CLI-Level Ignores

- `--exclude <globs>`: Skip paths matching patterns (e.g., `**/*.test.tsx`).
- Specific duplication classes can be disabled in `duplicalis.config.json`.

### File-Level Ignores (Comment Syntax)

- `// duplicalis-ignore-file` — Place at top of file to skip entire file.
- `// duplicalis-ignore-next` — Place before a component definition to skip that component.

---

## Component Representation Strategy

Each component is converted to a semantic text representation before embedding:

```
// COMPONENT: Button
// PROPS: variant: primary|secondary; disabled?: boolean
// HOOKS: useState, useEffect(dataFetch)
// LOGIC: handles submit, validates form, shows error
// JSX TREE: Button -> Icon + Label
// STYLES: classNames [button, button-primary]; key rules [background, color, padding]
```

Key principles:

- **Strip comments and irrelevant whitespace**; normalize formatting.
- **Summarize imports**: Only structural info (which external components are used), not raw import lines.
- **Associate styles** via imports of `.css/.scss/.module.css` or CSS-in-JS in the same file.
- **If representation is too large**: Summarize/compress structure instead of blind truncation.

---

## Code Quality Principles

- Remove unnecessary abstractions, checks, branching, and code paths when they do not protect a real requirement.
- Functions should usually be extracted only when logic is used more than once or when a dense concept becomes materially easier to read as a named unit.
- Avoid over-abstraction and "layers for the sake of layers"; prefer direct, readable code paths.
- Variable and function names should be short, clear, logical, and appropriate to their scope.
- Cyclomatic complexity ≤ 10 per function (enforced via ESLint `complexity` rule).
- 100% test coverage (lines, branches, functions, statements) enforced via Vitest + V8.
