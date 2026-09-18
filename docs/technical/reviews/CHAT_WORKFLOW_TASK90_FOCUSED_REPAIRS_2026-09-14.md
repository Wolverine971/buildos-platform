<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK90_FOCUSED_REPAIRS_2026-09-14.md -->

# Task 90 — provider and reviewer repairs, focused validation

**Subsequent full-gate result:** DJ later authorized one isolated three-repetition
gate. It finished **45/52, failed**, with stable provenance; see the
[September 14 gate result](CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md).
The focused-phase receipt below remains valid, but it does not establish live
acceptance. Its statements about no full gate describe that earlier phase only.

Implemented locally; **392 distinct focused tests pass**, worker source types pass,
worker test-type debt remains **0/0**, and lint passes for the changed runtime files.
DJ explicitly requested fixes and focused tests **without another full gate**.
No full gate, live model probe, commit, or deployment was performed by this task.
Tasks 82/84 remain unaccepted; this is not a new Cedar House acceptance receipt.

## Changes tied to the retained failures

- **Case 2's 58.1-second Modal response:** the V4.1 acting route ignores Modal,
  alongside its existing Azure/Morph exclusions, including when provider ordering
  or sorting is overridden. Other fallback providers remain available. V4 defaults
  and reviewer routing keep their existing policies.
- **Ten-second response-header stalls:** the default opening deadline is now five
  seconds. It still aborts transport and disposes late responses from a fetch that
  ignores abort. The separate generation deadline and turn budget still apply.
  Retained evidence had 1,270 of 1,275 successful acting responses opening within
  five seconds; the other five could now take the existing fallback.
- **Case 4's slow streams:** buffered V4.1 acting, repair, and final-response passes
  can use their existing single retry when a four-second window produces fewer
  than 240 output bytes/second. This is a byte-based progress heuristic, not token
  throughput measurement. It counts output and tool argument bytes, excluding SSE
  envelopes and repeated call IDs. The failed stream is aborted and discarded,
  its named provider/model enters the existing per-turn failure routing, and the
  next attempt has a distinct accounting identity. There is no concurrent hedge
  and no additional retry allowance. Reviewer passes, direct unbuffered callers,
  other models, a completed generation awaiting usage, and attempts without enough
  remaining turn budget do not opt into this recovery. The final retry retains its
  normal deadline. A delayed timer beyond eight seconds resets the progress sample
  rather than blaming the provider for a suspended host.
- **Case 2's priority-2-to-priority-2 revision:** the reviewer can cite bounded
  scalar `argument_checks` against the one-based held call number and argument
  path. Code compares the required value with the actual immutable argument.
  An identical value or invalid evidence triggers the existing single internal
  reviewer repair. The same batch must receive a fresh, SHA-bound decision. A
  repeated contradiction, bad SHA, or unavailable recheck fails closed; real
  corrections still go to the actor. Checks never edit or authorize calls. The
  reviewer cache-key version was advanced for the prompt/schema change.

The revision comparison is intentionally limited to supplied structured evidence.
Structural and prose revisions without scalar checks retain their existing review
path. Focused tests cannot prove the live reviewer will always supply correct checks
or stop making semantic mistakes.

## Focused validation

| Scope                                             |   Tests | Result   |
| ------------------------------------------------- | ------: | -------- |
| Provider client                                   |      81 | Pass     |
| Provider coordinator, including reviewer rechecks |     139 | Pass     |
| Provider routing                                  |       4 | Pass     |
| Mutation-review presentation                      |       4 | Pass     |
| Scalar revision evidence                          |      17 | Pass     |
| Slow-stream recovery                              |      13 | Pass     |
| Turn executor                                     |      95 | Pass     |
| Durable publisher                                 |      31 | Pass     |
| Pending effects                                   |       8 | Pass     |
| **Distinct tests**                                | **392** | **Pass** |

All Vitest runs used `test-gate run pnpm --filter @buildos/worker exec vitest run`
with explicit files. No root suite, gate battery, or live provider call ran.
The worker source and test typechecks and ESLint on the changed runtime files also
ran through `test-gate`.

Evidence: [`output/task90-focused-2026-09-14/`](../../../output/task90-focused-2026-09-14/).
`provider-review.log` retains five passing files (245 tests) and the initial
low-budget fixture failure; `latency-recovery-final.log` records all 13 recovery
tests passing after correction. `recovery-boundaries.log` records 134 executor,
publisher, and pending-effect tests passing, plus the earlier ten recovery tests.
Those repeated recovery tests are counted only once above. `typecheck.log`,
`test-typecheck.log`, and `lint.log` retain the static checks. `receipt.json`
records the focused result and hashes of the changed source/test files.

The initial run found three outdated expectations (header timeout, cache key,
and the internal recovery flag) and a fixture that finished at its existing
terminal deadline rather than before it. Test typechecking also found one missing
explicit `undefined` return in a mock. These were corrected; no baseline or
acceptance threshold was relaxed.

Fault tests verify that partial tool calls never escape the failed buffer, both
attempts remain accounted and drainable before billing, user cancellation prevents
recovery dispatch, healthy long responses continue, mid-stream slowdowns recover,
and failed final attempts do not start a third request. Simulated output rates
approximate the retained 21.6/38.8/23.8-token-per-second misses to exercise the byte
heuristic; these are not measured live speedups. Reviewer tests preserve the exact
held calls and require a durable approval receipt before offering mutations.

## Remaining evidence boundary

End-to-end timing and stable headroom remain unverified. A slow fallback may still
miss a ceiling, and the progress heuristic may abandon an otherwise successful
response. Its effect on actual latency and spend needs live evidence if DJ later
chooses to run it.

The previous provenance failure was a shared-checkout change during execution,
not a defect in the provenance check. No gate or isolated snapshot was started in
this focused-only task. Any future full gate must use a fixed isolated snapshot
including the uncommitted runtime changes and untracked diagnostics, with its own
workspace dependency resolution. Preserve all prior failed receipts and the rollback
lane. No gate is scheduled by this report.
