<!-- artifacts/openrouter-model-research-2026-09-24.md -->

# OpenRouter candidates for BuildOS — September 24, 2026

Recommendation: prioritize an explicit temporary Space Bunny dev option, a MiMo-V2.6-Pro evaluation, and an evaluation of regular GLM 5.3 as a replacement for the existing GLM 5.2 routes. Prime and FlashX variants mainly sell faster inference; measure completed-turn latency before paying their premium.

This is a research snapshot. No inference requests or paid tests were run, and this investigation made no runtime changes. Public catalog and endpoint metadata are preserved in `openrouter-model-research-2026-09-24.json` beside this report. Prices are USD per million uncached input/output tokens, before long-context tiers, caching charges, or other request fees.

## Named candidates

| Model / exact OpenRouter ID                                                                        | Input / output | Benchmark evidence                                                                                                                                                                 | BuildOS assessment                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Space Bunny Alpha](https://openrouter.ai/stealth/space-bunny-alpha) — `stealth/space-bunny-alpha` | $0 / $0        | No independent published benchmark found. OpenRouter describes a multimodal reasoning model with 1M context.                                                                       | Worth a temporary dev trial for synthesis and voluntary tool use. The endpoint advertises only `tool_choice: auto`; no forced tools or JSON-schema enforcement.                                                                  |
| [GLM 5.3 Prime](https://openrouter.ai/z-ai/glm-5.3-prime) — `z-ai/glm-5.3-prime`                   | $2.80 / $8.80  | Parent GLM 5.3 scores about 45 on the [AA Intelligence Index](https://artificialanalysis.ai/models/glm-5-3). No separate Prime evaluation found.                                   | Lower priority. OpenRouter describes a speed variant with the same capabilities. Text only, always-on reasoning; only low/high/max efforts. Current Alibaba endpoint lacks forced tools and schema enforcement.                  |
| [Qwen3.8 Max Prime](https://openrouter.ai/qwen/qwen3.8-max-prime) — `qwen/qwen3.8-max-prime`       | $4 / $12       | Parent 0902 model scores about 45 on [AA](https://artificialanalysis.ai/models/comparisons/qwen3-8-max-vs-qwen3-7-max). No separate Prime evaluation found.                        | Reserve for expensive synthesis or multimodal work where speed matters. Twice the regular Max token rates. JSON schema is supported; forced tool calls are not advertised by its current endpoint.                               |
| [Grok 4.7](https://openrouter.ai/x-ai/grok-4.7) — `x-ai/grok-4.7`                                  | $1.60 / $4.80  | [AA's evaluation](https://artificialanalysis.ai/articles/benchmarking-grok-4-7): about 46 Intelligence Index; strong professional work; Coding Agent Index 56 using Grok Build.    | Already configured in our quality, maximum, and judge routes. Useful for demanding analysis and research synthesis. High reasoning can consume many tokens; prices double above 200k prompt tokens.                              |
| [MiMo-V2.6-Flash](https://openrouter.ai/xiaomi/mimo-v2.6-flash) — `xiaomi/mimo-v2.6-flash`         | $0.14 / $0.28  | [Xiaomi's launch report](https://mimo.mi.com/docs/en-US/news/latest/v2-6) claims large agentic gains. I did not find a separate current AA evaluation of this exact Flash release. | Already catalogued for evaluation. Attractive for frequent tool work and multimodal processing; needs BuildOS measurements. DeepInfra has appeared since our catalog's launch comment, but its endpoint is currently unreliable. |
| [MiMo-V2.6-Pro](https://openrouter.ai/xiaomi/mimo-v2.6-pro) — `xiaomi/mimo-v2.6-pro`               | $0.435 / $0.87 | [AA](https://artificialanalysis.ai/models/mimo-v2-6-pro): about 46 Intelligence Index, roughly 47 output tokens/s in its measured workload.                                        | Strongest new paid candidate by capability per dollar. Try document synthesis, project planning, and complex tool sequences. The cost advantage needs confirmation on our prompts and reasoning budgets.                         |
| [GLM 5.3 FlashX](https://openrouter.ai/z-ai/glm-5.3-flashx) — `z-ai/glm-5.3-flashx`                | $0.37 / $1.25  | Parent Flash scores 42 on [AA](https://artificialanalysis.ai/models/glm-5-3-flash/). No separate FlashX evaluation found.                                                          | A latency experiment for the GLM Flash work we already do. Current Z.ai endpoint advertises auto tools only and JSON output without schema enforcement. About 5× our currently catalogued discounted Flash token rates.          |

These scores shortlist models; they do not establish BuildOS correctness. Reasoning effort, harness, token budget, and provider differ. Prime/FlashX parent scores are evidence about the underlying model family, not an independent validation of the accelerated endpoint. Grok's coding-agent score includes its native harness.

## Other useful candidates

- **Regular GLM 5.3:** the repo still routes some premium work through GLM 5.2. AA measures [45 versus 34](https://artificialanalysis.ai/models/comparisons/glm-5-3-vs-glm-5-2), with AutomationBench-AA 62% versus 28%. Its [standard rate](https://openrouter.ai/z-ai/glm-5.3) is $1.40/$4.40, with cheaper provider offers. Evaluate a suitable endpoint before paying for Prime. Set reasoning deliberately: the model defaults to max.
- **Qwen3.8 Flash:** [OpenRouter](https://openrouter.ai/qwen/qwen3.8-flash) lists $0.15/$0.47 and links to Qwen3.8-Flash-Next weights. [AA evaluates Flash-Next at 40](https://artificialanalysis.ai/models/qwen3-8-flash-next). Potentially useful for document and visual analysis. The OpenRouter endpoint has 1M context while AA describes the weights with 256k; treat those as distinct serving configurations. Current Alibaba route retains prompts and does not advertise forced tools.
- **Qwen3.8 27B free:** a useful named free comparison model when stealth rotates out. [OpenRouter](https://openrouter.ai/qwen/qwen3.8-27b:free) lists 262k context, schema output, and an AA score of 33.7 at xhigh. Benchmark quality is below the premium candidates, but sufficient to justify dev evaluation.
- **Nex-N2.5 Mini/Pro free:** both are in the live catalog ([Mini](https://openrouter.ai/nex-agi/nex-n2.5-mini:free), [Pro](https://openrouter.ai/nex-agi/nex-n2.5-pro:free)). Keep as secondary free candidates; I did not locate independent benchmark evidence sufficient to rank them here.

## The endpoint compatibility finding

The public [Endpoints API](https://openrouter.ai/api/v1/models/stealth/space-bunny-alpha/endpoints) exposes `supports_tool_choice`, which is more specific than the model-level `tools` flag. Snapshot results:

| Current route                     | Auto tools | Required tools | Named forced tool | JSON schema |
| --------------------------------- | ---------- | -------------- | ----------------- | ----------- |
| Space Bunny / Stealth             | Yes        | No             | No                | No          |
| GLM Prime / Alibaba               | Yes        | No             | No                | No          |
| Qwen Max Prime / Alibaba          | Yes        | No             | No                | Yes         |
| FlashX / Z.ai                     | Yes        | No             | No                | No          |
| Qwen Flash / Alibaba              | Yes        | No             | No                | Yes         |
| MiMo 2.6 Flash or Pro / DeepInfra | Yes        | Yes            | Yes               | Yes         |
| MiMo 2.6 Flash or Pro / Xiaomi    | Yes        | Yes            | No                | Yes         |

Our worker uses `required` in contract and repair phases and `none` for final responses. A model with voluntary tools alone cannot simply replace the complete acting or reviewing route. Space Bunny and FlashX also do not advertise `none`. Keep unsupported phases on a compatible model or fail clearly; do not silently weaken required tool behavior.

Provider eligibility also changes the usable model roster. [OpenRouter's provider list](https://openrouter.ai/providers) labels DeepInfra and Z.ai zero retention, Xiaomi 30-day retention, and Alibaba as retaining prompts. MiMo's new DeepInfra endpoints reported about 84–85% uptime over the previous 30 minutes and 87–90% over the previous day when fetched. This is a transient snapshot, but enough to defer automatic promotion.

Space Bunny's specific page says prompts may be retained but are not used for training. The generic provider directory labels Stealth differently for training; verify account routing eligibility before assuming `data_collection: deny` will work. Its [terms](https://openrouter.ai/terms/stealth) govern use. Only Space Bunny appeared in the current `stealth/` catalog namespace. The old Union Alpha page says its free period ended and identifies it as Pareto.

## A reusable dev option

Use one optional dev experiment entry, selected explicitly, whose current value can be `stealth/space-bunny-alpha`. Refresh public model and endpoint metadata at dev startup or on demand, with a short cache. Store the exact model ID, provider, capabilities, prices, and check time in the experiment record.

When a selected preview disappears, stop offering it and show why. A mode labelled free should check token and request pricing and exclude paid fallbacks. An ordinary dev mode may fall back to the configured stable model, but should display the actual model used. Rate-limit handling should respect provider responses; do not assume the documented `:free` quotas necessarily describe a stealth slug without that suffix. [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits)

Use anonymized fixtures for a preview that retains data. The shared SmartLLM service already has `evaluationOnlyAllowNonZdr`, while the older web lane resolver rejects models missing from its catalog. The worker accepts an acting model ID from its environment, but its tool phases still impose the compatibility requirements above. This needs a capability-aware dev adapter, not just an extra ID in the production fallback array.

Repository privacy detail to account for during implementation: shared SmartLLM defaults to `zdr: true`; the worker request builder currently sets `data_collection: deny` without automatically setting ZDR. These are different policies. Preserve the intended evaluation scope explicitly instead of assuming both paths behave identically.

Start with the same small set of project-create, task-update, document-edit, research-synthesis, and ambiguous-target cases for each candidate. Compare completed-turn time, tool correctness, schema failures, and billed cost. Keep the existing independent reviewer while trying an acting model. The earlier GPT-6 Luna paid gate remains pending; any further runtime promotion needs the repository's required validation.
