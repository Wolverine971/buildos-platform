<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-D-transport-and-models.md -->

# WP-D — transport and models

Package: `D-transport-and-models` from
`docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/work-packages.json`.
Findings: F76, F77, F78, F80, F81, F50 (client half), F104, F109.

Files changed (all left unstaged):

- `apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts`
- `apps/worker/src/workers/agentic-chat/host/config.ts`
- `apps/worker/src/workers/agentic-chat/host/bootstrap.ts`
- `apps/worker/src/workers/agentic-chat/effects/pending-effects.ts` (shared new module; WP-E wrote the
  per-turn `AgenticChatPendingEffects` class, this package appended the turn-keyed
  `AgenticChatPendingEffectsRegistry` + `AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY` singleton)
- `apps/worker/.env.example`
- `apps/worker/tests/agenticChatOpenRouterClient.test.ts`
- `apps/worker/tests/agenticChatBootstrap.test.ts`
- `apps/worker/tests/agenticChatConfig.test.ts` (new)

## Per finding

### F76 — hard route pin fails one pass in 47% of turns (P1) — FIXED (verifier version)

`openrouter-client.ts`

- `applyTurnRouteHealth`: the pin now sends `provider.order: [pinnedSlug]` only; the route's own
  `allow_fallbacks` (true) stays in force. The pin is a preference, not a constraint.
- `openRoute`: deleted `pinnedEndpointUnavailable`. A 404 on a pinned pass is now what it says:
  no endpoint serves the model (OpenRouter already tried the fallbacks), so it is permanent
  (`retryable: false`) and the pin is released through the existing failure path.
- `attributedProviderSlug`: the `allow_fallbacks === false && order.length === 1` branch is gone.
  Timeout attribution is kept in the narrower form the verifier allowed: the pre-stream timeout
  thrown from `openRoute` now carries `orderedProviderSlug(route)` (the single ordered endpoint,
  when the request names exactly one) as its `providerSlug`. Rejections (4xx/5xx) name only what
  the gateway named (`error.metadata.provider_name`) or a single-entry `only`. The 09-02 behaviour
  "excludes the pinned provider the request timed out on" survives.
- Side effect noted by the verifier (pin-caused 404 added the model to `failedModels`) is now
  correct rather than spurious: with fallbacks allowed, a 404 really is model evidence.

Tests (`agenticChatOpenRouterClient.test.ts`):

- `releases a successful provider pin after HTTP $status` — split into `{503, retryable:true}` and
  `{404, retryable:false}`; pinned request asserts `order: ['warm-provider'], allow_fallbacks: true`;
  post-release request asserts no `ignore` (nothing blamed on no evidence).
- Flipped `allow_fallbacks: false` → `true` on the pinned request in: tool_choice=none release
  (x2), disabled-tool response, semantic rejection (x2), timeout attribution (`per-turn route
health`).
- New: `does not blame the ordered endpoint for an unnamed rejection on a pinned request` — a
  502 with no provider metadata on a soft-pinned request releases the pin and ignores nothing.

Canary owed (not runnable here): same-provider continuation rate from
`evidence/lane-K-pin-snapshot-cache.mjs` (baseline 31/57 single-provider turns), plus the count
of `provider_attempt_ended` rows with `error_class = provider_retryable_error` on a pinned pass
(should fall to ~0 for 404s).

### F77 — pin re-requests the provider's snapshot model id (P1) — FIXED (verifier version)

`openrouter-client.ts`

- New `configuredModels` set (every `route.model` + `fallbackModels` across routes) and
  `routingModel(reported, route)`: returns the reported model only when it is a configured id,
  else `route.model` (the id actually requested).
- Used for every routing-state call: `observeTurnRouteSuccess` (pin model, preferredModels),
  `lastResponse.model` (semantic-rejection steering), and the three `observeTurnRouteFailure`
  calls on an active response. Receipts are untouched: usage rows and `provider_attempt_ended`
  payloads still carry `state.modelUsed` (the snapshot id).
- Deliberate extension beyond the verifier's "keep lastResponse untouched": `lastResponse.model`
  and the failure-path model use the same resolved identity as the pin, because
  `rejectRepeatedInvalidToolResponse` releases the pin by `pin.model === response.model`. With a
  snapshot id there the release only worked when the provider slug matched, and `failedModels`
  collected ids no request could ever name. The resolved-fallback affinity test at `:914` is
  preserved (a configured fallback id is still pinned as itself).

Test: `pins the configured model when the provider reports a weight snapshot id` — reported
`deepseek/deepseek-v4-flash-20260423` for requested `deepseek/deepseek-v4-flash`; second request
asks for the canonical id with `order: ['alibaba']`; usage and lifecycle receipts keep the
snapshot id; a semantic rejection then releases the pin and ignores `alibaba`.

### F78 — provider order half dead, cheap endpoints unused (P2) — FIXED (verifier version)

`config.ts`

- `DEFAULT_OPENROUTER_PROVIDER_POOL` = `['deepinfra', 'gmicloud', 'alibaba', 'streamlake']`
  (StreamLake last per the 08-27 tail note), `allow_fallbacks: true` kept, new
  `ignore: ['azure']`. DigitalOcean stays outside the order and is not ignored.
- Comment rewritten with the measured reason (per-pass p50 by provider, Azure 112 ms/token, the
  two dead names, GMICloud never served) and the stale "Alibaba is long-tail" contradiction
  removed.

`bootstrap.ts` (interplay): the reviewer route no longer inherits the acting route's `ignore`.
That inheritance was dormant (the acting route had no `ignore`) and would have removed Azure,
the reviewer's own second endpoint. Provider evidence is per model, so the reviewer carries only
`allow_fallbacks: true` and its own `order` (Luna: `['openai', 'azure']`). The existing bootstrap
test that asserted `ignore: ['digitalocean']` carried over was flipped with the reason in-line.

Tests: new `agenticChatConfig.test.ts` (routing object exact; no `only`; no dead names);
bootstrap: `does not carry the acting route provider ignore onto the reviewer`, `derives the
reviewer route from the shipped acting defaults without losing Azure`.

Canary owed: per-provider p50/p90 per pass for a day (lane-K usage report), especially StreamLake
p90 and GMICloud (no observed calls yet, so its latency is unknown).

### F80 — reviewer latency tripled; reasoning effort unset (P1) — FIXED (verifier version)

`openrouter-client.ts` `requestBody`: `reasoning: { effort: 'low', exclude: true }` when
`passRole` is `contract_review` or `mutation_review`; `acting`, `repair`, `final_response` and
`research_review` keep `{ exclude: true }`. Luna's smart-llm policy has no reasoning floor, so the
value is forwarded verbatim. (If the reviewer ever fell back to Gemini 3.7 Flash the smart-llm
`minimumReasoningEffort: 'medium'` policy would not apply because policy keys on the primary
model; cosmetic given 43/43 calls on OpenAI, and the fallback chain is now explicit-policy
territory per F81.)

`bootstrap.ts`: `AGENTIC_CHAT_SEMANTIC_REVIEWER_MAX_TOKENS` confirmed at 4,000 — a ceiling that
only bills generated tokens; audit-window p50 completion 767 tokens (reasoning included); a
lower cap risks the 08-20 mid-`arguments` truncation again. One comment line records the
reconfirmation.

Test: `asks for low reasoning effort on contract and mutation reviews only`.

Canary owed (must run before this is kept, per the finding): replay the 09-04 reviewed-write
battery plus the three-email-task restraint case and require identical approve/revise/clarify
decisions; record reviewer completion/reasoning tokens before and after so the
reference_candidates-vs-effort split becomes measured.

### F81 — default reviewer fallback chain contains a documented bad reviewer (P2) — FIXED (note version)

`bootstrap.ts`: `AGENTIC_CHAT_SEMANTIC_REVIEWER_DEFAULT_EXCLUDED_MODELS = {GLM 5.3 Flash}` filters
the default candidate list (`[Luna, ...powerful, ...maximum]`) before tool-capability and
acting-model filtering. The pools are not replaced (the `fails at startup` test at `:237` still
builds its acting route from them and still throws). An explicit policy may still name GLM 5.3
Flash — the operator has evaluated it then (the `:118` explicit-GLM test is unchanged).

`.env.example`: reviewer block now describes the default (Luna, OpenAI→Azure, pool minus
replay-failed models), says pool fallbacks were never evaluated as reviewers, and recommends the
explicit policy (`AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna`,
`AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS=` empty) on the production service — the verifier's
env-only route. Setting those two variables on Railway is an operator action, not done here.

Test: `keeps the documented bad reviewer out of the default fallback chain`.

### F50 — observation rows on the tool critical path (P1) — FIXED (client half, verifier version)

`openrouter-client.ts`: `observeProviderAttempt` is now synchronous fire-and-forget. It starts
`persistProviderAttempt` (the old body; never rejects) and files the promise into the turn's
pending set: `pendingEffects.forTurn(turnRunId).enqueue(promise)`. None of the four call sites
(`started` before fetch, `ended` on pre-stream failure, on truncation, on success/violation, and
in the catch) await it any more. Usage receipts (`account`) are still awaited — terminal billing
must see committed usage.

`pendingEffects.ts`: WP-E wrote the per-turn `AgenticChatPendingEffects` (enqueue/size/drain →
boolean). This package appended `AgenticChatPendingEffectsRegistry` (`forTurn(turnRunId)`,
`size(turnRunId)`, `drain(turnRunId, deadlineMs)` which also forgets the turn; 256-turn LRU
bound for turns that never finalize) and the process-wide `AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY`.
The client accepts `ports.pendingEffects` (a `Pick<Registry, 'forTurn'>`) and defaults to the
singleton. WP-E's `executorEffects.ts` already consumes the same registry API
(`forTurn`/`drain`, same default) and calls `drainPendingEffects` before the terminal fence at
`turn-executor.ts:2622` and `:2958`, so both sides share one set per turn with no composition
change.

Why the drain must stay before the terminal fence: `persist_agentic_chat_provider_attempt_observation`
(migration `20260828221405`) updates `chat_turn_runs.llm_pass_count` for a successful
`provider_attempt_ended` and `RAISE`s `agentic_chat_provider_pass_count_compare_and_set_lost` when
the turn is no longer `running` at that generation — which rolls back the row. Draining first
closes that race.

Tests: `files attempt receipts as pending effects and never waits for them on the pass` (both
receipts started, neither settled, pass completes; drain settles them) and `reports a failed
attempt receipt through the error port without touching the pass`.

### F104 — per-turn provider degradation latch is dead machinery (P2) — SKIPPED (no owned file)

Every line the finding and verifier list lives outside this package: `providerCapacity.ts`,
`capacity.ts`, `provider/provider-pass.ts`, `provider/turn-provider.ts` (not the F15/F19
regions WP-F owns), `provider/contracts.ts`, `README.md`, and three test files. Nothing in
`config.ts`, `bootstrap.ts` or `openrouter-client.ts` references the latch. Exact deletion list
is under Handoffs.

### F109 — reasoning-event extraction is dead downstream (P3) — FIXED in the client; downstream handed off

`openrouter-client.ts`: removed `extractReasoning`, `stringifyReasoning`, and the
`events.push({ type: 'reasoning', ... })` in `parseSseLine`. Reasoning tokens are still accounted
from the usage receipt (`reasoningTokens`). The client never emits a `reasoning` event now; the
consumers' guards are dead code until the union member is removed (Handoffs).

Test: the first client test now feeds `reasoning`, `reasoning_content` and `reasoning_details`
deltas and expects `[text, done]` only, and asserts no reasoning text reaches lifecycle rows.

## Tests run

| Command                                                                                       | Result    |
| --------------------------------------------------------------------------------------------- | --------- |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatOpenRouterClient.test.ts`     | 69 passed |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatBootstrap.test.ts`            | 27 passed |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatConfig.test.ts`               | 2 passed  |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatOpenRouterPromptDump.test.ts` | 4 passed  |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatWebSearchReview.test.ts`      | 12 passed |

No typecheck run (integration agent). Files I could not edit and that will fail until the
handoffs land: `agenticChatTurnProvider.test.ts` (3 `allow_fallbacks: false` assertions) and
`agenticChatConsumer.test.ts` (old provider order).

## Handoffs (exact changes in files this package does not own)

1. **F76 pinned-request assertions** — `apps/worker/tests/agenticChatTurnProvider.test.ts`
   lines 6289, 6294, 7022: `allow_fallbacks: false` → `allow_fallbacks: true` (the pinned
   request still carries `order: ['deepinfra']` / `order: ['alibaba']`; nothing else changes).
2. **F78 config assertion** — `apps/worker/tests/agenticChatConsumer.test.ts` lines 288–291
   (`parses an independently bounded two-slot queue policy`, `toEqual`): replace
   `providerRouting: { allow_fallbacks: true, order: ['deepinfra', 'deepseek', 'alibaba', 'cloudflare'] }`
   with
   `providerRouting: { allow_fallbacks: true, order: ['deepinfra', 'gmicloud', 'alibaba', 'streamlake'], ignore: ['azure'] }`.
3. **F109 downstream** (owner: whoever holds `provider/contracts.ts`; WP-F touches
   `turn-provider.ts` for F15/F19 only):
    - `apps/worker/src/workers/agentic-chat/provider/contracts.ts:43` — delete the
      `| { type: 'reasoning'; reasoning?: string; reasoning_details?: unknown[] }` union member.
    - `apps/worker/src/workers/agentic-chat/provider/provider-pass.ts:55` — delete
      `if (event.type === 'reasoning') continue;`.
    - `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:1196-1200` — delete the
      `if (event.type === 'reasoning') { ... continue; }` block; `:1598` — change
      `if (event.type === 'reasoning' || event.type === 'text') continue;` to
      `if (event.type === 'text') continue;`; `:1748` — delete
      `if (event.type === 'reasoning') continue;`.
    - `apps/worker/tests/agenticChatTurnProvider.test.ts:707` — remove the
      `{ type: 'reasoning', reasoning: 'private chain' },` fixture line (a type error once the
      variant is gone).
    - Optional: delete the never-populated `reasoningChannelChunks`/`reasoningChannelChars` fields
      in `packages/agentic-chat-runtime/src/loop/shared.ts:130-135`.
4. **F104 latch deletion** (verifier version; no owner in this pass):
    - `apps/worker/src/workers/agentic-chat/provider/provider-capacity.ts`: delete `degradedUntilMs` from
      `AgenticChatProviderCapacitySnapshotV1` (:11), the `degradedUntilByTurn` map (:34),
      `markTemporarilyUnavailable` (:79-85) and `markAvailable` (:87-90), the sweep and
      `degradedUntilMs` in `getSnapshot` (:92-110; `available` becomes
      `configured && activeRequests < concurrency`), the `'temporarily degraded'` branch of the
      `acquire` error message (:58-64), and `assertTurnRunId` if unused; drop the `turnRunId`
      parameter of `acquire`/`getSnapshot` (keep `AgenticChatProviderCapacityError` and the lease).
    - `apps/worker/src/workers/agentic-chat/host/capacity.ts:162-167`: `validProviderSnapshot` loses the
      `degradedUntilMs` clauses; `available === (configured && activeRequests < concurrency)`.
    - `apps/worker/src/workers/agentic-chat/provider/provider-pass.ts`: remove the `capacity`
      (:34) and `retryableFailureCooldownMs` (:35) parameters of `streamBufferedProviderPass`, the
      `event.cause !== 'tool_arguments_truncated'` carve-out and `markTemporarilyUnavailable` call
      (:58-63), and the `AgenticChatProviderCapacity` import (:3).
    - `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`: remove the
      `retryableFailureCooldownMs` constructor arg and its validation (:269-280), pass only
      `(request, client)` at :1114-1119, delete the `markTemporarilyUnavailable` blocks at
      :1209-1214 and :1757-1762 (the `throw`/continue that follows stays), and the
      `markAvailable` calls at :1481 and :1811. `capacity.acquire(request.turnRunId)` at :311
      becomes `capacity.acquire()`.
    - `apps/worker/src/workers/agentic-chat/provider/contracts.ts:60-67`: the `cause` doc comment
      no longer needs the "must not degrade the turn's capacity window" sentence; keep `cause`
      itself (the client still emits it and the truncation retry reads it).
    - `apps/worker/src/workers/agentic-chat/README.md:82`: drop "cooldown marking" from the
      `provider-pass.ts` line.
    - Tests: `apps/worker/tests/agenticChatProviderCapacity.test.ts` — delete
      `latches retryable provider degradation for a bounded cooldown` (:43-68) and the
      `markTemporarilyUnavailable('turn-a', 0)` bound test (:92); drop `degradedUntilMs: null` from
      snapshot expectations (:22, :59, :66). `apps/worker/tests/agenticChatCapacity.test.ts` —
      drop `degradedUntilMs: null` at :66, :148, :181, :201, :248, :263.
      `apps/worker/tests/agenticChatTurnProvider.test.ts` — remove the `cooldown` spies and
      `expect(cooldown).not.toHaveBeenCalled()` at :6251/:6313 and :6975/:7028, and the
      `degradedUntilMs` assertion at :9145-9146.
    - `apps/worker/src/workers/agentic-chat/host/composition-root.ts:285-295`: if the adapter's
      positional `retryableFailureCooldownMs` is passed there, drop that argument.
5. **F50, WP-E** — nothing further required: `executorEffects.ts` already uses
   `AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.forTurn/drain` and the executor drains before the
   terminal fence. Two notes: (a) any test that injects its own registry into the executor must
   inject the same instance into the `AgenticChatOpenRouterClient` (`ports.pendingEffects`) or
   the client's receipts drain through the singleton instead; (b) `drain()` forgets the turn, so
   call it once per turn after the last provider pass — a receipt filed after the drain is only
   reachable through a new `forTurn` set until the LRU bound evicts it.
6. **Operator (DJ), F81 env-only half** — on the Railway agentic-chat service set
   `AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna` and `AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS=`
   (empty) so the reviewer has no pool-derived fallbacks at all. `config.ts:283-306` already
   parses both; `agenticChatBootstrap.test.ts:118-143` covers the shape.

## Behaviour changes

- Pinned passes now send `provider.order: [slug]` with fallbacks allowed. OpenRouter routes a
  pass the pinned endpoint cannot serve to another endpoint inside the request (cold cache, no
  failed receipt) instead of returning 404 and forcing a client-side retry. A 404 on a pinned
  pass is now permanent (`retryable: false`).
- After a pre-stream 4xx/5xx on a pinned request that names no provider, nothing is added to
  `provider.ignore` (previously the pinned slug was). Pre-stream timeouts on a single-ordered
  request still ignore that endpoint.
- The turn's pin, `preferredModels`, `failedModels` and `lastResponse` only ever hold configured
  model ids; a provider's snapshot id never becomes a request `model`. Usage rows and attempt
  receipts still record the reported (snapshot) id.
- Acting route provider order is `deepinfra, gmicloud, alibaba, streamlake` with `ignore: ['azure']`.
- The semantic reviewer route no longer inherits the acting route's `ignore`.
- Contract and mutation review requests send `reasoning.effort: 'low'`.
- Default reviewer fallback chain excludes `z-ai/glm-5.3-flash` (now
  `[gemini-3.7-flash, glm-5.2, deepseek-v4-pro]` if all tool-capable and not acting).
- `provider_attempt_started` / `provider_attempt_ended` observation RPCs are no longer awaited on
  the pass; they land during the executor's pre-fence drain. Each pass drops two serial telemetry
  round trips (one before the request opens, one before `done`).
- The client never emits `{ type: 'reasoning' }` events.

## Deliberately left alone

- Usage receipts (`account` → `llm_usage_logs`) stay awaited before `done`: terminal billing
  reads committed usage (`bootstrap.ts` composition comment); the note scoped F50 here to
  `observeProviderAttempt`.
- `AGENTIC_CHAT_SEMANTIC_REVIEWER_MAX_TOKENS` stays 4,000 (see F80).
- DigitalOcean is not ignored (08-27 decision stands; nothing in the window contradicted it).
- No in-code replacement of the JSON profile pools for the reviewer (verifier: would break the
  `fails at startup` test); exclusion-by-set instead.
- `research_review`, `acting`, `repair`, `final_response` reasoning effort unchanged (verifier).
- The two `contracts.ts` items (F109 variant, F104 `cause` comment) and the whole F104 deletion —
  not owned; handed off with exact lines.
