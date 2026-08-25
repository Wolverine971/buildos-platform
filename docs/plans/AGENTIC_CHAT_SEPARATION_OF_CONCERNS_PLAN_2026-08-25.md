<!-- docs/plans/AGENTIC_CHAT_SEPARATION_OF_CONCERNS_PLAN_2026-08-25.md -->

# Agentic Chat separation-of-concerns architecture and migration plan

**Date:** 2026-08-25  
**Status:** Implementation in progress; Phases 0–6A are complete in the current working tree and are not deployed
**Scope:** Agentic Chat catalog ownership, web admission, shared contracts, shared operations, queued worker execution, compatibility shims, and production naming  
**Primary decision:** Move the canonical tool catalog from `apps/web` into a focused `@buildos/agentic-chat-runtime/catalog` package entry point without changing the tool surface or runtime behavior.

## Implementation record

Phases 0–6A were implemented on 2026-08-25 with the zero-delta fixtures held throughout. The shared catalog now owns definitions, metadata, immutable indexes, context taxonomy, registry/op mappings, entity-result materialization, and static surface profiles. Shared types owns the versioned queue-boundary tool-surface contract and decoder. Web still owns per-turn selection, situational capability detection, transport/admission checks, and skill-host enrichment, and all catalog consumers now use public package entry points. Worker production modules, exports, imports, tests, and executable evidence references now use role-based names; provider decomposition remains Phase 6B.

The Phase 3 registry decision is to retain the existing `tool-registry/*` version unchanged and publish discovery visibility through the separate `tool-discovery-policy/*` version. The compact versions remain cache/observability identifiers; the artifact SHA-256 remains authoritative for integrity.

## Executive summary

The queue migration has produced a sound runtime boundary:

```text
authenticated web admission
    -> immutable, hashed turn-input artifact
        -> minimal queue job reference
            -> isolated worker execution
```

The worker does not import the web application, shared packages do not import application code, and the queue payload is intentionally small. The worker reloads and validates the immutable input artifact before provider work. Those are strong separation-of-concerns choices and should remain intact.

The organizational problem is that the canonical Agentic Chat catalog still appears to be web-owned even though both the web admission path and the worker execution path depend on its meaning. Tool definitions, registry construction, static tool-surface profiles, and legacy configuration helpers remain under `apps/web/src/lib/services/agentic-chat`, while tool metadata, deterministic control behavior, and shared read implementations now live in `@buildos/agentic-chat-runtime`. One tool identity is therefore split across multiple owners.

The recommended correction is:

1. Keep wire types and validators in `@buildos/shared-types`.
2. Put canonical definitions, metadata, registry taxonomy, and static surface profiles in `@buildos/agentic-chat-runtime/catalog`.
3. Keep reusable database/domain operations in `@buildos/shared-agent-ops`.
4. Keep authenticated context construction and per-turn admission policy in `apps/web`.
5. Keep provider transport, the active worker capability projection, effect fencing, retries, recovery, billing, and delivery in `apps/worker`.
6. Treat the full catalog, an admitted tool surface, and an executable worker surface as three distinct concepts.

This does **not** justify creating a new package yet. Both runtime hosts already depend on `@buildos/agentic-chat-runtime`, and a focused subpath gives the catalog an explicit public boundary without adding another workspace dependency or build unit.

### What the relocation concretely buys

The worker has never imported web definitions — `apps/worker` has no dependency on `apps/web`, and it receives its tool schemas through the frozen artifact. So the split-ownership cost is not "the worker reads the wrong catalog." It is three specific, verifiable things:

1. **One control schema instead of two reachable ones.** Today the worker mounts its own copy of the standard controls on the legacy project-create fallback path, with materially thinner model guidance (Finding B).
2. **Build-time verification of worker mutation policy.** `mutationToolCatalog.ts` maintains a reviewed-argument allowlist that must agree with a parameter schema it cannot import; the agreement is currently maintained by comment. A shared catalog turns that into a test.
3. **A typed queue boundary.** The tool surface crosses the queue as an untyped `JsonObject` and is re-parsed three times in the worker, once inside a security fence (Finding C).

Everything else the relocation delivers is navigation and ownership clarity — real, but not behavior.

## Documents reconciled during this review

This plan extends rather than replaces the existing migration record:

- [`AGENTIC_CHAT_RUNTIME_WORKER_DEDUPLICATION_PLAN_2026-08-22.md`](./AGENTIC_CHAT_RUNTIME_WORKER_DEDUPLICATION_PLAN_2026-08-22.md) established `@buildos/agentic-chat-runtime` as the owner of deterministic host-neutral semantics and intentionally deferred web deletion.
- [`AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`](./AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md) established immutable admission artifacts, minimal queued execution references, execution fencing, and mode-specific rollout.
- [`AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md`](./AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md) extracted shared read implementations and recorded why the gateway surface stayed in web at that time.
- [`AGENTIC_CHAT_WORKER_FULL_CUTOVER_EXTERNAL_ACCOUNTS_PLAN_2026-08-24.md`](./AGENTIC_CHAT_WORKER_FULL_CUTOVER_EXTERNAL_ACCOUNTS_PLAN_2026-08-24.md) records the current public worker cutover and the intentional explicit legacy path for Gmail, Calendar, OAuth handoff, and worker-disabled image capabilities.
- [`SHARED_AGENT_OPS_EXTRACTION_PLAN.md`](../../apps/web/docs/technical/architecture/agent-work/SHARED_AGENT_OPS_EXTRACTION_PLAN.md) documents the earlier extraction tactic of leaving compatibility shims for later cleanup.

### Corrections to historical premises

Some older decisions were correct for their source state but are no longer current constraints:

- The August read-tool extraction map said `gateway-surface.ts` could not move because it used `$lib` and `process.env`. The current file has no environment dependency; its remaining `$lib` import points only to another catalog helper. Moving those helpers together removes the alias.
- The runtime/worker deduplication plan correctly made the global tool-catalog provider a non-goal absent a demonstrated co-hosting or test-isolation problem. This plan retains that restraint. Canonical catalog ownership and active-surface injection are different concerns; moving the former does not require redesigning the latter.
- The old worker phases described a read-only or fixture runtime. The production worker now exposes reviewed mutations, but filenames and comments still retain `Phase3`, `ReadOnly`, and `Fixture` terminology.
- External-account legacy execution is currently intentional capability routing, not abandoned dead code. It must not be deleted as part of a catalog move.

## Current architecture: what is already correct

### 1. The queue handoff is a reference, not a serialized runtime

`AgenticChatTurnJobV1` contains only `turnRunId` and `correlationId`. The job does not carry clients, functions, request objects, or a mutable provider context.

The worker then loads the associated turn and input artifact, checks ownership and identity, validates the artifact version/hash/size, and rejects expired or inconsistent input before starting provider work.

**Decision:** Preserve this design. Do not move authenticated turn preparation into the worker merely because execution happens there.

### 2. Admission freezes the behavior-bearing surface

Web admission selects the final worker-compatible tools, rejects unavailable capabilities through explicit transport renegotiation, and stores names plus exact provider definitions in the immutable artifact. The worker intersects that frozen surface with its reviewed executable capabilities and narrows mutation arguments before advertising them.

This provides replayability across deploys: an already-admitted turn executes against the definitions frozen for that turn rather than silently adopting a later catalog.

**Decision:** The catalog package supplies definitions; web admission remains responsible for selecting and freezing a per-turn surface.

### 3. The dedicated consumer is isolated

The Agentic Chat runtime creates a dedicated `SupabaseQueue` that registers only `agentic_chat_turn`. The dedicated Railway service starts `chat-worker.js`, while the general Railway service starts `index.js`. Production evidence records the general service with Agentic Chat disabled and the dedicated service enabled.

**Decision:** Preserve the dedicated service. Retain the general-process bootstrap only for the documented rollback window, then remove it in a separate operational cleanup.

### 4. The shared runtime package has a portability guard

The runtime recursively rejects SvelteKit aliases, application-host imports, deployment primitives, global admin clients, and `process.env` from production package sources.

**Decision:** Extend this guard to the new `catalog` sources automatically by placing them under the existing package source tree. Add a direct catalog-specific import check for clarity.

## Current ownership problems

### Finding A — canonical tool identity is split across owners

Today a tool can have:

- its provider definition under `apps/web/.../definitions`;
- its category, contexts, summary, and discovery state in `packages/agentic-chat-runtime/src/loop/tool-metadata.ts`;
- its op taxonomy in the web `tool-registry.ts`;
- its shared implementation in `@buildos/agentic-chat-runtime/tools` or `@buildos/shared-agent-ops`;
- its worker capability decision and narrowed mutation projection in `apps/worker`.

The execution adapter should remain host-owned, but the definition, metadata, and canonical op identity should be one catalog unit.

The web definition cluster is pure TypeScript data. The production definition files import only `ChatToolDefinition` from `@buildos/shared-types`; they do not import SvelteKit, environment values, Supabase, browser APIs, or web services.

### Finding B — standard control schemas have two sources, and both are reachable in production

The runtime defines the four standard semantic controls beside the deterministic executors:

- `declare_turn_contract`
- `declare_read_only_turn`
- `request_turn_clarification`
- `cancel_turn_contract`

Web independently defines the same controls in `definitions/gateway.ts`. Their parameter _structures_ agree — which is why the compatibility test passes — but the test strips every `description` before comparing, and the descriptions have diverged substantially.

Measured against the current working tree (serialized JSON length, web vs runtime):

| Control                      | Web  | Runtime | Delta |
| ---------------------------- | ---- | ------- | ----- |
| `declare_turn_contract`      | 3092 | 1817    | −1275 |
| `declare_read_only_turn`     | 449  | 371     | −78   |
| `request_turn_clarification` | 545  | 498     | −47   |
| `cancel_turn_contract`       | 420  | 343     | −77   |

The runtime copy is missing, among other guidance: the "use separate outcomes for targets receiving different values" rule, the `changes` array worked example, the labelled-create instructions for `label` / `parent_label`, and the `target_ids` discovery guidance. Those fields exist in both schemas; only the instructions that teach the model how to populate them are absent from the runtime copy.

**This is not merely organizational drift — both copies ship.** Web's copy is frozen into the immutable artifact for every normally admitted mutation surface. The worker's copy is mounted at `readOnlyProvider.ts` `productionToolsFor()` whenever semantic review is enabled and the admitted surface omits the controls — the documented legacy project-create case. So a project-create turn can receive the _leaner_ `declare_turn_contract` instructions while the prompt, the reviewer, and the contract validator all assume the richer contract vocabulary.

Tool descriptions are model-facing behavior, and this fallback path is the same path whose release gate is currently failing. A schema test that ignores descriptions cannot establish behavioral equivalence, and it did not catch this.

**Recommendation (two parts, deliberately separated):**

1. **Independent of this migration:** decide which copy is canonical, converge them, and re-run the project-create battery. Web's copy is the production copy for every admitted surface, so it is the presumptive winner; adopting it makes the fallback path strictly better-instructed and changes nothing on the normal path. This is a behavior change to a live failing path and should ship on its own with an eval, not inside a file move.
2. **Inside this migration:** once converged, host the single definition at `catalog/definitions/controls.ts` with its `*_TOOL_NAME` constants, have the deterministic executors import from there, and point the web compatibility exports at the same objects. Then tighten the compatibility test from "parameters without descriptions" to full canonical equality so the drift cannot recur.

### Finding C — the artifact contract does not type or validate its tool surface

The shared worker contract types `prepared.toolSurface` as a generic `JsonObject`. Web constructs it from `unknown[]` and round-trips it through `JSON.stringify`/`JSON.parse`. The shared artifact validator validates the artifact hash and many prepared fields but does not validate tool-surface names or definition structure. The worker then re-parses the same untyped blob in **three** independent places, each with its own hand-rolled shape checks:

- `readOnlyProvider.ts` `productionToolsFor()` — builds the executable tool list;
- `readOnlyProvider.ts` `buildWorkerToolSurfaceOverride()` — builds the surface-override prompt line;
- `mutationAdapterBoundary.ts` — the `mutation_tool_not_admitted` fence, which is a **security boundary**, not a convenience decode.

Consequences:

- name/definition mismatches are discovered late;
- the worker owns a decoder for a shared wire contract;
- duplicate names and unsupported schema shapes are not rejected at the shared boundary;
- TypeScript cannot prove that admission wrote what execution expects.

The overall artifact content hash is already a SHA-256 and remains the integrity authority. Prepared-prompt and prompt-snapshot paths also persist hashes of the actual tool definitions. A new catalog version should therefore be observability metadata, not a substitute integrity fence.

### Finding D — registry types are structurally duplicated

The web registry defines `RegistryOp` with `parameters_schema: Record<string, any>`. `@buildos/shared-agent-ops` carries a structural mirror because it cannot depend upward on the web registry. If the registry implementation moves into `@buildos/agentic-chat-runtime`, `@buildos/shared-agent-ops` still must not import the runtime package because the runtime already depends on shared operations.

**Recommendation:** Put the small serializable registry-entry contract and JSON-schema value types in `@buildos/shared-types`. Let both the catalog and shared operation gateway depend downward on that contract. Keep registry construction and values in the runtime catalog.

**Dependency detail that the move map must respect:** `RegistryOp.contexts` is typed `ToolContextScope[]` in web and deliberately weakened to `unknown[]` in the shared-agent-ops mirror, because `ToolContextScope` currently lives in the runtime's `loop/definition-types.ts`. Unifying the contract in `@buildos/shared-types` therefore requires `ToolContextScope` to move to `@buildos/shared-types` as well — it cannot land in `catalog/types.ts` as the move map otherwise implies. Keep `FieldInfo` and `ToolMetadata` in `catalog/types.ts` and have them import `ToolContextScope` downward from shared types.

### Finding E — `tools.config.ts` mixes live primitives, legacy grouping, and dead exports

`tools.config.ts` currently contains:

- canonical name/definition lookup helpers;
- context defaults and static groups;
- read/write and execution-category lookup;
- token estimates and prompt-formatting helpers;
- several precomputed arrays;
- compatibility behavior for legacy shapes.

Static usage inspection found 15 importing files, but many exported symbols have no consumer outside their defining file. The move should not preserve unused API merely because it exists.

**Recommendation:** Split before moving:

- Catalog indexes and lookup helpers move to `catalog/indexes.ts`.
- Execution/discovery taxonomy moves to `catalog/taxonomy.ts`.
- Static surface profiles move to `catalog/surfaces.ts`.
- Prompt-only presentation helpers stay with the prompt host if still used.
- Zero-consumer exports are deleted after an all-file search and focused tests.

### Finding F — registry versioning omits discovery behavior

The registry exposes `chat_discoverable`, but `metadataForRegistryVersion` deliberately omits `chatDiscovery`. A change that hides or reveals a tool can therefore change registry behavior without changing the reported version.

The existing version uses 32-bit FNV-1a. That is adequate as a compact cache/display identifier but should not be treated as a collision-resistant correctness or security boundary.

**Recommendation:** Decide explicitly between:

1. include `chatDiscovery` and version every behavior-bearing registry field; or
2. expose separate `definitionHash` and `discoveryPolicyVersion` values.

Do not use the FNV value to authorize execution. The immutable artifact hash and worker capability checks already serve that purpose.

### Finding G — compatibility shims obscure current ownership

There are about 29 web files of 20 lines or fewer whose primary purpose is forwarding runtime exports. Additional catalog shims include `tool-definitions.ts`, `definitions/field-metadata.ts`, `definitions/tool-metadata.ts`, and `definitions/types.ts`.

The shim tactic reduced blast radius during extraction, but leaving shims indefinitely makes code search and ownership unclear.

**Recommendation:** Every new shim introduced by this plan gets an expiry phase and a zero-consumer deletion gate.

### Finding H — production worker names describe an obsolete phase

The production composition root instantiates `AgenticChatFixtureTurnExecutor` and `AgenticChatFixtureMutationExecutor`. The real provider class is `AgenticChatOpenRouterReadOnlyClient`, and the 5,345-line provider coordinator is `readOnlyProvider.ts`, even though reviewed write tools are active.

The naming is now materially misleading, not merely cosmetic. It makes it difficult to distinguish test fixtures from production runtime code and encourages additions to an already broad provider module.

### Finding I — the worker provider coordinator has several separable responsibilities

`readOnlyProvider.ts` currently contains:

- provider request/response contracts;
- the active loop catalog installation;
- independent reviewer tool definitions;
- supervisor runtime coordination;
- streamed tool-call assembly;
- allowlist enforcement and repair;
- semantic disposition, contract, and mutation-batch review prompts;
- contract authorization and validation repair;
- provider-step construction;
- prompt snapshots and hashes;
- artifact tool-surface parsing and mutation projection;
- usage normalization and error mapping.

This should be split by behavior seam after the catalog migration, not moved wholesale into the shared runtime merely because it is large.

### Finding J — documentation and diagnostics are stale

- `apps/worker/README.md` describes only the API, general worker, and scheduler; it omits the dedicated chat process and `agentic_chat_turn` job.
- `apps/worker/package.json` still describes the package as a daily-brief worker.
- Several Phase 3 comments say modules are absent from production even though `chat-worker.ts` imports them.
- `pnpm --filter @buildos/web report:agentic-tools` currently fails while loading a skill `SKILL.md` through the TSX path. The equivalent focused Vitest size-report tests pass, but the operator-facing report command is not usable as a migration baseline until repaired.

    Reproduced cause: the skill modules import playbooks as `./definitions/<skill>/SKILL.md?raw`, which is a Vite-only transform. Plain `node --import tsx` throws `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".md"`. The cheap repair is to run the report through Vite (a `vitest run` reporter script or `vite-node`) rather than raw tsx; the invasive repair is an injected skill-source adapter. Prefer the cheap repair — the failure is in the skill subsystem, which this plan does not move.

### Finding K — the catalog would stop hot-reloading in `pnpm dev`

`turbo.json` gives `dev` no `dependsOn: ["^build"]`, and `apps/web/vite.config.ts` has **no** alias for `@buildos/agentic-chat-runtime`. Web's dev server therefore resolves the runtime package through `node_modules` to its built `dist/`. Vitest is the only consumer aliased to package source (`apps/web/vitest.config.ts`, `apps/worker/vitest.config.ts`).

Today that costs little, because the runtime holds deterministic logic that changes rarely. After the move it would mean that **editing a tool description or parameter schema has no effect in `pnpm dev` until the package is rebuilt**, while the focused Vitest suite would show the new value. That is a silent-divergence trap for exactly the kind of prompt iteration this catalog exists to support.

**Recommendation:** treat dev-time resolution as a Phase 1A deliverable, not an afterthought. Either add source aliases to `apps/web/vite.config.ts` (and the worker's dev path) mirroring the Vitest aliases, or run the runtime package under `tsup --watch` as part of `pnpm dev`. Also add a test asserting that the package's `exports` keys and the Vitest alias table stay in sync — `./tools/milestone-state` is already exported without a matching alias.

## Target ownership model

| Concern                                                                                                              | Canonical owner                                 | Notes                                                       |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| JSON values, schema shapes, `ChatToolDefinition`, registry-entry wire types                                          | `@buildos/shared-types`                         | Types and validation contracts only; no catalog values      |
| Tool definitions, metadata, canonical op taxonomy, static surface profiles, registry builder/version                 | `@buildos/agentic-chat-runtime/catalog`         | Host-neutral BuildOS Agentic Chat semantics                 |
| Deterministic loop, turn contracts, repair, supervisor, shared reads                                                 | Existing runtime subpaths                       | Import catalog types/values as needed                       |
| Ontology/calendar/email operations over injected clients/ports                                                       | `@buildos/shared-agent-ops`                     | No chat prompt, tool-selection, or host lifecycle ownership |
| Authentication, user/session access, context, history, prompt/skill preload, per-turn selection, immutable admission | `apps/web`                                      | This is admission policy, not queued execution              |
| Legacy SSE external-account execution                                                                                | `apps/web` while capability routing requires it | Explicitly fenced and documented                            |
| Queue claim, provider transport, executable capability projection, mutation adapters, recovery, billing, events      | `apps/worker`                                   | Worker-only review controls stay here                       |

### Target dependency graph

```mermaid
flowchart TD
    ST["@buildos/shared-types\nwire and schema contracts"]
    SAO["@buildos/shared-agent-ops\ndomain operations + injected ports"]
    ACR["@buildos/agentic-chat-runtime\nloop / tools / supervisor / catalog"]
    WEB["apps/web\nauthenticated admission + legacy capability host"]
    WORKER["apps/worker\nqueue + provider + effects + delivery"]

    SAO --> ST
    ACR --> ST
    ACR --> SAO
    WEB --> ST
    WEB --> SAO
    WEB --> ACR
    WORKER --> ST
    WORKER --> SAO
    WORKER --> ACR
```

Forbidden dependency directions:

```text
packages -> apps/*
apps/worker -> apps/web
apps/web -> apps/worker
shared-agent-ops -> agentic-chat-runtime
shared-types -> runtime values or host code
```

## Three catalog concepts that must remain separate

### 1. Canonical catalog

The complete BuildOS Agentic Chat vocabulary: definitions, metadata, op identities, and surface-profile policy. It answers, “What tools does this product know about?”

### 2. Admitted surface

The exact ordered subset selected for one turn by authenticated web admission and frozen into the immutable artifact. It answers, “What tools was this turn promised?”

### 3. Executable worker surface

The admitted surface intersected with reviewed worker capabilities and, for mutations, narrowed to worker-supported argument projections. It answers, “What can this deployed worker safely advertise and execute?”

The worker must never infer capability solely because a definition exists in the canonical catalog. Catalog sharing must not weaken the current fail-closed worker policy.

## Proposed source-to-target move map

| Current source                                               | Target                                                                            | Action                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web/.../definitions/ontology-read.ts`                  | `packages/agentic-chat-runtime/src/catalog/definitions/ontology-read.ts`          | Move unchanged                                                                                                       |
| `apps/web/.../definitions/ontology-write.ts`                 | `.../catalog/definitions/ontology-write.ts`                                       | Move unchanged                                                                                                       |
| `apps/web/.../definitions/utility.ts`                        | `.../catalog/definitions/utility.ts`                                              | Move unchanged                                                                                                       |
| `apps/web/.../definitions/calendar.ts`                       | `.../catalog/definitions/calendar.ts`                                             | Move unchanged                                                                                                       |
| `apps/web/.../definitions/email.ts`                          | `.../catalog/definitions/email.ts`                                                | Move unchanged                                                                                                       |
| `apps/web/.../definitions/gateway.ts`                        | `.../catalog/definitions/discovery.ts` plus `controls.ts`                         | Split discovery tools from standard controls; preserve exact definitions during the move                             |
| `packages/agentic-chat-runtime/src/loop/definition-types.ts` | `.../catalog/types.ts`                                                            | Move catalog types; keep temporary loop re-export                                                                    |
| `packages/agentic-chat-runtime/src/loop/tool-metadata.ts`    | `.../catalog/metadata.ts`                                                         | Move; keep temporary loop re-export                                                                                  |
| `apps/web/.../registry/tool-registry.ts`                     | `.../catalog/registry.ts`                                                         | Move builder, taxonomy, cache, and version                                                                           |
| `apps/web/.../core/tools.config.ts`                          | Split between `catalog/indexes.ts`, `catalog/taxonomy.ts`, and web prompt helpers | Do not move zero-consumer exports blindly                                                                            |
| `apps/web/.../core/gateway-surface.ts`                       | `.../catalog/surfaces.ts`                                                         | Move static profiles and materialization; normalize `$lib` imports to package-local imports                          |
| `apps/web/.../v2/tool-selector.ts`                           | `apps/web/.../admission/tool-selector.ts` eventually                              | Keep web-owned per-turn heuristics and capability renegotiation                                                      |
| `apps/web/.../registry/tool-search.ts`                       | Remain web adapter                                                                | It binds canonical registry search to web skill/capability catalogs                                                  |
| `apps/worker/.../mutationToolCatalog.ts`                     | Remain worker                                                                     | It is reviewed executable capability policy, not the canonical provider schema                                       |
| `apps/worker/.../readOnlyTool.ts` reviewer controls          | Remain worker                                                                     | Promote only if another host adopts the review protocol                                                              |
| `packages/shared-agent-ops/.../RegistryOp` structural mirror | Shared contract in `@buildos/shared-types`                                        | Removes `any` duplication without reversing package dependencies                                                     |
| `ToolContextScope` (in `loop/definition-types.ts`)           | `@buildos/shared-types`                                                           | Required by the unified `RegistryOp`; must not land in `catalog/types.ts`                                            |
| `apps/web/.../core/tool-definitions.ts`                      | Delete after Phase 5                                                              | Already a pure re-export shim over `./definitions`                                                                   |
| `apps/web/.../core/entity-result-materialization.ts`         | Delete after Phase 5                                                              | Already a one-line shim over `@buildos/agentic-chat-runtime/loop`; `surfaces.ts` imports the runtime symbol directly |
| `apps/web/.../definitions/apps/` (empty nested tree)         | Delete in Phase 0                                                                 | Stray `apps/web/src/lib/tests/onto/writer` path accidentally created under `definitions/`                            |

### Proposed catalog entry point

```text
packages/agentic-chat-runtime/src/catalog/
├── index.ts
├── types.ts
├── metadata.ts
├── indexes.ts
├── taxonomy.ts
├── registry.ts
├── surfaces.ts
└── definitions/
    ├── index.ts
    ├── controls.ts
    ├── discovery.ts
    ├── ontology-read.ts
    ├── ontology-write.ts
    ├── utility.ts
    ├── calendar.ts
    └── email.ts
```

Public import:

```ts
import {
	AGENTIC_CHAT_TOOL_DEFINITIONS,
	AGENTIC_CHAT_TOOL_METADATA,
	getAgenticChatToolRegistry,
	getAgenticChatSurfaceForProfile
} from '@buildos/agentic-chat-runtime/catalog';
```

Use an explicit package subpath rather than exporting the whole catalog from the runtime root. Node's `exports` contract makes the public entry point explicit and prevents consumers from reaching internal source paths.

## Phased implementation plan

Each phase is independently reviewable. A move phase must not also rewrite tool descriptions, change parameter schemas, alter ordering, add capabilities, or change routing.

### Phase 0 — baseline, working-tree stabilization, and migration guardrails

**Objective:** Establish exact before-state evidence so structural moves cannot hide behavior changes.

Work:

1. Reconcile or finish the current in-flight edits in definitions, worker tool projection, and provider assembly before moving files.
2. Repair `report:agentic-tools` so it can load skill Markdown under the current TSX/runtime configuration, or replace it with a script that imports only the catalog and receives skills through an injected adapter.
3. Record for every static profile:
    - ordered tool names;
    - serialized definitions;
    - total characters and estimated tokens;
    - current registry version;
    - definition SHA-256 where already available.
4. Delete the stray empty `definitions/apps/...` tree.
5. Add a pre-move catalog-fitness test. **Split it by what is reachable today.** `apps/worker` has no dependency on `apps/web` and web has none on the worker, so any assertion that compares web-owned definitions against worker-owned policy is unwritable until the catalog is in the shared package. Attempting it in Phase 0 would either fail or invite an illegal import.

    Runnable now, in `apps/web`:
    - direct definition names are unique;
    - metadata names and direct definitions match exactly;
    - control and discovery definitions are unique across the total vocabulary;
    - registry op names do not collide;
    - surface profiles reference real definitions;
    - all definitions are JSON-serializable and use a top-level object parameter schema.

    Deferred to Phase 2/3, once the catalog is importable from `@buildos/agentic-chat-runtime/catalog` and the worker can assert against it:
    - worker executable/unavailable policy names reference known definitions or explicit controls;
    - shared-read names reference known definitions;
    - worker reviewed mutation argument names (`mutationToolCatalog.ts`) exist in the canonical parameter schema.

    Note that this deferred group is one of the plan's strongest concrete justifications: today the worker's reviewed argument allowlist mirrors a web-owned schema it cannot see, and the mirror is maintained by comment (`workerAccessAdapter.ts`, `fixtureTurnExecutor.ts` both cite `apps/web/...` paths in prose). Landing the catalog in the package converts that comment into a test.

6. Capture the focused and full test baselines.

Exit gate:

- The report command works.
- The runnable-now catalog-fitness assertions pass before any file move.
- Current profile names, order, sizes, and hashes are committed as reviewable fixtures.
- No provider calls, database mutations, routing changes, or deploy changes occur.

Rollback: none required; this phase adds diagnostics only.

### Phase 1A — the `/catalog` package entry point and dev-time resolution

**Objective:** Create the destination and prove it resolves everywhere, without changing any type or consumer.

Work:

1. Add `src/catalog/index.ts`, the package build input, and explicit `./catalog` conditional exports for CJS, ESM, and types.
2. Add web and worker Vitest aliases for `@buildos/agentic-chat-runtime/catalog`.
3. Add the dev-time resolution fix from Finding K: source aliases in `apps/web/vite.config.ts` (and the worker dev path) or `tsup --watch` wired into `pnpm dev`.
4. Add a test asserting the package `exports` keys and the Vitest alias tables stay in sync.
5. Add catalog portability tests and CJS/ESM import smoke tests.
6. Do not expose catalog internals through wildcard source imports.

Exit gate:

- Runtime build emits both module formats and declarations for `/catalog`.
- CJS and ESM consumers import `/catalog` successfully.
- Editing a file under `src/catalog/` is observable in `pnpm dev` without a manual package rebuild.
- `exports`/alias parity test passes.
- No workspace dependency cycle is introduced.

Rollback: remove the unused entry point. No consumer has moved and no type has changed.

### Phase 1B — shared contract types

**Objective:** Give the registry entry and JSON-schema values one downward-facing contract.

This is **not** a zero-consumer change and must not be described as one. `ChatToolDefinition.function.parameters.properties` is currently `Record<string, any>`; 37 files reference `function.parameters` (24 outside tests), and most read sites index into it (`properties.type_key.default`, `parameters.required`, and similar). Tightening the type forces narrowing at every one of those sites. Size the change before starting it, and land it as its own reviewable commit.

Work:

1. Add JSON-compatible recursive schema types to `@buildos/shared-types`.
2. Move `ToolContextScope` to `@buildos/shared-types` (required by the unified registry entry — see Finding D).
3. Move the serializable `RegistryOp` shape into shared types so `shared-agent-ops` and the runtime catalog share one contract without a dependency cycle, and drop the `contexts?: unknown[]` weakening from the mirror.
4. Replace `Record<string, any>` in `ChatToolDefinition` and the registry-entry contract, adapting read sites with explicit narrowing helpers rather than `as any` casts.

Exit gate:

- `@buildos/shared-types` typecheck/tests pass.
- `@buildos/shared-agent-ops` build/typecheck/tests pass using the shared registry-entry type.
- Web and worker typechecks pass with no new `any` or `@ts-expect-error` at the adapted sites.
- No serialized definition changes: the Phase 0 fixtures still match byte-for-byte.

Rollback: revert as one commit. Because consumer code is adapted here, partial rollback is not available — this is the reason it is separated from 1A.

### Phase 2 — canonical definitions, metadata, and standard controls

**Objective:** Establish one source of truth for behavior-bearing tool definitions.

**Prerequisite:** the control-schema convergence from Finding B must already have shipped and been evaluated. Phase 2 cannot both unify two divergent definitions and satisfy a zero-delta exit gate — those requirements contradict each other. Converge first, as a behavior change with its own eval; then this phase is a pure move.

Work:

1. Move the five direct definition families unchanged using `git mv` where possible.
2. Split `gateway.ts` into canonical standard controls and discovery definitions.
3. Move tool metadata and definition types from the loop folder into the catalog (`ToolContextScope` excepted — it went to shared types in Phase 1B).
4. Move the four `*_TOOL_NAME` constants and `AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1` into `catalog/definitions/controls.ts` together with the definitions, and have `loop/turn-contract.ts` re-export them. Splitting names from definitions across the two folders would create a `loop` ↔ `catalog` import cycle.
5. Make loop control executors import canonical control names/definitions from the catalog.
6. Replace web definitions with temporary re-export shims.
7. Change the control compatibility test from "parameters without descriptions" to full canonical equality — including descriptions — so the Finding B drift cannot recur.
8. Preserve existing array membership:
    - direct definitions remain the existing `CHAT_TOOL_DEFINITIONS` compatibility set;
    - discovery definitions remain separate;
    - standard controls remain separate;
    - a new explicit total-vocabulary export may combine them for integrity tests only.

Exit gate:

- Every pre-move definition deep-equals its post-move definition.
- Every profile has identical ordered names and serialized JSON.
- Tool-surface size reports have an exact zero delta.
- The control compatibility test compares full definitions, descriptions included, and passes.
- Runtime, focused web schema, worker policy, and provider-surface tests pass.
- Package source has zero `$lib`, `$app`, `$env`, application, or deployment imports.

Rollback: web shims can temporarily point back to the old definitions if a packaging issue is discovered. No artifact format changes yet.

### Phase 3 — registry, indexes, taxonomy, and static surface profiles

**Objective:** Move the remaining pure catalog policy while keeping per-turn admission in web.

**Implementation status (2026-08-25): complete in the current working tree.** The existing registry version remains byte-stable; discovery visibility has a separate policy version. Static surface/profile snapshots and size budgets remain unchanged, and web's unavailable-worker-tool admission rejection still passes.

Work:

1. Move the registry builder, op mappings, taxonomy, and singleton cache into the catalog.
2. Split `tools.config.ts` by responsibility; delete confirmed zero-consumer exports rather than migrate them.
3. Move static gateway profile definitions and materialization helpers to `catalog/surfaces.ts`.
4. Keep `tool-selector.ts`, living-workspace enrichment, lexical/situational capability detection, and transport renegotiation in web admission.
5. Keep `tool-search.ts` and `tool-schema.ts` as web discovery adapters initially; repoint them to the catalog registry.
6. Decide and document registry version semantics:
    - include `chatDiscovery`, or
    - publish a separate discovery-policy version.
7. Retain active-surface injection for loop classification. Do not replace the global provider in this phase.

Exit gate:

- The op map and registry payload deep-equal the baseline.
- Every static surface has identical ordered tool definitions.
- Skill related-op resolution remains complete.
- Prompt and tool-surface size budgets remain at or below baseline.
- Web admission still rejects worker-unavailable tools before admission.

Rollback: temporary web registry/surface shims point to `/catalog`; restoring imports does not require restoring duplicate values.

### Phase 4 — versioned shared tool-surface contract and reader-first rollout

**Implementation status (2026-08-25): complete in the current working tree, not deployed.** Shared types now provides the V1 builder and one decoder for both V1 and retained unversioned artifacts. The decoder caps surfaces at 256 tools and 512 KiB, validates exact ordered name/definition agreement and JSON-compatible object schemas, and rejects malformed input. All three worker read sites use it; invalid provider surfaces become tool-free and invalid mutation surfaces retain the existing `mutation_tool_not_admitted` fence. Web admission now writes V1 with registry and discovery-policy observability versions. No database migration or additional round trip was introduced.

The release order remains reader-first: deploy and verify the backward-compatible worker before deploying the V1 web writer. Legacy decoding must remain until the seven-day artifact-retention window has elapsed and no queued or running legacy artifact remains.

**Objective:** Make the queue boundary typed and fail closed without invalidating retained artifacts.

Work:

1. Add `AgenticChatToolSurfaceV1` to shared types with:
    - `version: 1` for new writes;
    - `surfaceProfile`;
    - ordered `toolNames`;
    - typed `definitions`;
    - optional registry/catalog observability version.
2. Add one shared decoder/validator that enforces:
    - unique, canonical names;
    - exact name/definition agreement;
    - bounded tool count and serialized bytes;
    - non-empty descriptions;
    - top-level object parameter schemas;
    - JSON-compatible values;
    - no malformed or duplicate definitions.
3. Make the worker use the shared decoder at **all three** current parse sites — `readOnlyProvider.ts` `productionToolsFor()`, `readOnlyProvider.ts` `buildWorkerToolSurfaceOverride()`, and `mutationAdapterBoundary.ts`.
4. Treat `mutationAdapterBoundary.ts` as a security fence, not a decode convenience. Its `mutation_tool_not_admitted` rejection must remain byte-equivalent in behavior: a surface that fails shared decoding must reject the mutation, and legacy normalization must never turn an inadmissible surface into an admissible one. Add explicit negative tests for a malformed legacy surface reaching the mutation fence.
5. Preserve the worker-reviewed mutation projection after shared decoding.
6. Support retained unversioned surfaces by normalizing them to V1 during the seven-day artifact-retention window (`AGENTIC_CHAT_INPUT_RETENTION_MS`).
7. After the reader is deployed, make web admission write `version: 1` and the typed surface.
8. Do not add a database migration solely for this nested JSON change unless database constraints are later desired.
9. Keep the artifact content SHA-256 authoritative. Do not treat the compact registry version as an integrity proof.

Deployment order:

1. Deploy a worker that reads both legacy and V1 surfaces.
2. Verify worker health and one admitted legacy-shape fixture.
3. Deploy web admission that writes V1.
4. Verify new worker turns, explicit legacy external-account routing, and rollback.
5. Remove legacy decoding only after retention has elapsed and no queued/running legacy artifact remains.

Exit gate:

- Shared contract tests cover valid, legacy-normalized, malformed, oversized, duplicate, mismatch, and unsupported-schema cases.
- Old worker fixtures remain executable by the new reader.
- New V1 fixtures round-trip through admission, database representation, worker decoding, and prompt-snapshot hashing.
- No additional network or database round trip is introduced.

Rollback: stop the web writer from emitting the version field. The backward-compatible worker remains safe.

### Phase 5 — consumer cutover and shim deletion

**Implementation status (2026-08-25): complete in the current working tree, not deployed.** All live web production and test consumers now import the runtime's public `catalog` or `loop` entry points. Eighteen zero-consumer compatibility/forwarding files were removed: the former definition tree, registry/config/surface facades, `tool-definitions.ts`, and four small loop-semantic shims. A repository test scans web import specifiers and rejects attempts to restore those legacy paths. Ownership READMEs now live at the web admission, legacy web host, runtime catalog, and worker composition roots.

The cutover also corrected a stale unit-test mock that still targeted `tools.config.ts` after production had moved to the package. Catalog fitness, schema compatibility, prompt-size budgets, surface selection, legacy execution dispatch, runtime import smoke tests, and the affected regression suites remain green.

**Objective:** Make repository navigation reflect actual ownership.

Work:

1. Update imports to the package entry point across the observed consumer groups:
    - approximately 37 definition-path consumers;
    - 15 `tools.config` consumers;
    - 24 surface consumers;
    - 18 registry consumers.
2. Update web and worker tests to import canonical package paths.
3. Delete catalog shims once `rg` confirms zero consumers.
4. Delete the small runtime forwarding shims under web once their direct imports are updated.
5. Add an import-boundary test that fails if new web code imports the deleted catalog paths.
6. Add short READMEs at the web admission, legacy execution, runtime catalog, and worker composition roots describing their ownership.

Exit gate:

- No production import references the old definition, registry, configuration, or surface paths.
- No compatibility shim lacks an explicit retained consumer.
- Web, worker, and runtime tests import public package subpaths, not package source files.
- Full typechecks and builds pass.

Rollback: restore only the re-export shims, not duplicate implementations.

### Phase 6 — worker production naming and provider decomposition

**Objective:** Remove obsolete migration terminology and separate the production worker coordinator into reviewable units.

Do this as two independently reviewable changes.

#### Phase 6A — rename only

**Implementation status (2026-08-25): complete in the current working tree, not deployed.** The nine production modules and their exported symbols now use role-based names, and the three provider/tool modules live under explicit `provider/` and `tools/` namespaces. Eight owning test files moved with them, while the Phase 5 executable evidence ledger now points at the renamed tests. No cross-package consumers required compatibility aliases. Because `consumer.ts` already owns the live consumer API, the older inert `consumer-factory.ts` exposes distinct `AgenticChatConsumerFactory*` names instead of colliding with `AgenticChatConsumer`.

This change is structural only: provider request construction, prompt text, tool order, hashes, usage accounting, runtime error strings, and terminal envelopes are intentionally unchanged. Provider responsibility extraction remains a separate Phase 6B change.

Suggested renames:

| Current                       | Target                                           |
| ----------------------------- | ------------------------------------------------ |
| `phase3Bootstrap.ts`          | `bootstrap.ts`                                   |
| `phase3Config.ts`             | `config.ts`                                      |
| `phase3Assembly.ts`           | `composition-root.ts`                            |
| `fixtureTurnExecutor.ts`      | `turn-executor.ts`                               |
| `fixtureMutationExecutor.ts`  | `mutation-executor.ts`                           |
| `openRouterReadOnlyClient.ts` | `provider/openrouter-client.ts`                  |
| `readOnlyTool.ts`             | `tools/execution-adapter.ts`                     |
| `readOnlyProvider.ts`         | `provider/turn-provider.ts` before decomposition |
| `fixtureConsumer.ts`          | `consumer-factory.ts`                            |

Rename exported symbols and tests consistently. Preserve compatibility aliases only if another package imports them; tests inside the worker should move immediately.

#### Phase 6B — split provider responsibilities

**Implementation status (2026-08-25): in progress in the current working tree, not deployed.** The first decomposition slice folds the former root `providerContract.ts` into `provider/contracts.ts` and extracts streamed tool-call assembly, feedback/memoization, tool-surface projection, provider protocol helpers, provider-step construction, deterministic validation/contract authorization, and immutable reviewer controls. A boundary test prevents those responsibilities from returning to the turn coordinator or importing it back. `turn-provider.ts` is reduced from 5,334 to 3,876 lines while the existing provider/executor expectations remain unchanged.

The next slice should extract request builders, supervisor coordination, and the remaining review lanes. Keep that work independently reviewable; do not mark Phase 6B complete until the coordinator is primarily round orchestration and the full exit gate below passes.

Suggested seams based on the current file:

A worker-owned `providerContract.ts` already exists at the agentic-chat root. Either fold it into the new `provider/` folder or pick a distinct name for the extracted contracts module; do not create a second `contracts` file with overlapping meaning.

```text
provider/
├── contracts.ts                 # provider messages, tools, events, client port (merge/replace existing providerContract.ts)
├── turn-provider.ts             # main adapter and round coordinator
├── stream-tool-calls.ts         # streamed call assembly and finish validation
├── feedback.ts                  # read/write feedback normalization and memoization
├── request-builders.ts          # synthesis, continuation, repair, base requests
├── tool-surface.ts              # shared decode + worker capability projection
├── steps.ts                     # provider/read/planning step construction
├── validation.ts                # contract authorization and call validation
├── supervisor-runtime.ts        # worker supervisor coordination
└── review/
    ├── controls.ts              # worker-only reviewer tool definitions
    ├── disposition.ts
    ├── turn-contract.ts
    └── mutation-batch.ts
```

Rules:

- Keep OpenRouter HTTP and usage observation worker-owned.
- Keep worker-only review tools worker-owned.
- Keep effect identities, capability projection, and mutation adapters worker-owned.
- Move an algorithm into the shared runtime only if it is host-neutral, has injected ports, and is required by another host or by deterministic parity—not merely because the worker file is large.
- Do not combine structural decomposition with model-guidance or retry-policy changes.

Exit gate:

- The production composition root contains no `Fixture`, `Phase3`, or misleading `ReadOnly` names.
- Existing worker tests pass with no expectation changes.
- Provider request JSON, prompt snapshots, tool ordering, hashes, usage, and terminal envelopes are unchanged.
- The largest provider module has one primary responsibility and materially fewer imports.

Rollback: renames are separately revertible; decomposition uses pure moves/extractions with behavior-pinning tests.

### Phase 7 — web legacy boundary, operational cleanup, and conditional DI work

**Objective:** Finish cleanup only when capability and rollback prerequisites are satisfied.

Work:

1. Keep Gmail, Calendar, OAuth handoff, and worker-disabled image execution in the explicit legacy capability host until their reviewed worker ports are complete or the product intentionally retires them.
2. Group the remaining legacy SSE runtime under an explicit `legacy-execution` namespace after import churn from earlier phases settles.
3. When rollback support is retired:
    - remove the Agentic Chat bootstrap from the general worker process;
    - enforce that only `chat-worker.ts` can start the chat consumer in production;
    - remove obsolete environment gates and phase comments;
    - update deployment and rollback documentation.
4. Revisit `globalThis` catalog-provider injection only if one of these triggers exists:
    - a test proves import-order leakage;
    - two catalog instances must coexist in one process;
    - a host needs request-scoped catalog behavior;
    - composition cannot be made explicit at one root.
5. If triggered, replace the service locator with a runtime factory or explicit `ToolCatalogPort`. Otherwise leave the known, tested mechanism in place.

Exit gate:

- No active capability relies accidentally on deleted legacy code.
- Rollback documentation matches deployed process ownership.
- Worker README and package description describe the dedicated Agentic Chat service.
- Any DI redesign has a demonstrated failing case and an explicit parity test.

## Validation matrix

### Package gates

```bash
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/shared-types test:run

pnpm --filter @buildos/shared-agent-ops build
pnpm --filter @buildos/shared-agent-ops typecheck
pnpm --filter @buildos/shared-agent-ops test:run

pnpm --filter @buildos/agentic-chat-runtime build
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/agentic-chat-runtime test:run
```

Add CJS and ESM smoke tests for `@buildos/agentic-chat-runtime/catalog` after the package build.

### Web focused gates

- full-definition schema compatibility;
- gateway surface profiles and materialization;
- tool selector;
- worker turn preparation and unavailable-capability renegotiation;
- prepared-prompt cache and tool-definition hashes;
- tool-surface size budgets;
- tool search/schema and skill related-op integrity;
- legacy external-account routing.

Then run:

```bash
pnpm --filter @buildos/web check
pnpm --filter @buildos/web build
```

### Worker focused gates

- runtime boundary and isolated queue registration;
- execution-input artifact validation;
- worker tool policy and mutation-surface audit;
- provider tool-surface projection;
- standard controls;
- prompt snapshot exact replay/hash;
- mutation adapter coverage;
- bootstrap/composition health;
- legacy/V1 artifact compatibility.

Then run:

```bash
pnpm --filter @buildos/worker check
pnpm --filter @buildos/worker test:run
```

### Repository gates

```bash
pnpm --filter @buildos/web report:agentic-tools
git diff --check
```

Add import-boundary scans for:

- package-to-app imports;
- worker-to-web imports;
- runtime host/deployment imports;
- old catalog path imports after shim deletion;
- workspace dependency cycles in the affected package graph.

### Current audit evidence

Against the current working tree, the focused baseline passed:

- runtime: 36 files, 268 tests;
- web admission/schema/surface: 3 files, 28 tests;
- worker runtime boundary/policy/provider/bootstrap: 4 files, 98 tests.

Total: 43 test files and 394 assertions passed.

The operator-facing `report:agentic-tools` command failed while importing a Markdown skill resource and must be repaired in Phase 0.

## Risks and mitigations

| Risk                                                                           | Mitigation                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Tool descriptions or ordering change during moves                              | Freeze serialized definitions and ordered profile fixtures; require zero delta in Phases 2–3                         |
| New web writer deploys before old worker can read the surface                  | Reader-first rollout with legacy normalization and retention window                                                  |
| Shared catalog accidentally grants worker capability                           | Preserve admitted-surface intersection and reviewed worker capability projection; test unavailable names fail closed |
| Runtime package starts pulling web/host code                                   | Existing recursive portability test plus catalog-specific import scan                                                |
| Package cycle through `shared-agent-ops`                                       | Put structural registry wire types in `shared-types`; operations package never imports runtime                       |
| Shims remain permanently                                                       | Give every shim a named deletion phase and zero-consumer gate                                                        |
| Large worker rename hides behavior changes                                     | Separate rename-only and extraction-only changes; pin provider JSON/hashes                                           |
| Legacy external-account behavior is deleted too early                          | Treat it as an explicit capability host until the full-cutover plan closes each capability                           |
| Compact registry version is treated as a security hash                         | Keep artifact SHA-256 authoritative; document registry version as cache/observability metadata                       |
| Current uncommitted schema work conflicts with moves                           | Phase 0 stabilizes and snapshots current definitions before `git mv` operations                                      |
| Catalog stops hot-reloading in `pnpm dev`, so prompt edits silently do nothing | Phase 1A ships dev-time source aliases or `tsup --watch` plus an `exports`/alias parity test                         |
| Tightening `ChatToolDefinition` cascades into ~37 files mid-migration          | Phase 1B is a standalone commit gated on unchanged serialized definitions                                            |
| Shared decoder softens the `mutation_tool_not_admitted` fence                  | Phase 4 routes all three parse sites through one decoder and adds negative tests at the mutation boundary            |
| Control convergence changes model behavior inside a "move" phase               | Convergence ships before Phase 2, with its own eval; Phase 2 keeps a strict zero-delta gate                          |

## Non-goals

- Moving authenticated request/session preparation into the worker.
- Sending full tool definitions in the queue job payload.
- Moving provider transport, retries, billing, realtime delivery, or queue lifecycle into the shared runtime.
- Moving worker-only semantic reviewer controls into the shared runtime without a second host.
- Making `@buildos/shared-agent-ops` depend on the Agentic Chat runtime.
- Putting tool-definition arrays or runtime singleton values in `@buildos/shared-types`.
- Deleting the explicit legacy Gmail/Calendar/OAuth/image path before capability parity or a product retirement decision.
- Creating `@buildos/agentic-chat-catalog` before an actual consumer needs the catalog without the existing runtime dependency.
- Introducing a database or network round trip as part of a code-ownership cleanup.
- Combining structural moves with model prompt, tool schema, capability, or routing changes.

## Sequencing note: three items do not need the migration

Three findings carry production value on their own and are cheap relative to the structural work. Landing them first de-risks the migration and pays off even if the migration is deferred:

1. **Finding B — control-schema convergence.** Two `declare_turn_contract` description sets are live, and the leaner one is mounted on the legacy project-create fallback path. Converge and re-run the project-create battery.
2. **Finding C — shared tool-surface decoder.** Three hand-rolled parses of an untyped blob, one of them a security fence. This is Phase 4, and it does not depend on where the definitions live.
3. **Findings H and J — worker naming and docs.** `Fixture`/`Phase3`/`ReadOnly` names on production classes, a worker `package.json` still described as "Background worker for generating daily briefs", and a README with no mention of the dedicated chat process or `agentic_chat_turn`. Pure rename plus doc repair, independently revertible.

The remaining phases — catalog relocation and consumer cutover — are navigation and ownership improvements. They are worth doing, but they are the part of this plan that costs the most import churn and returns the least production behavior.

## Review decisions requested

0. **Sequencing:** Approve landing Finding B convergence, the shared surface decoder, and the worker rename/doc repair ahead of the catalog relocation — or explicitly choose to run the phases in written order.
1. **Catalog home:** Approve `@buildos/agentic-chat-runtime/catalog` instead of a new package.
2. **Static surfaces:** Approve moving static profiles/materialization to the catalog while keeping per-turn selection and transport renegotiation in web admission.
3. **Unused exports:** Approve deleting confirmed zero-consumer `tools.config.ts` APIs rather than preserving them through another shim layer.
4. **Surface contract:** Approve reader-first `AgenticChatToolSurfaceV1` rollout with legacy normalization and no database migration.
5. **Registry version:** Choose whether `chatDiscovery` joins the current registry version or receives a separate policy version.
6. **Canonical control definition:** Confirm web's richer `definitions/gateway.ts` control copy becomes canonical (it is the copy every admitted surface already ships), rather than the runtime's leaner copy.
7. **Worker cleanup:** Approve production renaming as a separate change before provider decomposition.
8. **Global catalog provider:** Confirm it remains deferred unless a concrete isolation failure is demonstrated.

## External technical references

These references support the implementation mechanics, not the product-specific ownership decisions:

- [Node.js package entry points and subpath exports](https://nodejs.org/api/packages.html#package-entry-points): explicit `exports` define a package's public interface and encapsulate other subpaths.
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html): separate projects can enforce logical grouping and build order. This plan does not require introducing project references in the first phases; the existing workspace package remains the build unit.
- [pnpm workspace protocol](https://pnpm.io/workspaces#workspace-protocol-workspace): `workspace:*` guarantees resolution to a local workspace package, matching the current web/worker dependencies on the runtime package.
- [JSON Schema Draft 2020-12 core](https://json-schema.org/draft/2020-12/json-schema-core) and [validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation): tool parameters should be represented through JSON-compatible schema values rather than `any`.
- [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling): function descriptions and parameter schemas are model-facing behavior, which is why canonical equality must include descriptions.

## Recommended first implementation change

The first implementation PR should stop after Phase 0 and Phase 1A:

1. repair the catalog report (run it through Vite rather than raw tsx);
2. delete the stray `definitions/apps/` tree;
3. add baseline catalog-fitness fixtures — the runnable-now subset only;
4. add the empty, buildable `/catalog` entry point with import smoke tests, dev-time source resolution, and the `exports`/alias parity test.

That PR proves the destination and guardrails without moving a single behavior-bearing definition and without touching a shared type.

Phase 1B (strict schema and registry-entry types) is a separate PR because it edits roughly 37 consumer files. Phase 2 is a third PR, and it must not start until the Finding B control convergence has shipped and been evaluated — otherwise its zero-delta gate is unsatisfiable.
