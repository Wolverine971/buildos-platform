<!-- docs/technical/2026-04-10_agentic-tool-schemas-and-openai-tool-pattern-review.md -->

# Agentic Tool Schemas and OpenAI Tool Pattern Review

Date: 2026-04-10

## Scope

This document reviews current best practices for agentic tool schemas, compares OpenAI and Anthropic approaches, audits the current BuildOS implementation, and then reevaluates that audit in light of OpenAI's deferred-tool and namespace-based tool calling pattern.

The trigger for the reevaluation was this point:

> BuildOS was intentionally exploring a CLI-like pattern:
>
> 1. discover the tool
> 2. inspect its schema/help
> 3. execute the exact operation

That pattern is real and not inherently misguided. The question is whether BuildOS implemented it in the same shape OpenAI recommends, or whether it drifted into a more prompt-heavy protocol than necessary.

## Executive Summary

The revised conclusion is:

- The BuildOS gateway idea is directionally aligned with OpenAI's current deferred-tool pattern.
- The earlier critique that BuildOS should simply expose direct tools everywhere was too blunt.
- The real problem is not the existence of a gateway. The problem is that BuildOS currently collapses too much of the provider-facing schema into a generic `execute_op({ op, input })` contract and relies on prompt choreography to recover the missing structure.
- OpenAI's version of this pattern still keeps the actual tool schemas close to the model, via deferred tools, namespaces, and `tool_search`.
- Anthropic's guidance is compatible with the same high-level direction, but it is more opinionated about detailed descriptions, schema examples, and explicit tool metadata.

The best next move for BuildOS is not "remove the gateway." It is:

1. keep the gateway/discovery concept,
2. make canonical op schemas the typed source of truth,
3. expose a small set of high-frequency semantic tools directly,
4. use deferred loading or internal discovery for the long tail,
5. stop making the model reconstruct op-specific structure through a generic `input` object unless that indirection is strictly necessary.

## Official Sources Reviewed

### OpenAI

- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Using tools](https://developers.openai.com/api/docs/guides/tools)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Apps SDK: Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Apps SDK: Reference](https://developers.openai.com/apps-sdk/reference)

### Anthropic

- [Define tools](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

### BuildOS files reviewed

- [gateway.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts)
- [tool-schema.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts)
- [tool-help.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts)
- [tool-registry.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts)
- [tool-selector.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)
- [master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [openrouter-v2-service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/openrouter-v2-service.ts)
- [chat.types.ts](/Users/djwayne/buildos-platform/packages/shared-types/src/chat.types.ts)
- [README.md](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)
- [TOOL_API_MAPPING.md](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md)

## What OpenAI Actually Recommends

### 1. Small initial tool surface

OpenAI explicitly recommends keeping the initial tool surface small and deferring the long tail:

- keep the number of functions available at the start of a turn small,
- evaluate performance as the number of tools grows,
- use `tool_search` and deferred loading when the surface gets large.

This matters because BuildOS was trying to avoid dumping dozens of tools directly into the prompt. That instinct is correct.

Relevant OpenAI guidance:

- fewer than 20 functions initially is a soft target,
- use `tool_search` for deferred tools,
- tool definitions count against context and prompt cost.

### 2. Namespace and deferred loading pattern

OpenAI's function calling guide includes a namespace-based pattern where a namespace can contain multiple tools, and some tools can be marked with `defer_loading: true`.

That pattern looks like:

- a concise namespace description helps the model decide what family of tools to load,
- a detailed function description helps the model use the specific deferred tool once loaded,
- the model can search for and load tools only when needed.

This is the closest official OpenAI equivalent to the BuildOS "CLI-like" idea.

The important nuance is that OpenAI's deferred pattern still keeps the eventual callable tool as a real tool with its own exact schema. It does not flatten everything into one generic executor.

### 3. Clear tool descriptions and obvious schemas

OpenAI's current guidance emphasizes:

- clear, detailed names and descriptions,
- explicit parameter descriptions,
- examples and edge cases where needed,
- enums and object structures that make invalid states impossible,
- "principle of least surprise,"
- "pass the intern test."

This is consistent with BuildOS's current emphasis on workflow guidance, but OpenAI pushes harder on making the schema itself carry more of the burden.

### 4. Offload deterministic work from the model

OpenAI explicitly recommends not making the model fill arguments that the system already knows, and combining functions that are always called in sequence.

This is the most important corrective lens for BuildOS.

The BuildOS gateway pattern asks the model to:

1. decide it needs a tool,
2. search for the op,
3. inspect the schema,
4. package exact arguments into `input`,
5. call `execute_op`.

That is acceptable when the long tail is large, but it is more burden than OpenAI wants on common flows.

### 5. Typed helpers instead of hand-rolled schema drift

OpenAI's docs now explicitly show:

- `pydantic_function_tool(...)` in Python,
- `zodFunction(...)` in TypeScript,
- and SDK-level `tool({ parameters: z.object(...) })` patterns in the Agents SDK.

The docs do not require these helpers, but the pattern is clear: define typed schemas once, then generate the tool definition from that source of truth.

BuildOS is not doing that today.

### 6. Tool metadata and semantic hints

In the Apps SDK and MCP-shaped OpenAI tooling, OpenAI also documents semantic hints such as:

- `readOnlyHint`
- `destructiveHint`
- `openWorldHint`
- `idempotentHint`

These are not just cosmetic. They help the runtime and UX frame tool use properly, especially around confirmations and write safety.

BuildOS has internal read/write metadata, but it does not appear to expose equivalent semantic hints in its provider-facing tool descriptors.

## What Anthropic Recommends

Anthropic's current guidance is strongly aligned on the broad points:

- tool definitions should be explicit JSON Schema,
- descriptions should be very detailed,
- complex tools should include valid `input_examples`,
- namespacing matters,
- outputs should be high-signal and token-efficient,
- tools should be evaluated as agent tools, not just API wrappers.

Anthropic is more explicit than OpenAI on two things:

1. detailed prose in tool descriptions is the biggest lever,
2. optional `input_examples` are useful for nested or format-sensitive inputs.

Anthropic also exposes native tool-definition fields that matter here:

- `input_schema`
- `input_examples`
- `strict`
- `defer_loading`
- `allowed_callers`

So the BuildOS instinct to have an inspect-then-execute flow is still compatible with Anthropic. Anthropic just expects the tool layer itself to be richer and more explicit.

## Current BuildOS Implementation

### 1. Provider-facing schema shape

BuildOS currently standardizes on an OpenAI-style function-tool shape:

```ts
{
  type: "function",
  function: {
    name,
    description,
    parameters
  }
}
```

Relevant files:

- [chat.types.ts:193](/Users/djwayne/buildos-platform/packages/shared-types/src/chat.types.ts#L193)
- [openrouter-v2-service.ts:83](/Users/djwayne/buildos-platform/apps/web/src/lib/services/openrouter-v2-service.ts#L83)

This same shape is normalized and sent through OpenRouter, even for Anthropic-routed models.

### 2. Gateway mode in V2

When `AGENTIC_CHAT_TOOL_GATEWAY=true`, the model gets these four tools:

- `skill_load`
- `tool_search`
- `tool_schema`
- `execute_op`

Relevant files:

- [gateway.ts:11](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts#L11)
- [tool-selector.ts:26](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts#L26)
- [tool-selector.test.ts:17](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts#L17)

This means BuildOS is already trying to do progressive disclosure rather than exposing the whole raw tool set directly.

### 3. Canonical op layer

BuildOS keeps a registry of canonical operation ids like:

- `onto.task.update`
- `util.project.overview`
- `cal.event.create`

Relevant file:

- [tool-registry.ts:12](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts#L12)

This is good. It gives BuildOS a canonical semantic layer above legacy raw tool names.

### 4. Help/schema step

The current gateway protocol expects the model to:

1. orient from context and capabilities,
2. use `tool_search` if needed,
3. call `tool_schema`,
4. then call `execute_op({ op, input })`.

Relevant files:

- [master-prompt-builder.ts:232](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts#L232)
- [tool-schema.ts:51](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts#L51)
- [tool-help.ts:74](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts#L74)

This is the part that most resembles a CLI `help` or `man`-page interaction.

### 5. Schema quality today

The schemas are mostly hand-authored. During the audit:

- there were 81 `type: 'function'` definitions under the core tool definitions,
- only 8 had `additionalProperties: false`.

That means most BuildOS tool schemas are not tightly closed.

BuildOS also does not appear to use:

- `input_examples`
- provider-level `strict`
- `readOnlyHint`
- `destructiveHint`
- `openWorldHint`
- `idempotentHint`

as part of its active tool-definition pipeline.

### 6. Internal documentation drift

The live code and the internal docs are out of sync.

Current docs still say gateway mode exposes only:

- `tool_help`
- `tool_exec`

but current code and tests show:

- `skill_load`
- `tool_search`
- `tool_schema`
- `execute_op`

Relevant mismatches:

- [README.md:189](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md#L189)
- [TOOL_API_MAPPING.md:12](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md#L12)
- [tool-selector.test.ts:17](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts#L17)

This matters because the team can easily evaluate the current architecture against stale terminology.

## Reevaluation: Was the BuildOS Pattern Wrong?

No. Not in principle.

The right revised assessment is:

- the BuildOS pattern is a valid attempt at an OpenAI-style deferred-tool workflow,
- but it currently implements that workflow at the wrong abstraction boundary.

## What BuildOS got right

### 1. Progressive disclosure

BuildOS correctly identified that giving the model a huge flat tool catalog is weak.

This aligns with OpenAI's recommendation to keep the initial tool surface small and defer the long tail.

### 2. Canonical namespacing

BuildOS correctly moved toward canonical op ids like `onto.task.update`.

That aligns with both:

- OpenAI's namespace/deferred loading guidance,
- Anthropic's namespacing guidance.

### 3. Schema inspection before writes

BuildOS correctly recognized that write operations should often require a tighter "inspect before execute" loop.

That is compatible with both providers' recommendations around safety and malformed-call reduction.

## Where BuildOS diverges from the stronger OpenAI version

### 1. OpenAI defers real tools; BuildOS defers into a generic executor

This is the biggest gap.

OpenAI's deferred tool pattern still ends in a real tool whose exact schema is directly exposed to the model. BuildOS instead ends in:

```json
{ "op": "...", "input": { ... } }
```

inside a single generic `execute_op` tool.

That means the model is not selecting among precise callable tools at execution time. It is selecting a string op id and then packing an opaque object.

This loses some of the value of provider-native tool schemas.

### 2. OpenAI uses tool mechanics; BuildOS uses prompt mechanics

OpenAI's guidance is closer to:

- namespaces,
- deferred loading,
- `tool_search`,
- typed tool descriptors.

BuildOS currently relies more heavily on:

- system prompt protocol,
- registry help text,
- internal conventions about `input`.

This works, but it is a more fragile contract because more behavior sits in prompt instructions instead of tool descriptors.

### 3. BuildOS makes the model do too much routing work on common paths

OpenAI explicitly says to offload deterministic work from the model.

BuildOS currently makes even common workflows often pass through:

- discovery,
- schema lookup,
- generic executor packaging.

That is too much for hot-path operations like:

- workspace overview,
- project overview,
- task state updates,
- calendar create/update,
- common document edits.

### 4. Schema source of truth is weak

OpenAI's current examples lean toward typed definitions that generate tool schemas. BuildOS hand-authors many JSON-schema-like objects and then rewraps them through the registry.

That creates drift risk:

- type drift,
- provider drift,
- inconsistent schema strictness,
- inconsistent defaults and descriptions.

## Updated Conclusion

The refined conclusion is:

### Earlier conclusion that still holds

- BuildOS should tighten schema quality.
- BuildOS should use a typed schema source of truth.
- BuildOS should add better metadata and semantic hints.
- BuildOS should reduce prompt-only protocol where a schema or runtime contract can do the same job better.

### Earlier conclusion that should be corrected

The earlier conclusion that BuildOS should generally prefer direct tool exposure over the gateway pattern was too simplistic.

OpenAI does support a closely related pattern:

- small initial tool set,
- namespace-based organization,
- deferred loading,
- tool search.

So the BuildOS gateway concept is not a deviation from OpenAI. It is an incomplete version of that pattern.

## What BuildOS Should Update

### 1. Keep the gateway concept, but align it to real deferred tools

Do not throw away the discovery/help flow.

Instead:

- keep canonical ops and tool discovery,
- but let the model eventually execute real op-specific tools for the high-value long tail,
- or generate exact per-op callable tool definitions on demand instead of routing every execution through a generic `execute_op`.

This would preserve the CLI-like ergonomics while bringing the provider-facing layer closer to OpenAI's actual pattern.

### 2. Use a hybrid surface

Recommended structure:

- direct tools for the top 8-15 most common workflows,
- deferred or discovered tools for the long tail,
- internal registry/capability layer for documentation and selection,
- typed source of truth for all schemas.

This is the cleanest compromise between:

- OpenAI's small initial surface guidance,
- Anthropic's emphasis on ergonomic tools,
- BuildOS's need for a large internal capability graph.

### 3. Generate provider-specific adapters from one typed schema source

Suggested source of truth:

- `Zod` in TypeScript, or equivalent.

From that source, generate:

- OpenAI/OpenRouter function-tool descriptors,
- Anthropic-native `input_schema` descriptors,
- external agent `inputSchema`,
- internal op help/schema docs.

That removes most schema duplication.

### 4. Close schemas more aggressively

Today, too few schemas use `additionalProperties: false`.

BuildOS should:

- close object schemas wherever practical,
- prefer enums over freeform strings,
- make invalid states unrepresentable,
- align `required` and defaults consistently.

### 5. Add semantic tool metadata

BuildOS already knows whether a tool is read or write in internal metadata. That should be pushed outward into provider-facing tool descriptors where supported.

At minimum, map:

- read-only,
- destructive,
- open-world,
- idempotent.

### 6. Add examples for high-error tools

Anthropic is explicit here, and OpenAI also endorses examples/edge cases where needed.

BuildOS should add schema-valid examples for tools that currently fail often, especially:

- project creation,
- rich document updates,
- graph reorganization,
- tagging/ping flows,
- calendar mutations.

### 7. Fix internal documentation drift now

Before larger refactors, update the internal docs to reflect the actual live gateway tool names and protocol.

That is low-risk and will reduce conceptual confusion immediately.

## Recommended BuildOS Position

If BuildOS wants a crisp internal stance, it should be:

> BuildOS uses a deferred, namespace-driven tool pattern inspired by OpenAI's tool search approach.
> The gateway is intentional.
> However, the current implementation is too generic at execution time and too dependent on prompt protocol.
> We should evolve it toward typed canonical schemas, provider-native metadata, and a hybrid direct-plus-deferred tool surface.

That framing preserves the original architectural intent while still acknowledging what needs to change.

## Concrete Discrepancies to Track

| Area                       | Current BuildOS state                                                   | Best-practice gap                         | Recommended action                                                               |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Gateway execution shape    | Generic `execute_op({ op, input })`                                     | Too much structure hidden behind one tool | Expose direct tools for hot paths and/or generate per-op deferred callable tools |
| Schema source of truth     | Hand-authored JSON-schema-like objects                                  | Drift risk                                | Move to typed source of truth such as `Zod`                                      |
| Schema strictness          | Only a small minority of schemas are closed                             | Weak validation                           | Add `additionalProperties: false` broadly where safe                             |
| Provider-specific features | No visible `input_examples`, `strict`, or tool hints in active pipeline | Under-uses vendor capabilities            | Add provider adapters and metadata emission                                      |
| Internal docs              | Still describe `tool_help` + `tool_exec`                                | Stale architecture docs                   | Update docs to current gateway vocabulary                                        |
| Prompt burden              | Many safety/protocol rules live only in prompt text                     | Fragile behavior contract                 | Shift stable constraints into schema/runtime where possible                      |

## Final Assessment

The BuildOS pattern was not "cute but wrong."

It was a legitimate attempt at a schema-first, discover-then-execute tool workflow, and OpenAI's current docs validate that the broad direction is real.

But the implementation currently stops one layer too early:

- it has discovery,
- it has canonical names,
- it has schema lookup,
- but it still funnels execution through a generic wrapper that makes the model do more protocol work than OpenAI's stronger pattern requires.

So the right next step is evolution, not reversal.
