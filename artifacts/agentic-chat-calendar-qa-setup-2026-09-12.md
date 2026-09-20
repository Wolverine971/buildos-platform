<!-- artifacts/agentic-chat-calendar-qa-setup-2026-09-12.md -->

# Agentic Chat QA Calendar setup — September 12, 2026

Status: Google Calendar is connected and a real QA fixture read passed. The
complete release gate is being rerun; there is no passing release result yet.

## Account connection update

The user explicitly chose `djwayne35@gmail.com` for QA instead of a separate
Google account. A fresh authorization under the dedicated QA OAuth client is
stored in the isolated database; production connection tokens were not copied.

- Created the separate `BuildOS Agentic Gate QA` calendar in that account.
- Enabled only that calendar's Events and Availability source settings in the
  isolated app. All other calendars have Events, Availability, Analysis and
  Two-way sync disabled there. QA is also the default write target.
- Added `QA busy block — Agentic Gate` on September 14, 2026, 10:00–11:00
  America/New_York, with no attendees or notifications, solely on the QA calendar.
- `pnpm agentic:calendar-setup --check` now passes.
- A real authenticated `/api/calendar` read returned exactly one successful
  source and that one event, with no partial result or warnings. Evidence:
  `output/agentic-calendar-qa-read-2026-09-12.json`.

Source selection limits what this QA app reads; the OAuth token still carries
the application's full Calendar scope for the chosen Google account. The fixed
port setup server was stopped before starting the full gate to free resources.

The earlier sections below retain the initial setup and failed-gate history.

## First connected full gate and repairs

`output/agentic-gate/2026-09-12T20-28-40-987Z/` completed all 45 turns across
three repetitions. The retained score is **47/52**, with 43 passing turns. All
load-bearing duration and tool-count limits held. This is a **failed gate**:

- Case 2, repetition 1: the actor proposed the correct three dependency edges,
  but the independent reviewer repeatedly called the inspection/electrical edge
  reversed while demanding the identical source and destination IDs. The batch
  stayed withheld, leaving the task creates without their dependencies.
- Case 10, repetition 2: the judge mistook an unmapped project calendar for a
  failed configured source. The actual user read had complete coverage of one
  real source, no failures, and the QA busy event. The project read reported
  `mode: none`, zero sources and no mapping. The other two repetitions passed.
- Final checkout provenance differed from the verified startup services. A
  source-tree prose file, `apps/worker/src/workers/agentic-chat/djflow-architecture.md`,
  was modified during the run; the current provenance implementation includes
  files under `apps` regardless of extension. No passing provenance claim is made.

The targeted repair renders exact withheld calls as readable JSON, with directed
links displayed source → relation → destination, for both review and correction.
The reviewer must compare actual and required values before demanding a change.
This alters presentation only: it does not change execution bytes, SHA binding,
approval requirements, retry limits, or the semantics of a reversed proposal.

Calendar grading now explicitly distinguishes no project mapping from a failed
configured source. The deterministic guard is **stricter**: every observed
coverage record must be complete, with matching counts and no partial/failure
signals; at least one real source remains mandatory. A good read cannot mask a
failed second source. The quality threshold and scheduling constraints are unchanged.

Local validation: 134 worker tests and 19 Cedar House oracle tests passed;
targeted Prettier and whitespace checks passed. A new full gate is still required
on the resulting unchanged tree. The optional external retained-prompt replay
was blocked by approval review and was not performed; local tests and the normal
authorized gate remain the verification path.

The first post-repair attempt, `2026-09-12T20-52-41-472Z`, passed all 99 oracle
tests but stopped with `fetch failed` during isolated database setup under the
network-restricted sandbox. The normal gate was restarted with approved network
access at `output/agentic-gate/2026-09-12T20-53-03-599Z/`; its preflight and service
startup passed. Final results are pending.

### Post-repair findings while the gate runs

- Case 2 passed all three repetitions with every required dependency saved,
  at 48.9s, 43.3s and 47.8s (limit: 60s).
- Case 4, repetition 2 performed the correct update and readback, but the update
  took 36.352s (limit: 30s). Its four model calls took 4.240s, 4.129s, 3.954s and
  2.298s. There is a 9.130s gap from the second acting pass's recorded completion
  to the reviewer request start. A read-only check of those four isolated QA usage
  rows showed insertion timestamps only 109–124ms after model completion; that
  does not measure transaction completion or identify the remaining wait. No
  billing/accounting fence was removed on speculation.
- Case 7, repetition 3 saved `copper &amp; oak.` instead of the requested raw
  Markdown `copper & oak.`. The model's proposed argument already contained the
  escape, so storage preserved the incorrect proposed bytes. Its tool-free final
  response emitted DeepSeek DSML calls as text; sanitization stripped wrapper
  lines but leaked the `parameter` line. The exact-content oracle caught the
  durable mismatch. This is not fixed by the reviewer presentation repair.
- Other work modified context-loader code, runtime exports and Vitest configuration
  during this gate (first observed file mtimes: 16:54 EDT, shortly after startup).
  Additional context refactoring continued afterward. The startup fingerprint was
  `fe0458dd05be4bcd4cca094f9b113c4ca867feca414757aa88b9cfaf86f371e7`;
  an intermediate fingerprint changed to
  `ead2da73213a852da8bab75c1e628258c64e5b04cbfb528e73eb1b1f478eded1`.
  These concurrent changes were not made or overwritten by this task. The run
  cannot establish a clean release result for a single unchanged source tree.

## Configured

- Created the `BuildOS Agentic Gate QA` web OAuth client in Google Cloud project
  `buildos-gmail-read`, without changing either production client.
- Registered `http://localhost:5174/auth/google/calendar-callback`. Port 5173 is
  occupied by The Cadre's development server.
- Stored the new client ID and secret in the ignored `.env.agentic-gate.local`;
  the env file and downloaded credential JSON have mode 0600. No credentials are
  included in this report.
- Verified that the existing V1 encryption key meets the minimum length and that
  the gate database differs from both normal app env files.
- Enabled the source-aware Calendar feature and allowlisted only the isolated
  gate user's UUID. Without both settings, the Calendar settings screen could
  not start the required connection flow.
- Signed into the isolated app as `agentic-e2e-harness@example.com`, verified the
  connection controls, and reached Google's account chooser using the new client.
  No Google account was selected and no Calendar access/refresh tokens were issued.

## Implementation and verification

Calendar preflight now rejects a disabled feature or missing/excluded gate user
allowlist entry, even when saved connection/source rows exist. Three focused
preflight tests pass, including negative flag, empty allowlist, wildcard and
wrong-user cases. Changed files pass Prettier; tracked whitespace checks pass.

The setup helper and gate documentation now disclose the actual permission:
the existing application requests full Calendar access, including edits. The
gate exercises reads only, which does not narrow the OAuth credential's scope.
The fixed-port setup command and localhost header-limit workaround are documented
in `docs/testing/agentic-chat-gate.md`.

Final ordinary gate attempt:
`output/agentic-gate/2026-09-12T20-20-43-612Z/`.
All 97 oracle tests passed. The isolated reference-data and facet RPC checks
passed. Calendar preflight failed with
`Gate user has no active QA Google Calendar connection` before services/battery
started. No release scorecard exists for this attempt.

## Initially remaining

1. Identify the dedicated QA Google account and complete its Calendar consent.
   The browser is at account selection; a personal/production account was not
   chosen automatically. The setup helper times out after 20 minutes, and OAuth
   state expires after 10 minutes; restart setup and initiate a fresh connection
   if necessary.
2. Verify an active connection with at least one readable QA source, then run the
   entire three-repetition gate on one unchanged source tree. Require 52/52,
   timing/read limits, complete evidence, and verified provenance.

The earlier conversation summary overstated the outstanding runtime failures:
the September 11 repair report and retained later diagnostics show repeated
passes for Cases 2/4/8/11 and then Case 14. Those subsets are useful evidence but
cannot be combined into a complete release pass. Historical artifacts are kept.
