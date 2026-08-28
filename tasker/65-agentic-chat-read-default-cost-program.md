<!-- tasker/65-agentic-chat-read-default-cost-program.md -->

# 65 — Agentic Chat: read-by-default + cost/latency program (dual-audit remediation)

**Created 2026-08-27.** Unifies the two same-day audits into one work program:

- [Prompt audit](../docs/technical/reviews/AGENTIC_CHAT_PROMPT_AUDIT_2026-08-27.md) — 19 turns / 55 passes from `.prompt-dumps`; found tool schemas = 34.7% of all prompt tokens, control tools = 11.9% for 3 calls, caching broken by provider routing, plus 11 findings F1–F11.
- [Read-default investigation](../docs/technical/reviews/AGENTIC_CHAT_READ_DEFAULT_WRITE_CONTRACT_INVESTIGATION_2026-08-27.md) — traced one 121s read turn (session `e946d77c`); found the disposition/reviewer machinery = 71% of the turn's model cost, and an 89s serial-streaming defect after the model already finished.

**Why one program:** both audits measure the same root cause from different sides — **write-turn safety machinery is mounted and billed on every turn, including pure reads**. The prompt audit sees its _static_ cost (schemas on every pass); the investigation sees its _dynamic_ cost (2 forced extra passes + reviewer on every read turn). The costs multiply: the disposition passes are ~2 of the ~2.9 passes/turn that re-bill every seed token. One architecture change (WP-3) collapses both.

**Verdict + code verification (2026-08-27, this session):** every load-bearing claim in both docs was checked against source and held up. Details in the Landmines section. The prompt audit's F4 fix (phantom `tool_search` reference) is already committed (`ffbd9f1f2`) with drift tests.

---

## Work packages

### WP-1 — Fix serial final-text delivery + add timing spans

**The single largest wall-clock defect.** `turn-executor.ts:500-501` awaits each text delta's _durable delivery_ (`await abortable(queued.delivery, ...)`) before pulling the next delta from the provider stream. The publisher's 150ms/3KB batching (`streamPublisher.ts:29-31`) is defeated because there is never more than one pending delta. In the inspected turn: model finished in ~20s, user waited 121s — ~196 deltas × a flush/ack round-trip ≈ the observed ~89s gap.

- Decouple: enqueue deltas without awaiting per-delta durable delivery; keep backpressure via the existing `pressureRelieved` / soft-byte mechanism, and await full drain only at turn end (the terminal receipt already exists).
- Add timing spans per the investigation's rec #7: provider generation, semantic review, publisher queueing, durable ack, client render — so this class of regression is attributable immediately.
- Verify the ~88.6s attribution in prod telemetry after deploy (investigation follow-ups #1–2).

**Exit:** the inspected question class answers end-to-end in roughly provider time + seconds, not minutes; post-provider gap < ~2s; spans live.

### WP-2 — Pin (model, provider) per turn; cache prefix fixes

**The single largest token-cost lever, zero prompt edits.** Same model gets 71% cache hits on one upstream provider and 18% on another; nothing pins either across a turn's passes (prompt audit F3).

- On pass 1, record resolved `(model, provider)` from `onRouteObserved`; on passes 2..N send `models: [thatModel]` + `providerRouting: { order: [thatProvider], allow_fallbacks: false }`. Fall back only on real error and accept the cold prefix. Plumbing exists (`types.ts:81`, `smart-llm-service.ts:496`); the worker project-loop already uses `order` steering in prod (`generators.ts:565`).
- **Delete the false comment** at `smart-llm-service.ts:~1712-1718` ("OpenRouter does not support the provider parameter…") — verified wrong three ways in the prompt audit; it is the likely reason nobody pinned for four months.
- A/B `ignore: ['DigitalOcean']` for `deepseek-v4-flash` (18% vs 71% on the same model; echoes the project-loop timeout root cause).
- Round the prompt clock to the minute; drop `cache_age_seconds`; move `final_response_contract` into the contiguous static prefix.
- Check why `stealth/ox-alpha` served a production pass (audit Q5) — tasker 59 WP-7 was supposed to keep ox out of production fallback pools.
- Add `× passes` accounting + per-tool-schema budget line to `prompt-size-budget.test.ts` (F11) so the next drift is visible.

**Exit:** cache hit rate on passes 2+ of a turn > 80% in dump telemetry; comment deleted; DigitalOcean decision recorded.

### WP-3 — Read-by-default: move the write contract to the write boundary

**The two-birds move.** Adopt the investigation's recommended contract: _read by default; explicit user request = authorization for ordinary writes; contracts only at the mutation boundary._ This simultaneously deletes the forced passes (latency), unmounts the control-tool schemas from read turns (the 8.5% + 3.6% token line items — subsuming prompt-audit F1/F2), and removes the "Confirming no changes" UI noise.

Ordered sub-steps (order matters — see Landmines):

1. **Make the mutation boundary self-sufficient first.** The acting model chooses the route: direct mutation calls declare a simple request; `declare_turn_contract` declares a complex request. The worker admits one direct batch of at most three independent, ordinary mutations and deterministically redirects larger, mixed, dependent, destructive, organizational, or contract-only proposals to the complex route. Simple writes do not pay for an independent reviewer. Complex writes keep contract review, exact-batch review, and ledger fulfillment unchanged.
2. **Then remove from the default path:** `declare_read_only_turn`, its independent reviewer, the post-read forced disposition pass (`turn-provider.ts:1064-1069`), and the pre-final prose withhold gate (`turn-provider.ts:503-519`). Final prose on a no-write turn needs no classification.
3. **Mount write machinery on write intent**, not universally — `declare_turn_contract`'s schema (and `label`/`parent_label` create-ordering variant) rides only on turns/surfaces where a write is plausible; slim its description prose regardless (audit F1's diet still applies to write turns).
4. **Keep intact:** `request_turn_clarification` (real unresolved choices), operation-specific impact previews / `confirmation_token`, the `irreversible_delete_without_tombstone` deferral, and platform RLS/actor checks. No blanket "may I write?" prompts — the prompts already forbid reconfirming commissioned work.
5. **Presenter cleanup:** stop rendering internal control tools as user-facing activity (`agent-chat-tool-presenter.ts:1139-1144`, generic "Planning the first step…" in `steps.ts:24-45`). Show reads, real work phases, mutations, outcomes.
6. **Canary gate before ship:** re-run the ambiguity + restraint canaries behind the 2026-08-14 semantic-turn-contracts ADR — prove a guessed/ambiguous write still fails closed with zero read-turn review — plus the e2e battery's restraint scenarios (see Landmines re: tasker 56).
7. **Before/after measurement** on the inspected question (investigation follow-up #6): latency, passes, tokens, cost, visible activity.

**Exit:** a read turn = N reads + 1 answer pass, zero disposition/review passes; canaries green in both directions (guessed writes blocked, commissioned writes completed); presenter shows no protocol machinery.

**Implementation progress — 2026-08-27:**

- [x] **WP-3.1 local implementation:** direct mutation calls are the acting model's simple classification. The worker admits one batch of at most three independent target-free creates or an update to the already focused project, redirects existing-entity selection plus larger/mixed/dependent/contract-only proposals to `declare_turn_contract`, and forces a tool-free completion after a successful direct batch so the model cannot split a complex request across rounds. Complex contracts retain independent contract and exact-batch review.
- [x] **WP-3.2 local implementation:** the acting surface no longer exposes `declare_read_only_turn`; read-only approval execution and reviewer passes, post-read disposition forcing, and the pre-final prose gate are removed. A contract reviewer may still privately downgrade a false complex contract to read-only.
- [x] **WP-3.3 shipped + production-verified:** versioned production surfaces now omit `declare_turn_contract` from the opening provider pass. On write-capable surfaces the full signed/admitted surface remains inside the worker: an eligible simple batch executes directly, while a complex batch is withheld before execution and the next pass expands to the contract + clarification gate. Read-only production surfaces omit the impossible-to-use schema entirely. Project creation remains contract-first, and legacy/custom retained artifacts preserve eager behavior during their compatibility window. The shared contract schema was reduced from 3,092 to 2,732 serialized characters (-11.6%). On revision `9a99deb2a73ca47c3ca87a274046ac9072a7fcaf`, identical project canaries reduced the opening tool payload from 24,579 to 21,138 characters and production showed no contract on either opening pass, followed by a real `declare_turn_contract` only on the ambiguous complex route. Follow-up revision `91dbcc9cfa47c8110db24136409dee19a896858c` removed the dead schema from `global_basic` too: the exact global replay's opening tool payload fell from 10,285 to 7,204 characters and real prompt usage fell by 1,716 tokens across its two passes. Focused tests cover direct create, direct clarification, dynamic complex redirect, and read-only omission.
- [x] **WP-3.5 local implementation:** the web activity boundary suppresses acting/reviewer control calls and results, including legacy read-only controls, without leaking pending activity state. The generic first-tool cue is no longer an activity-log row; reads and real mutations remain visible.
- [x] **WP-3.6 production gate:** revision `c23d48814eef2f76c9519768a4758e748d5d0814` passed the exact two-turn `restraint-noop-and-ambiguity` worker/realtime canary on 2026-08-27. Mentioning a pricing migration while asking for project status produced one read and zero mutations. The follow-up "the email one's done" found three plausible email tasks, asked the user to choose, and produced zero mutations. The fixture cleaned up normally. Retained telemetry confirms the read turn used no reviewer; the ambiguous complex route alone invoked semantic review.
- [x] **WP-3.7 exact production replay:** the original sentence, "What's going on with my projects on a task level?", was replayed verbatim in global context on revision `91dbcc9cfa47c8110db24136409dee19a896858c` (turn `3e6ce5ac-e55c-499d-b00e-7cc9324d3dc9`). It completed in 8.064s with one `get_workspace_overview` read, two acting-model passes, zero reviewer/disposition passes, zero mutation reservation, 8,956 total raw tokens (8,792 prompt + 164 completion, including 4,096 cached prompt tokens), and $0.00052589 cost. Against the audited 121.36s / four-call / 31,836-token / $0.0043586 trace, the exact replay is ~93% faster, uses 50% fewer model calls, 72% fewer raw tokens, and costs ~88% less. The preceding same-release project canary completed in 11.950s and cost $0.00129946; its ambiguous follow-up materialized the contract/reviewer route and still wrote nothing. A temporary worker-specific simple-create gate also proved one `create_onto_task` executes directly with no contract or reviewer pass (turn `24c98d59-3c5e-42e6-96fb-e7228eb7475a`); Tasker 69 removes that duplicate after restoring the canonical scheduled/prioritized `task-create` gate.

The pre-worker `TRANSPORT_RENEGOTIATE` exposed by the older scheduled/prioritized task canary is
tracked separately in [tasker 69](69-agentic-chat-worker-email-action-false-renegotiation.md). Its
root cause is connected-email lexical enrichment misreading “email the beta list,” not the Tasker 65
worker write boundary.

### WP-4 — Prompt correctness + dedup (independent of WP-3, can run parallel)

The prompt audit's bug-class findings that survive WP-3 on their own:

- **F6:** gate `final_response_contract`'s three write bullets on `situation.writeIntent` — today they commission writes on surfaces with zero write tools. Mechanism (`WRITE_TURN_RULE_LINES`) already exists.
- **F7:** confidence floor on domain sensing; below it emit nothing. A wrong preload satisfies the skill-load gate and suppresses the correct lookup (Gmail search got a 1,045-token content-strategy playbook).
- **F5:** delete the `Current Tool Surface` prose list (second drifting copy of the `tools` array); keep only the discovery/direct split line.
- **F10:** one source per entity — drop `entity_refs.documents` where the Knowledge Map renders; drop the JSON blob entirely in `global` context; emit each UUID once.
- **Preload quality (investigation rec #8):** enrich the workspace preload with task rollups for task-status questions; trace the 44-vs-33 accessible-project discrepancy between preload and `get_workspace_overview` (follow-up #3).
- **F4 residue (verify before touching, likely correct as-is):** `surfaces.ts:13-20/:67` and `exact-entity-id.ts:28` are registry lists, not prompt text.

**Exit:** each box checked; size-budget test green with the new accounting.

### WP-5 — The rewrite + experiments (after WP-3, not before)

**Sequencing rule: do not rewrite the prompt English before WP-3 lands** — WP-3 deletes the disposition-gate prose and changes what the prompt must say; rewriting first means rewriting twice.

- **F9:** run `FASTCHAT_EVAL_SCAFFOLD_VARIANT=no-static-catalog` and `model-led-skill-discovery` against the e2e battery — the ablation harness is built and has never been run; the 24-row catalog is 10.7% of all tokens for ~26% hit rate.
- **F8:** implement decision D2 (below) — make the formatting rule positive and shaped, not a prohibition list the product violates 60% of the time.
- **H1–H5 + G1 heuristics rewrite** (audit §5): collapse 28 always-on directives into 5 heuristics + 1 routing gate; delete the `capabilities.*` identifier line. Gate on e2e battery parity.
- **F2 residue:** whatever `change_chat_context` becomes after D3 — shrink to ~100 tokens or demote to on-miss materialization.
- **Tool-result replay trimming** (audit Tier 4): results are 18% of spend and grow monotonically within a turn (one `skill_load` re-billed 3,225 tokens on three later passes). Audit estimates this ≈ the whole schema diet combined. Scope after WP-3 changes the pass structure.

---

## Coverage crosswalk — prompt audit (F1–F11 + open questions)

Use this table for the later per-doc re-review: every finding should be either here or deliberately absent.

| Finding                                           | Disposition                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| F1 `declare_turn_contract` 8.5%                   | **Subsumed by WP-3** (write-intent mounting) + WP-3.3 (schema diet on write turns). Do NOT do as standalone work. |
| F2 `change_chat_context` 3.6%, 0 calls            | WP-5 after decision **D3**.                                                                                       |
| F3 caching / provider routing                     | **WP-2** (all five fix items + false-comment deletion + ox check + Gemini-reporting caveat).                      |
| F4 phantom `tool_search` reference                | **DONE, committed `ffbd9f1f2`** with 2 drift tests. Registry-list residue → WP-4 (verify-only).                   |
| F5 tool-surface prose duplicate                   | WP-4.                                                                                                             |
| F6 write bullets on read-only surfaces            | WP-4.                                                                                                             |
| F7 domain preload misfires                        | WP-4.                                                                                                             |
| F8 formatting rule violated ~60%                  | Decision **D2** → WP-5.                                                                                           |
| F9 skill catalog 10.7% / three routing mechanisms | WP-5 (run the built A/B before deciding).                                                                         |
| F10 entities listed 2–3×                          | WP-4.                                                                                                             |
| F11 dump double-counting                          | WP-2 (accounting item).                                                                                           |
| Tier 4 tool-result replay growth                  | WP-5 (scope after WP-3).                                                                                          |
| Q1 is the contract earning 8.5%?                  | Answered by WP-3 design: yes for complex writes, mounted only there.                                              |
| Q2 `change_chat_context` UX path                  | Decision **D3**.                                                                                                  |
| Q3 prose vs structure                             | Decision **D2**.                                                                                                  |
| Q4 run the catalog A/B                            | WP-5.                                                                                                             |
| Q5 `stealth/ox-alpha` in fallback                 | WP-2 check item.                                                                                                  |

## Coverage crosswalk — read-default investigation (recs 1–8, follow-ups 1–6)

| Item                                                 | Disposition                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Rec 1 serial final-text delivery                     | **WP-1.**                                                               |
| Rec 2 simple writes at exact-call boundary           | WP-3.1.                                                                 |
| Rec 3 remove read-only declare/review/pre-final gate | WP-3.2.                                                                 |
| Rec 4 keep + slim contract for complex writes        | WP-3.3.                                                                 |
| Rec 5 keep clarification + high-impact confirmation  | WP-3.4 (invariant).                                                     |
| Rec 6 stop rendering control tools as activity       | WP-3.5.                                                                 |
| Rec 7 timing spans                                   | WP-1.                                                                   |
| Rec 8 preload task rollups + count discrepancy       | WP-4.                                                                   |
| Follow-up 1–2 confirm 88.6s gap / batching defeat    | WP-1 verification (mechanism already confirmed in source this session). |
| Follow-up 3 44-vs-33 projects                        | WP-4.                                                                   |
| Follow-up 4 smallest simple-write boundary           | WP-3.1.                                                                 |
| Follow-up 5 re-run ambiguity/restraint canaries      | WP-3.6 (ship gate).                                                     |
| Follow-up 6 before/after measurement                 | WP-3.7 (exit evidence).                                                 |

---

## DJ decisions

1. **D1 — accepted, with complexity-routed review.** Removing the read-only reviewer means no second model catches the acting model _silently answering instead of doing_ a commissioned write. Direct calls are the model's simple classification and are admitted only through a deterministic floor: one batch, at most three independent ordinary operations. `declare_turn_contract` is the complex classification and retains independent contract + exact-batch review. Silent non-completion remains an answer-quality defect for evals/telemetry; unsafe call shapes still fail closed at the tool boundary. WP-3.6 canaries remain a ship gate.
2. **D2 — prose vs structure (F8).** The prompt forbids headers; the product ships them 60% of the time. Recommendation: allow light structure for status/report answers, keep prose for conversational ones, state the rule positively.
3. **D3 — `change_chat_context`.** Zero calls in 19 turns for 3.6% of all tokens. Is there a real UX path (context zooming) that depends on it? If unsure: demote to on-miss materialization and watch telemetry rather than deleting.

## Recommended order

1. **WP-1** — biggest user-felt win, no design decisions, small diff.
2. **WP-2** — biggest cost win, no design decisions.
3. **D1–D3**, then **WP-3** (the real project; WP-4 can run in parallel with it).
4. **WP-5** last, after WP-3 settles what the prompt needs to say.

## Landmines

- **Gate coupling (historical, remediated by WP-3.1–3.3):** the old gate required all three disposition controls, so deleting `declare_read_only_turn` alone would silently disable pre-mutation gating. The current gate requires contract + clarification, while the deterministic direct-write classifier can expand a deferred opening surface to those controls before any complex mutation executes. Keep the admitted-vs-current-pass tool distinction intact; collapsing them would either re-bill the schema on reads or make the redirect unavailable.
- **Why the reviewer exists:** the 2026-08-14 ADR added read-only review after a canary showed the acting model dodging write review by _claiming_ read-only on an ambiguous commissioned mutation. The revised product decision accepts direct execution for a tightly bounded simple lane and retains the reviewer only for declared or deterministically detected complex writes. The worker, not prompt prose, enforces the lane boundary.
- **Restraint regression risk:** tasker 56's closure note warns "never delete the reviewer — it's why the worker beats legacy on restraint." This design deliberately narrows that reviewer to complex writes. Simple-write restraint now depends on model routing plus schemas, adapters, confirmation policy, RLS, and the deterministic three-operation/operation-class floor. The battery's restraint scenarios are therefore a hard gate in WP-3.6, not optional.
- **Adjacent open defects:** the 08-24 PC1 release-gate memo found two write-path defects (shell-only contract; control-round tool call = permanent turn kill) still awaiting DJ direction. WP-3 redesigns the same gate machinery — check whether the redesign subsumes or must separately fix them before closing either.
- **Cache-status reporting gap:** `describePromptCacheStatus` reads `usage.prompt_tokens_details.cached_tokens`; a provider that caches without reporting shows as `no cache`. Gemini's 0/9 may be a reporting gap — confirm before concluding anything about Gemini in WP-2.
- **Sample caveats:** 19 turns, one user, ~8 synthetic smokes. Token-attribution numbers are solid; call-frequency numbers (F2's zero, F9's hit rate) are directional — hence "measure, don't assume" on D3.
- **Do not undo what's already right** (audit §6): `situational-rules.ts` is the correct pattern (WP-3/WP-4 use it in more places, never replace it); negation rewrites, catalog-line diet, the size-budget ratchet, the dump section breakdown, and the never-run `scaffold-variant.ts` ablation harness all stay.
