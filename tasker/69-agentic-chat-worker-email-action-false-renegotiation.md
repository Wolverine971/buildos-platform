<!-- tasker/69-agentic-chat-worker-email-action-false-renegotiation.md -->

# 69 — Agentic Chat: email-action false transport renegotiation

**Created 2026-08-27.** Split from the Tasker 65 production closeout after the established
`task-create` canary failed before worker admission.

**Status: implemented and locally verified; production canary pending.** Root cause reproduced from
the exact canary prompt, fixed without weakening the unavailable-tool gate, and covered at selector,
turn-preparation, worker-artifact, and worker-policy boundaries.

## Kernel

The worker transport must renegotiate when a turn genuinely needs a legacy-only capability, but an
ordinary task whose title contains the verb “email” must not be mistaken for a connected-inbox
request.

The exact failing prompt is:

> Add a high-priority task to email the beta list by this Friday.

It should stay on the reviewed project worker surface and call `create_onto_task`. Instead, the web
tool selector currently sees `email` plus the unrelated noun `list`, materializes
`list_email_accounts`, `search_email_messages`, and `get_email_message`, and then correctly rejects
those unavailable tools with `TRANSPORT_RENEGOTIATE`. The capability gate is behaving correctly;
the lexical enrichment feeding it is producing a false positive.

## Invariants

- Keep transport renegotiation for explicit Gmail, inbox, mailbox, connected-email-account, and
  email-message retrieval requests.
- Do not weaken the worker unavailable-tool policy or silently drop a capability the request
  actually requires.
- Treat “email” as an ordinary action verb in task/project wording unless the text independently
  expresses inbox/account retrieval intent.
- Keep attachments and every other unsupported-tool renegotiation unchanged.
- Verify both halves: the exact scheduled-task regression stays on worker, while genuine connected
  inbox reads still select legacy-only tools and renegotiate.

## Work packages

### WP-1 — Correct the connected-email read classifier

- [x] Replace the broad `email + any read-ish word anywhere` test with phrase-level retrieval
      intent.
- [x] Add exact regression coverage for “email the beta list” and nearby action wording.
- [x] Retain positive coverage for Gmail/inbox/account/search/read/open/list requests.

### WP-2 — Remove dead worker prompt controls

- [x] Stop signing and prompting the acting worker with `declare_read_only_turn`, which the worker
      provider intentionally removes.
- [x] Omit `declare_turn_contract` from worker artifacts that contain no executable mutation tools.
- [x] Keep defensive filtering for retained artifacts and keep contract-first project creation
      intact.
- [x] Delete the temporary `task-create-simple-worker` canary; the canonical scheduled/prioritized
      `task-create` scenario is the release gate again.

### WP-3 — Verification and release

- [x] Run selector, turn-preparation, worker-admission, prompt-budget, and worker provider tests.
- [x] Run web and worker package checks, followed by the broad worker suite.
- [ ] Deploy both web admission and worker hardening together.
- [ ] Re-run `task-create` and one genuine legacy-only email/calendar admission check in
      production.

Local receipt: 93 focused web tests, 279 shared runtime tests, 84 focused worker-provider tests, and
the complete 1,335-case worker suite are green. Four localhost HTTP tests initially hit sandbox
`EPERM`; their entire five-test file passed with local binding permitted. Web `svelte-check` reports
zero errors and zero warnings, and both worker lint/typecheck guardrails pass.

## Exit

The exact scheduled/prioritized task canary reaches the worker and persists one correct task; no
legacy inbox tools appear in its artifact. Explicit connected-inbox requests still fail over before
durable worker admission. The acting worker artifact contains neither the retired read-only control
nor an impossible complex-write contract on read-only surfaces.
