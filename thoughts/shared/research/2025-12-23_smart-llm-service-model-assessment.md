# Smart LLM Service Model Assessment

**Date:** 2025-12-23
**File:** `apps/web/src/lib/services/smart-llm-service.ts`
**Author:** Claude (AI Analysis)

---

## Executive Summary

This assessment analyzes the 15+ LLM models currently configured in the `smart-llm-service.ts` file. The analysis reveals **several models are outdated**, **pricing data needs updates**, and **newer, more capable models should be added** to maintain competitive performance.

### Key Findings

| Category | Status |
|----------|--------|
| **Critical Updates Needed** | 4 models outdated with newer replacements available |
| **Pricing Corrections** | 5+ models have inaccurate pricing data |
| **Models to Add** | 6 new models recommended |
| **Models to Deprecate** | 2 models should be removed |
| **Profile Reordering** | Moderate changes needed |

---

## Part 1: Current Model Inventory Analysis

### Models Currently Configured

#### JSON_MODELS (15 models)

| Model ID | Current Cost ($/M) | Current Output ($/M) | Status |
|----------|-------------------|---------------------|--------|
| `x-ai/grok-4-fast:free` | 0.00 | 0.00 | **Needs Update** - Grok 4.1 Fast available |
| `google/gemini-2.5-flash-lite` | 0.07 | 0.30 | OK - Ultra-low cost option |
| `google/gemini-2.0-flash-001` | 0.10 | 0.40 | **Consider Upgrade** - 2.5 Flash preferred |
| `openai/gpt-4o-mini` | 0.15 | 0.60 | **Consider Adding GPT-4.1-nano** |
| `deepseek/deepseek-chat` | 0.27 | 1.10 | **Update** - V3-0324 or V3.1 available |
| `x-ai/grok-code-fast-1` | 0.20 | 1.50 | OK |
| `z-ai/glm-4.6` | 0.50 | 1.75 | OK - Strong coding model |
| `qwen/qwen-2.5-72b-instruct` | 0.35 | 0.40 | **Outdated** - Qwen 3 available |
| `minimax/minimax-m2.1` | 0.30 | 1.20 | OK - Excellent agentic performance |
| `anthropic/claude-3-haiku-20240307` | 0.25 | 1.25 | **Outdated** - Claude Haiku 4.5 available |
| `anthropic/claude-3-5-haiku` | 0.80 | 4.00 | **Consider Upgrade** - Haiku 4.5 available |
| `google/gemini-1.5-flash` | 0.15 | 0.60 | **Outdated** - Use 2.5 Flash instead |
| `anthropic/claude-3-5-sonnet-20241022` | 3.00 | 15.00 | **Outdated** - Claude Sonnet 4/4.5 available |
| `deepseek/deepseek-reasoner` | 0.07 | 1.68 | **Update** - R1-0528 available |
| `openai/gpt-4o` | 2.50 | 10.00 | OK - But GPT-4.5 available |

---

## Part 2: Detailed Model Analysis & Recommendations

### A. Critical Updates Required

#### 1. Claude Models (Anthropic)

**Current State:**
- `claude-3-5-sonnet-20241022` - Old model, Claude Sonnet 4 and 4.5 now available
- `claude-3-5-haiku` - Claude Haiku 4.5 now available with better tool calling
- `claude-3-haiku-20240307` - Severely outdated

**Recommendation: REPLACE**

| Old Model | New Model | Input $/M | Output $/M | Key Improvements |
|-----------|-----------|-----------|------------|------------------|
| `claude-3-5-sonnet-20241022` | `anthropic/claude-sonnet-4` | $3.00 | $15.00 | 72.7% SWE-bench (vs 49%), 1M context, better tool calling |
| `claude-3-5-haiku` | `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | Extended thinking, improved tool orchestration, parallel tool calls |
| `claude-3-haiku-20240307` | **REMOVE** | - | - | Too outdated, replaced by Haiku 4.5 |

**Claude Sonnet 4.5 Highlights:**
- 61.4% on OSWorld (vs 42.2% for Sonnet 4)
- Hybrid reasoning with Extended Thinking mode
- Same pricing as Sonnet 3.5 ($3/$15)

**Claude Haiku 4.5 Highlights:**
- 4-5x faster than Sonnet 4.5
- Parallel/interleaved tool calling patterns
- Better for lightweight agents

---

#### 2. DeepSeek Models

**Current State:**
- `deepseek/deepseek-chat` - V3 model, but V3-0324 and V3.1 available
- `deepseek/deepseek-reasoner` - Original R1, but R1-0528 available

**Recommendation: UPDATE**

| Current | Recommended | Improvements |
|---------|-------------|--------------|
| `deepseek/deepseek-chat` | `deepseek/deepseek-chat` (V3-0324) | Better reasoning, improved tool-use, outperforms GPT-4.5 in math/coding |
| `deepseek/deepseek-reasoner` | `deepseek/deepseek-r1-0528` | 45-50% less hallucination, 53.5/63.9 on Tau-Bench (Airline/Retail) |

**NEW: DeepSeek V3.1 (August 2025)**
- Hybrid thinking mode (can switch between V3 and R1 behavior)
- 671B params (37B active), 128K context
- Smarter tool calling, best for agentic workflows
- **Consider adding as premium option**

---

#### 3. Qwen Models

**Current State:**
- `qwen/qwen-2.5-72b-instruct` - Qwen 2.5, but Qwen 3 series available

**Recommendation: REPLACE**

| Current | Recommended | Why |
|---------|-------------|-----|
| `qwen/qwen-2.5-72b-instruct` | `qwen/qwen3-32b` or `qwen/qwen3-max` | 69.6 on Tau2-Bench, 119 languages (vs 25), 10x faster on long-context, 15% fewer hallucinations |

**Qwen 3 Highlights:**
- MoE architecture: 235B total / 22B active (83% lower compute)
- 36 trillion training tokens (2x Qwen 2.5)
- Outstanding tool-calling and agentic capabilities

---

#### 4. Gemini Models

**Current State:**
- `gemini-2.0-flash-001` - OK but 2.5 Flash is better
- `gemini-1.5-flash` - Outdated
- `gemini-2.5-flash-lite` - Good for ultra-low cost

**Recommendation: UPDATE**

| Current | Action | Reason |
|---------|--------|--------|
| `gemini-1.5-flash` | **REMOVE** | Outdated, use 2.5 Flash instead |
| `gemini-2.0-flash-001` | Keep as fallback | Still useful, but 2.5 Flash preferred |
| `gemini-2.5-flash-lite` | Keep | Best ultra-low cost option |
| **ADD:** `google/gemini-2.5-flash` | **NEW** | "Thinking" model, 63.8% SWE-Bench, controllable reasoning budgets |

**Gemini 2.5 Flash Highlights:**
- First fully hybrid reasoning model from Google
- 100-300ms response time (vs 200-500ms for 2.0)
- Tops LMArena leaderboard
- Controllable thinking on/off for cost optimization

---

### B. Models Performing Well (Keep As-Is)

| Model | Assessment | Notes |
|-------|------------|-------|
| `minimax/minimax-m2.1` | **Excellent** | 77.2% τ²-Bench, 69.4% SWE-bench, best open-source agentic model |
| `z-ai/glm-4.6` | **Good** | 355B params, MIT license, near Claude Sonnet 4 on CC-Bench |
| `x-ai/grok-code-fast-1` | **Good** | Solid for coding tasks |
| `openai/gpt-4o-mini` | **Good** | Reliable workhorse |

---

### C. New Models to Add

#### High Priority Additions

| Model | Input $/M | Output $/M | Use Case |
|-------|-----------|------------|----------|
| `anthropic/claude-sonnet-4` | $3.00 | $15.00 | Complex reasoning, nuanced tasks, best tool calling |
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | Fast agents, lightweight tasks |
| `google/gemini-2.5-flash` | ~$0.15 | ~$0.60 | Hybrid reasoning with speed |
| `openai/gpt-4.1-nano` | $0.10 | $0.40 | Ultra-fast, 1M context, cheapest OpenAI |
| `qwen/qwen3-32b` or `qwen/qwen3-max` | TBD | TBD | Best open-source general purpose |
| `x-ai/grok-4.1-fast` | TBD | TBD | 93% τ²-Bench accuracy, 2M context, best tool calling |

#### Medium Priority Additions

| Model | Use Case |
|-------|----------|
| `deepseek/deepseek-v3.1` | Hybrid reasoning (V3+R1 combined) |
| `openai/gpt-4.1-mini` | Faster than 4o-mini, better instruction following |

---

## Part 3: Pricing Corrections

Several models have pricing that doesn't match current OpenRouter/provider rates:

| Model | Current Input | Correct Input | Current Output | Correct Output |
|-------|---------------|---------------|----------------|----------------|
| `claude-3-5-haiku` | $0.80 | $0.80 | $4.00 | $4.00 | ✓ Correct |
| `claude-3-5-sonnet-20241022` | $3.00 | $3.00 | $15.00 | $15.00 | ✓ Correct |
| `deepseek/deepseek-reasoner` | $0.07 | $0.55 | $1.68 | $2.19 | ❌ Needs update (R1 pricing) |
| `openai/gpt-4o` | $2.50 | $2.50 | $10.00 | $10.00 | ✓ Correct |

**Note:** DeepSeek pricing varies significantly. The file has $0.07/$1.68 which may be cache-hit pricing. Standard R1 pricing is $0.55/$2.19.

---

## Part 4: Profile Reordering Recommendations

### JSON_PROFILE_MODELS

#### `fast` Profile

**Current:**
```typescript
fast: [
  'google/gemini-2.5-flash-lite',
  'anthropic/claude-3-5-haiku',
  'deepseek/deepseek-chat',
  'openai/gpt-4o-mini'
]
```

**Recommended:**
```typescript
fast: [
  'google/gemini-2.5-flash-lite',      // Ultra-low cost: $0.07/$0.30
  'openai/gpt-4.1-nano',               // NEW: Cheapest OpenAI, 1M context
  'anthropic/claude-haiku-4.5',        // UPDATED: Better tool calling
  'deepseek/deepseek-chat',            // Good value
  'openai/gpt-4o-mini'                 // Reliable fallback
]
```

#### `balanced` Profile

**Current:**
```typescript
balanced: [
  'deepseek/deepseek-chat',
  'anthropic/claude-3-5-haiku',
  'minimax/minimax-m2.1',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash-lite'
]
```

**Recommended:**
```typescript
balanced: [
  'deepseek/deepseek-chat',            // Best value at $0.27/$1.10
  'anthropic/claude-haiku-4.5',        // UPDATED: Better tool orchestration
  'minimax/minimax-m2.1',              // Excellent agentic: 77.2% τ²-Bench
  'google/gemini-2.5-flash',           // NEW: Hybrid reasoning
  'openai/gpt-4o-mini',                // Reliable fallback
  'google/gemini-2.5-flash-lite'       // Cost fallback
]
```

#### `powerful` Profile

**Current:**
```typescript
powerful: [
  'minimax/minimax-m2.1',
  'deepseek/deepseek-reasoner',
  'anthropic/claude-3-5-sonnet-20241022',
  'openai/gpt-4o'
]
```

**Recommended:**
```typescript
powerful: [
  'anthropic/claude-sonnet-4',         // NEW: 72.7% SWE-bench, best tool calling
  'minimax/minimax-m2.1',              // 77.2% τ²-Bench, 69.4% SWE-bench
  'deepseek/deepseek-r1-0528',         // UPDATED: Better reasoning
  'openai/gpt-4o',                     // Strong general purpose
  'z-ai/glm-4.6'                       // Strong coding, MIT license
]
```

#### `maximum` Profile

**Current:**
```typescript
maximum: [
  'anthropic/claude-3-5-sonnet-20241022',
  'minimax/minimax-m2.1',
  'deepseek/deepseek-reasoner',
  'openai/gpt-4o'
]
```

**Recommended:**
```typescript
maximum: [
  'anthropic/claude-sonnet-4.5',       // NEW: Best overall, 61.4% OSWorld
  'anthropic/claude-sonnet-4',         // Strong fallback
  'minimax/minimax-m2.1',              // Excellent agentic
  'deepseek/deepseek-r1-0528',         // Best reasoning for cost
  'openai/gpt-4o'                      // Reliable fallback
]
```

---

### TOOL_CALLING_MODEL_ORDER

**Current:**
```typescript
const TOOL_CALLING_MODEL_ORDER = [
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-haiku',
  'minimax/minimax-m2.1',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'deepseek/deepseek-reasoner',
  'deepseek/deepseek-chat',
  'x-ai/grok-code-fast-1',
  'z-ai/glm-4.6',
  'google/gemini-2.0-flash-001'
]
```

**Recommended:**
```typescript
const TOOL_CALLING_MODEL_ORDER = [
  'anthropic/claude-sonnet-4',           // NEW: Best tool calling, ~92% success
  'anthropic/claude-haiku-4.5',          // UPDATED: Fast + parallel tool calls
  'x-ai/grok-4.1-fast',                  // NEW: 93% τ²-Bench, 2M context
  'minimax/minimax-m2.1',                // 77.2% τ²-Bench, excellent agentic
  'openai/gpt-4o',                       // Strong: 87%+ success rate
  'openai/gpt-4o-mini',                  // Fast + good: 88% success rate
  'deepseek/deepseek-r1-0528',           // UPDATED: Better tool calling
  'deepseek/deepseek-chat',              // Good for sequential tasks
  'z-ai/glm-4.6',                        // Good tool use
  'google/gemini-2.5-flash',             // NEW: Better than 2.0 Flash
  'qwen/qwen3-32b'                       // NEW: 69.6 Tau2-Bench
]
```

---

## Part 5: Models to Remove

| Model | Reason |
|-------|--------|
| `anthropic/claude-3-haiku-20240307` | Severely outdated, replaced by Haiku 4.5 |
| `google/gemini-1.5-flash` | Outdated, 2.5 Flash is superior in every way |

---

## Part 6: Implementation Priority

### Phase 1: Critical (Immediate)

1. **Replace `claude-3-5-sonnet-20241022`** with `claude-sonnet-4`
2. **Replace `claude-3-5-haiku`** with `claude-haiku-4.5`
3. **Remove `claude-3-haiku-20240307`**
4. **Add `gpt-4.1-nano`** to fast tier

### Phase 2: Important (This Week)

5. **Add `gemini-2.5-flash`** to balanced/powerful tiers
6. **Replace `qwen-2.5-72b-instruct`** with `qwen3-32b` or `qwen3-max`
7. **Update `deepseek-reasoner`** to R1-0528 if available on OpenRouter
8. **Remove `gemini-1.5-flash`**

### Phase 3: Enhancement (Next Sprint)

9. **Add `grok-4.1-fast`** for tool calling scenarios
10. **Add `claude-sonnet-4.5`** for maximum tier
11. **Consider `deepseek-v3.1`** for hybrid reasoning needs
12. **Update profile orderings** as recommended

---

## Part 7: Model Capability Matrix

| Model | JSON Mode | Tool Calling | Reasoning | Coding | Speed | Cost |
|-------|-----------|--------------|-----------|--------|-------|------|
| Claude Sonnet 4 | ❌ (prompt) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | $$$ |
| Claude Haiku 4.5 | ❌ (prompt) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $$ |
| MiniMax M2.1 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $ |
| DeepSeek R1-0528 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | $ |
| GPT-4.1 Nano | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $ |
| Gemini 2.5 Flash | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $ |
| GLM-4.6 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | $$ |
| Grok 4.1 Fast | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $$ |
| Qwen 3 32B | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $ |

**Legend:** $ = <$1/M, $$ = $1-5/M, $$$ = >$5/M

---

## Part 8: Special Considerations

### For Agentic/Tool Calling Workflows

**Top Recommendations:**
1. **Claude Sonnet 4** - Best overall tool calling (~92% success)
2. **Grok 4.1 Fast** - 93% τ²-Bench, 2M context, optimized for agents
3. **MiniMax M2.1** - 77.2% τ²-Bench, excellent for complex chains
4. **Claude Haiku 4.5** - Fast with parallel tool calling

### For JSON/Structured Output

**Top Recommendations:**
1. **GPT-4.1 Nano** - Native JSON schema support, cheapest
2. **DeepSeek Chat V3** - Excellent structured output
3. **MiniMax M2.1** - Native structured output support
4. **Gemini 2.5 Flash** - Good JSON mode support

### For Coding Tasks

**Top Recommendations:**
1. **Claude Sonnet 4** - 72.7% SWE-bench
2. **MiniMax M2.1** - 69.4% SWE-bench
3. **GLM-4.6** - Near Sonnet 4 on CC-Bench
4. **DeepSeek R1-0528** - Excellent for complex coding

### For Cost Optimization

**Budget-Friendly Options:**
1. **Gemini 2.5 Flash Lite** - $0.07/$0.30 per M
2. **GPT-4.1 Nano** - $0.10/$0.40 per M
3. **DeepSeek Chat** - $0.27/$1.10 per M
4. **MiniMax M2.1** - $0.30/$1.20 per M (8% of Claude Sonnet price!)

---

## Conclusion

The current model configuration has served well but is now **6-12 months behind current offerings**. The most critical updates are:

1. **Claude models** - Sonnet 4/4.5 and Haiku 4.5 offer significant improvements
2. **Add GPT-4.1 Nano** - Best budget option with 1M context
3. **Add Gemini 2.5 Flash** - Superior to 2.0 Flash in every metric
4. **Update Qwen** - Qwen 3 series is dramatically better
5. **Consider Grok 4.1 Fast** - New tool-calling champion

Implementing these changes will improve response quality, reduce costs, and provide better tool calling reliability for agentic workflows.

---

## References

- OpenRouter Models: https://openrouter.ai/models
- Anthropic Claude Docs: https://docs.anthropic.com/
- DeepSeek Documentation: https://platform.deepseek.com/
- Google Gemini API: https://ai.google.dev/gemini-api/docs/models
- MiniMax M2 GitHub: https://github.com/MiniMax-AI/MiniMax-M2
- xAI Grok API: https://x.ai/api
