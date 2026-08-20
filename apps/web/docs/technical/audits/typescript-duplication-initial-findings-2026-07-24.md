<!-- apps/web/docs/technical/audits/typescript-duplication-initial-findings-2026-07-24.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-24; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# TypeScript Duplication: Initial Findings

Date: 2026-07-24

This is the first review of the AST-based inventory produced by `pnpm --filter @buildos/web analyze:codebase`. The default pass covered authored TypeScript in `src/lib` and `scripts`, while excluding Svelte components, Svelte modules, and SvelteKit routes.

The first run indexed 1,010 files and roughly 16,600 runtime functions. It found 179 cross-file clone families after tests and generated code were removed from similarity scoring. The exact totals can move slightly as the analyzer indexes its own implementation.

These findings are leads, not refactoring decisions. Each consolidation needs a behavior-preserving test boundary and an owner.

## Strong consolidation candidates

### Unknown-value parsing helpers

The largest exact-body family contains 30 copies of `isRecord` or `isPlainRecord`. Several additional families repeatedly implement nullable or trimmed-string parsing under names such as `readString`, `stringValue`, `asString`, `normalizeOptionalText`, and `toNonEmptyString`.

This is real duplication, but a single catch-all utilities file would become a junk drawer. A better split is:

- environment-neutral unknown-value guards that are safe in browser and server code;
- domain-specific readers that preserve meaningful differences such as `null` versus `undefined`, trimming policy, or accepted JSON types.

The repeated guards are a good low-risk first extraction because their contracts are small and easily tested.

### Chat-session seed formatting

`agent-run-chat-session.service.ts`, `inbox-chat-session.service.ts`, and `project-audit-chat-session.service.ts` repeat a recognizable server-side toolkit:

- `isRecord`, `readString`, and `readNumber`;
- `compactText`;
- `appendSection` and `normalizeArray`;
- in some pairs, additional loaders and formatting helpers.

The report correctly distinguishes an important detail: the inbox version of `compactText` does not call `trimEnd()` after slicing, while the other two do. That difference should be resolved intentionally before extraction. A focused `chat-session-seed-formatters` module is more appropriate than a global string utility.

Resolved on 2026-07-24. The three services now share the record, string, number, array, section, and compact-text primitives through `chat-session-seed-formatters.ts`. Contract tests lock both truncation modes: agent-run and project-audit trim the truncated prefix, while inbox explicitly opts into its historical whitespace-preserving boundary.

### Admin analytics primitives

The admin dashboard, user analytics, LLM-usage analytics, and chat-cost analytics code repeats exact or near-exact implementations of:

- numeric and text coercion;
- percentile and average calculations;
- date parsing;
- model-cost and cache-hit helpers;
- paginated row fetching.

This is both duplication and consistency risk: small changes to percentile boundaries or coercion behavior can make dashboards disagree. Shared, pure analytics primitives plus focused tests would establish one definition for each metric.

Resolved on 2026-07-24. Dashboard, per-user, LLM-usage, chat-cost, usage-cost, and media analytics now share exact numeric/text/date readers, average and percentile policies, and bounded pagination where their contracts match. The per-user percentile adapter intentionally preserves its `null` empty-set and rounded-result behavior, chat-cost keeps its broader `parseFloat` coercion, and media analytics keeps its prior 10,000-row-per-table cap.

### Gmail response and concurrency infrastructure

`gmail-read-gateway.ts` and `gmail-relevance/metadata-gateway.ts` have near-duplicate `readJsonBounded` implementations and closely related `mapWithConcurrency` implementations.

The response reader differs in domain error types and the value returned for an empty body. The concurrency mapper in the metadata gateway also accepts an abort signal. The reusable seam is therefore a lower-level bounded-body reader and concurrency scheduler with injected error mapping and optional cancellation—not directly moving either function unchanged.

Resolved on 2026-07-24. Both gateways now use `gmail-gateway-infrastructure.ts`. The bounded reader accepts policy factories so Gmail Read still returns `null` for a missing body and emits `GmailReadGatewayError`, while Gmail Relevance still returns a fresh object and emits its own error class. The shared scheduler preserves input ordering and adds optional stop-scheduling-on-abort behavior without cancelling work already in flight.

### Ontology migration state resolution

Two `determinePhaseState` methods have 93% structural overlap. One treats a phase with `order === 1` as active when dates do not decide the state; the other returns draft.

This is exactly the kind of duplication that can hide policy drift. Before consolidating, decide whether that fallback difference is deliberate. If it is, extract the date-based state resolver and keep the fallback policy explicit at each caller.

### Task-to-goal edge mapping

Resolved on 2026-07-24. `next-step-generation.service.ts` and `next-step-seeding.service.ts` now use the same pure task-goal edge interpreter from the shared ontology package. The helper owns the supported relationship tokens, identifies task and goal IDs by entity kind in either stored orientation, ignores unrelated edges, and deduplicates repeated task/goal pairs while preserving the first relationship returned by the existing queries.

Focused tests cover all three supported relationships (`supports_goal`, `has_task`, and the legacy `achieved_by`) in both orientations, invalid edges, and duplicate suppression. Regenerating the inventory removed the two service-local `extractTaskGoalLink` and `buildTaskGoalLinks` implementations from the clone report.

## Completed low-risk cleanup batch

Resolved on 2026-07-24:

- Three prompt evaluation and observability JSON converters now use one `toJsonValue` helper inside `agentic-chat-v2`.
- Domain, skill, resource, and outcome-card search now share tokenization and score-to-confidence primitives. Domain search keeps its intentional underscore-splitting mode, and each search surface still owns its scoring weights.
- Agent-run and operative request handling now use one canonical `normalizeAgentRunAllowedOps` implementation. Both previous module paths re-export it for compatibility.
- Seven authored non-route array-chunking implementations now use one `chunkArray` utility that rejects non-positive or non-integer sizes instead of risking an invalid loop.

The focused regression suite passed 75 tests. The regenerated inventory moved from 178 to 173 clone families, removing the expected JSON conversion, tokenization, confidence mapping, allowed-op normalization, and chunking families.

## Completed follow-up cleanup batch

Resolved on 2026-07-24:

- The previously extracted task-to-goal edge mapper was reverified with its eight orientation, relationship, invalid-edge, and deduplication tests.
- The two browser data loaders now use one exact `bindAbortSignal` implementation. Tests verify pre-abort behavior, consumer-only cancellation, underlying-work continuity, normal settlement, and listener cleanup.
- The three chat-session seed services now use the shared formatters described above, with both historical truncation policies locked in tests before consolidation.
- Admin analytics now use the shared primitives described above, including one tested paginated-fetch implementation with explicit per-caller row ceilings.
- Gmail Read and Gmail Relevance now use shared bounded-response and concurrency infrastructure while retaining gateway-specific policies and abort semantics.

The focused web regression suite passed 76 tests across 15 files, the task-goal suite passed 8 tests, and `pnpm --filter @buildos/web check` completed with zero errors and zero warnings. The regenerated inventory moved from 173 to 163 clone families; the service-local browser abort, seed formatting, admin analytics, and Gmail infrastructure families no longer appear in the duplicate-candidate report.

## Smaller utility families

The clone-family report also found repeated implementations of:

- SHA-256 token/text hashing;
- array chunking (resolved in the low-risk cleanup batch above);
- HTML/XML escaping;
- boolean environment parsing;
- stable JSON stringification;
- date-to-millisecond parsing;
- word tokenization.

These are worth consolidating when ownership is obvious. They should be grouped by cohesive responsibility—crypto, parsing, concurrency, or text encoding—rather than collected in a generic `utils.ts`.

## Likely intentional similarities

Several high-scoring pairs look like sibling behaviors rather than debt:

- `differenceInDays` and `differenceInHours`;
- project, task, goal, and plan badge-class functions;
- provider-specific model normalization functions;
- task, goal, and plan state-bucketing functions.

Parameterization may reduce line count but could make the domain policy harder to read. These should be marked “keep separate” unless the implementations are already drifting or changes routinely need to be repeated across siblings.

## Suggested cleanup order

1. Extract and test the exact unknown-value guards with an explicit `null`/`undefined` policy.
2. Completed: consolidate the three chat-session seed-formatting toolkits inside the server boundary.
3. Completed: establish shared admin analytics primitives, especially percentile and paginated fetching.
4. Completed: extract Gmail bounded-response and concurrency infrastructure while preserving domain errors.
5. Resolve the ontology phase-state policy discrepancy, then consolidate the shared portion.
6. Completed: move task-goal edge interpretation behind one narrow ontology helper.

After each focused change, regenerate the inventory and record whether the family disappeared, intentionally remained, or split into clearer domain-specific behavior.
