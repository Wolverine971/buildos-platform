<!-- tasker/99-surgical-document-edits.md -->

# Tasker 99 — Surgical document edits in chat (remove or replace a line without rewriting the doc)

**Status:** p04 passed in prod; preview-before-review live since 4ebe44389 (no flag, not gated); 09-23 review fixes committed (Undo patch parses the outline once, section edits fail closed on offset drift, strict Undo re-anchoring, in-order batch previews, prepend spacing, legacy executor write guard); p05 replay + gate pending DJ approval; durable "Undone" card state still open · **Opened:** 2026-09-23 · **Source:** book loop on DJ's real project (prod),
turn `p02-drop-exclusions` (`output/book-loop/p02-drop-exclusions.json`), session `55169006-cde9-487b-8b40-1468d83b02a4`.
**Scope guard:** a general tool capability for any long document. Not book-specific; no lexical rules.

## What happened

DJ: "Exclusions are no longer relevant. Remove the Exclusions line from the Book Contract, and the
exclusions mention from the Book Contract task." The target doc, `Book Contract & Chapter Blueprint
Template` (`1cad2618…`), is about 11K characters and holds the whole chapter outline. Result: 202s,
**nothing changed**, finish `semantic_review_failed`, and the user saw "I couldn't complete an internal
check… Please retry." Cost about 5¢ in total, across 19 passes: 4 mutation reviews and 2 repairs of
about 4.6K and 2.2K reasoning tokens.

1. **Unsafe edit, correctly blocked.** `update_onto_document` offers only `replace` (resend the whole
   doc), `append`, or `merge_llm`. The model sent only the Phase 1/2 text with `replace`, which would
   have **deleted the entire outline**. The mutation reviewer blocked it ("would replace the entire
   document… deleting the existing chapter cards").
2. **Wrong target, correctly blocked.** "the Book Contract task" was aimed at `349ae31e` ("Complete
   chapter and framework blueprint") instead of `078dad14` ("Draft and finalize one-page Book
   Contract"). The reviewer caught it with an `argument_checks` correction.
3. **Revision budget ran out** after repeated full-document rewrites, which ended in a generic
   failure message.

## Root cause

The chat cannot make a small, targeted edit to a long document. Removing one line means reproducing
about 11K characters verbatim, which is expensive, error-prone for a flash model, and hard for the
reviewer to verify. Or it means an opaque `merge_llm` rewrite. A patch kernel already exists:
`packages/shared-agent-ops/src/ontology/document-patch.ts` (`DocumentPatchV1`: anchors, `before_hash`,
conflict reasons including `MANAGED_REGION_BOUNDARY`). It powers document proposals, but chat tools do
not expose it.

## Fix direction (pick the smallest that works)

- Add an exact-match edit mode to `update_onto_document`, for example
  `edits: [{ old_text, new_text }]`, in the style of a code editor's string replace:
    - each `old_text` must occur exactly once;
    - an empty `new_text` deletes;
    - apply through the `DocumentPatchV1` kernel so managed START HERE regions and races stay protected;
    - fail with a clear `ANCHOR_NOT_FOUND` / `ANCHOR_AMBIGUOUS` result the model can recover from.
- Catalog text: prefer `edits` for changes to part of an existing document; reserve `replace` for
  whole-document rewrites.
- The mutation reviewer then judges a small diff, not an 11K blob. Check the reviewer prompt's
  "byte-for-byte" rule for how it applies to edits.
- Make the user-facing failure after an exhausted review say what was attempted and why it was
  blocked, instead of "internal check… retry".

## Acceptance

- Replay p02 on the real project, or on a scratch doc with the same shape. Both mentions are removed:
  the doc line via `edits`, the task via a `description` update. The outline is untouched (diff shows
  only the removed line), there is one review round, it takes about 30s or less, and the right task is
  targeted.
- Unit tests: unique match; zero or multiple matches rejected; deletion; managed-region edit
  rejected; stale-base conflict.
- Paid replays or gates need DJ's approval (AGENTS.md).

## Build log — 2026-09-23 (ambitious route, DJ-approved design)

DJ's product calls: edits apply immediately (no approve step); a GitHub-style toast
"<doc> updated · +X −Y" that expands to the diff; the change persists as a chat card
with the diff and one-click Undo. The internal mutation reviewer stays and now judges
small old_text → new_text pairs.

Built (unit/integration tested; web svelte-check 0 errors; worker/runtime/shared typecheck clean):

- Kernel `packages/shared-agent-ops/src/ontology/document-edits.ts`: `resolveDocumentEdits`
  (exact → typographic fold → copied line-number prefix; unique unless `replace_all`;
  "did you mean line N" hints; all-or-nothing), section `replace|delete|append|prepend|move`
  by heading anchor, `findInDocument`, `summarizeDocumentChange` (+/- lines, bounded hunks,
  `revert_patch` ≤ 40K chars), `largeDeletionRefusal` (whole-body replace dropping >30% of
  a ≥1.5K doc needs `allow_large_deletion`). Everything applies through DocumentPatchV1.
- Gateway `onto.document.update` (chat worker + MCP connectors): `edits`, `section_edits`,
  `allow_large_deletion`; edits re-anchor after a CAS conflict and fail closed; receipt
  carries `document_change_status` + `document_change`. MCP strips `revert_patch`.
  START HERE capture/thinking log pass `allow_large_deletion: true`.
- Tasks: a description edit now syncs the legacy `props.description` copy (68 prod tasks
  had diverged; the p02 reviewer demanded both be edited).
- Chat: `get_document_outline({ find })` returns exact lines; the `document_workspace`
  skill no longer tells the model to rebuild a document from section reads (the p02
  behavior); reviewer, literal check, write ledger, repair gate, and model compaction
  understand edits; exhausted review now says what was held and that nothing changed.
- UI: rich toast with expandable diff; end-of-turn `DocumentChangeCards` (merged per
  document, restored on reload); `POST /api/onto/documents/[id]/revert-change` Undo
  (user-scoped, write access, CAS + one retry, 409 on a changed passage).
- Budgets re-baselined with notes: worker project surface 61,200 → 62,600 B; web
  canonical payload 76,600 → 78,100 chars (only unnarrowed passes pay it).

Files (pathspec commit; shared files may also hold other sessions' hunks — review diffs):
`packages/shared-agent-ops/{package.json,tsup.config.ts,src/index.ts,src/ontology/document-edits*.ts,src/gateway/op-execution-gateway.{config,core,tasks}.ts,src/gateway/op-execution-gateway.{documents,tasks}.test.ts}`,
`pnpm-lock.yaml`,
`packages/agentic-chat-runtime/src/{catalog/definitions/ontology-{read,write}.ts,loop/{repair-instructions,write-ledger,tool-payload-compaction}.ts,loop/tool-payload-compaction.test.ts,tools/ontology-reads.ts}`,
`apps/worker/src/workers/agentic-chat/{mutationToolCatalog.ts,provider/turn-provider.ts,provider/validation.ts,provider/review/mutation-batch.ts}`,
`apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts`,
`apps/worker/tests/{agenticChatTableMutationAdapter,agenticChatTurnProvider,agenticChatWorkerSurfaceBudget,agenticChatUnappliedWriteCopy}.test.ts`,
`apps/web/vitest.config.ts`, `apps/web/src/lib/server/{agent-call/mcp-connector.service.ts,document-change-revert.service.ts}`,
`apps/web/src/routes/api/onto/documents/[id]/revert-change/`,
`apps/web/src/lib/services/agentic-chat/tools/core/{executors/ontology-write-executor.ts,tool-executor.test.ts}`,
`apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md`,
`apps/web/src/lib/services/agentic-chat-lite/prompt/prompt-size-budget.test.ts`,
`apps/web/src/lib/components/agent/{DocumentChangeCards.svelte,DocumentChangeCards.test.ts,document-change-cards.ts,document-change-cards.test.ts,agent-chat-sse-handler.ts,agent-chat-sse-handler.test.ts,agent-chat-session.ts,agent-chat-session.test.ts,agent-chat-timeline.ts,agent-chat-tool-presenter.ts,agent-chat.types.ts,AgentMessageList.svelte,AgentChatModal.svelte}`,
`apps/web/src/lib/components/ui/{DocumentChangeDiff.svelte,Toast.svelte,Toast.test.ts,UnifiedDiffView.svelte}`,
`apps/web/src/lib/stores/toast.store.ts`, `apps/web/src/lib/utils/document-diff.ts`.

Not done / pending:

- Paid acceptance: replay p02 (DeepSeek V4 Flash, a few cents) + `pnpm agentic:gate` (~$0.29) — need DJ approval.
- No browser pass of the toast/card yet (local dev must be restarted first: a stale
  `tsup --watch` from an old `pnpm dev` rebuilds shared-agent-ops dist without
  `dist/ontology/document-edits.*`).
- Not built: resolving edits before review (a missed anchor still costs one review round);
  `edits` on task/goal descriptions (tasks are short: p99 1.3K chars); a deep link straight
  to a document's History panel; body diff in staged agent-run change-set reviews.

## Follow-up from prod (2026-09-23, after 5014e3ef5 deployed)

**Win (p04, the exclusions replay):** 69s, about 1¢, 1 review, first-try approve. The diff was exactly the
removed line plus the task description. The catalog example (`old_text: "**Exclusions:** TBD"`) mirrors
this test case, so swap it for a neutral example so the replay proves something general.

**Failure (p05, 4 card edits in one call; session `f6b4c208-0912-4ca6-a0c9-fbe8b2b19cf0`,
`output/book-loop/p05-outline-edits.json`):** 177s, about 4.3¢, **nothing saved**, finish
`mutation_unfulfilled`.

1. **Oversized anchors.** The model used whole cards (438–757 characters) as `old_text`. The 517-character
   Card 5 anchor silently dropped a middle line (`- **Example / evidence:** **[GAP]**`), so
   `ANCHOR_NOT_FOUND`, and all-or-none meant 0 of 4 applied, although edits 1–3 matched exactly.
    - **Fix:** catalog and tool guidance should say to keep `old_text` to the _smallest_ unique span
      (usually one line) and to edit lines, not whole blocks.
    - Consider whether the error should report "edits 1–3 matched" so the retry changes only edit 0.
2. **Recovery died in review.** The tool error itself was good ("Did you mean line 56? Copy exactly…";
   `get_document_outline find` then returned exact lines). But the re-proposal was rejected twice:
    - first: "the proposal's review used a SHA-256 different from the exact batch digest supplied";
    - then: "retry of the same previously rejected batch… supplied SHA-256 now resolves the held batch as
      f7562fdb…".

    The acting model appears to have re-proposed stale arguments, or the batch binding after a failed
    execution is off. Investigate the revise-after-execution-failure path in
    `provider/review/decision-completion.ts` / `mutation-batch.ts`. A failed execution should hand the
    actor a clean "correct and resubmit" with no SHA confusion.

3. The reviewer suggested `section_edits`. Check whether that mode exists; if it doesn't, the reviewer
   prompt is inventing an argument.

**Acceptance add:** replay p05 (`output/book-loop/p05-msg.txt`) on a copy of the outline, or on DJ's
doc with his approval, since the edits are his real intent. All four card edits land with 1–2 reviews,
and the diff touches only those cards.

## Follow-up build — 2026-09-23 (after p04 win / p05 failure), UNCOMMITTED

Root cause of p05, from prod turn events (`chat_turn_events`, run `6b335d49…`): the first review approved all four
card edits; execution then failed on edit 0 (a 517-char block anchor missing line 59), and every re-proposal
went back to the reviewer, which could not verify anchors against compacted reads and conflated the held
batch with the failed one (the SHA remarks were reviewer noise; the actor's re-proposals had new digests,
`21aab594…`, `f7562fdb…`). `section_edits` does exist (shipped in 5014e3ef5); the reviewer's suggestion was valid.

Built:

- **Preview before review.** `previewDocumentUpdate` (gateway core, shares `resolveDocumentBodyUpdate` with the
  write, so preview = execution) + `previewGatewayDocumentUpdate` (worker runner, same scope/validation).
  Worker port `documentEditPreview` (`provider/document-edit-preview.ts`, wired when `updateOntoDocument` is
  admitted) runs after sync validation: a body-changing `update_onto_document` that would fail becomes an
  ordinary validation issue ("Checked against the stored document before review; nothing was written…") and
  goes back to the actor with no review round; a passing one reaches the reviewer as a "Server preview of the
  held document changes" (+/- lines). Fail-open on infrastructure errors.
- **Pinpointed block failures.** A multi-line `old_text` that misses now names the divergence ("old_text copies a
  block starting at line 56, but leaves out document line 59: `- **Example / evidence:** **[GAP]**`. Anchor on
  the single line…"), and the rejection lists which edits matched ("edits[1], edits[2], edits[3] matched…
  resend every edit, changing only the failed one"). Verified on the real p05 call/doc offline. Edits stay
  all-or-nothing: completion tracking counts one successful document update as fulfilling every outcome on that
  document, so a partial apply could report an unapplied card as done.
- **Guidance.** Catalog, MCP schema, and `document_workspace` skill: `old_text` is the smallest exact unique
  span, usually one line, one edit per changed line, never a whole block. Neutral catalog example
  (`- Launch: May 3` → `- Launch: May 10`) replaces the Exclusions example.
- **Reviewer prompt.** A server preview means anchors resolved (don't reject for absence from earlier reads or
  an earlier failed call); the batch SHA only labels the batch for approval, never cite it as a defect or put
  it in `required_correction`.

Tests: shared-agent-ops 562 pass (+ block-mismatch, matched-edits, 3 preview tests); worker agenticChat\*
1,591 pass incl. a provider test (missed anchor → repair with no review; corrected proposal → review with
preview) — the 1 failure is `agenticChatConsumer` config `workflowReasoning` from another session's
uncommitted `config.ts`; runtime only the pre-existing portability fail; web 194 connector/card/undo + 91
budget/skill/executor pass. Typecheck clean (shared, worker). Budgets still fit (worker 62,565/62,600 B;
web payload 77,768/78,100).

New files this round: `apps/worker/src/workers/agentic-chat/provider/document-edit-preview.ts`. Also touched:
`apps/worker/src/workers/agentic-chat/composition-root.ts`, `packages/shared-agent-ops/src/gateway/op-execution-gateway.worker.ts`.

Pending (paid, needs DJ): replay p05 (`output/book-loop/p05-msg.txt`) on DJ's outline — the edits are his real
intent — on DeepSeek V4 Flash; p05's failed run cost ~4.3¢, so expect ≤ that. Target: all four cards land with
1–2 reviews, diff touches only those cards.
