<!-- tasker/152-document-cards-not-bodies.md -->

# 152 — Document cards, not bodies (plan v2, reviewed 2026-11-05)

Follow-up to tasker 150. Reviewed independently: two passes, prod data spot-checked read-only.

## DJ's direction

- **Workspace notes:** show a condensed version of the note, plus whether we've detected that it
  belongs to a project.
- **Daily brief:** needs fixing.
- **No "first 2,000 characters" copy.** Previews come from the description (possibly AI-written)
  plus the topics the document covers.
- **Chat:** when Jev picks a document, the agent gets a card (summary, headings, the sections Jev
  flagged), not section text. The agent reads the full text with its tools when it wants it. This
  replaces tasker 150's "B" (card + top 2 sections).
- **Summaries:** written at the right moments (create, update), done smartly.

## Data (prod, 11-05)

- **Documents:** 610 live; 240 have a description.
- **Missing a summary:** 228 have no description and ≥200 chars. That is the backfill set.
- **Embed jobs:** 994 in 30 days on 494 docs, p90 3 per doc, max 7 per doc per hour. Summary cost
  is cents a month.
- **START HERE:** 126 docs, mostly unfilled templates. "What this is" is a median 18 words
  where present; 22 use "Vision & Summary" instead.
- **Workspace:** 1 doc; 0 workspace suggestions.

## The card

| Field   | Comes from                                                            | Notes                             |
| ------- | --------------------------------------------------------------------- | --------------------------------- |
| summary | the person's or agent's own `description`; otherwise `digest.summary` | AI-written fallback               |
| topics  | outline H1–H3 headings, live and free                                 | skip an H1 that repeats the title |
| text    | the text itself, when under ~280 chars                                | no summary; the card is the text  |

## Pieces

1. **Migration (one file):**
    - Add `onto_documents.digest jsonb {summary, content_hash, model, at, failed_at?}`.
    - Add `digest` to **both** comparisons in `update_onto_documents_updated_at`, including the
      START HERE branch, so a digest write never moves `updated_at`. Eight places use
      `updated_at` as an edit-conflict check.
    - No RPC.
    - Rehearse with `pnpm db:rehearse`.
    - Known side effect: like outline writes, a digest write fires
      `trg_agentic_chat_context_invalidation_upd`, which clears that project's chat snapshots and
      prepared prompts. That's small: at most one write per document change.
2. **Summary sweep** (`scheduler.ts`, every 5 min). No new job type and no debounce queue:
   `add_queue_job` dedupe keeps the first job and would drop an edit that lands mid-run.
    - Picks live docs where all of these hold:
        - `digest` is missing or its hash ≠ `content_hash`
        - `updated_at < now() − 3 min` (the doc has been quiet)
        - no description
        - ≥ 280 chars
        - not START HERE or a table doc
        - no recent `failed_at`
    - Newest first, `LIMIT 20`. That gives debounce, burst collapse, retry and a cost cap in one rule.
    - A deleted description makes a doc eligible again. A title-only change leaves the summary fresh.
    - Model call shaped like `workspace-suggest.ts:370`: models listed in code with fallbacks,
      `spendLimit`, `operationType`, ZDR provider order. The output is the summary only; topics
      come from headings.
    - Backfill (about 228 docs) is gated behind a flag and is a paid run that needs DJ's OK.
      Without it, only docs changed after deploy get summaries.
3. **Chat cards (card-only):**
    - Each Jev-picked doc arrives as summary + headings, with the flagged sections marked and
      their anchors: "Jev flagged: Budget (#budget)". No section text.
    - The note tells the agent to read with `read_document_section` (it takes `anchors[]`)
      before quoting.
    - Text under 280 chars is shown whole.
    - The picked-doc text read goes away entirely.
    - Optional: `read_document_section` accepts several documents in one call.
    - The context finder's card uses `digest.summary` when the description is empty.
4. **Workspace card (`/projects`, phone too):**
    - `loadWorkspaceHome` selects `description, digest, outline`, not `content`.
    - It fills the existing `excerpt` field (mobile and search read it) from the card. Short or
      not-yet-summarized notes show their text.
    - The "→ Project?" chip already shows the detection.
    - Lean vs ambitious for "only in that context" is DJ's call (below).
5. **Daily brief:**
    - Replace the 1,200-char cut with START HERE orientation (`extractStartHereOrientation`;
      handles both styles), "Current state" only when real text was written, and the status
      region.
    - Skip the block when the template is unfilled.
    - Select candidates without `content`, pick in JS, read one body per project.
6. **Activation packet:** list the 25 docs without `content`, read START HERE on its own, and show
   its orientation paragraph.
7. **Delete** `freshness-radar` `loadDocumentContentHeads`: the interface member, the
   implementation and the backtest stub.

**Dropped:**

- `read_document_slices` RPC:
    - no caller once chat is card-only
    - the service client means no RLS
    - UTF-16 vs code-point offset drift on 30 docs with emoji
- Summary card for the suggest worker: raw note text matches better.
- The 15% "small edit" rule: notes have no headings, so a stale summary could stick forever.

## Open for DJ

- **"Only in that context":**
    - Lean: the chip stays and filing takes one tap.
    - Ambitious: auto-file confident matches with a 5 s Undo (like the AI Inbox).
- **Paid backfill** (~228 docs) and the **paid battery** for card-only chat. Each needs an
  approved estimate.

## Also

- Add the AI summary to `docs/privacy/DATA_INVENTORY.md`.
- `pnpm gen:all` touches `packages/shared-types/src/database.schema.ts`, which other sessions have
  modified. Coordinate before regenerating.

## Order

1. Migration
2. Sweep + tests
3. Chat cards + replay (free)
4. Workspace, brief, activation, radar
5. Deploy
6. Paid backfill + battery (DJ's OK)

## Status 2026-11-05: BUILT, UNCOMMITTED, undeployed

DJ's calls: ambitious auto-filing; backfill only his projects; everything else as planned.

- **Migration `20261105150000_document_digest.sql`: APPLIED to prod and recorded.** Adds the
  `digest` column; the recency guard ignores it. Types updated by hand (CLI gen needs a token),
  then the schema was regenerated.
- **Cards:** `shared-agent-ops/utils/document-card.ts`. Each card is the description or AI
  summary, plus headings as topics; a short text is shown whole.
- **Summary sweep:** `apps/worker/src/workers/document-digest/documentDigest.ts`, every 5 minutes
  in `scheduler.ts`. Kill switch: `DOCUMENT_DIGEST_SWEEP_ENABLED=false`.
    - Reasoning is off, `maxTokens` 400. Thinking tokens had eaten the cap: 30 of 98 came back
      empty on the first pass.
    - Prompt v2: English unless the document is in another language (one doc came out in French).
- **Backfill, DJ's projects:** 97 of 98 summarized for $0.044. No `updated_at` moved and no embed
  jobs were queued. One doc fails both attempts (`invalid_response`); its card shows headings
  only.
    - Script: `apps/worker/scripts/backfill-document-digests.ts --email <owner> [--apply]`
- **Chat: card-only.**
    - `context-finder/card.ts`, plus `documents: 'card'` in select, materialize, finder and the
      global zoom.
    - Picked documents read no text unless they have no headings and no summary (short notes are
      shown whole).
    - The global block now renders cards.
    - Pinned items and drift still load text. `/lab/sort` (text mode) is unchanged.
- **Workspace (`/projects`):**
    - The list has no bodies; text is read only for cards without a summary.
    - `LooseCard` shows up to 3 topic chips.
    - Auto-filing: open `file` suggestions at confidence ≥ 0.85, documents only, run when the
      Workspace opens (`POST /api/workspace/suggestions/auto-file`). Each one shows a 5 s toast
      with Undo.
    - Undo moves the note back and dismisses the suggestion (`action: 'forget'`), so it is never
      re-proposed.
- **Brief:** START HERE orientation + "Current state" (only when written) + status. Unfilled
  templates are skipped, and bodies are read only for the picked docs.
- **Activation packet:** the list has no bodies; START HERE is read separately and shows its
  orientation paragraph.
- **Removed:** `loadDocumentContentHeads`.
- **Privacy:** `DATA_INVENTORY.md` lists `digest`.
- **Checks:**
    - Runtime: 941 tests (whole package).
    - Worker: focused tests (105 + 6 digest) and typecheck pass.
    - Web: svelte-check 0 errors, focused tests 105 pass, guardrails OK.
- **Deploy:** web, plus the worker (main for the sweep, chat for the card-only runtime). Fix the
  Railway Node vars before the worker deploy (security audit). Then the paid battery
  (~$0.25 on DeepSeek V4.1 Flash), which needs DJ's OK.
