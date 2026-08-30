// apps/web/src/lib/services/agentic-chat-v2/prepared-admission-lease.server.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Text } from './prepared-prompt-cache';
import { inspectPreparedAdmissionLease } from './prepared-admission-lease.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const PREPARED_ID = 'd3000000-0000-4000-8000-000000000001';
const NONCE = 'server-random-nonce';
const KEY = `pp_v1.${PREPARED_ID}.${NONCE}`;
const NOW = Date.parse('2026-08-30T18:00:00.000Z');

function params(
	client: { rpc: ReturnType<typeof vi.fn> },
	overrides: Record<string, unknown> = {}
) {
	return {
		client: client as never,
		key: KEY,
		userId: USER_ID,
		sessionId: SESSION_ID,
		contextType: 'global' as const,
		entityId: null,
		projectId: null,
		attachmentCount: 0,
		nowMs: NOW,
		...overrides
	};
}

function hitReceipt() {
	return {
		outcome: 'hit',
		validated_at: new Date(NOW).toISOString(),
		prepared_prompt: {
			id: PREPARED_ID,
			user_id: USER_ID,
			session_id: SESSION_ID,
			context_type: 'global',
			entity_id: null,
			project_id: null,
			cache_key: 'v2|global|none|none|none',
			nonce_sha256: sha256Text(NONCE),
			context_payload_sha256: 'a'.repeat(64),
			context_payload: { contextType: 'global', data: {} },
			prepared_surfaces: {},
			history_for_model: [],
			created_at: '2026-08-30T17:59:55.000Z',
			expires_at: '2026-08-30T18:01:30.000Z'
		},
		session: {
			id: SESSION_ID,
			user_id: USER_ID,
			context_type: 'global',
			entity_id: null,
			summary: null,
			agent_metadata: {}
		}
	};
}

describe('prepared admission lease adapter', () => {
	afterEach(() => {
		delete process.env.AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED;
	});

	it('hashes the nonce and returns a server-owned hit from exactly one RPC', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: hitReceipt(), error: null });
		const result = await inspectPreparedAdmissionLease(params({ rpc }));

		expect(result).toMatchObject({
			hit: true,
			row: { id: PREPARED_ID },
			session: { id: SESSION_ID },
			validatedAt: new Date(NOW).toISOString()
		});
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('inspect_agentic_chat_prepared_admission', {
			p_user_id: USER_ID,
			p_prepared_prompt_id: PREPARED_ID,
			p_nonce_sha256: sha256Text(NONCE),
			p_session_id: SESSION_ID,
			p_context_type: 'global',
			p_entity_id: null,
			p_project_id: null,
			p_now: new Date(NOW).toISOString()
		});
		expect(JSON.stringify(rpc.mock.calls)).not.toContain(NONCE);
	});

	it('does not call the database for malformed or unsupported requests', async () => {
		const rpc = vi.fn();
		await expect(
			inspectPreparedAdmissionLease(params({ rpc }, { key: 'not-a-key' }))
		).resolves.toEqual({ hit: false, reason: 'bad_format' });
		await expect(
			inspectPreparedAdmissionLease(params({ rpc }, { attachmentCount: 1 }))
		).resolves.toEqual({ hit: false, reason: 'ineligible' });
		await expect(
			inspectPreparedAdmissionLease(params({ rpc }, { contextType: 'calendar' }))
		).resolves.toEqual({ hit: false, reason: 'ineligible' });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('maps bounded misses and malformed receipts to safe fallback results', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({
				data: { outcome: 'fallback', reason: 'stale_history' },
				error: null
			})
			.mockResolvedValueOnce({ data: { outcome: 'hit' }, error: null })
			.mockResolvedValueOnce({ data: null, error: { code: '42883' } });

		await expect(inspectPreparedAdmissionLease(params({ rpc }))).resolves.toEqual({
			hit: false,
			reason: 'stale_history'
		});
		await expect(inspectPreparedAdmissionLease(params({ rpc }))).resolves.toEqual({
			hit: false,
			reason: 'invalid_receipt'
		});
		await expect(inspectPreparedAdmissionLease(params({ rpc }))).resolves.toEqual({
			hit: false,
			reason: 'database_error'
		});
	});

	it('falls back when the database client throws instead of returning an error result', async () => {
		const rpc = vi.fn().mockRejectedValue(new Error('connection reset'));
		await expect(inspectPreparedAdmissionLease(params({ rpc }))).resolves.toEqual({
			hit: false,
			reason: 'database_error'
		});
	});

	it('supports an immediate environment rollback without touching the database', async () => {
		process.env.AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED = 'false';
		const rpc = vi.fn();
		await expect(inspectPreparedAdmissionLease(params({ rpc }))).resolves.toEqual({
			hit: false,
			reason: 'disabled'
		});
		expect(rpc).not.toHaveBeenCalled();
	});
});
