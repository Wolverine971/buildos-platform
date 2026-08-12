# Agentic Chat Worker Phase 4 P3 — session, history, attachment, and vision parity

**Status:** P3 S1-S2 complete locally and hosted on 2026-08-11. Migrations
`20260812000000_agentic_chat_prepared_history_currency_guard.sql` and
`20260812010000_agentic_chat_history_state_contract.sql` are applied; worker
routing, provider mutation capabilities, mutation adapters, and cohort widening
remain off. Next: S3 attachment-reference parity.

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

### S3 — attachment-reference parity

- Freeze current-turn and history attachment references, ordering, OCR status,
  extracted-text bounds, checksums, expiry, and ownership evidence in the
  immutable input contract.
- Build the same untrusted attachment context on legacy and worker paths.
- Resolve references only through actor/project-scoped ports; do not give the
  provider storage credentials or mutable client metadata.

### S4 — live-vision parity

- Resolve eligible frozen image references immediately before the provider
  call with byte/count/content-type/checksum/expiry limits.
- Keep raw image bytes ephemeral; keep their immutable identity and validation
  receipt in the artifact/turn evidence.
- Add deterministic multimodal request fixtures plus cleanup, expiry,
  ownership-loss, cancellation, and retry tests before enabling the capability.

## Standing boundaries

- Production worker routing remains false between controlled gates.
- No attachment or vision capability is advertised until its artifact and
  provider differentials pass.
- Prepared-prompt request-hash lineage remains stable across consumption and
  expiry; currency controls content selection, not idempotency identity.
- The worker never reloads source history after admission.
