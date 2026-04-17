<!-- apps/web/docs/features/agent-call/EXTERNAL_RESEARCH_INGESTION_DESIGN.md -->

# External Research Ingestion — Design Note

**Status:** Exploration / not implemented
**Date:** 2026-04-17
**Author:** DJ (with Claude)
**Context:** BuildOS is connected to Claude Code via the external agent-call gateway. The question is what the _right abstraction_ is for pushing research artifacts (produced by an external agent) into BuildOS so they surface in the daily brief.

---

## Problem

BuildOS is not a great environment for _doing_ open-ended research — long web searches, synthesis across multiple sources, multi-turn agentic exploration. That kind of work happens naturally in Claude Code / an agentic CLI.

But once the research is done, the output needs to land somewhere in BuildOS so it:

1. Is attached to the right project
2. Shows up in the next daily brief
3. Doesn't get mangled by the brain-dump extractor

Current feeling: shoving finished research through brain dump or as a task description is the wrong shape. Need to pick the correct primitive.

---

## Recommendation

**Claude Code authors a polished doc → calls `onto.document.create` / `onto.document.update` on the external agent-call gateway → doc lands under a project → next daily brief picks it up automatically.**

The abstraction is already correct in the data model. The write op is the only thing missing.

---

## Why `onto_documents` is the right primitive

Two existing pieces of the system make this the natural fit:

### 1. `onto_documents` is the project-scoped knowledge artifact

The brief loader already walks documents per project at `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:1448` and includes recently-updated documents in the daily brief automatically. No brief-side work is needed to get visibility.

### 2. The external agent-call gateway is the right entry point

The gateway at `apps/web/src/routes/api/agent-call/buildos/+server.ts` is already the way external agents call into BuildOS. Tools are registered in `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` around line 191 (`EXTERNAL_OP_HANDLERS`).

Current exposed ops:

```
onto.project.list/search/get
onto.task.list/search/get/create/update
onto.document.list/search/get
onto.search
```

**Gap:** `onto.document.create` and `onto.document.update` are not registered. That's what makes this feel awkward today — the abstraction is right, the write path just isn't wired.

---

## Alternatives considered (and why they're wrong)

### Brain dump

Semantically wrong. Brain dumps are raw, unstructured thinking the extractor parses into structure. Shoving a finished research doc through the brain-dump pipeline forces re-extraction and loses author intent. Use brain dump when you're thinking _out loud_, not when you've already done the work.

### Research task with a long description

Tasks are work to do, not knowledge artifacts. The brief generator already separates research _tasks_ from knowledge artifacts — see the research-task categorization at `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:987`. Using a task as a carrier for a research doc fights the brief generator.

### A new "research note" or "briefing" primitive

Overkill. `onto_documents` already exists for project-scoped knowledge. Adding another top-level entity for something documents already model creates schema drift and fragments the brief renderer.

### Dropping files somewhere and hoping the brief finds them

No ambient ingestion path. Needs an explicit write op through the gateway.

---

## Design decisions to make when picking this up

These are the choices left on the table:

1. **Scoping.** Docs are project-scoped. The external gateway already enforces project scope for tasks (see `AgentCallScope.project_ids`). Reuse the same scoping.
2. **Idempotency.** Gateway already has `idempotency_key` conventions for write ops (`external-tool-gateway.ts:1822`). Use them. A suggested key: `date + topic slug` so re-running the same research session doesn't duplicate.
3. **Provenance.** Write-audit already records caller/session for writes (`agent-call-write-audit.service.ts`). No new work; it'll "just work" once the handler is registered.
4. **Facet tagging.** Add a `document.source = external_research` facet (or similar) so the brief can render a dedicated **"New research since yesterday"** section instead of burying the doc in the generic recent-updates lane. Optional, but probably worth it — the whole point of this flow is to _see_ the research in the next brief.
5. **Update semantics.** Decide whether `document.update` from an external caller replaces content wholesale or appends. Research artifacts are usually replaced as a single unit; wholesale replace is probably right.

---

## Concrete work items (when picking this up)

1. Add `onto.document.create` and `onto.document.update` entries to `EXTERNAL_OP_HANDLERS` in `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` (around line 191).
2. Write handlers that call the same underlying document-mutation service the internal ontology API uses (see `apps/web/src/routes/api/onto/documents/`). Do _not_ reinvent validation — reuse.
3. Add the JSON schemas to `EXTERNAL_WRITE_OP_SCHEMAS` (around line 96 in the same file). Mirror the shape of the task write schemas.
4. Decide on + implement the `document.source` facet (or equivalent) if we want a dedicated brief section.
5. Optional brief-side work: in `ontologyBriefGenerator.ts`, render externally-sourced research docs as their own section.
6. On the Claude Code side: nothing to build — the gateway surfaces tools dynamically via `tools/list`, so the new ops show up automatically.

---

## Related files

- `apps/web/src/routes/api/agent-call/buildos/+server.ts` — JSON-RPC entry point
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` — tool registry + handlers
- `apps/web/src/lib/server/agent-call/public-tool-registry.ts` — public tool exposure
- `apps/web/src/lib/server/agent-call/agent-call-write-audit.service.ts` — write audit trail
- `apps/web/src/routes/api/onto/documents/` — internal document API (reuse validation from here)
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` — brief data loader (documents at :1448, research-task categorization at :987)
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` — brief renderer (where a "new research" section would live)

---

## Open questions to revisit

- Should externally-authored research docs be _separately visible_ in the UI (e.g., a filter/badge), or just flow into the standard documents list?
- Is "research" the only external-author use case, or does this generalize to "any polished artifact an external agent produces" (design docs, competitive analyses, meeting notes)? If it generalizes, the facet should be `document.origin = external_agent` rather than `document.source = external_research`.
- Do we want a notification when the gateway creates a doc, or is the daily brief the only surface that matters?
