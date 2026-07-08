// apps/web/src/lib/services/agentic-chat-v2/stream-events.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolResult, ContextUsageSnapshot } from '@buildos/shared-types';
import {
	createSequencedAgentStream,
	emitContextShift,
	emitContextUsage,
	emitSkillActivity,
	emitToolCall,
	extractContextShiftPayload,
	resolveAgentStreamEventPhase,
	type AgentChatSSEStream
} from './stream-events';

function createFakeStream() {
	const messages: unknown[] = [];
	const stream: AgentChatSSEStream = {
		response: new Response(null),
		sendMessage: vi.fn(async (payload: unknown) => {
			messages.push(payload);
		}),
		close: vi.fn(async () => {})
	};

	return { stream, messages };
}

describe('stream-events', () => {
	it('classifies agent stream event phases', () => {
		expect(resolveAgentStreamEventPhase('text_delta')).toBe('llm');
		expect(resolveAgentStreamEventPhase('tool_result')).toBe('tool');
		expect(resolveAgentStreamEventPhase('done')).toBe('finalize');
		expect(resolveAgentStreamEventPhase('context_usage')).toBe('stream');
		expect(resolveAgentStreamEventPhase('something_else')).toBe('stream');
	});

	it('adds stable sequencing metadata to outbound events', async () => {
		const fake = createFakeStream();
		const sequenced = createSequencedAgentStream({
			baseStream: fake.stream,
			streamRunId: 'stream-1',
			clientTurnId: 'client-turn-1',
			getTurnRunId: () => 'turn-run-1'
		});

		await sequenced.sendMessage({ type: 'text_delta', text: 'hello' });
		await sequenced.sendMessage({ type: 'tool_call', tool_call: { id: 'call-1' } });

		expect(fake.messages).toEqual([
			expect.objectContaining({
				type: 'text_delta',
				text: 'hello',
				event_id: 'stream-1:1',
				stream_run_id: 'stream-1',
				client_turn_id: 'client-turn-1',
				turn_run_id: 'turn-run-1',
				sequence_index: 1,
				phase: 'llm',
				event_type: 'text_delta',
				durable: true
			}),
			expect.objectContaining({
				type: 'tool_call',
				event_id: 'stream-1:2',
				sequence_index: 2,
				phase: 'tool',
				event_type: 'tool_call',
				durable: true
			})
		]);
	});

	it('marks sequenced events as non-durable before the turn run exists', async () => {
		const fake = createFakeStream();
		const sequenced = createSequencedAgentStream({
			baseStream: fake.stream,
			streamRunId: 'stream-1',
			clientTurnId: null,
			getTurnRunId: () => null
		});

		await sequenced.sendMessage({ type: 'session', session_id: 'session-1' });

		expect(fake.messages[0]).toEqual(
			expect.objectContaining({
				client_turn_id: undefined,
				turn_run_id: null,
				durable: false,
				phase: 'stream'
			})
		);
	});

	it('emits context usage, tool calls, and skill activity through the stream', async () => {
		const fake = createFakeStream();
		const onMessageSent = vi.fn();
		const usage = {
			estimatedTokens: 10,
			tokenBudget: 100,
			usagePercent: 10,
			status: 'ok'
		} as ContextUsageSnapshot;
		const toolCall = {
			id: 'call-1',
			type: 'function',
			function: {
				name: 'get_workspace_overview',
				arguments: '{}'
			}
		} as ChatToolCall;
		const skillActivity = {
			type: 'skill_activity',
			event: 'requested',
			skill_ids: ['skill-1']
		} as any;

		emitContextUsage(fake.stream, usage, { onMessageSent });
		emitToolCall(fake.stream, toolCall, { onMessageSent });
		emitSkillActivity(fake.stream, skillActivity, { onMessageSent });
		await Promise.resolve();

		expect(fake.messages).toEqual([
			{ type: 'context_usage', usage },
			{ type: 'tool_call', tool_call: toolCall },
			skillActivity
		]);
		expect(onMessageSent).toHaveBeenCalledTimes(3);
	});

	it('extracts context shift payloads from nested tool results', () => {
		const result = {
			success: true,
			result: {
				payload: {
					context_shift: {
						new_context: 'project',
						entity_id: 'project-1',
						entity_name: 'Launch Plan',
						entity_type: 'project',
						message: 'Context updated.'
					}
				}
			}
		} as ChatToolResult;

		expect(extractContextShiftPayload(result)).toEqual({
			new_context: 'project',
			entity_id: 'project-1',
			entity_name: 'Launch Plan',
			entity_type: 'project',
			message: 'Context updated.'
		});
	});

	it('defaults global context shift labels and rejects project shifts without an entity id', () => {
		expect(
			extractContextShiftPayload({
				success: true,
				result: {
					context_shift: {
						new_context: 'global'
					}
				}
			} as ChatToolResult)
		).toEqual({
			new_context: 'global',
			entity_id: null,
			entity_name: 'Workspace',
			entity_type: 'workspace',
			message: 'Zoomed out to workspace context.'
		});

		expect(
			extractContextShiftPayload({
				success: true,
				result: {
					context_shift: {
						new_context: 'project'
					}
				}
			} as ChatToolResult)
		).toBeNull();
	});

	it('emits context shift events through the stream', async () => {
		const fake = createFakeStream();
		const onMessageSent = vi.fn();
		const contextShift = {
			new_context: 'project',
			entity_id: 'project-1',
			entity_name: 'Launch Plan',
			entity_type: 'project',
			message: 'Context updated.'
		} as const;

		await emitContextShift(fake.stream, contextShift, { onMessageSent });

		expect(fake.messages).toEqual([
			{
				type: 'context_shift',
				context_shift: contextShift
			}
		]);
		expect(onMessageSent).toHaveBeenCalledOnce();
	});
});
