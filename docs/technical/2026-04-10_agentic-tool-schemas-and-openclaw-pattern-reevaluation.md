<!-- docs/technical/2026-04-10_agentic-tool-schemas-and-openclaw-pattern-reevaluation.md -->

# Agentic Tool Schemas, BuildOS Audit, and OpenClaw Pattern Reevaluation

Date: 2026-04-10

This memo supersedes the earlier OpenAI-titled draft for the specific question of whether BuildOS's "discover -> inspect -> execute" pattern matches the system you were actually aiming at. After the clarification, the more relevant comparison target is OpenClaw, not OpenAI's plain function-calling examples.

## Scope

This document does four things:

1. preserves the earlier OpenAI and Anthropic findings as background,
2. documents how OpenClaw actually structures tool calling,
3. compares that pattern to the current BuildOS implementation,
4. recommends what BuildOS should keep, change, or tighten.

The core user intent being evaluated is this pattern:

1. identify the right tool or capability,
2. inspect how to use it,
3. execute the exact operation with the exact arguments.

That pattern is not wrong. The real question is where the "how to use it" information should live, and whether execution still ends in a real typed tool schema or in a generic meta-protocol.

## Executive Summary

The corrected conclusion is:

- BuildOS's overall instinct was closer to OpenClaw than to vanilla OpenAI function calling.
- OpenClaw absolutely does separate "learn how to use this" from "execute this," but it does so with real typed tools plus on-demand skill and docs reads.
- BuildOS currently pushes too much of that flow into a custom tool protocol: `skill_load`, `tool_search`, `tool_schema`, then `execute_op({ op, input })`.
- The main discrepancy is not the discovery step. The main discrepancy is that BuildOS collapses final execution into a generic executor, while OpenClaw still lets the model call real tools with real schemas.
- If BuildOS wants to be more OpenClaw-like, it should keep the gateway and skill ideas, but move toward direct or deferred-loaded op-specific tool schemas and away from a universal `execute_op` endpoint.

Short version:

- The concept was valid.
- The implementation is too protocol-heavy.
- OpenClaw's pattern is "real tools + on-demand playbooks/docs."
- BuildOS's current pattern is "meta-tools + generic executor."

## Sources Reviewed

### OpenClaw

- [Tools and Plugins](https://docs.openclaw.ai/tools/index)
- [Skills](https://docs.openclaw.ai/tools/skills)
- [Creating Skills](https://docs.openclaw.ai/tools/creating-skills)
- [System Prompt](https://docs.openclaw.ai/concepts/system-prompt)
- [Pi Integration Architecture](https://docs.openclaw.ai/pi)
- [OpenClaw repository: `src/agents/tool-catalog.ts`](https://github.com/openclaw/openclaw/blob/main/src/agents/tool-catalog.ts)
- [OpenClaw repository: `src/agents/pi-embedded-runner/tool-schema-runtime.ts`](https://github.com/openclaw/openclaw/blob/main/src/agents/pi-embedded-runner/tool-schema-runtime.ts)
- [OpenClaw releases](https://github.com/openclaw/openclaw/releases)

### Background sources retained from the earlier memo

- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI Using tools](https://developers.openai.com/api/docs/guides/tools)
- [OpenAI Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Apps SDK: Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Anthropic: Implement tool use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
- [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

### BuildOS files reviewed

- [gateway.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts)
- [tool-selector.ts](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)
- [tool-selector.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts)
- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [tool-help.ts](../../apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts)
- [tool-schema.ts](../../apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts)
- [tool-registry.ts](../../apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts)
- [openrouter-v2-service.ts](../../apps/web/src/lib/services/openrouter-v2-service.ts)
- [chat.types.ts](../../packages/shared-types/src/chat.types.ts)
- [README.md](../../apps/web/docs/features/agentic-chat/README.md)
- [TOOL_API_MAPPING.md](../../apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md)

## What OpenClaw Actually Does

### 1. Tools are real typed functions at the model boundary

OpenClaw's docs are explicit: tools are what the agent calls, and a tool is a typed function the agent can invoke. The model sees structured function definitions sent to the model API. This is described directly in [Tools and Plugins](https://docs.openclaw.ai/tools/index).

That matters because it means OpenClaw does not use a generic "tool executor" as the primary provider-facing abstraction. The tool that reaches the model is still the real tool.

The built-in tool surface includes direct tools such as:

- `read`, `write`, `edit`, `apply_patch`
- `exec`, `process`, `code_execution`
- `web_search`, `web_fetch`, `x_search`
- `browser`
- `sessions_*`, `subagents`, `session_status`
- `cron`, `gateway`

The [Pi Integration Architecture](https://docs.openclaw.ai/pi) page also makes this concrete: OpenClaw creates an agent session with `tools: builtInTools` and `customTools: allCustomTools`, then the SDK handles the full agent loop, including tool execution.

### 2. Skills teach the agent when and how to use tools

OpenClaw separates execution from instruction. Its skills system exists specifically to teach the agent how and when to use tools:

- [Skills](https://docs.openclaw.ai/tools/skills) says OpenClaw uses AgentSkills-compatible `SKILL.md` folders to teach the agent how to use tools.
- [Creating Skills](https://docs.openclaw.ai/tools/creating-skills) says skills teach the agent how and when to use tools.

This is very close to the intent behind the BuildOS "tool expert" idea.

### 3. Skill discovery is lightweight; full instructions are loaded on demand

OpenClaw does not inject every skill in full by default.

The [System Prompt](https://docs.openclaw.ai/concepts/system-prompt) docs say:

- the Skills section tells the model how to load skill instructions on demand,
- OpenClaw injects a compact available skills list,
- that list includes the file path for each skill,
- the prompt instructs the model to use `read` to load the `SKILL.md`,
- this keeps the base prompt small while still enabling targeted skill usage.

This is the clearest match to the user's intended CLI-like pattern.

The model effectively gets:

1. a compact index of available playbooks,
2. a path to the actual instructions,
3. a standard tool (`read`) to inspect the playbook when needed.

That is very similar in spirit to "show me the man page first," but it still preserves direct typed tools for the eventual execution.

### 4. OpenClaw points the model at local docs first

OpenClaw's system prompt also includes a Documentation section that points the model to local OpenClaw docs and tells it to consult local docs first for behavior, commands, configuration, or architecture. That means OpenClaw's "how do I use this?" path is not limited to tool metadata. It can come from:

- the tool schema itself,
- a skill file,
- a local doc page.

Again, the pattern is "learn via docs/playbooks, execute via real tools."

### 5. Skills can optionally carry tool-specific metadata

The [Creating Skills](https://docs.openclaw.ai/tools/creating-skills) page states that skills can define custom tool schemas in frontmatter or instruct the agent to use existing system tools like `exec` or `browser`.

This is a useful nuance:

- OpenClaw keeps skills and tools distinct,
- but it still allows skills to package schema-level guidance with the instructions when that is helpful.

### 6. OpenClaw does not rely on one generic execution tool

The [Pi Integration Architecture](https://docs.openclaw.ai/pi) page is explicit about the tool pipeline:

1. base tools,
2. OpenClaw replacements,
3. OpenClaw tools,
4. channel tools,
5. policy filtering,
6. schema normalization,
7. abort wrapping.

The same page shows:

- a tool definition adapter from `AgentTool` to `ToolDefinition`,
- a split strategy that passes tools via `customTools`,
- an explicit note that this keeps policy filtering, sandbox integration, and the extended toolset consistent across providers.

That is a strong signal that OpenClaw wants the model-facing tool layer to remain a set of real tool definitions, not an opaque meta-call.

### 7. Provider-specific schema normalization is first-class

This is one of the most important differences from BuildOS.

The [Pi Integration Architecture](https://docs.openclaw.ai/pi) page states that schemas are normalized for Gemini and OpenAI quirks. Source inspection of [`tool-schema-runtime.ts`](https://github.com/openclaw/openclaw/blob/main/src/agents/pi-embedded-runner/tool-schema-runtime.ts) shows dedicated provider-owned normalization and diagnostics hooks rather than hard-coding everything into the main embedded runner.

This is not theoretical. OpenClaw's recent [release notes](https://github.com/openclaw/openclaw/releases) mention fixes for OpenAI Responses tool registration involving normalization of bundled MCP tool schemas.

So OpenClaw does not just define tool schemas once and hope every provider accepts them. It adapts them.

### 8. Tool exposure is filtered by policy, profile, provider, and environment

OpenClaw's [Tools and Plugins](https://docs.openclaw.ai/tools/index) and [Skills](https://docs.openclaw.ai/tools/skills) docs show that tool and skill exposure is filtered by:

- allow and deny lists,
- tool profiles,
- provider-specific restrictions,
- agent skill allowlists,
- skill metadata gates,
- environment, config, and binary presence.

This means OpenClaw is not just defining tools well. It is also curating which tools the model sees in the current state.

### 9. OpenClaw's `gateway` tool is not a generic tool-discovery gateway

This is easy to misread.

OpenClaw does have a tool named `gateway`, but according to [Tools and Plugins](https://docs.openclaw.ai/tools/index), it is for OpenClaw runtime operations like:

- config schema lookup,
- config get,
- config patch,
- config apply,
- update run.

It is not the same architectural role as BuildOS's tool gateway.

## How the OpenClaw Pattern Maps to the User's Intended Pattern

The user's intended pattern was:

1. "I want to use this tool."
2. "What is the CLI or schema for using that tool?"
3. "Now call the tool expert correctly."

OpenClaw is a good match for that idea, but in a specific shape:

- the model sees real tools directly,
- the model gets a compact index of skill playbooks and docs,
- the model uses ordinary tools like `read` to inspect the relevant playbook or docs on demand,
- the model still executes the final action through the real typed tool.

So the OpenClaw version of the pattern is not:

- discover op,
- fetch exact JSON schema from a helper tool,
- call one generic executor for everything.

It is:

- see real tools,
- consult the right playbook or docs if needed,
- call the real tool.

That distinction matters.

## Background: What Still Holds from the OpenAI and Anthropic Research

The earlier OpenAI and Anthropic research is still useful background, but it is no longer the main comparison target.

What still holds:

- OpenAI recommends keeping the initial tool surface reasonably small, deferring the long tail, and using typed schema helpers rather than hand-maintained schema drift.
- Anthropic recommends extremely explicit descriptions, examples for complex inputs, and richer tool ergonomics.
- Both vendors prefer schemas that make invalid states harder to express.

Those points still support the same BuildOS recommendation: a typed source of truth, better schema quality, and less model burden.

What changes after the OpenClaw correction is the architectural judgment:

- BuildOS was not wrong to want discoverability and playbooks.
- It was wrong to make the final provider-facing execution surface too generic.

## Current BuildOS Implementation

### 1. In gateway mode, BuildOS gives the model four meta-tools

The gateway definitions in [gateway.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts) expose:

- `skill_load`
- `tool_search`
- `tool_schema`
- `execute_op`

The test in [tool-selector.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts) confirms that when the gateway flag is enabled, those are the only tools the model sees.

### 2. BuildOS makes the prompt teach a custom execution protocol

[master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts) explicitly instructs the model to:

1. orient using context and skill metadata,
2. use `tool_search` if needed,
3. use `tool_schema` when uncertain,
4. execute only through `execute_op({ op, input })`.

This is the strongest place where BuildOS diverges from OpenClaw.

### 3. BuildOS has a useful canonical op layer

[tool-registry.ts](../../apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts) gives BuildOS a canonical semantic layer with ops like:

- `onto.task.update`
- `util.project.overview`
- `cal.event.create`

That is good. It gives BuildOS a stable internal operation vocabulary.

### 4. But the op layer is reconstructed through exception maps and legacy names

The same registry file contains explicit exception mappings and legacy tool-name-to-op derivation logic. That is a sign that the canonical layer exists, but it is not yet the only source of truth.

### 5. `tool_schema` is partly a migration and prompt-shaping layer

[tool-schema.ts](../../apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts) rewrites legacy payload terms like `tool_exec`, `buildos_call`, and `args` into `execute_op` and `input`.

That means BuildOS is still carrying compatibility and protocol translation burden inside the schema helper itself.

### 6. The docs still describe an older gateway vocabulary

There is active docs drift:

- [README.md](../../apps/web/docs/features/agentic-chat/README.md) still says gateway mode returns `tool_help` and `tool_exec`.
- [TOOL_API_MAPPING.md](../../apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md) says the same.
- live code and tests now use `skill_load`, `tool_search`, `tool_schema`, and `execute_op`.

This matters because a gateway architecture only works if the contract is very crisp and stable.

### 7. Schema strictness is still weak

In the BuildOS core tool definitions reviewed here:

- there are 81 `type: 'function'` definitions,
- only 8 explicitly set `additionalProperties: false`.

That is looser than current best practice and weaker than the schema discipline OpenClaw's architecture implies.

### 8. Provider-facing shape is still mostly a single OpenAI-style function schema

BuildOS standardizes on the OpenAI-style `type: "function"` tool shape in [chat.types.ts](../../packages/shared-types/src/chat.types.ts) and routes it through [openrouter-v2-service.ts](../../apps/web/src/lib/services/openrouter-v2-service.ts).

That is not inherently wrong, but it is a weaker adaptation layer than OpenClaw's provider-owned schema normalization model.

## OpenClaw vs BuildOS

| Question                                    | OpenClaw                                                                        | BuildOS today                                                             | Assessment                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| What does the model see?                    | Real typed tools                                                                | Mostly four meta-tools in gateway mode                                    | Major difference                    |
| How does the model learn workflow guidance? | Compact skills list in prompt, then `read` the `SKILL.md` on demand             | `skill_load` plus prompt instructions                                     | Similar intent, different mechanism |
| How does the model learn exact call shape?  | Direct tool schema, optionally backed by skill/docs                             | `tool_schema`, then pack args into `execute_op.input`                     | BuildOS adds extra indirection      |
| What executes the final action?             | The real tool                                                                   | Generic `execute_op({ op, input })`                                       | Main discrepancy                    |
| How are provider quirks handled?            | Provider-specific schema normalization and cleaning                             | Mostly one normalized OpenAI-style shape through OpenRouter               | Gap                                 |
| How are tools and skills filtered?          | Profiles, allow/deny, by-provider restrictions, skill gates, environment checks | Some contextual gating, but less explicit provider-aware schema surfacing | Partial gap                         |
| How stable is the contract?                 | Docs and runtime describe direct tool surfaces                                  | Docs still mention `tool_help`/`tool_exec` while runtime uses a newer set | Contract drift in BuildOS           |

## Reevaluated Judgment

### What BuildOS got right

- The desire to avoid dumping the full long-tail surface into the prompt was reasonable.
- The distinction between workflow guidance and execution was reasonable.
- The canonical op layer is a good idea.
- The instinct that the model may need to inspect a playbook or schema before acting was correct.

### What BuildOS got wrong

- It turned the final execution surface into a generic RPC shell.
- It made the prompt carry too much protocol burden.
- It kept too much migration complexity in the help/schema path.
- It did not pair the gateway idea with strong provider-specific schema adaptation.

### The most important corrected conclusion

The BuildOS pattern is not "wrong because it has discovery."

It is weaker than OpenClaw because discovery currently terminates in a generic executor instead of a real op-specific tool schema.

## Recommended Updates for BuildOS

### 1. Keep the discovery and skill ideas

Do not throw away:

- `skill_load`,
- tool discovery,
- canonical ops,
- progressive disclosure.

Those ideas are compatible with OpenClaw's design.

### 2. Stop making `execute_op` the universal terminal interface

This is the single highest-priority change.

Better options:

- expose direct typed tools for the most common high-value operations,
- or expose deferred-loaded op-specific tool definitions for the long tail,
- or keep `execute_op` only as a fallback escape hatch for rare or highly dynamic cases.

If BuildOS wants to stay close to the current architecture, `tool_search` can remain, but the end state should be "load the exact tool definition," not "route everything through a generic executor."

### 3. Make canonical op schemas the typed source of truth

BuildOS should define each canonical op once in a typed schema system and generate:

- provider-facing tool definitions,
- search metadata,
- skill/doc examples,
- validation logic,
- registry views.

This would eliminate much of the current exception and rewrite logic.

### 4. Separate workflow help from execution shape

OpenClaw's pattern is a good model here:

- skills and docs explain when and how,
- the tool schema defines the call itself.

For BuildOS that likely means:

- keep `skill_load` for playbooks,
- possibly keep `tool_schema` as an inspection or debugging helper,
- but stop depending on `tool_schema` as the only path to the real callable shape.

### 5. Add provider-specific schema adapters

BuildOS should adopt an explicit provider adaptation layer for:

- OpenAI and OpenRouter,
- Anthropic,
- any future MCP-shaped or Responses-specific paths.

The OpenClaw pattern here is strong: normalize and inspect tool schemas at the provider boundary rather than assuming one generic shape works equally well everywhere.

### 6. Tighten schema quality

At minimum:

- use `additionalProperties: false` widely,
- add enums where possible,
- add better parameter descriptions,
- include examples for complex write shapes,
- surface strictness when a provider supports it.

### 7. Surface semantic metadata

BuildOS should expose metadata such as:

- read-only,
- destructive,
- idempotent,
- open-world,
- approval-required.

This is useful both for the model and for runtime approval UX.

### 8. Clean up the docs/runtime drift

The gateway surface must have one vocabulary.

Right now BuildOS has drift between:

- `tool_help` and `tool_exec`,
- `skill_load`, `tool_search`, `tool_schema`, and `execute_op`.

That is a liability in a system whose behavior depends heavily on tool protocol.

## Bottom Line

The "cute" pattern was not a dead end. It was directionally sensible, and OpenClaw validates the core instinct.

But OpenClaw validates a specific version of that instinct:

- keep real typed tools,
- keep guidance lightweight,
- load skills and docs on demand,
- adapt schemas per provider,
- let the model execute the real tool.

BuildOS is currently one abstraction layer too far away from that. The gateway and playbook concepts are worth keeping. The generic `execute_op({ op, input })` center of gravity is the part that should change.
