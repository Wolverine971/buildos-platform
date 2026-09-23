<!-- docs/research/jev-context-ranker-2026-09-22/README.md -->

# Jev context ranker: offline eval on DJ's real projects (2026-09-22)

This eval asks whether Jev can find the right project context for a chat message, what that
costs, how fast it is, and how much context it adds for the next agent. Spec:
[JEV_CONTEXT_RANKER_2026-09-22.md](../../architecture/JEV_CONTEXT_RANKER_2026-09-22.md).

- **Harness:** `apps/worker/scripts/jev-context-eval.ts`
- **Hand labels:** `scenarios.json`
- **Paid Jev spend:** $0.0559 (72 calls: 8 scenarios × 3 variants × 3 reps, `typesafe/jev-1.13`),
  approved by DJ. No main chat model was run.

## Setup

**Projects:** read-only prod dumps.

- **9takes:** 93 entities (30 docs with 426K chars of text, 55 tasks). This is larger than
  today's loader caps.
- **Christian School Launch:** 28 entities (6 docs with 98K chars, 19 tasks). Every entity fits
  in today's caps, but only as names.

**Scenarios:** DJ's six questions, plus a "thanks, that's really helpful" control in each project.
Each scenario is hand-labeled with:

- _must_ items: without them the answer is wrong or incomplete;
- _helpful_ items;
- _must_ sections: the headings whose text holds the answer.

**Variants:**

- `entities`: one Jev call with one yes/no question per entity.
- `sections`: one call covering every entity plus every document heading.
- `twostage`: the entity call, then a second call for the headings of the top 5 documents.

## Results

### 1. Jev ranks well, but its scores are not calibrated, so fixed thresholds fail

| Question                        | Where the must-haves rank                      | Their scores     |
| ------------------------------- | ---------------------------------------------- | ---------------- |
| Who's running this project?     | #1, #2                                         | 0.52, 0.32       |
| How much is this going to cost? | #1, #2, #6                                     | 0.83, 0.62, 0.36 |
| Influencers to reach out to?    | #1, #4, #7                                     | 0.95, 0.55, 0.46 |
| Plan for the school?            | 6 must-haves among ~26 items scoring 0.76–0.90 | plateau          |
| Status of marketing plans?      | ~37 items above 0.6                            | plateau          |

- **Narrow questions** score low in absolute terms: a 0.6 bar loads _nothing_ for "who's
  running this".
- **Broad questions** score nearly everything high: a 0.6 bar loads 26 of 28 school entities.
- **Controls** load zero items at every threshold. A floor near 0.25 is safe for chit-chat.
- **Stability:** scores are stable across reps. Median drift is 0.01 and p95 drift 0.05; 11 of
  484 entity scores crossed 0.5 between reps.

**Conclusion:** use a rank-relative rule with an absolute floor, not a percentage.

### 2. Loading policies compared (two-stage answers, mean over 3 reps, non-control scenarios)

| Policy                | Must-haves with content injected | Must-haves at least named | Must-have sections injected | Added chars | ≈ tokens  |
| --------------------- | -------------------------------- | ------------------------- | --------------------------- | ----------- | --------- |
| fixed ≥ 0.6 (spec v0) | 0.39                             | 0.65                      | 0.00                        | 9,125       | 2,281     |
| fixed ≥ 0.4           | 0.58                             | 0.58                      | 0.00                        | 9,658       | 2,415     |
| top-8, floor 0.25     | 0.72                             | 0.72                      | 0.50                        | 11,663      | 2,916     |
| relative ≥ 60% of top | 0.54                             | 0.54                      | 0.22                        | 8,746       | 2,186     |
| **adaptive v2**       | 0.56                             | **0.93**                  | **0.56**                    | 13,992      | **3,498** |

**Adaptive v2** has two tiers:

- **Full content:** items scoring at least max(0.25, 0.6 × top score), up to 10. Records are
  capped at 1.2K chars, and a document contributes up to 4 of its best-scoring sections at 2K
  chars each.
- **Summaries:** the next 20 items scoring at least 0.25, as one-line summaries.

Packing _skips_ an item that doesn't fit and keeps going. It doesn't stop at the first large
document; stopping was the v1 budgeter bug, where big documents crowded out small plans and
tasks.

### 3. Does the added context contain the answer? (fact audit on the v2 block)

Each scenario was probed for four concrete facts a correct answer needs.

| Question                    | Today's prompt                                                                 | With Jev v2                               | Added context |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- | ------------- |
| Status of marketing plans   | 4/4 (via the START HERE excerpt)                                               | 4/4                                       | 21.6K chars   |
| Influencers to reach out to | **0/4**: the Influencers doc isn't even named                                  | 3/4                                       | 10.4K         |
| Email strategy              | **0/4**: none of the 6 must-haves are named (beyond the 18-task / 20-doc caps) | 4/4                                       | 21.1K         |
| Plan for the school         | 3/4                                                                            | 4/4                                       | 20.5K         |
| How much will it cost       | **0/4**: none of $300K, $5M, $2M, $150K/acre                                   | **4/4**                                   | 7.9K          |
| Who's running this          | **0/4**                                                                        | 3/4 (founding board, grandmother, pastor) | 10.1K         |

**Where Jev earns its keep:**

- **Fact questions** (cost, who): the answer is buried in a document body that today's prompt
  never shows.
- **Big projects** where the relevant items fall outside today's recency caps (influencers,
  email).

**Where it adds little:** broad status questions that the START HERE excerpt already answers. On
those, v2 spends about 5K tokens mostly repeating what's already there.

### 4. Cost and speed

| Variant                       | p50    | p95      | max      | $/turn   |
| ----------------------------- | ------ | -------- | -------- | -------- |
| entities (1 call)             | 342 ms | 767 ms   | 899 ms   | $0.00049 |
| sections (1 call)             | 656 ms | 842 ms   | 914 ms   | $0.00102 |
| twostage (2 sequential calls) | 543 ms | 1,161 ms | 1,299 ms | $0.00082 |

- **Latency:** the entity call runs in parallel with the existing Jev tool selection (p50 about
  340 ms), so it adds roughly zero at p50. The heading stage adds about 200 ms at p50 and about
  400 ms at p95.
- **Cost:** Jev costs less than $0.001 per project turn. The larger cost is main-model input:
  +2–5K tokens per turn (v2 mean about 3.5K), and 0 on chit-chat.

### 5. Section-level ranking has a ceiling: vague headings

- The right section ranked **#1 in its document** for "Funding & Operations" and "Team &
  Support".
- The cost facts in "Founder Call Parse" sit under **"What appears settled"**, which ranked 7th
  of 12. From the title alone there is no way to know that heading holds the dollar figures.
- Section scores within a document are compressed: 0.70–0.76 on the plan question and 0.40–0.54
  on the cost question.

## Recommendation (replaces the spec's fixed 0.65 / 0.35 thresholds)

1. **Relative rule plus floor.** Load in full the items scoring at least max(0.25, 0.6 × top),
   up to 10, packed with skip-not-stop. Show the next 20 items scoring at least 0.25 as summary
   chips. In the UI, the full tier gets the solid dot and the summary tier the half dot.
2. **Broad-question mode.** When at least 15 items sit within 0.1 of the top score, the question
   is broad. Load at most 4 items in full, rely on summaries, and lean on START HERE.
3. **Two-stage in production.** Run the entity call in parallel with tool selection. Run the
   heading call for the top 5 documents only.
4. **Retune from the ledger, not by hand.** The relative factor (0.6) is the knob. "Questions for
   Mom" scored 0.36 against a top of 0.83 on the cost question, so a factor of 0.4 would have
   loaded it. That points to a range of 0.4–0.6 for the ledger to settle.

## Full test: does the next agent answer better? (2026-09-22, run 2)

This run used the new document summaries:

- up to 40 H1–H3 headings per document, keeping every H1/H2 when a document has more;
- descriptions cut at 150 chars on a word boundary.

Jev re-ranked everything (entities + two-stage × 3 reps). Then the acting model,
`deepseek/deepseek-v4.1-flash` (production `AGENTIC_CHAT_OPENROUTER_MODEL`), answered each
question twice per rep:

- **today:** today's project context stand-in (digest, capped work lines, START HERE excerpt);
- **jev:** the same, plus the adaptive-v2 Jev block.

The model had no tools. It was told to answer from context and say what's missing rather than
invent. Jev judged each answer against four fact claims per question: one yes/no question per
claim, counted when p ≥ 0.5. No regex is used on model text.

**Spend:** $0.060 by the OpenRouter credit counter ($168.576 → $168.636).

| Question                     | Facts, today                                                   | Facts, with Jev                                                                  | Input tokens today → Jev |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| How much will it cost?       | **0/4**: says "no dollar figures exist" (honest, no invention) | **4/4**, and flags the website's $6M vs the founder call's ~$5M                  | 1,061 → 2,770            |
| Influencers to reach out to? | **0/4**: lists podcasters from tasks                           | **3/4**: Chestnut, Cron, Whitmoyer-Ober (+ Ishler), plus campaign status         | 3,614 → 8,065            |
| Email strategy?              | 1/4                                                            | **4/4**                                                                          | 3,618 → 8,024            |
| Who's running this?          | 0.67/4: "the context doesn't name anyone"                      | **3/4**: board = grandmother, mother, stepfather, pastor (misses Kenny Rodrigue) | 1,059 → 3,490            |
| Plan for the school?         | 3.67/4                                                         | 4/4                                                                              | 1,061 → 5,693            |
| Status of marketing plans?   | 3.67/4                                                         | 2.67/4                                                                           | 3,613 → 9,230            |

| Arm     | Fact coverage | Mean input tokens | Mean $/answer | Mean answer latency |
| ------- | ------------- | ----------------- | ------------- | ------------------- |
| today   | 37%           | 2,338             | $0.00071      | 45.6 s              |
| **jev** | **86%**       | 6,212             | $0.00127      | 47.9 s              |

- **Marketing status is a grading artifact more than a regression.** The Jev answer leads with
  START HERE-level status: the activation leak (5,357 visitors, 0 signups), the Reels format
  pivot, and the Instagram blocker. It drops the task-level items the fact list checked. Broad
  questions still need the "broad mode" cap from the recommendation.
- **No invented facts in either arm** (rep-0 answers read by hand). Without the context, the
  model says what's missing and names the document it would open. Jev turns that into an actual
  answer in the same turn.
- **Latency:** answer latency is DeepSeek's (≈45 s, reasoning-heavy) and barely moves with +3.9K
  input tokens. Jev ranking adds p50 355 ms (entities, run in parallel with tool selection) or
  552 ms (two-stage).
- **Cost per project turn:** about $0.001 for Jev plus about $0.0006 of extra main-model input.
  That is roughly **2× today's answer cost, for 2.3× the fact coverage**.
- **Not measured:** the real agent has tools. It could fetch those documents itself, at 1–2 extra
  provider passes each. This test measures the no-round-trip answer.

## Open investigation: block size and the marketing-status answer (2026-09-22, free replays)

**The question.** In the full test, "What's the current status of my marketing plans?" scored
worse with Jev (2.67/4) than without (3.67/4), and its block was the largest: 20.6K chars, about
5K tokens. Today's whole project context for 9takes is about 3.6K tokens. A "broad question
mode" was proposed in chat: detect a score plateau, roll tasks up under their plans, and cap
documents at 2. DJ was not sold on it and asked for investigation before building anything.
Nothing below changes Jev calls. Every number is a replay of cached Jev rankings: no model
calls, $0.

**What's actually in the marketing block** (rep 0, adaptive v2):

- 10 full items (13.8K):
    - Marketing Plan (plan)
    - Social Media Promotion Strategy (doc, 2.0K)
    - Long-Form Outreach 12 Emails (doc, 5.1K: email drafts)
    - START HERE › Current state etc. (3.1K, **already in the prompt**)
    - 6 tasks
- 20 summaries (6.8K):
    - 9 near-identical "Outreach: X — SEND/SENT" tasks
    - 7 "IG Post N" tasks
    - document summaries that carry up to 40 headings each, as raw JSON

**Where the characters go, all questions** (rep 0, adaptive v2):

|                              | Marketing | Influencers | Email | School plan | Cost | Who  |
| ---------------------------- | --------- | ----------- | ----- | ----------- | ---- | ---- |
| Document sections (1–3 docs) | 9.9K      | 9.1K        | 10.6K | 10.8K       | 4.0K | 9.1K |
| Summary lines                | 6.8K      | 6.4K        | 5.4K  | 8.3K        | 1.6K | 0.7K |
| Tasks/plans/goals in full    | 3.9K      | 0.5K        | 3.3K  | 2.9K        | 1.9K | 0    |
| Duplicate of START HERE      | 3.1K      | 0           | 0     | 0           | 0    | 0    |

- **Loaded documents are the biggest cost,** at about 4.5K chars each: up to 4 sections × 2K.
  The _number_ of documents isn't the driver. The budgeter loads only 1–3 per question.
- **Summary lines are the second biggest cost,** mostly because document summaries carry their
  full heading list.

**Packing variants** (mean over 3 reps; label recall as in section 2):

| Variant                                              | Must-haves with content | Must-haves named | Must sections | Mean added chars | ≈ tokens |
| ---------------------------------------------------- | ----------------------- | ---------------- | ------------- | ---------------- | -------- |
| adaptive v2 (what the answer test used)              | 0.59                    | 0.93             | 0.56          | 15,487           | 3,872    |
| + skip items already in the prompt (START HERE)      | 0.57\*                  | 0.90\*           | 0.56          | 15,191           | 3,798    |
| + DJ's depth rule (≥3 docs → 2 sections, H1/H2 only) | same                    | same             | same          | same             | same     |
| + compact summary lines (no headings, no JSON)       | 0.57                    | 0.90             | 0.56          | 12,519           | 3,130    |
| + 2 sections per doc (instead of 4)                  | 0.56                    | 0.90             | **0.50**      | 9,656            | 2,414    |

\* The drop is a labeling artifact. START HERE is a marketing must-have, and the model still
sees it through today's excerpt.

**Findings**

1. **Skipping what's already in the prompt** is correct and nearly free. It only touches START
   HERE today (3.1K on the marketing question).
2. **The depth rule never fires,** because the "many documents" case doesn't happen. Shallower
   headings would matter only if a single loaded document's top sections were deep H3s, and
   here they're mostly H2s.
3. **Compact summary lines** cut 19% of the block with **no recall loss**. A summary line
   becomes `task: Outreach: Theo Von — SEND [todo] — Type 7. Channel: X DM…`, with no heading
   list. Headings still go to Jev for ranking; they just don't need to go to the answering model
   for summarized items.
4. **2 sections per document** cuts another 23%, but it drops must-have sections. On the cost
   question, "What appears settled" (the dollar figures) falls out. It might cost some of the
   fact wins, and only the paid answer test can say.
5. **Nothing here explains the marketing miss by size alone.** Even after 1–3 the block is 15K.
   The miss looks like _emphasis_: the model summarized at START HERE level and skipped the task
   states. Rolling tasks up under their plans is the untested idea aimed at that. The database
   has 18 plan→task and 7 goal→task links in 9takes; the newer outreach and IG tasks are unlinked.

**Proposed next step (not run, needs DJ's OK):** an answer A/B on deepseek-v4.1-flash across all
6 questions, comparing adaptive v2 with v2 + dedup + compact summaries, plus optionally the
2-sections variant. About 36 answers ≈ $0.03. Before running it, widen the marketing checklist to
6 facts (the 4 task-level ones plus the activation leak and the Instagram blocker), so that
neither answer style wins by construction. Task rollups stay parked until that result is in.

### Result: answer test on the packing variants (2026-09-22, run 3, DJ approved)

DJ adopted the two safe changes: skip items already in the prompt, and compact summary lines.
Setup:

- **Model:** `deepseek/deepseek-v4.1-flash`, 3 reps.
- **Grading:** Jev-judged facts. The marketing checklist was widened to 6 facts (+ activation
  leak, + Instagram blocker); the cached run-2 answers were re-graded, not re-generated.
- **Spend:** $0.045 by the credit counter ($168.649 → $168.694).

| Arm                                                 | Fact coverage | Mean input tokens | Mean $/answer |
| --------------------------------------------------- | ------------- | ----------------- | ------------- |
| today                                               | 38%           | 2,338             | $0.00071      |
| jev (adaptive v2)                                   | 88%           | 6,212             | $0.00127      |
| **safe (v2 + skip duplicates + compact summaries)** | **88%**       | **5,480**         | $0.00147\*    |
| safe + 2 sections per doc                           | 69%           | 4,838             | $0.00108      |

\* The per-answer cost difference comes from DeepSeek's variable output and reasoning length,
not from input size.

| Question                   | today    | jev  | safe | safe-2sec |
| -------------------------- | -------- | ---- | ---- | --------- |
| Marketing status (6 facts) | **5.67** | 4.67 | 5.00 | 5.33      |
| Influencers                | 0        | 3    | 3    | 3         |
| Email strategy             | 1        | 4    | 3.67 | 2.67      |
| School plan                | 3.67     | 4    | 4    | 4         |
| Cost                       | 0        | 4    | 4    | 3.33      |
| Who's running it           | 0.67     | 3    | 3    | **0**     |

**Decision**

- **Safe packing is the new default.** It keeps coverage at 88% with 12% less added context.
- **2 sections per document is rejected.** It loses the answer sections: "who's running it"
  collapses from 3 to 0, and cost drops to 3.33.

**Still open:** marketing status. Today's context wins it (5.67 vs 5.00 of 6), because the START
HERE excerpt already carries the big picture and the Jev block adds competing detail. The gap
is under one fact. Broad-question handling stays parked until more broad questions are tested.

## Not yet tested

- **With tools:** the A/B above is tool-free. A live-agent comparison would count tool round trips saved.
- **Heading ledes:** dropped. DJ accepts that facts under vague headings can be missed.

## Reproduce

Dumps hold private project content and live outside the repo, in the session scratchpad.
Recreate them with the `supabase db query --linked -o json` projection used on 2026-09-22 (one
row with `project`, `documents`, `tasks`, `goals`, `plans`, `milestones`, `risks`), then run:

```bash
cd apps/worker
# free: sizes + baseline
NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-context-eval.ts --dumps <dir> --out <dir>
# paid (approval required)
JEV_CONTEXT_EVAL_LIVE=1 NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-context-eval.ts --dumps <dir> --out <dir> --live --reps 3
# free: re-sweep policies from cached answers
NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-context-eval.ts --dumps <dir> --out <dir> --replay --reps 3
```

## Applying the ranker to the research specialist: free replay (2026-09-22, $0)

**Question:** would Jev help the published research specialist find evidence? Today the
specialist sees the same 20 most-recent document titles as chat, picks at most 4 documents in one
batch, and each read returns the **first 6,000 characters** of the document
(`20260920032259_agentic_chat_document_read_tools_v1.sql`). Built-in Project Review v2 ranks
documents with Postgres full-text search instead, but still reads the first 4,000 characters.

**Method:** `specialist-evidence-replay.py` reuses this eval's dumps, hand labels and cached
two-stage Jev scores (3 reps). Every arm gets the specialist's real budget: 4 documents × 6,000
characters. "Today" assumes the model picks the must documents **perfectly** from the titles it
can see, so it is an upper bound. The Jev arms use Jev's actual picks. A labeled section counts
when its heading and first 1,000 characters are inside what was read.

| Question         | Must docs (chars) | Reachable today (oracle) | Jev's top 4 has them | Must sections: today / Jev + opening / Jev + best sections |
| ---------------- | ----------------- | ------------------------ | -------------------- | ---------------------------------------------------------- |
| Marketing status | 1 (9.7K)          | 1                        | 1                    | —                                                          |
| Influencers      | 2 (75K)           | **0**                    | **2**                | —                                                          |
| Email strategy   | 1 (69K)           | **0**                    | **1**                | —                                                          |
| School plan      | 3 (47K)           | 3                        | 3                    | 1/2 · 1/2 · **1.67/2**                                     |
| Cost             | 2 (19K)           | 2                        | 2                    | 2/2 · 2/2 · 2/2                                            |
| Who's running it | 2 (19K)           | 2                        | 2                    | 0/1 · 0/1 · **1/1**                                        |

- **Finding the document:** on 9takes, the influencer and email documents are outside the 20 titles,
  so even a perfect picker cannot request them today. Jev's top 4 contains them in every rep.
- **Finding the part of the document:** "Team & Support" starts at character 5,669 and the plan
  section sits past 6,000, so the opening read misses them. Jev's section scores fill the same
  6,000-character slot with the right sections: 4.67/5 labeled sections versus 3/5 today.
- **Big documents are the open case:** the 9takes must documents run from 9.7K to 69K characters.
  An opening read covers 62% of the smallest and 9% of the email document, and those scenarios
  have no section labels yet.
- **Limits:** 6 questions, 2 projects, labels by one person, and no answer quality measured. This
  says the evidence would be _in front of_ the specialist, not that its answer improves.
