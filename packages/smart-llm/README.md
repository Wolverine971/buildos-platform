<!-- packages/smart-llm/README.md -->

# Model routing

## September 24, 2026 refresh

- `GLM_53_MODEL` (`z-ai/glm-5.3`) replaces GLM 5.2 in tool routes, powerful/maximum JSON profiles, maximum text, and evaluation defaults. GLM 5.2 remains in the catalog only to price historical receipts.
- GLM 5.3 uses standard $1.40 input / $4.40 output per million tokens for conservative estimates; actual provider receipts remain authoritative. Reasoning is always enabled. Requests default to `low`; `medium` maps to `high` and `xhigh` to `max`. Explicit reasoning token budgets are preserved.
- Forced GLM tool choices use verified compatible providers (Morph, InferenceNet, Phala, Fireworks). Caller privacy, price, and provider restrictions are preserved. Ordinary requests require parameter support. Endpoint compatibility needs rechecking when this roster changes.
- `QWEN_38_27B_FREE_MODEL` (`qwen/qwen3.8-27b:free`) is available for explicit dev text, JSON, tool, and multimodal work. It is excluded from automatic profiles and requirement-based ranking. It has zero catalog token cost and provider price caps of zero.

Public metadata checked on September 24: [GLM 5.3](https://openrouter.ai/z-ai/glm-5.3), [GLM endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints), [Qwen free](https://openrouter.ai/qwen/qwen3.8-27b:free), [Qwen endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b:free/endpoints), [provider privacy](https://openrouter.ai/providers). ModelRun is listed as zero retention, so the usual ZDR policy remains enabled. No inference was needed to check this metadata.

## Selecting free Qwen in dev

Use the existing explicit model option:

```ts
import { QWEN_38_27B_FREE_MODEL } from '@buildos/smart-llm';

for await (const event of llm.streamText({
	model: QWEN_38_27B_FREE_MODEL,
	messages: [{ role: 'user', content: 'Summarize this development fixture.' }],
	userId
})) {
	// Handle the normal text, tool, done, and error events.
}
```

`getJSONResponse({ model: QWEN_38_27B_FREE_MODEL, ... })` also works, including with a spend limit: its reservation is zero. This endpoint advertises JSON schema output, but not `json_object`; generic JSON calls use the existing JSON prompt and parser. Explicit schema calls can use `response_format: { type: 'json_schema', ... }` through the request builder.

Selecting free Qwen removes paid model fallbacks from shared JSON/streaming calls and the web lane resolver. If the free endpoint disappears or rate limits the request, it fails without switching to a paid model. `tool_choice: none` is implemented by omitting the tools and tool-choice fields because ModelRun does not advertise that value; required and named tool choices are preserved.

For an explicit worker experiment, set `AGENTIC_CHAT_OPENROUTER_MODEL=qwen/qwen3.8-27b:free` and clear `AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS`. The worker rejects paid route/model fallbacks for this primary. Other services, including the independent reviewer, retain their own models and may still incur charges; choosing a free acting model does not make the entire Agentic Chat workflow free.

Live evaluations and `pnpm agentic:gate` still require explicit approval for each paid run under the repository's `AGENTS.md`. This refresh requires the paid gate before claiming live validation.
