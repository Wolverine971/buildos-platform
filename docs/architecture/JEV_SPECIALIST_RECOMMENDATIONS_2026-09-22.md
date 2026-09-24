<!-- docs/architecture/JEV_SPECIALIST_RECOMMENDATIONS_2026-09-22.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-22; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Jev recommendations for published specialists

**Status:** Implemented locally on September 22, 2026. Migration `20260921041759` was applied
to production project `iwifjtlebphefldmwbkh` under its original ID on September 22. App
deployment and `AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED` rollout have not been verified or
performed in this change. No live Jev call or paid Agentic Chat gate was run for this change.
The production ledger stores the exact local source (SHA-256
`222c0be19559f990f65c0f1639c6b00447ff3a07644d137bd93fba4401fa7800`). Readback
confirmed RLS, service-only table and RPC privileges, enabled guards, and validated constraints.

## User path

1. In the specialist workbench, start an unsaved research draft: Research synthesizer,
   Evidence reviewer, or Research gap mapper. The existing Document organizer starter remains.
   Customize, inspect the free capability checks, save, and publish the exact version.
2. In Workflow Lab, choose a project and ask a question. **Ask Jev** ranks the latest published
   version of each owned draft from name, description, expertise, and document-read capability.
   It includes a no-match option. Jev sees the question, not project bodies, conversation history,
   authored prompts, or reference notes.
3. Review the ranking and explicitly choose **Use this specialist**. This selects a version but
   does not start a workflow. Starting the review uses the existing read-only published-specialist
   admission and preserves the Task 91 Logs, Trace, and Export path.

The three research starters only inspect **saved project context and bounded saved document reads**.
They do not search the web, change records, or add arbitrary tools. The workbench checks that a
version is well-formed and its declared tool needs are available; it does not score answer quality.
The newer Project Review v2/v3 evidence contracts are currently separate from this published
specialist execution profile.

## Durable decision boundary

`20260921041759_agentic_chat_specialist_recommendations_v1.sql` adds a private, service-only
recommendation ledger. A begin RPC checks current project access, serializes per-account admission,
enforces 20 requests per UTC day, and pins the latest eligible published version per draft before
any paid call. The request ID and normalized question are idempotency keys. A duplicate request
returns the saved result or pending state, without authorizing another call.

Only a fresh claim calls `typesafe/jev-1.13` through the existing typed Jev client. It has a
three-second deadline, one physical attempt, a 64 KB request bound, no fallback, and no raw
provider response persisted. The host validates Jev's option set, probability sum and top choice.
A specialist is suggested only if its probability is at least 0.60 and its lead is at least 0.15;
otherwise it abstains. These are routing heuristics, not calibrated accuracy claims.

A finish RPC records the typed result, ranking, hashes, duration, model, tokens and cost. The
pre-run Jev cost is separate from the workflow dispatch cap. If a caller loses its response after
the claim, retrying the same request ID reads the ledger. A pending claim never starts another Jev
attempt. A new question creates a new decision.

When the user applies a recommendation, admission rechecks the receipt owner, project, exact
normalized question, selected version/hash, expiration, current published version ownership, and
project access. The receipt is copied into the immutable executable snapshot. A SQL insert trigger
checks the copied receipt against the ledger and admitted request; recovery verifies its inner
hashes without consulting the current catalog or calling Jev. Older snapshots without a receipt
remain valid. New custom snapshots use domain-neutral planner, reviewer, and editor instructions;
older admitted snapshots retain their original saved instructions.

Task 91's raw specialist snapshot export contains the entire typed receipt. The Markdown export
also shows the decision, chosen version, ranking, hashes, and the Jev cost outside the workflow cap.

## Rollout and verification

1. **Done:** The single new migration was applied under its original version after the
   published-specialist migration. Do not blanket-push the migration directory; its ledger has
   historically drifted.
2. Deploy the runtime and worker before web so workers can parse the new custom snapshot task
   contract. The existing published-specialist and workflow gates must already be on.
3. Deploy web. Set `AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED=true` **on web only** for the pilot,
   with `PRIVATE_OPENROUTER_API_KEY` present. Its default is off. To roll back recommendations,
   set the new flag to false; already admitted runs keep their pinned snapshots.

Free checks: 29 focused runtime tests, 7 disposable PostgreSQL published-specialist tests
(including recommendation replay, ownership, receipt binding, and role ACL), 31 focused web tests,
web Svelte check with zero diagnostics, runtime build, and worker typecheck. These use a scripted
Jev result and make no paid call. The full paid Cedar House gate remains pending under the
repository's per-run approval requirement. A live recommendation and end-to-end quality judgment
are unverified until explicitly approved and run.

## Independent review — September 22, 2026 (evening)

Reviewed at `5f69e79bd` plus the shared working tree. The design held up: auth, prototype
allowlist, flags and same-origin checks all run before any paid call; the 20-per-UTC-day quota and
duplicate check are serialized per account; replays never re-bill; admission rebinds the receipt in
TypeScript and again in the SQL insert trigger; recovery verifies frozen hashes only; the Task 91
export shows the decision; and Jev spend reaches `llm_usage_logs` (`operation_type` is free text)
tagged with the recommendation ID.

**Fixed in this change set (free local checks only):**

1. **Emoji names poisoned the roster.** The web roster check measured UTF-16 length while the
   workbench limits code points. One published specialist with emoji near a limit made every
   recommendation for that user return 503 and leave a stuck pending claim that still counted
   toward quota. The check now counts code points.
2. **Tiny numbers broke the finish hash.** JavaScript writes values below `1e-6` as `3e-7`;
   PostgreSQL re-canonicalizes them as `0.0000003`, so `finish_specialist_recommendation_v1`
   rejected the result (503 plus a stuck claim). Stored probabilities, confidence and lead are
   rounded to four decimals, cost to nine (sub-`1e-6` becomes 0), duration and tokens to integers.
   Thresholds apply to the stored values, so a receipt reproduces its own decision.
3. **Dead-end replays.** A claim left pending by a crash or failed save, or a recorded
   `unavailable` result, replayed forever under the same request ID. Workflow Lab now starts a new
   request on the next ask after `pending` or `unavailable`; network errors keep the ID so a retry
   replays the saved result without billing.
4. **Abstain copy.** "Too close" was shown when the real cause was a top probability below 0.60.

**Policy note:** the 0.15 lead rule can never bind. With probabilities summing to within 0.02 of 1,
a top choice at or above 0.60 already leads by at least 0.18. The 0.60 floor is the only real gate.

**Review cases:** a reload mints a new request ID and one new paid call (about $0.00006; capped by
quota). A failed finish returns 503, spend stays in `llm_usage_logs`, the same ID returns pending,
and the next ask starts fresh. A newer published version does not change an applied recommendation:
admission pins the recommended immutable version and hash. An orphaned pending row is harmless;
an optional later SQL hardening is for `begin` to settle claims older than about a minute as
`unavailable`, which needs a new migration.

**Tests added:** `specialist-recommendations.server.test.ts` (9 cases: thresholds, abstention,
empty roster, provider failure, inconsistent ranking, emoji limits, tiny numbers, pending, request
ID conflict) and a disposable-PostgreSQL case proving the database canonicalizes `3e-7` as
`0.0000003` and that tiny Jev values now record. Passing: 9 new plus 11 admission web tests,
8/8 PostgreSQL published-specialist tests, 49/49 runtime specialist tests. The web Svelte check
was not rerun for the two-line page change.

## Production reconciliation — September 22, 2026

- Web (Vercel) and `agentic-chat-worker` (Railway) both run `5f69e79bd`, deployed 15:54 EDT. The
  recommendation endpoint, admission binding and snapshot changes are uncommitted, so none of
  this slice is deployed.
- Web flags: workflow admission, specialist workflows and document reads are on;
  `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED` and `AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED`
  are unset. Worker: document reads, specialist workflows, workflow execution and v4 preparation
  are on, Jev specialist selection is `shadow`, published specialists are unset.
- Production data: 0 specialist drafts, 0 versions, 0 recommendations, 0 published-specialist runs.
- **Landmine:** every new published-specialist snapshot now carries `taskVersion: 2`, with or
  without a recommendation, and an older worker rejects it. Web and worker deploy from the same
  push; turn on published specialists only after both report the same commit.

**Pilot path:** commit and push this change set; confirm both deploy SHAs; set
`AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED=true` on worker and web and
`AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED=true` on web, then redeploy web so the env applies;
publish the three research starters in the workbench; ask Jev once and run one review, saving the
Task 91 trace and export. The review and the Agentic Chat gate are paid and need per-run approval.
