---
date: 2025-09-15T01:17:19-04:00
researcher: Claude
git_commit: 7d44db6
branch: main
repository: build_os
topic: 'LLM API Error: System Role Not Supported for O1 Models'
tags: [research, codebase, llm-pool, openai, anthropic, o1-models, api-error]
status: complete
last_updated: 2025-09-15
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-09-15_01-17-19_llm-api-error-analysis.md
---

# Research: LLM API Error: System Role Not Supported for O1 Models

**Date**: 2025-09-15T01:17:19-04:00
**Researcher**: Claude
**Git Commit**: 7d44db6
**Branch**: main
**Repository**: build_os

## Research Question

User recently added Anthropic LLM models to llm-config and is now getting errors when making API calls. OpenAI models that used to work are now broken with the error: "Unsupported value: 'messages[0].role' does not support 'system' with this model" when using O1 Mini model.

## Summary

The root cause of the error is a logic change in the `llm-pool.ts` file where the system prompt support check was inverted. The new implementation checks `model.supportsSystemPrompt !== false` which incorrectly sends system messages to O1 models that have `supportsSystemPrompt: true` in the configuration, even though O1 models don't actually support system roles. Additionally, the O1 model configurations in `llm-config.ts` are incorrectly set to support system prompts when they should not.

## Detailed Findings

### Root Cause Analysis

#### 1. Configuration Error in llm-config.ts

The O1 models are incorrectly configured with `supportsSystemPrompt: true`:

- `src/lib/config/llm-config.ts:231-256` - O3 Mini configured with `supportsSystemPrompt: true`
- `src/lib/config/llm-config.ts:244-256` - O1 Mini configured with `supportsSystemPrompt: true`

**These should be `supportsSystemPrompt: false`** as O1/O3 reasoning models do not support system role in messages.

#### 2. Logic Change in Message Construction

The critical breaking change is in `src/lib/services/llm-pool.ts:442`:

**Old Implementation (llm-pool.old.ts:307-329)**:

- First adds system and user messages
- Then checks if `model.supportsSystemPrompt === false`
- Only merges prompts if explicitly false

**New Implementation (llm-pool.ts:442-454)**:

- Checks `model.supportsSystemPrompt !== false` upfront
- Only adds system message if this check passes
- Problem: When `supportsSystemPrompt` is `true` (as incorrectly configured), it tries to send system messages to O1 models

### Anthropic Implementation Review

The Anthropic implementation is actually well-done in the new version:

- `src/lib/services/llm-pool.ts:357-414` - Correctly detects Anthropic endpoints
- Properly uses `x-api-key` header and `anthropic-version`
- Correctly handles system prompts as a separate `system` field
- Properly parses Claude's response format

The old version was missing Anthropic-specific handling entirely, treating it as OpenAI format.

### Additional Issues Found

#### Max Tokens for O1 Models

- `src/lib/services/llm-pool.ts:466-469` - Adds `max_tokens` to request body
- O1 models don't support the `max_tokens` parameter
- The configuration has `maxOutputTokens: 65536` for O1 Mini which will cause issues

## Code References

- `src/lib/config/llm-config.ts:231` - O3 Mini configuration with incorrect supportsSystemPrompt
- `src/lib/config/llm-config.ts:244` - O1 Mini configuration with incorrect supportsSystemPrompt
- `src/lib/services/llm-pool.ts:442` - Problematic system prompt support check
- `src/lib/services/llm-pool.ts:466` - Max tokens handling that O1 models don't support
- `src/lib/services/llm-pool.old.ts:307-329` - Original working message construction logic

## Architecture Insights

The LLM pool architecture is designed to handle multiple providers with fallback support. The new implementation adds:

- Provider-specific endpoint detection (Anthropic, OpenAI, Ollama)
- Response caching for synthesis requests
- Enhanced error logging and token usage tracking
- Better retry logic with exponential backoff

However, the abstraction assumes all models follow similar patterns, which breaks for specialized models like O1 that have unique constraints.

## Solution

### Immediate Fixes Required

1. **Fix O1 Model Configuration** in `src/lib/config/llm-config.ts`:

```typescript
{
    id: 'o3-mini',
    name: 'O3 Mini',
    supportsSystemPrompt: false,  // Change from true
    supportsTemperature: false,
    // Remove or set maxOutputTokens to undefined
}

{
    id: 'o1-mini',
    name: 'O1 Mini',
    supportsSystemPrompt: false,  // Change from true
    supportsTemperature: false,
    // Remove or set maxOutputTokens to undefined
}
```

2. **Fix Message Construction Logic** in `src/lib/services/llm-pool.ts:442`:

Either change to strict checking:

```typescript
if (request.systemPrompt && model.supportsSystemPrompt === true) {
```

Or restore the original logic that's more defensive:

```typescript
// First build messages normally
if (request.systemPrompt) {
	messages.push({ role: 'system', content: request.systemPrompt });
}
messages.push({ role: 'user', content: request.userPrompt });

// Then merge if model doesn't support system prompts
if (request.systemPrompt && model.supportsSystemPrompt === false) {
	messages.length = 0;
	messages.push({
		role: 'user',
		content: `${request.systemPrompt}\n\n${request.userPrompt}`
	});
}
```

3. **Handle max_tokens for O1 Models**:
   Add a check to skip max_tokens for O1 models:

```typescript
// Add max_tokens if specified and supported
if (model.maxOutputTokens && model.id !== 'o1-mini' && model.id !== 'o3-mini') {
	body.max_tokens = model.maxOutputTokens;
}
```

### Long-term Recommendations

1. Add model capability flags for more granular control:
    - `supportsMaxTokens: boolean`
    - `supportsStreaming: boolean`
    - `supportsFunctionCalling: boolean`

2. Create provider-specific message builders to handle unique requirements

3. Add integration tests for each model type to catch configuration issues

4. Document model limitations in comments within the configuration file

## Open Questions

1. Should we create a separate model type for "reasoning models" with their own constraints?
2. Are there other O1 model limitations (like no streaming) that need to be handled?
3. Should the fallback logic prefer models with similar capabilities when the primary model fails?
