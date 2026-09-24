<!-- tasker/103-privacy-audit-trustworthy-data-handling.md -->

# Tasker 103 — Privacy audit: keep less, delete for real, say exactly what we do

**Status:** Migrations applied to prod (2026-09-24, all 10 in `190000`–`190600`, recorded in history). Code is uncommitted and not deployed. See
"Progress" below. · **Opened:** 2026-09-24 · **Owner:** DJ (approvals)
**Source:** building `scan_email_inbox` (`docs/architecture/JEV_EMAIL_SCAN_2026-09-24.md`) exposed a
gap. `/privacy` promises that "the read-only Gmail tool does not create a durable BuildOS copy of
retrieved message bodies." Yet from the worker cutover (2026-09-04) until `d27da1ccd` (2026-09-24),
full Gmail results (subjects, senders, snippets, bodies) were written to `chat_tool_executions` and to
turn events. The code is fixed going forward. The rows written in between still hold that content.
If one promise drifted, others may have too.
**Scope guard (DJ):** sensible policies, honest copy, real deletion. Other rules:

- no paid tests;
- no reading user content in prod (schema, counts, and metadata are fine);
- prod migrations and deletes need DJ's approval.

## Progress (2026-09-24): built, waiting on DJ

Durable outputs:

- [`docs/privacy/CLAIMS.md`](../docs/privacy/CLAIMS.md): each `/privacy` sentence mapped to the code that
  makes it true, plus the true-on-deploy conditions;
- [`docs/privacy/DATA_INVENTORY.md`](../docs/privacy/DATA_INVENTORY.md): every store and processor, and the
  residual **Open items** list.

**Findings verified with production counts only:**

- 43% of worker chat calls went to non-ZDR hosts.
- The deletion and security-retention crons were never scheduled, because they were listed only in the root
  `vercel.json`.
- Worker-era chats couldn't be deleted for about 30 days.
- Soft deletes were never purged.
- `calendar_analysis_events` held 3,602 copies of outside events.
- 0 stored Gmail results exist, so the Gmail backfill was moot.

**DJ decisions:**

- Voice (transcription and TTS) stays on OpenAI as the one disclosed non-ZDR exception.
- Voice audio is kept until the user deletes it.
- The reviewer is `gpt-5.6-luna` on Azure only.
- Build the ambitious "Your data" tab, plus a full zip export.
- Archive becomes a real state.
- The purge also deletes Google events.
- Calendar analysis keeps only title and time behind suggestions.
- Keep the Libri purge.
- Keep the Stripe customer.

**Built (validated: package, worker, and web typecheck; svelte-check at 0/0; about 1,000 narrow tests; 56/56
SQL contracts; lint):**

- ZDR is forced in the OpenRouter builder, with a fitness test; the direct OpenAI/Moonshot paths are
  deleted.
- Storage projection for 8 pass-through tools, covering results and arguments; admin reads are projected
  and logged.
- The PostHog, Meta, and log scrub, with a log guard test.
- The `privacyRetention.ts` drain job.
- Account deletion: lock at request time, a purge that finishes, PostHog deletion, and the scheduled crons.
- An atomic chat delete.
- The "Your data" tab and export.
- The 30-day soft-delete purge, the archive state, brain-dump delete, and minimal calendar analysis.
- `/privacy` and `/terms` rewritten (version 2026-09-24), plus blog and UI copy fixes.

**Waiting on DJ:** apply the migrations in the order in CLAIMS.md, deploy, set the PostHog env vars, check
the Railway env, the paid ZDR acceptance check, and the paid gate. After deploy, the exit conditions still
need an end-to-end account-deletion proof on a test account.

## What DJ wants

People should trust BuildOS with their thinking, their email, and their calendar. Nothing about how
BuildOS handles their data should look fishy. In DJ's words, the page should be able to say:
_"We might scan your email so BuildOS knows what's going on, but we don't keep or maintain that."_
It should also be able to say that every AI call runs with zero data retention at the provider, and
that BuildOS makes real efforts to hold as little as it can.

Every sentence on `/privacy` must be literally true of the code, and the code must make it easy to
stay true. The job is to **make BuildOS keep less**, not just to write nicer copy.

## Principles (proposed defaults, DJ can veto)

1. **Workspace vs. pass-through.** What the user builds (projects, tasks, documents, chats, briefs,
   uploads) is their workspace. BuildOS keeps it until they delete it. Content BuildOS only reads on
   their behalf (Gmail, Google Calendar events it didn't create, web pages, OCR sources) is
   pass-through. It is used during the request and not kept. At most, BuildOS keeps content-free
   traces: ids, counts, scores, timestamps.
2. **Zero data retention on every AI call.** Every model request (chat, Jev, embeddings,
   transcription, OCR, reviewers, specialists) goes through a route that enforces ZDR and
   `data_collection: 'deny'`. No direct-provider fallback unless that provider contractually offers
   ZDR to BuildOS. Nothing is used for training.
3. **Derived artifacts expire.** Prompt snapshots, prepared prompts, provider observations, audit
   rows, scan ledgers, and debugging traces get a short, named retention (default ≤30 days), and a
   scheduled job enforces it.
4. **Delete means delete.** Account deletion removes every row and storage object, revokes Google
   tokens, and removes the person from third parties (Stripe, PostHog, email/SMS providers) within
   a stated window. The page names the backup roll-off period honestly.
5. **No content in logs or analytics.** Server logs, error trackers, and PostHog never carry chat,
   email, document, or voice text. Replays mask inputs.
6. **Plain words.** The page leads with a short "what we keep / what we don't" table a
   non-lawyer can read in a minute, then gives the detail.

## Leads already verified (2026-09-24, start here)

**AI providers and ZDR**

| Path                                                                                                                                                                     | Setting today                                                                    | Gap                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/smart-llm/src/openrouter-request.ts:39-44`, `smart-llm-service.ts:114,196`                                                                                     | `data_collection: 'deny'`, `zdr: true` by default                                | Confirm no production caller turns ZDR off                                                                              |
| `apps/web/src/lib/services/openrouter-v2-service.ts:816-826`                                                                                                             | deny; `zdr: true` unless `PRIVATE_OPENROUTER_REQUIRE_ZDR=false`                  | Check that env var in Vercel prod/preview                                                                               |
| Agentic Chat worker route `apps/worker/src/workers/agentic-chat/provider/openrouter/open-route.ts:264-270`                                                               | `data_collection: 'deny'`, **no `zdr`** (unless `route.providerRouting` adds it) | The main chat path may reach non-ZDR endpoints. Verify the model list works with `zdr: true`                            |
| Jev `packages/smart-llm/src/jev-client.ts:351` (tool selection, context finder, web navigate, email scan, freshness radar)                                               | `data_collection: 'deny'`, **no `zdr`**                                          | Confirm TypeSafe's retention via OpenRouter; add `zdr: true` if the route supports it                                   |
| Direct OpenAI: `packages/shared-agent-ops/src/embeddings/openai-embeddings.ts` (fallback), `apps/worker/src/workers/assets/assetOcrWorker.ts`, smart-llm direct fallback | Direct API                                                                       | OpenAI keeps API data ~30 days for abuse monitoring unless the org has ZDR. Route through OpenRouter ZDR or document it |
| Direct Moonshot (`api.moonshot.ai`, 7 references)                                                                                                                        | Direct API                                                                       | Find the callers; state retention or remove them                                                                        |
| Web research (Tavily search/extract; `web_navigate` fetches)                                                                                                             | Queries go to Tavily                                                             | Disclose; confirm Tavily's retention                                                                                    |
| Voice transcription `apps/web/src/routes/api/transcribe/+server.ts` (`openai/gpt-transcribe` via SmartLLM)                                                               | Via OpenRouter                                                                   | Confirm the transcription route keeps `zdr: true`                                                                       |

**Content BuildOS stores (map every one)**

- `chat_messages`, `chat_tool_executions`, turn/semantic events (`tool_result` payloads), and the
  terminal records. Email tool results are redacted going forward by
  `redactAgenticChatEmailToolResultForStorageV1`, run in `turn/read-tool-runner.ts`.
    - **Backfill needed:** redact `search_email_messages`, `get_email_message`, and `scan_email_inbox`
      rows and events written between 2026-09-04 and deploy. The migration needs DJ's approval.
    - Also check whether web research, calendar, and OCR tool results should get the same treatment.
- Prompt snapshots (`persist_agentic_chat_prompt_snapshot_v3` stores the opening `model_messages`
  and tool definitions) and prepared prompts. `apps/worker/src/scheduler/promptArtifactRetention.ts`
  enforces some retention. Record the actual windows.
- Provider-attempt and execution observations, `llm_usage_logs` (check for prompt or response
  text), and agent-run and specialist workflow logs.
- Voice: `voice_notes` rows plus the audio in Supabase Storage (`api/voice-notes/+server.ts:241-259`).
  Decide whether audio is kept after transcription. Default proposal: delete the audio once the
  transcript succeeds, or after N days.
- Images and assets (`onto_assets` + storage + OCR `extraction_summary`), public pages, and
  published documents.
- Gmail:
    - `user_email_connections` and encrypted credentials;
    - `email_access_audit_events` (content-free; retention?);
    - `email_scan_checks` (HMAC ids + scores, 30-day expiry);
    - the Gmail relevance pilot tables (hashes, 7-day cron).
- Calendar: `user_calendar_connections` and credentials, `onto_events` and `onto_event_sync`,
  calendar analysis results, and webhook channels (the webhook drops events BuildOS didn't create).
  Confirm nothing mirrors outside events.
- Daily briefs, brief emails, and SMS: the content sent through the email and SMS providers, and
  whatever those providers keep.
- MCP / external agent connector tokens and grants.

**Deletion.** `apps/web/src/lib/server/account-deletion.ts` touches only `account_deletion_requests`,
`customer_subscriptions`, and `users` directly and relies on foreign-key cascades. Check the
following:

- every content table cascades, or is swept, from the user;
- storage objects (voice, assets) are removed;
- Google OAuth tokens are revoked at Google, not just deleted locally;
- Stripe, PostHog, and email/SMS contacts are handled;
- the async job finishes within the promised window.

**Analytics and logs.**

- PostHog runs at `us.i.posthog.com`. Check autocapture, session replay input masking, and
  whether chat or email text can land in event properties.
- Grep worker and web logs (`console.*`, logger calls, `logAgenticChatExecutionBoundary` error
  payloads, ErrorLoggerService) for message, email, or document text.

**The page itself.** `apps/web/src/routes/privacy/+page.svelte` says "Effective and last updated:
August 15, 2026 (version 2026-08-15)". It predates:

- the worker cutover (09-04);
- Jev and TypeSafe decisions (09-18 onward);
- `scan_email_inbox` and the scan ledger (09-24);
- the voice overhaul, image turns, specialists, MCP, and web navigation.

Sections today: 1 Scope · 2 Information We Collect · 3 How We Use · 4 AI Processing · 9 SMS · 10 Google
API Data · 12 Retention and Deletion · 13 Your Rights · 14 Security · 15 Children · 17 Changes ·
18 Contact. Numbering gaps (5–8, 11, 16) suggest removed sections. Check whether anything important
went with them.

## Deliverables

1. **Data inventory:** `docs/privacy/DATA_INVENTORY.md`. One row per store or processor:
    - what data;
    - why it is kept;
    - workspace or pass-through;
    - retention and the code that enforces it;
    - deletion path;
    - who can read it (RLS or service role);
    - third party, with a link to their retention terms.

    Every row cites code.

2. **Policy decisions:** a short list for DJ. Each item states the current state, the proposed
   default, and the cost or UX trade-off. Examples: keep voice audio? Chat history retention for
   inactive accounts? Audit-event retention?
3. **Fixes, each small and tested:**
    - ZDR on every AI route;
    - redaction backfill;
    - retention jobs for every derived artifact;
    - deletion completeness (storage, token revocation, third parties);
    - log and analytics hygiene.

    Migrations stay local until DJ approves them for prod.

4. **Privacy page rewrite.**
    - Plain-language top block: what we keep, what we don't, how to delete. Include DJ's email line
      in plain words: we read your inbox only when you ask, use it to answer, and keep only
      content-free traces (ids, counts, scores) that expire in 30 days.
    - An AI section naming the providers and stating ZDR and no training.
    - The Google API Limited Use statement kept accurate.
    - Version bump and date.
    - Brand voice: calm and direct, no legal fog, no overclaiming. Never claim a certification BuildOS
      doesn't hold.
5. **Guards that keep it true:**
    - a test that fails when any OpenRouter request builder lacks `data_collection: 'deny'` and
      `zdr: true`;
    - the existing email-redaction tests;
    - a retention-job test per derived table;
    - a short `docs/privacy/CLAIMS.md` that maps each sentence on `/privacy` to the code or setting
      that makes it true, referenced from the page's source comment.

## Exit condition

- Every `/privacy` claim maps to code in `CLAIMS.md`.
- The inventory has no row marked "unknown".
- ZDR is enforced on every AI call path, or each exception is named and approved by DJ.
- The email redaction backfill has run in prod.
- Account deletion is proven end to end on a test account: rows, storage, tokens, and third parties.
- The rewritten page is deployed with a new version date.

## Notes for the agent

- Read `AGENTS.md` first: the paid-test rule, narrow tests only, and no regex classification of user
  text. Redaction and retention work on structured fields, never on text heuristics.
- `supabase db query --linked` hits **prod**. Use it for schema and counts only, never to select
  content columns.
- Other sessions commit the shared tree with "updates" commits. Commit with an explicit pathspec.
- Related: [36 — Gmail relevance Phase A](36-gmail-project-relevance-phase-a.md) (retention receipt),
  [76 — Production database security](76-production-database-security-containment.md),
  `docs/architecture/JEV_EMAIL_SCAN_2026-09-24.md`.
