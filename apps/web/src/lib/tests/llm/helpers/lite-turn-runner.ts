// apps/web/src/lib/tests/llm/helpers/lite-turn-runner.ts
import { randomUUID } from 'node:crypto';
import type { ChatContextType, ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	buildLitePromptEnvelope,
	type LitePromptEnvelope
} from '$lib/services/agentic-chat-lite/prompt';
import { getDefaultToolsForContextType } from '$lib/services/agentic-chat/tools/core/tools.config';

export type LiteTurnResult = {
	assistantText: string;
	toolCalls: ChatToolCall[];
	finishedReason?: string;
	model?: string;
};

/**
 * A canonical global-workspace envelope with two loaded projects, mirroring the
 * fixture shape used by build-lite-prompt.test.ts so the rendered prompt matches
 * what production sends on a global turn 1.
 */
export function buildGlobalTestEnvelope(): LitePromptEnvelope {
	return buildLitePromptEnvelope({
		contextType: 'global',
		entityId: null,
		projectId: null,
		now: new Date().toISOString(),
		timezone: 'America/New_York',
		productSurface: 'global workspace chat',
		conversationPosition: 'beginning of chat thread',
		data: {
			projects: [
				{
					project: {
						id: 'project-1',
						name: 'Launch Alpha',
						state_key: 'active',
						description: 'Ship the first public beta of the Alpha app.',
						start_at: null,
						end_at: null,
						next_step_short: 'Ship the beta build',
						updated_at: new Date().toISOString()
					},
					recent_activity: [
						{
							entity_type: 'task',
							entity_id: 'task-1',
							title: 'Finish onboarding flow',
							action: 'updated',
							updated_at: new Date().toISOString()
						}
					],
					goals: [],
					milestones: [],
					plans: []
				},
				{
					project: {
						id: 'project-2',
						name: 'Newsletter Relaunch',
						state_key: 'active',
						description: 'Restart the weekly newsletter with a new format.',
						start_at: null,
						end_at: null,
						next_step_short: 'Draft issue #1 outline',
						updated_at: new Date().toISOString()
					},
					recent_activity: [],
					goals: [],
					milestones: [],
					plans: []
				}
			],
			context_meta: {
				generated_at: new Date().toISOString(),
				source: 'rpc',
				project_count: 2,
				projects_returned: 2,
				project_limit: 10,
				includes_doc_structure: false,
				recent_activity_window_days: 7,
				recent_activity_max_lookback_days: 30,
				entity_limits_per_project: {
					recent_activity: 5,
					goals: 3,
					milestones: 3,
					plans: 3
				}
			}
		}
	});
}

/**
 * The project_create fork: one-tool context rendered before a project exists
 * (prompt audit WP-3, 2026-07-10).
 */
export function buildProjectCreateTestEnvelope(): LitePromptEnvelope {
	return buildLitePromptEnvelope({
		contextType: 'project_create',
		entityId: null,
		projectId: null,
		now: new Date().toISOString(),
		timezone: 'America/New_York',
		data: null
	});
}

/**
 * Run a single live LLM pass the same way the agentic-chat v2 stream does on
 * pass 1: system prompt + user message, the context's default tool surface,
 * tool_choice auto, temperature 0.2, profile balanced.
 *
 * Makes a REAL OpenRouter API call — costs money.
 */
export async function runLiteTurn(params: {
	systemPrompt: string;
	userMessage: string;
	contextType: ChatContextType;
	tools?: ChatToolDefinition[];
}): Promise<LiteTurnResult> {
	const llm = new SmartLLMService();
	const tools = params.tools ?? getDefaultToolsForContextType(params.contextType);
	const hasTools = tools.length > 0;

	let assistantText = '';
	const toolCalls: ChatToolCall[] = [];
	let finishedReason: string | undefined;
	let model: string | undefined;

	for await (const event of llm.streamText({
		messages: [
			{ role: 'system', content: params.systemPrompt },
			{ role: 'user', content: params.userMessage }
		],
		tools: hasTools ? tools : undefined,
		tool_choice: hasTools ? 'auto' : undefined,
		temperature: 0.2,
		userId: 'llm-test-suite',
		sessionId: randomUUID(),
		profile: 'balanced',
		maxTokens: 2048,
		operationType: 'llm_test_suite',
		contextType: params.contextType
	})) {
		if (event.type === 'text' && event.content) {
			assistantText += event.content;
		} else if (event.type === 'tool_call' && event.tool_call) {
			toolCalls.push(event.tool_call as ChatToolCall);
		} else if (event.type === 'done') {
			finishedReason = event.finished_reason;
			model = event.model;
		} else if (event.type === 'error') {
			throw new Error(event.error || 'LLM stream error');
		}
	}

	return { assistantText, toolCalls, finishedReason, model };
}
