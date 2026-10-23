<!-- docs/specs/PROPOSAL_CARD_RAIL_PLAN_2026-10-17.md -->

# Proposal-card rail, nest card, combine card: implementation plan

Tasker 122, work packages WP4 (rail + nest) and WP5 (combine). Written 2026-10-17 from a read-only
architecture pass. Line numbers are anchors as of 10-17; other sessions have uncommitted edits in
`AgentMessageList`, `AgentChatModal`, `build-lite-prompt` and the consolidation service, so find them
by symbol, not by line number.

**Product rules (DJ):**

- Chat _proposes_ and the user's click is the only consent.
- Nothing writes in the worker.
- Nest and combine each start a quick duplicate check automatically.
- Combine names who loses or gains access.
- The activity line reads "Needs your choice: …", never "Updated."
- Proposal tools never trigger a turn contract, a mutation reservation or the paid reviewer, and the
  turn ends on the card.

## 1. Rail architecture

**Decisions**

- **The card id is the `chat_tool_executions` row id.** It is stable and known before the tool runs:
  `createStableAgenticChatToolExecutionIdV1({turnRunId, sequenceIndex})` (`tools/tool-execution.ts`).
- **No migration.**
- **Leave the shared-document confirm card as it is.** It is born from a reviewed write, its pending
  edit is server-held, and it works in prod. Share only the turn-state predicate and the history
  filter with it.

**Contract.** New file `packages/shared-agent-ops/src/chat-cards/proposal-card.ts`. It must be
client-safe; add it to `tsup.config.ts` and the `package.json` exports.

- **Envelope:** `{card_rail:'proposal_v1', status:'proposal_ready', requires_user_action:true,
saved:false, card_id, kind, client_action:{kind:'proposal_card', card_kind, card_id, session_id,
expires_at, payload}, model_view, message, card_resolution?, card_undo?}`.
- **Non-card result:** `{card_rail, status:'blocked'|'no_change', kind, reason_code, message}`.
- **Kind registry:** `PROPOSAL_CARD_KINDS[kind] = {toolName, ttlMs: 24h, undoTtlMs: 7d, choices,
parsePayload, parseReceipt, describeResolution, noteMeaning}`.
- **Per-kind files:** `project-parent-card.ts` and `project-combine-card.ts`.
- **`visibleDigest(payload)`:** a pure hash over ids, counts and codes only. Never include
  timestamps or names, because the worker localizes them.

**Identity plumbing (worker)**

- `turn/executor-contracts.ts`: the read port input gets `toolExecutionId?`.
- `turn/read-tool-runner.ts`: pass `sequenceIndex` and send the computed id.
- `tools/execution-adapter.ts`:
    - `sharedContext.proposal = {toolExecutionId, sessionId, turnRunId, startDuplicateCheck}`, where
      `startDuplicateCheck` wraps WP3's `startConsolidationCheck` with a 1.5 s timeout and returns
      null on failure;
    - `requiresUserAction` is true for clarification **or** a proposal card.
- `AgenticChatSharedReadContextV1` (`tools/ontology-reads.ts`) gets an optional `proposal?`.
  Proposal tools throw without it, so no other host can mint cards.

**Memo.** `requires_user_action` already blocks memoization (`read-memo.ts`). Also remove the proposal
tool names from `READ_MEMO_ELIGIBLE_TOOL_NAMES` (`provider/feedback.ts`), because they start a
duplicate check.

**Resolver.** New `apps/web/src/lib/server/proposal-cards/proposal-card.service.ts`. It uses the admin
client for the ledger tables only. Steps:

1. Load the row by `id = card_id` and `session_id`.
2. Parse the envelope and check that it matches the row:
    - `tool_name === spec.toolName`;
    - `success` is true;
    - `card_id === row.id`;
    - `client_action.session_id` equals the row's session;
    - the ids in `row.arguments` equal the ids in the payload.
3. Load `chat_turn_runs` by `turn_run_id` with `user_id = user`. A miss returns 404. If the turn is
   unfinished, return 409 `TURN_IN_PROGRESS`.
4. Check the TTL from `row.created_at`. Expired returns 410.
5. Hand off to the kind handler (`proposal-cards/registry.ts`: `precheck`, `apply`, `undo`).

The row is a hint and never the authority. Every write runs under the user's own authority:

- **Nest:** `setProjectParent(locals.supabase, …)`, which checks `auth.uid()`.
- **Combine:** the fold RPCs receive the session user's id, and SQL re-checks admin on both projects.

So a forged row can only do what the user could already do in the UI. Confirm with a read-only
`--role-probe` whether `authenticated` can write `chat_tool_executions`.

**Single use.** Use resolution rows in `chat_turn_effects`, following the shared-doc pattern.

- **Row id:** sha256(`proposal_card_resolution_v1:{card}:{phase}`), with phase `decide` or `undo`.
- **Fields:** `turn_run_id` and `session_id` from the tool row; `execution_generation` from
  `chat_turn_runs`; `tool_name 'proposal_card'`; `operation_name 'proposal.{kind}.{choice}'`.
- **Duplicate click:** error 23505 means a claim already exists, so wait for it and return its
  result.
- **Release** the claim when nothing was written.
- **Abandoned claim:** one older than 2 minutes with no result settles as `unknown`.
- Put this in a new `proposal-cards/claim.ts`. Don't refactor the shared-doc service.

**Mirroring.** Read-modify-write `result.card_resolution` and `result.card_undo` onto the row. Any
later resolver call repairs a missing mirror from the ledger.

**History**

- New file `apps/web/src/lib/services/agentic-chat-v2/proposal-card-history.ts`:
    - `PROPOSAL_CARD_CONTINUITY_FILTER = and(result->>card_rail.eq.proposal_v1,result->>status.eq.proposal_ready)`,
      OR-ed into `CHAT_CONTINUITY_EXECUTION_FILTER` (`shared-document-edit-card-history.ts`). Both
      `session-service.ts` and `worker-turn-preparation.server.ts` already use that filter.
    - `proposalCardNotes(rows)` keeps the last 3 cards as `continuityKind:'proposal_card_v1'`, each
      with kind, subjects, state (pending/applied/cancelled/stale/unknown/undone),
      `duplicate_check_run_id` and the kind's meaning text.
- Wire it in:
    - `session-service.ts`: merge the notes in, and exclude proposal rows from the generic list.
    - `types.ts`: add the kind to the union.
    - `history-composer.ts`: keep both card kinds whole.

**Turn end, disposition and notice** (`provider/turn-state.ts`)

- Generalize `awaitingSharedDocumentConfirmation` into `awaitingUserCard()`. It is true for the
  shared-doc card **or** for `isPendingProposalCardExecution`, which lives in
  `loop/tool-classification.ts` next to `doesToolExecutionRequireUserAction`.
- Use it in all three gates and in `takeUnsavedCommissionNotice`.
- After a read round: if `dispositionPending(phase)` and the round produced a card, advance the
  disposition to `read_only`. The card _is_ the disposition.
    - Trade-off: a write requested in the same turn after the card is refused.
- `review/disposition.ts`: add one line: "A propose\_\* card tool is the only way to make that
  change; calling it makes the turn read-only. Never declare a contract for it."

**Compaction.** `loop/tool-payload-compaction.ts` `compactDirectToolPayload`: add a first branch
keyed on `card_rail`, not on the tool name. It returns `{status, saved:false, card_id, kind,
...model_view, message}`. Never send `client_action` to the model.

**Activity line.** `agent-chat-tool-presenter.ts`:

- `propose_project_parent` → "Nesting project", or "Detaching project" when the parent is null.
- `propose_project_combine` → "Combining projects". Add `Combining: 'combine'`, otherwise the
  generic rule produces "combin".
- The existing `requires_user_action` path then renders "Needs your choice to …".

## 2. `propose_project_parent` (WP4)

**Args:** `{project_id, parent_project_id: uuid|null, note?: ≤200 chars}`.

**Worker validation** lives in the new `packages/agentic-chat-runtime/src/tools/proposal-reads.ts`.
It uses `access.getActorId()`, the family RPC (service role plus `p_actor_id`) on both projects, and
admin checks through `access.assertProjectAccess(…, 'admin')` wrapped to a boolean.

- **Attach** needs admin on both projects. It is blocked when:
    - the project is its own target (`parent_self`);
    - the target is archived or deleted (`parent_not_found`);
    - the target already has a parent (`parent_is_a_child`);
    - the child's `family.child_count > 0` (`has_children`). The count includes archived children,
      and the message says so.
- **Detach** uses the parent's `family.parent.can_detach` (admin on either side).
- **Already in place:** return `no_change` with no card.

**Payload:**

- `{project, from_parent, to_parent, child_only_members}` (up to 5 names plus a count).
- `effects[]` codes: `nothing_moves`, `no_access_change`, `leaves_previous_parent`,
  `creates_shared_folder` (when the parent has no shared folder yet).
- `duplicate_check`, covering the child plus the parent, attach only.

**Resolve**

1. Precheck the family with the session client. If the current parent is no longer `from_parent`,
   resolve as `stale`.
2. Claim the card.
3. Call `setProjectParent` and map errors with `toProjectHierarchyError`:
    - access denied or admin required → release the claim, return 403, card stays open;
    - self, is-a-child, has-children or not-found → `stale`, with the mapped text;
    - anything else → `unknown`.

**Undo** (7 days, with its own claim): restore `previous_parent_project_id`, but only if the current
parent still equals the target; otherwise `stale`. Clearing a parent needs admin on either side;
re-attaching needs admin on both, and the card says so.

## 3. `propose_project_combine` (WP5, after WP2 is applied)

**Args:** `{source_project_id, destination_project_id, note?}`. Member policy is chosen on the click,
never by the model.

**Worker validation**

- Admin on both projects, the projects differ, the source has no `merged_into_project_id` and no
  sub-projects (`child_count`).
- Then call `onto_project_fold_preview(p_user_id = userId)` with the service client and map it
  through `parseFoldImpactV1`.
- **Blockers the user can't fix from chat** return `blocked` with no card: limits,
  `table_policy_incomplete`, recurring items, `calendar_sync_not_deployed`.
- **Blockers the user can fix** (upcoming events, a pending proposal) return a card with the main
  button disabled and "Check again". `model_view` lists the blockers so the model can offer help.
- Cap every list at 20 items.

**Card data comes from the worker's preview.** The model needs the blockers and members to write a
useful reply, and the card renders instantly, including after a reload. Staleness is caught at click
time and by "Check again" (`GET …/preview`).

**Payload:**

- Counts by kind.
- The "From <source>" folder title.
- The source is archived with a forwarding link, and chats follow.
- `members_missing`, each with `removable` (owners can't be removed).
- Past events that stay behind (listed) and upcoming events that block (named).
- `checked_at` and `duplicate_check`.

**Click.** Choices are `combine_remove_members`, `combine_add_members`, `combine` and `cancel`. The
body carries `seen_digest`.

1. Run a fresh preview. If its digest differs from `seen_digest`, return 409 `PREVIEW_CHANGED` with
   the fresh view. Nothing is claimed or changed.
2. Claim the card.
3. If removing members, remove each one with `removeProjectMember`. Extract it from
   `routes/api/onto/projects/[id]/members/[memberId]/+server.ts` into
   `lib/server/project-members/remove-member.ts`, and have the route delegate to it (no behavior
   change).
4. Preview again and require the same counts with no blockers.
5. Apply with `fold_id = uuid(sha256('proposal_fold:'+card))`, which makes the apply idempotent.
    - On `unknown`, look up the manifest to decide what happened.
    - On `stale_preview`, retry once if the digest still matches.
6. Settle the claim and mirror `fold_id` plus the members removed or added.

If members were removed but the fold failed, the card says so plainly.

**Undo**

- `GET …/undo-preview` runs the unfold preview: what comes back and what stays.
- `POST …/undo {seen_digest}` runs the unfold apply.

The card states the limits:

- one undo only;
- groups edited since the combine stay;
- people removed before combining aren't re-added;
- people added stay.

**Web fold service:** `lib/server/project-fold/project-fold.service.ts`, with `preview`, `apply`,
`unfoldPreview`, `unfoldApply` and error mapping, following `organize-service.ts`. It prechecks admin
with the session client.

**Merged-source protection.** This is a separate step and must land before WP8:

- `routes/projects/[id]/+page.server.ts` calls `get_project_route_redirect` and redirects.
- `op-execution-gateway.access.ts` refuses gateway writes to a merged `project_id` (MCP connectors
  and worker writes).

## 4. Routes and components

**Routes:**

- `POST /api/chat/proposal-cards/[id]`
- `POST /api/chat/proposal-cards/[id]/undo`
- `GET /api/chat/proposal-cards/[id]/preview`
- `GET /api/chat/proposal-cards/[id]/undo-preview`

**Components**

- `proposal-cards.ts`: extract, collect and place cards (copied from `placeSharedDocumentEditCards`),
  plus the `choose`, `undo` and `preview` fetchers.
- `proposal-card-state.svelte.ts`: a `SvelteMap`.
- `ProposalCard.svelte`: the shared frame and state machine (`tx tx-frame tx-weak shadow-ink`).
- `ProjectParentProposalBody.svelte`: uses `tx-thread`.
- `ProjectCombineProposalBody.svelte`: blockers use `tx-static`; members are a radio group.
- `DuplicateCheckStrip.svelte`:
    - polls `GET /api/consolidation/runs/[id]` every 3 s, using `$effect` with cleanup;
    - stops after 40 polls and pauses while the tab is hidden;
    - uses WP3's summary function;
    - links to `/projects/[root]/consolidate/[run]`.

**Wiring**

- `AgentMessageList.svelte`: derive the placements and render them next to the shared-doc card
  group.
- `AgentChatModal.svelte`: `handleProposalCardResolved` clears the prewarmed prompt and records a
  project change, so open views refresh.
- Icons: add `GitMerge` and `UserMinus` to `$lib/icons/lucide`.
- Mobile: buttons are `min-h-11` and stack with `flex-col sm:flex-row`; events and members go in
  `<details>`; the card is `w-full max-w-xl`.

## 5. Tests

**Free (narrow vitest files)**

- **Contract:** `chat-cards/*.test.ts` covering parsing and digest stability.
- **Worker validation:** `proposal-reads.test.ts`:
    - the full nest block matrix, including an archived child via `child_count` and detach from
      either side;
    - combine's hard vs fixable blockers;
    - duplicate-check failure is tolerated;
    - a missing identity throws.
- **Classification, compaction and catalog:** `tool-classification`, `tool-payload-compaction`,
  `registry` and `surfaces` (on the global surface, not the project surface), `worker-tool-policy`.
- **Worker turn:**
    - `turn-state`: a card makes the turn read-only, with no notice, no continuation or fallback,
      and no memo;
    - `execution-adapter`;
    - `jev-tool-selector`.
- **Web resolver:**
    - `proposal-card.service.test.ts`: double click, foreign session, `TURN_IN_PROGRESS`, 410,
      release on 403, mirror self-repair, the undo claim;
    - the combine handler: digest 409, member removal then preview then apply, stale retry,
      `fold_id` replay;
    - `project-fold.service`.
- **Web UI and history:** `proposal-cards.test.ts`, `ProposalCard.test.ts` (fake timers), presenter
  labels, `proposal-card-history`.
- **Budgets:** re-baseline `agenticChatWorkerSurfaceBudget`, `tool-surface-size-report` and
  `prompt-size-budget`, each with a dated comment.

**Paid live check (DJ OK required)**

1. Run `--preflight-only` first and confirm the acting model.
2. Create throwaway projects with no description: ZZ Parent/Child and ZZ Src/Dst. Give each 1 doc
   and 1 undated task, plus one near-duplicate doc.
3. Run global turns:
    - nest → click → breadcrumb appears → Undo;
    - combine → click → the source redirects → Undo;
    - reload and ask "did it work?" to exercise the history note.
4. Soft-delete all four with `soft_delete_onto_project`.

Estimated cost: about $0.06–0.10.

## 6. Build order, risks

| #   | Step                                                                                                                                                                                                                 | Size    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Contract + kind registry                                                                                                                                                                                             | 0.5 d   |
| 2   | Runtime: catalog wiring (`definitions/proposals.ts`, metadata, registry op `onto.project.parent.propose`, taxonomy, global-only surface, storage `'workspace'`, dispatch), nest executor, compaction, memo exclusion | 1 d     |
| 3   | Worker: identity plumbing, `tool-surface.ts` op exceptions, Jev supporting tools, turn-state and gate, budgets                                                                                                       | 1 d     |
| 4   | Web rail: resolver, routes, history, presenter, nest UI. Swap the WP1 prompt line to "propose it with propose_project_parent"                                                                                        | 1.5 d   |
| 5   | (after WP2 is applied) Fold service, member-removal extraction, combine executor, handler and UI, duplicate-check strip                                                                                              | 2.5 d   |
| 6   | Merged-source redirect + write refusal                                                                                                                                                                               | 0.5–1 d |
| 7   | Paid live check                                                                                                                                                                                                      | 0.25 d  |

Never add the proposal ops to `EXTERNAL_OP_HANDLERS`, so the MCP connectors can't reach them.

**Risks**

1. **A contract declared before the card.** If the model declares a contract with a "nest" outcome
   before calling the proposal tool, the turn can still try to write. Mitigation: the gate line plus
   a turn-state fixture test.
2. **No budget headroom.** If Jev doesn't pick the tool, no card appears, so metadata quality
   matters.
3. **Half-done combine.** If members are removed and the fold then fails, people have lost access
   but nothing combined. The card must say so.
4. **The tool row is client-visible and possibly client-writable.** This is safe by construction;
   confirm with the role probe.
5. **Fold readiness.** It depends on WP2 being applied, on WP6 (calendar flag) and on email inbound
   keys. Merged-source protection must land before WP8. WP3's start must reuse a recent check for the
   same project set.
