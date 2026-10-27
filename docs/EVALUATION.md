# Evaluation methodology & results

## Method

Every run is scored two independent ways:

1. **Deterministic code checks** (no model): fact-id grounding (cited ids exist
   in the snapshot), decisions present, response length, scenario variables
   acknowledged, contradictions flagged. 5 checks per scenario.
2. **Model rubric eval** (`muse-spark-1.3`, prompt `evaluation/v1`): 1–5 on
   identity consistency, scenario effectiveness, and adaptation, each with
   quoted evidence and notes. Scores are labeled estimates in the UI.

Repeat with: `.venv/bin/python services/api/benchmarks/run.py --db /tmp/bench.db --out /tmp/bench.json`
(requires `MODEL_API_KEY`). The script also runs a **naive baseline**: the same
negotiation scenario with a flat persona paragraph instead of the structured
snapshot, scored by the same deterministic checks and rubric.

## Results (2026-10-27, muse-spark-1.3, seed persona Alex Morgan, n=1)

| Scenario (structured) | Sim latency | Deterministic | Consistency | Effectiveness | Adaptation |
|---|---|---|---|---|---|
| negotiation | 25.6s | 5/5 | 2 | 5 | 5 |
| escalation | 24.1s | 4/5 (2 contradictions flagged) | 2 | 5 | 5 |
| leadership | 37.1s | 4/5 (1 contradiction flagged) | 5 | 5 | 5 |
| **baseline: naive negotiation** | 20.6s | **2/5** (free-text "ids", no variables noted) | 2 | 5 | 5 |

- 3-scenario wall time was **37.1s** (sum of parts ≈ 87s) — parallel execution confirmed.
- Comparison (3 parallel evals + summary) took **40.5s**; repeat views are cached (0 model calls).
- The structured approach wins on **traceability**: grounded fact ids (5/5, 4/5)
  vs the baseline citing unresolvable free text (2/5), and acknowledged scenario
  variables vs none.
- Model-judged consistency is strict in both arms (2/5 on negotiation): the
  rubric caps plausible-but-untraceable claims at 2. The seed snapshot holds
  only 3 facts, so richer identities should score higher (hypothesis, untested).
- Limitations: single run (variance unknown); evaluator and generator share the
  same model family (self-preference possible); no human rating yet.

## Suite coverage (maintained, in `services/api/tests`)

Identity CRUD/versioning/immutability, extraction parse+repair+confidence cap,
scenario validation, parallel-overlap proof, timeout handling, partial rollup,
rerun isolation (parent byte-identical), deterministic-check unit tests,
comparison caching, 409-while-running, failed-scenario skip, scalar coercion,
image endpoints, CORS, fixture labeling, plus live-model tests (key-gated,
reported as skipped without one — never counted green).
