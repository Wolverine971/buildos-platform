// apps/web/src/lib/services/agentic-chat-v2/transport-decision.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentChatTransportLeaseRequestV1 } from '@buildos/shared-types';
import {
	resolveExistingAgenticChatTransportDecision,
	type AgenticChatTransportDecisionClient,
	type AgenticChatTransportDecisionQuery
} from './transport-decision.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';
const OTHER_DECISION_ID = 'd4000000-0000-4000-8000-000000000002';
const ENTITY_ID = 'd5000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'd6000000-0000-4000-8000-000000000001';

const request: AgentChatTransportLeaseRequestV1 = {
	clientTurnId: 'client-turn-1',
	streamRunId: 'stream-run-1',
	sessionId: SESSION_ID,
	context: { type: 'project', entityId: ENTITY_ID, projectId: PROJECT_ID },
	supportedModes: ['worker_realtime'],
	supportedContractVersions: ['agentic_chat_worker_v1'],
	priorDecisionId: DECISION_ID
};

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: TURN_ID,
		user_id: USER_ID,
		session_id: SESSION_ID,
		stream_run_id: request.streamRunId,
		client_turn_id: request.clientTurnId,
		context_type: request.context.type,
		entity_id: request.context.entityId,
		project_id: request.context.projectId,
		execution_mode: 'worker_realtime',
		transport_contract_version: 'agentic_chat_worker_v1',
		transport_decision_id: DECISION_ID,
		...overrides
	};
}

function client(results: Array<{ data: unknown; error: null | { message: string } }>) {
	const calls: Array<Array<[string, string]>> = [];
	let resultIndex = 0;
	const value: AgenticChatTransportDecisionClient = {
		from: () => ({
			select: () => {
				const filters: Array<[string, string]> = [];
				const query: AgenticChatTransportDecisionQuery = {
					eq(column, filterValue) {
						filters.push([column, filterValue]);
						return query;
					},
					limit: async () => {
						calls.push(filters);
						return results[resultIndex++] ?? { data: [], error: null };
					}
				};
				return query;
			}
		})
	};
	return { value, calls };
}

describe('existing Agentic Chat transport decision resolution', () => {
	it('resolves the prior owned decision before client-turn fallback', async () => {
		const database = client([{ data: [row()], error: null }]);
		const result = await resolveExistingAgenticChatTransportDecision({
			client: database.value,
			userId: USER_ID,
			request
		});

		expect(result).toEqual({
			turnRunId: TURN_ID,
			sessionId: SESSION_ID,
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1',
			decisionId: DECISION_ID
		});
		expect(database.calls).toEqual([
			[
				['user_id', USER_ID],
				['transport_decision_id', DECISION_ID]
			]
		]);
	});

	it('falls back to the unique user/client turn and returns null when absent', async () => {
		const found = client([
			{ data: [], error: null },
			{ data: [row()], error: null }
		]);
		expect(
			await resolveExistingAgenticChatTransportDecision({
				client: found.value,
				userId: USER_ID,
				request
			})
		).toMatchObject({ decisionId: DECISION_ID });

		const absent = client([
			{ data: [], error: null },
			{ data: [], error: null }
		]);
		expect(
			await resolveExistingAgenticChatTransportDecision({
				client: absent.value,
				userId: USER_ID,
				request
			})
		).toBeNull();
	});

	it('rejects prior-decision drift instead of adopting a different existing mode', async () => {
		const database = client([
			{ data: [], error: null },
			{ data: [row({ transport_decision_id: OTHER_DECISION_ID })], error: null }
		]);
		await expect(
			resolveExistingAgenticChatTransportDecision({
				client: database.value,
				userId: USER_ID,
				request
			})
		).rejects.toMatchObject({ code: 'binding_mismatch' });
	});

	it.each([
		['stream', { stream_run_id: 'other-stream' }],
		['session', { session_id: 'd2000000-0000-4000-8000-000000000002' }],
		['context', { project_id: null }],
		['contract', { transport_contract_version: 'legacy_internal_v1' }],
		['missing decision', { transport_decision_id: null }]
	])('fails closed on existing-turn %s mismatch', async (_label, override) => {
		const database = client([{ data: [row(override)], error: null }]);
		await expect(
			resolveExistingAgenticChatTransportDecision({
				client: database.value,
				userId: USER_ID,
				request
			})
		).rejects.toMatchObject({
			code:
				_label === 'contract' || _label === 'missing decision'
					? 'stored_contract_invalid'
					: 'binding_mismatch'
		});
	});

	it('rejects ambiguous and failed database results', async () => {
		const ambiguous = client([{ data: [row(), row()], error: null }]);
		await expect(
			resolveExistingAgenticChatTransportDecision({
				client: ambiguous.value,
				userId: USER_ID,
				request
			})
		).rejects.toMatchObject({ code: 'ambiguous_turn' });

		const failed = client([{ data: null, error: { message: 'private database detail' } }]);
		await expect(
			resolveExistingAgenticChatTransportDecision({
				client: failed.value,
				userId: USER_ID,
				request
			})
		).rejects.toMatchObject({ code: 'database_error' });
	});
});
