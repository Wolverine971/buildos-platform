<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-F-guards-compaction-reads.md -->

# WP-F-guards-compaction-reads — receipt

Audit: `docs/technical/reviews/AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08.md`. Package definition:
`evidence/work-packages.json` → `F-guards-compaction-reads`. Findings F12, F13, F15, F113, F85, F19.
All changes are unstaged in the working tree; nothing was committed.

## Per finding

### F12 — sanitizer re-join flattened lists/tables and dropped short sentences (P1) — FIXED

`packages/agentic-chat-runtime/src/loop/assistant-text-sanitization.ts`

- `sanitizeAssistantFinalText` now calls a new `removeScratchpadSentences` instead of split → filter →
  `join('\n\n')`. It walks the reply line by line, splits each line on the same sentence boundary
  (now captured so the original separator survives), drops only the matched sentences, and re-joins
  with the original separators. Lines with no removal are pushed byte-for-byte. A line whose every
  sentence was scratchpad is removed together with the blank line that followed it (`\n{3,}` → `\n\n`).
- List markers (`- `, `* `, `1.`, `(1)`) are peeled off the line before sentence splitting and
  re-attached to the first surviving sentence, so "1. Confirm creation with ID. Then the task list
  follows." keeps its `1.`.
- The `< 8 chars` sentence filter is gone from the final-text path (it still applies inside
  `sanitizeToolPassLeadIn`, which picks one sentence for a lead-in). Dedup of an identical sentence
  is kept (the Grok double-draft case).
- The pattern list is untouched (lane A decides), plus one anchored pattern `^\s*context gathering\s*:`
  for the merged F19 message (see F19).
- Tests (`assistant-text-sanitization.test.ts`): flipped the one assertion that pinned the `\n\n`
  re-join ("Updated it. The task is now in progress." keeps its space); added the lane-A fixture
  (`evidence/lane-A-sanitizer-false-positive-test.ts`) as a regression test pinning header + bullet
  structure, plus table rows, numbered-list marker retention, and decimal / short-sentence retention.
  The three single-line lane-A fixtures are pinned to the current pattern outcomes and labelled as
  lane A's call.

Left alone: the sanitizer still runs at three call sites (guard, final text, history admission on
web). Call sites are outside this package.

### F13 — finalization guard replaced a short correct read answer (P2) — FIXED

`packages/agentic-chat-runtime/src/loop/finalization-guard.ts`

- `isLikelyLeadIn` now requires an actual lead-in shape opening a sentence
  (`i'll | i will | let me | i'm going to | i am going to | one moment | hang on | give me a moment`,
  optionally after `first,` / `sure` / `got it` / `ok`…), no terminal `?`, ≤ 260 chars, and none of the
  completion words. The bare verb list (`check|look up|inspect|pull up|search|find|update|create|make|verify`)
  and `give me` no longer qualify on their own.
- The empty-reply branch (`empty_after_reads` evidence synthesis) is unchanged.
- Tests: added must-not-replace fixtures ("You have 3 open tasks; check the Q3 plan for the rest.",
  "Nothing is overdue. The inspection is next, Oct 5 — want me to update it?", two more) and
  must-still-replace fixtures ("I'll look that up now.", "Sure! Let me pull up the project first.",
  "First, I'll check…", "One moment while I read…"), plus the empty-reply branch.

Residual: a genuine mid-answer promise ("Nothing is overdue. I'll flag it when it's closer.") still
counts as a lead-in because the shape opens a sentence. The audit's fixtures do not exercise this.

### F15 — lead-in prose glued to the final answer (P3) — FIXED (verifier version)

`apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`

- One rule, as the verifier asked: the stream state tracks whether the last prose emitted to the
  user ended without whitespace (`emittedTextOwesSeparator`), and every emission goes through
  `state.textDelta(text, continuesPass)`. The first text of any later pass is prefixed with `\n\n`
  when the previous pass's text ended mid-line and the new text does not start with whitespace.
  This covers the held-candidate flush at the tool step, the live-stream path, the end-of-pass
  release of withheld prose, forced synthesis, the receipt fallback and the review-failure text.
- Lead-ins are not rerouted to activity-log semantics (verifier: no UI change, no benefit).
- Tests (`apps/worker/tests/agenticChatTurnProvider.test.ts`): flipped the two text_delta expectations
  in "continues sequential read rounds with compacted durable feedback" (now `\n\nI need one more
detail.` / `\n\nThe project and its second read are ready.`) and added "separates a held lead-in
  from the next pass and never separates whitespace-terminated prose" (held flush on a
  disposition-offering surface; a lead-in ending in `\n` gets no extra separator).

### F113 — 6,000-char guard produced cut JSON strings; overview tools had no compactor (P1) — FIXED (verifier version)

`packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts`

- `applyToolPayloadSizeGuard` is structural: no JSON-string preview anywhere. Over budget it clones
  the payload and (1) shrinks long string leaves proportionally to a 240-char floor, (2) drops trailing
  items from the largest array and writes `<key>_omitted: N` on the parent, (3) shrinks strings to a
  120-char floor, (4) drops the largest optional top-level keys (`omitted_keys`), recursing into a
  gateway `result`/`data` envelope; then marks `payload_truncated: true` + `payload_original_length`.
  Notice keys, `message`, `error`, `ok`, `op`, `status`, `query`, `theme`, `match`, `scope`, `found`,
  `result`, `data` are never dropped.
- Every ontology/email/document compactor now fits to `TOOL_COMPACT_TARGET_CHARS` =
  `MAX_MODEL_TOOL_PAYLOAD_CHARS − 400` (the same margin the web path already used), so the outer
  guard inside `addToolResultSecurityNotice` never fires on a compacted payload. `WEB_COMPACT_TARGET_CHARS`
  shares the margin constant.
- Search (`search_project`/`search_all_projects`/`search_ontology`, and now `explore_project`): results
  carry `priority`, `start_at`, `due_at`, `updated_at`, `bucket_key`, `chunk_anchor`; the snippet is
  ≤ 200 chars and shrinks (to 80) before results are dropped; `path`, `matched_fields`, `why_matched`,
  `ranking_factors`, `rank_score` are gone (boilerplate / derivable). explore_project keeps `theme` and
  its `projects` groups.
- New compactors: `get_workspace_overview` (per-project `entity_counts` merged into `counts` as
  `total_tasks/documents/plans/goals`, `entity_totals` merged into `totals`, activity ≤ 2 items with
  ≤ 120-char text and no actor id / change source; prose shrinks, then activity items go, then the
  structural guard drops projects), `get_project_overview` (same count merge, collaborators without
  `role_description`, activity bounded), `list_onto_tasks` (no `props` blob — `facets` kept —
  description ≤ 200), and `create_onto_document` / `update_onto_document` receipts (document body
  replaced by `content_length` + ≤ 300-char `content_preview`, `props.body_markdown` dropped).
- `request-builders.ts` replay is untouched (Finding 11 addendum).

`packages/agentic-chat-runtime/src/tools/overview-helper.ts` (source bounds)

- `description` and `next_step_short` ≤ 200 chars (`boundText`), workspace per-project activity
  `ACTIVITY_LIMIT` 3 → 2, activity description ≤ 200, project overview activity limit is its own
  constant (5, unchanged).
- `entity_counts` / `entity_totals` stay in the SOURCE payload because
  `apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts`
  (not owned) pins them; the duplication is removed in the model payload by the compactor. See handoffs.

Tests: `tool-payload-compaction.test.ts` gained a "structural size guard" block — 8-project workspace
overview stays 8 projects under 6,000 (excluding `record_references`), 12 × 700-char search results
stay structured with scheduling fields, explore_project, list_onto_tasks props/facets, project detail
with 30 described tasks, a 9k document section trimmed (not JSON-cut), an unknown 60-item list
dropping items with `goals_omitted`, the ~5,800-char pre-notice case, and the document receipt.
`overview-helper.test.ts` pins the source bounds.

Observed while testing, not changed: `record_references` (up to 20 × ~180 chars) ride outside the
budget by design (`buildToolPayloadForModel` appends them after the guard), so a list-shaped result
can still total ~9.5k chars in the request. Worth a separate decision.

### F85 — calendar reads reported success while every source failed (P1) — FIXED (verifier version)

`packages/agentic-chat-runtime/src/tools/calendar-reads.ts`

- Success semantics kept (a calendar outage must not kill the turn; ontology events are still
  evidence). When zero Google sources were readable (`google_read.coverage === 'unavailable'`),
  `list_calendar_events` adds top-level `calendar_read_failed: true` and `error_code` (first source
  `reason_code`, e.g. `credentials_not_configured`, `credentials_unreadable`, `reconnect_required`,
  `calendar_port_unavailable`; a thrown provider read now records `provider_error`). Degraded reads
  (some sources) are not flagged.
- `get_calendar_event_details` gets the same flag when the host could not reach the provider
  (`reasonCode` present or no calendar port); a plain not-found event is not flagged.
  `get_project_calendar` gets it when the host has no calendar port.
- Tests (`calendar-reads.test.ts`): flag present on 0-of-2, credentials_not_configured, thrown read,
  and no-port cases; absent on complete, degraded, and not-found cases.

Telemetry columns (`zero_result`/`result_count`) are already `null` for `list_calendar_events`
(non-search tool). The queryable signal is now `result->>'calendar_read_failed'` /
`result->>'error_code'` on the persisted row. The adapter (`execution-adapter.ts`) and
`search-telemetry.ts` are not in this package — see handoffs. I11 (set the five Railway calendar
variables) is DJ's.

### F19 — two read-saturation ladders per round; dead branch (P2) — FIXED (verifier version)

`packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts`

- The 3/6/8 read-round count floor lives inside `evaluateStatus`
  (`READ_ROUND_COUNT_FLOOR` → narrowing/saturated/must_synthesize); status = max(count floor, round
  budget guard, novelty ladder). Mixed read+research rounds count toward the floor (no novelty
  signal); control-only rounds leave the ladder alone; write rounds reset `lastEmittedStatusRank`
  along with the novelty counters ("reset on any write round").
- The status never steps down between write rounds (`buildObservation` reports
  max(evaluated, last emitted)), which preserves the monotonic `readLoopRepairRank` behaviour the
  provider had; `forceSynthesis` follows the effective status.
- One message per round, one sentence per level, no counters:
  `Context gathering: narrowing|saturated|must synthesize. …` (keeps "do not gather more context").
  The sanitizer got the matching anchored pattern.
- The `roundsRemaining <= 2` guard is kept in the ledger on purpose: it is the only thing that makes
  `CHAT_MAX_TOOL_ROUNDS` a budget, and the two worker tests that pass a budget of 3 depend on it. The
  duplicate branch in the count ladder is deleted with the ladder.

`packages/agentic-chat-runtime/src/loop/read-loop-escalation.ts`

- `selectReadLoopRepairEscalation` deleted; the file is reduced to `READ_LOOP_REPAIR_RANK` (+ type)
  because `apps/worker/src/workers/agentic-chat/provider/repair-policy.ts` (not owned) still imports
  it for `contextSaturationRepairRank`. `read-loop-escalation.test.ts` deleted with the function.

`apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`

- Removed the second ladder call (`selectReadLoopRepairEscalation`, `buildReadLoopRepairInstruction`,
  `contextSaturationRepairRank`, `READ_LOOP_REPAIR_RANK`), `readLoopRepairRank` and the `readOps`
  set; `forceNoToolSynthesis = directSimpleMutationCompleted || ledgerObservation.forceSynthesis`.
- `DEFAULT_MAX_PROVIDER_ROUNDS` 16 → 12 (constructor default; production passes the config value).

Tests: new `context-gathering-ledger.test.ts` (count floor with fresh evidence each round, max of
novelty and count, monotonic status, write reset, mixed research rounds, budget of 3, over-budget
snapshot). Worker provider tests for the ladder ("emits monotonic context saturation…", "resets the
low-novelty ladder…", "uses the admission context snapshot…", both budget-3 tests) pass unchanged.

## Tests run

All as `pnpm --filter <pkg> exec vitest run <file>`, one at a time.

| Command                                                                                                    | Result                                                |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/assistant-text-sanitization.test.ts` | 27 passed                                             |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/finalization-guard.test.ts`          | 30 passed                                             |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/context-gathering-ledger.test.ts`    | 7 passed                                              |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/tool-payload-compaction.test.ts`     | 40 passed                                             |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/overview-helper.test.ts`            | 4 passed                                              |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/overview-reads.test.ts`             | 6 passed                                              |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/calendar-reads.test.ts`             | 34 passed                                             |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnProvider.test.ts`                      | 108 passed, 7 failed — all 7 pre-existing (see below) |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatProviderBoundary.test.ts`                  | 3 passed                                              |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatCalendarReadPort.test.ts`                  | 16 passed                                             |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTerminalTextIntegrity.test.ts`             | 7 passed                                              |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatReviewedTurnContract.test.ts`              | 20 passed                                             |

The 7 `agenticChatTurnProvider.test.ts` failures ("routes repeated invalid contracts…" ×4, "switches
the disabled-tool provider…" ×2, "projects every straightforward entity mutation…") are caused by
other sessions' in-flight edits to `turn-contract.ts`, `openrouter-client.ts` and
`mutationToolCatalog.ts` (`merge_instructions` removal). Verified by temporarily running those tests
with the HEAD versions of my three files (`turn-provider.ts`, `read-loop-escalation.ts`,
`context-gathering-ledger.ts`) swapped in: same 6 failures; the 7th asserts the mutation schema.
My files were restored byte-for-byte afterwards.

No typecheck or lint was run (integration agent). Prettier was run on every touched file.

## Handoffs (files not owned)

1. `apps/worker/src/workers/agentic-chat/provider/repair-policy.ts`: delete `contextSaturationRepairRank`
   (lines ~230-237) and its `READ_LOOP_REPAIR_RANK` import (line 3); no callers remain. Then delete
   `packages/agentic-chat-runtime/src/loop/read-loop-escalation.ts` and the
   `export * from './read-loop-escalation'` line in `packages/agentic-chat-runtime/src/loop/index.ts`.
2. `packages/agentic-chat-runtime/src/loop/repair-instructions.ts`: delete `buildReadLoopRepairInstruction`
   (lines ~613-720, including the `framing`/`pendingWriteCommission` branches) — no callers remain —
   and drop the `gatewayModeActive` parameter at ~476-485 if its callers pass nothing. Update
   `repair-instructions.test.ts` accordingly.
3. `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts:117`: optionally lower
   `DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS` 16 → 12 to match `MAX_PROVIDER_PASSES_PER_TURN` (the
   `apps/web/src/lib/services/agentic-chat-v2/limits.ts` comment says keep them aligned). Keep the
   plumbing; the budget-3 tests depend on it.
4. `apps/worker/src/workers/agentic-chat/README.md:83`: "read-loop repair policy" in `repair-policy.ts`
   no longer exists once (1) lands; the ledger is the single ladder.
5. `agentic:health` (script not in this package): count calendar outages as
   `result->>'calendar_read_failed' = 'true'` grouped by `result->>'error_code'` on
   `chat_tool_executions` where `tool_name = 'list_calendar_events'`. If a column is preferred,
   `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts:570` can persist
   `payload.google_read.coverage` next to `resultCount`/`zeroResult`.
6. `overview-helper.ts` source `entity_counts` / `entity_totals`: when
   `apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts`
   can be edited, drop `entity_counts.collaborators` (duplicate of `counts.collaborators`) or fold
   entity counts into `counts` at the source the way the compactor does, and update
   `overview-helper.test.ts` lines ~166-181 / ~365-371.
7. Separate decision: `record_references` (≤ 20 × ~180 chars) are appended after the size guard in
   `buildToolPayloadForModel`; a list result can still total ~9.5k chars in the request.

## Behaviour changes

- Sanitized replies keep their markdown structure; only matched sentences disappear. Replies that
  previously lost every sentence under 8 chars keep them.
- The finalization guard no longer replaces a short read answer that merely contains
  check/find/update/… or ends with a question; only sentence-opening promise shapes are replaced.
- Every subsequent pass's prose starts on a new paragraph when the previous pass's prose ended
  mid-line (worker text_delta stream). Persisted assistant text gains a `\n\n` at that seam.
- Tool results over budget are never JSON strings; they are trimmed structurally with
  `<key>_omitted`, `omitted_keys`, `payload_truncated`, `payload_original_length` markers. Search
  results lost `path`/`matched_fields`/`why_matched` and gained scheduling fields; overview payloads
  to the model have one merged `counts` block; task lists drop `props` (keep `facets`); document
  write receipts carry a preview instead of the body.
- Workspace/project overview source payloads: descriptions ≤ 200 chars, workspace activity ≤ 2.
- Calendar read payloads carry `calendar_read_failed` + `error_code` on a total outage.
- One read-saturation system message per round, without counters; the read-round count floor
  (3/6/8) now lives in the ledger. `DEFAULT_MAX_PROVIDER_ROUNDS` (constructor default only) is 12.

## Deliberately left alone

- Pattern list of the sanitizer (lane A decides), except the one `Context gathering:` anchor.
- The ledger's `roundsRemaining <= 2` guard (needed for `CHAT_MAX_TOOL_ROUNDS` and the budget-3 tests).
- `request-builders.ts` replay (Finding 11 addendum).
- Gateway meta compactors (`compactGatewayMetaPayload`: skills/domains/outcome cards) keep the 6,000
  default; they now degrade structurally too but were not the finding's subject.
- Throwing a typed permanent error on calendar unavailability (verifier: only after F55).
