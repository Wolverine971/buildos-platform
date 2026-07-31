// apps/web/src/lib/services/agentic-chat-v2/turn-admission.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	admitLegacyAgenticChatTurn,
	LegacyAgenticChatAdmissionError,
	shouldReclaimRunningTurn
} from './turn-admission';

describe('shouldReclaimRunningTurn', () => {
	const NOW = Date.parse('2026-07-23T12:00:00.000Z');
	const MAX = 285_000;

	it('keeps a young turn with fresh progress', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 60_000,
				lastProgressAtMs: NOW - 10_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
	});

	it('reclaims a dead turn after ~2 minutes of heartbeat silence, before max duration', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 150_000,
				lastProgressAtMs: NOW - 130_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});

	it('does NOT cancel a slow-but-alive turn past max duration when progress is fresh', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 300_000,
				lastProgressAtMs: NOW - 15_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
	});

	it('reclaims past max duration when progress is not fresh', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 300_000,
				lastProgressAtMs: NOW - 90_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});

	it('falls back to started_at for legacy turns without a heartbeat', () => {
		// Old behavior preserved: no heartbeat data, reclaim strictly by age...
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 60_000,
				lastProgressAtMs: null,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
		// ...except a heartbeat-less turn older than the stale window is dead.
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 130_000,
				lastProgressAtMs: null,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});
});

describe('admitLegacyAgenticChatTurn', () => {
	const rpcParams = {
		userId: '00000000-0000-4000-8000-000000000001',
		sessionId: '00000000-0000-4000-8000-000000000002',
		turnRunId: '00000000-0000-4000-8000-000000000003',
		userMessageId: '00000000-0000-4000-8000-000000000004',
		streamRunId: '00000000-0000-4000-8000-000000000005',
		clientTurnId: '00000000-0000-4000-8000-000000000006',
		requestHash: 'a'.repeat(64),
		requestHashVersion: 'agentic_chat_request_hash_v2',
		contextType: 'project' as const,
		entityId: '00000000-0000-4000-8000-000000000007',
		projectId: '00000000-0000-4000-8000-000000000007',
		source: 'live_ui',
		gatewayEnabled: true,
		requestMessage: 'Ship the release',
		startedAt: '2026-07-31T12:00:00.000Z',
		userMessageContent: 'Ship the release',
		userMessageMetadata: {
			client_turn_id: '00000000-0000-4000-8000-000000000006'
		},
		historyLimit: 10,
		detachedTurnMaxDurationMs: 285_000,
		progressStaleReclaimMs: 120_000,
		recentProgressGraceMs: 60_000
	};

	it('normalizes the RPC input and discriminates a newly admitted execution', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				outcome: 'newly_admitted',
				execution_may_start: true,
				turn_run_id: rpcParams.turnRunId,
				session_id: rpcParams.sessionId,
				user_message_id: rpcParams.userMessageId,
				stream_run_id: rpcParams.streamRunId,
				client_turn_id: rpcParams.clientTurnId,
				execution_mode: 'legacy_sse',
				reclaimed_turn_run_id: null,
				fallback_snapshot: {
					messages: [],
					attachments: [],
					interrupted_tool_executions: [],
					loaded_skill_executions: []
				}
			},
			error: null
		});

		const result = await admitLegacyAgenticChatTurn({
			...rpcParams,
			supabase: { rpc } as any
		});

		expect(result).toEqual(
			expect.objectContaining({
				outcome: 'newly_admitted',
				executionMayStart: true,
				turnRunId: rpcParams.turnRunId,
				userMessageId: rpcParams.userMessageId,
				executionMode: 'legacy_sse'
			})
		);
		expect(rpc).toHaveBeenCalledWith('admit_legacy_agentic_chat_turn', {
			p_user_id: rpcParams.userId,
			p_session_id: rpcParams.sessionId,
			p_turn_run_id: rpcParams.turnRunId,
			p_user_message_id: rpcParams.userMessageId,
			p_stream_run_id: rpcParams.streamRunId,
			p_client_turn_id: rpcParams.clientTurnId,
			p_request_hash: rpcParams.requestHash,
			p_request_hash_version: rpcParams.requestHashVersion,
			p_context_type: rpcParams.contextType,
			p_entity_id: rpcParams.entityId,
			p_project_id: rpcParams.projectId,
			p_source: rpcParams.source,
			p_gateway_enabled: rpcParams.gatewayEnabled,
			p_request_message: rpcParams.requestMessage,
			p_started_at: rpcParams.startedAt,
			p_user_message_content: rpcParams.userMessageContent,
			p_user_message_metadata: rpcParams.userMessageMetadata,
			p_history_limit: rpcParams.historyLimit,
			p_detached_turn_max_duration_ms: rpcParams.detachedTurnMaxDurationMs,
			p_progress_stale_reclaim_ms: rpcParams.progressStaleReclaimMs,
			p_recent_progress_grace_ms: rpcParams.recentProgressGraceMs
		});
	});

	it.each([
		[
			'matching_duplicate',
			{
				outcome: 'matching_duplicate',
				execution_may_start: false,
				turn_run_id: rpcParams.turnRunId,
				session_id: rpcParams.sessionId,
				user_message_id: rpcParams.userMessageId,
				stream_run_id: rpcParams.streamRunId,
				client_turn_id: rpcParams.clientTurnId,
				execution_mode: 'legacy_sse',
				fallback_snapshot: null
			}
		],
		[
			'active_turn_conflict',
			{
				outcome: 'active_turn_conflict',
				execution_may_start: false,
				turn_run_id: '00000000-0000-4000-8000-000000000099',
				session_id: rpcParams.sessionId,
				user_message_id: null,
				stream_run_id: 'active-stream',
				client_turn_id: null,
				execution_mode: 'legacy_sse',
				fallback_snapshot: null
			}
		],
		[
			'idempotency_conflict',
			{
				outcome: 'idempotency_conflict',
				execution_may_start: false,
				turn_run_id: rpcParams.turnRunId,
				session_id: rpcParams.sessionId,
				user_message_id: rpcParams.userMessageId,
				stream_run_id: rpcParams.streamRunId,
				client_turn_id: rpcParams.clientTurnId,
				execution_mode: 'legacy_sse',
				conflict_reason: 'request_hash_mismatch',
				fallback_snapshot: null
			}
		]
	])('maps the %s result without permitting execution', async (_outcome, data) => {
		const result = await admitLegacyAgenticChatTurn({
			...rpcParams,
			supabase: {
				rpc: vi.fn().mockResolvedValue({ data, error: null })
			} as any
		});

		expect(result.outcome).toBe(_outcome);
		expect(result.executionMayStart).toBe(false);
	});

	it('maps database and malformed-result failures to a typed admission error', async () => {
		await expect(
			admitLegacyAgenticChatTurn({
				...rpcParams,
				supabase: {
					rpc: vi.fn().mockResolvedValue({
						data: null,
						error: { code: 'XX000', message: 'database unavailable' }
					})
				} as any
			})
		).rejects.toBeInstanceOf(LegacyAgenticChatAdmissionError);

		await expect(
			admitLegacyAgenticChatTurn({
				...rpcParams,
				supabase: {
					rpc: vi.fn().mockResolvedValue({ data: { outcome: 'mystery' }, error: null })
				} as any
			})
		).rejects.toMatchObject({ code: 'invalid_result' });
	});
});
