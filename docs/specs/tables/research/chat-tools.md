<!-- docs/specs/tables/research/chat-tools.md -->

# Research: how chat tools work end to end, and a table tool suite that fits

Date: 2026-10-04. Read-only research; no repo edits, no tests run. Byte measurements came from
`packages/agentic-chat-runtime/dist/catalog/index.mjs` (built 2026-10-04 16:28, newer than the src
files) using `scratchpad/measure.mjs` and `scratchpad/draft-table-tools.mjs`.

---

## 1. Anatomy of a tool (traced: `create_onto_document`, `update_onto_document` incl. surgical edits)

### 1a. Definition (model-facing schema): runtime catalog, host-neutral

- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`
    - `create_onto_document` L277–330 (project_id, title, description, type_key, state_key, content, props, parent_id, position)
    - `update_onto_document` L1338–1440. Description carries the surgical-edit rule plus a worked example:
      `'Edit example: update_onto_document({ document_id, edits: [{ old_text: "- Launch: May 3", new_text: "- Launch: May 10" }] })'`
      Args: `edits[{old_text,new_text,replace_all}]` ("all or none apply"), `section_edits[{action: replace|delete|append|prepend|move, section, content, after_section, before_section}]`, `allow_large_deletion`, `update_strategy`, `archive_mode`, `additionalProperties: false`.
- Reads: `catalog/definitions/ontology-read.ts`: `get_onto_document_details` L793, `get_document_outline` L950 (with `find`), `read_document_section` L972.
- Aggregated in `catalog/definitions/index.ts` (`CHAT_TOOL_DEFINITIONS` order is cache-relevant).
- Schema vocabulary type: `packages/shared-types/src/agentic-chat-tool.types.ts` L34+. Precedent: avoid `oneOf` (`ontology-write.test.ts` L54 asserts relationships items have no `oneOf`); use `type: [..]` unions instead.

### 1b. Metadata (summary, capabilities, contexts, category, timeout)

- `catalog/metadata.ts`. `update_onto_document` L615 (`category: 'write'`, `timeoutMs: 45000`). `category` is what makes a tool "signed write" for the worker audits.
- **Jev reads `summary` + `capabilities` (not the schema) to pick tools** (`jev-tool-selector.ts` L173–185). So the metadata wording is what selection depends on.

### 1c. Registry/op (frozen external contract)

- `catalog/registry.ts` `TOOL_OPERATIONS` L39+: `update_onto_document: { op: 'onto.document.update', kind: 'write' }`. "Adding a tool means adding a row. There is no fallback". `registry.test.ts` asserts the table row for row. Op names are the MCP/agent-call contract.

### 1d. Taxonomy

- `catalog/taxonomy.ts` `TOOL_CATEGORIES` (ontology / ontology_action / ...). Context scopes come from metadata `contexts`.

### 1e. Surface membership

- `catalog/surfaces.ts`: three static profiles `global | project | project_create` (L48). `GLOBAL_DIRECT_TOOL_NAMES` L91, `PROJECT_DIRECT_TOOL_NAMES` L171 (document writes are project-only; doc reads are on both). Routing by context type only (`resolveGatewaySurfaceProfileForContextType`), never by message text.
- Per-user conditional group precedent: email. `GATEWAY_EMAIL_CONNECTED_SURFACE_TOOL_NAMES` L229, `getGatewayEmailSurfaceToolNames(hasConnection)` L258. Mounted by web admission in `apps/web/src/lib/services/agentic-chat-v2/email-surface-mount.server.ts` (`hasActiveEmailConnection`, 30 s memo; it has to be applied in BOTH `worker-turn-preparation.server.ts` L499–500 and `routes/api/agent/v2/prewarm/+server.ts` so the harness sha matches).

### 1f. Worker policy (who can execute)

- `packages/agentic-chat-runtime/src/worker-tool-policy.ts`: `AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1` (literal list; worker drift test compares it to the worker catalog), `..._UNAVAILABLE_...`, `..._OMITTED_...` (skill_search/skill_load/domain_search are omitted on the worker). `auditAgenticChatWorkerToolPolicyV1()` throws at import if any TOOL_METADATA name has no policy decision.

### 1g. Admission (web) → frozen artifact

- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`: resolves surface → `applyEmailSurfaceMount` → `resolveWorkerPromptTools` (`worker-prompt-surface.ts`) → `buildAgenticChatToolSurfaceV1` (`packages/shared-types/src/agentic-chat-tool-surface.ts`, max 256 tools / 512 KiB). **The worker surface is immutable for the turn**, so a tool cannot be discovered lazily mid-turn on the worker.

### 1h. Execution: WHERE it runs

- **All chat writes run in the worker** (`apps/worker`, Railway). Web no longer executes ontology writes for chat (only `calendar-executor` remains under `apps/web/src/lib/services/agentic-chat/tools/core/executors`, for MCP/agent-call).
- Worker mutation catalog = data table: `apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts`
    - `create_onto_document` spec L205: `executor: 'table'`, `runner: 'gateway'`, `scope: argument_project`, normalizers, entity receipt `rootKey: 'document'`, `directWriteClass: 'ordinary'`, `directWriteSelectionPolicy: 'new_entity'`.
    - `update_onto_document` spec L247: `scope: context_project`, `requiredUuidArguments: ['document_id']`, `passthroughReceiptFields: ['document_change', ...]`, `descriptionOverride` (worker-specific text), `reviewedArgumentNames` (the worker narrows the schema to these), `propertyOverrides`.
    - `AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1` L1288 plus `auditAgenticChatMutationSurfaceV1()`: every signed write must be either reviewed or deliberately deferred, or the worker refuses to start.
- One adapter for all rows: `mutations/table-adapter.ts` ("table-driven"; **naming collision** with a "table" feature). `agenticChatReliabilityContractAudit.test.ts` pins adapter files to 3: "Adding a reviewed write must not add a file here."
- The adapter calls `runGatewayWriteOp` → `packages/shared-agent-ops/src/gateway/op-execution-gateway.worker.ts` L153 → `EXTERNAL_OP_HANDLERS` in `op-execution-gateway.core.ts` L234+ (`'onto.document.update': updateDocument` L257; handler L947). **The same gateway serves MCP**, so a gateway handler is a single implementation for chat writes and MCP writes.
- Reads in the worker: `apps/worker/.../tools/execution-adapter.ts` L459/L582 → `executeAgenticChatSharedReadToolV1` → `packages/agentic-chat-runtime/src/tools/shared-read-dispatch.ts` (`AGENTIC_CHAT_SHARED_READ_TOOL_REGISTRY_V1`). Document reads: `tools/ontology-reads.ts` (`getOntoDocumentDetails` L1412, `getDocumentOutline` L1438, `readDocumentSection` L1481). Note: chat reads and gateway/MCP reads are **separate implementations** (gateway `getDocument` L1918). For tables, put the query core in shared-agent-ops and call it from both.
- Concurrency: `tools/execution-policy.ts` `ROW_LOCAL_MUTATIONS` L25 (`['update_onto_document', ['document_id']]`).
- Direct vs reviewed: `provider/write-routing.ts` `MAX_DIRECT_SIMPLE_MUTATIONS_PER_TURN = 3` (L8). A batch of at most 3 'ordinary' calls on resolved targets runs directly. Anything else is held as a SHA-bound mutation batch (`packages/agentic-chat-runtime/src/loop/mutation-batch.ts`) for the independent model reviewer (`provider/review/*`). One call carrying 200 rows still counts as one op.
- Output cap: `provider/output-budget.ts` `ACTING_OUTPUT_TOKENS = 12_000`, `MUTATIONS_PER_STAGE = 8`. This bounds how many rows the model can write in one pass.
- Receipt cap: `mutations/adapter-boundary.ts` `MAX_RECEIPT_BYTES = 480 KiB`. Gateway doc body cap `MAX_DOCUMENT_CONTENT_BYTES = 200 KiB` (`op-execution-gateway.core.ts` L230).

### 1i. Preview-before-review (surgical edits)

- `apps/worker/.../provider/document-edit-preview.ts`: a body-changing call is dry-run through `previewGatewayDocumentUpdate` (gateway `previewDocumentUpdate`, core.ts L839). If the edit can't apply, the message goes back to the acting model as validation repair, and no review round is spent. If it can, the reviewer sees a server-verified diff (≤60 changed lines, ≤300 chars each). Previews chain inside a batch via `baseContent`.
- Optimistic concurrency: `context.documentWriteGuard` with `updated_at` (core.ts L990–1003) → CONFLICT "Request a fresh preview".
- Large-deletion refusal: `largeDeletionRefusal` (>30% of a long doc unless `allow_large_deletion`).

### 1j. Result shape → model

- `packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts`: `MAX_MODEL_TOOL_PAYLOAD_CHARS = 6000` (target 5,600 after the security notice); web/email results get 12,000. Per-tool compactors: `get_onto_document_details` → 3,500-char `content_preview` + `content_truncated` (L1090–1130); doc mutation receipts → `compactDocumentMutationReceipt` (L2445); `document_change` hunks capped at 24 lines. The generic `applyToolPayloadSizeGuard` (L2650+) **shrinks long strings first (floor 240 chars), then trims arrays**. For table cells that would silently corrupt values, so table reads must fit themselves row by row.
- Read memo (`loop/read-memo.ts`): an identical repeat read is served from cache with a "Repeat read" notice. Paging with a different offset is a different key, so it's fine.
- Saturation ledger (`loop/context-gathering-ledger.ts` L452–480): novelty is measured by entity ids. Paged row reads must return row ids, or later pages look like "low novelty" and push toward forced synthesis.

### 1k. Write ledger / contract / finalization (structured, mostly name-prefix driven)

- `loop/tool-classification.ts`: write = prefixes `create_ update_ delete_ move_ link_ unlink_ ... tag_` (L38). Write-ledger effects = `create_onto_* | update_onto_* | delete_onto_*` or an explicit list (L252). Read = `get_ list_ search_ find_ read_` (L98). **Naming matters:** `query_*`, `import_*`, `upsert_*` would not be classified without list edits.
- `loop/write-ledger.ts` `resolveEntityKind` L72–85: `^create_onto_([a-z_]+)$` → entity kind. `create_onto_table` → "table" automatically. `update_onto_table_rows` → "table_rows", which needs an explicit row. Display/state extraction key lists (L305, L323, L338) need 'table'.
- `loop/turn-contract.ts` `TURN_CONTRACT_ENTITY_KINDS` L71 needs 'table'.
- `loop/finalization-guard.ts`, `loop/request-expectation.ts` L83, `loop/record-references.ts` (RecordKind project|task|document), `packages/shared-types/src/record-routes.ts` `buildRecordHref` (project|task|document) all need 'table' so replies can link `/projects/<p>/tables/<id>`.
- `catalog/entity-result-materialization.ts` (EntityKind list + `MATERIALIZED_TOOLS_BY_KIND`).
- `loop/tool-validation.ts` L38–43 (nullable-change args, e.g. `update_onto_asset: ['document_id']`).

### 1l. User-facing UI (receipt, toast, cards)

- `apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts`: `TOOL_CATALOG` L168 (`{toast, trackMutation}`; `CATALOGED_TOOL_NAMES` is enforced by tests), action labels (L1363+), `CREATE_TOOL_KINDS` L262, entity key maps L240–260, `DOCUMENT_MUTATION_TOOLS`.
- `document-change-cards.ts` + `DocumentChangeCards.svelte`: reads the structured `document_change` receipt (line stats, hunks, inverse patch) → "updated · +X −Y" toast + Undo via `routes/api/onto/documents/[id]/revert-change/+server.ts`. No text parsing.
- Confirm card precedent: `SharedDocumentEditCard.svelte` + `shared-document-edit-card-history.ts`. The tool returns `confirmation_kind`/`status: 'confirmation_required'`, the user's click is the only consent, and `tool-classification.ts` L239 refuses to count it as a write.
- The model reviewer is the "review UI" for held batches. The user only sees cards/receipts.

### 1m. Skill playbook

- Operational skills preload into the worker prompt (no skill_load on the worker): `apps/web/.../tools/domains/skill-gate-preload.ts`, skill `skills/definitions/document_workspace/SKILL.md` (every tool it names must be mounted; `skill-related-ops-integrity.test.ts`). A skill whose `materialized_tools` are all unmounted is refused (`tools_unmounted`).
- **Landmine:** `tools/domains/operational-skill-intent.ts` decides which operational playbook to preload with a regex verb/noun lexicon over the user message. This conflicts with the AGENTS.md rule. Don't extend it with "table/spreadsheet/row" nouns. Key a table playbook off structured signals instead (focus type 'table', a CSV attachment kind, a table tool mounted/selected).

### 1n. MCP (+ agent-call)

- Ops: `packages/shared-types/src/agent-call.types.ts` `BUILDOS_AGENT_READ_OPS` L25, `BUILDOS_AGENT_WRITE_OPS` L62.
- Handlers: `EXTERNAL_OP_HANDLERS` (core.ts L234). MCP-only tools via `EXTERNAL_CUSTOM_OPS` (`op-execution-gateway.config.ts` L80, e.g. `get_onto_project_status`). MCP-specific schemas via `EXTERNAL_WRITE_OP_SCHEMAS` (config L311). Mutation bookkeeping `op-execution-gateway.mutations.ts` (entityKind, activity row). Write meta `op-execution-gateway.responses.ts`. Link kinds `LINK_ENTITY_TABLES` (config L273).
- Listing: `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` `getBuildosAgentGatewayTools` L169 → `buildExternalGatewayRegistry` (core.ts L2332: allowed_ops ∩ handlers ∩ registry ops).
- Connector: `mcp-connector.service.ts` `toMcpTool` L299 (annotations: `destructiveHint` from op-name substrings `.delete/.unlink/.archive/.move` L290). `MCP_FETCH_CONFIG` L572 (search/fetch for the ChatGPT data profile). `MCP_RESOURCE_FETCHABLE_TYPES = {project, document}` L800.
- Local stdio bridge `packages/buildos-mcp-server` is a pure proxy and needs no change.
- Key UI: `apps/web/src/lib/components/profile/AgentKeysTab.svelte` L80+ (one label per write op).
- Defaults: `packages/shared-agent-ops/src/policy.ts` `defaultAllowedOpsForMode`. Keys with no explicit `allowed_ops` pick up new ops automatically. Keys with explicit lists (OpenClaw defaults, the frozen legacy lists from tasker 94) need a grant through `request_buildos_permission`.

### 1o. Complete touch list for a new tool family (empirical: the `update_onto_asset` footprint + doc tools)

Runtime package:

1. `catalog/definitions/<new>.ts` (+ export in `definitions/index.ts`, `CHAT_TOOL_DEFINITIONS`)
2. `catalog/metadata.ts` (summary/capabilities: **Jev's selection input**)
3. `catalog/registry.ts` `TOOL_OPERATIONS` + `registry.test.ts`
4. `catalog/taxonomy.ts` `TOOL_CATEGORIES`
5. `catalog/surfaces.ts` (+ `surfaces.test.ts`)
6. `catalog/entity-result-materialization.ts`
7. `worker-tool-policy.ts` (executable mutation literal)
8. `tools/<table>-reads.ts` + `tools/shared-read-dispatch.ts` registry + `tools/index.ts`
9. `loop/tool-payload-compaction.ts` (table read compactor that fits by rows, plus a receipt compactor)
10. `loop/write-ledger.ts`, `loop/turn-contract.ts`, `loop/tool-classification.ts` (if names break the prefixes), `loop/tool-validation.ts`, `loop/record-references.ts`, `loop/request-expectation.ts`, `loop/finalization-guard.ts`
11. `context/context-loader.ts` (`FOCUS_ENTITY_CONFIG`), `context-finder/packets.ts` (`ContextFinderKind`)

shared-types: 12. `agent-call.types.ts` ops; `agent.types.ts` `ProjectFocus.focusType`; `record-routes.ts`; `database.schema.ts`/`database.types.ts` via `pnpm gen:all`

shared-agent-ops: 13. `gateway/op-execution-gateway.tables.ts` (new handlers + preview), `core.ts` `EXTERNAL_OP_HANDLERS`, `config.ts` (selects, `EXTERNAL_WRITE_OP_SCHEMAS`, `EXTERNAL_CUSTOM_OPS` for an MCP-only list, `LINK_ENTITY_TABLES`), `mutations.ts`, `responses.ts`, `ontology/table-*.service.ts` (query core shared by chat reads and the gateway)

Worker: 14. `mutations/tool-catalog.ts` (capability union, spec rows, maybe a `table_change` receipt builder), `mutations/argument-normalizers.ts`/`receipt-builders.ts` (named functions only) 15. `provider/jev-tool-selector.ts` `SUPPORTING_TOOLS` L83 (+ pins in `request-builders.ts` L316 for a focused table) 16. `tools/execution-policy.ts` `ROW_LOCAL_MUTATIONS` 17. `provider/table-edit-preview.ts` (mirror of document-edit-preview) 18. Tests: `agenticChatWorkerSurfaceBudget.test.ts` (re-baseline), `agenticChatMutationSurfacePolicy.test.ts` (count), `agenticChatReliabilityContractAudit.test.ts` (count), `agenticChatJevToolSelector.test.ts`, `agenticChatWriteRouting.test.ts`, `agenticChatTableMutationAdapter.test.ts`

Web: 19. `agent-chat-tool-presenter.ts`; new `table-change-cards.ts` + component (Undo endpoint); `agentic-chat-lite/prompt/build-lite-prompt.ts` (Knowledge Map + focus rendering); `prompt-size-budget.test.ts` re-baseline; `worker-prompt-surface.test.ts` 20. MCP: `mcp-connector.service.ts` (`MCP_FETCH_CONFIG`, resource types), `AgentKeysTab.svelte` 21. Skill: `skills/definitions/table_workspace/SKILL.md` + registry + preload wiring 22. DB: migration(s) + `load_fastchat_context` RPC `p_focus_type` support (`db:rehearse`, grants: new functions are server-only by default)

---

## 2. Tool loading and budget

### How tools reach the model

1. **Static surface per context type** (global / project / project_create), plus the per-user email group. Nothing is chosen from message text.
2. **Worker projection**: drops omitted names, narrows mutation schemas to `reviewedArgumentNames`, applies `descriptionOverride`, defers the contract tool on opening passes (`provider/tool-surface.ts`).
3. **Jev pre-selection** (worker, on by default since 2026-09-18): one call (~300 ms, ~$0.0003) scores every non-control tool from its TOOL_METADATA summary and capabilities. It keeps p ≥ 0.3, adds `SUPPORTING_TOOLS` closures and structured pins, and continuations inherit the set. Eval (`docs/research/jev-tool-selection-2026-09-18/README.md`): 0 misses / 90+24 runs, 62–67% schema cut, average opening pass ≈ 4.6k tool tokens.
4. **Safety net**: if the model calls an admitted tool Jev dropped, a one-shot surface repair restores the full admitted surface (+1 pass worst case).
5. **No lazy discovery on the worker**: skill_search/skill_load/tool_search are omitted; materialize-on-miss exists only on the legacy web lane. Anything a turn might need must be on the admitted surface.

### Budget caps (ratchets: re-baselining with a dated comment is the accepted convention)

| Guard                                             | File:line                                                                            | Measured                         | Cap    | Headroom      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ------ | ------------- |
| Worker project surface bytes (opening/all passes) | `apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts` L173–174                  | 64,863 B / 65 tools (2026-09-30) | 64,900 | **37 B**      |
| Worker global surface bytes                       | same L172                                                                            | ~48.7 KB at 09-18 + later        | 51,200 | small         |
| Web canonical project payload chars               | `apps/web/src/lib/services/agentic-chat-lite/prompt/prompt-size-budget.test.ts` L368 | 80,039                           | 80,450 | **411 chars** |
| Web payload est tokens                            | L369                                                                                 | 20,010                           | 20,110 | 100 tokens    |
| Tool-schema tokens × 3 passes                     | L373                                                                                 | 17,009 × 3 = 51,027              | 51,280 | 253           |
| Largest single schema (update_onto_task)          | L385                                                                                 | 926 tokens                       | 950    | 24            |
| System prompt chars                               | L338                                                                                 | 11,849                           | 12,000 | 151           |

(The "76,588 of 76,600" figure in memory is the 09-23 measurement. These caps have since been re-baselined upward three times.)

Raw catalog sizes (pre-projection, measured): project 67 tools / 68,872 B; global 52 / 57,313 B. Per tool: update_onto_document 3,536 B, update_onto_task 3,706, create_onto_task 3,333, create_onto_document 1,850, link_onto_entities 1,321, list_onto_tasks 918, get_document_outline 752, read_document_section 721, get_onto_document_details 630, get_project_cleanup 568. Average Jev catalog entry ≈ 243 chars.

### Effect of adding the table suite

- Draft 5-tool suite measured at **6,608 B** (get 517, read_table_rows 1,558, create 1,375, update_onto_table 2,068, update_onto_table_rows 1,090). Expect about 8 KB after real descriptions.
- On an unnarrowed project pass that is ~+12% tool bytes (~+1.7–2k est tokens). **Every cap above fails and must be re-baselined** (dated comment, same as tasker 98/112). So does any single new tool, because headroom is near zero.
- On a typical pass Jev drops them unless the turn is about a table, so the per-turn cost is about zero. Jev's own input grows by ~1.2 KB.

### Cheapest loading option

- **A (recommended): static project-surface membership + Jev.** Add the 5 tools to `PROJECT_DIRECT_TOOL_NAMES`, the 2 reads to `GLOBAL_DIRECT_TOOL_NAMES` (search results can name tables on global turns, the same rule as document reads), `SUPPORTING_TOOLS` closures (`update_onto_table_rows: ['get_onto_table_details','read_table_rows']`, etc.), and a structured pin of the table group when `ProjectFocus.focusType === 'table'` (request-builders L316 precedent: image attachment → pin `update_onto_asset`). Lowest code; Jev makes mounted-but-irrelevant schemas ~free.
- **B: email-style conditional group.** Keep `create_onto_table` static. Mount the other 4 only when the project has at least one table or a table is focused (a durable fact, never text). It saves tokens only on Jev-fallback/repair passes and for table-less projects. It costs prewarm/admission lockstep (harness sha), a memo, and a "created and then edited in the same turn" gap. That gap is mitigated because `create_onto_table` accepts initial rows.

---

## 3. Document tools as precedent for row/cell edits

| Document mechanism                                                    | File                                            | Table analog                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_onto_document_details` 3,500-char preview + `content_truncated`  | compaction L1090                                | `get_onto_table_details`: columns + row_count + first N rows + `rows_truncated`                                                                         |
| `get_document_outline(find)` → exact lines for old_text               | ontology-reads L1438                            | `read_table_rows(filters: contains/eq…)` → row_ids                                                                                                      |
| `read_document_section(anchor)`                                       | L1481                                           | `read_table_rows(offset, limit, columns)` paging                                                                                                        |
| `edits[{old_text,new_text}]`, all or none                             | gateway `resolveDocumentBodyUpdate`             | `update[{row_id, values}]`, all or none. Stable row ids beat text anchors: no ambiguity class                                                           |
| `section_edits` by heading                                            |                                                 | `column_changes` by column name                                                                                                                         |
| `allow_large_deletion` (>30%)                                         | core.ts L825                                    | refuse deleting >30% of rows / >N rows unless flagged                                                                                                   |
| dry-run preview → validation repair or reviewer diff                  | `provider/document-edit-preview.ts`             | `previewTableRowsChange` → `{rows_added, rows_updated, cells_changed, rows_deleted, sample diffs}`; a bad row_id/column goes straight back to the actor |
| chained preview `baseContent`                                         | same                                            | a batch previews against the state left by earlier calls                                                                                                |
| `documentWriteGuard` (`updated_at`)                                   | core.ts L990                                    | table `version` guard                                                                                                                                   |
| `document_change` receipt (stats, hunks, revert patch) → toast + Undo | `document-change-cards.ts`, revert-change route | `table_change` receipt (cell diffs + inverse ops) → "Pipeline · +3 rows · 7 cells" + Undo                                                               |
| shared-doc confirm card                                               | `SharedDocumentEditCard.svelte`                 | confirm card for cross-project or destructive schema ops                                                                                                |
| `MAX_DOCUMENT_CONTENT_BYTES` 200 KiB                                  | core.ts L230                                    | per-call row cap (`maxItems` 200) + byte cap; `ACTING_OUTPUT_TOKENS` 12k bounds a pass                                                                  |

---

## 4. Context representation

- Today: focused document → `mapDocumentFocus` (`context/context-loader.ts` L217) with `FOCUSED_DOCUMENT_CONTENT_MAX_CHARS = 16_000` (`context/focused-document-context.ts`), rendered by `describeFocusEntityDetail` (`build-lite-prompt.ts` L996) as a fenced untrusted block. Project docs show in the **Knowledge Map** (`build-lite-prompt.ts` L1277+, 60 nodes / 2,200 chars). The context finder ranks one packet per entity (`context-finder/packets.ts`, kinds document|task|goal|plan|milestone|risk, ~150-char descriptions).
- Proposed for tables:
    - **Knowledge Map line** per table (~120 chars): `- Pipeline · table · 42 rows · Name, Stage, Value, Owner +3 [id: …]`. If tables are filed in the doc tree, they ride the existing tree walk.
    - **Focused table** (`focusType: 'table'`): columns with types + row_count + views, plus first ~15 rows as compact CSV in a fenced untrusted block, capped at ~3,000 chars (not 16k). Note `rows_truncated` → `read_table_rows`. Needs `ProjectFocus` union + `FOCUS_ENTITY_CONFIG` + `load_fastchat_context` RPC support.
    - **Context-finder packet**: `table: Pipeline [42 rows; Name, Stage, Value…] — description`; full load = schema + first rows.
    - **Tool results**: `{columns:[…], rows:[[row_id, v1, v2…]], row_count, offset, next_offset, rows_truncated}` (CSV-like arrays, ~40% smaller than objects). Fit by dropping rows, never by trimming cells; mark long cells explicitly (`…[+N chars]`).
    - **Search**: index title, description, column names, and cell text so `search_project` returns tables and matching rows. Then no chat `list_onto_tables` tool is needed.

---

## 5. MCP exposure

Because chat writes run through the shared gateway, MCP gets table writes from the same handlers:

1. Add ops: reads `onto.table.get`, `onto.table.rows.query`, `onto.table.list` (MCP-only via `EXTERNAL_CUSTOM_OPS`); writes `onto.table.create`, `onto.table.update`, `onto.table.rows.update`.
2. `EXTERNAL_OP_HANDLERS` + `op-execution-gateway.tables.ts`; `mutations.ts` bookkeeping (activity: `onto_project_logs` has no table entity type, so a migration or the asset-style "log on the document" workaround); `responses.ts` write meta.
3. `TOOL_OPERATIONS` rows (frozen op contract).
4. `AgentKeysTab.svelte` labels; `MCP_FETCH_CONFIG.table` + `MCP_RESOURCE_FETCHABLE_TYPES` add `table` (`buildos://table/<id>` → CSV/markdown text for the ChatGPT data profile's fetch).
5. Annotation landmine: `isDestructiveOp` keys off op-name substrings, so row deletes inside `onto.table.rows.update` won't be flagged destructive. Either accept it or name the op so it signals the deletes.
6. Existing keys with explicit `allowed_ops` lists won't see table ops until granted.
7. Stdio bridge: no change.

---

## 6. Repo rule: never classify language with regex

- Query/filter semantics must arrive as structured args (`filters[{column, op enum, value}]`). The server never parses an NL "query" string. No raw SQL: there is no precedent and it would be a security hole.
- Column meaning comes from the column `type`/`options` set by the model or user. Never infer "Status means task state" from a column name.
- Allowed regex use: CSV parsing, number/ISO-date/URL/email type inference on cell values (structured formats), UUID/row-id validation.
- Table playbook preload: key it off focus type, attachment kind, or mounted/selected tools. Do NOT add "table/spreadsheet" to the `operational-skill-intent.ts` regex lexicon (an existing violation with a TODO).

---

## 7. Proposed table tool suite (5 chat tools + reuse)

| #   | Tool                                                                                                                                                                                                               | Op                       | Kind / bucket | Surface          | Worker spec                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `get_onto_table_details(table_id, row_limit=20)`                                                                                                                                                                   | `onto.table.get`         | read          | global + project | shared read                                                                                           |
| 2   | `read_table_rows(table_id, filters[], sort[], columns[], group_by[], aggregates[{fn: count/sum/avg/min/max, column}], limit≤100, offset)`                                                                          | `onto.table.rows.query`  | read          | global + project | shared read                                                                                           |
| 3   | `create_onto_table(project_id, title, description, columns[{name, type, options}], rows?[≤200 {col: value}], csv?, parent_id?)`                                                                                    | `onto.table.create`      | write         | project          | ordinary / new_entity / argument_project                                                              |
| 4   | `update_onto_table(table_id, title?, description?, column_changes[{action: add/rename/retype/delete/move…}], view_changes[{action, name, layout: grid/board/chart, filters, sort, group_by, columns}], archived?)` | `onto.table.update`      | write         | project          | contract_required at first (schema changes are rare and destructive), preview for delete/retype       |
| 5   | `update_onto_table_rows(table_id, add?[≤200 values], update?[{row_id, values}], delete?[row_id])`                                                                                                                  | `onto.table.rows.update` | write         | project          | ordinary / resolved_existing / context_project; `ROW_LOCAL_MUTATIONS` on table_id; preview → reviewer |

Covered without new tools:

- **Link table ↔ task/doc**: `link_onto_entities` with kind `table` (add to the worker enum override, `LINK_ENTITY_TABLES`, `ExternalLinkEntityKind`).
- **Row ↔ task**: a `link` column type whose cells hold `{kind, id}`, so links are visible in the grid. "Create tasks from these rows" = `create_onto_task` ×N + `update_onto_table_rows` in one batch with `call_ref`/`after`.
- **Export CSV**: no tool. `get_onto_table_details` returns `csv_path: /api/onto/tables/<id>/export.csv` (relative path, per the tasker 100 link rule) and the UI has a download button. MCP `fetch table:<id>` returns CSV.
- **Delete table**: archive via `update_onto_table` (hard deletes stay deferred in the worker).
- **List tables**: the Knowledge Map plus `search_project` in chat; `list_onto_tables` is MCP-only.
- **Views**: `view_changes` reuses the same filter/sort DSL as `read_table_rows`, so one DSL runs reads, saved views, and later bulk `update_where`.
- **Import CSV**: v1 `csv` text arg (verbatim). v2 adds an attachment source (`media_type: 'image'` is the only kind in `NormalizedChatAttachmentV1` today, `packages/shared-types/src/agentic-chat-worker-contract.ts` L52, so that's a contract change) so the server parses bytes and rows never pass through the model.

Naming notes: the names keep the `create_onto_`/`update_onto_` prefixes so write classification, the write ledger, and entity-kind derivation work. `read_` keeps the read prefix. Add one explicit `resolveEntityKind` row: `update_onto_table_rows → 'table'`.

Later (v1.1): `update_where: {filters, values}` on tool 5 (bulk set without reading ids, previewed count), and `key_column` upsert for research enrichment (the lead_list_research skill says "save progress as rows are found").

Natural first users: `skills/definitions/lead_list_research/SKILL.md` (research → rows) and project tracking (effort/time logs).

---

## 8. Landmines

1. Budget caps have ~0 headroom. Any table tool requires a dated re-baseline of 6 asserts across 2 test files.
2. "table" naming collision with the worker's table-driven adapter (`table-adapter.ts`, `executor: 'table'`, `AGENTIC_CHAT_TABLE_MUTATION_TOOL_NAMES_V1`).
3. The generic payload size guard trims strings, which corrupts cells. Table reads must fit themselves.
4. The saturation ledger keys novelty on entity ids. Paged reads must return row ids.
5. The worker surface is immutable per turn, so no lazy tool discovery. Mount everything a table turn could need.
6. A large row batch shown raw to the model reviewer bloats review. The reviewer should judge the server preview summary, as with documents.
7. `operational-skill-intent.ts` is an existing regex classifier. Don't extend it.
8. MCP `destructiveHint` is derived from op names.
9. Customized MCP keys need a grant for new ops.
10. `onto_project_logs` has no table entity type.
11. Attachments are images only. CSV-as-attachment is a worker-contract change.
12. Chat reads and gateway reads are separate implementations today. Single-source the table query core in shared-agent-ops.
