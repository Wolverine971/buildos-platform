# Agentic Chat Worker Phase 4 P3 — session, history, attachment, and vision parity

**Status:** P3 S1 complete locally and hosted on 2026-08-11. Migration
`20260812000000_agentic_chat_prepared_history_currency_guard.sql` is applied;
worker routing, provider mutation capabilities, mutation adapters, and cohort
widening remain off.

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

### S2 — exact prepared-history and strategy contract — next

- Validate prepared history as data rather than silently dropping malformed
  rows during normalization.
- Prove the artifact history is the exact normalized copy of the locked
  prepared row at atomic admission.
- Carry `history_strategy`, `history_compressed`, `raw_history_count`, and
  `history_for_model_count` from the trusted selected history source instead of
  leaving worker timing rows nullable.
- Pin raw, continuity-only, and compressed fixtures, including boundary counts
  and the admission `history_cutoff_at` relationship.

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
