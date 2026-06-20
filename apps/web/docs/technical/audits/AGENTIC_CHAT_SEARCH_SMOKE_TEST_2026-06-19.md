<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_SMOKE_TEST_2026-06-19.md -->

# Agentic Chat Search — Manual Smoke Test & Live Telemetry

| Attribute       | Value                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Date            | 2026-06-19                                                                                                                 |
| Purpose         | Drive the real agent through search in dev, watch what it does live, and collect real `result_count` / `zero_result` data. |
| Companion       | `AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md` (the audit this answers §5.2 / §5.9 of)                                          |
| Prereqs shipped | Live-path telemetry populate fix + dev `[search]` logging (see "What changed" below)                                       |

> **Why this exists.** The audit added `result_count` / `zero_result` columns but the
> populate code sat on a dead path (`ChatToolExecutor.logToolExecution`, which runs with
> `logExecutions=false` on the v2 chat path). Every search row in prod was therefore `NULL`.
> The fix moves population onto the **live** v2 persistence path and adds a dev log line so
> you can _see_ each search as it happens. This doc is the script to exercise it.

---

## What changed (so the data is real)

- **`buildToolExecutionInsertRows`** (`src/routes/api/agent/v2/stream/+server.ts`) now sets
  `result_count` / `zero_result` on every persisted tool row via the shared
  `searchTelemetryColumns()` helper. This is the path prod actually uses.
- **Dev log line** in the `onToolResult` callback (same file), gated on `dev`:
  `[search] agent search executed` with `tool`, `family` (`smart` | `legacy`), `query`,
  `projectScoped`, `resultCount`, `zeroResult`, `durationMs`, `sessionId`.
- **`searchToolFamily()` / `searchTelemetryColumns()`** added to `search-telemetry.ts` as the
  single source of truth shared by both writers; regression-guarded in `search-telemetry.test.ts`.

---

## 0. Setup

1. Run web in dev and **keep the server console visible** — that's where the log lands:
    ```bash
    pnpm dev --filter=web
    ```
2. Watch for lines tagged `[search] agent search executed` (logger name `API:AgentStreamV2`).
3. Open the agentic chat. Do the whole run as **one user** on **one fresh project** so the
   telemetry is easy to isolate by `session_id`.

> The seed prompts below make the agent create the project + documents itself, so content
> tokens are predictable. If you'd rather hand-create the project, just keep the **distinctive
> tokens** (in **bold**) intact — the search prompts depend on them.

---

## 1. Seed: create the project + documents

Send these as ordinary chat messages (workspace context). Each bold token is chosen to be rare,
so later searches have a predictable expected hit. Note: these are **write** ops, not searches —
they won't emit the `[search]` log; they're just building the corpus.

**Prompt S1 — create the project**

```
Create a new project called "Aurora Field Notes" — an indoor hydroponic greenhouse
experiment log.
```

**Prompt S2 — document 1 (token lives in BODY, not the title)**

```
In Aurora Field Notes, add a document titled "Basil Grow Log". Body: We switched the seedlings to rockwool cubes this week and started a nutrient film technique loop. pH holding at 5.9.
```

**Prompt S3 — document 2**

```
Add another document to Aurora Field Notes titled "Sensor Wiring Notes". Body: Wired the
photoresistor calibration rig to an ESP32. Logging lux every 30 seconds to debug the
afternoon light dropoff.
```

**Prompt S4 — document 3**

```
Add a document to Aurora Field Notes titled "Harvest Forecast". Body: Tracking powdery
mildew risk on the lower leaves. Yield projection for the quarter looks strong if humidity
stays under control.
```

**Prompt S5 — a task (to bait a legacy per-entity search later)**

```
Add a task to Aurora Field Notes: "Order pH calibration solution".
```

After S1–S5, confirm in the UI that the project has 3 documents + 1 task. Note the **project id**
(URL or ask the agent) — you'll filter telemetry by it.

---

## 2. Search test cases

Run these **in order**, one message each. After each, read the `[search]` log line and record
what you see. The "Expected" column is the hypothesis — **mismatches are the interesting data**,
not failures.

| #   | Prompt                                                     | What it probes                                                                                                                        | Expected `tool` / `family`                                                                  | Expected `resultCount` / `zeroResult`                          |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T1  | `Search all my projects for "Aurora Field Notes".`         | Broad cross-project search → should use the funneled smart tool                                                                       | `search_all_projects` / **smart**                                                           | ≥1 / false                                                     |
| T2  | `In Aurora Field Notes, find the document about rockwool.` | **Body-only token** (title is "Basil Grow Log", doesn't contain "rockwool"). Validates §3.4 — body indexed from `content`.            | `search_project` / **smart**                                                                | ≥1 / false                                                     |
| T3  | `What did I write about photoresistor calibration?`        | Multi-word body phrase                                                                                                                | smart                                                                                       | ≥1 / false                                                     |
| T4  | `Find my notes about "calibration wiring sensor".`         | **Words out of order** vs the doc text ("photoresistor calibration rig … Sensor Wiring"). Probes multi-word AND / any-order (§3.2).   | smart (or `search_onto_documents` legacy)                                                   | ≥1 / false                                                     |
| T5  | `Search for "powdry mildew".` (typo, missing the 'e')      | Fuzzy/typo tolerance. Smart path has trigram fallback; legacy ILIKE does not (§5.5/§5.7).                                             | smart                                                                                       | likely ≥1 / false — **if zero, that's the typo-tolerance gap** |
| T6  | `Search my notes for quantum entanglement.`                | **Term that does not exist** in the corpus. Confirms telemetry distinguishes a true empty result.                                     | any search tool                                                                             | **0 / true**                                                   |
| T7  | `Search my tasks in Aurora Field Notes for "pH".`          | **Bait:** explicitly asks to search _tasks_. Does the agent reach for the legacy `search_onto_tasks` despite the funneling rewording? | `search_onto_tasks` / **legacy** (the thing we're watching for) OR `search_project` / smart | ≥1 / false                                                     |
| T8  | `Look across everything for "ESP32".`                      | Broad single rare token                                                                                                               | `search_all_projects` / **smart**                                                           | ≥1 / false                                                     |

### What to record per row

For each Tn, capture from the log line:

- `tool` and `family`
- `resultCount`, `zeroResult`
- `durationMs`
- Whether the agent ran **more than one** search for a single prompt (multiple log lines), and in
  what order (e.g. a discovery `tool_search` then the real search).

A blank results table to fill in:

```
T#  tool                  family  resultCount  zeroResult  durationMs  notes
T1
T2
T3
T4
T5
T6
T7
T8
```

---

## 3. Confirm it persisted (closes the audit's §4 gap)

The dev log proves the call happened; this proves the **columns are now written** (the thing that
was broken). Run after the session, swapping in your `session_id`:

```sql
select sequence_index, tool_name, result_count, zero_result, execution_time_ms,
       arguments->>'query' as query
from chat_tool_executions
where session_id = '<YOUR_SESSION_ID>'
  and result_count is not null          -- search rows only
order by created_at;
```

You should now see **non-null** `result_count` for every search row (this query returned **zero
rows across the whole table** before the fix). `zero_result = true` should appear only for T6.

Then the two audit §5.2 questions, scoped to this session (or run global once real traffic
accumulates):

```sql
-- Which family did the agent actually pick?
select tool_name, count(*)
from chat_tool_executions
where session_id = '<YOUR_SESSION_ID>' and result_count is not null
group by 1 order by 2 desc;

-- Zero-result rate by tool
select tool_name, count(*) searches, avg(zero_result::int) zero_rate
from chat_tool_executions
where session_id = '<YOUR_SESSION_ID>' and result_count is not null
group by 1 order by zero_rate desc;
```

---

## 4. What the results tell us (decision map)

- **T7 picks `search_onto_tasks` (legacy):** the rewording funnel (§3.3) isn't enough — the agent
  still reaches for per-entity tools when the user names an entity type. → Evidence to _remove_
  Family B from discovery, not just reword it (audit §5.2).
- **T7 picks `search_project` (smart):** funnel is holding even under bait. → Family B is
  deprecation-safe; proceed to delete per §5.2.
- **T2 returns 0:** the §3.4 body-indexing fix didn't take (or the smart path isn't being used for
  bodies). Investigate before trusting body search.
- **T5 returns 0 (typo):** confirms the no-fuzzy-on-body limitation (§5.5). Acceptable, but now
  measured rather than assumed.
- **`search_onto_goals/plans/milestones/risks` never appear** in any real chat run: chat
  deprecation candidates, but not free to delete from the shared registry until the external
  BuildOS Agent API impact is resolved (production chat telemetry shows these at **0 calls**).
- **Any search emitting multiple log lines per prompt:** round-trip cost (§5.3) is real and
  observable; weigh against keeping Family B.

Record the run date, the project id, and the filled table back in this doc (or a dated copy) so we
have a baseline to compare against once the fix is deployed and real traffic accrues.

---

## 5. Related

- `AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md` — the audit (§5.2 deprecation decision, §5.9 dashboard).
- `src/lib/services/agentic-chat/tools/core/search-telemetry.ts` — `searchTelemetryColumns`, `searchToolFamily`.
- `src/routes/api/agent/v2/stream/+server.ts` — live persistence + dev `[search]` log.
