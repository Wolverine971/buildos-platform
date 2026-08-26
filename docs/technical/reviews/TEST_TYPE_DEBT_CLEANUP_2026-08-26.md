<!-- docs/technical/reviews/TEST_TYPE_DEBT_CLEANUP_2026-08-26.md -->

# Test type-debt cleanup — 2026-08-26

## Baseline

The raw test TypeScript projects began this cleanup pass with 1,443 diagnostics across 205 files:

| Workspace | Diagnostics | Files |
| --------- | ----------: | ----: |
| Web       |         818 |   155 |
| Worker    |         625 |    50 |

The debt checker is a ratchet, not a declaration that these diagnostics are acceptable. Every
verified batch must lower `scripts/testing/test-type-baseline.json` by the observed reduction.

## Cleanup principles

- Fix inference once at mock, fixture, and generated-route boundaries.
- Prefer canonical builders and purposeful input types over annotations on every object literal.
- Preserve `strict` and `noUncheckedIndexedAccess`.
- Do not use unused-name prefixes, blanket casts, non-null assertions, or baseline increases.
- Treat a stale fixture as a possible contract or implementation loose end before changing it.
- Run focused behavior tests as well as typechecks; a lower diagnostic count is not enough.

## Prioritized backlog

| Priority | Work                                                        | Starting diagnostics | State                  |
| -------- | ----------------------------------------------------------- | -------------------: | ---------------------- |
| P1       | Route-specific generated `RequestEvent` types               |                   69 | Completed              |
| P1       | Worker provider test harness inference                      |                  404 | Completed              |
| P1       | Live/legacy tool-call contract decision                     |      218 family-wide | Delegated to Tasker 64 |
| P2       | Worker executor harness inference                           |                   85 | Not started            |
| P2       | Checked collection and mock-call access                     |        About 297 web | Not started            |
| P3       | Stale database/domain fixtures and narrow production inputs |          At least 97 | Not started            |
| P3       | Runtime/config compatibility and bespoke tail               |       Remaining debt | Not started            |

## Current pass boundary

This pass intentionally stops after:

1. Replacing generic SvelteKit `RequestEvent` imports in affected route tests with each route's
   generated `$types` contract.
2. Typing the worker provider test harness at its client/tool factory seams so Vitest call tuples and
   tool arrays infer correctly without per-test annotations.
3. Running focused tests and both workspace debt checks, then recording the exact result here.

The live/legacy tool-call decision is documented independently in
`tasker/64-agentic-chat-tool-call-contract-compatibility.md` and is not implemented in this pass.

## Change ledger

| Batch                   | Implementation                                                                                                                                                                                                                                                    | Verification                                                                                                                                                         | Result                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Route event contracts   | Replaced the generic SvelteKit `RequestEvent` import in 19 route tests with each route's generated `./$types` contract. No generic imports remain in route `server.test.ts` files.                                                                                | Focused Vitest run: 19 files and 69 tests passed. Web debt check passed at the lowered baseline.                                                                     | Web: 818 → 749 (-69)     |
| Worker provider harness | Typed provider stream mocks at the client port, normalized tool-definition fixtures at their factory boundaries, narrowed message/schema reads with runtime guards, and preserved artifact-version discrimination through one helper. No production code changed. | Worker Vitest run: 138 files passed, 1 skipped; 1,228 tests passed, 1 skipped. Provider test has zero diagnostics; worker debt check passed at the lowered baseline. | Worker: 625 → 221 (-404) |

## Pass result

This bounded pass removed 473 diagnostics and lowered the combined ratchet from 1,443 to 970. The
remaining prioritized work was not started. Tasker 64 is ready for an independent agent to resolve
the important live/legacy tool-call contract loose end.
