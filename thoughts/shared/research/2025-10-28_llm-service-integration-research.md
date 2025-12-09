<!-- thoughts/shared/research/2025-10-28_llm-service-integration-research.md -->
# BuildOS LLM Service Integration Research Report

**Date**: 2025-10-28  
**Scope**: SmartLLMService, OpenRouter integration, prompt management, cost tracking, error handling  
**Target**: Conversational agent implementation

## Executive Summary

BuildOS implements a sophisticated LLM integration layer (`SmartLLMService`) that abstracts OpenRouter API interactions with intelligent model routing, cost tracking, and comprehensive error handling. The system supports JSON responses and text generation across multiple profiles (fast, balanced, quality, maximum) with automatic model selection based on complexity analysis and cost constraints.

---

## 1. SmartLLMService Architecture

### 1.1 Overview

**Location**:

- Web: `/apps/web/src/lib/services/smart-llm-service.ts` (1786 lines)
- Worker: `/apps/worker/src/lib/services/smart-llm-service.ts` (960 lines)

**Key Responsibility**: Provide unified interface for all LLM operations with intelligent routing, cost optimization, and comprehensive logging.

### 1.2 Core Service Class Structure

```typescript
export class SmartLLMService {
	private apiKey: string; // OpenRouter API key
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private costTracking = new Map<string, number>(); // Cost per model
	private performanceMetrics = new Map<string, number[]>(); // Response times
	private errorLogger?: ErrorLoggerService; // Error tracking
	private supabase?: SupabaseClient<Database>; // DB logging

	constructor(config?: {
		httpReferer?: string;
		appName?: string;
		supabase?: SupabaseClient<Database>;
	});
}
```

### 1.3 Supported Profiles

#### JSON Profiles (for structured output):

- **fast**: Speed-optimized (Grok 4 Free, Gemini 2.5 Flash Lite, GPT-4o Mini)
- **balanced**: Cost-effective balance (DeepSeek, Qwen, GPT-4o Mini)
- **powerful**: Quality-focused (Claude 3.5 Sonnet, GPT-4o)
- **maximum**: Maximum accuracy (Claude 3 Opus, GPT-4o, Claude 3.5 Sonnet)
- **custom**: Requirements-based selection

#### Text Profiles (for generation):

- **speed**: Ultra-fast (Grok 4 Free, Gemini 2.5 Flash Lite, Grok 4 Fast)
- **balanced**: Versatile (GPT-4o Mini, Gemini 2.0 Flash, DeepSeek Chat)
- **quality**: High-quality output (Claude 3.5 Sonnet, GPT-4o, DeepSeek)
- **creative**: Creative writing (Claude 3 Opus, Claude 3.5 Sonnet, GPT-4o)
- **custom**: Requirements-based selection

---

## 2. Model Configuration & Selection

### 2.1 Available Models (JSON)

```typescript
const JSON_MODELS: Record<string, ModelProfile> = {
	// Ultra-fast tier (1-2s) - Free models
	'x-ai/grok-4-fast:free': {
		speed: 4.5,
		smartness: 4.3,
		cost: 0.0,
		outputCost: 0.0,
		bestFor: ['json-mode', 'free-tier', 'fast-prototyping']
	},

	// Fast tier (2-3s)
	'google/gemini-2.5-flash-lite': {
		speed: 4.5,
		smartness: 4.2,
		cost: 0.1,
		outputCost: 0.4,
		bestFor: ['ultra-low-latency', 'json-mode']
	},
	'openai/gpt-4o-mini': {
		speed: 4,
		smartness: 4,
		cost: 0.15,
		outputCost: 0.6,
		bestFor: ['json-mode', 'cost-effective']
	},
	'deepseek/deepseek-chat': {
		speed: 3.5,
		smartness: 4.5,
		cost: 0.14,
		outputCost: 0.28,
		bestFor: ['complex-json', 'instruction-following']
	},

	// Balanced tier (3-4s)
	'anthropic/claude-3-haiku': {
		speed: 3,
		smartness: 3.5,
		cost: 0.25,
		outputCost: 1.25,
		bestFor: ['fast-analysis', 'simple-json']
	},

	// Powerful tier (4-5s)
	'anthropic/claude-3.5-sonnet': {
		speed: 2,
		smartness: 4.7,
		cost: 3.0,
		outputCost: 15.0,
		bestFor: ['complex-reasoning', 'nuanced-instructions']
	},

	// Maximum tier (5-7s)
	'anthropic/claude-3-opus': {
		speed: 1,
		smartness: 5,
		cost: 15.0,
		outputCost: 75.0,
		bestFor: ['critical-accuracy']
	},
	'openai/gpt-4o': {
		speed: 2,
		smartness: 4.5,
		cost: 2.5,
		outputCost: 10.0,
		bestFor: ['json-mode', 'general-purpose']
	}
};
```

### 2.2 Model Profile Interface

```typescript
export interface ModelProfile {
	id: string; // Unique model identifier
	name: string; // Display name
	speed: number; // 1-5 (5 = fastest)
	smartness: number; // 1-5 (5 = smartest)
	creativity?: number; // 1-5 (for text generation)
	cost: number; // per 1M input tokens (USD)
	outputCost: number; // per 1M output tokens (USD)
	provider: string; // Provider name
	bestFor: string[]; // Use case tags
	limitations?: string[]; // Known limitations
}
```

### 2.3 Model Selection Algorithm

```typescript
private selectJSONModels(
  profile: JSONProfile,
  complexity: string,
  requirements?: {
    maxLatency?: number;
    minAccuracy?: number;
    maxCost?: number;
  }
): string[] {
  // 1. Validate profile and get base models
  const profileModels = JSON_PROFILE_MODELS[profile];
  let models = [...profileModels];

  // 2. Adjust based on complexity
  if (complexity === 'complex' && profile === 'fast') {
    // Upgrade to balanced for complex tasks
    models = [...JSON_PROFILE_MODELS.balanced];
  } else if (complexity === 'simple' && profile === 'powerful') {
    // Can use faster models for simple tasks
    models = ['deepseek/deepseek-chat', ...models];
  }

  // 3. For custom requirements, calculate best models
  if (profile === 'custom' && requirements) {
    return this.selectModelsByRequirements(JSON_MODELS, requirements, 'json');
  }

  return models;
}

private selectModelsByRequirements(
  modelPool: Record<string, ModelProfile>,
  requirements: any,
  type: 'json' | 'text'
): string[] {
  // Filter by requirements
  const eligible = models.filter((model) => {
    if (requirements.maxCost && model.cost > requirements.maxCost) return false;
    if (requirements.minAccuracy && model.smartness < requirements.minAccuracy) return false;
    return true;
  });

  // Score models: (smartness * weight + speed) / cost
  const scored = eligible.map((model) => {
    const score = type === 'json'
      ? (model.smartness * 2 + model.speed) / model.cost
      : (model.smartness + model.speed + (model.creativity || model.smartness)) / model.cost;
    return { model, score };
  });

  // Return top 3 by value score
  return scored.sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.model.id);
}
```

---

## 3. OpenRouter Integration & API Calls

### 3.1 OpenRouter API Configuration

**Base URL**: `https://openrouter.ai/api/v1/chat/completions`

**Required Headers**:

```typescript
const headers = {
	Authorization: `Bearer ${this.apiKey}`,
	'Content-Type': 'application/json',
	'HTTP-Referer': this.httpReferer, // Required for free tier
	'X-Title': this.appName // Application identifier
};
```

### 3.2 Request Body Structure

```typescript
private async callOpenRouter(params: {
  model: string;                        // Primary model
  models?: string[];                    // Alternative models for routing
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;                 // 0.0-2.0
  max_tokens?: number;                  // Max output tokens
  response_format?: { type: 'json_object' };
  stream?: boolean;                     // Enable streaming
  route?: 'fallback';                   // Routing strategy
  provider?: any;                       // Provider preferences
}): Promise<OpenRouterResponse>
```

**Request Body Construction**:

```typescript
const body: any = {
	model: params.model,
	messages: params.messages,
	temperature: params.temperature,
	max_tokens: params.max_tokens,
	stream: params.stream || false,
	transforms: ['middle-out'] // Cost compression
};

// Add response format if supported
if (params.response_format) {
	body.response_format = params.response_format;
}

// Add model routing for fallback capability
if (params.models && params.models.length > 1) {
	body.models = params.models;
	body.route = params.route || 'fallback';
}

// Add provider routing preferences
if (params.provider) {
	body.provider = params.provider;
}

// Timeout: 2 minutes
fetch(this.apiUrl, {
	method: 'POST',
	headers,
	body: JSON.stringify(body),
	signal: AbortSignal.timeout(120000)
});
```

### 3.3 OpenRouter Response Structure

```typescript
interface OpenRouterResponse {
	id: string; // Request ID
	provider?: string; // Actual provider used
	model: string; // Actual model used
	object: string; // 'text_completion'
	created: number; // Unix timestamp
	choices: Array<{
		message: {
			content: string; // Response text
			role: string;
		};
		finish_reason: string; // 'stop', 'length', 'tool_calls'
		native_finish_reason?: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		prompt_tokens_details?: {
			cached_tokens?: number; // Prompt caching info
		};
		completion_tokens_details?: {
			reasoning_tokens?: number;
		};
	};
	system_fingerprint?: string; // Model configuration hash
}
```

### 3.4 Provider Routing Preferences

```typescript
private getProviderPreferences(profile: JSONProfile | TextProfile): any {
  switch (profile) {
    case 'fast':
    case 'speed':
      return {
        order: ['x-ai', 'google', 'openai', 'groq', 'deepseek'],
        allow_fallbacks: true,
        data_collection: 'allow'  // Allow for faster routing
      };

    case 'balanced':
      return {
        order: ['openai', 'google', 'deepseek', 'x-ai', 'anthropic'],
        allow_fallbacks: true,
        require_parameters: true,  // Support our specific parameters
        data_collection: 'deny'   // Privacy focused
      };

    case 'powerful':
    case 'quality':
      return {
        order: ['anthropic', 'openai', 'x-ai', 'google', 'deepseek'],
        allow_fallbacks: true,
        require_parameters: true,
        data_collection: 'deny'
      };

    case 'maximum':
    case 'creative':
      return {
        order: ['anthropic', 'openai'],
        allow_fallbacks: false,   // Only use premium providers
        require_parameters: true,
        data_collection: 'deny'
      };
  }
}
```

---

## 4. JSON Response Handling & Validation

### 4.1 JSON Request Options

```typescript
export interface JSONRequestOptions<T> {
	systemPrompt: string; // System instructions
	userPrompt: string; // User input
	userId: string; // For tracking
	profile?: JSONProfile; // Model selection strategy
	temperature?: number; // Default: 0.2 (low variance)
	validation?: {
		retryOnParseError?: boolean; // Retry with powerful model
		validateSchema?: boolean; // Schema validation (not implemented)
		maxRetries?: number; // Default: 2
	};
	requirements?: {
		maxLatency?: number; // Max response time (ms)
		minAccuracy?: number; // Min smartness score
		maxCost?: number; // Max cost per request
	};
	// Context for usage tracking
	operationType?: string; // 'brain_dump', 'task_synthesis', etc.
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
}
```

### 4.2 JSON Mode Support

```typescript
private supportsJsonMode(modelId: string): boolean {
  const jsonModeModels = [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'deepseek/deepseek-chat',
    'qwen/qwen-2.5-72b-instruct',
    'google/gemini-flash-1.5',
    'google/gemini-2.0-flash-001',
    'x-ai/grok-4-fast',
    'x-ai/grok-4-fast:free',
    'z-ai/glm-4.6'
  ];
  return jsonModeModels.includes(modelId);
}
```

### 4.3 System Prompt Enhancement for JSON

```typescript
private enhanceSystemPromptForJSON(originalPrompt: string): string {
  const jsonInstructions = `
You must respond with valid JSON only. Follow these rules:
1. Output ONLY valid JSON - no text before or after
2. Ensure all strings are properly escaped
3. Use null for missing values, not undefined
4. Numbers should not be quoted unless they're meant to be strings
5. Boolean values should be true/false (lowercase, not quoted)
6. CRITICAL: NO trailing commas after the last item in objects or arrays

`;
  return jsonInstructions + originalPrompt;
}
```

### 4.4 JSON Response Cleaning & Parsing

````typescript
private cleanJSONResponse(raw: string): string {
  let cleaned = raw.trim();

  // Remove markdown code blocks
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

  // Extract JSON from text
  const jsonStart = cleaned.indexOf('{');
  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart);
  }

  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonEnd > -1 && jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.slice(0, jsonEnd + 1);
  }

  // Fix common LLM JSON errors
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

  return cleaned.trim();
}

// Usage in getJSONResponse():
try {
  const cleaned = this.cleanJSONResponse(content);
  const result = JSON.parse(cleaned) as T;
} catch (parseError) {
  // Enhanced error logging with context
  if (parseError instanceof SyntaxError && parseError.message.includes('position')) {
    const posMatch = parseError.message.match(/position (\d+)/);
    if (posMatch) {
      const errorPos = parseInt(posMatch[1]);
      const contextStart = Math.max(0, errorPos - 100);
      const contextEnd = Math.min(cleaned.length, errorPos + 100);
      console.error(`Context around position ${errorPos}:`,
        cleaned.substring(contextStart, contextEnd));
    }
  }

  // Retry with powerful model if validation enabled
  if (options.validation?.retryOnParseError && retryCount < maxRetries) {
    retryCount++;
    const retryResponse = await this.callOpenRouter({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: enhancedSystemPrompt },
        { role: 'user', content: options.userPrompt }
      ],
      temperature: 0.1,  // Lower for consistency
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      route: 'fallback'
    });

    const retryContent = retryResponse.choices[0].message.content;
    const cleanedRetry = this.cleanJSONResponse(retryContent);
    result = JSON.parse(cleanedRetry) as T;
  }
}
````

---

## 5. Prompt Template Management

### 5.1 PromptTemplateService Overview

**Location**: `/apps/web/src/lib/services/promptTemplate.service.ts` (2070 lines)

**Key Responsibilities**:

- Generate optimized prompts for different operations (brain dumps, task extraction, phase generation)
- Manage template variables and substitution
- Build context frameworks for projects and tasks
- Handle both new and existing project flows

### 5.2 Prompt Components Architecture

**Location**: `/apps/web/src/lib/services/prompts/core/prompt-components.ts`

**Atomic Components** (reusable building blocks):

```typescript
// Date parsing with natural language conversion
generateDateParsing(baseDate?: string): string

// Recurring task validation rules
generateRecurringTaskRules(): string

// Project context framework (full or condensed)
generateProjectContextFramework(mode: 'full' | 'condensed'): string

// Question generation instructions
generateQuestionGenerationInstructions(options?: { includeFormat?: boolean }): string

// Decision matrix criteria for project creation
getDecisionMatrixUpdateCriteria(): string

// Operation ID generation
generateOperationId(type: string): string

// Data model components (projects, tasks, phases)
DataModelsComponent.getProjectModel()
DataModelsComponent.getTaskModel()
DataModelsComponent.getTaskUpdateModel()
DataModelsComponent.getTaskCreateModel(projectId)
DataModelsComponent.getProjectUpdateModel(projectId)
```

### 5.3 Optimized Prompt Examples

**New Project Brain Dump** (45% smaller):

```typescript
getOptimizedNewProjectPrompt(processingDateTime?: string): string

// Structure:
// 1. Objective: Transform braindump → CREATE PROJECT with tasks
// 2. Critical rules: Extract ONLY explicitly mentioned tasks
// 3. Data models for projects, tasks, recurring tasks
// 4. Context framework for capturing strategy
// 5. Operation ID instructions for tracking
// 6. Output format with JSON schema
```

**Existing Project Brain Dump** (50% smaller):

```typescript
getOptimizedExistingProjectPrompt(
  projectId: string,
  projectStartDate?: string,
  processingDateTime?: string
): string

// Structure:
// 1. Objective: Process braindump → UPDATE existing OR CREATE new items
// 2. Task creation rules and update logic
// 3. Data models for task updates/creates
// 4. Output format with operation IDs
```

**Phase Generation** (Dynamic):

```typescript
buildPhaseGenerationSystemPrompt(
  schedulingMethod: string = 'schedule_in_phases',
  includeRecurring: boolean = false,
  allowReschedule: boolean = false,
  preserveExistingDates: boolean = false,
  userInstructions?: string,
  preservedPhases?: any[]
): string

// Key Sections:
// 1. Core organization principles
// 2. Phase design strategy (count, content, distribution)
// 3. Intelligent organization (priority logic, timeline strategy)
// 4. Output requirements with JSON format
// 5. Scheduling method specific instructions
```

### 5.4 Prompt Optimization Strategies

**Dynamic Complexity Analysis**:

```typescript
private analyzeComplexity(text: string): 'simple' | 'moderate' | 'complex' {
  const length = text.length;
  const hasNestedStructure = /\[\{|\{\[|":\s*\{|":\s*\[/.test(text);
  const hasComplexLogic = /if|when|decision|analyze|evaluate|extract/i.test(text);
  const hasMultipleSteps = /step \d|first.*then|phase|stage/i.test(text);

  if (length > 8000 || (hasNestedStructure && hasComplexLogic)) return 'complex';
  if (length > 3000 || hasComplexLogic || hasMultipleSteps) return 'moderate';
  return 'simple';
}
```

**Response Length Estimation**:

```typescript
private estimateResponseLength(prompt: string): number {
  const promptLength = prompt.length;
  if (promptLength < 200) return 500;
  if (promptLength < 1000) return 1500;
  if (promptLength < 5000) return 3000;
  return 5000;
}
```

---

## 6. Error Handling & Retry Patterns

### 6.1 Multi-Layer Error Handling

**Layer 1: Parse Errors (JSON)**

```typescript
// In getJSONResponse():
try {
	const cleaned = this.cleanJSONResponse(content);
	const result = JSON.parse(cleaned) as T;
} catch (parseError) {
	// Enhanced error logging with position info
	if (parseError instanceof SyntaxError && parseError.message.includes('position')) {
		// Extract and log context around error position
	}

	// Retry with more powerful model if enabled
	if (options.validation?.retryOnParseError && retryCount < maxRetries) {
		retryCount++;
		// Upgrade to Claude 3.5 Sonnet or GPT-4o for retry
		// Lower temperature (0.1) for consistency
	} else {
		// Log parse failure without retry
		if (this.errorLogger) {
			await this.errorLogger.logAPIError(parseError, this.apiUrl, 'POST', options.userId, {
				operation: 'getJSONResponse_parse_failure',
				errorType: 'llm_json_parse_failure',
				modelUsed: actualModel,
				responseLength: cleaned.length,
				retryDisabled: !options.validation?.retryOnParseError
			});
		}
	}
}
```

**Layer 2: API Errors**

```typescript
// In callOpenRouter():
if (!response.ok) {
	const error = await response.text();
	throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
}

// Timeout handling
if (error instanceof Error && error.name === 'AbortError') {
	if (this.errorLogger) {
		await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', undefined, {
			operation: 'callOpenRouter_timeout',
			errorType: 'llm_api_timeout',
			modelRequested: params.model,
			alternativeModels: params.models?.join(', ') || 'none',
			timeoutMs: 120000
		});
	}
	throw new Error(`Request timeout for model ${params.model}`);
}
```

**Layer 3: Integration Errors**

```typescript
// In getJSONResponse() catch block:
catch (error) {
  const duration = performance.now() - startTime;
  const requestCompletedAt = new Date();

  console.error(`OpenRouter request failed:`, error);

  // Log to error tracking system
  if (this.errorLogger) {
    await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', options.userId, {
      operation: 'getJSONResponse',
      errorType: 'llm_api_request_failure',
      modelRequested: preferredModels[0],
      profile,
      complexity,
      isTimeout: lastError.message.includes('timeout'),
      projectId: options.projectId,
      brainDumpId: options.brainDumpId
    });
  }

  // Log failure to database (async, non-blocking)
  this.logUsageToDatabase({
    status: lastError.message.includes('timeout') ? 'timeout' : 'failure',
    errorMessage: lastError.message,
    // ... other parameters
  }).catch((err) => console.error('Failed to log error:', err));

  throw new Error(`Failed to generate valid JSON: ${lastError?.message}`);
}
```

### 6.2 Retry Strategy

**Exponential Backoff** (default: not implemented but recommended):

```typescript
// Configuration available
const maxRetries = options.validation?.maxRetries || 2;
// Each retry uses more capable model:
// Attempt 1: Profile-based model selection
// Attempt 2: Claude 3.5 Sonnet (powerful, reliable JSON)
// Attempt 3: GPT-4o (fallback)
```

**Selective Retry**:

- Only retry on `retryOnParseError: true`
- Upgrades to more capable model (not just same model)
- Lowers temperature (0.2 → 0.1) for consistency
- Maximum 2 retries by default

### 6.3 Error Logging

**Database Logging** (`logUsageToDatabase`):

```typescript
private async logUsageToDatabase(params: {
  userId: string;
  operationType: string;
  modelRequested: string;
  modelUsed: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  responseTimeMs: number;
  requestStartedAt: Date;
  requestCompletedAt: Date;
  status: 'success' | 'failure' | 'timeout' | 'rate_limited' | 'invalid_response';
  errorMessage?: string;
  temperature?: number;
  maxTokens?: number;
  profile?: string;
  streaming?: boolean;
  projectId?: string;
  brainDumpId?: string;
  taskId?: string;
  briefId?: string;
  openrouterRequestId?: string;
  openrouterCacheStatus?: string;
  rateLimitRemaining?: number;
  metadata?: any;
}): Promise<void>
```

**Stored in Table**: `llm_usage_logs` with comprehensive tracking.

---

## 7. Cost Tracking & Usage Logging

### 7.1 Cost Calculation

```typescript
private calculateCost(model: string, usage?: any): string {
  if (!usage) return 'N/A';

  const modelConfig = JSON_MODELS[model] || TEXT_MODELS[model];
  if (!modelConfig) return 'Unknown';

  // Cost = (tokens / 1M) * cost_per_million
  const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * modelConfig.cost;
  const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost;
  const totalCost = inputCost + outputCost;

  return `$${totalCost.toFixed(6)}`;
}
```

**Cost Tracking Metrics**:

- Input token cost (prompt tokens)
- Output token cost (completion tokens)
- Per-model aggregation
- Per-operation aggregation
- Cache hit tracking (cached_tokens in usage)

### 7.2 Performance Metrics

```typescript
private trackPerformance(model: string, duration: number): void {
  const history = this.performanceMetrics.get(model) || [];
  history.push(duration);

  // Keep last 20 measurements for rolling average
  if (history.length > 20) {
    history.shift();
  }

  this.performanceMetrics.set(model, history);
}

getPerformanceReport(): Map<string, {
  avg: number;    // Average response time (ms)
  min: number;    // Minimum response time
  max: number;    // Maximum response time
  count: number;  // Number of requests
}>
```

### 7.3 LLM Usage Service

**Location**: `/apps/web/src/lib/services/llm-usage.service.ts`

```typescript
export class LLMUsageService {
	// Get usage summary for date range
	async getUserUsage(userId: string, startDate: Date, endDate: Date): Promise<UsageSummary>;

	// Get daily usage breakdown
	async getDailyUsage(userId: string, startDate: Date, endDate: Date): Promise<DailyUsage[]>;

	// Get model breakdown and costs
	async getModelBreakdown(
		userId: string,
		startDate: Date,
		endDate: Date
	): Promise<ModelBreakdown[]>;

	// Get operation type breakdown
	async getOperationBreakdown(userId: string, startDate: Date, endDate: Date);

	// Get project-specific usage
	async getProjectUsage(projectId: string, startDate?: Date, endDate?: Date);

	// Convenience methods
	async getTodayUsage(userId: string);
	async getCurrentMonthUsage(userId: string);
	async checkCostThreshold(userId: string, threshold: number): Promise<boolean>;
}
```

### 7.4 Usage Logging Context

Every LLM call tracks:

- **Operation Type**: 'brain_dump', 'task_synthesis', 'chat_stream', 'project_context'
- **Project ID**: For project-specific cost tracking
- **User ID**: For per-user usage aggregation
- **Request/Response Timing**: Start and end timestamps
- **Cache Status**: Hit/miss for prompt caching
- **Reasoning Tokens**: For reasoning models (o1, etc.)
- **Model Metadata**: Fingerprint, provider, actual model used

---

## 8. Text Generation & Streaming

### 8.1 Text Generation Method

```typescript
async generateText(options: TextGenerationOptions): Promise<string> {
  // 1. Estimate response length
  const estimatedLength = this.estimateResponseLength(options.prompt);

  // 2. Select optimal models
  const preferredModels = this.selectTextModels(
    profile,
    estimatedLength,
    options.requirements
  );

  // 3. Call OpenRouter with streaming disabled
  const response = await this.callOpenRouter({
    model: preferredModels[0],
    models: preferredModels,
    messages: [
      { role: 'system', content: options.systemPrompt || defaultPrompt },
      { role: 'user', content: options.prompt }
    ],
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 4096,
    stream: false,  // Non-streaming by default
    route: 'fallback',
    provider: providerPrefs
  });

  // 4. Extract and return content
  return response.choices[0].message.content;
}
```

### 8.2 Streaming Method for Chat

```typescript
async *streamText(options: {
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>;
  tools?: any[];
  tool_choice?: 'auto' | 'none' | 'required';
  userId: string;
  profile?: TextProfile;
  temperature?: number;
  maxTokens?: number;
  sessionId?: string;
  messageId?: string;
}): AsyncGenerator<{
  type: 'text' | 'tool_call' | 'done' | 'error';
  content?: string;
  tool_call?: any;
  usage?: any;
  error?: string;
  finished_reason?: string;
}>
```

**Streaming Features**:

- SSE (Server-Sent Events) handling with TextDecoder
- Real-time token streaming
- Tool call detection and aggregation
- Usage tracking from final chunk
- Graceful error handling with yields

**Tool Call Processing**:

```typescript
// Accumulate tool call arguments across chunks
if (delta.tool_calls && delta.tool_calls[0]) {
  const toolCallDelta = delta.tool_calls[0];

  if (!currentToolCall) {
    currentToolCall = {
      id: toolCallDelta.id,
      type: 'function',
      function: {
        name: toolCallDelta.function?.name || '',
        arguments: ''
      }
    };
  }

  if (toolCallDelta.function?.arguments) {
    currentToolCall.function.arguments += toolCallDelta.function.arguments;
  }

  // Yield when complete
  if (this.isCompleteJSON(currentToolCall.function.arguments)) {
    yield { type: 'tool_call', tool_call: currentToolCall };
    currentToolCall = null;
  }
}
```

---

## 9. Advanced Features & Optimizations

### 9.1 Prompt Caching Support

```typescript
// OpenRouter supports prompt caching via OpenAI compatibility
usage: {
  prompt_tokens_details?: {
    cached_tokens?: number;   // Tokens from cache
  }
}

// Calculate cache hit rate
const cachedTokens = response.usage?.prompt_tokens_details?.cached_tokens || 0;
const cacheHitRate = data.usage?.prompt_tokens
  ? ((cachedTokens / data.usage.prompt_tokens) * 100).toFixed(1)
  : '0.0';
```

**Benefits**:

- 90% cost reduction for cached tokens
- Lower latency on subsequent requests
- Transparent to application

### 9.2 Cost Compression

```typescript
// OpenRouter "middle-out" transform
const body: any = {
	// ... other params
	transforms: ['middle-out'] // Compression for cost reduction
};
```

### 9.3 Embedding Support

```typescript
// Note: Uses OpenAI API directly (not OpenRouter)
async generateEmbedding(text: string, openAIApiKey: string): Promise<number[]>
async generateEmbeddings(texts: string[], openAIApiKey: string): Promise<number[][]>

// Uses: text-embedding-3-small model
```

### 9.4 Profile Selection Helper

```typescript
static selectProfile(context: {
  taskCount?: number;
  complexity?: 'simple' | 'moderate' | 'complex';
  priority?: 'speed' | 'quality' | 'cost';
  isProduction?: boolean;
}): { json: JSONProfile; text: TextProfile }

// Example:
const profiles = SmartLLMService.selectProfile({
  taskCount: 15,
  complexity: 'complex',
  priority: 'quality',
  isProduction: true
});
// Returns: { json: 'powerful', text: 'quality' }
```

---

## 10. Practical Integration Examples

### 10.1 JSON Response - Brain Dump Processing

```typescript
const llmService = new SmartLLMService({
	supabase,
	appName: 'BuildOS Brain Dump Processor'
});

const result = await llmService.getJSONResponse<BrainDumpResult>({
	systemPrompt: promptTemplate.getNewProjectTaskExtractionPrompt(),
	userPrompt: userBrainDump,
	userId: user.id,
	profile: 'balanced', // Cost-effective for typical brain dumps
	temperature: 0.2, // Low variance for consistency
	validation: {
		retryOnParseError: true,
		maxRetries: 2
	},
	operationType: 'brain_dump_extraction',
	brainDumpId: brainDump.id,
	projectId: project?.id
});
```

### 10.2 Text Generation - Daily Brief

```typescript
const briefText = await llmService.generateText({
	prompt: briefDataPrompt,
	systemPrompt: dailyBriefTemplate,
	userId: user.id,
	profile: 'quality', // High-quality narrative
	temperature: 0.7, // Allow some creativity
	maxTokens: 2000,
	operationType: 'daily_brief_generation',
	projectId: project.id
});
```

### 10.3 Streaming - Chat Response

```typescript
const stream = llmService.streamText({
	messages: conversationHistory,
	tools: availableTools,
	userId: user.id,
	profile: 'speed', // Fast chat responses
	temperature: 0.8, // Some personality
	sessionId: chatSession.id,
	messageId: newMessage.id
});

for await (const chunk of stream) {
	if (chunk.type === 'text') {
		// Stream text to client
		emit('text', chunk.content);
	} else if (chunk.type === 'tool_call') {
		// Handle tool call
		const result = await executeTool(chunk.tool_call);
	} else if (chunk.type === 'done') {
		// Final usage stats
		await logUsage(chunk.usage);
	}
}
```

### 10.4 Cost Tracking

```typescript
const usageService = new LLMUsageService(supabase);

// Get today's usage
const todayUsage = await usageService.getTodayUsage(userId);
console.log(`Today: $${todayUsage?.totalCost}, ${todayUsage?.totalRequests} requests`);

// Check if over budget
const isOverBudget = await usageService.checkCostThreshold(userId, 10.0);

// Get breakdown by model
const modelBreakdown = await usageService.getModelBreakdown(
	userId,
	new Date('2025-10-01'),
	new Date('2025-10-31')
);
// Returns: Array of { model, requests, cost, tokens, avgResponseTime }
```

---

## 11. Best Practices for Conversational Agent

### 11.1 Model Selection Strategy

**For Conversational Agent**:

```typescript
// Use 'speed' profile for fast turnaround
const models = this.selectTextModels('speed', 'chat', {
	maxLatency: 2000 // 2-second response time requirement
});

// Provider order for chat: fast first, then quality
const providerPrefs = {
	order: ['groq', 'google', 'deepseek', 'anthropic'],
	allow_fallbacks: true,
	data_collection: 'allow' // Allow for faster routing
};
```

### 11.2 Streaming Best Practices

**For Real-time Chat UX**:

```typescript
// Always use streaming for interactive experiences
const stream = await llmService.streamText({
  messages: [...],
  userId: user.id,
  profile: 'speed',      // Fast responses
  temperature: 0.8,      // Conversational warmth
  maxTokens: 2000,       // Reasonable limit
  sessionId: session.id  // Track conversation
});

// Buffer and stream to client
let buffer = '';
for await (const chunk of stream) {
  if (chunk.type === 'text') {
    buffer += chunk.content;
    // Emit to client for real-time display
    socket.emit('chunk', { content: chunk.content, buffered: buffer.length });
  }
}
```

### 11.3 Error Handling for Chat

```typescript
try {
  const response = await llmService.generateText({...});
} catch (error) {
  if (error.message.includes('timeout')) {
    // Suggest fallback or simpler request
    return "I'm taking a bit longer than usual. Could you try a shorter question?";
  } else if (error.message.includes('rate')) {
    // Rate limited
    return "I'm experiencing high demand. Please try again in a moment.";
  } else {
    // Generic error
    return "I encountered an error. Please try again.";
  }
}
```

### 11.4 Token Budget Management

```typescript
// Estimate tokens before making request
const estimatedTokens = prompt.length / 4; // Rough estimate

if (estimatedTokens > MAX_TOKENS_PER_REQUEST) {
	// Truncate or summarize prompt
	const summarized = await summarizePrompt(prompt);
	return await llmService.generateText({
		prompt: summarized
		// ...
	});
}
```

---

## 12. Key Files Reference

| Component                | Location                                                       | Lines | Purpose                                |
| ------------------------ | -------------------------------------------------------------- | ----- | -------------------------------------- |
| SmartLLMService (Web)    | `/apps/web/src/lib/services/smart-llm-service.ts`              | 1786  | Main LLM integration service           |
| SmartLLMService (Worker) | `/apps/worker/src/lib/services/smart-llm-service.ts`           | 960   | Simplified version for background jobs |
| PromptTemplateService    | `/apps/web/src/lib/services/promptTemplate.service.ts`         | 2070  | Prompt generation and management       |
| Prompt Components        | `/apps/web/src/lib/services/prompts/core/prompt-components.ts` | Large | Reusable prompt building blocks        |
| LLM Usage Service        | `/apps/web/src/lib/services/llm-usage.service.ts`              | 317   | Cost tracking and usage analytics      |
| LLM Types                | `/apps/web/src/lib/types/llm.ts`                               | 57    | Type definitions                       |
| LLM Utils                | `/apps/web/src/lib/utils/llm-utils.ts`                         | 34    | Utility functions for model selection  |
| Prompt Enhancer          | `/apps/web/src/lib/services/promptEnhancer.service.ts`         | 192   | User context enhancement for prompts   |
| Tool Instructions        | `/apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`              | 341   | Chat system tool specifications        |

---

## 13. Critical Implementation Notes

### 13.1 Temperature Settings

- **JSON**: 0.2 (low variance for structured output)
- **Text**: 0.7 (balanced creativity)
- **Chat**: 0.8 (conversational warmth)
- **Retry**: 0.1 (maximum consistency)

### 13.2 Model Costs (approximations)

| Model                 | Input  | Output | Best For    |
| --------------------- | ------ | ------ | ----------- |
| Grok 4 Free           | Free   | Free   | Prototyping |
| Gemini 2.5 Flash Lite | $0.1M  | $0.4M  | Speed       |
| DeepSeek Chat         | $0.14M | $0.28M | Balance     |
| GPT-4o Mini           | $0.15M | $0.6M  | JSON        |
| Claude 3.5 Sonnet     | $3.0M  | $15.0M | Quality     |
| Claude 3 Opus         | $15.0M | $75.0M | Maximum     |

### 13.3 Timeout Configuration

- **API Call**: 120 seconds (2 minutes)
- **Recommended for chat**: 30 seconds (user-facing)
- **Background jobs**: 300+ seconds (worker service)

### 13.4 Rate Limiting Awareness

- OpenRouter tracks: `x-ratelimit-requests-remaining`
- Logged in usage tracking for monitoring
- Graceful degradation: Fall back to slower models

---

## 14. Database Integration

### 14.1 Usage Logging Table

**Table**: `llm_usage_logs`

**Key Columns**:

- `user_id`: User identifier
- `operation_type`: Type of operation (brain_dump, task_synthesis, etc.)
- `model_requested` vs `model_used`: For tracking fallbacks
- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `input_cost_usd`, `output_cost_usd`, `total_cost_usd`
- `response_time_ms`: For performance tracking
- `status`: 'success', 'failure', 'timeout', 'rate_limited'
- `profile`: Which profile was used
- `project_id`, `brain_dump_id`, `task_id`, `brief_id`: Operation context
- `openrouter_request_id`: For debugging
- `openrouter_cache_status`: Cache hit/miss

### 14.2 Usage Summary Tables

**Table**: `llm_usage_summary`

- Daily aggregations
- By operation type
- By model
- Success rates

---

## 15. Security Considerations

### 15.1 API Key Management

```typescript
// Use environment variable only (never hardcode)
const apiKey = PRIVATE_OPENROUTER_API_KEY;

// Validate API key exists
if (!apiKey) {
	throw new Error('Missing PRIVATE_OPENROUTER_API_KEY for SmartLLMService');
}
```

### 15.2 User ID Validation

```typescript
private normalizeUserIdForLogging(userId?: string | null): string | null {
  if (!userId) return null;
  const trimmed = userId.trim();
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(trimmed) ? trimmed : null;
}
```

### 15.3 Error Logging Safety

- Never log full prompts (user data)
- Log only metadata and error types
- Use error categories rather than full messages
- Sanitize before third-party logging

---

## Conclusion

BuildOS implements a sophisticated, production-ready LLM integration system with:

1. **Intelligent Model Routing**: Dynamic selection based on complexity, cost, and requirements
2. **Comprehensive Error Handling**: Multi-layer validation, retry logic, detailed logging
3. **Cost Optimization**: Token-level tracking, prompt caching support, cost-aware model selection
4. **Flexible Prompt Management**: Modular components, reusable templates, context adaptation
5. **Full Observability**: Usage tracking, performance metrics, error logging
6. **Streaming Support**: Real-time responses with tool integration
7. **Production Patterns**: Async logging, error isolation, graceful degradation

For the conversational agent, leverage the streaming interface with the 'speed' profile, implement progressive tool call handling, and use the comprehensive error handling patterns for robust user experience.
