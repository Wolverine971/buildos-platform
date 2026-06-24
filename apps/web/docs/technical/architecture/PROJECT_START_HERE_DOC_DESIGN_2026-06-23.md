<!-- apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md -->

# Project "START HERE" Context Document - Design

**Status:** Implemented - initial end-to-end path
**Date:** 2026-06-23
**Last Updated:** 2026-06-24
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

| Fork             | Decision                                                                       | Consequence                                                                                         |
| ---------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Data model       | Use `type_key='document.context.project'` on `onto_documents`                  | No schema revival, no legacy edge, no project-row pointer.                                          |
| Ownership model  | Hybrid authored + managed regions                                              | Humans/agents own orientation prose through staged edits; machines own deterministic fenced blocks. |
| Prompt injection | Add a guarded `project_start_here` section before `focus_purpose`              | The document becomes the orientation entry point while existing workflow guardrails remain intact.  |
| Capture          | Session-end workers propose authored edits; they do not silently rewrite prose | The doc remains high-trust project context instead of becoming hidden LLM output.                   |
| Managed refresh  | Deterministic pure merge only                                                  | No LLM in managed regions; idempotent updates can run after snapshot refreshes.                     |

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

### 6.3 Authored Capture From Chat

At session end, the worker already classifies/cleans up chats and updates project activity/next steps. Start Here capture should be a separate step in that flow:

1. Detect durable orientation facts: explicit decisions, non-goals, changed definition of done, stable vocabulary, resolved/open questions.
2. Map each fact to a named authored section.
3. Propose an append/edit through the staged mutation flow.
4. Never write into managed fences.
5. Never silently rewrite prose.

This keeps the Start Here document current without letting a background worker silently become the author of trusted project context.

### 6.4 Librarian Reconciliation

A lower-frequency Agent Run can propose cleanup:

- deduplicate decisions,
- prune stale open questions,
- reconcile "Current state" against recent logs/tasks,
- tighten prose,
- suggest missing links into the document tree.

Output is staged suggestions, not silent writes.

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
| Session-end worker       | Adds staged authored-section capture proposals after chat classification/activity processing.                                                                                                                                                        |
| Daily brief loader       | Consumes bounded Start Here excerpts for scoped project narratives.                                                                                                                                                                                  |
| External tool gateway    | API-key + MCP project reads (`onto.project.get`, `onto.project.status.get`) return a bounded `start_here` excerpt so third-party agents get the same orientation as internal chat. MCP `fetch` of a project leads its text with the Start Here body. |
| Document versioning      | The recency guard preserves `updated_at` for managed-only refreshes; authored changes still bump recency.                                                                                                                                            |
| Prompt safety            | Must wrap document content as untrusted data and preserve existing prompt injection rules.                                                                                                                                                           |

---

## 10. Phased Rollout

| Phase | Deliverable                                                                            | Status      |
| ----- | -------------------------------------------------------------------------------------- | ----------- |
| P0    | Shared constants/template/managed-region utilities; canonical lookup documented.       | Implemented |
| P1    | Project chat loader fetches bounded Start Here body.                                   | Implemented |
| P2    | Lite prompt injects guarded `project_start_here` before `focus_purpose`.               | Implemented |
| P3    | Create/backfill Start Here docs on project create and via an explicit backfill script. | Implemented |
| P4    | Managed status/map refresh with recency guard.                                         | Implemented |
| P5    | Session-end staged authored capture proposals.                                         | Implemented |
| P6    | Daily brief Start Here excerpts.                                                       | Implemented |
| P7    | Broader librarian/project-loop reconciliation for Start Here cleanup suggestions.      | Future      |

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
- Session-end capture path: `apps/worker/src/workers/chat/chatSessionClassifier.ts` and `apps/worker/src/workers/chat/startHereCaptureProcessor.ts`
- Daily brief loader: `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- External-agent surfacing (shared loader `loadProjectStartHereExcerpt`): `packages/shared-agent-ops/src/ontology/start-here.service.ts`
- External gateway project reads: `packages/shared-agent-ops/src/gateway/op-execution-gateway.projects.ts` (`onto.project.get`), `op-execution-gateway.project-status.ts` (`onto.project.status.get`), tool description in `op-execution-gateway.config.ts`
- MCP connector (`search`/`fetch` + tool surface): `apps/web/src/lib/server/agent-call/mcp-connector.service.ts`
- Backfill script: `apps/worker/src/scripts/backfillStartHereDocuments.ts`
- DB recency guard: `update_onto_documents_updated_at()` migration/function

---

## 12. Open Questions

1. What exact fields should `managed:status` render, and which are too volatile for prompt prefix stability?
2. What bar should session-end capture use for "durable enough" after real-world review volume is visible?
3. Should proposal-ready Start Here runs get a dedicated notification or surface inside the project document UI?
4. Should the existing project-loop/librarian pass suggest Start Here cleanup when the authored sections drift?
5. Is the initial 1,200-character daily brief excerpt enough, or should it prefer specific authored sections over a simple bounded excerpt?
