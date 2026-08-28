<!-- tasker/69-agentic-chat-worker-email-action-false-renegotiation.md -->

# 69 — Agentic Chat: email-action false transport renegotiation

**Created 2026-08-27.** Split from the Tasker 65 production closeout after the established
`task-create` canary failed before worker admission.

**Status: complete and production-verified (2026-08-27).** Root cause reproduced from the exact
canary prompt, fixed without weakening the unavailable-tool gate, and covered at selector,
turn-preparation, worker-artifact, worker-policy, and live transport boundaries.

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
- [x] Deploy both web admission and worker hardening together.
- [x] Re-run `task-create` and one genuine legacy-only email/calendar admission check in
      production.

Local receipt: 93 focused web tests, 279 shared runtime tests, 84 focused worker-provider tests, and
the complete 1,335-case worker suite are green. Four localhost HTTP tests initially hit sandbox
`EPERM`; their entire five-test file passed with local binding permitted. Web `svelte-check` reports
zero errors and zero warnings, and both worker lint/typecheck guardrails pass.

### Production closeout

Commit `8f30ae511e625bc7146ae20a24d0fddfe0fc3817` deployed successfully to Vercel production
(`dpl_785MikbqLnMbvYvyKYQmfD5xTDsv`) and Railway
(`78589184-410a-4a5b-84ed-e4cb86f3ae9e`). The public worker health endpoint reported the exact
release, database and Realtime healthy, 20 provider/20 adapter mutations, zero active turns, and no
claim or recovery failures.

The canonical `task-create` scenario passed in 27.635s. Its retained worker turn
`4d99ce96-345c-4f11-9bb7-cb3e14c464fd` completed in 20.623s with one successful
`get_project_overview`, one successful `create_onto_task`, and one succeeded durable effect. The
database assertions proved the created task had both the requested high priority and Friday due
date. All three LLM calls were acting-model calls; no semantic reviewer operation ran.

The signed write-capable artifact retained `declare_turn_contract` for a later complex redirect but
contained no `declare_read_only_turn` and no legacy email tools. Its opening provider snapshot had
16 tools, 21,138 serialized tool characters, no contract, no read-only control, and no legacy email
tools. This preserves Tasker 65's deferred-contract token boundary while removing the dead control
one layer earlier.

The positive fallback check requested “Search my connected Gmail accounts for the latest beta
launch reply.” It first received a valid worker lease, then returned exact HTTP 409
`TRANSPORT_RENEGOTIATE` during admission. A service-role count confirmed zero durable
`chat_turn_runs` rows for that request.

## Exit

The exact scheduled/prioritized task canary reaches the worker and persists one correct task; no
legacy inbox tools appear in its artifact. Explicit connected-inbox requests still fail over before
durable worker admission. The acting worker artifact contains neither the retired read-only control
nor an impossible complex-write contract on read-only surfaces.
