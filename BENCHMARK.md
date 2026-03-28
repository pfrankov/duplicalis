# Embedding Benchmark

`duplicalis benchmark` compares embedding models on a built-in duplicate-detection suite. It does
not print duplicate matches.

## What It Measures

The benchmark uses the same parser, representation builder, vector combiner, and similarity
pipeline as `duplicalis scan`.

The bundled suite currently contains:

- 33 React components
- 22 labeled positive pairs
- 16 explicit hard negatives

The suite includes buttons, summary cards, filter panels, destructive dialogs, sync panels, drawer
summaries, timelines, and style-heavy strips. This helps avoid overfitting to one JSX pattern.

Some pairs were moved out of the hard-negative set after review. Examples include strip variants,
timeline variants, sync panel vs upload queue variants, and drawer summary vs activity drawer
variants. These pairs are close to the real goal of `duplicalis`. In a real scan, they could be
valid `prop-parameterizable`, `forked-clone`, or `logic-duplicate` findings. Marking them as hard
negatives made the benchmark less realistic.

Thin wrapper variants are not included in the positive ground truth. The current report pipeline
suppresses them before labeling. If we kept them as positives, the benchmark would mostly measure a
known suppression rule, not model quality.

## Default Shortlist

The default benchmark compares:

- `local` -> bundled `all-MiniLM-L6-v2`
- `openai/text-embedding-3-small`
- `openai/text-embedding-3-large`
- `google/gemini-embedding-001`
- `qwen/qwen3-embedding-8b`
- `baai/bge-m3`
- `intfloat/multilingual-e5-large`
- `sentence-transformers/all-mpnet-base-v2`

## Running It

OpenRouter example:

```bash
export API_URL=https://openrouter.ai/api/v1/embeddings
export API_KEY=sk-or-...
npx duplicalis benchmark --no-progress
```

Useful flags:

- `--models <list...>` to benchmark only specific ids or aliases like `local`, `gemini`, `bge`
- `--manifest <path>` to benchmark another suite
- `--out <path>` to save JSON

By default, benchmark caches are stored under `.cache/duplicalis/benchmarks/<suite>/`.

## Metrics

Detailed metrics:

- `AP`: average precision over all component pairs. `duplicalis` uses the standard
  [average precision](https://scikit-learn.org/dev/modules/generated/sklearn.metrics.average_precision_score.html)
  definition where precision is weighted by recall increments.
- `MRR`: mean reciprocal rank of the first true duplicate
- `R@1` / `R@3`: whether a true duplicate appears in the top 1 / top 3 nearest neighbors
- `Best F1`: best end-to-end report F1 after sweeping similarity thresholds through the actual
  `findSimilarities()` pipeline. The
  [F1](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html) part uses
  the standard harmonic-mean definition of precision and recall.
- `Best τ`: threshold that produced that best F1
- `Gap`: `min positive score - max hard negative score`
- `Hard FP`: hard-negative false positives that still appear in the report at the best threshold

Metric split:

- `AP`, `MRR`, `R@1`, `R@3`, and `Gap` evaluate the raw embedding space
- `Best F1`, `Best τ`, and `Hard FP` evaluate the real report pipeline after suppression rules
- `Gap` is diagnostic only. A negative gap means at least one hard negative outranks at least one
  positive in the raw space. It does **not** guarantee a reported false positive. The best
  threshold can still stay above that overlap and trade recall for precision. In the current
  snapshot, `OpenAI 3 small` has `Gap = -0.0342` but `Hard FP = 0/16` because its best threshold
  drops one positive pair instead.

For raw pair scoring, the benchmark uses dot products between normalized vectors. That is valid for
OpenAI embeddings because the
[Embeddings FAQ](https://help.openai.com/en/articles/6824809-embeddings-faq) states that their
embeddings are normalized to length 1. The local and mock backends also normalize vectors before
scoring.

## Score

For the simplified README table, `duplicalis` computes one benchmark fit score. **Higher is
better**:

```text
Score = 100 * (
  0.45 * BestF1 +
  0.30 * AP +
  0.25 * (1 - HardFP / HardNegativeTotal)
)
```

Why this formula:

- `Best F1` gets the largest single weight because report quality is the main decision criterion
- `AP` at 30% meaningfully rewards models with good ranking across all pairs, not just at one
  threshold. This matters on small suites, where F1 can change sharply between nearby thresholds.
- hard-negative safety at 25% keeps false positives visible in the final score
- the 45/55 balance between F1 and the continuous metrics (`AP + HNP`) reduces the sharp behavior
  that dominated the older 70/15/15 split on a small test set

`MRR` and `R@K` stay in the detailed table, but they are not part of the simplified score. On this
suite they saturate quickly, so they add less value to the summary.

## Snapshot

Snapshot date: **March 28, 2026**  
Validated against the current suite and the current 45/30/25 score formula on **March 28, 2026**.
The table below matches both the live CLI output and an independent recomputation of AP, MRR, R@K,
the threshold sweep, and the final score from cached embeddings.

Remote results were collected through OpenRouter at `https://openrouter.ai/api/v1/embeddings`.
OpenRouter routing and hosted model revisions can change over time, so treat this as a dated
snapshot, not a permanent leaderboard.

| Model                  | Score | AP     | MRR    | R@1    | R@3    | Best F1 | Best τ | Gap     | Hard FP |
| :--------------------- | ----: | :----- | :----- | :----- | :----- | :------ | :----- | :------ | :------ |
| all-mpnet-base-v2      |  98.9 | 0.9980 | 1.0000 | 1.0000 | 1.0000 | 0.9778  | 0.7733 | 0.0300  | 0/16    |
| Gemini Embedding 001   |  98.8 | 0.9938 | 1.0000 | 1.0000 | 1.0000 | 0.9778  | 0.8366 | 0.0136  | 0/16    |
| Multilingual-E5-Large  |  98.7 | 0.9915 | 1.0000 | 1.0000 | 1.0000 | 0.9778  | 0.9473 | 0.0047  | 0/16    |
| OpenAI 3 small         |  98.6 | 0.9868 | 1.0000 | 1.0000 | 1.0000 | 0.9767  | 0.8100 | -0.0342 | 0/16    |
| BGE-M3                 |  96.3 | 0.9813 | 1.0000 | 1.0000 | 1.0000 | 0.9302  | 0.8462 | -0.0136 | 0/16    |
| OpenAI 3 large         |  94.9 | 0.9826 | 1.0000 | 1.0000 | 1.0000 | 0.9333  | 0.7133 | -0.0361 | 1/16    |
| Local all-MiniLM-L6-v2 |  93.6 | 0.9865 | 1.0000 | 1.0000 | 1.0000 | 0.9362  | 0.7099 | -0.0302 | 2/16    |
| Qwen3 Embedding 8B     |  92.0 | 0.9293 | 1.0000 | 1.0000 | 1.0000 | 0.8696  | 0.7984 | -0.0373 | 0/16    |

## Why A Larger Model Can Score Lower Here

A common expectation is that a larger embedding model should always win. This benchmark is a useful
counterexample. Model fit depends on the task, so a model that is stronger on general retrieval
benchmarks can still score lower on React near-duplicate detection.

OpenAI's own
[embedding update](https://openai.com/index/new-embedding-models-and-api-updates/) calls
`text-embedding-3-large` its "new best performing model", says it creates embeddings with up to
3072 dimensions, and reports MIRACL/MTEB averages of `54.9 / 64.6` for `large` versus
`44.0 / 62.3` for `small`. The
[MTEB paper](https://aclanthology.org/2023.eacl-main.148/) explicitly concludes that no single
embedding method dominates across all tasks. `duplicalis` measures a different target: React
near-duplicate detection after a thresholded reporting pipeline. It is not a generic retrieval
benchmark and not a universal embedding leaderboard.

**What the current suite actually shows.** Comparing OpenAI `text-embedding-3-small` to
`text-embedding-3-large` on the March 28, 2026 snapshot:

- `large` scores lower on 20 of 22 positive pairs and 15 of 16 hard negatives
- both models miss the same positive pair at the best threshold:
  `ArchiveProjectDialog` / `DeleteWorkspaceDialog`
- `large` additionally reports one hard negative at the best threshold:
  `PricingSummaryCard` / `InvoiceDrawerSummary`
- that changes best-threshold precision/F1 from `1.0000 / 0.9767` (`small`) to
  `0.9130 / 0.9333` (`large`)

The local baseline shows the opposite trade-off. `all-MiniLM-L6-v2` keeps full recall, but it
admits two dialog-vs-transfer hard negatives at the best threshold.

**Safest interpretation.** This is evidence of task-specific fit, not a general model-quality
judgment. A plausible explanation is that larger or more retrieval-oriented embeddings preserve
differences that help broad search benchmarks, while this suite rewards models that group
UI-level near-clones more aggressively. That explanation is an inference from this benchmark plus
the external literature cited here. It is not a universal rule about embedding dimensionality.
