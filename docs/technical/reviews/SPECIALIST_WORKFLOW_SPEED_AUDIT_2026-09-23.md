<!-- docs/technical/reviews/SPECIALIST_WORKFLOW_SPEED_AUDIT_2026-09-23.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-23; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Specialist workflow speed audit — 2026-09-23

Tasker 98 Phase 2. **Interim:** built from free evidence only. DJ deferred the paid confirmation
run. Sources:

- production's two workflow runs, read-only: dispatch, step and `llm_usage_logs` rows;
- OpenRouter's live endpoint list for the workflow models;
- the 2026-09-22 pilot's totals (it kept no per-call timing).

The tracker's minimum of 6 timed runs is **not met**. The instrumented pilot (below) produces
those timings on its next approved run.

## Value test timing (2026-09-23, 1 rep, 5 questions; full results in the tracker)

These results add 14 timed workflow reviews and 5 single answers. Private output:
`output/context-finder-pilot/2026-09-23T19-38-08-817Z/`.

- **Specialists with reasoning low took 17–55 s end to end.**
    - The 55 s outlier is 9t-influencers: its editor landed on Parasail at 40 tok/s and waited
      20.7 s for its first output.
    - Every other call ran at 90–224 tok/s, mostly on Together.
- **Reasoning off saved 1–7 s where it worked** (16–18 s reviews). It also stopped the analyst
  from opening documents.
- **Response headers are the new tail risk.**
    - Four specialist calls (2 reviews, both reasoning off, both about 20K-token 9takes
      prompts) got no headers within the workflow's 10 s limit.
    - Transport errors never retry, so both reviews lost their specialists.
    - A reasoning-low single call also waited 10.1 s for headers on Together. The workflow
      would have killed that call too.
    - Headers normally arrive in 0.4–1.7 s. Outliers were 2.9 s, 3.9 s and 10.1 s, plus the 4
      timeouts.
- **Single answers took 5–23 s.** They are one V4.1 call with the same evidence prompt.

## Results of the paid confirmation (2026-09-23, $0.142 of a $0.30 cap)

Both runs used the same question (`9t-influencers`) on V4.1 Flash with the workflow routing
(Together served every call), production's parallel flow, and captured calls. Run A had the
routing fix only. The rerun added the two free fixes below.

| Run   | Arm      | Time  | Planner              | Specialist retries | Outcome  | Facts | Model $ |
| ----- | -------- | ----- | -------------------- | ------------------ | -------- | ----- | ------- |
| 09-22 | baseline | 127 s | failed               | –                  | partial  | 0/4   | 0.013   |
| 09-22 | auto     | 129 s | failed               | –                  | complete | 4/4   | 0.021   |
| A     | baseline | 19 s  | failed (1,500 chars) | 3                  | partial  | 0/4   | 0.034   |
| A     | auto     | 25 s  | failed (1,186 chars) | 1                  | complete | 3/4   | 0.034   |
| Rerun | baseline | 25 s  | accepted             | 0                  | complete | 0/4   | 0.028   |
| Rerun | auto     | 17 s  | accepted             | 0                  | complete | 3/4   | 0.030   |

**Findings, with numbers.**

1. **Routing was the speed problem.** On the same question, reviews took 17–25 s instead of
   127–129 s. Calls ran at 166–289 tok/s with 0.4–0.9 s to headers. No call switched to the
   V4 Flash fallback.
2. **The planner failed on a parser bound, not on a cap or on routing.** It returned valid JSON
   (finish `stop`), but the analyst assignment was 1,186–2,700 characters and
   `parseWorkflowAssignments` accepted at most 1,000. **Fixed:** the bound is now 4,000
   characters and 12,000 bytes (storage allows 16 KiB). The captured replies parse offline, and
   the rerun's planner was accepted.
3. **Specialist reports were rejected for small overruns.**
    - Four of six first reports had 485–573-character recommendations: the prompt asks for
      400, and the validator and SQL cap is 480.
    - One finding cited 7 records (the cap is 4).
    - The result was a compact retry (+3–5 s) or a partial review.

    **Fixed:** a field over its bound by up to 2× is trimmed at a word with "…", and extra
    list items and references are dropped. Output stays inside the SQL validator's bounds; gross
    overruns are still rejected. Rerun: 0 retries.

4. **The step limits are close to binding on large projects.**
    - The rerun baseline reviewer used 3,631 of its 4,000 tokens (91%). 2,510 of them were
      hidden reasoning, which took 11 s before the first visible token.
    - The planner reached 947 of 1,200 (79%).
    - No call truncated in these 18 calls, but reasoning varies from run to run: the same
      request replayed used 982.
5. **"Reasoning off" is honored.** `reasoning: { enabled: false }` gave 0 reasoning tokens on
   the replayed reviewer (993 vs 2,133 tokens) and planner (760 vs 753, still parsing).
   `effort` is ignored, but `enabled: false` is not. That removes about 40% of critical-path
   tokens and the cap pressure, with an **unmeasured quality effect**.
6. **Facts did not change.** The finder arm scored 3/4 in both new runs, against 4/4 on
   09-22 (n = 1 each). The baseline stayed 0/4, as expected without the finder.

## Headline

1. **The pilot measured the wrong providers.** Its route had no provider preferences, so
   OpenRouter's price-weighted default chose among 25 V4.1 Flash endpoints. The cheapest ran
   7–45 tok/s p50 (several fp4-quantized); the fastest ran 83–156.
    - After any V4.1 failure before the stream opened, turn route health moved the rest of the
      review onto the V4 Flash fallback and pinned it. V4 Flash's cheap endpoints run 9–27 tok/s
      (independent audit).
    - Production never had that route. The pilot's 15–171 s per review are harness artifacts
      until a rerun says otherwise. Example: `school-who curated` took 111 s but cost $0.0065.
    - The planner failures (11/12) are probably **not** routing. The reviewer and editor failed
      0/12 on the same routing. The recorded code means unparsable text or a transport error;
      the leading suspect is the strict `parseWorkflowAssignments`.
2. **Production's workflow routing is accidental.** The workflow pins V4.1 Flash but inherits the
   chat route's provider policy. Chat runs V4 Flash, whose ordered pool is
   `deepinfra, gmicloud, alibaba, streamlake`. Both production reviews landed on DeepInfra at
   ~96 tok/s. OpenRouter's current p50 for DeepInfra on V4.1 is 44 tok/s.
   **Fixed:** the workflow now owns its routing. It shipped in `406cacc3d`; Railway
   `agentic-chat-worker` deployed at 13:26 on 2026-09-23.
3. **Step limits: room at production sizes, near-binding on large projects.** On production
   prompt sizes the largest completion was 1,827 of 4,000 tokens. On the 9takes project a
   reviewer reached 3,631 of 4,000 (91%; 2,510 hidden reasoning) and the planner 947 of 1,200.
   See "Results".
4. **The critical path is roughly 40% hidden reasoning.** Next largest: the reviewer's ~1,000
   visible report tokens, the planner (≈11%) and preparation (≈8%).

## Production runs (measured, 2026-09-20, DJ)

Both ran planner and specialists in parallel (no evidence handoff); DeepInfra served every call.

| Segment              | Run 1 (document organization, reads) | Run 2 (project review)   |
| -------------------- | ------------------------------------ | ------------------------ |
| Admission → planner  | 2.5 s                                | 2.2 s                    |
| Planner call         | 3.2 s · 250 tok (71 reasoning)       | 2.7 s · 225 tok (15)     |
| Gap to specialists   | 0.5 s                                | 0.4 s                    |
| Analyst              | 3.0 s read call → 0.5 s read → 8.7 s | 8.4 s · 930 tok (295)    |
| Reviewer (long pole) | 18.9 s · 1,827 tok (784)             | 15.8 s · 1,816 tok (877) |
| Editor call          | 9.7 s · 889 tok (318)                | 4.7 s · 421 tok (171)    |
| Finalization         | 0.9 s                                | 0.5 s                    |
| **Total**            | **36.5 s**                           | **27.1 s**               |
| Model cost           | $0.0035                              | $0.0028                  |

Critical path = preparation → planner → slower specialist → editor. Across both runs:

- **Tokens.** 2,966 and 2,462 tokens were generated on the critical path. Of these, 1,173 and
  1,063 were hidden reasoning (40% and 43%).
- **Throughput.** Effective speed was 93–115 tok/s, including time to first byte.
- **Caching.** Every prompt reported `cached_prompt_tokens: 0`. Each role sends a different
  system prefix before the shared evidence, so the provider's prefix cache never matches. At
  1.5–4.4K prompt tokens, prefill is a fraction of a second, so this is a cost note, not a
  speed lever.

## Provider landscape (OpenRouter snapshot, 2026-09-23, last 30 minutes)

Snapshot of `deepseek/deepseek-v4.1-flash`. OpenRouter's default routing is weighted by
inverse price squared, so it favors the top rows:

| Endpoint            | $/M in / out | p50 tok/s | p50 first token |
| ------------------- | ------------ | --------- | --------------- |
| OpenInference (fp4) | 0.10 / 0.50  | 7         | 3.8 s           |
| Relace (fp4)        | 0.10 / 0.50  | 45        | 1.3 s           |
| DekaLLM             | 0.10 / 1.00  | 40        | 0.7 s           |
| Sail Research (fp4) | 0.13 / 0.75  | 30        | 0.9 s           |
| DeepInfra (fp8)     | 0.14 / 0.42  | 44        | 1.2 s           |
| DeepSeek            | 0.15 / 0.60  | 83        | 0.9 s           |
| Novita (fp8)        | 0.285 / 1.14 | 109       | 1.7 s           |
| CoreWeave (fp8)     | 0.20 / 0.65  | 120       | 0.5 s           |
| Makora (fp8)        | 0.30 / 1.20  | 122       | 0.6 s           |
| Together            | 0.30 / 1.20  | 156       | 0.4 s           |

These are 30-minute snapshots, not guarantees; DeepInfra served production at ~101 tok/s on
09-20 against a p50 of 44–46 now. The workflow's `max_price` (0.30 / 1.20) admits all of them
except Venice. Whether each endpoint is eligible under `data_collection: 'deny'` is not exposed
by the free API. The durable argument for `sort: throughput` is that it adapts to whichever
endpoint is fast now, where a fixed order freezes a snapshot. Latency sort picks the same top two
today. The pilot now saves the endpoint pool at run start.

## Ranked fixes

| #   | Fix                                                                      | Est. saving                                                                      | Cost                                                 | Quality risk                                                  | Status                                            |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Workflow-owned routing: `sort: throughput`, ignore azure/morph/modal     | 25–30% of model time vs 09-20 DeepInfra; ~2–3× vs DeepInfra's current p50 (est.) | ~2× per call at the fast tier (≈ +$0.005 per review) | None expected: same model; avoids fp4 endpoints               | **Shipped 406cacc3d**                             |
| 2   | Planner failure codes: provider failure ≠ invalid plan                   | Diagnosis only                                                                   | –                                                    | None                                                          | **Shipped 406cacc3d**                             |
| 3   | Cap hidden reasoning per step (`reasoning: {enabled: false}` or bounded) | Up to ~40% of critical-path tokens (≈ 9–12 s at 95 tok/s)                        | Less                                                 | **Unknown**: V4.1 may ignore it; quality needs the value test | **Probed: honored**; quality untested (DJ)        |
| 4   | Skip the planner for published specialists (use the authored assignment) | ≈ 3–4 s (11%)                                                                    | Less                                                 | Loses question-specific assignments                           | **DJ decision** (flow change)                     |
| 5   | Keep analyst and reviewer parallel (evidence handoff off)                | The analyst's full duration (8–12 s) when handoff is on                          | –                                                    | Reviewer loses the frozen read batch                          | **DJ decision**; production already runs parallel |
| 6   | Shorter reviewer reports (fewer findings/risks)                          | ~1–3 s per 100–300 fewer tokens on the long pole                                 | Less                                                 | Fewer findings reach the editor                               | Value test first                                  |
| 7   | Stable prompt prefix (shared evidence before role instructions)          | < 1 s                                                                            | Lower input cost                                     | Prompt-order change                                           | Not worth it now                                  |

## Model section (for DJ's decision; no switch made)

Visible output speed bounds the workflow. A review generates roughly 2.5–3K critical-path tokens.

- At 95 tok/s: ~30 s of model time.
- At 150 tok/s (the fast V4.1 endpoints, fix 1): ~20 s.
- At 300+ tok/s (the fastest hosted models): ~10 s.

A model without hidden reasoning would also drop about 1,100 of those tokens. On V4.1 Flash, fix 1
captures most of the available gain without changing the model or the answers. Revisit after the
instrumented run shows where the remaining seconds go.

## Instrumentation added (Tasker 98 Phase 2)

The pilot harness can now explain a slow or failed review without re-running it.

- **Capture:** `apps/worker/tests/helpers/providerCapture.ts` observes every OpenRouter
  response as a pass-through. A client cancel also cancels the provider stream, so nothing
  keeps billing. Per call it records:
    - timing: headers, first data, first visible token, end;
    - the finish reason and usage, including reasoning tokens;
    - the lead, served and provider model;
    - the visible text, and the first 2 KB of error bodies.

    Covered by `tests/providerCapture.test.ts`. Prompt dumps are disabled under Vitest, so the
    harness captures here instead.

- **Per-run export:** `contextFinderPilot.live.test.ts` writes
  `runs/<scenario>-<arm>-r<rep>.json` before the disposable database disappears. Each file holds
  the steps with failure codes, the dispatch rows, the events and the read batches, joined to the
  captured calls by request bytes. The report gains a per-call timing table that marks calls led
  by the V4 Flash fallback. The endpoint pools are saved at run start.
- **New env:**
    - `CONTEXT_FINDER_PILOT_ARMS`, `_REPS`;
    - `_ROUTING=workflow|openrouter_default`;
    - `_HANDOFF=off|on` (off matches production);
    - `_MAX_CREDITS_USD` (a stop on the account's usage delta).

    The Jev ranker now uses the worker's 8 s timeout.

- **Replay:** `apps/worker/scripts/workflow-reasoning-replay.ts` replays captured requests with
  reasoning low vs off.

## Confirmation run plan (DJ approved, hard ceiling $0.30)

The first plan (6 reviews plus replays, $0.15–0.30) projected to $0.25–0.37 at fast-tier prices,
so it was cut after the independent audit. Each invocation reads the OpenRouter `/credits` delta
before and after. The harness also stops before a review once measured spend or the account
delta passes its limits.

| Run | Scope                                                                               | Guard                                 | Est.       | Answers                                                            |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------ |
| A   | `9t-influencers` × baseline + auto, `ROUTING=workflow`, `HANDOFF=off`               | `BUDGET_USD=0.06`, `MAX_CREDITS=0.15` | $0.05–0.10 | Planner cause (captured text), caps at the largest prompts, timing |
| –   | If the planner failed on text: parser fix checked offline against the captured text | free                                  | $0         | Parser contract                                                    |
| B   | Only if the planner succeeded in A: 1 baseline review, `ROUTING=openrouter_default` | `BUDGET_USD=0.04`                     | $0.02–0.04 | Whether routing caused the old failures                            |
| C   | Replay the captured reviewer and planner, reasoning low vs off                      | `--max-usd 0.03`                      | ≤ $0.03    | Whether V4.1 honors `enabled: false`, and what it saves            |

Reading the results:

- **Caps bind** if any call finishes with `length` or uses at least 90% of its cap. If every call
  stays at or below about 60%, the SQL cap migration is dropped.
- **The routing fix works** if the serving endpoint runs at 120 tok/s or better and every step
  stays on V4.1 (no ⚠ in the report).

```bash
CONTEXT_FINDER_PILOT=1 CONTEXT_FINDER_PILOT_SCENARIOS=9t-influencers \
  CONTEXT_FINDER_PILOT_ARMS=baseline,auto CONTEXT_FINDER_PILOT_ROUTING=workflow \
  CONTEXT_FINDER_PILOT_HANDOFF=off CONTEXT_FINDER_PILOT_BUDGET_USD=0.06 \
  CONTEXT_FINDER_PILOT_MAX_CREDITS_USD=0.15 \
  pnpm --filter @buildos/worker exec vitest run tests/contextFinderPilot.live.test.ts
```
