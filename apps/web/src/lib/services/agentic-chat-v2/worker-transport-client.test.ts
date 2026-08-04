// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	requestAgenticChatTransportLease,
	requestAgenticChatWorkerAdmission
} from './worker-transport-client';

const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';
const request = {
	clientTurnId: 'client-turn-1',
	streamRunId: 'stream-run-1',
	sessionId: SESSION_ID,
	context: { type: 'global', entityId: null, projectId: null },
	supportedModes: ['legacy_sse', 'worker_realtime'] as const,
	supportedContractVersions: ['legacy_internal_v1', 'agentic_chat_worker_v1'] as const,
	priorDecisionId: null
};
const workerLease = {
	mode: 'worker_realtime' as const,
	contractVersion: 'agentic_chat_worker_v1' as const,
	decisionId: DECISION_ID,
	token: 'actl1.claims.signature',
	expiresAt: '2026-08-04T03:00:00.000Z'
};

describe('Agentic Chat worker transport client', () => {
	it('requests a private server-selected lease and accepts an exact response', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ success: true, data: workerLease, timestamp: new Date().toISOString() })
		);
		await expect(requestAgenticChatTransportLease({ request, fetchImpl })).resolves.toEqual(
			workerLease
		);
		expect(fetchImpl).toHaveBeenCalledWith(
			'/api/agent/v2/transport',
			expect.objectContaining({
				method: 'POST',
				credentials: 'same-origin',
				cache: 'no-store'
			})
		);
		expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual(request);
	});

	it('falls back before admission for HTTP, transport, and malformed lease responses', async () => {
		for (const fetchImpl of [
			vi.fn<typeof fetch>(async () => new Response('', { status: 503 })),
			vi.fn<typeof fetch>(async () => {
				throw new Error('offline');
			}),
			vi.fn<typeof fetch>(async () =>
				Response.json({ success: true, data: { ...workerLease, extra: true } })
			),
			vi.fn<typeof fetch>(async () =>
				Response.json({
					success: true,
					data: { ...workerLease, contractVersion: 'legacy_internal_v1' }
				})
			)
		]) {
			await expect(
				requestAgenticChatTransportLease({ request, fetchImpl })
			).resolves.toBeNull();
		}
	});

	it('submits only the bounded text canary command to worker admission', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ success: true, data: { outcome: 'newly_admitted' } }, { status: 202 })
		);
		const result = await requestAgenticChatWorkerAdmission({
			fetchImpl,
			command: {
				leaseToken: workerLease.token,
				clientTurnId: request.clientTurnId,
				streamRunId: request.streamRunId,
				sessionId: SESSION_ID,
				context: request.context,
				message: 'Canary hello',
				projectFocus: {
					focusType: 'project-wide',
					projectId: SESSION_ID,
					projectName: 'Canary Project'
				},
				lastTurnContext: null,
				preparedPromptKey: 'prepared-key'
			}
		});
		expect(result.response.status).toBe(202);
		expect(result.payload).toMatchObject({ success: true });
		expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
			leaseToken: workerLease.token,
			clientTurnId: request.clientTurnId,
			streamRunId: request.streamRunId,
			sessionId: SESSION_ID,
			context: request.context,
			message: 'Canary hello',
			attachments: [],
			projectFocus: {
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null,
				projectId: SESSION_ID,
				projectName: 'Canary Project'
			},
			lastTurnContext: null,
			voiceNoteGroupId: null,
			preparedPromptKey: 'prepared-key'
		});
	});

	it('returns non-success admission responses without parsing them as authority', async () => {
		const response = Response.json({ code: 'WORKER_CAPACITY_EXCEEDED' }, { status: 503 });
		const result = await requestAgenticChatWorkerAdmission({
			fetchImpl: vi.fn<typeof fetch>(async () => response),
			command: {
				leaseToken: workerLease.token,
				clientTurnId: request.clientTurnId,
				streamRunId: request.streamRunId,
				sessionId: SESSION_ID,
				context: request.context,
				message: 'Canary hello',
				projectFocus: null,
				lastTurnContext: null,
				preparedPromptKey: null
			}
		});
		expect(result).toEqual({ response, payload: null });
	});
});
