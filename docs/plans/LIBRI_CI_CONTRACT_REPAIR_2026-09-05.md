<!-- doc-status: point-in-time -->

# Libri migration prerequisite: CI contract repair

Date: 2026-09-05 UTC
Status: full remote CI and PostgreSQL 15 migration gate passed; exact author-column grant applied.

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
The catalog snapshot was regenerated only after the structural comparison above. Focused ESLint,
formatting and strict documentation health checks passed before the repair was committed.

Commit `50d956d28725aefc175e3c35a5d50af614b04f71` passed full
[CI run 33983662189](https://github.com/Wolverine971/buildos-platform/actions/runs/33983662189),
including repository verification, coverage, database integration, self-contained SQL contracts,
and the dependent PostgreSQL 15 Libri ledger/scope/contracts gate. The separately scheduled RPC
schema-drift job was skipped on this push and is not included in that verification claim.

Only `20260903230207_libri_frontend_author_read_boundary.sql` was applied at September 5,
18:44:39 UTC. The management tool's generated history timestamp was reconciled to the exact
repository version after comparing its stored SQL; unrelated migration history was untouched.
The retained query found the same 16,258 non-Libri signatures before/after, fingerprint
`8c5f67748ce17e129ebff6e7e418ebe3`, and unchanged people policies/role limits. Only the two column
SELECT privileges changed. BuildOS table canaries and the normal Projects UI passed after apply;
immediate security/performance advisor finding keys were unchanged.

Production restricted-reader data-query smoke remains unverified: the management connection cannot
assume the reader role, and the Vercel CLI did not supply that existing credential to a verification
process. No role or credential was changed to bypass this limit. Actual restricted-role SQL tests
passed on disposable PostgreSQL 15, and production ACL/RLS metadata was verified. Keep the optional
legacy author-preview flag off. Standalone Libri user-scoped browsing is independent of this flag.

Full deployment receipt: Libri repository
`library-app/docs/LIBRI_AUTHOR_GRANT_DEPLOYMENT_2026-09-05.md`. Future migrations still require
fresh full CI, the PostgreSQL 15 gate and production boundary checks; this receipt is not a waiver.
