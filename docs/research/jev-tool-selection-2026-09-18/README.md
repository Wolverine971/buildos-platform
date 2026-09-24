<!-- docs/research/jev-tool-selection-2026-09-18/README.md -->

# Jev tool pre-selection for Agentic Chat

September 18, 2026. Jev (`typesafe/jev-1.13`) reads the user's message and decides which tool schemas the acting model needs this turn. The worker then sends only those schemas instead of the whole surface.

**Result:** on by default since 2026-09-18 (worker `c50679a08`).

- **Original surfaces:** 64 live eval runs across 32 brain dumps with **zero missing tools**. About **60% of tool-schema tokens removed** per pass, **~300 ms** median added, **~$0.0003** per turn.
- **Planning layer:** the admitted catalog grew to 49/60 worker tools. 90 runs across 45 dumps had **zero misses**, a **67% cut**, and the model saw ~4.6k tokens of tools on average. That is less than the 7.6k–9.6k it carried before the toolbox grew.

## Why this matters

Tool schemas are the largest fixed part of every Agentic Chat prompt. The worker sends them on every acting pass.

| Surface      | Tools |                Schema size |
| ------------ | ----: | -------------------------: |
| Global chat  |    26 | 30.5k chars (~7.6k tokens) |
| Project chat |    34 | 38.4k chars (~9.6k tokens) |

Production over the 14 days ending 2026-09-18 averaged 76 turns, 4.5 model passes per turn, and ~13.3k prompt tokens per pass. Opening passes got **10%** prompt-cache hits and later acting passes **55%**. Jev narrows once per turn, and continuations inherit that set. So intra-turn caching is preserved, and there was little cross-turn caching to lose.

The catalog comment in `packages/agentic-chat-runtime/src/catalog/surfaces.ts` states the old trade-off: "the cost of carrying a schema is paid in tokens, the cost of omitting one is a dead turn." Jev changes it. Omission is now decided per message and is recoverable (see Safety net).

## Eval

`harness.ts` builds the **real** worker opening surfaces through the production filters (`surfaces.ts`). It sends each labeled brain dump to the live Decisions API and scores the selection after the deterministic supporting-tool closure. `must` = tools the turn cannot finish without; any-of groups allow several equivalent lookups.

### Tuning set: 20 dumps × 3 prompt variants × 2 repeats (`results-v1.json`)

| Variant             | Question shape                                                              | Misses @0.3 | False positives @0.3 | Schema cut @0.3 |
| ------------------- | --------------------------------------------------------------------------- | ----------: | -------------------: | --------------: |
| **index (shipped)** | "Could `catalog[i]` be needed, including a necessary lookup or later step?" |  **0 / 40** |                **0** |         **58%** |
| inline              | Same question with the tool description inlined                             |      2 / 40 |                    3 |             52% |
| direct              | "Does the request need this tool?"; code adds lookups                       |      2 / 40 |                    2 |             64% |

The "later step" wording matters. "Move the drafts into a _new_ Drafts folder" implicitly needs `create_onto_document`. The index prompt scored it 0.51; the direct prompt scored it 0.22. The weakest required tool under the index prompt scored 0.51, so the threshold is **0.3**. A miss costs a whole extra model pass, which is worth far more than the ~6% more schema a higher cutoff would drop.

### Held-out set: 12 new dumps × 2 repeats (`results-heldout.json`)

These were written after the threshold was chosen, in different styles: rambling voice transcripts, terse notes ("invoice sent. mark it done"), typos, a long weekly reset, and quoted injection text.

- **0 / 24 runs missing a required tool.** The weakest required tool scored 0.64.
- **62%** mean schema cut; 12.1 of 26–34 tools kept.
- Latency: p50 314 ms, p95 416 ms, max 727 ms.
- One false positive, harmless: `delete_calendar_event` was kept on a "push the review to the 12th" dump.

Total eval spend: **$0.040** for 144 calls. Measured cost per call is ~$0.0003 at ~7k input tokens.

## How it runs in the worker

```text
opening pass
  → JevToolSelector.select(request)        provider/jev-tool-selector.ts
      Jev scores every non-control tool (one Noul question each, one request)
      keep p ≥ 0.3 + always-on controls + deterministic supporting reads
      append "the callable schemas for this pass are …" system note
  → acting model sees only the selected schemas
  → continuations inherit the narrowed list
```

- **Fail-open everywhere.** HTTP errors, timeouts (1.5 s), malformed or partial answers, oversized input, and gate/vision/reviewer passes all keep the full admitted surface.
- **Selection is not permission.** Execution authority still comes from the immutable admission artifact and the reviewed mutation catalog. Jev only decides what the model _sees_.
- **Safety net.** If the model calls an admitted tool Jev dropped, the existing one-shot surface repair (`buildUnavailableSurfaceToolRepairRequest`) rejects the call without executing it and restores the full surface. The worst case is one extra pass. This is covered by `apps/worker/tests/agenticChatJevToolSelector.test.ts`.
- **What Jev sees.** The current user message, up to 6 prior user/assistant messages, and tool summaries from `TOOL_METADATA`. Never the system prompt. The request uses `data_collection: deny` and `allow_fallbacks: false`.
- **Usage.** Each call writes an `llm_usage_logs` row, `operation_type = 'agentic_chat_tool_selection'`, off the critical path. Its metadata holds the mode, reason, selected names, schema sizes, and **every tool's probability**, enough to re-tune the threshold offline without new calls.

## Rollout

`AGENTIC_CHAT_JEV_TOOL_SELECTION` on the worker:

| Value          | Effect                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `on` (default) | The acting model receives only the selected schemas                                                             |
| `shadow`       | Jev classifies every opening pass in the background and logs its pick. Zero added latency, zero behavior change |
| `off`          | Kill switch: the full admitted surface on every pass                                                            |

Watch real traffic with `scorecard.sql`. `pnpm agentic:gate` has not run: its CI job fails at setup because the `AGENTIC_GATE_ENV` secret is missing.

`scorecard.sql` joins each selection row to `chat_tool_executions` for the same turn. It reports turns where the model actually called a tool Jev did not pick, mean schema cut, latency, and Jev spend.

## Planning layer (the bigger toolbox)

Jev made it cheap to carry capabilities, so 31 tools that already had reviewed worker adapters joined the surfaces:

- **Goals, plans, milestones, risks:** list, search, details, create, update.
- **Project and cross-entity:** `update_onto_project`, `tag_onto_entity` (@-mention collaborators), `get_onto_project_graph`, typed `search_onto_tasks` / `search_onto_documents`, `get_field_info`, `list_onto_projects` (global only).
- **Project only:** task documents, `get_document_path`, `unlink_onto_edge`.

`search_ontology` stays off: it is a compatibility alias. Deletes and contacts stay off: they have no worker adapter. Each new write gets its lookups from the deterministic `SUPPORTING_TOOLS` closure. Moving documents also brings `create_onto_document`, because "move into a new folder" scored only 0.37 on the bigger catalog.

`planning-cases.ts` holds 13 dumps for the new tools. Across 90 runs on the bigger surfaces (`results-toolbox.json`, `results-toolbox-relabel.json`), there were **0 misses**. The weakest required tool scored 0.37 (the folder case above, now closed in code), and everything else scored 0.65 or higher. Jev's cost rose to ~14k input tokens, **~$0.0006/turn**, with p50 339 ms and p95 518 ms.

Disclosure: one case was relabeled after its first run. "Tag all my bid desk tasks as 'sales'" originally required `tag_onto_entity`. Jev scored it 0.13, and it was right: that tool @-mentions collaborators, and tasks have no label field. The case now requires only task lookups, and a real collaborator case (`PL13`) was added and passes.

## Caching, latency, and cost

**Prompt caching is not hurt.** `cache-probe.ts` tested DeepSeek V4 Flash on Alibaba and NextBit; DeepInfra was rate-limited.

- **Prompt order:** the provider renders the system prompt, then tools, then the conversation.
- **Tool changes:** changing the tool list keeps the system prompt cached (step 3) and invalidates everything after it.
- **Same tools, new message:** 98% cached (step 5).
- **Within a turn:** the narrowed list is identical on every pass, so caching holds.
- **Across turns:** tools were never reused. The system prompt is identical only for its first ~6k chars; the per-turn "Rules for This Turn" section and the clock line come later. Production opening passes get 10% cache hits, with a median hit of 1,024 tokens.
- **Future caveat:** if the system prompt is made stable across turns, reuse the previous turn's selection unless the new message needs more.

**Latency is roughly neutral.** Jev adds ~300–340 ms p50. `latency-probe.ts` measured that uncached first tokens arrive 100–270 ms sooner with the narrowed list (Alibaba 1008→908 ms, NextBit 1855→1586 ms).

**Cost** (14-day production mix: $0.0064/turn, 4.5 passes, ~3.4 carrying tools; cached input costs ~20% of uncached):

| Per turn           |   Today |  Jev on | Bigger toolbox, no Jev | Bigger toolbox + Jev |
| ------------------ | ------: | ------: | ---------------------: | -------------------: |
| Tool schemas + Jev | $0.0024 | $0.0013 |                $0.0040 |             ~$0.0017 |
| Whole turn         | $0.0064 | $0.0053 |                $0.0080 |             ~$0.0057 |

Savings scale with volume times acting-model input price. On a $3/M model the same cut saves about $0.034 per turn.

## Landmines

- **Prompt snapshot provenance.** The persisted prompt snapshot is captured in `prepare()`, before the start fence allows network I/O. It records the admitted surface, not the narrowed one. To reconstruct the exact sent tools, join the turn's `agentic_chat_tool_selection` usage row (`metadata.selectedToolNames`).
- **Billing join.** The Jev usage row is written asynchronously (~$0.0003), so a turn's consumption-billing join can miss it.
- **Alpha API.** The endpoint is `https://openrouter.ai/api/alpha/decisions`, with the request model pinned to `typesafe/jev-1.13`. A breaking change fails open to the full surface. Re-run the harness after any Jev version change; the threshold is model-specific.
- **New data processor.** `shadow` and `on` send user message text to TypeSafe through OpenRouter.
- **Request size.** With the planning layer, Jev requests are ~59–71 KB. The guard is 200 KB, derived from TypeSafe's 64K-token limit. The old 60 KB guard would have silently skipped Jev on every project turn.
- **Web deploys have been failing since at least `199a6ba44`.** Vite cannot resolve `@buildos/shared-types`. The web app admits the surfaces, so the planning layer reaches users only after a web deploy succeeds. Until then, Jev narrows the older surfaces.
- **Not yet measured.** End-to-end turn latency and answer quality with the narrowed surface. The eval measures selection recall, not acting-model behavior. That is what shadow mode, the scorecard, and the gate are for.

## Reproduce

```sh
cd apps/worker
NODE_OPTIONS=--conditions=development ./node_modules/.bin/tsx \
  ../../docs/research/jev-tool-selection-2026-09-18/harness.ts --variants index --repeats 2 --out results-new.json
# held-out set:        --set heldout   (planning layer: --set planning; combine with commas)
# one case:            --only G02-calendar-block-and-followup
# margins per case:    ./node_modules/.bin/tsx ../../docs/research/jev-tool-selection-2026-09-18/margins.ts results-toolbox.json
# caching / latency:   cache-probe.ts, latency-probe.ts (synthetic prompts, ~$0.01 each)
```

The harness uses `PRIVATE_OPENROUTER_API_KEY` from the env or the local `.env` files, sends only the synthetic cases, refuses to overwrite results, and hard-stops at $0.50.

Background: [Jev research brief](../jev-decision-model-2026-09-18.md).
