<!-- docs/architecture/JEV_SPECIALIST_SHADOW_2026-09-20.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-20; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

<!-- doc-health: ignore-schema — chat_turn_specialist_selection_shadows exists (migration 20260920041644) but is missing from generated types -->

# Jev specialist and tool shadow selection

**Rollout update:** Enabled for DJ's internal cohort on September 20 after applying the audit
migration. Two synthetic production UI runs recorded successful Jev observations (201/224 ms),
with $0.00014889 total selector cost. See the
[production rollout record](../technical/reviews/SPECIALIST_PILOT_ROLLOUT_2026-09-20.md)
for deployment IDs, workflow costs, restoration checks, quality limitations, and rollback.
The implementation-time "local only" statements below are historical.

Jev now has a default-off shadow path in durable project reviews. It judges which supported
specialist/tool bundle fits the request and saves a comparison with the fixed workflow.
The fixed workflow still executes: a shadow result cannot start agents, load tools, change
instructions, grant permissions, or replace the answer.

## What it compares

| Bundle               | Agents                                | Specialist tools         | Eligibility                                          |
| -------------------- | ------------------------------------- | ------------------------ | ---------------------------------------------------- |
| `generalist`         | No specialist review                  | None granted             | Always a counterfactual option                       |
| `project_review`     | Project analyst + risk reviewer       | None                     | Current review contract                              |
| `document_inventory` | Document organizer v1 + risk reviewer | None                     | Specialist workflows enabled                         |
| `document_read`      | Document organizer v2 + risk reviewer | `read_project_documents` | Specialist workflows and document-read tools enabled |

This compares the supported bundles, not an arbitrary agent graph. Every candidate records exact
specialist versions, definition hashes, expertise and its bounded tool list. When a saved document
profile is the baseline, its saved definition is used rather than the current registry definition.
The generalist choice is diagnostic; an explicit review is never silently downgraded to ordinary chat.

One typed Jev `choice` question returns a bundle and probabilities for all eligible bundles.
It uses the existing `JevClient` / `typesafe/jev-1.13` decisions endpoint. State contains a bounded
question, project name/description, inventory counts, coverage, and candidate metadata. It contains
no document bodies, document titles, conversation history, specialist system prompts, or baseline
choice. The baseline is compared only after the judgment to avoid prompting Jev to agree.

The versioned policy uses a provisional top probability of 0.65 and margin of 0.15. Close rankings
record the raw choice but recommend keeping the baseline. Confidence is retained separately and
never used as accuracy. Invalid choices, incomplete distributions, invalid sums, nonfinite values,
and a choice below the highest probability produce an unavailable receipt.

## Durability and failure behavior

The worker observes selection after accepting context and rechecking access, before starting the
planner. Its provider-ready timing includes the shadow delay.

1. `begin_agentic_chat_specialist_shadow_v1` checks service role, the current queue lease,
   execution generation, cancellation, deadline, project access, and accepted context.
2. A private `chat_turn_specialist_selection_shadows` row stores the exact selection input,
   request/context binding, baseline, policy version, and canonical SHA-256 hash. Only the first
   confirmed claim permits a Jev call. Replays return `already_recorded` and never permit another.
3. The worker makes one decision request, with retries disabled, a 16,000-byte request bound,
   and a 1.2-second deadline. Each database call is bounded to 600 ms; preparation bounds the
   whole optional hook to 2.5 seconds. Near a workflow/invocation deadline, shadow work is skipped.
4. `finish_agentic_chat_specialist_shadow_v1` saves a single bounded result and hash using its
   private attempt token. It records the raw choice, host recommendation, disagreement,
   probabilities, confidence, margin, model/request IDs, latency, token counts and reported cost.
   Raw provider responses, exception text, and provider error bodies are not stored.
5. Recovery keeps the existing row. If a claim receipt was lost, no call is made. If the worker
   died before saving the result, the row stays incomplete rather than triggering another call.
   A late result can finish its own audit row after a generation ends; it cannot affect execution.

An unavailable or missing observation does not break the fixed review. Parent cancellation still
propagates. Missing results have unknown provider outcomes and potentially unknown cost; they are
not interpreted as zero-cost successes. Input fields are immutable and the result can be set only
once. RLS is enabled; browser roles cannot read or write the table. Retention follows the parent
workflow through its cascading foreign key.

## Cost and rollout

**Shadow evaluation is additional cost outside the existing workflow dispatch budget.** The
existing Deepseek workflow ledger and its $0.25 ceiling remain unchanged. Selector usage/cost is
recorded in the shadow receipt; it is not added to the workflow's customer usage/billing records.
There is no new advertised dollar ceiling for Jev. The bounds are one attempt per run, request
size, and deadline. Keep this confined to the existing internal cohort when evaluating live.

Migration: `supabase/migrations/20260920041644_agentic_chat_specialist_selection_shadow_v1.sql`.
It adds a private audit table, guard, claim RPC, and result RPC; it changes no existing workflow SQL.
It has only been exercised in disposable local PostgreSQL. All three specialist migrations remain
local in this task; deployment state must be checked separately.

Worker configuration: `AGENTIC_CHAT_JEV_SPECIALIST_SELECTION=off|shadow`, default `off`. `on` is
rejected because this implementation has no routing authority. Deploy the migration and compatible
worker code before opting into `shadow`. Existing workflow preparation/execution gates and the
internal user cohort still apply. Document candidates require their separate capability flags.
Turning shadow off removes both its database work and provider calls; existing receipts remain.
No web flag, UI change, production setting, or hosted database was changed by this implementation.

## Inspect without making model calls

```sh
pnpm --filter @buildos/worker specialists:shadow-report --demo
pnpm --filter @buildos/worker specialists:shadow-report --file /path/to/receipts.json
```

The first command demonstrates the comparison with clearly labelled scripted values. The second
reads a local JSON array exported from the audit table. It verifies hashes, rejects duplicate runs,
and reports choices, tool bundles, agreement, uncertainty, duration, known cost, and unknown cost.
The report omits the private request text. Both commands read no credentials, database, or model API.

A read-only export query for a deliberately chosen run set:

```sql
SELECT turn_run_id, input, input_hash, result, result_hash
FROM public.chat_turn_specialist_selection_shadows
WHERE turn_run_id = ANY (ARRAY['<run-uuid>']::uuid[])
ORDER BY created_at;
```

Hashes detect accidental corruption of an export; they are not proof of its source. An agreement
rate is not selection accuracy. Add human labels and outcome notes before using these observations
to choose thresholds or promote routing.

## Verification and next boundary

Scripted unit and real disposable-PostgreSQL tests cover candidate eligibility, saved definitions,
private-context omission, probability validation, uncertainty, typed Jev transport, provider failure,
hard timeout, default-off behavior, cancellation, access/generation fences, input/hash binding,
immutable private receipts, lost claim responses, restart reuse, offline reporting, and unchanged
fixed execution on a disagreeing Jev result. No paid inference or full hosted Agentic Chat gate ran.

Validation passed: **91 focused tests** (14 selector/report/observer, 14 configuration,
29 preparation/context, 27 workflow runner, 7 disposable PostgreSQL integration), worker
typecheck, and the offline report command. Preparation tests were repeated after moving the
shadow hook ahead of the provider-ready timing event. The full gate remains deferred by DJ.

Next: collect a small labelled shadow sample after an authorized rollout, then decide whether
Jev's routing proposals help. Actual routing needs a new explicit selection/execution contract that
pins the chosen bundle and effective capabilities before planning. Specialist authoring, knowledge
loaders, arbitrary agent graphs, and additional custom tools remain separate implementation steps.
