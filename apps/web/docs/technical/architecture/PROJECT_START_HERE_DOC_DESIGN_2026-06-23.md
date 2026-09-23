<!-- apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md -->

# Project "START HERE" Context Document - Design

**Status:** Implemented - initial end-to-end path
**Date:** 2026-06-23
**Last Updated:** 2026-09-23
**Owner:** DJ
**Scope:** One continually maintained orientation document per project. This is the canonical first stop for an AI agent or human trying to understand what is going on in the project.
**Companion:** [`PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md`](./PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md)

---

## 1. Intent

BuildOS already has structured project state: goals, milestones, plans, tasks, documents, members, events, project logs, and a document tree. That is necessary, but it does not tell an agent the "lay of the land": why this project exists, what has already been decided, what not to do, what changed recently, and where the important detail lives.

The Start Here document fills that gap. It is similar to a daily brief, but scoped to one project and optimized for agent orientation. It should answer:

- What is this project and what does "done" mean?
- What is intentionally out of scope?
- What decisions are settled, and why?
- What was recently worked on in BuildOS?
- What is next?
- What vocabulary, mental model, and document map should an agent use before exploring?

The document is not a replacement for the project graph, document tree, or retrieval tools. It is the entry point that tells the agent which graph/doc detail is worth loading.

---

## 2. Current Architecture Facts

This spec must use the current data model, not the legacy context-document wiring.

| Area                        | Current truth                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical document identity | `onto_documents.project_id = <project_id>` and `onto_documents.type_key = 'document.context.project'`                                                 |
| Legacy pointer              | `onto_projects.context_document_id` was dropped by `20260428000018_cleanup_legacy_context_document_column.sql`                                        |
| Legacy edge                 | `has_context_document` project-to-document edges were deprecated/removed by `20260529000000_deprecate_direct_project_edges.sql`                       |
| Existing project APIs       | Resolve the context document by `project_id + type_key`, including `apps/web/src/routes/api/onto/projects/[id]/+server.ts` and `[id]/full/+server.ts` |
| Chat context today          | Fast project context loads a bounded Start Here body for project/ontology contexts                                                                    |
| Prompt today                | `focus_purpose` carries important workflow and safety-adjacent guidance; it must be preserved                                                         |
| Daily brief today           | Loads bounded Start Here excerpts for project brief generation                                                                                        |

**Architectural correction:** do not revive `onto_projects.context_document_id` or `has_context_document`. The Start Here document is a normal ontology document with the canonical project context type key.

---

## 3. Locked Decisions

| Fork             | Decision                                                                                                                           | Consequence                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Data model       | Use `type_key='document.context.project'` on `onto_documents`                                                                      | No schema revival, no legacy edge, no project-row pointer.                                          |
| Ownership model  | Hybrid authored + managed regions                                                                                                  | Humans/agents own orientation prose through staged edits; machines own deterministic fenced blocks. |
| Prompt injection | Add a guarded `project_start_here` section before `focus_purpose`                                                                  | The document becomes the orientation entry point while existing workflow guardrails remain intact.  |
| Capture          | Checkpoint capture applies additions and the Current state snapshot; removed or reworded lines are proposed for review (tasker/95) | Thinking lands without a review step, while nothing the user wrote is deleted or reworded silently. |
| Managed refresh  | Deterministic pure merge only                                                                                                      | No LLM in managed regions; idempotent updates can run after snapshot refreshes.                     |

---

## 4. Document Anatomy

The document should capture what structured tables cannot.

```markdown
# START HERE - {Project Name}

<!-- managed:status v=1 -->

**State:** Active
**Now:** 23 open tasks, 4 overdue, next milestone Beta on 2026-07-04.
**Next step:** Review staged Start Here capture proposals and apply useful authored updates.

<!-- /managed:status -->

## What this is

> _authored - capture target_
> One paragraph: what this project is and what "done" looks like.

## Non-goals

> _authored - capture target_

- Things we are deliberately not doing, with the reason in brief.

## Current state

> _authored - capture target_
> 2-4 sentences: what just happened, what is in progress, and what is blocked.

## Decisions

> _authored - capture target_

- **Decision** - one-line rationale. _(YYYY-MM-DD)_

## Vocabulary and mental model

> _authored - capture target_

- **Term** - what it means in this project.

## Open questions

> _authored - capture target_

- Live question we have not resolved.

<!-- managed:map v=1 -->

## Where the detail lives

- Product/ - Architecture, Roadmap
- Marketing/ - GTM Plan, Audience Notes
  _(Auto-generated from the project knowledge map. Use get_document_outline, then read_document_section to drill in.)_
    <!-- /managed:map -->
```

Rules:

- Authored sections lead because they contain intent, decisions, non-goals, and mental model.
- Managed sections stay thin and deterministic.
- The map is a pointer index, not a copy of the document tree or all document content.
- Managed regions must never contain prose copied from authored sections.

---

## 5. Managed Regions

Managed regions use HTML comment fences:

```markdown
<!-- managed:{name} v={n} -->

machine-owned content

<!-- /managed:{name} -->
```

`mergeStartHereManagedRegions(currentBody, regions)` must:

1. Replace only known managed regions.
2. Preserve everything outside managed fences byte-for-byte where possible.
3. Reinsert missing managed regions at canonical positions: `status` after the H1, `map` at the bottom.
4. Return the original string unchanged when the merge is a no-op.
5. Avoid volatile per-run content in prompt-injected slices. If a refresh timestamp exists, keep it outside the injected budget or strip it from the prompt excerpt.

The merge function is pure and lives in shared code so web and worker use identical behavior.

---

## 6. Lifecycle

### 6.1 Creation and Backfill

On project create, explicit backfill, managed-region refresh, or session-end capture:

1. Query for an active document where `project_id = project.id` and `type_key = 'document.context.project'`.
2. If missing, create one from the canonical template.
3. Do not create `has_context_document` edges.
4. Do not write a project-row pointer.
5. Optionally seed `What this is` from `onto_projects.description`, clearly as draft authored text.

The chat context loader only reads the document; it does not create documents as a side effect of opening project chat. Backfill does the same ensure operation in batches for existing projects.

### 6.2 Managed Refresh

After `build_project_context_snapshot` computes fresh project context:

1. Load the Start Here document by `project_id + type_key`.
2. Render `status` from structured project/snapshot fields.
3. Render `map` from `doc_structure`.
4. Merge with `mergeStartHereManagedRegions`.
5. Persist only if changed.

**Producers (who enqueues `build_project_context_snapshot`):** the snapshot worker
is the consumer; the refresh only runs when the job is enqueued. As of 2026-06-24
these producers are wired:

- **Project create** — the instantiate route (`/api/onto/projects/instantiate`) and
  the calendar-suggestion accept path both call `queueProjectContextSnapshot(..., { force: true })`
  after `instantiateProject` succeeds, so a new project's managed regions populate immediately.
- **Session end** — `chatSessionClassifier` enqueues a snapshot (`reason: 'chat_session_end'`,
  TTL-respecting) after processing a project chat session, giving the ongoing refresh cadence.

The job is dedup-keyed (`project-context-snapshot-${projectId}`) and TTL-gated
(15 min, unless `force`), so frequent triggers coalesce instead of churning rebuilds.
Web producer: `apps/web/src/lib/server/project-context-snapshot.service.ts`. Worker
producer: `queueProjectContextSnapshot` exported from `projectContextSnapshotWorker.ts`.

**Recency guard (resolved):** managed-only writes must not pollute human-facing
document recency. The `update_onto_documents_updated_at()` trigger now carves out
Start Here managed-region writes — if only `content` changed and the authored body
outside the managed fences is byte-identical, the prior `updated_at` is preserved
(migration `20260624000000_start_here_managed_region_recency_guard.sql`). Authored
edits still bump recency normally.

### 6.3 Authored Capture From Chat (checkpoint capture)

Checkpoint capture (tasker/95, live in production since `6660f80ce`, 2026-09-23) captures project
chats while they run, not only when they close. Before it, capture ran only on an explicit chat
close, and 468 of 516 production project chats from the prior 60 days (91%) were never captured.

**Triggers.** Nothing runs inside a chat turn.

- A scheduler sweep (`sweepChatCheckpoints`, every minute) looks at project chats active in the
  last 3 days. It enqueues `capture_chat_checkpoint` when the messages after the session's
  watermark reach 1,500 user characters or 4 user turns, once the assistant has replied. It also
  enqueues when the session has been idle for 10 minutes.
- Closing a chat (`classify_chat_session`) enqueues the same job.
- The dedup key is `chat-checkpoint:<sessionId>`. A failed capture writes a `failed` receipt, and
  the sweep skips that session until a new message arrives.
- Kill switch: `CHAT_CHECKPOINT_CAPTURE_ENABLED=false`.

**Watermark.** The watermark lives in `chat_sessions.capture_watermark_at` and
`capture_watermark_message_id`. A capture reads up to 60 new messages, plus 4 earlier ones for
context, then advances the watermark, so a repeat run is a no-op.

**Outputs.** Two parallel calls on the `fast` JSON profile, with reasoning off:

1. **Thinking log.** One `document.context.thinking_log` document per project: a dated journal,
   newest entry first. Each entry has a `## YYYY-MM-DD · <topic>` heading, then
   `_From chat "<title>" · <time>_`, then the user's messages as paragraphs with light cleanup.
    - Code keeps the model's cleanup only when at least 90% of its words come from the user's
      message and it is no longer than the message plus 20 characters. Otherwise it logs the
      message as written.
    - Paragraph breaks the cleanup merged are put back (`restoreParagraphBreaks`).
    - A passage the model labels `"kind": "instruction"` (a pure request) is not logged.
    - Helpers are in `packages/shared-agent-ops/src/ontology/thinking-log.ts`.
2. **START HERE.** The model returns block edits against the document's own `##` sections, custom
   headings included:
    - `add` after a block id `bN`;
    - `remove`;
    - `replace`;
    - `rewrite`, only for Current state or a new section.

    A missing section is added only under a standard name, which prevents twins like "What this is"
    next to "What this book is".

**Auto-apply versus review.**

- Additions and the Current state snapshot apply immediately. Since tasker/96, the snapshot must
  cite evidence; see Current state grounding below.
- Removed or reworded lines go to one AI Inbox proposal per project, labelled "Update project
  START HERE". It supersedes older pending proposals.
- Decisions are a permanent record: they are never removed because they were carried out.
- The model sees the document as it would read with any pending proposal approved. Code plans that
  desired document against the real one with `planStartHereCheckpointRewrites`.

**Current state grounding (tasker/96, built 2026-09-23; not yet committed or deployed).**

- **What went wrong.** On QA, the outline chat's capture correctly set Current state to "Blueprint:
  first-pass chapter outline drafted" at 04:40:44. Six seconds later, a read-only "where are we at?"
  chat was captured. That chat had repeated the older START HERE, so capture overwrote the line
  with "not started — outline not yet drafted". This makes a self-reinforcing loop: a stale START
  HERE, the chat repeats it, capture saves the chat's words, and START HERE stays stale. Capture
  was treating assistant prose as news.
- **Write receipts.** `loadMessages` also returns the project records the chat's tools saved over
  the same message window. These come from `chat_tool_executions` rows that succeeded, are not
  reads, and carry `affected_entities` (`savedChangesFromExecution` in `capturePrompts.ts`). The
  synthesis prompt lists them as `[cN] <tool>: <kind> "<title>"`, or states "Changes this chat
  saved: none. These messages changed no project records."
- **Cited evidence (validated in code).** A Current state edit must cite `evidence`: the id of a
  user message in this window, or a `cN` receipt. Code drops an edit that cites neither and records
  `skipped: no_evidence`. Assistant messages carry no ids in the capture prompt, so an assistant's
  status read can never be cited.
- **Prompt rules.** Assistant text is not evidence: its status descriptions read the old record, and
  work it says it did counts only with a receipt. A user's request is not its result either:
  without a saved change, record the decision, not that it was done. Current state stays consistent
  with Decisions.
- **Other capture rules added in the same pass:**
    - Open questions are about the project itself, not about BuildOS or START HERE.
    - A question a recorded decision settles is removed; the removal goes to review.
    - The user's certainty is kept: an unsure idea or an unchosen candidate goes under Open
      questions, never into Decisions or settled prose.
- **Verified** on DeepSeek V4 Flash with `scripts/book-loop/capture-eval/probe-current-state.sh`,
  which replays those two real QA captures in memory. The outline chat, which has its
  `update_onto_document` receipt, wrote "drafted" 11/11 times. The status-only chat left the correct
  line alone 11/11 times; the model complied on its own, so the code check never had to fire.

**Known gap: a request can be recorded as done.** In the eval fixture, the user asked BuildOS to
convert the project to nonfiction. The chat made no calls and replied "Nothing has landed yet", yet
capture wrote "The project record, goal, plans… have been updated" into Current state.

- The edit cited the user's request as its evidence. The code check only confirms that a real user
  message was cited, not what that message says, and telling a request from a progress report
  would mean classifying language.
- Results: 0 of 2 runs correct before the "a request is not its result" rule, 2 of 3 after it, so
  about one run in three still writes an unbacked "done".
- The upstream cause is mostly gone. The chat bug that described changes instead of calling tools
  was fixed on 2026-09-22 ("describing never stages"), and unbacked "done" claims came from it.

**Recommended structural fix (not built; DJ chose to hold on 2026-09-23).**

- Auto-apply a Current state rewrite only when its evidence includes a `cN` receipt.
- A rewrite backed only by user messages goes into the project's one "Update project START HERE"
  review proposal, like removed or reworded lines do today.
- This is a structural rule on the evidence field, not a language rule, so it closes the gap
  completely.
- The cost is user friction. Progress the user reports from outside BuildOS ("I finished chapter 3
  in Docs") would wait in the AI Inbox until approved, instead of landing at once.
- Build it if book-loop or production captures show unbacked "done" lines in Current state again.

**Invariants enforced in code.**

- Managed regions stay byte-exact. Before every save, `checkStartHereCaptureInvariants` checks for
  changed regions, duplicate headings, and removed sections.
- Kept blocks are byte-exact, and a section keeps its own spacing.
- New or reworded Decisions are stamped with the capture date in the user's timezone; dates the
  model wrote are stripped.
- Links to unknown entities become plain labels (`resolveEntityReferences`). The classifier's
  `next_step_long` gets the same treatment.
- Echoed `[bN]` ids are stripped.
- An addition the model marks `"restates": "<bN>"` is dropped.
- A Current state edit that cites no user message or receipt from this window is dropped
  (`no_evidence`; tasker/96, uncommitted).
- An `updated_at` check runs before each save.

**Receipts and undo.**

- Each capture writes a `chat_capture_checkpoints` row (owner-read RLS, realtime).
- The chat shows `CaptureReceiptChip.svelte`, merged into the rendered message list only. It never
  enters model history.
- `POST /api/chat/capture-checkpoints/[id]/undo`:
    - restores START HERE, but only if nobody edited it since the capture;
    - removes the capture's log entry;
    - withdraws the proposal it staged.

**Backfill.** `pnpm --filter @buildos/worker backfill:chat-checkpoints --user <id>` is a dry run by
default. `--apply --confirm <db-ref> --max-usd N` writes oldest first, dates each capture to the
chat, and locks Current state. DJ declined a production backfill on 2026-09-23.

**Eval.**

- `scripts/book-loop/capture-eval/run-eval.sh` runs over the frozen book-loop fixture. It is paid
  (about 1¢, with DJ's approval) unless run with `--dry`, or with `--replay <run.json>` to replay
  saved model replies for free.
- It runs structural checks, plus an LLM judge that scores recall, the user's wording, invented
  claims and restated lines.
- `e2e-qa.sh` is a free end-to-end check on the isolated QA database (13 checks).
- `probe-current-state.sh` replays the book-loop project's idle captures from the QA database in
  memory. It prints Current state before and after, per rep, and is paid (well under 1¢) unless run
  with `--dry`.
- The frozen fixture carries each session's write receipts (`savedChanges`) since 2026-09-23.
  Before that it had none, so the eval was missing a production input.
- **Read the output; the score is not enough.**
    - Run 4 scored 100, yet a manual read found four defects. Their fixes (paragraph restore, the
      `kind` label, `restates`, and section spacing) shipped in `f212700b1`. They were verified on
      the real model on 2026-09-23: 0 restated lines, and the log 100% in the user's words.
    - Two later runs also scored 100 while Current state claimed a conversion that never happened.
      The judge compares additions against user messages only, so a claim the user _asked for_
      passes as supported.

**History.** Tasker 93's close-time reconcile contract (`startHereCaptureProcessor.ts`, full-section
rewrites, every change staged for review) was removed in `6660f80ce`.
`reconcileStartHereAuthoredSections` remains in `start-here.ts` but no longer has a production
caller.

### 6.4 Librarian Reconciliation

A lower-frequency Agent Run can propose cleanup:

- deduplicate decisions,
- prune stale open questions,
- reconcile "Current state" against recent logs/tasks,
- tighten prose,
- suggest missing links into the document tree.

Output is staged suggestions, not silent writes.

Since tasker/93, each session-end capture already does part of this for the sections it
rewrites: same-title decisions and terms collapse, answered open questions are dropped, and
_Current state_ is replaced. A librarian pass is still needed for three things: semantic
duplicates with different titles, text outside the authored sections (such as a stale
creation preamble), and docs damaged before 2026-09-22 that no new capture touches. A
one-time reconcile of the damaged docs was deferred on 2026-09-22. Production then had 7
such docs, all DJ's.

---

## 7. Chat Injection

Project/ontology prompt contexts should include a bounded `project_start_here` section when a Start Here body exists.

Section order:

```text
identity_mission
capabilities_skills_tools
tool_surface_dynamic
operating_strategy
safety_data_rules
project_start_here
focus_purpose
location_loaded_context
project_knowledge_map
timeline_recent_activity
context_inventory_retrieval
```

Important guardrails:

- The section must explicitly label the document as untrusted project-authored source data.
- The existing `focus_purpose` section remains because it contains workflow guidance for project chat, project creation, daily briefs, audits, and forecasts.
- The prompt injects a bounded excerpt, not arbitrary full document content.
- If truncated, the prompt tells the agent to use document outline/section tools before non-obvious writes.
- The full document remains retrievable through document tools.
- **Freshness (tasker/97, 2026-09-23; uncommitted).** - The header shows START HERE's `last updated` in the user's local time. - It adds `Changed after this START HERE: "<title>" (<local time>)…; where they differ, the newer
document wins` for any loaded document saved later. The comparison is made in code. - Why: the header used to print a UTC instant, which showed the next day, while Recent project
  changes printed local dates. A stale START HERE therefore looked newer than the outline doc
  saved 20 minutes after it, and the chat repeated "Blueprint: not started". That was the chat
  half of the loop described in §6.3. - The Final Response Contract also tells a returning user's answer to open with the work itself,
  using START HERE and the documents that hold the work.

Recommended budget: `1800-2400` chars in the prompt. The loader can fetch a larger bounded body, then the prompt builder trims further.

---

## 8. Daily Brief Integration

The Start Here document should eventually feed the daily brief flow, but not by dumping document bodies into every brief prompt.

Suggested path:

1. Brief loader reads Start Here metadata and a short excerpt for projects included in the brief.
2. Prompt uses it as orientation for project narrative and "recently worked on" synthesis.
3. Brief output can surface Start Here capture candidates when a daily brief discovers durable project context.
4. Capture remains staged through the same authored-section proposal path.

This avoids duplicating two separate "project narrative" systems.

---

## 9. Upstream and Downstream Impact

| Surface                  | Impact                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project create APIs      | Create-or-ensure Start Here by `type_key`, not legacy project pointer.                                                                                                                                                                               |
| Project full/detail APIs | Already use the right lookup pattern; expose Start Here metadata/body deliberately.                                                                                                                                                                  |
| Fast chat context loader | Runs one extra bounded query for the Start Here body in project/ontology contexts.                                                                                                                                                                   |
| Lite prompt builder      | Adds a guarded `project_start_here` section and keeps `focus_purpose`.                                                                                                                                                                               |
| Snapshot worker          | Renders deterministic `status` and `map` managed regions.                                                                                                                                                                                            |
| Session-end worker       | After chat classification/activity processing, stages one reviewable full-section reconcile proposal per project and supersedes older pending ones.                                                                                                  |
| Daily brief loader       | Consumes bounded Start Here excerpts for scoped project narratives.                                                                                                                                                                                  |
| External tool gateway    | API-key + MCP project reads (`onto.project.get`, `onto.project.status.get`) return a bounded `start_here` excerpt so third-party agents get the same orientation as internal chat. MCP `fetch` of a project leads its text with the Start Here body. |
| Document versioning      | The recency guard preserves `updated_at` for managed-only refreshes; authored changes still bump recency.                                                                                                                                            |
| Prompt safety            | Must wrap document content as untrusted data and preserve existing prompt injection rules.                                                                                                                                                           |

---

## 10. Phased Rollout

| Phase | Deliverable                                                                                  | Status      |
| ----- | -------------------------------------------------------------------------------------------- | ----------- |
| P0    | Shared constants/template/managed-region utilities; canonical lookup documented.             | Implemented |
| P1    | Project chat loader fetches bounded Start Here body.                                         | Implemented |
| P2    | Lite prompt injects guarded `project_start_here` before `focus_purpose`.                     | Implemented |
| P3    | Create/backfill Start Here docs on project create and via an explicit backfill script.       | Implemented |
| P4    | Managed status/map refresh with recency guard.                                               | Implemented |
| P5    | Checkpoint capture: thinking log, auto-applied additions, review for rewordings (tasker/95). | Implemented |
| P6    | Daily brief Start Here excerpts.                                                             | Implemented |
| P7    | Broader librarian/project-loop reconciliation for Start Here cleanup suggestions.            | Future      |

P0-P2 make agents orient around the Start Here doc. P3-P6 make it self-maintaining for the initial workflow.

---

## 11. Key File Touch Points

- Shared Start Here utilities: `packages/shared-agent-ops/src/ontology/start-here.ts`
- Shared Start Here persistence service: `packages/shared-agent-ops/src/ontology/start-here.service.ts`
- Prompt context model: `apps/web/src/lib/services/agentic-chat-v2/context-models.ts`
- Prompt context loader: `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- Lite prompt builder: `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- Snapshot worker (consumer + worker-side producer `queueProjectContextSnapshot`): `apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts`
- Web-side snapshot producer: `apps/web/src/lib/server/project-context-snapshot.service.ts`
- Snapshot producers (call sites): `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`, `apps/web/src/lib/services/calendar-analysis.service.ts` (create), `apps/worker/src/workers/chat/chatSessionClassifier.ts` (session end)
- Checkpoint capture: `apps/worker/src/workers/chat/checkpoint/` (`checkpointCapture.ts` engine, `capturePrompts.ts`, `checkpointJob.ts` job + sweep, `supabaseCheckpointPorts.ts`); planning and invariants in `start-here.ts` (`planStartHereCheckpointRewrites`, `applyStartHereSectionBodies`, `checkStartHereCaptureInvariants`); thinking log in `packages/shared-agent-ops/src/ontology/thinking-log.ts`; superseded-run inbox mapping in `packages/shared-agent-ops/src/inbox-index.ts` (`mapAgentRunToInboxItem`)
- Receipts and undo: `apps/web/src/lib/components/agent/CaptureReceiptChip.svelte`, `capture-receipt.ts`, `apps/web/src/routes/api/chat/capture-checkpoints/[id]/undo/+server.ts`; migrations `20260922230000_chat_capture_checkpoint_queue_type.sql` and `20260922230100_chat_capture_checkpoints.sql`
- Capture tests: `apps/worker/tests/chatCheckpointCapture.test.ts`, `packages/shared-agent-ops/src/ontology/start-here.test.ts`, `thinking-log.test.ts`, and the production replay in `apps/web/src/lib/services/ontology/start-here.regression.test.ts`. They use the byte-exact fixtures in `packages/shared-agent-ops/src/ontology/__fixtures__/`, which Prettier ignores. Eval: `scripts/book-loop/capture-eval/`.
- Daily brief loader: `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- External-agent surfacing (shared loader `loadProjectStartHereExcerpt`): `packages/shared-agent-ops/src/ontology/start-here.service.ts`
- External gateway project reads: `packages/shared-agent-ops/src/gateway/op-execution-gateway.projects.ts` (`onto.project.get`), `op-execution-gateway.project-status.ts` (`onto.project.status.get`), tool description in `op-execution-gateway.config.ts`
- MCP connector (`search`/`fetch` + tool surface): `apps/web/src/lib/server/agent-call/mcp-connector.service.ts`
- Backfill script: `apps/worker/src/scripts/backfillStartHereDocuments.ts`
- DB recency guard: `update_onto_documents_updated_at()` migration/function

---

## 12. Open Questions

1. What exact fields should `managed:status` render, and which are too volatile for prompt prefix stability?
2. Is checkpoint capture's bar right in real use: are auto-applied additions kept, and are review proposals approved? Open follow-ups are in tasker/96.
    - **Request recorded as done:** should a Current state rewrite backed only by the user's words go to review instead of applying at once? This would close the "request recorded as done" gap in §6.3, at the cost of user-reported progress waiting in the AI Inbox. DJ chose to hold on 2026-09-23; revisit if unbacked "done" lines reappear.
    - **Untouched stale lines:** stale lines a chat never touches survive capture: for example, "Exclusions (still blank)" beside a "Exclusions dropped" decision. Capture only edits what the chat changes, so a periodic reconcile pass (see §6.4) would be the place for this.
3. Should proposal-ready Start Here runs get a dedicated notification or surface inside the project document UI?
4. Should the existing project-loop/librarian pass suggest Start Here cleanup when the authored sections drift?
5. Is the initial 1,200-character daily brief excerpt enough, or should it prefer specific authored sections over a simple bounded excerpt?
