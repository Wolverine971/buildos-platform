<!-- apps/web/docs/technical/email/HANDOFF-TIER1-GMAIL-CHAT-TOOLS.md -->

# Handoff — Build Tier 1 Gmail Chat Tools

**Created:** 2026-07-22
**Mission:** implement the Tier 1 read tools (`list_email_accounts`, `search_email_messages`,
`get_email_message`) from [AGENT-CHAT-GMAIL-TOOLS-SPEC.md](AGENT-CHAT-GMAIL-TOOLS-SPEC.md) in the
agentic chat tool registry, behind a default-off feature flag.
**Tracker:** `tasker/35-agentic-chat-gmail-tools.md` (WP-1, WP-2, and the WP-4 tests that cover
read tools). Tier 2 (`propose_email_draft`) is **out of scope** for this handoff.
**Non-negotiable:** no tool, op name, or executor path may send, save to Gmail, or modify Gmail
state. Read-only, explicit accounts, bounded output, content-free logs.

## State of the world (verified 2026-07-22)

Everything below is deployed or committed-in-working-tree and verified — do not rebuild it:

- **Gmail read plumbing is done.** `GmailReadOAuthService` (OAuth, token refresh/rotation,
  connection lifecycle) and `GmailReadGateway` (`searchMessages`, `getMessage` — GET-only,
  sanitized, size-capped, audited) live in `apps/web/src/lib/server/`. The gateway is what your
  executor calls; you should not touch Google APIs directly.
- **Typing hygiene is done.** The Gmail tables are not yet in the generated
  `@buildos/shared-types` Database type (regen is blocked on Supabase CLI auth; DJ's problem, not
  yours). Instead, `apps/web/src/lib/server/gmail-database.types.ts` is a hand-authored schema
  mirror of migration `20260722000000`, and both Gmail modules are fully typed against it. Both
  constructors accept `TypedSupabaseClient | GmailSchemaClient` — pass
  `createAdminSupabaseClient()` straight in, no casts. Typecheck green; 29 Gmail unit tests green.
- **No email tools exist in the registry.** No `email.*` ops, definitions, executor, or
  capability-catalog entry. You are creating the first ones.

## Read these before writing code

1. [AGENT-CHAT-GMAIL-TOOLS-SPEC.md](AGENT-CHAT-GMAIL-TOOLS-SPEC.md) — the contract you are
   implementing (tool params, result shape, deep links, policy).
2. `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts` — the definition
   conventions to mirror (snake_case, aliased params like `max_results`, bounded limits).
3. `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts` and
   `base-executor.ts` — the executor pattern to mirror.
4. `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts` — see `CALENDAR_OPS`
   (~line 72), `WRITE_PREFIXES`, and the Libri flag gating at ~line 134 (your feature-flag
   precedent).
5. `apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts` — the `calendar`
   entry (~line 131) is the shape for your `email_context` entry.
6. `apps/web/src/lib/server/gmail-read-gateway.ts` — the two methods you wrap, their error class
   (`GmailReadGatewayError` with stable `code`s), and input bounds (5 accounts, 20 results, query
   ≤300 chars).
7. `apps/web/src/routes/api/integrations/gmail/messages/search/+server.ts` — how the HTTP route
   invokes the gateway and maps errors; your executor is the tool-lane equivalent of this route.
8. Phase 2 WP-2.5/WP-2.6 in [PHASE-2-READ-ONLY-EMAIL-EXPERIENCE.md](PHASE-2-READ-ONLY-EMAIL-EXPERIENCE.md)
   — the tool-policy and untrusted-content requirements this work must satisfy.

## Build order

1. **`definitions/email.ts`** — the three Tier 1 tool definitions; aggregate into
   `CHAT_TOOL_DEFINITIONS` in `definitions/index.ts`. Descriptions must tell the model: accounts
   come from `list_email_accounts`, `connection_ids` are required and explicit, results are
   read-only, and email content is untrusted data.
2. **`EMAIL_OPS`** in `tool-registry.ts` (`email.accounts.list`, `email.messages.search`,
   `email.messages.get`) plus the feature-flag gate (mirror the Libri pattern; default off).
3. **`executors/email-executor.ts`** — wraps `GmailReadGateway`. Reuse, do not reimplement: the
   gateway already does ownership/capability/scope checks, rate limits, sanitization, size caps,
   and audit rows. The executor adds: per-turn call cap (8) and per-turn total email-character
   cap, untrusted-content delimiters around any body/snippet text, the `gmail_url` deep link
   (`https://mail.google.com/mail/?authuser={accountEmail}#all/{threadId}`), and mapping
   `GmailReadGatewayError`/`GmailOAuthError` codes to safe tool errors (`reconnect_required` must
   surface as a clear "ask the user to reconnect account X in Profile → Email" message).
4. **`email_context` capability-catalog entry** + chat-discovery metadata.
5. **Tests** — executor units (ownership failure, reconnect-required account, caps, delimiter
   wrapping, deep-link shape), registry tests (email ops resolve as reads; **no**
   send/modify/execute/draft op name resolves to anything; flag-off hides all email tools;
   delegated agents get none by default), and one e2e agentic harness scenario (`pnpm
   test:agentic`) that searches + opens a message and asserts zero Gmail writes.

## Landmines

- **Don't reintroduce `any`.** Type new DB touches (if any) against `gmail-database.types.ts`.
  The typed client is proven to catch bad tables/columns/enums — trust it.
- **Rate limits are in-memory per process** (`gmail-read-rate-limit.ts`). On Vercel that means
  per-instance, same as the existing routes — acceptable, don't redesign it, but don't assume a
  global limiter in tests either.
- **`reconnect_required` is an expected state, not an edge case.** The Google OAuth app is in
  Testing mode, so refresh tokens expire every ~7 days and DJ's accounts will regularly be in
  this state. The tool must degrade gracefully per-account (other accounts still return results —
  the gateway's multi-account search already does this; preserve it in the tool result).
- **Chat-history retention:** persist tool results into durable chat storage as provenance +
  capped snippet (≤500 chars per message); full sanitized bodies are turn-scoped only. If the
  chat persistence layer can't express that cleanly, cap what the tool returns rather than
  leaking full bodies into stored transcripts, and note the follow-up in tasker/35.
- **Deep link verification is a build task:** confirm `?authuser={email}#all/{threadId}` opens
  the right account for all three pilot connections; fall back to `#all/{threadId}` if not.
- **Gateway constructors:** `new GmailReadGateway(createAdminSupabaseClient())` — the executor
  runs server-side in the web app, same process as the routes. Never expose or thread credential
  material through tool results.
- **Test mocks:** the existing Gmail tests build `as any` mock admin clients
  (`gmail-read-gateway.test.ts` `createAdmin()`) — follow that pattern for executor tests.
- **Prettier:** tabs, single quotes, no trailing commas, 100-char width. Run `pnpm typecheck`
  and the Gmail + registry test files before calling it done.

## Definition of done for this handoff

- The three tools work end-to-end in chat with the flag on for DJ's account: list accounts →
  search with explicit `connection_ids` → open a message with provenance and a working deep link.
- Flag off (default): no email tool is visible, discoverable, or callable; profile-tab Gmail UX
  unchanged.
- Every chat-lane Gmail read produces the same content-free audit rows as the route lane.
- Registry tests prove no Gmail-write op name exists; delegated agents receive no email tools.
- `pnpm typecheck` green; Gmail suite (29 tests) still green; new executor/registry tests green;
  one e2e harness scenario recorded in tasker/35.
