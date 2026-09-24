<!-- docs/architecture/SPECIALIST_WORKBENCH_2026-09-20.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-20; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Specialist workbench and reference knowledge

Implemented September 20, 2026; database migration applied to production the same day.
The first workbench is at
`/workflow-lab/specialists`, linked from `/workflow-lab`. It lets DJ author specialist
definitions before connecting custom versions to durable chat execution.

## What works

- Start from a document organizer; edit its name, description, expertise, instructions,
  default assignment, and whether the bounded document-read tool is available.
- Paste reference notes or upload `.md`/`.txt` files. These are authored knowledge sources,
  not imported project documents. The loader pins exact included text and SHA-256 hashes.
- Add labelled example requests and check their required capabilities without inference.
  Inspect the resolved system prompt, tools, reference text, and knowledge prompt.
- Save personal drafts with optimistic revisions. Switch drafts without silently losing edits.
- Publish immutable catalog versions; inspect and download each saved snapshot. Later edits
  do not modify published instructions, knowledge, capabilities, model policy, or budgets.

**Publishing does not activate a custom agent in chat.** Snapshots explicitly say
`activation: catalog_only`; executable workflow snapshot parsers remain unchanged. The
supported profile is currently document evidence. Tools, models, budgets, and execution
contracts remain code-owned; arbitrary tools or graphs cannot be supplied by the browser.

The labelled checks validate input bounds and the author's declared document-read requirement.
They do not measure answer quality, infer which tools a question needs, or call a model.
Research and the full Agentic Chat QA gate remain deferred by DJ.

## Storage and access

Migration: `20260920162616_agentic_chat_specialist_workbench_v1.sql`.
It is **applied to production** (`iwifjtlebphefldmwbkh`) and recorded under its original version.
The database is ready for web deployment. Existing workflow canonical-hash/service-role helpers are its
dependencies; it does not require the pending document evidence handoff migration.
Do not blanket-push unrelated pending migrations or repair existing ledger entries blindly.

The authenticated page and API reuse `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS`. Users outside
the pilot receive 404. No separate enable flag is required. The API checks same-origin JSON
writes, actual request byte length, and strict draft fields before persistence. The verified
session supplies ownership; client-supplied owner IDs and compiled snapshots confer no authority.

Drafts and versions are private, RLS-enabled tables without browser grants. The server adapter
uses service-role access only after authentication/cohort checks, and scopes every query to the
session owner. Mutating RPCs require service role. A per-owner advisory lock serializes initial
saves/caps; row locks serialize revisions and publication. Identical retries return the original
receipt. Stale edits conflict, versions bind the saved draft hash/revision, and updates to
published versions are prohibited. Responses are private and uncached.

Prototype bounds: 20 drafts per account, 50 versions per draft, four knowledge notes, six example
requests. Raw notes accept up to 16,000 code points; included notes are capped at 6,000 code points
and 12,000 serialized UTF-8 bytes each. The full knowledge packet is capped at 52 KB. Preview
shows truncation and publication requires shortening clipped notes. Drafts are capped at 120 KB;
compiled versions at 90 KB. Invalid Unicode and null bytes are rejected for consistent SQL/JS
hashes. Reference notes are explicitly untrusted reference material, not project-state evidence.

## Validation

- 18 free runtime contract tests: strict authoring boundary, Unicode/byte bounds, pinned knowledge,
  missing capability, immutable resolution, tampering, and compiled snapshot size.
- 8 API tests: authentication/cohort, origin/content/body checks, owner isolation at the service
  boundary, server-owned publication, errors, and exact-version retrieval.
- 12 workflow admission regression tests pass after fixing the v4 RPC type declaration.
- 7 disposable Postgres integration tests exercising the real server adapter and SQL: saved and
  published history, idempotency, stale edits, concurrent saves from separate connections,
  cross-owner access, hash binding, immutability, RLS, browser-role denial, and hosted default grants.
- Runtime package build and web Svelte check. The web check also caught and fixed the missing v4
  admission RPC name in the earlier evidence-handoff TypeScript interface.
- Browser interaction check with the real Svelte page and synthetic in-memory storage: save,
  preview, publish, inspect snapshot, missing-tool rejection, preview invalidation after edits,
  and unsaved-switch protection. This was not a production or authenticated end-to-end smoke.

The initial implementation used no paid model calls or production changes. The subsequent
authorized migration application is recorded below; no model calls or app deployments were needed.
The remote Svelte autofixer was blocked by automatic approval review because it would upload
repository source; local compilation and the repository Svelte check were used instead.

## Production migration verification

Applied September 20, 2026, after DJ explicitly requested it. The exact migration and its original
ledger entry were committed together, with a five-second lock timeout and a schema-cache reload.
Unrelated pending migrations, including the earlier document evidence handoff, were not applied.

Before deployment, inspection found that hosted Supabase default privileges grant `ALL` on new
tables to `service_role`. The migration now revokes those defaults before granting draft
`SELECT/INSERT/UPDATE` and version `SELECT/INSERT`. This closes unintended service-role deletion,
truncation, and trigger access. The integration fixture now recreates those hosted defaults and
verifies the exact effective permissions. All seven focused integration tests pass.

Production verification passed:

- Exact migration source matches the recorded ledger source; all three function bodies match.
- Both tables have RLS enabled. Browser roles cannot execute the catalog functions; only service
  role and the database owner can. Functions are invoker-security with fixed search paths.
- Real save, publish, exact snapshot readback, idempotent retries, owner scoping, revision update,
  stale-publication rejection, and service-role deletion denial work with a synthetic fixture.
  The verification transaction rolled back; both catalog tables contain zero fixture rows.
- The security advisor has no warning attributable to these objects. Its two informational
  [RLS-without-policy findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  are intentional for tables accessible only through the verified server adapter.

No custom specialist was activated, and the full QA/research gate remains deferred.

## Published-version execution — implemented locally

The explicit selection path below is now implemented. See
[PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md](PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md)
for the migration dependency, gates, rollout order, and validation. It remains off until rollout.

Connect an explicit published-version choice to the existing document-review workflow. Admission
must verify owner/profile/capabilities, freeze the exact catalog version and knowledge packet into
the run, and preserve them through recovery. Start with a single custom organizer in the supported
graph. Use the frozen version's reference knowledge alongside project evidence without promoting
reference notes into citations about the project. Draft changes must never affect admitted work.

Then give Jev a small eligible roster before admission freezes that snapshot. Persist its choice
once, retain explicit user choices, and enforce capability/spend/fallback policy in host code.
Additional tools, typed workflow entry points, and specialist domains can follow this boundary.
