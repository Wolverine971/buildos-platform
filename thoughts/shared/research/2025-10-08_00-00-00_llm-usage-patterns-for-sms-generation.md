---
title: 'LLM Usage Patterns in BuildOS - Research for SMS Message Generation'
date: 2025-10-08
author: Claude (AI Assistant)
tags: [research, llm, ai, sms, prompts, architecture]
status: completed
related_files:
    - /apps/web/src/lib/services/smart-llm-service.ts
    - /apps/worker/src/lib/services/smart-llm-service.ts
    - /apps/worker/src/workers/brief/prompts.ts
    - /apps/worker/src/workers/brief/briefGenerator.ts
    - /apps/worker/src/workers/onboarding/prompts.ts
purpose: 'Document LLM service patterns, prompt engineering techniques, and configuration options that can be adapted for SMS message generation'
path: thoughts/shared/research/2025-10-08_00-00-00_llm-usage-patterns-for-sms-generation.md
---

# LLM Usage Patterns in BuildOS Codebase

## Executive Summary

BuildOS uses a sophisticated **SmartLLMService** that provides intelligent model selection, cost optimization, and fallback routing through OpenRouter. The system prioritizes **DeepSeek Chat V3** for cost-effectiveness ($0.14/1M input tokens, $0.28/1M output) while maintaining high quality. The codebase demonstrates excellent prompt engineering patterns, particularly in the daily brief and onboarding systems.

**Key Finding for SMS Generation**: The system uses temperature 0.4-0.7 for text generation, "quality" profile for important content, and sophisticated prompt templates with clear structure, tone guidelines, and expected outcomes.

---

## 1. SmartLLMService Architecture

### 1.1 Service Location & Implementation

**Files:**

- `/apps/web/src/lib/services/smart-llm-service.ts` (Web version)
- `/apps/worker/src/lib/services/smart-llm-service.ts` (Worker version)

Both versions share the same architecture with minor differences in model availability and database logging.

### 1.2 Core Service Features

```typescript
export class SmartLLMService {
	// Configuration
	private apiKey: string;
	private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
	private supabase?: SupabaseClient<Database>; // Optional logging

	constructor(config?: {
		httpReferer?: string;
		appName?: string;
		supabase?: SupabaseClient<Database>;
		apiKey?: string;
	});
}
```

**Key Capabilities:**

1. **Dual Methods**: `getJSONResponse()` for structured data, `generateText()` for natural language
2. **Smart Routing**: Automatic model selection with fallback chains
3. **Cost Tracking**: Per-model cost and performance metrics
4. **Database Logging**: Optional usage logging to `llm_usage_logs` table
5. **Error Handling**: Automatic retries with more powerful models on parse errors

---

## 2. Model Selection & Profiles

### 2.1 Profile System

The service uses **profiles** to abstract model selection:

**JSON Profiles:**

- `fast`: Prioritizes speed (DeepSeek, Gemini 2.5 Flash Lite, GPT-4o Mini)
- `balanced`: Cost-effective quality (DeepSeek, Qwen, GPT-4o Mini)
- `powerful`: Complex reasoning (Claude 3.5 Sonnet, GPT-4o)
- `maximum`: Critical accuracy (Claude 3 Opus, GPT-4o)
- `custom`: Requirements-based selection

**Text Profiles:**

- `speed`: Ultra-fast generation (Grok 4 Fast Free, Groq Llama, Gemini Flash)
- `balanced`: Quality/cost balance (DeepSeek, Gemini 2.0 Flash, GPT-4o Mini)
- `quality`: High-quality writing (Claude 3.5 Sonnet, DeepSeek)
- `creative`: Creative content (Claude 3 Opus, Claude 3.5 Sonnet)
- `custom`: Requirements-based

### 2.2 Model Configurations

**Primary Models Used in BuildOS:**

```typescript
// DeepSeek Chat V3 - PRIMARY MODEL (used for daily briefs)
{
  id: "deepseek/deepseek-chat",
  name: "DeepSeek Chat V3",
  speed: 3.5,
  smartness: 4.5,
  cost: 0.14,          // per 1M input tokens
  outputCost: 0.28,    // per 1M output tokens
  bestFor: ["briefs", "reports", "structured-content", "complex-json"]
}

// Grok 4 Fast (Free) - FREE OPTION
{
  id: "x-ai/grok-4-fast:free",
  name: "Grok 4 Fast (Free)",
  speed: 4.8,
  smartness: 4.3,
  cost: 0.0,
  outputCost: 0.0,
  bestFor: ["free-tier", "fast-generation", "reasoning"]
}

// GPT-4o Mini - FALLBACK
{
  id: "openai/gpt-4o-mini",
  speed: 4,
  smartness: 4,
  cost: 0.15,
  outputCost: 0.6
}
```

### 2.3 Automatic Profile Selection

```typescript
static selectProfile(context: {
  taskCount?: number;
  complexity?: 'simple' | 'moderate' | 'complex';
  priority?: 'speed' | 'quality' | 'cost';
  isProduction?: boolean;
}): { json: JSONProfile; text: TextProfile }
```

**Example Usage:**

```typescript
const profiles = SmartLLMService.selectProfile({
	complexity: 'moderate',
	priority: 'quality',
	isProduction: true
});
// Returns: { json: 'powerful', text: 'quality' }
```

---

## 3. Text Generation Method (For SMS)

### 3.1 Method Signature

```typescript
async generateText(options: TextGenerationOptions): Promise<string>

interface TextGenerationOptions {
  prompt: string;
  userId: string;
  profile?: TextProfile;          // speed|balanced|quality|creative|custom
  systemPrompt?: string;
  temperature?: number;           // 0.0 - 2.0
  maxTokens?: number;             // Max output tokens
  streaming?: boolean;            // Enable streaming
  requirements?: {
    maxLatency?: number;
    minQuality?: number;
    maxCost?: number;
  };
  // Optional context for usage tracking
  operationType?: string;
  projectId?: string;
  brainDumpId?: string;
  taskId?: string;
  briefId?: string;
}
```

### 3.2 SMS-Relevant Configuration

For **SMS message generation**, use these settings:

```typescript
const smsContent = await llmService.generateText({
	prompt: userPrompt,
	userId: userId,
	profile: 'quality', // High-quality, concise writing
	systemPrompt: smsSystemPrompt,
	temperature: 0.6, // Balanced creativity/consistency
	maxTokens: 100, // SMS is short (~160 chars = ~40 tokens)
	streaming: false, // Not needed for short messages
	operationType: 'sms_generation'
});
```

**Rationale:**

- `profile: 'quality'`: Ensures well-crafted, engaging messages
- `temperature: 0.6`: Balances personality with consistency
- `maxTokens: 100`: Generous buffer for 160-character SMS
- `streaming: false`: Unnecessary overhead for short content

---

## 4. Prompt Engineering Patterns

### 4.1 Daily Brief Analysis Prompts

**File:** `/apps/worker/src/workers/brief/prompts.ts`

#### System Prompt Pattern

```typescript
static getSystemPrompt(): string {
  return `You are a BuildOS productivity strategist who writes insightful, actionable daily brief analyses.

Your goals:
- Explain what the user should focus on today based on their current workload.
- Highlight blockers, overdue work, and meaningful recent progress.
- Summarize each active project with counts and linked task bullets so the user can dive in quickly.

Tone & format:
- Confident, encouraging, and pragmatic.
- Use Markdown with clear hierarchy and short paragraphs.
- Always include task/project links that are provided in the data. Never invent URLs.
- Keep the writing tight—avoid filler language.

Structure your response as:
1. A top-level heading for the analysis (e.g. "# Daily Brief Analysis - <Date>").
2. A section summarizing today's outlook and priorities.
3. A section called "## Active Projects" with one sub-section per project (ordered by workload or urgency).
4. Within each project, show quick stats plus bullets for "Tasks Today" and "Next 7 Days". Include counts, status cues, and links. If a list is empty, note that explicitly.
5. Mention overdue or recently completed work when it shapes today's focus.

Never output JSON—deliver polished Markdown only.`;
}
```

**Key Patterns for SMS:**

- ✅ Define clear role and personality
- ✅ Specify tone (confident, encouraging, pragmatic)
- ✅ Set formatting expectations
- ✅ Provide structure guidelines
- ✅ Explicit constraints (e.g., "Never invent URLs")

#### User Prompt Pattern

```typescript
static buildUserPrompt(input: DailyBriefAnalysisPromptInput): string {
  const { date, timezone, mainBriefMarkdown, projects, priorityActions } = input;
  const safeProjects = JSON.stringify(projects, null, 2);
  const safePriorityActions = priorityActions && priorityActions.length > 0
    ? priorityActions.join(", ")
    : "None provided";

  return `Date: ${date}
Timezone: ${timezone}

Priority actions detected: ${safePriorityActions}

Project data:
\`\`\`json
${safeProjects}
\`\`\`

Original daily brief markdown for reference:
\`\`\`markdown
${mainBriefMarkdown}
\`\`\`

Write the analysis following the system instructions.`;
}
```

**Key Patterns for SMS:**

- ✅ Structured data presentation (JSON blocks)
- ✅ Clear labeling of sections
- ✅ Final instruction reinforcing system prompt

### 4.2 Re-engagement Prompt (Highly Relevant for SMS)

**File:** `/apps/worker/src/workers/brief/prompts.ts` (Lines 111-226)

```typescript
static getSystemPrompt(daysSinceLastLogin: number): string {
  const tone = this.getToneForInactivityLevel(daysSinceLastLogin);

  return `You are a BuildOS productivity coach writing a re-engagement email to a user who hasn't logged in for ${daysSinceLastLogin} days.

Your tone should be ${tone}. Focus on:
1. Acknowledging their absence without guilt or shame
2. Highlighting what's waiting for them (tasks, projects) with specific details
3. Providing motivation to return based on their actual work context
4. Keeping the message concise, actionable, and encouraging

Structure your response:
- Start with a brief, warm greeting that acknowledges the absence
- Present a clear summary of what's waiting (use specific numbers and task names)
- For tasks starting today or overdue, emphasize their importance without creating pressure
- End with an encouraging call-to-action to return

Format in Markdown with clear sections and task links when provided.
Do NOT use placeholders - write actual personalized content based on the user's data.
Be specific about their pending work but encouraging about getting back on track.

Key guidelines:
- Never use guilt or negative framing ("You've been gone too long")
- Focus on the positive ("Your projects are ready for you")
- Highlight progress they made before leaving if available
- Make it easy to jump back in (clear next steps)`;
}
```

**Tone Selection Logic:**

```typescript
static getToneForInactivityLevel(daysSinceLastLogin: number): string {
  if (daysSinceLastLogin <= 4) {
    return "gentle and encouraging";
  } else if (daysSinceLastLogin <= 10) {
    return "motivating and action-oriented";
  } else {
    return "warm but direct with a clear value proposition";
  }
}
```

**SMS Adaptation:**

- ✅ Dynamic tone based on user context
- ✅ Empathy-first messaging ("no guilt or shame")
- ✅ Specificity over generics
- ✅ Clear call-to-action
- ✅ Positive framing

### 4.3 Onboarding Question Generation

**File:** `/apps/worker/src/workers/onboarding/prompts.ts`

**Excellent prompt structure** with:

- Clear role definition
- Framework-based thinking (6 project elements)
- Question categorization
- Context-aware depth adjustment
- JSON schema output

**Key SMS-relevant patterns:**

- Question tone guidelines (thoughtful, curious, exploratory)
- Progressive questioning (build on what they've shared)
- Avoiding redundancy
- Personalization through user data

---

## 5. Temperature & Generation Settings

### 5.1 Observed Temperature Usage

**From codebase analysis:**

```typescript
// Daily Brief Standard Analysis
temperature: 0.4; // Low variation, consistent insights

// Re-engagement Email
temperature: 0.7; // Higher engagement, more personality

// JSON Extraction
temperature: 0.2; // Minimal variation, structured output

// Retry (fallback)
temperature: 0.1; // Maximum consistency
```

### 5.2 SMS Recommendations

**For different SMS types:**

| SMS Type             | Temperature | Rationale                      |
| -------------------- | ----------- | ------------------------------ |
| Reminder (objective) | 0.3-0.4     | Consistent, clear, factual     |
| Encouragement        | 0.6-0.7     | Warm, personal, varied         |
| Re-engagement        | 0.7-0.8     | Engaging, motivating, creative |
| Notification         | 0.2-0.3     | Concise, standard, reliable    |

### 5.3 Max Tokens for SMS

**SMS Length Constraints:**

- Standard SMS: 160 characters
- Estimated tokens: ~40 tokens (4 chars/token average)
- Recommended `maxTokens`: 60-100 (buffer for safety)

---

## 6. Error Handling Patterns

### 6.1 Service-Level Error Handling

```typescript
// From briefGenerator.ts (lines 331-336)
try {
  llmAnalysis = await llmService.generateText({...});
} catch (analysisError) {
  console.error(
    "Failed to generate LLM analysis for daily brief:",
    analysisError,
  );
  // Non-blocking: continues without analysis
}
```

**Pattern:** Non-critical LLM failures don't crash the main process.

### 6.2 Automatic Retry with Escalation

```typescript
// From smart-llm-service.ts (lines 398-430)
try {
	const cleaned = this.cleanJSONResponse(content);
	result = JSON.parse(cleaned) as T;
} catch (parseError) {
	console.error(`JSON parse error with ${actualModel}:`, parseError);

	// If validation is enabled and parse failed, retry with powerful model
	if (options.validation?.retryOnParseError && retryCount < maxRetries) {
		retryCount++;
		const retryResponse = await this.callOpenRouter({
			model: 'deepseek/deepseek-chat',
			models: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'openai/gpt-4o'],
			temperature: 0.1 // Lower temperature for retry
			// ...
		});
		// Try parsing again
	}
}
```

**Pattern:**

1. First attempt with selected model
2. On failure, escalate to more capable models
3. Lower temperature on retry
4. Maximum retry limit

### 6.3 SMS Error Handling Strategy

```typescript
async function generateSMSWithFallback(params: SMSGenerationParams): Promise<string> {
	try {
		// Primary generation
		return await llmService.generateText({
			profile: 'quality',
			temperature: 0.6,
			maxTokens: 100
			// ...
		});
	} catch (primaryError) {
		console.error('Primary SMS generation failed:', primaryError);

		try {
			// Fallback: simpler prompt, lower temperature
			return await llmService.generateText({
				profile: 'balanced',
				temperature: 0.4,
				maxTokens: 80,
				systemPrompt: simplifiedSystemPrompt
				// ...
			});
		} catch (fallbackError) {
			console.error('Fallback SMS generation failed:', fallbackError);

			// Final fallback: template-based message
			return generateTemplateSMS(params);
		}
	}
}
```

---

## 7. Prompt Structure Best Practices

### 7.1 System Prompt Template

**Based on daily brief and onboarding prompts:**

```typescript
const systemPrompt = `You are a [ROLE] who [PURPOSE].

Your goals:
- [Goal 1]
- [Goal 2]
- [Goal 3]

Tone & style:
- [Tone descriptor 1]
- [Tone descriptor 2]
- [Tone descriptor 3]

Structure:
- [Structure requirement 1]
- [Structure requirement 2]

Critical constraints:
- [Constraint 1]
- [Constraint 2]

Output format: [FORMAT SPECIFICATION]`;
```

### 7.2 User Prompt Template

```typescript
const userPrompt = `[CONTEXT LABEL]: [context value]
[DATA LABEL]: [data value]

[STRUCTURED DATA SECTION]:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

[FINAL INSTRUCTION]: [reinforcement of system prompt]`;
```

### 7.3 SMS Prompt Example

**System Prompt:**

```typescript
const smsSystemPrompt = `You are a BuildOS task reminder assistant who writes friendly, concise SMS messages.

Your goals:
- Remind users about upcoming tasks without being pushy
- Include the most important context (task name, time, project)
- Create urgency for time-sensitive tasks
- Keep messages under 160 characters

Tone & style:
- Friendly and supportive
- Action-oriented
- Concise and clear
- Use emojis sparingly (1-2 max)

Structure:
- Lead with the task name or action
- Include time/deadline if relevant
- End with a clear next step or encouragement

Critical constraints:
- MUST be under 160 characters total
- No URLs or links (SMS doesn't support them well)
- Use contractions to save space
- Avoid jargon or technical terms

Output format: Plain text only, single message, no formatting.`;
```

**User Prompt:**

```typescript
const smsUserPrompt = `Task: ${task.title}
Project: ${project.name}
Start time: ${formatTime(task.start_date)}
Priority: ${task.priority}
Description: ${task.description?.substring(0, 100)}

Current time: ${currentTime}
Time until task: ${timeUntil}

Write a reminder SMS for this task. Be encouraging and specific.`;
```

---

## 8. Cost Optimization Strategies

### 8.1 Model Selection for Cost

**DeepSeek-First Strategy:**

```typescript
// From worker smart-llm-service.ts profile mappings
const JSON_PROFILE_MODELS: Record<JSONProfile, string[]> = {
	fast: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'google/gemini-flash-1.5'],
	balanced: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'google/gemini-flash-1.5'],
	powerful: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'google/gemini-flash-1.5'],
	maximum: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'openai/gpt-4o'],
	custom: []
};
```

**Cost Comparison (per 1M tokens):**
| Model | Input Cost | Output Cost | Use Case |
|-------|------------|-------------|----------|
| DeepSeek Chat V3 | $0.14 | $0.28 | Primary (95% cheaper than Claude) |
| Qwen 2.5 72B | $0.35 | $0.40 | Fallback |
| GPT-4o Mini | $0.15 | $0.60 | Fallback |
| Claude 3.5 Sonnet | $3.00 | $15.00 | Last resort only |

### 8.2 Token Optimization

**From briefGenerator.ts (lines 920-931):**

```typescript
function trimMarkdownForPrompt(markdown: string, maxLength: number = 8000): string {
	if (!markdown) return '';
	if (markdown.length <= maxLength) {
		return markdown;
	}
	const truncated = markdown.slice(0, maxLength);
	return `${truncated}\n\n... (content truncated for analysis prompt)`;
}
```

**SMS Cost Optimization:**

- Keep prompts minimal (only essential context)
- Use template-based fallbacks for simple cases
- Batch multiple SMS generations in a single request when possible
- Cache common responses (e.g., standard reminders)

### 8.3 Database Logging for Cost Tracking

**Table:** `llm_usage_logs`

**Tracked metrics:**

- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `input_cost_usd`, `output_cost_usd`, `total_cost_usd`
- `model_requested`, `model_used`, `provider`
- `response_time_ms`
- `operation_type` (useful for categorizing SMS generation)

---

## 9. Streaming vs Non-Streaming

### 9.1 When BuildOS Uses Streaming

**Brain Dump Processing:**

```typescript
// From braindump-processor.ts
interface BrainDumpOptions {
	autoExecute?: boolean;
	streamResults?: boolean; // Enables streaming
	useDualProcessing?: boolean;
	retryAttempts?: number;
}
```

**Use case:** Long-form content generation where user sees progress.

### 9.2 When BuildOS Uses Non-Streaming

**Daily Briefs, Onboarding Questions, Analysis:**

```typescript
// From briefGenerator.ts
llmAnalysis = await llmService.generateText({
	prompt: analysisPrompt,
	userId,
	profile: 'quality',
	temperature: 0.4,
	maxTokens: 2200,
	systemPrompt: DailyBriefAnalysisPrompt.getSystemPrompt()
	// streaming not specified = false
});
```

**Use case:** Short, complete responses processed server-side.

### 9.3 SMS Recommendation

**Use non-streaming** for SMS generation:

- Messages are short (160 chars max)
- Generation is fast (<1 second)
- No UI benefit from streaming
- Simpler error handling

---

## 10. Usage Logging & Analytics

### 10.1 Database Schema

**Table:** `llm_usage_logs`

```sql
CREATE TABLE llm_usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  operation_type TEXT,           -- 'sms_generation', 'brief_analysis', etc.
  model_requested TEXT,
  model_used TEXT,
  provider TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  input_cost_usd DECIMAL,
  output_cost_usd DECIMAL,
  total_cost_usd DECIMAL,
  response_time_ms INTEGER,
  request_started_at TIMESTAMP,
  request_completed_at TIMESTAMP,
  status TEXT,                   -- 'success', 'failure', 'timeout'
  error_message TEXT,
  temperature DECIMAL,
  max_tokens INTEGER,
  profile TEXT,
  streaming BOOLEAN,
  project_id UUID,
  brain_dump_id UUID,
  task_id UUID,
  brief_id UUID,
  metadata JSONB
);
```

### 10.2 SMS-Specific Tracking

**Recommended operation_type values:**

- `sms_reminder_generation`
- `sms_encouragement_generation`
- `sms_reengagement_generation`
- `sms_notification_generation`

**Additional metadata for SMS:**

```typescript
metadata: {
  sms_type: 'reminder' | 'encouragement' | 'reengagement',
  task_id: string,
  character_count: number,
  delivery_status: 'pending' | 'sent' | 'failed',
  twilio_sid: string
}
```

---

## 11. SMS Generation Implementation Guide

### 11.1 Service Setup

```typescript
// apps/worker/src/lib/services/sms-generation.service.ts

import { SmartLLMService } from './smart-llm-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export interface SMSGenerationOptions {
	task: {
		id: string;
		title: string;
		description?: string;
		start_date?: string;
		priority?: string;
	};
	project: {
		id: string;
		name: string;
	};
	user: {
		id: string;
		first_name?: string;
		timezone: string;
	};
	smsType: 'reminder' | 'encouragement' | 'reengagement';
	timeUntilTask?: number; // minutes
}

export class SMSGenerationService {
	private llmService: SmartLLMService;
	private supabase: SupabaseClient<Database>;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService({
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS SMS Generator',
			supabase
		});
	}

	async generateSMS(options: SMSGenerationOptions): Promise<string> {
		const systemPrompt = this.getSystemPrompt(options.smsType);
		const userPrompt = this.getUserPrompt(options);

		try {
			const smsText = await this.llmService.generateText({
				prompt: userPrompt,
				userId: options.user.id,
				profile: 'quality',
				systemPrompt,
				temperature: this.getTemperature(options.smsType),
				maxTokens: 100,
				streaming: false,
				operationType: `sms_${options.smsType}_generation`,
				taskId: options.task.id,
				projectId: options.project.id
			});

			// Validate length
			if (smsText.length > 160) {
				console.warn(`SMS too long (${smsText.length} chars), truncating...`);
				return smsText.substring(0, 157) + '...';
			}

			return smsText;
		} catch (error) {
			console.error('SMS generation failed:', error);
			// Fallback to template
			return this.getTemplateSMS(options);
		}
	}

	private getSystemPrompt(smsType: string): string {
		const basePrompt = `You are a BuildOS task assistant writing concise SMS reminders.

Tone: Friendly, supportive, action-oriented
Length: MUST be under 160 characters
Style: Clear, encouraging, use 1-2 emojis max
Format: Plain text only, no links or formatting

`;

		switch (smsType) {
			case 'reminder':
				return (
					basePrompt +
					`Focus: Remind about upcoming task with time and context.
Example: "📋 Your task 'Client call prep' starts in 30 min (Marketing project). You've got this!"`
				);

			case 'encouragement':
				return (
					basePrompt +
					`Focus: Motivate user to complete an overdue task.
Example: "🌟 Still time to tackle 'Finish report' today! Small progress counts. Let's do this!"`
				);

			case 'reengagement':
				return (
					basePrompt +
					`Focus: Welcome back an inactive user with what's waiting.
Example: "👋 Welcome back! You have 3 tasks ready in your Marketing project. Ready to dive in?"`
				);

			default:
				return basePrompt;
		}
	}

	private getUserPrompt(options: SMSGenerationOptions): string {
		const { task, project, user, timeUntilTask } = options;
		const timeString = timeUntilTask
			? `${Math.floor(timeUntilTask / 60)} hours ${timeUntilTask % 60} minutes`
			: 'soon';

		return `Task: ${task.title}
Project: ${project.name}
Priority: ${task.priority || 'medium'}
Time until start: ${timeString}
User name: ${user.first_name || 'there'}
Description: ${task.description?.substring(0, 100) || 'No description'}

Generate a friendly SMS reminder under 160 characters.`;
	}

	private getTemperature(smsType: string): number {
		switch (smsType) {
			case 'reminder':
				return 0.4; // Factual, consistent
			case 'encouragement':
				return 0.7; // Warm, varied
			case 'reengagement':
				return 0.7; // Engaging
			default:
				return 0.5;
		}
	}

	private getTemplateSMS(options: SMSGenerationOptions): string {
		// Fallback templates when LLM fails
		const { task, project, timeUntilTask } = options;

		if (timeUntilTask && timeUntilTask < 60) {
			return `📋 "${task.title}" starts in ${timeUntilTask} min (${project.name}). Ready?`;
		} else {
			return `📋 Reminder: "${task.title}" from ${project.name} is coming up soon!`;
		}
	}
}
```

### 11.2 Usage Example

```typescript
// In worker scheduler or API endpoint
import { SMSGenerationService } from './lib/services/sms-generation.service';

const smsService = new SMSGenerationService(supabase);

const smsMessage = await smsService.generateSMS({
	task: {
		id: 'task-123',
		title: 'Review Q4 budget',
		description: 'Final review before board meeting',
		start_date: '2025-10-08T14:00:00Z',
		priority: 'high'
	},
	project: {
		id: 'proj-456',
		name: 'Finance Planning'
	},
	user: {
		id: 'user-789',
		first_name: 'Anna',
		timezone: 'America/New_York'
	},
	smsType: 'reminder',
	timeUntilTask: 30 // minutes
});

// Send via Twilio
await twilioService.sendSMS(user.phone_number, smsMessage);
```

---

## 12. Key Takeaways for SMS Generation

### 12.1 Configuration

✅ **Profile:** `'quality'` for well-crafted messages
✅ **Temperature:** 0.4-0.7 depending on message type
✅ **Max Tokens:** 60-100 (SMS = ~40 tokens max)
✅ **Streaming:** `false` (not needed for short messages)
✅ **Model:** DeepSeek Chat V3 (cost-effective, high quality)

### 12.2 Prompt Structure

✅ **System Prompt:** Role, goals, tone, constraints, examples
✅ **User Prompt:** Structured data (task, project, user, time)
✅ **Validation:** Check length after generation, truncate if needed
✅ **Fallback:** Template-based messages for failures

### 12.3 Error Handling

✅ **Non-blocking:** SMS generation failures shouldn't crash system
✅ **Retry:** Try simpler prompt/model on first failure
✅ **Template:** Always have template fallback
✅ **Logging:** Track all generations for cost analysis

### 12.4 Cost Optimization

✅ **Primary Model:** DeepSeek ($0.14/$0.28 per 1M tokens)
✅ **Minimal Prompts:** Only essential context
✅ **Batch Generation:** Generate multiple SMS in one call when possible
✅ **Template Caching:** Use templates for common scenarios
✅ **Cost Tracking:** Log every generation with `operation_type`

---

## 13. Related Files & References

### 13.1 Core LLM Files

| File                                                 | Purpose                   |
| ---------------------------------------------------- | ------------------------- |
| `/apps/web/src/lib/services/smart-llm-service.ts`    | Web LLM service           |
| `/apps/worker/src/lib/services/smart-llm-service.ts` | Worker LLM service        |
| `/apps/web/src/lib/types/llm.ts`                     | LLM type definitions      |
| `/apps/worker/src/lib/utils/llm-utils.ts`            | Model selection utilities |

### 13.2 Prompt Examples

| File                                             | Content                             |
| ------------------------------------------------ | ----------------------------------- |
| `/apps/worker/src/workers/brief/prompts.ts`      | Daily brief & re-engagement prompts |
| `/apps/worker/src/workers/onboarding/prompts.ts` | Onboarding question generation      |
| `/apps/web/src/lib/utils/braindump-processor.ts` | Brain dump processing               |

### 13.3 Implementation References

| File                                                    | Purpose                                |
| ------------------------------------------------------- | -------------------------------------- |
| `/apps/worker/src/workers/brief/briefGenerator.ts`      | Daily brief generation (lines 240-330) |
| `/apps/web/src/routes/api/braindumps/stream/+server.ts` | Streaming implementation               |

---

## 14. Next Steps

### 14.1 Immediate Actions

1. **Create SMS Generation Service** (as shown in Section 11.1)
2. **Define SMS Prompt Templates** (system + user prompts)
3. **Set up database logging** (`operation_type: 'sms_*'`)
4. **Implement template fallbacks** for reliability

### 14.2 Testing

1. **Unit tests** for prompt generation
2. **Integration tests** with SmartLLMService
3. **Character count validation** (ensure ≤160 chars)
4. **Cost analysis** (track actual costs per SMS type)

### 14.3 Monitoring

1. **Success rate** (LLM vs template fallback)
2. **Average cost** per SMS generation
3. **Response time** (should be <2s)
4. **Character count distribution** (ensure efficient token usage)

---

**End of Research Document**
