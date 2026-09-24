<!-- tasker/100-chat-reply-polish-from-book-loop.md -->

# Tasker 100 — Chat reply correctness and polish (book loop, prod)

**Status:** Built, uncommitted (2026-09-23): all seven bugs fixed in code with free tests green; deploy, `pnpm agentic:gate`, and the p01/p07 prod replays pending DJ approval; CI item already fixed on HEAD · **Opened:** 2026-09-23 · **Source:** book loop on DJ's real project in prod,
turns `p01`–`p08` (`output/book-loop/p0*.json`; driver: `BOOK_LOOP_TARGET=prod scripts/book-loop/turn.sh`).
**Ledger:** `scripts/book-loop/ISSUES.md`, the items marked "tasker 100".
**Scope guard (DJ):** fix what helps every user; no overengineering for the test case; no regex or
keyword rules on free text (AGENTS.md). Prefer prompt, tool-result and context fixes.

## Bugs (ranked by user impact)

1. **Wrong link domain.** Replies link `https://buildos.com/projects/...`. The real domain is
   build-os.com, so these links are broken. It happened in p06 and p07 (same session; the model copies
   its own earlier links). Other replies use relative `/projects/...`, which works. No code or config
   emits `buildos.com`; the model invents it.
    - **Fix:** tell the model links are relative app paths (or supply the absolute origin in context).
    - **Optional:** a validator on the final text that rewrites or strips absolute links to a foreign
      host. This is a URL, which is a structured format, so it's allowed.
2. **Narration leaks into the answer.** Nearly every prod reply opens with blank lines and then 1–4
   "Let me check…/Let me read…/I need the full document…" lines streamed before the real answer
   (p01, p02, p04, p05, p07). It reads as noise to the user.
    - **Investigate:** are these acting-pass text deltas emitted before tool calls, and persisted into
      the final message? Decide whether pre-tool text should be transient (shown while working, dropped
      from the saved reply) rather than part of the answer.
    - Ledger items 8 and "leading blank lines" are the same family.
3. **Documents written in the third person about their owner.** BuildOS-authored content in DJ's own
   outline says "the user flagged…", "user-approved idea", "user wants…", and a reply quoted it back
   ("The user asked for…", p01).
    - **Fix:** doc-writing guidance: documents are the user's, so write in neutral or second-person
      voice ("DJ" or "you"), never "the user".
    - Clean the existing outline lines in-book later, via BuildOS, not by hand.
4. **Invented facts in status answers.** p01 said "Day 1 of the project". The 100-day clock start is
   an open question, and the project was created 2026-08-20. Check whether anything in context
   suggests "Day 1". If nothing does, it's a grounding lapse; fix the status-report guidance so
   unknown quantities stay unknown.
5. **A stale `next_step_short` is quoted as current** (ledger item 12). Find which job wrote
   "Draft the one-page book overview" (the classifier's next-step generator,
   `chatSessionActivityProcessor.ts`?). Either ground it in current project state, or stop the chat
   from treating it as authoritative when START HERE or recent changes disagree.
6. **Markdown links with a bare UUID as the URL** (ledger item 9, t08c). Links must be app paths.
   Same fix family as bug 1.
7. **Generic failure after an exhausted review.** p02 said "I couldn't complete an internal check…
   Please retry." Confirm whether tasker 99 fixed this. If not, the final message should say what was
   attempted and why it was blocked.

## Also (quick, unowned)

- **CI is red:** `apps/worker/tests/contextFinderPilot.live.test.ts` lines 331–352, `plan` is
  possibly null (4 TS errors). Add a null guard; confirm with the context-finder owner if they're
  active.

## Acceptance

- Replay p01 ("where are we at") and p07 (a multi-edit outline update) on DJ's project, after DJ
  approves each paid run (about 1–2¢ each):
    - no foreign-host links;
    - no "Let me…" lines in the saved reply;
    - no "the user" in newly written doc text;
    - no invented day count.
- Unit tests for any link validator. Use an LLM-judge rubric rather than phrase asserts for prose
  behavior.

## Progress (2026-09-23)

- **1, 6 links:** Final Response Contract says link the exact `record_references` url (relative
  `/projects/` path). `apps/web/src/lib/utils/assistant-app-links.ts` repairs any-host
  `/projects/<uuid>` links to relative and unlinks bare-id targets, both in the chat renderer
  (`markdown.ts`, so already-saved replies render right) and in replayed history
  (`history-composer.ts`, so one bad link is not copied forward). 8 unit tests.
- **3 voice:** one Safety-rules line (documents are the owner's pages; plain statements; never "the
  user"; replies say "you") and one START HERE capture-prompt line. Existing outline text still
  says "the user": clean it with an in-book BuildOS turn (paid, DJ OK).
- **4 Day 1:** nothing in context said "Day 1"; START HERE carries a stale "100-day clock started
  (2025-04-14)" stamp plus "Phase 1 (Days 1–7)". Contract rule now: a day count only from a
  recorded start date; if open, say so.
- **5 next step:** written at chat close by `generateNextSteps` from tasks + logs + its own previous
  step, never START HERE, and rendered as "Current next step". Now labeled "Saved next step (may
  predate recent work)", the re-entry rule draws the next move from the work, and the generator
  reads START HERE first and marks its previous step as possibly stale.
- **7:** the "internal check… retry" copy is gone since 5014e3ef5 (p02 ran before it). The
  revision-cap path now names what it held back: `review_exhaustion` carries the rejected batch's
  tool names (`turn-state.ts`) into `streamReviewExhaustion` (`review/lanes.ts`), e.g. "I couldn't
  complete the plan to create 4 tasks: my safety check still found problems with it after repeated
  revisions. Nothing was saved." `link_onto_entities` now reads "link records", not "link a entities".
- **2 narration:** `streamActingPass` (`turn-provider.ts`) now holds every pass's prose and releases
  it only from a pass that ends without tool calls; tool-pass prose is dropped (the flag-gated live
  preview still shows it while the pass runs). `textDelta` (`turn-state.ts`) strips the turn's
  opening blank lines. Whitespace-only final prose now takes the empty-reply repair. Removed the
  dead `requestOffersSemanticDisposition`/`callsIncludeSemanticDisposition`. Two provider tests that
  pinned the old narration were rewritten to assert it is gone.
- **Validation (free):** worker agenticChat\* 1,643 pass (8 postgres crash-cut/restart tests failed
  only under the parallel run and pass alone); web prompt/link/history 109 pass; worker source
  typecheck clean; lint clean. Paid: `pnpm agentic:gate` (~$0.29 DeepSeek) and p01/p07 replays
  (~1–2¢ each, after deploy) NOT run.
- **CI:** the `contextFinderPilot` null guard is already on HEAD (worker test-type debt 0). CI is red
  again from 4 web test-type errors in other sessions' files (RichMarkdownEditor.state.test,
  reset-password page.server.test, ontology-write-executor.write-integrity.test).
- Prompt budget re-baselined (system 11,439 → 11,849 chars) with a dated comment.

## Gate (2026-09-24 02:55 UTC, f46e9090c, DeepSeek v4.1 flash)

`output/agentic-gate/tasker100-20260924T025502Z`: **FAILED**, score 48/52 (92.3%, best recorded;
previous DeepSeek gates 43/52 and 38/52). 44/45 turns end-to-end pass. Failures:

- Case 13 rep 2 `transport_failure`: the isolated gate DB stalled ~40s from 03:13:42 (a prompt-snapshot
  write took 11.9s, then claim/ack/claim_pending_jobs hit statement timeout 57014); all 4 parallel
  reads failed. Not in the text path.
- Case 2 rep 1 took 62.0s (limit 60s); reps 2/3 53.4s/50.8s. Earlier gates had 70.1s and 76.2s here.
  Tasker 100 checks across all 44 saved replies: 0 open with whitespace, 0 open with narration, 0
  absolute `/projects/` links. Spend: $0.2956 key-usage delta, $0.2620 from 168 pass receipts. An
  earlier attempt the same night failed at readiness (turn-lease migration missing in the gate DB) for $0.00.
  Prod: the chat-worker deploy failed its healthcheck (turn-lease migration not applied in prod); the
  worker-side fixes are not live until the migration is applied and the worker redeployed.
