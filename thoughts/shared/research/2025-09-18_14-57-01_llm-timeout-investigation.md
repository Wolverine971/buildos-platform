---
date: 2025-09-18T14:57:05-04:00
researcher: Claude Code
git_commit: b3d40f1
branch: main
repository: build_os
topic: 'LLM Timeout Investigation - Brain Dump Processing Failures'
tags: [research, codebase, llm-pool, brain-dump, timeouts, openai, anthropic]
status: complete
last_updated: 2025-09-18
last_updated_by: Claude Code
last_updated_note: 'Added implementation status updates for high priority fixes'
---

# Research: LLM Timeout Investigation - Brain Dump Processing Failures

**Date**: 2025-09-18T14:57:05-04:00
**Researcher**: Claude Code
**Git Commit**: b3d40f1
**Branch**: main
**Repository**: build_os

## Research Question

Investigate why LLM calls are consistently timing out after 60 seconds, particularly in brain dump processing operations, causing failures across all OpenAI models including GPT-4o Mini, GPT-4o, GPT-5 Mini, and GPT-5 Nano.

## Summary

The LLM timeout issues are caused by a combination of **oversized prompts**, **single provider dependency**, **configuration mismatches**, and **missing Vercel function timeout configuration**. The system is trying to process extremely large prompts (5,000-10,000+ tokens) through a 60-second timeout bottleneck with only OpenAI as the active provider.

**Root Causes Identified:**

1. **Oversized Brain Dump Prompts**: Task extraction prompts exceed 5,000-10,000 tokens for large projects
2. **Single Provider Risk**: Only OpenAI is enabled (Anthropic commented out due to credits)
3. **Environment Variable Mismatch**: `PRIVATE_OPENAI_API_KEY` vs `OPENAI_API_KEY` confusion
4. **Missing Vercel Function Timeouts**: No explicit function timeout configuration
5. **Model Selection Issues**: Not using appropriate models for prompt complexity

## Detailed Findings

### LLM Pool Service Configuration Issues

**Timeout Hierarchy Problems** (`src/lib/services/llm-pool.ts:10-18`):

- Default timeout: 40 seconds
- OpenAI provider timeout: **60 seconds** (bottleneck)
- GPT-5 model timeouts: 800 seconds (13+ minutes, excessive)
- Reasoning model timeout: 120 seconds

**Single Provider Dependency** (`src/lib/config/llm-config.ts:126`):

- Only OpenAI provider is active (priority 3)
- Anthropic provider completely commented out (lines 62-119)
- Ollama local provider commented out (lines 36-59)

**Environment Configuration Issues**:

- Uses `PRIVATE_OPENAI_API_KEY` but `.env.example` shows `OPENAI_API_KEY`
- Anthropic API key is available but provider is disabled

### Brain Dump Processing Oversized Prompts

**Task Extraction Prompt Issues** (`src/lib/utils/braindump-processor.ts:879-930`):

- System prompts: ~1,426 tokens
- User prompts: ~1,095 tokens
- Combined: **2,521+ tokens** for basic operations
- For existing projects: **5,000-10,000+ tokens** due to full project context

**Dual Processing Triggers** (`brain-dump-thresholds.ts`):

- Brain dump threshold: 500 characters (very low)
- Combined threshold: 800 characters
- Most brain dumps trigger complex dual processing

**Model Selection Problems**:

- Hard-coded to use `['gpt-4o-mini', 'gpt-4o']` regardless of prompt size
- Not using `selectModelsForPromptComplexity()` utility designed for this purpose

### Timeout Configuration Analysis

**Critical 60-Second Bottlenecks Found:**

1. **OpenAI Provider**: `60,000ms` - affects all OpenAI requests
2. **SSE Processor**: `60,000ms` - affects streaming operations
3. **Brain dump streaming**: `60,000ms` - short content processing

**Missing Vercel Configuration**:

- No function-specific timeout configuration in `vercel.json`
- Vercel defaults to 60-second function limits on Pro plan
- Complex operations need explicit timeout increases

### Provider Fallback Issues

**Anthropic Provider Status**:

- Completely commented out in configuration
- API key is available: `PRIVATE_ANTHROPIC_API_KEY=sk-ant-api03-...`
- User manually disabled due to credit balance issues
- Would provide fallback capability if re-enabled

**Fallback Architecture**:

- System designed for multi-provider fallback
- Currently fails when OpenAI times out (no alternatives)
- Priority order would be: Ollama (1) → Anthropic (2) → OpenAI (3)

## Code References

- `src/lib/services/llm-pool.ts:126` - OpenAI provider 60-second timeout configuration
- `src/lib/utils/braindump-processor.ts:879-930` - Task extraction method with oversized prompts
- `src/lib/config/llm-config.ts:62-119` - Commented out Anthropic provider configuration
- `src/lib/utils/sse-processor.ts` - 60-second streaming timeout
- `vercel.json` - Missing function timeout configuration

## Architecture Insights

**Timeout Interaction Hierarchy:**

```
User Request
    ↓
Vercel Function (60s default) ← BOTTLENECK
    ↓
LLM Pool Service (40s default, 60s OpenAI) ← BOTTLENECK
    ↓
Brain Dump Processor (large prompts) ← ROOT CAUSE
    ↓
OpenAI API (network + processing time)
```

**System Design Strengths:**

- Robust retry and fallback architecture
- Proper error handling and logging
- Model-specific timeout capability
- Dynamic model selection utilities (unused)

**System Design Weaknesses:**

- Single provider dependency
- No prompt size optimization
- Missing platform-level timeout configuration
- Environment variable inconsistencies

## Historical Context (from thoughts/)

**Recent Performance Optimizations** (`thoughts/shared/research/2025-09-18_01-02-24_phase-calendar-view-apple-redesign.md`):

- Database query optimizations implemented (60-95% performance improvements)
- RPC function conversions completed
- These optimizations may have reduced timeout pressure on some operations

**Brain Dump System Analysis** (`thoughts/shared/research/2025-09-18_17-37-32_brain-dump-question-analysis-inconsistencies.md`):

- Architectural inconsistencies in brain dump processing identified
- Different processors for different content sizes
- Missing question generation in some processing paths

## Open Questions

1. **Credit Balance**: What's the status of Anthropic credits for re-enabling fallback?
2. **Model Availability**: Are GPT-5 models actually available in OpenAI API?
3. **Performance Impact**: How much would prompt optimization reduce processing time?
4. **Vercel Plan**: What's the current Vercel plan and function timeout limits?

## Immediate Fix Recommendations

### High Priority (Can Fix Today) ✅ **COMPLETED 2025-09-18 16:56**

1. **✅ Add Vercel Function Timeout Configuration** - **IMPLEMENTED**

    ```json
    // Added to vercel.json
    {
    	"functions": {
    		"src/routes/api/braindumps/stream*": {
    			"maxDuration": 120
    		},
    		"src/routes/api/projects/*/synthesize*": {
    			"maxDuration": 120
    		},
    		"src/routes/api/daily-briefs/generate*": {
    			"maxDuration": 120
    		}
    	}
    }
    ```

2. **✅ Increase LLM Service Timeouts** - **IMPLEMENTED**

    ```typescript
    // Updated in llm-pool.ts
    const POOL_CONSTANTS = {
      DEFAULT_TIMEOUT: 80000, // Increased from 40s to 80s
      REASONING_MODEL_TIMEOUT: 180000 // Increased from 120s to 180s
    }

    // Updated in llm-config.ts
    {
      id: 'openai',
      timeout: 120000, // Increased from 60s to 120s
    }
    ```

3. **✅ Use Dynamic Model Selection** - **IMPLEMENTED**

    ```typescript
    // Added to braindump-processor.ts extractTasks method
    const totalPromptLength = systemPrompt.length + userPrompt.length;
    const { selectModelsForPromptComplexity } = await import('$lib/utils/llm-utils');
    const preferredModels = selectModelsForPromptComplexity(
    	totalPromptLength,
    	isNewProject,
    	true // isDualProcessing
    );
    ```

4. **✅ Fix Environment Variable** - **IMPLEMENTED**
    ```typescript
    // Updated .env.example to match code usage
    PRIVATE_OPENAI_API_KEY = your_openai_api_key;
    PRIVATE_ANTHROPIC_API_KEY = your_anthropic_api_key;
    ```

### Medium Priority (This Week)

5. **Re-enable Anthropic Fallback** (when credits available)
    - Uncomment Anthropic provider in `llm-config.ts:62-119`
    - Provides robust fallback when OpenAI fails

6. **Optimize Brain Dump Prompts**
    - Reduce instruction verbosity in dual processing mode
    - Implement context truncation for large projects
    - Add prompt size monitoring and logging

### Long-term (Next Sprint)

7. **Implement Prompt Size Optimization**
    - Progressive enhancement based on complexity
    - Separate question generation from task extraction
    - Context-aware processing strategies

8. **Add Timeout Monitoring**
    - Track timeout incidents for analysis
    - Dynamic timeout scaling based on content complexity
    - Performance metrics for optimization
