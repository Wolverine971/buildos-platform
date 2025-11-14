# Agentic Chat Model Optimization Guide

## Overview

This guide documents the optimized model selection strategy for the agentic chat system based on the January 2025 OpenRouter analysis. The optimization focuses on balancing cost, performance, and reliability across different agent operations.

## Key Findings from Analysis

### Model Performance Metrics

| Model                     | TTFT  | Tool Success | Cost (per M) | Best Use Case                     |
| ------------------------- | ----- | ------------ | ------------ | --------------------------------- |
| **Claude 3.5 Haiku**      | 0.97s | ~92%         | $0.80/$4.00  | Tool-heavy operations, agent chat |
| **Gemini 2.5 Flash Lite** | <1s   | 75%          | $0.07/$0.30  | Ultra-low cost, speed critical    |
| **DeepSeek-Chat V3**      | ~1s   | Good         | $0.27/$1.10  | Best value, balanced operations   |
| **DeepSeek-Reasoner**     | ~1.5s | Good         | $0.07/$1.68  | Complex reasoning, planning       |
| **GPT-4o-mini**           | <1s   | 88%          | $0.15/$0.60  | Reliable fallback                 |

### Cost Optimization Potential

With optimized model selection:

- **Monthly Savings**: $32.61 (38.5% reduction)
- **Annual Savings**: $391.32

## Current Architecture

### Components and Their Model Usage

```
┌─────────────────────────────────────┐
│     Agent Stream Endpoint           │
│  /api/agent/stream/+server.ts       │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│    AgentChatOrchestrator            │
│  - Uses SmartLLMService             │
│  - Profile: resolvePlannerProfile() │
└─────────────┬───────────────────────┘
              │
        ┌─────┴─────┬──────────┬────────────┐
        ▼           ▼          ▼            ▼
┌───────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐
│  Planner  │ │ Executor │ │Synthesis│ │  Tools   │
│  Agent    │ │  Agent   │ │ Service │ │Execution │
│           │ │          │ │         │ │          │
│ Profile:  │ │ Profile: │ │Profile: │ │ Profile: │
│ balanced  │ │  speed   │ │balanced │ │ varies   │
└───────────┘ └──────────┘ └─────────┘ └──────────┘
```

### Current Profile Selection

#### Planner Agent (agent-chat-orchestrator.ts)

```typescript
resolvePlannerProfile(contextType):
  - project_audit/forecast/create → 'quality'
  - task_update/calendar → 'speed'
  - ontology/project → 'balanced'
  - default → 'balanced'
```

#### Executor Agent (agent-executor-service.ts)

```typescript
Fixed: profile: 'speed'; // Line 337
```

#### Plan Generation (plan-orchestrator.ts)

```typescript
No profile specified → defaults to 'balanced'
operationType: 'plan_generation' // Line 566
```

#### Response Synthesis (response-synthesizer.ts)

```typescript
No profile specified → defaults to 'balanced'
operationType: 'simple_response' or 'complex_response'
```

## Optimization Strategy

### 1. Model Selection by Operation Type

#### Planner Agent Streaming

- **Tool-heavy contexts** (project, ontology): Use `balanced` → Claude 3.5 Haiku
- **Complex planning** (audit, forecast): Use `quality` → DeepSeek-Reasoner
- **Quick updates** (task, calendar): Use `speed` → Gemini 2.5 Flash Lite

#### Executor Tasks

- **Default**: Keep `speed` for fast execution → Gemini 2.5 Flash Lite
- **Tool-heavy**: Consider upgrading to `balanced` → Claude 3.5 Haiku

#### Plan Generation

- **Simple plans**: Use `balanced` → DeepSeek-Chat
- **Complex plans**: Use `powerful` → DeepSeek-Reasoner

#### Response Synthesis

- **Simple responses**: Use `speed` → Gemini 2.5 Flash Lite
- **Complex synthesis**: Use `balanced` → DeepSeek-Chat

### 2. Updated Profile Configurations

The profiles in `smart-llm-service.ts` have been updated:

```typescript
// JSON Profiles (for structured output)
fast: [
	'google/gemini-2.5-flash-lite', // $0.07/$0.30
	'anthropic/claude-3-5-haiku', // $0.80/$4.00
	'deepseek/deepseek-chat', // $0.27/$1.10
	'openai/gpt-4o-mini' // $0.15/$0.60
];

balanced: [
	'deepseek/deepseek-chat', // Best value
	'anthropic/claude-3-5-haiku', // Tool reliability
	'openai/gpt-4o-mini',
	'google/gemini-2.5-flash-lite' // Cost fallback
];

powerful: [
	'deepseek/deepseek-reasoner', // $0.07/$1.68
	'anthropic/claude-3-5-sonnet', // $3.00/$15.00
	'openai/gpt-4o' // $0.50/$1.50
];
```

### 3. Tool-Calling Priority

Updated `TOOL_CALLING_MODEL_ORDER` to prioritize Claude models:

```typescript
[
	'anthropic/claude-3-5-sonnet', // ~92% success
	'anthropic/claude-3-5-haiku', // ~92% success
	'openai/gpt-4o', // 87%+ success
	'openai/gpt-4o-mini', // 88% success
	'deepseek/deepseek-reasoner',
	'deepseek/deepseek-chat'
	// ... others
];
```

## Implementation Guide

### Quick Wins (Immediate)

1. **Update orchestrator profile selection** ✅
    - Enhanced context-aware selection
    - Added project_create, ontology handling

2. **Update model pricing** ✅
    - Corrected Claude 3.5 Haiku: $0.80/$4.00
    - Corrected DeepSeek models
    - Corrected Gemini 2.5 Flash Lite: $0.07/$0.30

### Advanced Optimizations (Future)

1. **Dynamic Profile Selection**

    ```typescript
    // Use the new model-selection-config.ts
    import { getOptimalTextProfile } from './config/model-selection-config';

    const profile = getOptimalTextProfile(contextType, operationType);
    ```

2. **Operation-Specific Parameters**

    ```typescript
    // Use operation-specific temperatures and max tokens
    import {
    	TEMPERATURE_BY_OPERATION,
    	MAX_TOKENS_BY_OPERATION
    } from './config/model-selection-config';
    ```

3. **Enhanced LLM Wrapper**
    ```typescript
    // Use the enhanced wrapper for automatic optimization
    import { createEnhancedLLMWrapper } from './config/enhanced-llm-wrapper';
    ```

## Monitoring and Validation

### Key Metrics to Track

```sql
-- Monitor model usage distribution
SELECT
  model_used,
  operation_type,
  COUNT(*) as requests,
  AVG(response_time_ms) as avg_latency,
  SUM(total_cost_usd) as total_cost
FROM llm_usage_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND operation_type IN (
    'planner_stream',
    'plan_generation',
    'executor_task',
    'simple_response',
    'complex_response'
  )
GROUP BY model_used, operation_type
ORDER BY total_cost DESC;

-- Compare cost before/after optimization
SELECT
  DATE_TRUNC('day', created_at) as day,
  SUM(total_cost_usd) as daily_cost,
  COUNT(*) as requests,
  AVG(response_time_ms) as avg_latency
FROM llm_usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

### Success Criteria

1. **Cost Reduction**: Target 30-40% reduction in LLM costs
2. **Performance**: Maintain or improve response times
3. **Reliability**: Tool-calling success rate > 85%
4. **Quality**: User satisfaction maintained or improved

## Privacy and Compliance

### Models to Avoid for Sensitive Data

- **Grok 4 Fast:free**: Uses data for model training
- Any free tier models without clear privacy policies

### Recommended for Enterprise

- **Claude models**: Clear no-training commitment
- **OpenAI models**: Standard API protections
- **Google models**: Enterprise agreements available

## Rollback Plan

If issues arise:

1. **Revert profile mappings** in `smart-llm-service.ts`
2. **Restore original resolvePlannerProfile** in orchestrator
3. **Monitor error rates** in llm_usage_logs

## Future Enhancements

1. **A/B Testing Framework**
    - Compare model performance in production
    - Gradual rollout of new models

2. **Adaptive Selection**
    - Learn from usage patterns
    - Adjust profiles based on success rates

3. **Cost Budget Enforcement**
    - Set per-user or per-operation limits
    - Automatic downgrade to cheaper models when approaching limits

## References

- [OpenRouter Model Analysis](/thoughts/shared/research/2025-01-14_openrouter-model-analysis.md)
- [SmartLLMService](/apps/web/src/lib/services/smart-llm-service.ts)
- [Agentic Chat Architecture](/apps/web/docs/features/agentic-chat/)
- [Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
