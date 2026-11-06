<!-- tasker/150-outline-first-document-context.md -->

# 150 — Outline-first document context (stop loading full document text)

**Opened 2026-11-04 (DJ).** Found while building the "watch it sort" thread prototype
(`/lab/sort`, `apps/web/src/lib/server/dump-sort/`). Explainer with the numbers:
https://claude.ai/artifact/8UE6yxzYwFUAc6ModDjcDe (section "Does chat load every document?").

## What DJ wants (owner spec)

> We should not be loading a document's full text. It should only be loading the headers and
> subheaders of the document, so you get an overall view of the document. … Jev should not be looking
> at full documents. It should just be looking at the document with a few of the document headers to
> understand what's going on with that document … when an agent gets that document, it should have
> an understanding of that document based on the document and the document's headers. If the agent
> does need to specifically read that document, it can request the full version.

So, three rules:

1. **Nothing loads full document text just to rank or describe it.** Titles, descriptions, type and
   the heading outline are enough.
2. **Jev sees a document card:** title, description, type, a few headings. (It already only _sees_
   this; the problem is what we _load_ to build it.)
3. **The agent gets the same card (title, description, outline) and asks for text when it needs
   it,** through the read tools that already exist (`get_document_outline`,
   `read_document_section`, `get_onto_document_details`).

## What's already right (DJ's earlier fix, audit S8, 2026-10-17)

The agent's own **document tools are already outline-first**:

- `get_onto_document_details` returns a body ≤ 6,000 chars whole, otherwise a 3,500-char preview
  plus a section index of up to 30 headings (`packages/agentic-chat-runtime/src/loop/document-read-budget.ts`).
- `get_document_outline` returns only headings; `read_document_section` returns up to 12,000 chars of
  named sections (`packages/agentic-chat-runtime/src/tools/ontology-reads.ts:1503`).
- The stored outline cache exists: `onto_documents.outline` (`{version, content_hash, nodes: [{text,
level, anchor, char_start, char_end, word_count}]}`), migration
  `20260616010000_add_document_outline.sql`, written on every version save
  (`packages/shared-agent-ops/src/ontology/versioning.service.ts:137-156`), built by
  `extractOutline` (`packages/shared-agent-ops/src/utils/document-outline.ts`).

## What's wrong (measured 2026-11-04)

The **context finder** (Jev ranking + the "Working from" evidence block) runs automatically on every
project-chat turn and bypasses all of that:

1. **It loads every document's full text, every turn.**
   `loadContextFinderProject` (`packages/agentic-chat-runtime/src/context-finder/load.ts:42-110`)
   selects `content` for up to 300 documents (plus 400 tasks, 100 each of goals, plans, milestones,
   risks). Nothing is cached between turns, so every follow-up reloads it all.
    - Called from: `apps/worker/src/workers/agentic-chat/provider/chat-context-finder.ts:103` (every
      project turn), `chat-workspace-finder.ts`, `workflow/context-finder-port.ts`,
      `project-loop/driftEvidence.ts`, `apps/web/src/lib/services/agentic-chat-v2/context-finder-preview.server.ts`,
      the prototype `apps/web/src/lib/server/dump-sort/dump-sort.service.ts`, and three worker
      scripts.
    - Prod, projects chatted in over the last 90 days (22): **median 45k chars per turn, p90 384k,
      max 489k (9takes: 35 docs)**. Headings are about **1%** of the text.
2. **It ignores the stored outline.** It re-parses headings from full text
   (`parseContextFinderSections`, `packets.ts:56`, `:190`).
3. **The outline cache is mostly empty.** Only **189 of 593** live documents (32%) have an outline
   whose `content_hash` matches. Older docs predate the cache or were written by paths that skip
   `versioning.service`.
4. **The evidence block pushes text the agent didn't ask for.** After Jev ranks, `materializeContextPlan`
   (`evidence.ts:102`) injects up to **14,000 chars** of section text and openings (`select.ts:21-33`;
   pinned START HERE opening up to 8,000) into the prompt. DJ's rule 3 says the agent should get the
   card and ask for text itself. **Decision needed (see below).**
5. Also check: the broad-request project snapshot (`context-finder/snapshot.ts`) and anything else that
   selects `onto_documents.content` in bulk (grep `content` selects in `apps/worker/src/workers/` and
   `packages/*/src`).

## Plan

1. **Outline-first loader.** Load documents as `id, title, description, type_key, state_key,
outline, content_hash, updated_at` (no `content`). Build Jev packets and `sections` from
   `outline.nodes`. For a doc whose outline is missing or stale (`outline->>'content_hash' <>
content_hash`), fall back to loading that one doc's `content` and computing the outline (and,
   where safe, persisting it).
2. **Load text only after Jev picks.** Fetch `content` just for the documents in the plan, and slice
   by `char_start`/`char_end` from the outline. Keep the existing excerpt budgets until step 4 is
   decided.
3. **Backfill the outline cache.** A one-time script that computes `extractOutline(content)` for
   every live doc whose outline is missing or stale and writes only `outline` (the
   `update_onto_documents_updated_at` trigger already ignores outline-only writes). Find and fix
   write paths that change `content` without refreshing `outline`. **Ask DJ before running the
   backfill against production** (it's free and touches only a derived cache column, but it is a
   prod write).
4. **Decide what the agent receives up front (DJ call).**
    - **A (DJ's rule as written):** the evidence block carries cards only: title, description,
      outline, and Jev's top headings for picked docs. The agent calls `read_document_section` for
      text. Smallest prompt, but each read is another acting round (~4 s each, per S8's measurements).
    - **B (hybrid):** cards for every picked doc, plus text only for the 1–3 sections Jev scores
      highest, with a lower budget (e.g. 4–6k chars instead of 14k). The agent reads more on demand.
    - Measure both on the free replay/audit scripts (`apps/worker/scripts/context-finder-audit.ts`)
      before asking DJ, and bring numbers: prompt chars, rounds per turn, answer quality on the battery
      cases that rely on documents.
5. **Apply the same loader to the prototype** (`dump-sort-thread.ts` uses `loadContextFinderProject`
    - `buildContextFinderEntities`), and to the Workflow Lab preview.

## Measure (before → after)

- Document chars loaded per project turn (median, p90, 9takes): target ≤ ~20k at p90 with the
  outline present.
- Jev request bytes and cost per ranking (should not rise).
- Evidence chars injected per turn, acting rounds per turn, turn time p50/p90.
- Outline coverage: 189/593 → ~100% of live docs.

## Validation rules

- Free first: `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/context-finder`, the
  worker context-finder tests, and the audit/replay scripts.
- The live chat path changes, so run `pnpm agentic:prod-battery` once at the end. **Paid: ask DJ
  first** with the acting model and estimate (AGENTS.md).
- No schema change is expected. If one turns out to be needed, add a new migration and run
  `pnpm db:rehearse` (never edit an existing migration).
- Deploy: worker (chat), web (preview + prototype). Commit with explicit pathspecs.

## Exit

Context finder and every other bulk reader load outlines, not bodies; text loads only for picked
docs or on the agent's request; outline coverage ~100%; battery no worse; DJ has picked A or B for
step 4; deployed and spot-checked on a 9takes chat turn.

## Status 2026-11-05 — steps 1, 2, 3 (code), 5 BUILT, UNCOMMITTED

- **Loader** (`load.ts`): documents select `outline,content_hash`, never `content`. Stale or
  missing outlines read their text in one follow-up query (by id, chunked). The project carries
  `documentText`, a reader scoped to the same project and client.
- **Packets** (`packets.ts`): sections come from the stored outline (H1–H3, rendered heading HTML
  turned into plain text, anchors kept). Entities have `textLoaded` / `textChars` / `textHash`;
  `withContextFinderText` attaches text and re-measures if the document changed after the listing.
- **Text after Jev** (`finder.ts` `loadContextFinderPlanText`): only full-tier picked documents
  read their text. Selection budgets from outline offsets (`select.ts` `contextItemChars`, never
  under the real size). If the read fails, the document shows as a card (description + outline
  with anchors) instead of failing the turn.
- **Callers**: global-chat zoom (`workspace.ts`, `planWorkspaceZoom` now async), drift evidence
  (reads text only for recent changes, START HERE and fallbacks), `/lab/sort` thread, audit and
  replay scripts, and the `withContextFinderDocumentText` helper.
- **Keeping outlines fresh, for every writer**: the `embed_onto_entity` job (queued by a DB trigger
  on every title/description/content change, whichever path wrote it) now refreshes a stale
  outline first (`apps/worker/src/workers/embeddings/documentOutlineRefresh.ts`, called from
  `worker.ts`). The outline-only write re-enqueues nothing and keeps `updated_at`.
- **Backfill**: `apps/worker/scripts/backfill-document-outlines.ts`, dry run by default,
  `--apply` writes. Dry run 11-05: 199/609 fresh, 410 to write, 0 hash mismatches. **Not run
  with --apply (needs DJ OK).**
- Tests: runtime 343, worker 62, web 17 green; runtime + worker typecheck green; web
  svelte-check not run (one small server-file change).

### Measured (prod, read-only)

- Listing chars per project turn (117 projects): before median 1.2k / p90 60k / max 462k →
  today with this code p90 16k / max 144k → after backfill **p90 9k / max 89k** (the stored
  outline JSON carries anchors and offsets, so it's ~20% of the text on heading-heavy projects, not 1%).
- Listing time from a laptop, four biggest projects: 335–435 ms → 150–190 ms; 370–515 KB → 70–90 KB.
- Picked-doc text reads (11 recorded finder turns, 2–4 docs): p50 12k, p90 142k chars. PostgREST
  can't slice text, so a picked doc reads whole. A slicing RPC would cut this, but needs a
  migration. Not done.
- Replay of 5 recorded project turns through the new loader: every recorded section still
  matches a heading (4/4), and the rebuilt evidence matches the recorded size.
- Evidence block per turn: today 2–15k · **A** cards 2–7k · **B** top-2 sections, 5k cap 2–6k.

### Other bulk body readers: research 2026-11-05 (not changed)

Swept every `onto_documents` select that includes `content` (~35 sites). Most read one document
(fine) or need the whole text (export, merge, consolidation survey, radar dig at 60k). The ones
that load bodies only to cut a preview:

| Reader                                                                                                 | Loads                             | Keeps                     | Prod (read-only, 11-05)                                                       |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `/projects` Workspace cards (`workspace.service.ts:189`)                                               | ≤120 bodies per page load         | `excerptOf`               | 1 Workspace doc in prod (1.1k chars)                                          |
| `workspace-suggest` worker                                                                             | ≤80 bodies                        | 600 chars                 | same 1 doc                                                                    |
| Daily brief START HERE (`ontologyBriefDataLoader.ts:1941`)                                             | every START HERE of every project | 1,200 chars               | per user p50 1.2k, p90 7k; max 269k = DJ (56 docs)                            |
| Activation packet (onboarding + `/today`)                                                              | first 25 docs of the project      | 1 START HERE, 1,200 chars | p50 1.2k, p90 51k; top 5 (110k–374k) all DJ's projects; new projects are tiny |
| START HERE candidate pickers (`loadStartHereDocument`, create route, gateway, next-step, goal reverse) | ≤8–20 START HERE rows             | 1 doc                     | 110 projects have one; 6 have >1 (max 8); max doc 18k                         |
| Consolidation preview (`consolidation.service.ts:818`)                                                 | ≤12 bodies                        | 600 chars                 | on demand                                                                     |

Also dead: `freshness-radar` `loadDocumentContentHeads` (no callers outside the backtest script).

Conclusion: unlike the context finder (every doc, every chat turn), none of these is a user-facing
cost today; the heavy cases are DJ's own projects. The larger remaining per-turn cost is chat's
picked-doc reads (whole text, p90 142k chars, of which B keeps ≤5k).

Options:

- **Lean (no migration):** activation packet lists the 25 docs without `content` and reads START
  HERE in a parallel type_key query; delete `loadDocumentContentHeads`.
- **Ambitious (one migration):** stored generated column `content_excerpt = left(content, 2000)`
  (precedent: `content_hash`; RLS unchanged, no new function grants). Every preview reader above
  selects it instead of `content` (START HERE headings for the truncated note come from `outline`).
  Plus an invoker RPC that returns outline-offset slices, so chat's picked docs read only the
  sections they show (~5k instead of up to 142k). Rehearse with `pnpm db:rehearse`.

### Decided + done 2026-11-05 (later)

- **Step 4: DJ picked B.** `CONTEXT_FINDER_POLICY.agentBudgetChars` 5,000 and
  `agentSectionsPerDoc` 2 for everything that goes through `findProjectContext` (chat, workflow
  specialists, Workflow Lab preview, `/lab/sort`). Each picked document's evidence item carries a
  `card` (description + up to 8 sections with anchors), rendered as `Sections (anchor): …`; the note
  tells the agent to read other sections with `read_document_section`. Global-chat zoom shares
  scaled to [[5k], [3k, 2.5k], [2.5k, 2k, 1.5k]]. Drift review selects directly and keeps the
  14k ceiling. Replay of 5 recorded turns: blocks 2–7.7k chars (were 2–15k).
- **Backfill applied on prod:** 410 written, 0 skipped; coverage 609/609. No `updated_at` moved and
  no embed jobs were queued.
- Tests after B: runtime 937 (whole package), worker 62, web 30; runtime + worker typecheck green.

### Open

- Commit (pathspec), deploy worker (chat + main worker, for the embed-job outline refresh) +
  web; then the paid `pnpm agentic:prod-battery` (~$0.25 on
  DeepSeek V4.1 Flash; confirm the model with free `--preflight-only`) and a 9takes spot check.
