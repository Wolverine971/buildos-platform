<!-- tasker/42-tool-discovery-fix-package.md -->

# tasker/42 — Chat Tool Discovery: Audit Findings + Fix Package

**Date:** 2026-07-27
**Status:** ✅ IMPLEMENTED + VERIFIED 2026-07-29. All five work items (W1–W5) landed in `ac0460fc2` + `65768e860` and passed independent verification: 272 unit tests green, all W2 acceptance probes pass live against the registry (reschedule→`cal.event.update` exact hit; batch-update→`update_onto_task` #1; gmail flag-on→3 email ops; the failed 7/22 prod query now returns a recovery directory), e2e battery 46 pass / 2 fail — both failures pre-existing/unrelated (research-persistence band; new book scenario hit two 60s LLM stream timeouts, `error_logs` confirms provider latency). Email e2e scenario skipped (flag off) — W1 email path verified at unit/probe level only. Remaining lead: watch `result_count`/`zero_result` populate in prod `chat_tool_executions` after deploy.
**Origin:** DJ asked whether the agentic-chat tool catalog is easy for the agent to navigate as it grows — "hierarchical directory, find the tool, request the definition, start calling." Audit answer: the architecture already does most of that; six specific holes were found, several with production receipts.

---

## 1. How discovery works today (read this before touching anything)

Three layers, all in `apps/web`:

### Layer 1 — Launch surfaces (per-context preloads)

`src/lib/services/agentic-chat/tools/core/gateway-surface.ts`

- 8 profiles (`global_basic`, `global_write`, `project_basic`, `project_write`, `project_document`, `project_write_document`, `project_calendar`, `project_create_minimal`), each mounting 1–12 direct tools plus the discovery tools.
- Discovery set at turn start: `domain_search`, `skill_search`, `skill_load`, `skill_reference_load`, `libri_*` (3), `tool_search`, `tool_schema` (`GATEWAY_DISCOVERY_TOOL_NAMES`, line ~15). A lean mode behind `FASTCHAT_LEAN_DISCOVERY` mounts only `skill_search` + `domain_search`.

### Layer 2 — `tool_search` / `tool_schema` over the op registry

- Registry builder: `src/lib/services/agentic-chat/tools/registry/tool-registry.ts`. Maps ~90 chat tools to canonical ops (`onto.task.update`, `cal.event.create`, …) with `group` (`onto`|`util`|`cal`|`x`), `kind` (read/write), `entity`, `action`. Cached singleton (`getToolRegistry`), version-hashed.
- Search: `src/lib/services/agentic-chat/tools/registry/tool-search.ts` (`searchToolRegistry`). Filters: `query`, `capability`, `group`, `kind`, `entity`, `limit` (default 8, max 25), `surface`.
- Schema: `src/lib/services/agentic-chat/tools/registry/tool-schema.ts` (`getToolSchema`) — exact args, required fields, generated example call.
- Capability catalog (12 capability cards with `directPaths`): `src/lib/services/agentic-chat/tools/registry/capability-catalog.ts`.
- Tool definitions the model sees for the meta-tools: `src/lib/services/agentic-chat/tools/core/definitions/gateway.ts` (`tool_search` at ~line 347, `tool_schema` at ~line 388).
- Execution entry: `src/lib/services/agentic-chat/execution/tool-execution-service.ts` lines ~1062 (`tool_search`) and ~1084 (`tool_schema`). Same search also backs the external agent-call gateway: `src/lib/server/agent-call/external-tool-gateway.ts` ~line 479.

**Key behavior — auto-materialization:** every tool named in a `tool_search` result is automatically mounted into the model's tool surface for the next round (`extractGatewayMaterializedToolNames` in `gateway-surface.ts` ~line 266, invoked from `recordToolExecutionForRound` in `src/lib/services/agentic-chat-v2/stream-orchestrator/tool-round-runner.ts` ~line 210). `tool_schema` mounts the single tool. There is **no separate "request the tool" step** — do not add one.

### Layer 3 — On-miss materialization (the safety net)

`src/lib/services/agentic-chat-v2/stream-orchestrator/tool-round-runner.ts`, `dispatchUnavailableToolCall` (~line 310):

- If the model calls an unmounted tool by exact name → materialize + **auto-execute in the same round** (zero wasted round-trips).
- If the model calls an op reference (`onto.task.update`) → resolve to the callable tool name, materialize, execute.

### Where the model learns about all this

`src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`, `buildCapabilitiesSkillsToolsSection` (~line 926): a two-layer framing (skills + tools), a root-skill catalog table, and **one line listing capability display names only** (line ~972: `BuildOS runtime capabilities: ${names}` — human names like "Calendar management", not IDs).

**Prod usage (last 30 days, `chat_tool_executions`):** 692 total tool executions; 24 `tool_search`, 2 `tool_schema`. Discovery is a fallback path — launch surfaces + on-miss carry most turns. The model uses filters well (most prod calls pass `entity` + `kind`).

---

## 2. Verified findings (ranked)

### F1 — Hidden `x` group makes email (and cross-project search) tools unreachable via filters. **[bug, prod receipt]**

`resolveGroup` (`tool-registry.ts:200-205`) buckets any op not starting with `onto.`/`util.`/`cal.` into group `'x'`: all 3 Gmail ops (`email.accounts.list`, `email.messages.search`, `email.messages.get`), `x.search.all_projects`, `x.search.project`, `onto.search`, and libri ops. But the `tool_search` definition's `group` enum (`gateway.ts` ~line 365) only offers `['onto','util','cal']` — no filter can ever surface an `x`-group tool, and `entity` is also `undefined` for them (`resolveEntity` returns undefined for group `x`).

**Prod receipt (2026-07-22, two real turns):**

```json
{"group":"util","query":"gmail inbox read messages email"}
{"query":"read email inbox gmail"}
```

The first is structurally guaranteed zero results even with email enabled. (The second also returned nothing because `EMAIL_CHAT_TOOLS_ENABLED` is default-off — the flag-off state is intentional per tasker/35; the taxonomy hole is not.)

Note: email tool descriptions DO contain "Gmail", and the `email_context` capability card exists with `directPaths: ['email.accounts','email.messages']` — so query-only and capability-filtered searches would work once the flag is on. Only the group/entity path is broken.

### F2 — Scorer is naive substring-token matching: zero-result cliffs and junk noise. **[quality]**

`computeMatchScore` (`tool-search.ts:52-83`): whole-query exact/substring boosts on op/tool_name, then +20 per query token found as a **substring** anywhere in the haystack. Verified probe results (offline, real registry):

| Probe query                       | Result                                                               | Why                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `"calendar"`                      | ✅ all 7 cal tools ranked top                                        | token present in descriptions                                                                                        |
| `"move task to another project"`  | ✅ `onto.task.move` #1                                               | direct token overlap                                                                                                 |
| `"delete document"`               | ✅ `onto.document.delete` #1                                         | direct token overlap                                                                                                 |
| `"reschedule meeting tomorrow"`   | ❌ **0 results**                                                     | no token overlap with "update … calendar event"; score 0 → filtered out                                              |
| `"batch update many tasks"`       | ⚠️ task tools returned but **`update_onto_task` missing from top-8** | tie at score ~20-40; tie-break sorts `kind` ascending → reads beat writes; the only update tool got cut by the limit |
| `"what is on my plate this week"` | ⚠️ 8 confident junk results                                          | short tokens ("is") substring-match nearly every description                                                         |

A zero-result search wastes a full model round and leaves the agent flailing; the noise case actively misleads.

### F3 — The directory exists but the model is never shown the map. **[prompt gap]**

Hierarchical browsing already works: empty `query` + `group`/`entity` filter returns a clean category listing (probe: `entity=task` → 9 task tools; `group=cal` → all 7 calendar tools; `capability=calendar` → same). But:

- The `tool_search` description (`gateway.ts:349`) says "Search for the operation you need" — never mentions browse mode.
- The prompt lists capability **display names**, not the IDs/paths the `capability` filter needs (`capabilities.calendar` etc.). The tool description hints at two examples only. The model must guess IDs.

### F4 — Zero-result telemetry is not recorded for discovery calls. **[instrument gap]**

`chat_tool_executions` has `result_count` and `zero_result` columns, but they are **NULL on all 26 discovery rows** in the last 30 days. The zero-result rate — the single best health metric for tool_search — is invisible in prod and in `src/lib/services/admin/chat-tool-analytics.ts`. (Same lesson as the agent-surfaces framework: audit the instrument first.)

### F5 — Dead code in the capability catalog. **[cleanup]**

`listCapabilitySummaries` (tool-search.ts:150), `buildCapabilityHelpPayload` and `listCapabilityDirectoryItems` (capability-catalog.ts) have no callers outside their own files (repo-wide grep, non-test). Leftovers from a removed `help` tool.

### F6 — No batch/bulk ops exist anywhere in the registry. **[product gap, out of scope]**

DJ mentioned "batching tools" — there are none (all writes are single-entity; nearest is `reorganize_onto_project_graph`). This is a product decision, not a discovery fix. Flag to DJ separately; do not build as part of this packet.

### Non-findings (verified fine — do not "fix")

- The find→load→call flow is already optimal (auto-materialize + on-miss auto-execute). Do not add a "view directory then select tools" step; it exists implicitly and adding an explicit one would cost a round.
- Repeated prod searches for "get full document body content" (5× on 7/12–7/13) predate the L2 preload of `get_document_outline`/`read_document_section` in `project_basic`; already addressed.

---

## 3. Fix package (lean — DJ approved direction, pitch was "lean vs ambitious", lean chosen implicitly pending his go)

Work items in priority order. Keep each change small and separately verifiable.

### W1 — Fix the group taxonomy (F1)

- Give email ops a real group: either add `'email'` as a first-class group in `RegistryOp['group']` and `resolveGroup`, or fold them into `util`. Prefer a real `'email'` group — DJ explicitly thinks in "Gmail tools" as a category.
- Decide the fate of `x`: `x.search.*` + `onto.search` are cross-project search tools; consider group `'search'` or keep `x` but **expose it in the enum**.
- Update the `group` enum in BOTH `tool_search` definitions surfaces: `gateway.ts` (~line 365) and the external gateway's equivalent if it declares its own (check `external-tool-gateway.ts` and `public-tool-registry.ts`).
- Update `ToolSearchOptions['group']` type in `tool-search.ts`.
- **Landmine:** registry tests assert email gating — `email-tool-registry.test.ts` asserts no email-write op resolves. Don't break the flag gating (`isEmailChatToolsEnabled` filters in both `buildToolRegistry` and `capability-catalog.ts`).
- **Landmine:** `computeRegistryVersion` hashes the registry — group changes will change the version string. That's expected/fine, but confirm nothing caches ops by version across sessions.

### W2 — Upgrade the scorer (F2)

In `computeMatchScore` (`tool-search.ts`):

1. **Word-boundary token matching** instead of `haystack.includes(token)` (tokenize haystack once; match whole words).
2. **Stop-word filter** (`is, my, to, the, a, on, what, this, of, for, in, and, or, with`…) before scoring.
3. **Per-token name bonuses**: token hit in `op` or `tool_name` should outweigh a description hit (currently only the whole query gets name boosts, so multi-word queries never benefit).
4. **Small synonym/verb map** applied to query tokens before matching. Minimum viable set from real failures: `reschedule→update`, `meeting/appointment→event`, `remove→delete`, `rename/edit/change/modify→update`, `email/mail→gmail message`, `todo→task`, `note→document`, `deadline→milestone due`.
5. **Fix the tie-break**: on equal score, do NOT sort reads before writes. If the query contains a write verb (create/update/delete/move/etc.), prefer `kind: write` on ties; otherwise keep alphabetical.
6. **Never return zero**: when 0 matches survive, return a `no_matches` payload that includes (a) the group/entity directory (counts per category) and (b) the capability list with IDs — so the agent's next call is informed, not a re-guess. Use the dead helpers from F5 for this (`listCapabilitySummaries` / `listCapabilityDirectoryItems`) instead of deleting them.

Acceptance probes (run as unit tests against the real registry — pattern exists in `tool-search.test.ts`):

- `"reschedule meeting tomorrow"` → `cal.event.update` in top 3, nonzero results.
- `"batch update many tasks"` → `onto.task.update` in top 5.
- `"gmail"` with email flag forced on in test env → 3 email ops returned.
- `"what is on my plate this week"` → `util.workspace.overview` #1 OR ≤3 results (noise controlled).
- All currently-passing cases in `tool-search.test.ts` keep passing; `"calendar"`, `"move task to another project"`, `"delete document"` stay #1-quality.

### W3 — Show the model the map (F3)

- `tool_search` description in `gateway.ts`: add one sentence teaching browse mode — "Omit `query` and pass `group`/`entity` to list a whole category."
- In `buildCapabilitiesSkillsToolsSection` (`build-lite-prompt.ts` ~line 972): emit capability **IDs** alongside names, compactly (e.g. `Calendar management (capabilities.calendar)`). Keep it to the existing single line — this section was deliberately compressed in tasker/39 (WP-2/WP-5); do not reinflate it with per-capability prose.
- **Landmine (tasker/39):** the prompt architecture was just restructured and battery-verified 11 scenarios 5/5. Any prompt-section change must re-run the e2e battery (below) to prove no regression.

### W4 — Log discovery health (F4)

- Populate `result_count` (= `total_matches`) and `zero_result` on `chat_tool_executions` rows for `tool_search`, `tool_schema` (`not_found` → zero_result), and ideally `skill_search`. Find where executions are persisted (writer for `chat_tool_executions` — likely in the stream orchestrator's execution recording path or `tool-execution-service.ts`).
- Surface zero-result rate for `gateway_discovery` category in `chat-tool-analytics.ts` (category mapping already exists at ~line 386).

### W5 — Cleanup (F5)

- Wire `listCapabilitySummaries`/`listCapabilityDirectoryItems` into the W2 zero-result payload; delete `buildCapabilityHelpPayload` + `CapabilityHelpPayload` if still unused after W2, or delete all three if W2 takes a different shape. No orphaned exports.

### Out of scope

- Embeddings/vector retrieval (overkill at ~90 tools; revisit past ~200 when Gmail tiers/Corsair/Libri land).
- A new `tool_directory` meta-tool (browse mode + W3 covers it without adding a tool to every launch surface).
- Batch ops (F6 — DJ decision needed first).

---

## 4. Verification

1. **Unit:** extend `src/lib/services/agentic-chat/tools/registry/tool-search.test.ts` with the W2 acceptance probes. `cd apps/web && pnpm test src/lib/services/agentic-chat/tools/registry/tool-search.test.ts`.
2. **E2E battery (required after W3, recommended after all):** `pnpm test:agentic` drives the real stream endpoint (see memory: `project_agentic_chat_e2e_harness`). Known pre-existing failures to not confuse with regressions: research-doc band 2/5. Landmines: `/api/auth/login` for session setup; new users need a `public.users` row; dev servers bind IPv6-only — don't trust `curl 127.0.0.1`.
3. **Console note:** vitest config swallows `console.log`; write probe output to a file if you need to inspect ranking during development.
4. **Prod check after deploy:** re-run the telemetry query (last-30d `tool_search` rows from `chat_tool_executions`) and confirm `result_count`/`zero_result` populate; watch zero-result rate.

## 5. Evidence appendix

**Prod `tool_search`/`tool_schema` calls, last 30d (all 26, newest first):**

```
2026-07-22 tool_search {"group":"util","query":"gmail inbox read messages email"}
2026-07-22 tool_search {"query":"read email inbox gmail"}
2026-07-18 tool_search {"kind":"read","limit":5,"query":"web search"}
2026-07-18 tool_search {"query":"web search internet research browse"}
2026-07-18 tool_search {"query":"web search research internet"}
2026-07-18 tool_search {"query":"web research competitor analysis"}
2026-07-15 tool_search {"kind":"write","query":"update document content or add section","entity":"document"}
2026-07-15 tool_search {"kind":"write","query":"update existing task state and description","entity":"task"}
2026-07-14 tool_search {"kind":"write","query":"move document to different parent or archive document","entity":"document"}
2026-07-13 tool_search {"kind":"read","query":"get full document body content details","entity":"document"}
2026-07-13 tool_search {"kind":"read","query":"search for projects by name find project","entity":"project"}
2026-07-13 tool_search {"kind":"write","query":"move task between projects transfer ownership","entity":"task"}
2026-07-12 tool_search {"kind":"read","query":"get full document body content","entity":"document"} (x2)
2026-07-12 tool_search {"kind":"write","query":"update document section content","entity":"document"}
2026-07-12 tool_schema {"op":"onto.document.tree.move","include_examples":true}
2026-07-12 tool_search {"query":"get full document details with body content","entity":"document"}
2026-07-12 tool_search {"kind":"read","query":"read full document body content details","entity":"document"}
2026-07-10 tool_search {"query":"list all projects","capability":"overview"}
2026-07-10 tool_search {"kind":"write","query":"create task in project","entity":"task"}
2026-06-30 tool_schema {"op":"onto.document.update","include_examples":true}
2026-06-30 tool_search {"kind":"write","query":"update task state to done","entity":"task"}
2026-06-30 tool_search {"kind":"read","query":"search for tasks by name in project","entity":"task"}
2026-06-30 tool_search {"query":"inbox item accept dismiss suggestion"}
2026-06-30 tool_search {"query":"project creation create project"}
2026-06-29 tool_search {"kind":"write","query":"update task description or save email","entity":"task"}
```

All rows: `success=true`, `result_count=NULL`, `zero_result=NULL` (→ F4).

**Registry size:** ontology-read 32, ontology-write 28, utility 20, calendar 7, email 3 (flag-gated) = ~90 ops; plus 16 gateway meta-tools not in the registry.
