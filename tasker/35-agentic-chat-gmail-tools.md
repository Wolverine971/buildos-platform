<!-- tasker/35-agentic-chat-gmail-tools.md -->

# 35 — Agentic Chat Gmail Tools (Read + Local Draft Proposals)

**Created 2026-07-22.** Owner: Agentic Chat / product engineer.  
**Type:** product build.  
**Spec:** `apps/web/docs/technical/email/AGENT-CHAT-GMAIL-TOOLS-SPEC.md`  
**Tier 1 build handoff:** `apps/web/docs/technical/email/HANDOFF-TIER1-GMAIL-CHAT-TOOLS.md`  
**Depends on:** deployed Phase 2 Gmail read gateway (done); type regeneration hygiene item below.
Independent of the ingestion pipeline (Phase A in
`GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md`) — the two tracks share the gateway but
neither blocks the other.

## Outcome

In agentic chat the user can search their connected Gmail accounts, open messages with account
provenance and **Open in Gmail** deep links, and receive agent-written reply/new-email drafts as
**local BuildOS proposals**. No chat tool can send, save to Gmail, or modify Gmail state.

## Status — OUT OF PILOT (DJ, 2026-08-24)

**Gmail read tools are generally available.** Any user may optionally connect a Gmail account and
use the Tier 1 read tools. The DJ-only cohort restriction is retired; verified 2026-08-24 that no
user allowlist or kill-switch remains in `gmail-read-gateway.ts`, `tools.config.ts`, or the web
`.env.example` — the `email` tool group mounts for everyone, and availability is governed by
whether the user has connected an account at all.

The pre-2026-08-24 text below described a DJ-only production pilot. It is retained as build history
and is **no longer an accurate description of the deployed gating**.

## Current gap

The remaining gap is not Gmail read access. It is:

1. **Worker parity.** No Gmail tool is installed in the worker provider catalog or execution
   adapter, so Gmail turns must route to legacy. This is now the responsibility of the capability
   check in [59](59-agentic-chat-worker-cutover-review.md) WP-1 — until Gmail tools exist on the
   worker, the capability check routes them to legacy automatically, with no message-text guessing.
   Tracked as [59](59-agentic-chat-worker-cutover-review.md) WP-6.
2. A seeded malicious-email live fixture (prompt-injection resistance).
3. Explicit ZDR route enforcement for Gmail content.
4. The separately scoped local-proposal product (WP-3).

No Gmail send, compose, draft, modify, archive, label, trash, delete, or mark-read tool exists.

## Work packages

### WP-0 — Type regeneration hygiene (P0, prerequisite) — **DONE 2026-07-22 (typing); regen blocked on CLI auth**

The Gmail modules are now fully typed via a hand-authored schema mirror
(`apps/web/src/lib/server/gmail-database.types.ts`): `SupabaseClient<any>` is gone from
`gmail-read-oauth.service.ts` / `gmail-read-gateway.ts`, every table/RPC call is typed, and a
negative-control check confirmed the typed client rejects bad tables/columns/enums. Typecheck and
all 29 Gmail unit tests green.

Still open (DJ): `pnpm gen:all` silently keeps stale generated types because the Supabase CLI has
no auth on this machine (`--allow-stale` masks the failure). Run `npx supabase login` (or set
`SUPABASE_ACCESS_TOKEN`), rerun `pnpm gen:all`, then swap the mirror's table shapes for re-exports
per the header comment in `gmail-database.types.ts`. **This does not block the tools work.**

### WP-1 — Tier 1 read tools (P0) — **DONE; generally available since 2026-08-24**

`list_email_accounts`, `search_email_messages`, `get_email_message` per the spec: `definitions/
email.ts`, `EMAIL_OPS` in the tool registry, `email-executor.ts` calling `GmailReadGateway`
directly with the full route-equivalent guard stack (ownership, capability, scopes, rate limits,
audit). Explicit `connection_ids` required; per-turn call and character caps; untrusted-content
delimiters on all body text; deep links via `?authuser={email}#all/{threadId}` (verify against all
three pilot accounts).

### WP-2 — Capability catalog + gating (P0) — **DONE; dual gate deployed**

`email_context` capability entry, chat-discovery metadata, internal feature flag (default off),
delegated-agent exclusion by default. Registry tests assert no send/modify/execute op can resolve.

### WP-3 — Local draft proposals (P1)

`propose_email_draft` creating a BuildOS-local proposal (reply or new) with source provenance,
agent-generated labeling, and a **Not sent — proposal only** UI surface with the source email deep
link. Storage/retention decision: proposal payload encrypted, and durable chat history keeps only
provenance + capped snippet (≤500 chars) of any email body — full text is turn-scoped.

### WP-4 — Safety verification — **PILOT GATES COMPLETE; seeded fixture + ZDR enforcement still open at GA**

Prompt-injection suite against the live chat loop with seeded fixture emails (tool-use requests,
fake system instructions, account-expansion attempts); tenant-isolation and wrong-user connection
tests; log-leak check across chat telemetry; e2e agentic harness scenario (`pnpm test:agentic`)
proving search → open → proposal with zero Gmail writes.

## Decisions needed from DJ

1. Approve thread reading (`get_email_thread` + gateway `threads.get`) or keep message-only for V1.
2. Confirm the ZDR/model-route policy for email content in chat (fail-closed refusal when the
   session model route is not ZDR-eligible).
3. Where draft proposals surface outside chat (profile tab? project view? review inbox from the
   ingestion track later?).

## Definition of done

Spec acceptance criteria all pass; flag enabled for DJ's three accounts; one week of dogfood use
with audit rows confirming chat reads are bounded and content-free in logs.

## BUILD STATUS — 2026-07-22 (Tier 1 read tools)

**WP-1 + WP-2 read-tool scope BUILT.** The initial DJ-only rollout ended on 2026-08-21; the tools
are now available by default to authenticated users and remain limited to their explicitly
connected accounts. Tier 2 (`propose_email_draft`, WP-3) is not in this rollout. WP-4 unit/registry coverage, live connection
listing, three-account search, on-demand message read, and agentic chat discovery/search are
complete. A true seeded malicious-email fixture remains open because this pass did not send or
create email.

### Default availability

- Email account discovery, read-only inbox tools, and user-confirmed OAuth handoff are discoverable
  for every authenticated BuildOS user.
- Execution remains account-scoped. The Gmail gateway validates connection ownership, active read
  capability, stored read-only scopes, connection health, and rate limits on each request.
- Users with no connected Gmail account receive connection guidance; no mailbox content is read
  until they explicitly connect an account through the existing OAuth flow.

### Files created

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/email.ts` — the three Tier 1 tool
  definitions (`EMAIL_TOOL_DEFINITIONS`); descriptions state accounts come from
  `list_email_accounts`, `connection_ids` are required/explicit, results are read-only, and email
  content is untrusted data.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/email-executor.ts` — `EmailExecutor`
  wrapping `GmailReadGateway` + `GmailReadOAuthService` (constructed via `createAdminSupabaseClient()`
  through the base executor). Adds per-turn call cap (8), per-turn total email-char budget (24k),
  per-message body cap (12k), untrusted-content delimiters, the `gmail_url` deep link, route-parity
  rate-limit checks, and safe error mapping (`reconnect_required` → "reconnect in Profile → Email",
  degrading per-account).
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/email-executor.test.ts` — 10 unit
  tests (ownership failure, reconnect-required, call cap, char budget, delimiter wrapping, deep-link
  shape, explicit-connection-ids requirement, provenance-first ordering).
- `apps/web/src/lib/services/agentic-chat/tools/registry/email-tool-registry.test.ts` — 8 registry
  tests (email ops resolve as reads; NO send/modify/execute/draft op or tool name resolves; flag-off
  hides all email tools + capability; delegated agents excluded — `email.*` not in
  `BUILDOS_AGENT_SUPPORTED_OPS`).
- `apps/web/src/lib/tests/agentic-e2e/scenarios/email-read.scenario.ts` — e2e harness scenario
  (search → open, asserts zero Gmail writes). Skipped unless `AGENTIC_TEST_EMAIL_READY=true` (needs
  a connected Gmail account on the test user + the flag on).

### Files modified

- `definitions/index.ts` — aggregate `EMAIL_TOOL_DEFINITIONS` into `CHAT_TOOL_DEFINITIONS`.
- `definitions/tool-metadata.ts` — metadata for the three tools (category `read`, contexts
  global/project, discoverable).
- `registry/tool-registry.ts` — `EMAIL_OPS` map (`email.accounts.list`, `email.messages.search`,
  `email.messages.get`), `deriveOpFromToolName` wiring, and flag gate in `buildToolRegistry`.
- `registry/capability-catalog.ts` — `email_context` entry (directPaths `email.accounts`,
  `email.messages`), flag-gated out of `listCapabilities`/`getCapabilityByPath` when off.
- `agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts` — email-specific search
  compaction that preserves the versioned `account_message_links` map and one backing message per
  linked account before filling the remaining model payload budget.
- `core/tools.config.ts` — `isToolEnabled` gates email tools by the flag; `email` telemetry category.
- `core/tool-executor.ts` + `core/executors/index.ts` — register/dispatch `EmailExecutor`.
- `tests/agentic-e2e/scenarios/catalog.ts` + `harness/types.ts` — register the scenario + `email`
  category.

### Verification results

- `pnpm --filter=@buildos/web typecheck` (svelte-check): **0 errors, 0 warnings.**
- Current focused tests: Gmail executor **10/10**, Gmail registry **8/8**, tool trace **17/17**,
  tool-payload compaction **26/26**.
- Current full agentic tools + Gmail trace run: **368/368 across 52 files**; `svelte-check`:
  **0 errors, 0 warnings**.
- Existing Gmail suite still green: `gmail-read-gateway` 7, `gmail-read-oauth.service` 11,
  `gmail-read-cursor` 6, `gmail-token-crypto` 5 = **29/29**.
- Broader agentic tools + registry + calendar run alongside: **138/138** passing, no regressions.
- New files pass `eslint` and `prettier --check`.

### Independent verification — 2026-07-22 (second pass)

Re-verified by a separate review pass: executor code review clean (per-turn budget scoping
confirmed against `ChatToolExecutor` lifecycle — instances are per stream request; route-parity
rate limits; content-free error mapping), flag gating confirmed at all four surfaces (registry
build, `tools.config` enablement, capability catalog, definitions), registry tests genuinely
assert the exact `email.*` op namespace + forbidden write names + structural
`BUILDOS_AGENT_SUPPORTED_OPS` exclusion. Re-ran: email executor 8/8, email registry 7/7, Gmail
suite 18/18 (in-run), full tools tree **348/348 across 51 files**, `pnpm typecheck` **0 errors**.

**New landmine for open item 2 (e2e live run):** the `AGENTIC_TEST_USER` needs its own connected
Gmail mailbox — the `user_email_connections_provider_account_active_idx` unique index prevents
attaching any of DJ's three already-connected mailboxes to a second BuildOS user. Use a fourth
Gmail account (or temporarily disconnect one of DJ's) for the harness user.

### Production pilot verification — 2026-07-22

- The exact DJ-only production allowlist is active; missing/empty/wildcard allowlists still fail
  closed and the global flag remains the kill switch.
- A fresh chat session listed all three connections and searched `newer_than:2d` read-only.
- The live result reported `result_contract_version: gmail-read-v2` and the model rendered exactly
  three **Open in Gmail** links, one per account, from `account_message_links`.
- Each link resolved to the intended signed-in Gmail/Workspace mailbox.
- The chat showed zero proposed changes; the registry exposed no Gmail send/compose/draft/modify/
  label/archive/trash/delete/mark-read operation.
- The production audit path recorded successful per-account reads without message content. Durable
  Gmail traces contain counts/booleans only.
- A pre-existing page session initially showed the old payload contract; a hard navigation to the
  new deployment and a clean chat passed. This is recorded so future smoke tests always start from
  a fresh deployment session.
- The malicious-email seeded fixture remains pending; the read-only validation prompt treated
  mailbox data as untrusted and produced no write, but no email was sent merely to create a fixture.

### Open items / follow-ups

1. **Seeded live prompt-injection fixture:** run the malicious-body scenarios without granting any
   Gmail write scope. This requires a pre-existing fixture or a separately user-created fixture;
   the implementation agent must not send one merely to create test data.
2. **Harness live run (`pnpm test:agentic`) still separate:** the harness drives the real stream endpoint and
   needs a running dev server and a connected Gmail account on the test user — not run here (would
   require a long-lived server). Scenario is written + wired (skipped via
   `AGENTIC_TEST_EMAIL_READY`). To run: start `pnpm dev --filter=@buildos/web`, connect Gmail for the
   `AGENTIC_TEST_USER`, set `AGENTIC_TEST_EMAIL_READY=true`, then
   `pnpm --filter @buildos/web test:agentic`.
3. **ZDR route enforcement:** keep the cohort internal until the stream route can fail closed on an
   explicitly approved zero-data-retention model/provider policy.
4. **Generated types:** re-link/authenticate the Supabase CLI, run `pnpm gen:all`, and replace the
   hand-authored Gmail schema mirror with generated re-exports. Do not use `--allow-stale` as proof
   of regeneration.
5. **Delegated-agent guarantee is structural:** `email.*` is intentionally absent from
   `BUILDOS_AGENT_SUPPORTED_OPS`, so the agent-call gateway can never surface email tools even with
   the flag on. If email should ever be delegable, it must be added there explicitly (and re-audited).
6. **Tier 2 remains deferred:** decide the storage, retention, and review surface before building a
   local email proposal. It must remain a BuildOS proposal and cannot create a Gmail draft.
7. **Surfacing model:** email tools are NOT preloaded into any launch surface; they are reached via
   `tool_search` / the `email_context` capability / on-miss materialization (same pattern as
   `move_onto_task`). This keeps the opening tool menu small and email behind explicit discovery.
   If dogfood shows the model failing to discover them, consider adding to the global/project launch
   profile in `gateway-surface.ts` (still flag-gated).
