<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P3_SESSION_HISTORY_ATTACHMENT_VISION_PLAN_2026-08-11.md -->

# Agentic Chat Worker Phase 4 P3 — session, history, attachment, and vision parity

**Status:** P3 S1-S4 complete locally and hosted as of 2026-08-12. Migrations
`20260812000000_agentic_chat_prepared_history_currency_guard.sql`,
`20260812010000_agentic_chat_history_state_contract.sql`,
`20260812030000_agentic_chat_attachment_reference_contract.sql`, and
`20260812040000_agentic_chat_live_vision_resolution_receipts.sql` are applied.
Worker routing, worker live vision, provider mutation capabilities, mutation
adapters, and cohort widening remain off. P3 is complete at its natural
default-off boundary.

## Kernel

The worker must start from one immutable, model-ready turn input. Queue delay,
prepared-prompt cleanup, later session writes, attachment cleanup, and retries
must not change the history or media the admitted turn sees.

The shortest safe sequence is:

1. prove prepared history is current before selecting it;
2. freeze and validate its exact strategy, counts, and content;
3. move attachment references and derived text into the same input contract;
4. add bounded live-image resolution without weakening artifact integrity.

## Slice ledger

### S1 — prepared-history divergence guard — complete

The missing Phase 0 rule is now enforced on both application paths:

- worker preparation rejects a prepared snapshot when the latest persisted
  session message is newer than the prepared row;
- legacy consumption skips the just-admitted current user message, then applies
  the same comparison to the prior session tail;
- the post-completion audit tightened that legacy rule to exclude the exact
  `chat_turn_runs.user_message_id` for the active legacy turn rather than
  assuming the newest positional row is the current request;
- history lookup failure is a fail-closed prepared miss, not permission to use
  an unverified snapshot;
- miss diagnostics distinguish `stale_history` from
  `history_check_failed` and record both timestamps and the newer message id;
- the artifact insert trigger repeats the currency check after the worker
  admission advisory lock, so an inspection/admission race rolls back rather
  than freezing stale history.

The linked apply was receipt-isolated from the unrelated local calendar
migration. Source and staged SHA-256 were both
`559c9907b1a8a1e3aba7d8c7d13ae9ff51d981aaa84a82d659d0d1190eb0d445`;
the pre-apply dry run named only `20260812000000`, application succeeded, the
post-apply dry run was empty, and the linked ledger reports exact local/remote
receipt parity.

Proof:

- prepared consumer + worker preparation + legacy route: 55/55;
- disposable PostgreSQL: current copy accepted, mid-draft divergence rejected,
  cross-scope lineage rejected, invoker/search-path/direct-execute boundary
  retained;
- focused ESLint clean.

### S2 — exact prepared-history and strategy contract — complete

The selected model history now has one strict, immutable evidence path:

- prepared rows are validated as data before use; malformed roles/content,
  malformed tool-call arrays, inconsistent strategy/count metadata, and more
  than 50 messages fail closed as `invalid_history` instead of being silently
  normalized away;
- prepared tool-call payloads and tool-call ids survive into the frozen
  artifact exactly; nonempty prepared-history attachments are explicitly
  deferred to S3 and force the safe admission-window fallback;
- every new v3 input artifact hashes `prepared.historyState` with the exact
  strategy, compression bit, raw-history count, and model-history count;
  retained rolling v2/v3 artifacts without this optional field remain valid;
- the artifact-insert trigger validates the state, proves prepared artifact
  history is the exact normalized projection of the locked prepared row, and
  copies the four values onto `chat_turn_runs` in the same admission
  transaction;
- worker execution compares all four database timing values back to the hashed
  artifact and still enforces the admission-owned `history_cutoff_at` window
  before provider work;
- raw, continuity-only, compressed, count-boundary, tool-call, malformed-row,
  and prepared-attachment cases are pinned in application/shared tests.

Hosted proof:

- receipt-isolated source/staged SHA-256:
  `0d6c04ee47958fba5eb207ea085de6383b9bc723add25ebcd23c3c97156dea70`;
- pre-apply dry run named only `20260812010000`; apply succeeded; post-apply dry
  run is empty; the linked ledger has exact local/remote receipt parity;
- hosted catalog query confirms the trigger is installed, invoker-rights, uses
  fixed `search_path = pg_catalog, public`, denies direct authenticated
  execution, and contains both exact-copy and parent timing-copy guards.

Local proof:

- shared input contract: 25/25;
- prepared consumer/history/worker preparation + legacy route: 67/67;
- worker execution input: 9/9;
- disposable PostgreSQL: 11/11 assertions across the retained S1 currency
  contract and the new S2 exact-copy/state contract;
- shared, worker, and web typechecks clean; Svelte diagnostics 0/0.

### S3 — attachment-reference parity — complete

Attachment state now crosses admission once and remains immutable:

- current-turn and prepared/admission history references freeze ordering,
  source identity, project scope, storage reference, OCR/extracted-text bounds,
  byte size, checksum, and temporary expiry in the hashed input artifact;
- the request payload and artifact are compared exactly, and the worker user
  message is linked to the same ordered references in the admission
  transaction;
- malformed, duplicate, cross-project, deleted, drifted, expired, or
  client-only references fail closed at admission;
- legacy and worker prompts use the same shared bounded untrusted attachment
  context formatter; the worker reconstructs that context only from the
  artifact and never reloads history;
- rolling artifacts without the newly optional evidence remain readable while
  every new writer emits the contract.

Hosted proof:

- migration `20260812030000_agentic_chat_attachment_reference_contract.sql`;
- receipt-isolated source/staged SHA-256:
  `39cc437937905958382709a0644e5e14cdf25c4c737d64b37d0bd6d89a68c54f`;
- isolated pre-apply dry run named only `20260812030000`; apply succeeded;
  post-apply dry run was empty; linked local/remote receipts match.

Local proof at the S3 checkpoint: shared 21/21, web 21/21, worker 25/25,
disposable PostgreSQL green, shared/worker typechecks clean, and Svelte
diagnostics 0/0.

### S4 — live-vision parity — complete, default off

The live-image boundary is now explicit and ephemeral:

- new artifacts hash a bounded policy for intent, image count, byte cap,
  render width, and signed-URL TTL; SQL independently validates the same
  limits while retaining rolling S3 artifacts;
- `AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED` is a separate exact-boolean worker
  gate and defaults false; without the resolver the prompt remains accurately
  text/OCR-only even if an artifact requested vision;
- resolution happens inside the first provider stream only after execution
  start, never during preparation: project assets repeat actor-explicit access
  checks and exact database identity checks, and temporary assets repeat the
  frozen user-scoped path/expiry checks;
- the worker streams the raw object through a bounded SHA-256 check, verifies
  exact byte size and content type, cancels the reader on interruption, then
  creates a separate transformed provider URL; raw bytes and both signed URLs
  remain process-memory-only and expire;
- the initial user message becomes deterministic OpenRouter multimodal content
  only after validation. Durable prompt snapshots remain URL-free, and
  continuations reuse only the invocation's in-memory content;
- one mandatory, lease/generation-fenced `provider_media_resolved` observation
  records only policy, attachment identity, content type, byte size, checksum,
  failures, and limit skips. SQL rejects URLs, storage paths/buckets, malformed
  items, replay conflicts, and out-of-envelope receipts. Failure to persist the
  receipt prevents the provider call.

Hosted proof:

- migration `20260812040000_agentic_chat_live_vision_resolution_receipts.sql`;
- receipt-isolated source/staged SHA-256:
  `d023535b938e0d82db102b845bf8b8d81fbbbc8f09552cfc38afb366bf9b1e89`;
- isolated dry run named only `20260812040000`; apply succeeded; post-apply dry
  run reports the remote database up to date; linked local/remote receipts
  match exactly.

Final local proof:

- all worker Agentic Chat suites: 40 files, 355/355 tests;
- focused web/history/attachment/PostgreSQL suites: 30/30;
- shared types: 27/27 plus successful declaration build;
- the cumulative disposable PostgreSQL proof covers old provider/tool
  observations, exact media replay, receipt redaction and ordering, and bounded
  artifact policy;
- worker typecheck clean; Svelte diagnostics 0 errors and 0 warnings.

## Standing boundaries

- Production worker routing remains false between controlled gates.
- Worker live vision remains disabled until an explicit cohort gate and
  provider differential are approved; completing S4 did not alter production
  routing or capability advertisement.
- Prepared-prompt request-hash lineage remains stable across consumption and
  expiry; currency controls content selection, not idempotency identity.
- The worker never reloads source history after admission.
