<!-- docs/research/jev-global-context-2026-09-23/README.md -->

# Jev global context: two-hop eval on DJ's real workspace (2026-09-23)

Question: in global chat (no project in focus), can Jev tell which project(s) a message is about
from compact project cards (hop 1), then find the right records inside them (hop 2), quickly?
Design: [JEV_GLOBAL_CONTEXT_2026-09-23.md](../../architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md).

- **Code under test:** `packages/agentic-chat-runtime/src/context-finder/workspace.ts` (hop 1 +
  orchestration; hop 2 reuses the shipped project finder).
- **Harness:** `apps/worker/scripts/jev-global-context-eval.ts` (dry / live / replay).
- **Labels:** `scenarios.json`, 16 scenarios.
    - 12 are DJ's real global-chat messages: the Logan pistol-site offer, Theo Von outreach and
      its follow-up, the Rod Chamberlain / Cody / Tacemus brain dump, the Phil demo, the Air
      interview days, the job-search to-do dump, "what's going on with my projects", 9takes
      status, a web lookup, a calendar question and a "search for quantum entanglement" negative.
    - 4 are synthetic: the Samos alias, Ian Minor across projects, the book structure decision
      and a "thanks" control.
- **Paid spend (approved by DJ, 3 reps):** $0.1356 by receipts, $0.1313 by the OpenRouter credit
  counter (balance after: $30.09). Jev only (`typesafe/jev-1.13`); no main chat model ran.

## Setup

**Workspace:** DJ's 46 accessible projects, read-only from prod.

- 1,018 records and 1.52M characters of document text.
- Real global chat is about 30% of recent sessions: 74 of the last 30 days' ~257 sessions. DJ
  wrote 273 of the 304 global sessions ever.

**Today's global prompt** has one line per project: name, state, task counts, next step and, for
the newest 8, the top goal. It has no descriptions, no START HERE, no record titles and no bodies.

- It names **0 of the 20 must-have records** in these scenarios.
- In the real sessions, the model spent 1–14 tool calls (outside QA runs) finding what it needed.

**Hop 1 card** (per project): name, state, description (300 chars), next step, then the titles of
documents, open tasks, the 5 most recent done tasks, goals, plans, milestones and risks, 40 per
family.

- All 46 fit in one request at 69 KB, about 19.6K tokens, or $0.0008.
- One `choice` question asks for the scope: `projects`, `portfolio` or `none`. Then there is one
  `noul` question per project.
- The **lean** variant (name, state, description, next step; no titles) was run alongside, at
  29 KB.

**Hop 2:** the shipped project finder (entity call, then a headings call for the top 5 documents).

- It ran on the top 3 projects of every hop-1 ranking, so replay can sweep zoom policies.
- START HERE is **not** skipped: a global prompt doesn't carry it.

## Results

### 1. Routing quality: excellent when Jev answers

These numbers cover 38 of the 48 runs: those where every Jev call returned. Default policy is
`workspace_v1`: zoom projects scoring at least max(0.3, 0.6 × top), at most 3.

| Measure                                                             | Result   |
| ------------------------------------------------------------------- | -------- |
| Scope decided right (projects / portfolio / none)                   | **100%** |
| Must project zoomed                                                 | **96%**  |
| Must records named (full or summary)                                | 89%      |
| Must records loaded in full                                         | 72%      |
| Must project zoomed with **lean** cards (names + descriptions only) | 95%      |

**Wins where keyword search fails.** Voice-transcribed names match on meaning:

- "Phil Valeyo" → Phil Velayo;
- "Erica Obisido" → the saved task "Cadre newsletter: introduce Eric Avvisato", loaded in full
  at 0.69;
- "Rod Chamberlain" → both the Beyond Exit Planning brief and the Tacemus follow-up tasks
  (Tacemus 0.86);
- "Samos" → DJ Wayne Studio (0.94).

**Controls.**

- The web lookup, the calendar question and "thanks" were judged `none`, 9/9, and loaded
  nothing.
- "Thanks" still scored 9takes 0.74 from the conversation, and the scope question is what
  kept it out.
- The quantum negative loaded one weak project (BuildOS 0.35, just over the floor). With a
  0.4 floor, controls were 100% clean and recall didn't change.

**Where the labels were wrong, not Jev.**

- **Ian Minor:** Jev zoomed UXM Training Website first (0.91). That is Ian's business ("Client
  Intake Template: Ian Miner"), and Jev surfaced what DJ owes him there. The labels had missed
  it.
- **Phil demo:** the message is a calendar request. Jev scored nothing in Cadre Content Ops above
  0.24, so the questionnaire the labels expected isn't needed.
- **Samos:** the labeled offer-sheet records landed as summaries. The chamber-luncheon task,
  milestone and pitch doc loaded in full, which answers "what's left" better.

**Lean vs full cards.** On this set, rich project descriptions carry most of the routing. Record
titles are insurance: a person or topic that only appears in a task title (Ian Minor ranked 2+3
with titles vs 2+4 without). Titles cost about 130 ms at p50 and $0.0005 per turn.

### 2. Latency: the binding constraint, and it isn't size

| Jev call                      | ok    | p50    | p75      | p90      | max                 |
| ----------------------------- | ----- | ------ | -------- | -------- | ------------------- |
| Hop 1, full cards (19.6K tok) | 41/48 | 505 ms | 669 ms   | 2,650 ms | 7 × 3 s timeout     |
| Hop 1, lean cards (8.5K tok)  | 40/48 | 372 ms | 533 ms   | 919 ms   | 2,454 ms            |
| Hop 2 entities                | 120   | 458 ms | 1,387 ms | 2,726 ms | 6,614 ms (+3 × 5xx) |
| Hop 2 headings                | 71    | 420 ms | 667 ms   | 2,693 ms | 7,233 ms            |

- **The distribution is bimodal.** About 74% of calls finish under 1 s. About 26% land in a
  2–3 s slow lane, whatever the request size: small calls under 5K tokens took 2.1–5.8 s as
  often as the large ones.
- **Slow calls are independent.**
    - For simultaneous hop-2 calls, the chance both were slow was 0.07, exactly what
      independence predicts (0.26²).
    - For hop 1, full + lean fired together, both were slow 0.04 of the time (0.07 expected).
- **So hedging works.** Fire a duplicate after 800 ms and take the first answer. A hedge fires on
  about 27% of calls, adding about $0.0004 per turn.

**Monte Carlo over the 290 observed call durations** (hedged at 800 ms; "added" is extra
time-to-first-token vs today, given that Jev tool selection already runs in parallel):

| Design                                                  | Finder p50 / p90 | Added TTFT p50 / p90 |
| ------------------------------------------------------- | ---------------- | -------------------- |
| A. Two hops, hop 2 = 2 calls (as built), 1 project      | 1.9 s / 3.9 s    | +1.3 s / +3.3 s      |
| A. same, 2 projects                                     | 2.3 s / 4.6 s    | +1.7 s / +4.1 s      |
| B. Two hops, hop 2 = 1 call, 1 project                  | 1.2 s / 2.9 s    | +0.6 s / +2.2 s      |
| B. same, 2 projects                                     | 1.5 s / 3.4 s    | +0.9 s / +2.7 s      |
| **C. Hop 1 blocks; hop 2 joins at the next model step** | 0.46 s / 1.3 s   | **+0 s / +0.9 s**    |
| D. Follow-up turn: speculative hop 2 on last focus      | 0.7 s / 2.2 s    | +0.2 s / +1.5 s      |

Unhedged, the built pipeline (A, 1 project) is 3.1 s p50 and 7.6 s p90.

- Database time is negligible. The titles-only card query takes 11 ms on the server; the largest
  project's full document load, 0.3 ms.

### 3. Cost

- **Default policy:** $0.00145 per turn (hop 1 $0.0008 plus hop 2 in the zoomed projects).
- **Hedging:** adds about 27% to call count at the same unit price.
- **Main-model input added:** 7.3K chars mean (about 1.8K tokens). It is 0 on `none` turns, and
  the brain dump across two projects was the largest at 16.7K chars.

## Reproduce

Dumps and caches hold private project content and live in the session scratchpad. Recreate the
dump with the projection in the harness header (one row per accessible project), then:

```bash
cd apps/worker
# free: sizes, labels, today's baseline
NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-global-context-eval.ts --dump <file> --out <dir>
# paid (approval required; hard stop via --max-usd)
JEV_GLOBAL_EVAL_LIVE=1 NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-global-context-eval.ts --dump <file> --out <dir> --live --reps 3 --max-usd 0.25
# free: re-sweep policies from cached answers
NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-global-context-eval.ts --dump <file> --out <dir> --replay
```

## Follow-up: the dig gate and hedging (2026-09-23 evening, approved, $0.0398 receipts / $0.0207 credits)

DJ asked for hop 2 to be optional: hop 1 also answers _"is this looking for something specific
that requires a search inside a project?"_ (`dig`). The same 16 scenarios × 3 reps were re-asked
with that question. It was hop 1 only, with real hedging after 800 ms; hop-2 answers were reused
from the first run (`--hop1-only --cache cache-dig --base-cache cache --hedge 800`).

| Scenario (expected)          | dig (3 reps)     |
| ---------------------------- | ---------------- |
| Logan pistol site (dig)      | 0.69, 0.63, 0.65 |
| Theo Von outreach (dig)      | 0.85, 0.85, 0.84 |
| …then write the pitch (dig)  | 0.78, 0.73, 0.76 |
| Air interview days (dig)     | 0.78 ×3          |
| Samos Bid Desk (dig)         | 0.82, 0.81, 0.82 |
| Ian Minor (dig)              | 0.85, 0.84, 0.85 |
| Book structure (dig)         | 0.92 ×3          |
| 9takes status (project only) | 0.49, 0.49, 0.51 |
| Phil demo (project only)     | 0.11 ×3          |
| Calendar question (none)     | 0.14, 0.12, 0.13 |
| Thanks (none)                | 0.12, 0.13, 0.11 |
| Brain dump routing (either)  | 0.47, 0.46, 0.43 |
| To-do dump (either)          | 0.38, 0.39, 0.41 |

- **Default policy** (`dig ≥ 0.5`):
    - scope right 100%, dig right 97%;
    - must project focused 95%, controls clean 100%;
    - hop 2 ran on 46% of turns, down from 69%.
- **What skipping hop 2 costs:** must records loaded in full fell from 53% to 39%, because the
  brain-dump and to-do scenarios now get project briefs. Records named held at 70% vs 72%.
- **Hedged hop 1:** 48/48 answered, p50 662 ms, p75 962 ms, p90 1,151 ms, max 1,312 ms. The
  unhedged run had 7 timeouts at 3 s.
- **Spend:** receipts summed to $0.0398, but the credit counter moved $0.0207. Both are reported;
  the gap isn't explained.
