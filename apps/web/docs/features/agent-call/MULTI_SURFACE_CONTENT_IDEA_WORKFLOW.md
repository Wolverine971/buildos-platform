<!-- apps/web/docs/features/agent-call/MULTI_SURFACE_CONTENT_IDEA_WORKFLOW.md -->

# Multi-Surface Content Idea Workflow — Design Note

**Status:** PoC shipped — document write surface live; remaining entity writes deferred
**Date:** 2026-04-17 (updated 2026-04-18)
**Author:** DJ (with Claude)
**Context:** User wants to move flexibly between BuildOS, Claude Code / OpenClaw (third-party agent surfaces), and Libri (the user's own library / data lake for books, authors, and YouTube videos — a separate service, not inside BuildOS). The near-term bottleneck is that BuildOS's external agent-call gateway exposes a narrow slice of the data model, so third-party agents can't yet do routine authoring work against BuildOS. The content-idea workflow is one downstream use case; the immediate need is a wider, trusted tool surface.

---

## Problem

Two problems stack on top of each other.

**Problem 1 — External agents can only do a sliver of what BuildOS supports.**
The external agent-call gateway currently exposes read access to projects/tasks/documents plus `onto.task.create` and `onto.task.update`. Everything else that the internal agentic chat can do — creating documents, creating projects, creating goals/plans/milestones/risks, tree organization — is off-limits to third-party agents, even though the internal tool surface already handles the same operations safely. The Agent Keys UI on the profile page mirrors this narrow set, so even a trusted caller like OpenClaw can't, for example, save a research markdown as a BuildOS document.

**Problem 2 — There's no primitive for "content idea" spanning surfaces.**
When the user wants to turn a YouTube video into a TikTok, they have to fetch the transcript somewhere, stash it somewhere, remember to come back, and draft the TikTok manually — all on different surfaces. Nothing orchestrates the flow and nothing guarantees the idea resurfaces (e.g. in the daily brief).

The underlying question for Problem 2 — **when a workflow spans multiple surfaces and services, where does the state machine live, and who initiates each hop?** — depends on Problem 1 being solved first. Without a broader gateway surface, Claude Code can't author the doc/project shape needed to orchestrate the workflow.

---

## Nearest proof of concept: expand the agent-call tool surface

Before building content-idea-specific ops, expand what third-party agents can do at all. The internal agentic chat has already validated the behaviors on live users; the policy layer (scopes, write audit, idempotency) already exists. **The work is re-registering existing internal handlers on the external gateway, not inventing new data models.**

### Why it's safe to expand now

- Agent Keys already gate per-caller scope mode, allowed ops, and allowed project IDs (`agent-call-policy.ts`).
- Write audit + idempotency already wrap every write op (`agent-call-write-audit.service.ts`).
- RLS + project access checks (`assertProjectWriteAccess`) already fire on every handler.
- The agentic chat quality bar has improved enough that the internal write handlers are stable — we're not exposing experimental paths.

### Ordered expansion plan

1. **`onto.document.create` + `onto.document.update`** — the headline proof of concept. Claude Code / OpenClaw produces a markdown artifact and writes it as a project-scoped BuildOS document in one call. Takes `project_id`, `title`, `content` (markdown, stored as-is — no H1/H2 tree-parsing, no "sections" payload), plus the same optional metadata the internal `create_onto_document` tool accepts (`description`, `type_key`, `parent_document_id` for explicit tree placement). Reuse the validation and tree-placement logic already in `apps/web/src/routes/api/onto/documents/create/+server.ts` and `doc-structure.service.ts`; do not reinvent. Mirror the internal tool shape so agents that already know `create_onto_document` feel at home.
2. **`onto.project.create` + `onto.project.update`** — lets an external agent set up a new project before writing docs/tasks into it. Without this, users keep having to pre-create projects in the web UI.
3. **`onto.goal.*`, `onto.plan.*`, `onto.milestone.*`, `onto.risk.*`** — round out the write surface so any structural edit the internal chat can do is also available through the gateway. Each one is a ~50-line handler that delegates to the same internal API route. Mirror the scope-mode and idempotency plumbing used by `onto.task.*`.
4. **Agent Keys UI (profile page)** — `WRITE_PERMISSION_OPTIONS` in `apps/web/src/lib/components/profile/AgentKeysTab.svelte` today lists only two options. Lead with preset bundles (default: **"Author docs + tasks"** — create/update on documents and tasks; this is the OpenClaw default). Put per-op toggles behind an "Advanced" disclosure so users can still grant finer or broader scope when they want it.

### Where this slots into the type system

- `BUILDOS_AGENT_READ_OPS` / `BUILDOS_AGENT_WRITE_OPS` in `packages/shared-types/src/agent-call.types.ts` need entries added for each new op.
- `EXTERNAL_OP_HANDLERS` + `EXTERNAL_WRITE_OP_SCHEMAS` in `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` need matching handler registrations and JSON schemas.
- The public tool registry and `AgentKeysTab.svelte` pick up the new ops from the shared-types lists automatically — no duplicate wiring if the types are the source of truth.

### Scope boundary

Do not invent new primitives in this PoC. Everything listed above already exists as an `onto_*` table and as an internal agentic-chat tool. The work is exposure + scope enforcement, not schema design.

### Implementation progress (2026-04-18)

**Shipped:**

- **Shared types** (`packages/shared-types/src/agent-call.types.ts`) — `BUILDOS_AGENT_WRITE_OPS` expanded from 2 ops to 14. Added `OPENCLAW_DEFAULT_WRITE_OPS` (the "Author docs + tasks" bundle) and `LEGACY_OPENCLAW_DEFAULT_WRITE_OPS` (for the auto-upgrade detection).
- **Document gateway handlers** — `onto.document.create` and `onto.document.update` live in `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`. Markdown stored as-is, 200 KB cap enforced, wholesale replace on update, project root is the default tree placement, version snapshots via `createOrMergeDocumentVersion`, activity log entries, mention notifications, and `props.origin = 'external_agent'` facet for auditability.
- **Auto-upgrade migration** — `upgradeLegacyOpenClawAllowedOps` in `agent-call-policy.ts` detects OpenClaw callers still carrying the old narrow scope and returns the expanded bundle. `caller-auth.ts` persists the upgrade to `external_agent_callers.policy` on next auth and emits an `agent.caller.policy.upgraded` security event.
- **Agent Keys UI** (`apps/web/src/lib/components/profile/AgentKeysTab.svelte`) — bundles lead the permissions picker (Read only / Author docs + tasks [default] / Full read/write / Custom); full per-op matrix behind an Advanced disclosure; new-key default is the Author docs + tasks bundle.
- **User-facing docs** (`apps/web/src/content/docs/connect-agents.md`) — permission-bundle table, expanded op list with "coming soon" markers for the other entities, and a worked `onto.document.create` example.

**Deferred (registered, stubbed, not wired):**

- `onto.project.create` / `update`
- `onto.goal.create` / `update`
- `onto.plan.create` / `update`
- `onto.milestone.create` / `update`
- `onto.risk.create` / `update`

These ops exist in `BUILDOS_AGENT_WRITE_OPS` and show up in the Agent Keys Advanced disclosure, but the handlers throw `INTERNAL` ("not yet implemented") until wired. The docs page labels them as "coming soon." Implement by following the document-handler pattern in `external-tool-gateway.ts` when ready.

**Also deferred:**

- Integration tests covering happy path, scope denial, validation (title required, content > 200 KB), idempotent replay, and the OpenClaw auto-upgrade path.
- Content-idea workflow ops (`onto.content_idea.*`) — these stay wrappers to be built once the primitives above exist.
- Brief rendering for `origin = external_agent` documents as a dedicated "New from external agents" section.

### Decisions locked before implementation

- **Update semantics for `onto.document.update`** — wholesale replace. If `content` is provided in the update payload, it replaces the full document body. Individual metadata fields (`title`, `description`, `type_key`, `state_key`) update independently when present. No append/diff mode in v1.
- **Default tree placement** — when `parent_document_id` is omitted on create, the document lands at the project root, matching the internal `create_onto_document` default. No "agent inbox" lane.
- **Idempotency key convention** — recommend `{callerId}:{project_id}:{title-slug}:{YYYY-MM-DD}` in the op description so same-day re-uploads of the same titled doc don't duplicate. Agents may override; the gateway's `idempotency_key` contract stays opaque.
- **Markdown size cap** — 200 KB (204,800 bytes) per `content` field. Above that, return `VALIDATION_ERROR`. Accommodates long research docs; well below anything that stresses the brief renderer.
- **Existing OpenClaw caller migration** — auto-upgrade. On caller load, if the caller's provider is `openclaw` and the stored `allowed_ops` matches the old narrow default, expand it in place to the new "Author docs + tasks" bundle. Log once per caller.
- **Acceptance criteria** — (1) integration tests per new op covering happy path, scope denial, validation error, and idempotent replay; (2) one smoke test that end-to-end uploads a markdown doc from a mocked OpenClaw caller and verifies it surfaces in the document list.

---

## The core pattern

**BuildOS is the orchestrator and source of truth. Surfaces call into BuildOS via the agent-call gateway. Heavy lifting (fetching transcripts, generating drafts) happens in worker jobs. Outbound integrations are called from the worker.**

This mirrors the topology BuildOS already has for LLM calls, calendar sync, and Twilio SMS — outbound integrations live in the worker, not the web layer. The new thing is **surface-triggered outbound enrichment**: an external agent starts a flow that kicks off a worker job that calls out to another service.

Why BuildOS is the right orchestrator:

- It's already persistent (the others are either ephemeral CLIs or standalone tools).
- It already has the queue/worker infrastructure for retries, idempotency, and auditing.
- The daily brief is the natural "did anything interesting happen?" surface — so anything the orchestrator produces gets visibility for free.
- Any future surface (mobile app, email, web) can trigger the same flow without re-implementing orchestration logic.

---

## Downstream use case: "TikTok from this YouTube video"

Once the expanded tool surface is live, the content-idea workflow becomes a natural composition of those ops rather than a bespoke feature. Treat this section as the first concrete user story validating the expanded surface, not as the immediate build target.

### Worked example

1. User in Claude Code: _"ingest `https://youtu.be/XYZ`, want to do a TikTok on it."_
2. Claude Code calls `buildos.content_idea.create({ source_url, platform_hints: ['tiktok'], note })` via the agent-call gateway.
3. BuildOS creates a lightweight **content-idea project**, seeds it with a pending transcript document, and enqueues `buildos_enrich_content_idea`.
4. Worker fetches the transcript (built-in fetcher or Libri — see [Orchestration](#orchestration-who-pulls-the-transcript)) → writes it to the transcript doc.
5. Idea appears in the next daily brief under a "Content pipeline" section. Or, if immediacy matters, a notification fires.
6. When ready to generate: user (or an agent) calls `buildos.content_idea.draft({ idea_id, platform: 'tiktok' })`.
7. Worker calls the LLM with transcript + platform template → writes a derived-asset document on the same project.
8. User reviews the draft in BuildOS, records the TikTok, marks the asset task done.

---

## Data model

Use existing primitives. **Do not invent a "content idea" top-level entity.**

- **Content idea → project** with a facet like `project.kind = content_idea`.
    - Why a project, not a doc: a single content idea naturally spawns multiple derived assets (TikTok script, tweet thread, blog outline) and multiple tasks (record, post, cross-post). Projects already hold docs + tasks + are walked by the brief generator.
- **Source reference (the YouTube URL)** → project facet or a `document.kind = source_reference` doc.
- **Transcript** → `document.kind = transcript` doc, attached to the project.
- **Derived asset (TikTok script, tweet thread, etc.)** → `document.kind = derived_asset` + `document.platform = tiktok` doc.
- **Workflow steps** ("record," "cross-post") → tasks on the project.

This plays cleanly with the existing brief generator — projects/docs/tasks already get surfaced; the facets are what let the renderer give content ideas their own section.

---

## Libri's role (clarified)

Libri is a separate deployed service the user operates as a durable library / data lake for books, authors, people, and YouTube videos. It runs its own ingestion and enrichment pipeline. BuildOS is **already** integrated with it on the read side:

- Internal agentic chat exposes `resolve_libri_resource` (person/author lookup with optional enqueue) and `query_libri_library` (structured library inventory) — see `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts:409-509`.
- On chat session close, BuildOS scans for mentioned people/books/videos and forwards them to Libri for ingestion (fire-and-forget).

Two consequences for this design:

1. **Libri is not in the critical path of the expanded BuildOS tool surface.** Uploading a markdown document to BuildOS from Claude Code does not go through Libri. Libri is a peer service, not a dependency.
2. **For the content-idea transcript step, Libri is the preferred fetcher** — it already has a transcript pipeline, so BuildOS's enrichment worker should call Libri rather than re-implementing yt-dlp. If Libri's transcript API isn't available for a given source, fall back to inline upload from Claude Code.

### Transcript fetch, reconsidered

- **Primary:** BuildOS enrichment worker calls Libri's transcript API (same pattern as any other outbound integration — lives in the worker, not the web layer).
- **Fallback:** Claude Code fetches the transcript locally and posts it inline on the `onto.document.create` call. This works even when BuildOS can't reach the source (private links, auth-gated content).

No in-worker yt-dlp shim. That was Variant B2 in a previous draft; it duplicates what Libri already does.

---

## Concrete components to build

### 1. Gateway ops — expanded surface (PoC, build first)

Extend `EXTERNAL_OP_HANDLERS` in `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` and the op lists in `packages/shared-types/src/agent-call.types.ts`. Op shapes mirror the internal agentic-chat tool shapes (e.g. `create_onto_document`) — same required args, same semantics — so agents work identically on either surface.

- **Documents (PoC headline):** `onto.document.create`, `onto.document.update`, `onto.document.move`. Store markdown as-is; no structural parsing. Always takes a `project_id`.
- **Projects:** `onto.project.create`, `onto.project.update`.
- **Goals / plans / milestones / risks:** `onto.goal.create`/`update`, `onto.plan.create`/`update`, `onto.milestone.create`/`update`, `onto.risk.create`/`update`.
- **Links (optional but cheap):** `onto.link.create`, `onto.link.delete` to attach documents to tasks/goals/plans.

Each handler delegates to the existing internal API route or service layer (`apps/web/src/routes/api/onto/*`, `apps/web/src/lib/services/ontology/*`). Do not reinvent validation or side-effect plumbing.

See the [External Research Ingestion design](./EXTERNAL_RESEARCH_INGESTION_DESIGN.md) for the full `onto.document.create` spec (idempotency, `document.origin = external_agent` facet, brief-section rendering). The recommendation there holds.

### 2. Gateway ops — content-idea workflow (layered on top, later)

- `onto.content_idea.create` — `{ source_url, platform_hints, note, project_id? }` (under the hood: creates a project via `onto.project.create` with `kind = content_idea`, seeds a transcript placeholder via `onto.document.create`, enqueues enrichment).
- `onto.content_idea.draft` — `{ idea_id, platform, style? }`.
- `onto.content_idea.get` — `{ idea_id }`.

These become thin wrappers once the primitives exist. They are optional convenience ops — Claude Code could just as easily compose the three underlying ops itself.

### 3. Worker jobs

Register in `apps/worker/src/worker.ts` (only needed once the content-idea wrapper ops are built):

- `buildos_enrich_content_idea` — calls Libri for the transcript and writes it into the content-idea project via `onto.document.update`.
- `buildos_draft_content_asset` — generates a derived asset via the LLM using transcript + platform template.

Both jobs follow the existing `JobAdapter` pattern in `workers/shared/jobAdapter.ts`.

### 4. Schema/facets

- `project.kind` facet — starts with `content_idea`, generalizes.
- `document.kind` facet — `transcript`, `source_reference`, `derived_asset`.
- `document.platform` facet on derived assets.
- `document.origin` facet — `external_agent` vs internal, so the brief can filter/label.
- No new tables needed.

### 5. Brief integration

In `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`, add a **"Content pipeline"** section that groups content-idea projects by state: _awaiting enrichment_, _enriched & ready to draft_, _drafted & ready to record_, _recorded_. Also add a **"New from external agents"** section for documents with `origin = external_agent` updated since the last brief — so the user can see what Claude Code / OpenClaw wrote overnight.

### 6. Agent Keys UI

Update `apps/web/src/lib/components/profile/AgentKeysTab.svelte`:

- Lead with preset bundles: **"Read only"**, **"Author docs + tasks" (OpenClaw default)**, **"Full read/write"**. Selecting a bundle sets `scope_mode` + `allowed_ops` in one click.
- Put the full per-op matrix (create/update × documents, projects, tasks, goals, plans, milestones, risks) behind an "Advanced" disclosure for users who want finer control.
- Keep per-project scope selection unchanged — that layer already works.

### 7. (Optional) Project-page UI surface

For a v1, reuse the existing project view with a content-idea-aware header. A dedicated "Content pipeline" page can come later.

---

## Where each surface fits

| Surface              | Role                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**      | Workflow initiator + heavy thinking/drafting companion. Can both start ideas and manipulate existing ones via the gateway.                                                                                                                                                                                             |
| **BuildOS (web)**    | Source of truth. Review, edit, approve drafts. Daily brief surfaces the pipeline.                                                                                                                                                                                                                                      |
| **BuildOS (worker)** | Orchestrator. Runs enrichment + draft jobs. Calls out to LLMs, Libri, etc.                                                                                                                                                                                                                                             |
| **Libri**            | Separate library / data lake service the user runs. Already wired as a read tool on internal chat and as a post-chat ingestion target for mentioned people/books/videos. For content ideas, BuildOS's enrichment worker calls Libri for transcripts. Not on the critical path for generic agent-call document uploads. |

The key insight: **only BuildOS owns state; the other surfaces are authoring and reviewing clients.** That asymmetry is what makes the whole thing coherent.

---

## Open questions

### Tool-surface expansion

**Decided (2026-04-18):**

- Lead with bundles in the Agent Keys UI; expose granular per-op toggles behind an "Advanced" disclosure.
- OpenClaw provisioning default: `read_write` with the **"Author docs + tasks"** bundle (create/update on documents and tasks).
- Markdown uploads store the body as-is. No H1/H2 parsing, no "sections" payload, no server-side structural rewriting. Uploads target a specific project via `project_id`, mirroring the internal `create_onto_document` tool shape.
- No `dry_run` preview for document creates — not needed.

### Content-idea workflow (downstream)

5. **One project per source, or one per platform?** A YouTube video might fan out into TikTok + Twitter + blog — three derived assets on one project, or three separate content-idea projects each pointing back at the same source? Leaning toward one project per source with multiple derived assets; cleaner pipeline view.
6. **Fire-and-forget vs progress notification?** "Ingest and tell me when it's ready" may want a push notification (already wired), vs just showing up in tomorrow's brief.
7. **Draft generation quality bar.** LLM-first-pass + human edit, human outline + LLM polish, or pure LLM? Affects whether `draft` is a one-shot or a conversation.
8. **Does Libri's transcript coverage generalize?** If Libri also handles podcast transcripts, PDF extraction, etc., the enrichment worker calls Libri's generic fetcher rather than a YouTube-specific one.
9. **Claude Code's role in drafting.** After enrichment, does Claude Code _call_ `content_idea.draft` (server-side LLM), or does it pull the transcript and draft in-conversation, then post the finished asset back via `onto.document.create`? The second option leans on Claude Code's agentic strength; the first gives mobile/web users the same capability. Expanded tool surface makes option two low-cost, so probably default there.

---

## Prerequisites / relationship to other designs

- **[External Research Ingestion — Design Note](./EXTERNAL_RESEARCH_INGESTION_DESIGN.md)** proposes `onto.document.create` / `onto.document.update` on the gateway. Those ops are prerequisites here — the content-idea ops layer on top of generic document writes.
- The broader pattern (surface → gateway → worker job → outbound integration) is reusable. Once built, the same shape supports: "summarize this podcast," "draft an email sequence," "research this competitor," etc. Treat the content-idea flow as the first concrete instance of this pattern.

---

## Related files

### Tool-surface expansion (PoC build)

- `packages/shared-types/src/agent-call.types.ts` — `BUILDOS_AGENT_READ_OPS` / `WRITE_OPS` lists (add new entries here first).
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` — register new handlers and JSON schemas (currently at `EXTERNAL_OP_HANDLERS` ~line 185, `EXTERNAL_WRITE_OP_SCHEMAS` ~line 96).
- `apps/web/src/lib/server/agent-call/agent-call-policy.ts` — scope enforcement.
- `apps/web/src/lib/server/agent-call/agent-call-write-audit.service.ts` — write audit (already covers new ops for free).
- `apps/web/src/routes/api/agent-call/buildos/+server.ts` — JSON-RPC entry point.
- `apps/web/src/routes/api/onto/documents/create/+server.ts` and `apps/web/src/routes/api/onto/documents/[id]/+server.ts` — reuse this validation for document handlers.
- `apps/web/src/lib/services/ontology/doc-structure.service.ts` — tree placement for uploaded markdown.
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts` — the internal write tool shapes to mirror.
- `apps/web/src/lib/components/profile/AgentKeysTab.svelte` — `WRITE_PERMISSION_OPTIONS` needs the grouped/bundled rewrite.

### Content-idea workflow (downstream)

- `apps/worker/src/worker.ts` — where new worker job types register.
- `apps/worker/src/workers/shared/jobAdapter.ts` — job processor pattern.
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` — where the "Content pipeline" brief section lives.
- `packages/smart-llm/` — LLM abstraction for the drafting job.
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts:409-509` — existing internal Libri tools (`resolve_libri_resource`, `query_libri_library`); pattern to mirror if a gateway-facing Libri op is ever needed.
