<!-- tasker/149-ai-inbox-assistants-desk.md -->

# 149 — AI Inbox: Assistant's Desk (ambitious)

**Owner decision 2026-10-29 (DJ):** build the ambitious version; auto-apply ON by default for
reversible changes (with Undo); clear the 41 old audit-homework items in production (done, see
below). Proposal + mockup: https://claude.ai/artifact/8aStPJzJgTSi6RcR496r8N

## Why

The inbox checked filing, not follow-through. On 2026-10-29: 66 planned tasks on DJ's active
projects were past due and still open (25 in Wayne Strategies) and the inbox asked about none; ~41
of ~150 open items were audit homework with Done / Not needed / Discuss buttons that did not fit;
the radar's auto-apply fired 0 times in 30 days. Items were grouped by how safe a change is, not by
what it asks of the user.

## Product shape

Items are sorted by what they ask of you, each with its own card:

| Kind             | Source                                                       | Answer                                                     |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Did this happen? | overdue open tasks on active/planning projects (lane A)      | Done / Move / Drop per task; "Tell me how it went" chat    |
| Still on?        | active/planning project, quiet 45+ days, with overdue tasks  | Pause / Finished / Still on                                |
| Pick a path      | `ask_kind: 'path'` items and pre-written asks (lane B)       | 2–3 answers, recommended marked                            |
| Tidy-ups         | `ask_kind: 'tidy'` (verified safe moves/archives)            | Apply all, with a before/after doc tree                    |
| Out of date      | `ask_kind: 'stale'` (radar records, findings with no change) | Update / It's fine / Talk it through                       |
| Want me to…?     | `ask_kind: 'offer'` (audit recommendations)                  | Yes, ask me (chat, assistant first) / Not for this project |
| Done for you     | auto-applied tidy-ups (lane C)                               | Undo                                                       |

## Contracts (foundation, landed first)

- `packages/shared-types/src/project-loops.types.ts`: `InboxAskKind`, `ProjectCleanupAnswer`
  (`action: apply | dismiss | done | note | chat`), `ProjectCleanupAsk` (`item_ids` = lineage ids,
  2–3 answers, ≤1 recommended), `ProjectCleanupAutoApplyScores`, `ProjectCleanupAutoApplied`;
  `ProjectCleanupSynthesis.asks?`; `ProjectCleanupItem.ask_kind?`;
  `ProjectCleanupItemRow.tree_operations?` (raw move/archive steps only);
  `ProjectCleanupView.asks?`, `.auto_applied?`.
- `packages/shared-agent-ops/src/project-cleanup.ts`: `cleanupAskKind`, `openCleanupAsks`
  (narrows synthesis asks to open items; drops `apply` answers when a covered item has nothing to
  apply; each item in at most one ask), `loadRecentAutoApplied` (7 days).
- **Auto-applied row contract:** `project_suggestions.status = 'applied'`, `applied_at`,
  `result.applied_via = 'auto'`, `result.headline`, `result.auto_apply = { scores, reason, model,
question_set_version }`. Undo sets `status = 'rejected'`,
  `user_feedback.reason = 'undone_auto_apply'`, `result.undone_at`.
- **Answer actions on the card:** apply → approve the items' verified rows (fingerprints from the
  card); dismiss → `dismiss` with reason `not_relevant`; done → `address`; note → `POST
.../cleanup/note` per item with `"<question> — <label>: <effect>"`; chat → open chat on the first
  item (assistant speaks first).

## Lanes

- **A — Check-ins (web).** `inbox-check-ins.service.ts`, `/api/inbox/check-ins` (GET, POST answers
  with restore for Undo), `/api/inbox/check-ins/chat` (assistant-first project chat),
  `InboxCheckIns.svelte`, modal integration, inbox count.
- **B — Pre-written asks (worker).** Roll-up output gains `asks`; parsed and validated in
  `cleanupSynthesis.ts`; prompt in `generators.ts`.
- **C — Jev auto-apply (worker + web undo).** After the roll-up, Jev scores each verified safe
  tidy-up on four questions (about / wanted / review / safe); code applies those that clear the bar
  for their kind (moves only: 0.85 / 0.75 / ≤0.65 / 0.85; anything that archives: 0.85 / 0.80 /
  ≤0.30 / 0.90; DJ picked the split bar 2026-10-29), max 8 per pass, kill switch `PROJECT_CLEANUP_AUTO_APPLY=off`, skips
  a tool the user undid in the last 30 days. Web `POST /api/onto/projects/[id]/cleanup/undo`.
- **D — Card UI (web).** `InboxProjectCleanup.svelte` blocks by ask kind, ask cards, tidy tree
  preview (Now / After), offers, Done for you with Undo.

## Done 2026-10-29

- Audit boilerplate recommendations removed for future audits (`projectLoopWorker.ts`).
- Paused/finished projects sort last; rail shows real workload; assistant-first chat opener;
  radar "Fix in chat" opens on the record (`inbox-chat-opener.ts`).
- **Production cleanup:** 41 pending `audit_recommendation` rows (all DJ's, 12 projects) set to
  `rejected` with `user_feedback.reason = not_relevant` and a note; 15 parent audits' counts
  refreshed (12 closed as `reviewed`); 3 empty cleanup cards expired. Backups:
  `backup_audit_recs_2026-10-29.json`, `backup_audits_2026-10-29.json` in the session scratchpad.

- **Browser check (2026-10-29, view only):** local dev needs sign-in, so a temporary
  `design-system/zz-*` page rendered the real Wayne Strategies cleanup view, its 25 overdue tasks
  and the quiet "BuildOS CEO Training Sprint" with every `/api` call stubbed (page deleted after).
  All blocks render; the tidy tree's Now/After works on the real tree (22 → 16 top level). Fixes
  from the check: older check-in days fold to one line with a preview and Mark all done (Wayne's
  card 2,420 → 950 px); single-task days carry "Tell me how it went" in the header; the
  duplicate "0 of N answered" tally is screen-reader only; a radar bundle's chat-facing summary
  no longer prints above its records (card and triage); project type keys read as words
  ("service strategy") in headlines and What changes (`projectTypeLabel`).

- **Paid live dry run (DJ approved, 2026-10-29, after DJ deployed):** Wayne Strategies, nothing
  written, **$0.0029** total (roll-up `deepseek/deepseek-v4-flash` $0.0026 in 105 s; Jev
  `typesafe/jev-1.13-20260917` $0.00028). Roll-up wrote 3 questions; one mixed a change with a
  note, so code dropped its "apply" answer and left only "No / Let's discuss". **Fix:** an ask that
  loses its apply answer is dropped (worker parser + `openCleanupAsks`), and the prompt says not to
  mix them. **Jev auto-apply: 0 of 10 passed** (v1 saw titles only; review 0.26–0.68, wanted
  ≤ 0.83; closest was Archive "AI Guy Pitches" at wanted 0.83). **Change (v2):** Jev now sees each
  record's last-edited day, emptiness and size, `proposed_since`, the owner's recent filing
  answers, and that changes land in "Done for you" with Undo. Bar unchanged. Free dry run: facts on
  all 10 candidates, request 43 KB. Re-scoring with v2 needs DJ's OK (~$0.003). Needs a web +
  worker redeploy.

- **Deployed `5e54b20f5` (web on Vercel + all 3 Railway services), 2026-10-29.** No real pass has
  run on it yet; passes run nightly ~03:00–04:00 UTC. CI was red on an unrelated mock gap
  (`op-execution-gateway.entity-access.test.ts` lacked `toProjectKind`); fixed locally,
  uncommitted.
- **v2 re-score (DJ approved), $0.0030:** 2 questions, both keep Yes (fix confirmed). Jev v2
  still passes **0 of 8** (2 items went to a question). Scores (about / wanted / review / safe):
  AI Guy Pitches .90/.81/.24/.97 · Processes & Specs .89/.79/.52/.91 · Outreach clients
  .86/.76/.45/.93 · Brand Direction .87/.80/.62/.95 · LA Industrial .77/.71/.42/.87 · Jim Acosta
  task .80/.74/.52/.78 · Book Research .84/.69/.54/.72 · Blog bundle .77/.66/.57/.63. Jev ranks
  sensibly but "wanted" tops out near 0.81, so the 0.85 bar never fires. **DJ picked the split
  bar** (moves looser, archives strict). Replayed on these scores: 4 of 8 apply (Processes & Specs,
  Brand Direction and Outreach clients moves; empty "AI Guy Pitches" archive). Needs a worker
  deploy; first real run is the next nightly pass.

## Cleared pile (DJ, 2026-10-29: "fire it off immediately… bottom right… show I'm getting things done")

Answering no longer locks the card. DJ picked the ambitious version (one pile for every inbox answer)
over a tile per click.

- **Flow:** any answer (cleanup asks, tidy-ups, Not needed / Already handled / Update it, notes,
  check-in Done / Move / Drop / Mark all done / Pause / Finished, the walk-through) leaves its card at
  once, flies to a bottom-right **Cleared** pile ("Cleared 7 · 1 saving"), waits 5 s with Undo
  (button or ⌘Z), then saves in the background. A failed or changed save puts the item back on its
  card with why ("Updated — review again" / "Not applied: …"); the pile says "N back on your card".
- **Store:** `lib/stores/inbox-cleared-pile.svelte.ts`: lanes (one per project, in order), merges
  neighbouring cleanup answers into one POST (≤40 decisions), `isHidden(key)` so a card rebuilt from
  an older view never shows an answered item, flush with keepalive on `pagehide`.
- **Wiring:** `cleanup-outbox.ts` (cleanup POSTs + notes through the pile, `withoutAnsweredItems`),
  `InboxClearedPile.svelte` (portaled to `<body>` as a `modal-root` at z 10002 so the open inbox
  doesn't make it inert; lazy-mounted from `+layout.svelte` on the first answer; fades 6 s after the
  inbox closes and everything saved; failures stay until dismissed), `pile-fly.ts` (chip flies from
  the card to the pile; off for reduced motion). The pile publishes `--cleared-pile-offset`; the
  inbox pane adds a bottom spacer and the tidy-ups sticky bar sits above it. The walk-through no
  longer waits for its saves on exit. The modal keeps fresh views from saves (`handleCleanupDecided`
  patches the item) and leaves answered items out of "Triage N".
- **Checks:** svelte-check 0 errors (9,941 files); 118 tests in the inbox, dashboard and pile suites
  (new: 8 store + 5 pile tests; check-in and cleanup tests rewritten for the new flow). Browser check
  (scratch page with real Wayne data, every save stubbed, page deleted after): question card and 10
  tidy-ups leave at once, count climbs, Undo restores, a "changed" save comes back with its badge,
  answered items stay hidden after the card rebuilds, check-ins clear row by row, no console errors.
  Phone width not checked (window resize is a no-op and the page refuses framing).
- **Known:** the server still runs each save plus a full re-verify (up to minutes); that now
  happens out of sight. Rows shift up as you answer, so a fast double-tap can answer the next row
  (Undo covers it). Undo exists only during the 5 s hold; after that, Done for you's undo applies
  only to auto-applied changes.

## Exit

- All lanes built, tests and `svelte-check` green, browser check of the modal.
- Paid check (needs DJ's OK first): one live review pass on Wayne Strategies to see asks and
  auto-apply decisions; record Jev scores and cost.
- Deploy web + worker together (worker writes `asks` and auto-applies; web renders them).
