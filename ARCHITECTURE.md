# Architecture

This file is the fuller architecture reference for people working on `duplicalis`.

## System Structure

```text
                         +------------------+
                         | CLI + Config     |
                         | bin/, src/cli.js |
                         +---------+--------+
                                   |
                                   v
 +------------------+    +---------+---------+    +----------------------+
 | Source Discovery |--->| Analysis Core     |<-->| Analysis Cache       |
 | src/scanner.js   |    | parse + styles +  |    | src/analysis-cache.js|
 +------------------+    | representations   |    +----------------------+
                         | src/parser.js     |
                         | src/styles.js     |
                         | src/representation|
                         +---------+---------+
                                   |
                                   v
                         +---------+---------+    +----------------------+
                         | Embedding Layer   |<-->| Embedding Cache      |
                         | src/similarity.js |    | src/cache.js         |
                         +---------+---------+    +----------------------+
                                   |
                                   v
                         +---------+---------+
                         | Embedding Backend |
                         | local / remote /  |
                         | mock              |
                         | src/embedding/*   |
                         +---------+---------+
                                   |
                                   v
                         +---------+---------+
                         | Matching + Labels |
                         | thresholds,       |
                         | suppression,      |
                         | duplicate labels  |
                         | src/similarity.js |
                         | src/labels.js     |
                         +---------+---------+
                                   |
                                   v
                         +---------+---------+
                         | Report Output     |
                         | console + JSON    |
                         | src/output.js     |
                         +-------------------+
```

## Main Responsibilities

### CLI + Config

- Parses user flags
- Loads environment variables and config files
- Chooses scan mode or benchmark mode

### Analysis Core

- Finds source files deterministically
- Parses React components with SWC
- Extracts props, hooks, JSX structure, literals, component refs, and styles
- Builds semantic text representations used for embeddings

### Analysis Cache

- Stores parsed component metadata and semantic representations
- Invalidates entries when source files or dependent style files change

### Embedding Layer

- Requests vectors for each component representation
- Reuses cached embeddings
- Combines code, structure, style, and holistic vectors into the final comparison vector

### Embedding Backend

- `local`: bundled ONNX model (`all-MiniLM-L6-v2`)
- `remote`: OpenAI-compatible embeddings endpoint
- `mock`: deterministic vectors for tests

### Matching + Labels

- Computes pair similarity
- Applies thresholds
- Applies suppression rules to avoid noisy or misleading matches
- Assigns duplicate labels such as `logic-duplicate` or `style-duplicate`

### Report Output

- Prints console output
- Writes JSON/TXT reports

## Benchmark

Benchmarking reuses the same analysis core, embedding layer, and matching pipeline.

- Suite definition: `benchmarks/react-component-duplicates-v1/`
- Runner: `src/benchmark.js`
- Metrics: `src/benchmark-metrics.js`
- Console table: `src/benchmark-output.js`

See [BENCHMARK.md](./BENCHMARK.md) for benchmark methodology and current snapshot results.

## Supporting Modules

- `src/model-fetch.js`: downloads the local model when needed
- `src/fs-atomic.js`: atomic writes for cache, config, reports, and model files
