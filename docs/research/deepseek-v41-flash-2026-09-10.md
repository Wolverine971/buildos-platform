<!-- docs/research/deepseek-v41-flash-2026-09-10.md -->
<!-- doc-status: point-in-time -->

# DeepSeek V4.1 Flash: integration and launch checks

September 10, 2026. **Added to BuildOS for explicit selection. Do not promote to automatic production routes yet: launch provider failures blocked both forced-tool and JSON verification.** The model itself is reachable through Novita for streamed text and auto tool calls.

## Why adoption is attractive

DeepSeek's release model card describes native image input, a million-token context, and a new encoder-decoder architecture intended to improve input-heavy agent workloads. Its reported maximum-effort results improve over V4 Flash on AutomationBench (54.8 vs 37.7), DeepSWE v1.1 (74.2 vs 54.4), and Terminal-Bench 2.1 (90.6 vs 82.7). These are vendor-reported results with specified harnesses, not independent rankings or measured BuildOS gains. Some knowledge/reasoning scores do not improve; this should not be described as universally better. [Official model card](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/README.md).

Use the permanent ID `deepseek/deepseek-v4.1-flash`, not the expired `expires-on-0910` preview ID.

## Implementation completed

- Added exported `DEEPSEEK_V41_FLASH_MODEL` and a separate catalog entry in [model-config.ts](../../packages/smart-llm/src/model-config.ts).
- Registered the new ID in the active model inventory so explicit requests survive lane and tool-capability filtering.
- Advertised JSON, structured output, tools, reasoning, images, and long-context capabilities based on provider metadata. Capability support remains provider-dependent.
- Used **$0.30 input / $1.20 output per million tokens** for estimates and reservations, matching DeepInfra/Novita. The first-party $0.15/$0.60 off-peak rate is not the dependable price for our required capabilities.
- Preserved V4 Flash's separate identity and historic pricing. Provider-returned `deepseek/deepseek-v4.1-flash-20260910` resolves to the new entry without conflating it with `deepseek/deepseek-v4-flash-20260423`.
- Marked V4.1 `not-default-production-routing`, which keeps requirement-based automatic selection from bypassing the launch gate. Existing default lanes, last-resort model, and Luna reviewer remain unchanged.

The heuristic speed/quality scores start at the V4 baseline, rather than treating vendor benchmark gains as measured routing scores.

Validation: **24 focused tests passed** across model configuration and selection; the shared package built successfully with CJS, ESM, and TypeScript declarations. Formatting and diff whitespace checks passed. No application deployment or environment change was performed.

## Live evidence

All data was synthetic. No external tools executed and no database or production records were changed. Provider requests retained `data_collection: deny`; third-party requests also used `zdr: true`. Each request had a 4,000-token output cap and 55-second timeout. No model fallback was allowed in the comparisons, and actual returned IDs were recorded. The long-context tool fixture had approximately 11,000 input tokens on the old model.

| Route / check                                                 | Result                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| V4.1 / DeepInfra: strict JSON, forced tool, vision, auto tool | All returned HTTP 429 with `engine_overloaded`                                                                              |
| V4.1 / DeepInfra: later required-tool retry                   | Same HTTP 429                                                                                                               |
| V4.1 / Novita: streamed auto tool                             | Correct task ID and complete tool arguments; 1.49s                                                                          |
| V4.1 / Novita: streamed text                                  | Correctly summarized task state and absent deadline; 1.60s                                                                  |
| V4.1 / Novita: JSON object                                    | HTTP 400; disabling reasoning did not resolve it                                                                            |
| V4.1 / first-party DeepSeek                                   | HTTP 404 from OpenRouter's data-policy filter, even without ZDR                                                             |
| Existing V4 Flash / DeepInfra                                 | Correct JSON rejection of a wrong-target write, correct long-context forced tool, and correct follow-up summary; 1.56–2.67s |

There were **13 requests**, including three old-model controls and ten new-model requests. Only two new-model requests completed inference successfully. This reflects route readiness, not a 20% model-quality score. There are too few successful V4.1 samples to compare reasoning quality or representative latency. Tests parsed raw OpenRouter streams; they did not run the full BuildOS worker, its streaming assembler, or production mutation/reviewer loops.

Current provider metadata explains the deployment risk: first-party DeepSeek and Novita advertise `tool_choice: required` as unsupported. DeepInfra advertises both required tools and JSON schema support, but could not serve our requests. Venice advertises those capabilities too, but had endpoint status `-2`, so it was not used. Both Novita and DeepInfra appeared in the public ZDR inventory. [Endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), [ZDR inventory](https://openrouter.ai/api/v1/endpoints/zdr).

The first-party data-policy rejection describes eligibility under OpenRouter's current settings; it is not a broader assertion about how DeepSeek handles every request. The application policy was not relaxed to get a successful call.

## Cost implications

At the compatible providers' advertised rates, an illustrative 15,000 uncached input + 1,000 billed output-token request costs **$0.00570**, versus **$0.00153** for V4 Flash on DeepInfra ($0.09/$0.18 per million). That is about 3.7× the uncached cost. Cache reads are advertised at $0.006/million for V4.1 versus $0.018/million for the old DeepInfra route, so cache-heavy results may differ substantially. Output includes billed reasoning tokens; actual token usage and provider cost should decide the comparison. Saved price/capability snapshot.

## Fastest credible rollout

The model is available for explicit local/API selection after the shared package rebuild. Novita is the only provider that completed the text and auto-tool checks. This is suitable for a bounded development trial; JSON, forced-tool, and vision behavior remain unverified or failing.

Before making it the chat default, rerun forced-tool and structured-JSON checks on a healthy compatible route, then run representative worker cases covering long-context task targeting, multi-round history, write/review boundaries, and streamed final responses. Keep the existing model as fallback and Luna as the reviewer.

The dedicated worker reads its model from environment variables; changing shared catalog arrays alone will not switch the deployed chat service. Once those checks pass and the catalog update is deployed, the intended acting-model configuration is:

```dotenv
AGENTIC_CHAT_OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash
AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS=deepseek/deepseek-v4-flash
AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna
```

Retain any existing reviewer fallback policy. For rollback, restore the acting model and its fallback list to the exact pre-rollout values. These variables have **not** been changed. The catalog change is deliberately independent of the other in-progress worker refactors in this checkout.

The raw probe outputs and scripts were deleted on 2026-09-24; the figures above are the record.
