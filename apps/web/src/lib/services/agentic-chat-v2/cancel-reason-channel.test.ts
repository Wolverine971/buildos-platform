// apps/web/src/lib/services/agentic-chat-v2/cancel-reason-channel.test.ts
import { describe, expect, it } from 'vitest';
import {
	consumeTransientFastChatCancelHint,
	createFastChatCancelHint,
	mergeFastChatCancelHintIntoMetadata,
	normalizeFastChatStreamRunId,
	readFastChatCancelReasonFromMetadata,
	recordTransientFastChatCancelHint
} from './cancel-reason-channel';

describe('cancel reason channel', () => {
	it('normalizes stream run ids', () => {
		expect(normalizeFastChatStreamRunId(42)).toBe('42');
		expect(normalizeFastChatStreamRunId('  run-123  ')).toBe('run-123');
		expect(normalizeFastChatStreamRunId('')).toBeNull();
		expect(normalizeFastChatStreamRunId(null)).toBeNull();
		expect(normalizeFastChatStreamRunId(undefined)).toBeNull();
	});

	it('merges and reads cancel reason metadata by stream run id', () => {
		const nowMs = Date.parse('2026-02-27T18:00:00.000Z');
		const hint = createFastChatCancelHint({
			reason: 'superseded',
			streamRunId: '17',
			clientTurnId: 'turn_abc',
			createdAt: '2026-02-27T17:59:55.000Z'
		});

		const merged = mergeFastChatCancelHintIntoMetadata({
			agentMetadata: { existing_flag: true },
			streamRunId: '17',
			hint,
			nowMs
		});

		expect(
			readFastChatCancelReasonFromMetadata({
				agentMetadata: merged,
				streamRunId: '17',
				nowMs
			})
		).toBe('superseded');
		expect((merged as Record<string, unknown>).existing_flag).toBe(true);
	});

	it('prunes expired metadata cancel hints', () => {
		const nowMs = Date.parse('2026-02-27T18:00:00.000Z');
		const merged = mergeFastChatCancelHintIntoMetadata({
			agentMetadata: {
				fastchat_cancel_hints_v1: {
					old_run: {
						reason: 'user_cancelled',
						stream_run_id: 'old_run',
						created_at: '2026-02-27T17:48:00.000Z',
						source: 'client_cancel_endpoint'
					}
				}
			},
			streamRunId: 'new_run',
			hint: createFastChatCancelHint({
				reason: 'user_cancelled',
				streamRunId: 'new_run',
				createdAt: '2026-02-27T17:59:50.000Z'
			}),
			nowMs
		});

		expect(
			readFastChatCancelReasonFromMetadata({
				agentMetadata: merged,
				streamRunId: 'old_run',
				nowMs
			})
		).toBeNull();
		expect(
			readFastChatCancelReasonFromMetadata({
				agentMetadata: merged,
				streamRunId: 'new_run',
				nowMs
			})
		).toBe('user_cancelled');
	});

	it('stores and consumes transient cancel hints once', () => {
		const nowMs = Date.parse('2026-02-27T18:00:00.000Z');
		recordTransientFastChatCancelHint({
			userId: 'user_1',
			streamRunId: '88',
			reason: 'user_cancelled',
			nowMs
		});

		expect(
			consumeTransientFastChatCancelHint({
				userId: 'user_1',
				streamRunId: '88',
				nowMs
			})
		).toBe('user_cancelled');
		expect(
			consumeTransientFastChatCancelHint({
				userId: 'user_1',
				streamRunId: '88',
				nowMs
			})
		).toBeNull();
	});

	it('expires transient cancel hints after ttl', () => {
		const nowMs = Date.parse('2026-02-27T18:00:00.000Z');
		recordTransientFastChatCancelHint({
			userId: 'user_1',
			streamRunId: 'old',
			reason: 'superseded',
			nowMs: nowMs - 11 * 60 * 1000
		});

		expect(
			consumeTransientFastChatCancelHint({
				userId: 'user_1',
				streamRunId: 'old',
				nowMs
			})
		).toBeNull();
	});
});
