// apps/web/src/lib/services/agentic-chat-v2/turn-route-health.regression.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { materializeGatewayTools } from '@buildos/agentic-chat-runtime/catalog';
import { streamFastChat } from './stream-orchestrator';

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

describe('turn-scoped route health regression', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('does not return to a model/provider pair that timed out on the prior logical pass', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const streamRequests: Array<{
			models?: string[];
			providerRouting?: { ignore?: string[] };
		}> = [];
		let invocation = 0;
		const llm = {
			streamText: vi.fn(async function* (options: {
				models?: string[];
				providerRouting?: { ignore?: string[] };
				onRouteObserved?: (observation: Record<string, unknown>) => void;
			}) {
				invocation += 1;
				streamRequests.push({
					models: options.models,
					providerRouting: options.providerRouting
				});
				if (invocation === 1) {
					options.onRouteObserved?.({
						model: 'deepseek/deepseek-v4-flash',
						provider_slug: 'digitalocean'
					});
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{ query: 'current status', project_id: 'project-1' },
							'search-1'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (invocation === 2) {
					options.onRouteObserved?.({
						model: 'deepseek/deepseek-v4-flash',
						provider: 'DigitalOcean',
						provider_slug: 'digitalocean'
					});
					yield { type: 'text', content: 'Incomplete status draft' };
					yield { type: 'error', error: 'provider stream timed out' };
					return;
				}
				options.onRouteObserved?.({
					model: 'google/gemini-3.7-flash',
					provider: 'Google',
					provider_slug: 'google'
				});
				if (invocation === 3) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'declare_read_only_turn',
							{ reason: 'The user requested status information only.' },
							'read-only-1'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'The project status is ready.' };
				yield {
					type: 'done',
					finished_reason: 'stop',
					model: 'google/gemini-3.7-flash',
					provider_slug: 'google'
				};
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				success: true,
				result:
					call.function.name === 'declare_read_only_turn'
						? { status: 'read_only_declared' }
						: { results: [{ id: 'task-1', title: 'Current task', type: 'task' }] }
			})
		);

		const resultPromise = streamFastChat({
			llm,
			userId: 'user-1',
			sessionId: 'session-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			history: [],
			message: 'Where are we at with this project?',
			tools: tools(['search_project', 'declare_read_only_turn']),
			toolExecutor,
			onDelta: async () => {}
		});
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(streamRequests[1]?.models?.[0]).toBe('deepseek/deepseek-v4-flash');
		expect(streamRequests[2]?.models?.[0]).toBe('google/gemini-3.7-flash');
		expect(streamRequests[3]?.models?.[0]).toBe('google/gemini-3.7-flash');
		expect(streamRequests[3]?.providerRouting?.ignore).toContain('digitalocean');
		expect(result.finalAssistantText).toBe('The project status is ready.');
		expect(result.finishedReason).toBe('stop');
	});
});
