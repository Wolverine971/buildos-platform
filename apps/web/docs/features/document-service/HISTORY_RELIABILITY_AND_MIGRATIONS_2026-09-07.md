<!-- apps/web/docs/features/document-service/HISTORY_RELIABILITY_AND_MIGRATIONS_2026-09-07.md -->

# History reliability and migration verification

**Date:** 2026-09-07. Follow-up to the [restore safety pass](./RESTORE_SAFETY_AND_ACCEPTANCE_2026-09-07.md).

## History and comparison

The follow-up review found that version-list responses were not scoped to their document, filter,
or page request. Comparison snapshots were cached solely by version number, and even a cancelled
response could populate the cache. The newest revision could also remain stale while absorbing
more saves. These gaps could make the history displayed before restore misleading.

- Document/filter changes and refresh cancel obsolete history loads; late successes and errors
  cannot replace the active list or change its loading state. Pagination follows the same request
  identity, and overlapping page rows are deduplicated.
- Refresh clears the restore selection. Selecting again uses the refreshed snapshot hash; the
  restore endpoint continues to enforce the reviewed hash and guarded head timestamp.
- Comparison caches are scoped by project, document, and version. Only revisions older than the
  newest version are cached. Cancelled responses cannot populate the cache.
- Both historical sides load concurrently. Changes to the Current editor side recompute the diff
  without additional history requests. Selecting a history row again refreshes the comparison,
  including when the version number has not changed.
- A missing snapshot produces an explicit error instead of a misleading empty baseline.
- Keyboard shortcuts belong to the focused comparison region. They cannot navigate history from
  a filter input or behind a restore dialog, and Escape from comparison does not also reach the
  document modal's close handler.
- Mobile Edit and Preview tabs retain accessible names when their visible text is hidden.

## Production migrations

Target: linked Supabase project `iwifjtlebphefldmwbkh`.

1. `20260907162504_fix_document_content_hash_recency_guard.sql`: the complete installed function
   body already matched the local migration exactly. Reconciled its missing ledger entry with
   `supabase migration repair 20260907162504 --status applied --linked`. Verified the recorded
   version and name afterward. No replacement timestamp or duplicate migration was created.
2. `20260907200711_harden_document_recency_guard_search_path.sql`: applied a follow-up migration
   to pin the function search path to the empty string, fixing the warning returned by Supabase
   Advisor. The local file was created with `supabase migration new`, then aligned to the actual
   version recorded by the migration API. Verified `proconfig` contains `search_path=""`.
3. Confirmed the three Step 2 prerequisite migrations remain applied: `20260827022436`,
   `20260827022510`, and `20260827022735`.

Ran `supabase/tests/20260907162504_document_recency_guard.test.sql` against the live function,
using a temporary table with the real generated-column behavior, before and after search-path
hardening. For the CLI query transport, removed only the psql `\set` directive and added a success
SELECT. Both runs returned `document_recency_probe_passed` and rolled back. No user documents,
content, or version rows were edited.

The probe covers outline-only updates, two consecutive guarded saves, generated hash changes,
stale-writer rejection, authored metadata changes, and managed START HERE refreshes. After the
follow-up migration, Advisor reports no warning for this trigger. Project-wide unrelated advisor
findings remain outside this document change. The relevant guidance is
[Supabase's function search-path advisory](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0011_function_search_path_mutable).

## Verification

- 61 focused web tests passed across the document modal, proposal review, history, comparison,
  restore dialog, restore route, and version-list route. Ten new history/comparison regressions
  cover cross-document races, pagination/filter races, cache contamination, open revisions,
  live editor updates, missing snapshots, refresh selection, and shortcut scope.
- Svelte component analysis found no issues in the two changed history/comparison components.
  Its remaining suggestions concern intentional request-lifecycle effects and nonreactive
  request-cache/date calculations.
- 13 shared versioning/guarded-write tests passed, bringing the focused total to 74.
- Required Svelte check passed with **0 errors and 0 warnings**, including the final mobile
  accessible-label adjustment.
- Formatting and `git diff --check` passed.

### Browser acceptance

Reused the real-component synthetic fixture archived in `output/playwright/document-restore/`.
Checked desktop comparison navigation and Escape, then the stacked restore dialog and complete
restore/refresh flow at 390 × 844. The updated components passed:

- Arrow keys in restore do not navigate the underlying comparison.
- Escape dismisses the restore confirmation while leaving comparison and the document open.
- A restore writes a recovery checkpoint first, records the restored version, and returns focus
  to the editor with the expected content. Four history entries remain in the two-version fixture.
- Both mobile editor tabs have accessible names. Document width equals the 390px viewport.

Evidence is in `output/playwright/document-history/`: `browser-result.txt` contains the assertions
and the replay script; `mobile-restore.png` and `mobile-restored.png` show the result. No browser
errors occurred. The standalone dev fixture emits existing `sanitize-html` dependency
externalization warnings. The task browser and dev server were closed, and temporary fixture
files were removed from application source/static assets.

## Remaining acceptance

The database migrations are verified in production. The editor/API changes remain local and need
application deployment before a disposable live-document save → proposal → apply → restore test
can establish production end-to-end acceptance. Head and version writes still use separate
transactions with the explicit history-failure warning contract. Physical microphone, live model,
and production telemetry acceptance remain open.

After these gates, the next roadmap work is atomic one-live-START-HERE creation and duplicate
reconciliation, followed by the structured current/stale/missing index. See the
[Step 3 handoff](./STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md).
