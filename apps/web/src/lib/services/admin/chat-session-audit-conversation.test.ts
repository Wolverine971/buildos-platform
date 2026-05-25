// apps/web/src/lib/services/admin/chat-session-audit-conversation.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildConversationTurns,
	conversationMessageIsLong
} from './chat-session-audit-conversation';
import { buildReplayTimeline } from './chat-session-audit-timeline';
import type { ChatSessionAuditPayload, ConversationMessage } from './chat-session-audit-types';

const detail = (): ChatSessionAuditPayload => ({
	session: {
		id: 'session-1',
		title: 'Test session',
		user: { id: 'user-1', email: 'admin@example.com', name: 'Admin User' },
		context_type: 'global',
		context_id: null,
		status: 'active',
		message_count: 2,
		total_tokens: 26,
		tool_call_count: 1,
		llm_call_count: 1,
		cost_estimate: 0.01,
		has_errors: false,
		created_at: '2026-04-12T12:00:00.000Z',
		updated_at: '2026-04-12T12:02:00.000Z',
		last_message_at: '2026-04-12T12:02:00.000Z',
		agent_metadata: {},
		extracted_entities: null
	},
	metrics: {
		total_tokens: 26,
		total_cost_usd: 0.01,
		tool_calls: 1,
		tool_failures: 0,
		llm_calls: 1,
		llm_failures: 0,
		messages: 2
	},
	messages: [
		{
			id: 'message-user-1',
			role: 'user',
			content: 'What should I do next?',
			created_at: '2026-04-12T12:01:00.000Z',
			total_tokens: 8
		},
		{
			id: 'message-assistant-1',
			role: 'assistant',
			content: 'Draft the outline.',
			created_at: '2026-04-12T12:02:00.000Z',
			total_tokens: 18
		}
	],
	tool_executions: [],
	llm_calls: [],
	operations: [],
	timing_metrics: null,
	turn_runs: [
		{
			id: 'turn-run-1',
			turn_index: 1,
			stream_run_id: 'stream-1',
			client_turn_id: 'client-turn-1',
			status: 'completed',
			finished_reason: 'stop',
			context_type: 'global',
			entity_id: null,
			project_id: null,
			gateway_enabled: true,
			request_message: 'What should I do next?',
			user_message_id: 'message-user-1',
			assistant_message_id: 'message-assistant-1',
			tool_round_count: 1,
			tool_call_count: 1,
			validation_failure_count: 0,
			llm_pass_count: 1,
			first_lane: 'execute',
			first_help_path: 'project.search',
			first_skill_path: null,
			first_canonical_op: 'project.search',
			history_strategy: 'recent',
			history_compressed: false,
			raw_history_count: 2,
			history_for_model_count: 2,
			cache_source: null,
			cache_age_seconds: 0,
			request_prewarmed_context: false,
			started_at: '2026-04-12T12:01:00.000Z',
			finished_at: '2026-04-12T12:02:00.000Z',
			prompt_snapshot: null,
			events: [],
			eval_runs: []
		}
	],
	timeline: [
		{
			id: 'turn_event:tool-call-1',
			timestamp: '2026-04-12T12:01:20.000Z',
			type: 'turn_event',
			severity: 'info',
			title: 'Turn Event: tool_call_emitted',
			summary: 'op=project.search',
			turn_index: 1,
			payload: {
				event_type: 'tool_call_emitted',
				tool_call_id: 'call-1',
				tool_name: 'buildos_gateway',
				canonical_op: 'project.search',
				arguments: { query: 'outline' }
			}
		},
		{
			id: 'turn_event:tool-result-1',
			timestamp: '2026-04-12T12:01:21.000Z',
			type: 'turn_event',
			severity: 'info',
			title: 'Turn Event: tool_result_received',
			summary: 'op=project.search',
			turn_index: 1,
			payload: {
				event_type: 'tool_result_received',
				tool_call_id: 'call-1',
				tool_name: 'buildos_gateway',
				canonical_op: 'project.search',
				success: true,
				duration_ms: 321,
				result: { matches: 2 }
			}
		},
		{
			id: 'turn_event:supervisor',
			timestamp: '2026-04-12T12:01:22.000Z',
			type: 'turn_event',
			severity: 'warning',
			title: 'Supervisor Decision',
			summary: 'force synthesis',
			turn_index: 1,
			payload: { event_type: 'supervisor_decision', action: 'force_synthesis' }
		}
	]
});

describe('chat-session-audit-conversation', () => {
	it('builds turns with messages, merged tool calls, and supervisor events', () => {
		const payload = detail();
		const turns = buildConversationTurns({
			detail: payload,
			replayTimeline: buildReplayTimeline(payload.timeline)
		});
		expect(turns).toHaveLength(1);
		expect(turns[0].userMessages[0].content).toBe('What should I do next?');
		expect(turns[0].assistantMessages[0].content).toBe('Draft the outline.');
		expect(turns[0].toolCalls).toHaveLength(1);
		expect(turns[0].toolCalls[0]).toMatchObject({
			toolName: 'buildos_gateway',
			statusLabel: 'completed',
			result: { matches: 2 }
		});
		expect(turns[0].supervisorEvents).toHaveLength(1);
	});

	it('detects long messages', () => {
		const message: ConversationMessage = {
			id: 'm1',
			role: 'assistant',
			roleLabel: 'BuildOS',
			content: Array(11).fill('line').join('\n'),
			timestamp: '2026-04-12T12:02:00.000Z',
			turnIndex: 1,
			totalTokens: 0,
			errorMessage: ''
		};
		expect(conversationMessageIsLong(message)).toBe(true);
	});
});
