// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	captureEvent: vi.fn()
}));

vi.mock('$lib/services/posthog', () => ({
	captureEvent: mocks.captureEvent
}));
import { requestAgenticChatWorkerAdmission } from './worker-transport-client';
import { workerAdmissionRequestSchema } from '../../../routes/api/agent/v2/turns/worker-admission-schema';

const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const request = {
	clientTurnId: 'client-turn-1',
	streamRunId: 'stream-run-1',
	context: { type: 'global', entityId: null, projectId: null }
};

describe('Agentic Chat worker transport client', () => {
	beforeEach(() => {
		mocks.captureEvent.mockReset();
	});

	it('submits text, attachment, and voice context to worker admission', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ success: true, data: { outcome: 'newly_admitted' } }, { status: 202 })
		);
		const result = await requestAgenticChatWorkerAdmission({
			fetchImpl,
			command: {
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
					focusEntityId: null,
					focusEntityName: null,
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

	it('preserves the document organization intent and exact published version for workflow admission', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json(
				{
					success: true,
					data: { outcome: 'newly_admitted', reviewMode: 'project_review' }
				},
				{ status: 202 }
			)
		);
		const contextPlan = {
			version: 'context_plan_v1' as const,
			policy: 'safe_v1' as const,
			source: 'curated' as const,
			items: [],
			dropped: [],
			topScore: null,
			checked: 3,
			unchecked: 0
		};
		await requestAgenticChatWorkerAdmission({
			fetchImpl,
			command: {
				clientTurnId: request.clientTurnId,
				streamRunId: request.streamRunId,
				sessionId: null,
				context: { type: 'project', entityId: SESSION_ID, projectId: SESSION_ID },
				message: 'Suggest a structure for our project documents.',
				attachments: [],
				projectFocus: null,
				lastTurnContext: null,
				voiceNoteGroupId: null,
				preparedPromptKey: null,
				reviewIntent: 'document_organization',
				publishedSpecialist: {
					draftId: 'd8000000-0000-4000-8000-000000000001',
					version: 2,
					snapshotHash: 'a'.repeat(64),
					contextPlan
				}
			}
		});
		const submittedBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(submittedBody.reviewIntent).toBe('document_organization');
		expect(submittedBody.publishedSpecialist).toEqual({
			draftId: 'd8000000-0000-4000-8000-000000000001',
			version: 2,
			snapshotHash: 'a'.repeat(64),
			contextPlan
		});
		expect(workerAdmissionRequestSchema.safeParse(submittedBody).success).toBe(true);
	});

	it('admits in one lease-less request so admission decides the transport inline', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ success: true, data: { outcome: 'newly_admitted' } }, { status: 202 })
		);
		await requestAgenticChatWorkerAdmission({
			fetchImpl,
			command: {
				clientTurnId: request.clientTurnId,
				streamRunId: request.streamRunId,
				sessionId: null,
				context: request.context,
				message: 'First message in a new chat',
				attachments: [],
				projectFocus: null,
				lastTurnContext: null,
				voiceNoteGroupId: null,
				preparedPromptKey: null
			}
		});
		const submittedBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(submittedBody).not.toHaveProperty('leaseToken');
		expect(submittedBody).toMatchObject({
			clientTurnId: request.clientTurnId,
			streamRunId: request.streamRunId,
			sessionId: null
		});
		const parsed = workerAdmissionRequestSchema.safeParse(submittedBody);
		expect(parsed.success).toBe(true);
		expect(parsed.data?.leaseToken).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/agent/v2/turns');
	});

	it('returns non-success admission responses without parsing them as authority', async () => {
		const response = Response.json({ code: 'WORKER_CAPACITY_EXCEEDED' }, { status: 503 });
		const result = await requestAgenticChatWorkerAdmission({
			fetchImpl: vi.fn<typeof fetch>(async () => response),
			command: {
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

	it('captures non-blocking prepared-admission timings without identifiers or prompt content', async () => {
		mocks.captureEvent.mockReturnValue(new Promise(() => {}));
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json(
				{ success: true, data: { outcome: 'newly_admitted' } },
				{
					status: 202,
					headers: {
						'Server-Timing':
							'prepared-admission;dur=171;desc="hit", worker-preparation;dur=246, worker-admission;dur=144'
					}
				}
			)
		);
		const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(615.4);

		await requestAgenticChatWorkerAdmission({
			fetchImpl,
			nowMs,
			command: {
				clientTurnId: request.clientTurnId,
				streamRunId: request.streamRunId,
				sessionId: SESSION_ID,
				context: { type: 'project', entityId: SESSION_ID, projectId: SESSION_ID },
				message: 'Sensitive prompt must not be captured',
				attachments: [],
				projectFocus: null,
				lastTurnContext: null,
				voiceNoteGroupId: null,
				preparedPromptKey: 'pp_v1.opaque'
			}
		});

		expect(mocks.captureEvent).toHaveBeenCalledWith(
			'agentic_chat_admission_completed',
			{
				client_admission_round_trip_ms: 515.4,
				prepared_inspection_ms: 171,
				worker_preparation_ms: 246,
				worker_admission_ms: 144,
				worker_server_total_ms: 390,
				prepared_admission_outcome: 'hit',
				prepared_admission_hit: true,
				prepared_prompt_requested: true,
				response_status: 202,
				response_ok: true,
				context_type: 'project',
				has_attachments: false
			},
			{ delivery: 'immediate_fetch' }
		);
		const properties = mocks.captureEvent.mock.calls[0]?.[1] ?? {};
		expect(JSON.stringify(properties)).not.toContain('Sensitive prompt');
		expect(JSON.stringify(properties)).not.toContain(SESSION_ID);
	});
});
