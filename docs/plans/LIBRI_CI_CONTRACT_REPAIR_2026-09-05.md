<!-- doc-status: point-in-time -->

# Libri migration prerequisite: CI contract repair

Date: 2026-09-05 UTC
Status: narrow tests pass; full remote CI and PostgreSQL 15 migration gate still required.

## Scope

The user approved continuing after CI blocked the pending Libri author-column grant. This change
repairs only the five failing web test files/snapshot contracts from runs `33944418610` and
`33970166181`. No production application logic, tool schema, migration, permission, or CI workflow
is changed. Existing unrelated staged and unstaged work remains excluded.

Two existing local corrections are included after review and verification: the project-date tests
open the already-collapsed Project details drawer before interacting with dates; the agent-call
fixture explicitly distinguishes unrestricted callers from selected-project callers. The selected
scope rejection/intersection tests still exercise selected mode. No authorization check was removed.

## Why the catalog expectations were stale

Compared the old signed snapshot with the current committed catalog, including `ef4ad9a10` and
the later nullable-reference correction. Only three definitions differ:

| Definition | Old chars | Current chars | Reviewed change |
| --- | ---: | ---: | --- |
| `create_onto_task` | 2,671 | 2,818 | Typed nonnegative `props.duration_minutes` |
| `update_onto_task` | 2,888 | 3,062 | Same typed estimate, preserving other props |
| `declare_turn_contract` | 3,516 | 4,354 | Directed relationship references, nullable optional labels, and preservation guidance |

The global profile also gained `get_onto_document_details` (+396 chars), and project gained that
tool plus `link_onto_entities` (+1,190 chars). No tools were removed. These changes fully reconcile
the signed profile deltas: global 37,995 -> 39,550; project 38,833 -> 41,578; project-create
15,458 -> 16,443, still exactly seven tools. The catalog hash moves from
`dd61666d97ecdea7486daebfc97a57cfc9fc11f4f418c2be8ec1e90bd490fb3e` to
`efe67ba3dd2eb9722e2291bda54110d2f96e641d451bf78945070636dc85d36d`.

Refresh only that reviewed snapshot and the affected caps: task 2,850 chars, project 42,000 chars,
project-create 16,600 chars, largest project schema 1,100 estimated tokens (measured 1,089).
New semantic assertions pin the typed estimate, nullable bounded relationship references, mounted
read/link tools, and largest-schema identity. Existing total prompt, global profile, aggregate
schema, and per-turn budgets stay unchanged. This test repair does not itself spend more tokens
or change a runtime capability. Future unrelated growth must still fail.

## Validation and release gate

All five originally failing files pass: 25 tests, including the additional semantic contract test.
The catalog snapshot was regenerated only after the structural comparison above. Focused ESLint
and formatting checks are required before commit; the full remote repository/coverage/integration
checks and dependent PostgreSQL 15 job remain the production migration prerequisite.

Apply only `20260903230207_libri_frontend_author_read_boundary.sql` after those gates pass and
fresh pre/post production boundary snapshots are captured. Do not bypass CI, blanket-push schema
history, or activate the legacy author flag merely because the grant exists. Standalone Libri
read browsing is already independent of that transitional flag.
