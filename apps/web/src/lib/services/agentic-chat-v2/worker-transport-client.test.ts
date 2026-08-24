// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerUnavailableResponseError,
	requestAgenticChatTransportLease,
	requestAgenticChatWorkerAdmission
} from './worker-transport-client';
import { workerAdmissionRequestSchema } from '../../../routes/api/agent/v2/turns/worker-admission-schema';

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

	it('keeps negotiation alive through the server capacity retry budget', async () => {
		vi.useFakeTimers();
		try {
			const fetchImpl = vi.fn<typeof fetch>(
				async (_input, init) =>
					await new Promise<Response>((resolve, reject) => {
						const timer = setTimeout(
							() =>
								resolve(
									Response.json({
										success: true,
										data: workerLease,
										timestamp: new Date().toISOString()
									})
								),
							7_501
						);
						init?.signal?.addEventListener(
							'abort',
							() => {
								clearTimeout(timer);
								reject(new DOMException('Aborted', 'AbortError'));
							},
							{ once: true }
						);
					})
			);

			const lease = requestAgenticChatTransportLease({ request, fetchImpl });
			await vi.advanceTimersByTimeAsync(7_501);

			await expect(lease).resolves.toEqual(workerLease);
		} finally {
			vi.useRealTimers();
		}
	});

	it('surfaces retryable unavailability for HTTP, transport, and malformed lease responses', async () => {
		for (const fetchImpl of [
			vi.fn<typeof fetch>(
				async () => new Response('', { status: 503, headers: { 'Retry-After': '2' } })
			),
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
			).rejects.toBeInstanceOf(AgenticChatWorkerUnavailableResponseError);
		}
	});

	it('returns null only for the legacy-safe transport-unavailable sentinel', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ code: 'TRANSPORT_UNAVAILABLE' }, { status: 503 })
		);
		await expect(requestAgenticChatTransportLease({ request, fetchImpl })).resolves.toBeNull();
	});

	it('submits text, attachment, and voice context to worker admission', async () => {
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
				context: { type: 'project', entityId: SESSION_ID, projectId: SESSION_ID },
				message: 'Worker hello',
				attachments: [
					{
						attachment_kind: 'onto_asset',
						media_type: 'image',
						asset_id: 'd5000000-0000-4000-8000-000000000001',
						project_id: SESSION_ID,
						display_order: 0
					},
					{
						attachment_kind: 'temporary_file',
						media_type: 'image',
						temporary_attachment_id: 'temporary-1',
						storage_bucket: 'onto-assets',
						storage_path:
							'users/d1000000-0000-4000-8000-000000000001/chat-temp/temporary-1.png',
						file_name: 'screenshot.png',
						content_type: 'image/png',
						file_size_bytes: 2048,
						width: 640,
						height: 480,
						checksum_sha256: 'a'.repeat(64),
						expires_at: '2026-08-25T03:00:00.000Z',
						display_order: 1
					}
				],
				projectFocus: {
					focusType: 'project-wide',
					projectId: SESSION_ID,
					projectName: 'Canary Project'
				},
				lastTurnContext: null,
				voiceNoteGroupId: 'd6000000-0000-4000-8000-000000000001',
				preparedPromptKey: 'prepared-key'
			}
		});
		expect(result.response.status).toBe(202);
		expect(result.payload).toMatchObject({ success: true });
		const submittedBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(workerAdmissionRequestSchema.safeParse(submittedBody).success).toBe(true);
		expect(submittedBody).toEqual({
			leaseToken: workerLease.token,
			clientTurnId: request.clientTurnId,
			streamRunId: request.streamRunId,
			sessionId: SESSION_ID,
			context: { type: 'project', entityId: SESSION_ID, projectId: SESSION_ID },
			message: 'Worker hello',
			attachments: [
				{
					attachmentKind: 'onto_asset',
					mediaType: 'image',
					assetId: 'd5000000-0000-4000-8000-000000000001',
					projectId: SESSION_ID,
					displayOrder: 0
				},
				{
					attachmentKind: 'temporary_file',
					mediaType: 'image',
					temporaryAttachmentId: 'temporary-1',
					storageBucket: 'onto-assets',
					storagePath:
						'users/d1000000-0000-4000-8000-000000000001/chat-temp/temporary-1.png',
					fileName: 'screenshot.png',
					contentType: 'image/png',
					fileSizeBytes: 2048,
					width: 640,
					height: 480,
					checksumSha256: 'a'.repeat(64),
					expiresAt: '2026-08-25T03:00:00.000Z',
					displayOrder: 1
				}
			],
			projectFocus: {
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null,
				projectId: SESSION_ID,
				projectName: 'Canary Project'
			},
			lastTurnContext: null,
			voiceNoteGroupId: 'd6000000-0000-4000-8000-000000000001',
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
				message: 'Worker hello',
				attachments: [],
				projectFocus: null,
				lastTurnContext: null,
				voiceNoteGroupId: null,
				preparedPromptKey: null
			}
		});
		expect(result).toEqual({ response, payload: null });
	});
});
