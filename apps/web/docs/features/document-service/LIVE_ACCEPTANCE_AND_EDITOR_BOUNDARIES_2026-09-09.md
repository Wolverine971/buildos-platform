<!-- apps/web/docs/features/document-service/LIVE_ACCEPTANCE_AND_EDITOR_BOUNDARIES_2026-09-09.md -->

# Live acceptance and editor boundary fixes

**Date:** 2026-09-09. The user confirmed deployment of the Sept 7 editor work. This continuation
tested that deployed application with a disposable production document, found two further bugs,
and fixed them locally. **The new web and worker changes still need deployment.** No database
migration is required by this continuation.

## Production evidence

Test document: [Document flow acceptance — Sept 9, 2026](https://build-os.com/projects/9fe57310-5059-4c5d-8068-40d1d31271cb?view=docs&entity=document&entity_id=2580d11d-966c-4be1-8791-66c08c73bb8a),
in AI Chat Evaluation Framework. Document ID: `2580d11d-966c-4be1-8791-66c08c73bb8a`.
Only this newly created, clearly labeled test document was edited. It remains available for replay.

| Check                                                        | Observed result on deployed application                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, then first autosave                                  | **Failed:** false conflict after background classification, with local draft preserved.                                                                                         |
| Reload after classification, autosave, reopen in another tab | Passed; saved body persisted.                                                                                                                                                   |
| Header Brain Bolt and focused agent chat                     | Passed; the agent correctly answered “The blue heron carries seven notebooks” from the focused document. Chat session `9067d4be-a45a-4374-82c8-95cb8a9e46af`.                   |
| Select → Ask → review → Apply                                | Proposal persisted and applied as reviewed, but **failed formatting acceptance:** the model omitted selection boundary newlines, joining the sentence to its preceding heading. |
| History → restore v1                                         | Passed; the original text and spacing returned, focus returned to the editor, v3 checkpointed the pre-restore document, and v4 recorded `restore_of_version: 1`.                |
| Autosave after restore                                       | Passed; created v5 without changing the sealed v4 restore snapshot.                                                                                                             |
| Two real browser tabs                                        | Passed; tab A saved, tab B's stale save conflicted and retained its local draft. Reload latest in tab B recovered tab A's saved text.                                           |

Read-only database verification after the two-tab test returned `first_tab_saved = true`,
`stale_tab_overwrote = false`, and `formatting_restored = true`. History contained five rows:

- v1: pre-proposal document, snapshot hash `8fcbe2f14438dc842bb0c194d7d668fda0310a378373a761ee1aafb1af5f07e9`.
- v2: proposal apply, hash `dbba576ab68737f2f69b7e9f3fe7343585758a87c441be1d67ed15a26c45b77b`.
- v3: recovery checkpoint, same hash as v2.
- v4: restored from v1, same hash as v1, no later tab A edit.
- v5: later tab A autosave, hash `7b6dcc6539d9b7bc680ccb051519bef2f1741ffd13b5e4e926e766de6fe2a8d3`.

## Fix 1: classification is independent of the editor draft

The document was created at `19:13:13.591690 UTC`. Classification completed at
`19:13:21.868765 UTC`, changing `type_key` from `document.default` to
`document.context.workflow` and adding tags and `_classification` props. The body was unchanged,
but `updated_at` advanced. The editor's first autosave then conflicted with its own background work.
This is a separate cause from the generated `content_hash` trigger issue fixed Sept 7.

The local fix adds an `editor_revision` SHA-256 token to document GET/full and ordinary PATCH
responses. It covers the document/project identity and the editor's title, description, body,
and state, including legacy description/body fallbacks. The editor sends its loaded token as
`expected_editor_revision`, then takes the next token from the successful save response.
It no longer sends an unchanged, potentially stale `type_key` with every edit.

An ordinary editor save can use the current row timestamp when that token still matches. Metadata
and relationship writes cannot use this relaxation, and archive/restore transitions stay strict.
The actual database update still uses the exact timestamp condition. If classification finishes
between the access read and update, the endpoint may re-read and retry **once**, only if the
editor baseline still matches, merging from fresh props. Changed editor fields conflict even if a
managed refresh preserved the row timestamp. Existing clients without tokens keep their previous
timestamp behavior; explicit overwrite omits both preconditions.

The worker now captures the document timestamp before classification. It skips a model result
if the document changed while inference ran, and also guards the final update with that timestamp
and `deleted_at IS NULL`. This prevents stale props, tags, or legacy `body_markdown` from being
written over a concurrent save. Non-document classification behavior is retained.

## Fix 2: protect proposal whitespace boundaries

The live selected passage included two leading newlines. Despite an instruction to preserve all
surrounding whitespace, the model returned only the replacement sentence. The resulting document
began `# Acceptance planThe blue heron carries eight notebooks.`

Proposal generation now preserves existing leading and trailing selection whitespace before
constructing, hashing, and persisting the proposal. This keeps the reviewed diff and applied edit
identical and prevents a sentence edit from joining adjacent blocks or words. Empty replacements
retain the existing separators. Whitespace-only changes that disappear after this repair are
rejected as no change. The prompt also states the boundary constraint.

## Local verification

- **80 focused tests passed:** 17 editor-revision cases, 13 PATCH concurrency cases, 7 document
  endpoint/full-read cases, 19 modal cases, 5 worker classification cases, and 19 proposal
  generation/create/apply cases.
- Tests cover classification before/during save, preservation of current metadata, same-millisecond
  worker races, authored conflicts, one-retry limit, same-timestamp content changes, serialized
  editor tokens, explicit overwrite, and proposal boundaries through persisted result hashing.
- Required web Svelte check: **0 errors and 0 warnings**. Worker typecheck passed.
- Svelte component analysis completed. Its existing raw-HTML warning points to the unchanged
  `renderMarkdown` path, which sanitizes output; remaining suggestions concern existing lifecycle
  effects and bindings. No new rendering path was added.
- Formatting and `git diff --check` passed. Tests used the machine-wide memory gate and bounded
  workers.

## Next acceptance gate

Deploy the web app and worker changes together, then create a **new** disposable document and
repeat immediate typing through background classification. Repeat a selected sentence edit that
includes blank lines and verify its preview, saved Markdown, and restore history. The completed
production checks above establish the behavior of the prior deployment, not production acceptance
of these new fixes. Physical microphone/transcription acceptance remains open.

The full roadmap is still unfinished: head/history writes remain separate transactions with a
visible history-failure warning, and the next Step 3 work is atomic START HERE uniqueness and
duplicate reconciliation, followed by the structured current/stale/missing index. The dated Sept 7
handoffs remain historical records; the README is the current status index.
