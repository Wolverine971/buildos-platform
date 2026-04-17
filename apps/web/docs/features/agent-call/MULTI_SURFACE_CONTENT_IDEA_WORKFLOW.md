<!-- apps/web/docs/features/agent-call/MULTI_SURFACE_CONTENT_IDEA_WORKFLOW.md -->

# Multi-Surface Content Idea Workflow — Design Note

**Status:** Exploration / not implemented
**Date:** 2026-04-17
**Author:** DJ (with Claude)
**Context:** User wants to move flexibly between three surfaces — BuildOS, Claude Code, and Libri (unclear whether a local tool or a deployed service; see open questions) — and have a single workflow span all of them. Canonical example: from Claude Code, "ingest this YouTube video because I want to do a TikTok on it," which should store the content idea in BuildOS and fetch a transcript via Libri, so the user has everything they need to generate derived assets.

---

## Problem

Today BuildOS has no primitive for "content idea." A user who wants to turn a YouTube video into a TikTok has to:

1. Fetch the transcript somewhere
2. Stash it somewhere
3. Remember to come back to it
4. Draft the TikTok manually

Each step lives on a different surface. Nothing is orchestrating them, and nothing guarantees the idea ever surfaces again (e.g. in the daily brief).

The underlying question: **when a workflow spans multiple surfaces and services, where does the state machine live, and who initiates each hop?**

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

## Worked example: "TikTok from this YouTube video"

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

## Orchestration: who pulls the transcript?

Two variants depending on what **Libri** actually is (see [Open questions](#open-questions)):

### Variant A — Libri is a deployed service with an API

BuildOS worker calls Libri directly (new outbound integration, like Google Calendar). Clean. Works regardless of which surface triggered the flow.

### Variant B — Libri is a local tool (e.g. `yt-dlp` + `youtube-transcript-api` on your laptop)

BuildOS servers can't reach your laptop. Two sub-options:

- **B1:** Claude Code pulls the transcript locally and posts the full payload (transcript inline) to BuildOS. Simpler, but only works when you're in Claude Code.
- **B2:** Build a small in-worker transcript fetcher using the same underlying tools (yt-dlp + youtube-transcript-api) that the local `youtube-transcript` skill already uses. Removes the Libri dependency entirely for this workflow.

**Recommendation if Libri is local-only:** go with **B2**. It makes the workflow work from any surface (mobile, web) not just Claude Code on your laptop. Libri remains useful for ad-hoc local transcript work, but it's not in the critical path of the orchestrated workflow.

---

## Concrete components to build

### 1. Gateway ops (extend `EXTERNAL_OP_HANDLERS`)

- `onto.content_idea.create` — `{ source_url, platform_hints, note, project_id? }`
- `onto.content_idea.draft` — `{ idea_id, platform, style? }`
- `onto.content_idea.get` — `{ idea_id }`

Prerequisite: the `onto.document.create` / `onto.document.update` ops from the [research ingestion design](./EXTERNAL_RESEARCH_INGESTION_DESIGN.md) — content-idea ops will reuse the document-mutation layer.

### 2. Worker jobs

Register in `apps/worker/src/worker.ts`:

- `buildos_enrich_content_idea` — fetches source media/transcript and writes it into the content-idea project.
- `buildos_draft_content_asset` — generates a derived asset via the LLM using transcript + platform template.

Both jobs follow the existing `JobAdapter` pattern in `workers/shared/jobAdapter.ts`.

### 3. Schema/facets

- `project.kind` facet — starts with `content_idea`, generalizes.
- `document.kind` facet — `transcript`, `source_reference`, `derived_asset`.
- `document.platform` facet on derived assets.
- No new tables needed.

### 4. Brief integration

In `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`, add a **"Content pipeline"** section that groups content-idea projects by state: _awaiting enrichment_, _enriched & ready to draft_, _drafted & ready to record_, _recorded_.

### 5. (Optional) UI surface

For a v1, reuse the existing project view with a content-idea-aware header. A dedicated "Content pipeline" page can come later.

---

## Where each surface fits

| Surface              | Role                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**      | Workflow initiator + heavy thinking/drafting companion. Can both start ideas and manipulate existing ones via the gateway. |
| **BuildOS (web)**    | Source of truth. Review, edit, approve drafts. Daily brief surfaces the pipeline.                                          |
| **BuildOS (worker)** | Orchestrator. Runs enrichment + draft jobs. Calls out to LLMs, Libri, etc.                                                 |
| **Libri**            | Either an outbound integration BuildOS worker calls (Variant A), or removed from this critical path (Variant B2).          |

The key insight: **only BuildOS owns state; the other surfaces are authoring and reviewing clients.** That asymmetry is what makes the whole thing coherent.

---

## Open questions

1. **What is Libri?** Deployed service with an HTTP API, local CLI tool, or something else? This is the biggest fork in the design (Variant A vs B).
2. **One project per source, or one per platform?** A YouTube video might fan out into TikTok + Twitter + blog — three derived assets on one project, or three separate content-idea projects each pointing back at the same source? Leaning toward one project per source with multiple derived assets; cleaner pipeline view.
3. **Fire-and-forget vs progress notification?** "Ingest and tell me when it's ready" may want a push notification (already wired), vs just showing up in tomorrow's brief.
4. **Draft generation quality bar.** LLM-first-pass + human edit, human outline + LLM polish, or pure LLM? Affects whether `draft` is a one-shot or a conversation.
5. **Does Libri's role generalize?** If Libri also handles podcast transcripts, PDF extraction, etc., the design becomes "pluggable source fetcher" rather than one YouTube-shaped integration.
6. **Claude Code's role in drafting.** After enrichment, does Claude Code _call_ `content_idea.draft` (server-side LLM), or does it pull the transcript and draft in-conversation, then post the finished asset back? The second option makes more use of Claude Code's agentic strength — but the first option means mobile/web users get the same capability without needing Claude Code.

---

## Prerequisites / relationship to other designs

- **[External Research Ingestion — Design Note](./EXTERNAL_RESEARCH_INGESTION_DESIGN.md)** proposes `onto.document.create` / `onto.document.update` on the gateway. Those ops are prerequisites here — the content-idea ops layer on top of generic document writes.
- The broader pattern (surface → gateway → worker job → outbound integration) is reusable. Once built, the same shape supports: "summarize this podcast," "draft an email sequence," "research this competitor," etc. Treat the content-idea flow as the first concrete instance of this pattern.

---

## Related files

- `apps/web/src/routes/api/agent-call/buildos/+server.ts` — JSON-RPC entry point
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` — where `onto.content_idea.*` ops register
- `apps/worker/src/worker.ts` — where new worker job types register
- `apps/worker/src/workers/shared/jobAdapter.ts` — job processor pattern
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` — where the "Content pipeline" brief section lives
- `packages/smart-llm/` — LLM abstraction for the drafting job
- `youtube-transcripts/` (repo root) — current local transcript artifacts; likely related to what Libri becomes or replaces
