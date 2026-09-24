<!-- docs/architecture/SPECIALIST_DEFINITIONS_V1_2026-09-19.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Versioned specialist definitions

The existing project analyst and risk reviewer now run from explicit, immutable definitions.
This is the first implementation step toward custom specialists and Jev orchestration.

## Implemented

The host-neutral `@buildos/agentic-chat-runtime/specialists` entry point exports:

- `SpecialistDefinitionV1`: identity/version, expertise, system instructions, default assignment,
  knowledge references, input/output contract IDs, allowed tools/workflows, model policy, limits,
  and the shared workflow budget policy.
- `createSpecialistRegistryV1`: copies and freezes definitions, rejects duplicate identities,
  and resolves only an exact ID/version. Missing versions fail rather than silently using latest.
- `SPECIALIST_REGISTRY_V1`: the initial `project_analyst@1` and `risk_reviewer@1` catalog.
- `PROJECT_REVIEW_SPECIALISTS_V1`: exact version-1 bindings for the existing durable contract.
- `AgentSelectorV1`: an asynchronous port for future Jev selection.
- `ProjectReviewAgentSelectorV1`: the free, deterministic baseline used by the preview. It
  selects both pinned specialists for an explicit project review when both are eligible and
  fan-out allows two. Ordinary chat returns `generalist`; an ineligible explicit review returns
  `unavailable`. It does not infer relevance or call a model.

The durable runner reads the definitions' system instructions, labels, default assignments,
output limits, reasoning policy, and attempt bounds. Dispatch model routing/timeouts and progress
labels also come from the baseline definitions. The legacy prototype shares the baseline rules,
assignments, labels, and dispatch policy. The current grounded-report validator still owns report
acceptance; a definition's schema ID describes that contract, not a replacement validator.

The frozen v1 SQL roster, plan shape/hash, step IDs, stored report contracts, tools, and budgets
are preserved. Existing/recovered v1 runs bind to the exact baseline definitions. The selector
port is available for the next adapter; it does not dynamically change the current runner's roster.

## Inspect it without spending money

```sh
pnpm --filter @buildos/worker specialists:preview
pnpm --filter @buildos/worker specialists:preview --json
```

The preview prints the real registered definitions and four selection outcomes: normal review,
ordinary chat, missing reviewer eligibility, and a one-specialist limit. It reads no credentials,
database, or model API. The Markdown output can be saved and opened in the app.

Definition source:
`packages/agentic-chat-runtime/src/specialists/project-review-v1.ts`.

## Authoring rules

1. Give a specialist a stable ID and positive integer version. Instructions, execution policy,
   knowledge binding, or output contract changes require a new version. Keep the old definition
   available while old runs can resume.
2. State the scope of expertise and a default assignment. Planner assignments may specialize
   that objective but cannot grant tools, workflows, access, or additional budget.
3. Name the context and output contracts the host actually implements. The current baseline reads
   a prepared project snapshot and returns a bounded report grounded in supplied evidence.
4. Declare allowed tool/workflow IDs. Empty means none. Adding IDs or registering a definition
   alone does not make them executable; the host must resolve and authorize them.
5. Distinguish request/attempt limits from the shared run budget. The current $0.25 ceiling belongs
   to the whole review; each specialist does not receive a separate $0.25 allowance.

This first schema intentionally covers read-only specialists and the existing low-reasoning
provider contract. External knowledge loaders, custom tool loops, workflow invocation, and an
authoring UI remain subsequent implementation work.

## Document profile continuation

The first bounded implementation is now [Document organization](DOCUMENT_ORGANIZATION_SPECIALIST_2026-09-19.md):
an immutable v2 profile mapped explicitly onto the existing v1 engine's execution slots.
The profile pins complete definition contents under one canonical snapshot hash before dispatch.
The broader dynamic-graph design below remains future work.

## Dynamic durable snapshot: design boundary

This is the broader target for arbitrary specialist selection, **not an active dynamic-graph runtime**.
Do not add arbitrary step keys or silently reinterpret stored v1 plans.

| Snapshot field               | Required meaning                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow/run identity        | New contract version, run ID, owner/project scope, request hash, context ID/hash                                                                          |
| Selection receipt            | Selector ID/version, eligible definition refs, selection outcome/reason, selected refs; for Jev, model and policy versions plus bounded decision evidence |
| Resolved definitions         | Exact definition contents and canonical content hashes, not only a mutable registry ID                                                                    |
| Effective capabilities       | Intersection of definition declarations, registered host implementations, account/project permissions, and workflow policy                                |
| Knowledge                    | Exact accepted knowledge/context versions and hashes used for this run; access is rechecked on recovery                                                   |
| Assignments and dependencies | Stable step IDs, chosen specialist refs, bounded objective, dependencies, and accepted input/output contracts                                             |
| Limits                       | Effective fan-out, per-step token/attempt/time limits, shared spend/deadline, reserved synthesis budget                                                   |
| Accepted results             | Existing durable acceptance/fencing semantics, output hash, coverage, and one final answer                                                                |

Persist the selected roster, resolved definitions, and effective execution plan atomically before
dispatching any specialist. Recovery reads this accepted snapshot; it must not select again,
upgrade a definition, refresh evidence, or repeat accepted work. If a pinned definition/contract
cannot be executed, fail explicitly rather than substitute another agent. Current access and
cancellation checks remain authoritative even when a capability was allowed at admission.

The initial v2 adapter should use the deterministic selector and one new document-organization
specialist. Once that path is inspectable, add Jev behind off/shadow/on modes. Jev narrows eligible
candidates; server code enforces permissions, budgets, fan-out, and tool dependencies.

## Verification

The compatibility test pins hashes of the complete specialist prompts captured from deployed
revision `8951b7dc9`. Registry tests cover exact-version resolution, immutable copies, duplicate
identities, frozen workflow capabilities/budgets, eligibility, fan-out, and cancellation.
Existing worker tests exercise the actual runner and the frozen SQL, including process restart.

Validation passed: **111 tests** (11 registry/selector/export checks and 100 workflow checks),
the runtime package build with type declarations, worker typecheck, and compiled CommonJS/ESM
imports of the specialist entry point. Both Markdown and JSON preview commands ran successfully.
No paid model requests were made for this change set.

The full Agentic Chat gate and additional paid inference remain deferred per DJ's instructions.
No production switches or database schema changed in this step.
