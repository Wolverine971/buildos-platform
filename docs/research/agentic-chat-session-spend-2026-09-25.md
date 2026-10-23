<!-- docs/research/agentic-chat-session-spend-2026-09-25.md -->

# Agentic Chat: Where Each Session's Money and Time Go (2026-09-25)

Read-only audit of production data. It covers every chat turn that started on or after
2026-09-24 00:00 UTC, when the acting model became `deepseek/deepseek-v4.1-flash` and Jev
tool selection and the Jev context finder went live. No paid calls were made and nothing was
written.

## TL;DR

- **The sample is small: 22 turns across 11 sessions, costing $0.208 in total.** DJ ran 18 of
  the turns. A new external user who signed up on 09-24 ran the other 4.
- **A typical turn costs about $0.009 (median $0.0087, p90 $0.0154) and takes about 19 s of
  wall time (median, p90 31 s).** It usually makes 3 acting passes, 3 Jev calls, 0 reviewer
  calls and 3-4 tool calls.
- **The opening pass is 36% of all spend.** Its cache hit rate is 12.5%. On continuation passes
  the hit rate is 74-85%. At DeepSeek v4.1 Flash prices (fitted below), uncached input costs 50x
  as much as cached input, so this gap is the main cost lever.
- **Why the opening pass misses cache:** the system prompt contains a minute-precision
  "Current time" line, placed about 16K characters in. Every token after that line is billed at
  the full rate on every new turn.
- **Model time is 88% of wall time** (442 s of the 502 s total). Tool execution adds up to 98 s,
  but much of that overlaps with the web and research lane. Latency comes from the number of
  passes and the size of reasoning output, not from tools or Jev (Jev adds 0.3-1.5 s per turn).
- **Context finder "on" has not run on a single turn yet.** It was switched on for DJ at 11:52
  UTC, and the last turn in the window started at 11:33. All 13 selection events are
  `mode: chips`. The chips data still gives a strong signal: **18 of 20 ID-targeted reads in
  those turns were of records the finder had already selected.**

## Scope and method

| Source                  | What was used                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_turn_runs`        | 22 turns (all `completed`), from `started_at` to `finished_at`                                                                                                                                                                                                                                                          |
| `llm_usage_logs`        | 266 `agentic_chat_*` rows. Rows were joined by `turn_run_id`. Context-finder rows have no `turn_run_id` and were joined by `chat_session_id` plus the turn's time window (26 of 26 matched).                                                                                                                            |
| `chat_tool_executions`  | 93 tool calls, with result size measured as `length(result::text)`                                                                                                                                                                                                                                                      |
| `chat_turn_events`      | `context_selection` (13), `timing`, `context_usage`, `done`, `turn_phase`                                                                                                                                                                                                                                               |
| `chat_prompt_snapshots` | One snapshot per turn (22), with `prompt_sections` broken down by section. This was the best source for prompt composition. Note that snapshots are taken **before** Jev narrows the tool list, so their `tool_definitions` hold the full admitted tool surface. The narrowed size comes from Jev's `schemaCharsAfter`. |

**Fitted prices** (least squares on logged provider-reported cost, max error under $1e-8):

| Model                                   | Uncached input | Cached input |  Output |
| --------------------------------------- | -------------: | -----------: | ------: |
| `deepseek/deepseek-v4.1-flash` (acting) |       $0.300/M |     $0.006/M | $1.20/M |
| `openai/gpt-5.6-luna` (reviewer)        |       $0.250/M |     $0.020/M | $1.20/M |
| `typesafe/jev-1.13` (Jev)               |       $0.042/M |          n/a |      ~0 |

**Cross-check with the admin view** (`/api/admin/chat/sessions/[id]` →
`session-detail-payload.ts` → `resolveUsageLogCostBreakdown`). The admin view sums _every_
`llm_usage_logs` row that carries the `chat_session_id`, preferring
`openrouter_usage_cost_usd`. For chat operations that field equals `total_cost_usd` on 89 of 92
rows. My turn totals match the admin totals for `c4ea8927` and `de5959b7` to within
$0.0005. The whole difference is `freshness_radar_decisions`, the post-turn Jev work.
`6e4f5bd3` shows $0.0415 in the admin view against $0.0318 here, because the admin view also
counts five `project_loop_*` calls from 09-24 04:00 that reuse that session id. That spend is
real, but it is not chat turns.

**Excluded from the per-session tables.** There are 114 rows ($0.24) from
`agentic-e2e-harness@example.com`, logged between 09-24 21:59 and 09-25 00:46 (the paid gate
battery). They have **no `chat_session_id` or `turn_run_id`**, because the turns ran against
the isolated gate database while usage was logged to production. They are summarized on their
own below.

## 1. Per-turn and per-session numbers

| Metric (22 turns)              |  Median |     p90 |    Mean |     Max |
| ------------------------------ | ------: | ------: | ------: | ------: |
| Cost per turn                  | $0.0087 | $0.0154 | $0.0094 | $0.0290 |
| Wall time (s)                  |    19.0 |    30.9 |    22.8 |   102.4 |
| Acting passes                  |       3 |       4 |    2.95 |       6 |
| Reviewer calls                 |       0 |     1.9 |    0.82 |       7 |
| Jev calls                      |       3 |     4.9 |     2.8 |       7 |
| Tool calls                     |     3.5 |       8 |     4.2 |      11 |
| Tool-result chars into prompts |    9.0K |   31.7K |   13.1K |   52.7K |

### Turns

| Turn       | Session    | User     | Started (UTC) |    Cost | Wall s | Acting | Final | Repair | Reviewer | Jev | Tools | Result chars |
| ---------- | ---------- | -------- | ------------- | ------: | -----: | -----: | ----: | -----: | -------: | --: | ----: | -----------: |
| `0c549a0e` | `4dd5ecef` | DJ       | 09-24 00:07   | $0.0045 |   22.3 |      3 |     0 |      0 |        0 |   1 |     6 |       32,642 |
| `d5b589d2` | `4dd5ecef` | DJ       | 09-24 00:08   | $0.0024 |   18.4 |      2 |     0 |      0 |        0 |   1 |     1 |       16,851 |
| `4d1aa409` | `b6c2269c` | new user | 09-24 04:28   | $0.0026 |   22.1 |      2 |     0 |      1 |        1 |   1 |     2 |        2,123 |
| `1d3925b5` | `b6c2269c` | new user | 09-24 04:31   | $0.0098 |   78.4 |      4 |     1 |      0 |        7 |   1 |    11 |        4,465 |
| `3ee21a5b` | `17ef6197` | new user | 09-24 04:37   | $0.0039 |   30.2 |      6 |     0 |      0 |        0 |   1 |     7 |       12,609 |
| `0cbc8433` | `b6c2269c` | new user | 09-24 04:37   | $0.0092 |  102.4 |      4 |     2 |      0 |        7 |   1 |     8 |       11,554 |
| `5afcbb2b` | `307d8e8f` | DJ       | 09-24 16:42   | $0.0058 |    6.8 |      3 |     1 |      0 |        0 |   2 |     3 |        2,749 |
| `798343c0` | `307d8e8f` | DJ       | 09-24 16:43   | $0.0054 |    8.7 |      4 |     0 |      0 |        0 |   2 |     5 |        8,304 |
| `d27da779` | `4463fe09` | DJ       | 09-24 17:02   | $0.0146 |   19.5 |      3 |     0 |      0 |        0 |   4 |     1 |        3,055 |
| `8e83272d` | `7fc56278` | DJ       | 09-25 00:45   | $0.0071 |    4.4 |      2 |     0 |      0 |        0 |   5 |     1 |        1,094 |
| `1f77e0c2` | `7fc56278` | DJ       | 09-25 00:46   | $0.0046 |    3.6 |      2 |     0 |      0 |        0 |   3 |     1 |        1,094 |
| `a3bcb0df` | `c4ea8927` | DJ       | 09-25 00:54   | $0.0101 |   11.6 |      4 |     0 |      0 |        0 |   3 |     7 |       24,210 |
| `4172a44a` | `c4ea8927` | DJ       | 09-25 00:59   | $0.0101 |   25.0 |      4 |     0 |      0 |        0 |   3 |     4 |       17,145 |
| `146a9004` | `c4ea8927` | DJ       | 09-25 01:00   | $0.0290 |   31.0 |      4 |     0 |      1 |        2 |   3 |     8 |       52,676 |
| `4577a614` | `c4ea8927` | DJ       | 09-25 01:01   | $0.0069 |    6.7 |      3 |     0 |      0 |        0 |   3 |     3 |        9,708 |
| `d09e58a3` | `671042c7` | DJ       | 09-25 01:45   | $0.0130 |   16.6 |      3 |     0 |      0 |        0 |   6 |     7 |       31,770 |
| `4df5a0d9` | `de5959b7` | DJ       | 09-25 01:46   | $0.0120 |   15.2 |      4 |     0 |      0 |        0 |   7 |     9 |       31,237 |
| `106a149d` | `de5959b7` | DJ       | 09-25 01:47   | $0.0039 |    5.0 |      2 |     0 |      0 |        0 |   3 |     1 |        4,316 |
| `cd26ef05` | `6e4f5bd3` | DJ       | 09-25 04:54   | $0.0163 |   25.4 |      2 |     1 |      0 |        0 |   3 |     4 |       16,974 |
| `5de5f0c3` | `6e4f5bd3` | DJ       | 09-25 04:55   | $0.0155 |   23.5 |      2 |     0 |      0 |        1 |   3 |     2 |        2,125 |
| `810480de` | `6d99d8a9` | DJ       | 09-25 04:58   | $0.0083 |    5.9 |      1 |     1 |      0 |        0 |   3 |     1 |        1,385 |
| `a4e34bc6` | `de5959b7` | DJ       | 09-25 11:33   | $0.0128 |   19.6 |      1 |     1 |      0 |        0 |   3 |     1 |        1,022 |

"Acting" counts acting passes only. "Final" is the tool-free synthesis pass. "Jev" counts tool
selection, the two context-finder stages, email scan and provenance.

### Sessions

| Session    | User     | Turns |    Cost | Cost/turn | Wall s (sum) | Tool calls | Passes (acting+final+repair) | Reviewer calls | Jev calls |
| ---------- | -------- | ----: | ------: | --------: | -----------: | ---------: | ---------------------------: | -------------: | --------: |
| `c4ea8927` | DJ       |     4 | $0.0560 |   $0.0140 |           74 |         22 |                           16 |              2 |        12 |
| `6e4f5bd3` | DJ       |     2 | $0.0318 |   $0.0159 |           49 |          6 |                            5 |              1 |         6 |
| `de5959b7` | DJ       |     3 | $0.0287 |   $0.0096 |           40 |         11 |                            8 |              0 |        13 |
| `b6c2269c` | new user |     3 | $0.0216 |   $0.0072 |          203 |         21 |                           14 |             15 |         3 |
| `4463fe09` | DJ       |     1 | $0.0146 |   $0.0146 |           19 |          1 |                            3 |              0 |         4 |
| `671042c7` | DJ       |     1 | $0.0130 |   $0.0130 |           17 |          7 |                            3 |              0 |         6 |
| `7fc56278` | DJ       |     2 | $0.0116 |   $0.0058 |            8 |          2 |                            4 |              0 |         8 |
| `307d8e8f` | DJ       |     2 | $0.0111 |   $0.0056 |           15 |          8 |                            8 |              0 |         4 |
| `6d99d8a9` | DJ       |     1 | $0.0083 |   $0.0083 |            6 |          1 |                            2 |              0 |         3 |
| `4dd5ecef` | DJ       |     2 | $0.0069 |   $0.0034 |           41 |          7 |                            5 |              0 |         2 |
| `17ef6197` | new user |     1 | $0.0039 |   $0.0039 |           30 |          7 |                            6 |              0 |         1 |

## 2. Cost by call role

| Role                                     | Calls |      $ |     Share | Avg $/call | Median latency |  $/turn |
| ---------------------------------------- | ----: | -----: | --------: | ---------: | -------------: | ------: |
| Acting: opening pass                     |    22 | 0.0753 | **36.2%** |    0.00342 |          3.8 s | 0.00342 |
| Acting: tool continuations               |    43 | 0.0602 |     29.0% |    0.00140 |          3.1 s | 0.00274 |
| Jev tool selection                       |    22 | 0.0146 |      7.0% |    0.00066 |         0.33 s | 0.00066 |
| Mutation reviewer (gpt-5.6-luna)         |     4 | 0.0132 |      6.3% |    0.00330 |          4.0 s | 0.00060 |
| Jev context finder (entities + headings) |    26 | 0.0127 |      6.1% |    0.00049 |         0.24 s | 0.00058 |
| Final synthesis (tool-free)              |     7 | 0.0100 |      4.8% |    0.00143 |          1.5 s | 0.00045 |
| Jev email scan                           |    12 | 0.0092 |      4.4% |    0.00076 |         0.25 s | 0.00042 |
| Repair                                   |     2 | 0.0083 |      4.0% |    0.00416 |          3.4 s | 0.00038 |
| Research (web) reviewer                  |    14 | 0.0043 |      2.1% |    0.00031 |          2.3 s | 0.00019 |

- **Acting passes are 70% of spend. Jev is 17.5%, reviewers 8.4%, repair 4%.**
- DeepSeek v4.1 spend splits into **uncached input 63%, output 35% and cached input 2%.**
- **Reasoning tokens are 57% of DeepSeek completion tokens** and account for **15.5% of all
  chat spend** (26.9K tokens).
- Jev tool selection pays for itself. It shrinks the tool schemas from 53-68K characters to a
  median of about 19K, which removes roughly 9-11K uncached tokens (about $0.003) from each
  opening pass, at a cost of $0.00066.
- Post-turn freshness radar adds another 24 calls and $0.0065 across these sessions. It is
  visible in the admin session total.

## 3. Tools

| Tool                      | Calls | Median result chars |        Max | Notes                                                                                   |
| ------------------------- | ----: | ------------------: | ---------: | --------------------------------------------------------------------------------------- |
| read_document_section     |    16 |               1,217 |      4,532 | Step 3 of the document read ladder                                                      |
| web_search                |    14 |          (redacted) |          — | Content is not stored. The prompt grows about 5K tokens per 3-search round. 2 failures. |
| get_onto_document_details |    13 |               4,552 |     12,916 | Step 1 of the ladder                                                                    |
| get_document_outline      |     8 |               1,756 |      2,098 | Step 2 of the ladder                                                                    |
| scan_email_inbox          |     7 |               1,104 |      3,055 | Fans out to 1-4 Jev email_scan calls, each about 21K tokens                             |
| get_workspace_overview    |     2 |              21,494 | **26,137** | About 6K tokens, on "what should I work on" turns                                       |
| update_onto_document      |     1 |          **40,238** |          — | Returns the full document (35.6K) plus the change (4.5K)                                |
| create_onto_document      |     1 |              10,441 |          — |                                                                                         |
| search_project            |     1 |              12,553 |          — |                                                                                         |

- **Within-turn growth.** The prompt grows by a median of 1.4K tokens (mean 2.3K) between
  consecutive acting passes.
- **Exact duplicate calls** are rare. There was one: `3ee21a5b` fetched the same document
  details twice.
- **Re-reads across turns** are concentrated in the book session `c4ea8927`. Each follow-up
  turn re-ran outline and section reads on the same 1-2 chapter documents, so turns 2, 3 and 4
  each re-walked documents that turn 1 had already read. `106a149d` re-read the Rod email
  draft that the previous turn had just loaded.
- **The context finder had already selected what the model went on to read:**

| Turn          | Items selected | ID-targeted reads | Reads of selected items |
| ------------- | -------------: | ----------------: | ----------------------: |
| a3bcb0df      |             22 |                 2 |                       2 |
| 4172a44a      |              2 |                 1 |                       1 |
| 146a9004      |              6 |                 2 |                       2 |
| 4577a614      |              3 |                 1 |                       1 |
| d09e58a3      |             30 |                 5 |                       5 |
| 4df5a0d9      |             23 |                 4 |                       4 |
| 106a149d      |              4 |                 1 |                       1 |
| cd26ef05      |             30 |                 2 |                       1 |
| 5 other turns |              — |                 0 |                       — |

In total, **18 of 20** ID-targeted reads were already in the selection, almost all in the
`full` tier. **14 acting passes existed only to read those selected records** (they cost
$0.027 and took 26.9 s of model time).

## 4. Prompt composition, growth and caching

Average opening-pass composition, from snapshot sections plus Jev's narrowed schema size.
The average opening prompt is 11.9K tokens.

| Block                                                                                                                         |                      ~Tokens | Stable across turns?            |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------: | ------------------------------- |
| Static frame (identity, strategy, safety, dates rules, final-response contract)                                               |                        1,900 | Yes                             |
| Project START HERE (19/22 turns)                                                                                              |                        1,370 | Yes, until the document changes |
| Focus and purpose                                                                                                             |                          190 | Yes                             |
| **Loaded context** (contains `Current date … HH:MM` and `Current time (UTC instant, minute precision)`, recent-change counts) | 1,510 (up to 3.6K on global) | **No, it changes every minute** |
| Knowledge map                                                                                                                 |                          440 | Mostly                          |
| Runtime system messages (write routing and similar)                                                                           |                          900 | Yes                             |
| History (0-9.7K chars)                                                                                                        |                          500 | Append-only                     |
| Tool schemas after Jev narrowing                                                                                              |          ~5,300 (0.4K-13.5K) | No, the set changes per turn    |

**Cache hit rate by pass position** (share of cached_prompt_tokens in prompt_tokens):

| Position        |   n | Avg prompt |  Hit rate |
| --------------- | --: | ---------: | --------: |
| Opening         |  22 |     11,870 | **12.5%** |
| Continuation 1  |  20 |     14,430 |     73.8% |
| Continuation 2  |  13 |     16,900 |     75.5% |
| Continuation 3  |   7 |     18,409 |     85.4% |
| Final synthesis |   7 |     12,830 | **32.8%** |
| Repair          |   2 |     18,396 | **26.4%** |

- **Opening on a session's first turn:** 605 tokens cached on average.
- **Opening on later turns:** 2,362 tokens cached out of 12,382. A diff of consecutive system
  prompts in `4172a44a → 146a9004` shows that the first differing byte is the `Current time`
  line, at character 16,383. That equals about 3.7K tokens, which matches the 3,712 cached
  tokens exactly.
- **Caching within a turn works** once the upstream provider is sticky. Since 09-24 16:42 every
  pass has been served by Together.
- **Earlier turns lost cache when the upstream endpoint changed.** GMICloud/DeepInfra
  alternation took `0c549a0e` pass 3 and `1d3925b5` pass 2 to 0%. A Makora stall in
  `d27da779` wasted a pass ($0.0036, 4.8 s, zero output) and forced a cold retry.
- **Synthesis and repair passes rebuild the request.** `forceToolFreeRequest` sets
  `tools: []`, which invalidates everything after the system prompt, so those passes pay mostly
  uncached rates.

## 5. Outlier traces

**Most expensive turns**

1. **`146a9004` ($0.0290, 31 s): "fold the Reindex into Chapter 2".**
    - The opening pass read 2 outlines. Continuation 1 read 3 sections. Both targets were
      already in the finder's `full` tier.
    - Continuation 2 planned the edit with **3,141 reasoning tokens** (12.6 s, $0.0054).
    - The reviewer ($0.0038) returned `request_proposal_revision`.
    - The **repair pass had a 31.3K-token prompt with only 19.6% cached** ($0.0081, the single
      most expensive acting call).
    - A second review cost $0.0048. `update_onto_document` then returned **40K characters**
      (the full document), which pushed the closing pass to 33.7K tokens.
    - Writes plus review account for 58% of the turn's cost.
2. **`cd26ef05` ($0.0163, 25 s): rethinking the hackathon.**
    - The opening pass was uncached (15.8K tokens), with 1,250 reasoning tokens and a
      16K-character goal/search result.
    - Continuation 1 spent 1,524 reasoning tokens and then asked a clarification.
    - The clarification triggered a tool-free synthesis pass, which ran at only 45% cache.
    - The two context-finder stages ran on about 25K tokens each ($0.0022).
3. **`5de5f0c3` ($0.0155, 24 s): retire the DAU goal.**
    - The opening pass produced **3,874 reasoning tokens** (15 s, $0.0085), then approved and
      applied a goal update.
    - The reviewer added $0.0029 and 3.6 s.
4. **`d27da779` ($0.0146, 20 s): "any 9takes emails".**
    - The Makora route stalled with zero output ($0.0036 wasted). The retry landed on Together
      with no cache ($0.0046).
    - 3 Jev email scans cost $0.0024.
    - The same question in `8e83272d` cost $0.0071 and took 4.4 s.
5. **`a4e34bc6` ($0.0128, 20 s): "Boom! Just sent it."**
    - Jev selected **1 tool** (`request_turn_clarification`).
    - The model spent **6,307 reasoning tokens (17.9 s, $0.0105, 82% of the turn)**, then
      asked a clarification and ran a synthesis pass.
    - A one-line acknowledgement became the most reasoning-heavy pass in the window.

**Most expensive sessions**

- **`c4ea8927` (book, 4 turns, $0.056, 74 s).**
    - Every turn walked the same ladder: document details, then outline, then sections, one pass
      per step (3-4 passes each).
    - The chapter documents were re-read on every turn.
    - All the targets were in the finder's selection.
    - `146a9004` above is turn 3 of this session.
- **`6e4f5bd3` (hackathon, 2 turns, $0.032 in turns; $0.041 in the admin view).**
    - Reasoning-heavy openings (1.2K and 3.9K reasoning tokens), plus a synthesis pass and a
      review.
    - The context finder here ran on about 25K-token inputs, the biggest in the window.
- **`de5959b7` (Rod, 3 turns, $0.029).**
    - The opening pass fetched 4 documents plus an email scan (27K characters). Then came an
      outline-then-sections ladder on records that were already selected.
    - The next turn re-read the email draft.
    - The last turn is `a4e34bc6` above.

**Slowest turns (new user, 09-24).** `0cbc8433` took 102 s and `1d3925b5` took 78 s.

- Web research ran 3 searches per round, and the research reviewer ran after every search:
  7 reviews per turn, **29 s** in `1d3925b5` (including two 5 s timeouts) and **15 s** in
  `0cbc8433`.
- In `0cbc8433`, a 42 s `create_onto_document` pass was followed by **two** back-to-back
  tool-free synthesis passes (13.5 s + 15.1 s, mostly uncached).
- This is the only external user in the window, and their first real turns took 1.5-2
  minutes.

## 6. Waste patterns, ranked

Baseline: $0.94 per 100 turns and about 38 minutes of wall time per 100 turns. The estimates
below are extrapolated from 22 turns, so treat them as directional.

| #   | Pattern                                                                       | Evidence                                                                                                                                                            |                                   Est. $ saved / 100 turns |                                           Latency saved |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------: | ------------------------------------------------------: |
| 1   | **Reasoning blowups on the acting pass**                                      | 26.9K reasoning tokens make up 15.5% of spend. 5 passes had more than 1.5K reasoning tokens, and each took 9-18 s. `a4e34bc6` spent 6.3K on "just sent it".         |                                  ~$0.06 (7%) with a 1K cap |  ~1.5 s per turn on average, 10-17 s on the worst turns |
| 2   | **Opening-pass cache miss from the minute clock in the system prompt**        | Opening hit rate is 12.5%. The prefix breaks at the `Current time` line. 10.0K uncached tokens per later-turn opening.                                              |                                         $0.05-0.09 (5-10%) |                                  Small (faster prefill) |
| 3   | **Read ladders on records the finder already selected**                       | 14 passes ($0.027, 27 s) in 8/22 turns. 18/20 targeted reads were pre-selected.                                                                                     |      ~$0.09 gross, ~$0.03-0.06 net of the injected context | **~1.2 s per turn on average, 3-6 s on document turns** |
| 4   | **Write path: rebuilt repair request + fat write receipt + per-write review** | `146a9004`: repair at 19.6% cache ($0.0081), 40K-character `update_onto_document` result, 2 reviews ($0.0086, 8.8 s). Gate battery: reviewers are 30% of its $0.24. | ~$0.03-0.05 in prod (write-light); more on write-heavy use |                                4-9 s per reviewed write |
| 5   | **Tool-free synthesis rebuilds the request; duplicate synthesis**             | 7 synthesis passes, 32.8% cache, $0.010, 36 s total. `0cbc8433` ran 2 in a row.                                                                                     |                                                     ~$0.03 |                   1.6 s per turn on average, up to 28 s |
| 6   | **Research reviewer runs serially per web call**                              | 14 reviews, 2 hit the 5 s timeout, 29 s in one turn                                                                                                                 |                                                     ~$0.01 |                                    15-29 s on web turns |

## 7. Recommended fixes (ranked by value per unit of effort)

1. **Move the clock out of the cached prefix.** - In `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` around
   lines 965-980, the `Current date … HH:MM` and `Current time (UTC instant, minute
precision)` lines, along with the "N recent changes" counters, sit inside
   `location_loaded_context`. - Emit a date-only line in the system prompt. Carry minute time and volatile counters in the
   trailing runtime system message, just before the user message (the ~3K-character block
   that already exists). - Longer term: give Jev tools a stable canonical order, and consider sticky-union tool sets
   within a session, so schemas stop breaking the prefix across turns. - This is a free change that doesn't touch behavior, so it's the obvious first move.
2. **Cap reasoning on acting passes.**
    - Set `reasoning.max_tokens` of about 1-1.5K, or `effort: 'low'`, on the opening and
      continuation passes. It is set in
      `apps/worker/src/workers/agentic-chat/provider/openrouter/open-route.ts` (the
      `reasoning:` block, about line 252). Today only contract review and explicitly low
      requests get `effort: 'low'`.
    - At minimum, use low effort when Jev selected 3 or fewer tools or the user message is
      short. That is a Jev-style cheap pre-decision, because Jev already classifies the turn.
    - Quality risk: this needs a paid gate before shipping.
3. **Turn context finder "on" into the read-ladder killer and measure it.**
    - Injection is already live for DJ. The data says it should remove about 0.6 passes per
      turn on document turns.
    - Also cache `get_document_outline` and `read_document_section` per session (keyed on
      document `updated_at`), so follow-up turns in the same session don't re-walk the same
      chapter.
    - Measure it by comparing passes per turn and seconds per turn for `injected: true` against
      this chips baseline (the 8 turns in section 3).
4. **Make the synthesis and repair passes prefix-stable.**
    - `forceToolFreeRequest` in
      `apps/worker/src/workers/agentic-chat/provider/request-builders.ts:155` sets
      `tools: []`. Keep the tool list and send `toolChoice: 'none'`, so the prefix stays
      cached (verify that the route honors `tool_choice: none`).
    - Do the same for repair: append the revision note instead of rebuilding the request.
    - Find out why `0cbc8433` synthesized twice. The `MAX_FORCED_SYNTHESIS_RETRIES` path in
      `forced-synthesis.ts` is the likely cause (the model emitted a tool call in a tool-free
      pass).
5. **Trim write receipts.**
    - `update_onto_document` returns `document` (35.6K characters) plus `document_change`
      (4.5K). Return a receipt, a diff summary and the heading list; the model can re-read if it
      needs to. Result shaping lives under `apps/worker/src/workers/agentic-chat/tools/`.
    - Consider the same for `get_workspace_overview` (21-26K): cap it to the top-N projects
      by activity.
6. **Research reviewer: one review per round, not per call.**
    - Run a single review per search round, in parallel with the next step, with a shorter
      timeout (`apps/worker/src/workers/agentic-chat/tools/web-search-review.ts`).
    - This matters most for new users researching something from scratch, the slowest turns
      observed.

## Caveats

- **n = 22 turns.** The percentages are solid, but the per-100-turn dollar figures are
  extrapolations. Total chat spend is tiny in absolute terms ($0.21 over 36 hours), so
  **latency, not dollars, is the bigger user-facing cost**.
- **The context finder has no `turn_run_id`.** It was attributed by session and time window
  (26/26 matched). Gate-battery usage (114 rows, $0.24) has no session or turn ids.
- **Three acting rows cost less than the fit predicts:** 2 have `costSource: unknown` and 1
  has `catalog_estimate`, on the older `deepseek-v4-flash` model (the new user's early turns).
- **Web tool result sizes are redacted in `chat_tool_executions`.** Their prompt impact was
  inferred from growth in prompt tokens between passes.
- **No context-finder "on" (injected) turns exist yet**, so pattern 3's savings are
  projected, not measured.
- **Wall time runs from `started_at` to `finished_at`.** Tool time overlaps with model time
  on web turns, so the components don't sum exactly to wall time.
