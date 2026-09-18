// apps/web/src/routes/api/agent/v2/turns/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';
const SECRET = 'route-agentic-chat-worker-lease-secret-at-least-32-bytes';

const mocks = vi.hoisted(() => ({
	env: {
		AGENTIC_CHAT_TRANSPORT_LEASE_SECRET:
			'route-agentic-chat-worker-lease-secret-at-least-32-bytes',
		AGENTIC_CHAT_WORKER_KILL_EPOCH: '0',
		AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: undefined as string | undefined,
		AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: undefined as string | undefined
	},
	createAdminSupabaseClient: vi.fn(),
	listOwnedActiveAgenticChatWorkerTurns: vi.fn(),
	prepareAgenticChatWorkerAdmission: vi.fn(),
	admitAgenticChatWorkerTurn: vi.fn(),
	loggerWarn: vi.fn(),
	loggerInfo: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/agentic-chat-v2/worker-turn-gateway.server', () => ({
	listOwnedActiveAgenticChatWorkerTurns: mocks.listOwnedActiveAgenticChatWorkerTurns
}));
vi.mock('$lib/services/agentic-chat-v2/worker-turn-preparation.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/worker-turn-preparation.server')
		>();
	return {
		...original,
		prepareAgenticChatWorkerAdmission: mocks.prepareAgenticChatWorkerAdmission
	};
});
vi.mock('$lib/services/agentic-chat-v2/worker-turn-admission.server', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('$lib/services/agentic-chat-v2/worker-turn-admission.server')
		>();
	return { ...original, admitAgenticChatWorkerTurn: mocks.admitAgenticChatWorkerTurn };
});
vi.mock('$lib/utils/logger', () => ({
	createLogger: () => ({ warn: mocks.loggerWarn, info: mocks.loggerInfo })
}));

import { issueAgenticChatTransportLease } from '$lib/services/agentic-chat-v2/transport-lease.server';
import { resetAgenticChatTurnRateLimitForTests } from '$lib/server/agentic-chat-turn-rate-limit';
import { AgenticChatWorkerAdmissionGatewayError } from '$lib/services/agentic-chat-v2/worker-turn-admission.server';
import { GET, POST } from './+server';

function event(options: { userId?: string | null; query?: string } = {}) {
	return {
		url: new URL(`http://localhost/api/agent/v2/turns${options.query ?? ''}`),
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: options.userId === null ? null : { id: options.userId ?? USER_ID }
			}))
		}
	};
}

function admissionBody(overrides: Record<string, unknown> = {}) {
	const context = { type: 'global' as const, entityId: null, projectId: null };
	const lease = issueAgenticChatTransportLease({
		secret: SECRET,
		userId: USER_ID,
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		context,
		mode: 'worker_realtime',
		decisionId: DECISION_ID,
		killEpoch: 0
	});
	return {
		leaseToken: lease.token,
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		sessionId: SESSION_ID,
		context,
		message: 'Ship the next worker slice',
		attachments: [],
		projectFocus: null,
		lastTurnContext: null,
		voiceNoteGroupId: null,
		preparedPromptKey: null,
		...overrides
	};
}

function postEvent(options: { userId?: string | null; body?: unknown } = {}) {
	return {
		request: new Request('http://localhost/api/agent/v2/turns', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options.body ?? admissionBody())
		}),
		locals: {
			supabase: { from: vi.fn(), rpc: vi.fn() },
			safeGetSession: vi.fn(async () => ({
				user: options.userId === null ? null : { id: options.userId ?? USER_ID }
			}))
		}
	};
}

function admitted(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'newly_admitted',
		executionMayStart: false,
		turnRunId: TURN_ID,
		sessionId: SESSION_ID,
		userMessageId: 'd5000000-0000-4000-8000-000000000001',
		inputArtifactId: 'd6000000-0000-4000-8000-000000000001',
		queueJobId: 'd7000000-0000-4000-8000-000000000001',
		correlationId: 'd8000000-0000-4000-8000-000000000001',
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		executionMode: 'worker_realtime',
		status: 'queued',
		sessionCreated: false,
		...overrides
	};
}

describe('GET /api/agent/v2/turns', () => {
	beforeEach(() => {
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		mocks.env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET = SECRET;
		mocks.env.AGENTIC_CHAT_WORKER_KILL_EPOCH = '0';
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.listOwnedActiveAgenticChatWorkerTurns.mockResolvedValue([{ status: 'queued' }]);
		mocks.prepareAgenticChatWorkerAdmission.mockResolvedValue({
			args: { p_user_id: USER_ID },
			capacity: { available: true, retryAfterSeconds: 2, reason: 'open' },
			preparedPromptUsed: false,
			preparedAdmissionLease: {
				requested: true,
				hit: true,
				missReason: null,
				inspectionMs: 12
			}
		});
		mocks.admitAgenticChatWorkerTurn.mockResolvedValue(admitted());
	});

	it('authenticates and requires exactly one valid session id', async () => {
		expect(
			(await GET(event({ userId: null, query: `?session_id=${SESSION_ID}` }) as never)).status
		).toBe(401);
		for (const query of [
			'',
			'?session_id=bad',
			`?session_id=${SESSION_ID}&session_id=${SESSION_ID}`,
			`?session_id=${SESSION_ID}&extra=true`
		]) {
			expect((await GET(event({ query }) as never)).status).toBe(400);
		}
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('returns a private, ownership-scoped active list', async () => {
		const response = await GET(event({ query: `?session_id=${SESSION_ID}` }) as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(body.data.turns).toEqual([{ status: 'queued' }]);
		expect(mocks.listOwnedActiveAgenticChatWorkerTurns).toHaveBeenCalledWith({
			client: expect.any(Object),
			userId: USER_ID,
			sessionId: SESSION_ID
		});
	});

	it('keeps lookup failures private', async () => {
		mocks.listOwnedActiveAgenticChatWorkerTurns.mockRejectedValueOnce(
			new Error('private database detail')
		);
		const response = await GET(event({ query: `?session_id=${SESSION_ID}` }) as never);
		const body = await response.json();
		expect(response.status).toBe(503);
		expect(JSON.stringify(body)).not.toContain('private database detail');
	});
});

describe('POST /api/agent/v2/turns', () => {
	beforeEach(() => {
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		mocks.env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET = SECRET;
		mocks.env.AGENTIC_CHAT_WORKER_KILL_EPOCH = '0';
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn(), rpc: vi.fn() });
		mocks.prepareAgenticChatWorkerAdmission.mockResolvedValue({
			args: { p_user_id: USER_ID },
			capacity: { available: true, retryAfterSeconds: 2, reason: 'open' },
			preparedPromptUsed: false,
			preparedAdmissionLease: {
				requested: true,
				hit: true,
				missReason: null,
				inspectionMs: 12
			}
		});
		mocks.admitAgenticChatWorkerTurn.mockResolvedValue(admitted());
	});

	it('authenticates and validates the strict user command before creating an admin client', async () => {
		let response = await POST(postEvent({ userId: null }) as never);
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');

		for (const body of [
			admissionBody({ clientTurnId: ' padded ' }),
			admissionBody({ requestHash: 'forged' }),
			admissionBody({ capacityAvailable: true }),
			admissionBody({ executionMode: 'worker_realtime' }),
			admissionBody({ turnRunId: TURN_ID })
		]) {
			response = await POST(postEvent({ body }) as never);
			expect(response.status).toBe(422);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('rejects tamper, expiry, future issuance, and cross-bound replay before preparation', async () => {
		const base = admissionBody();
		const context = base.context;
		const tokens = [
			`${base.leaseToken}x`,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: USER_ID,
				clientTurnId: base.clientTurnId,
				streamRunId: base.streamRunId,
				context,
				mode: 'worker_realtime',
				nowMs: Date.now() - 120_000,
				ttlMs: 60_000
			}).token,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: USER_ID,
				clientTurnId: base.clientTurnId,
				streamRunId: base.streamRunId,
				context,
				mode: 'worker_realtime',
				nowMs: Date.now() + 60_000
			}).token,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: 'd1000000-0000-4000-8000-000000000099',
				clientTurnId: base.clientTurnId,
				streamRunId: base.streamRunId,
				context,
				mode: 'worker_realtime'
			}).token,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: USER_ID,
				clientTurnId: 'different-client',
				streamRunId: base.streamRunId,
				context,
				mode: 'worker_realtime'
			}).token,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: USER_ID,
				clientTurnId: base.clientTurnId,
				streamRunId: 'different-stream',
				context,
				mode: 'worker_realtime'
			}).token,
			issueAgenticChatTransportLease({
				secret: SECRET,
				userId: USER_ID,
				clientTurnId: base.clientTurnId,
				streamRunId: base.streamRunId,
				context: { type: 'calendar', entityId: null, projectId: null },
				mode: 'worker_realtime'
			}).token
		];

		for (const leaseToken of tokens) {
			const response = await POST(postEvent({ body: { ...base, leaseToken } }) as never);
			expect(response.status).toBe(409);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	// A kill-epoch bump now means "re-admit on the worker": the stale lease is
	// refused before any durable work, and a lease minted at the new epoch is
	// admitted, so the client's single re-admission converges.
	it('forces re-admission when the worker kill epoch advances', async () => {
		const base = admissionBody();
		mocks.env.AGENTIC_CHAT_WORKER_KILL_EPOCH = '2';
		const stale = issueAgenticChatTransportLease({
			secret: SECRET,
			userId: USER_ID,
			clientTurnId: base.clientTurnId,
			streamRunId: base.streamRunId,
			context: base.context,
			mode: 'worker_realtime',
			killEpoch: 1
		});
		const staleResponse = await POST(
			postEvent({ body: { ...base, leaseToken: stale.token } }) as never
		);
		expect(staleResponse.status).toBe(409);
		expect((await staleResponse.json()).code).toBe('TRANSPORT_RENEGOTIATE');
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();

		const reissued = issueAgenticChatTransportLease({
			secret: SECRET,
			userId: USER_ID,
			clientTurnId: base.clientTurnId,
			streamRunId: base.streamRunId,
			context: base.context,
			mode: 'worker_realtime',
			killEpoch: 2
		});
		const readmitted = await POST(
			postEvent({ body: { ...base, leaseToken: reissued.token } }) as never
		);
		expect(readmitted.status).toBe(202);
		expect(mocks.createAdminSupabaseClient).toHaveBeenCalled();
	});

	it('prepares server-owned inputs once and returns a private immutable handle for new admission', async () => {
		const response = await POST(postEvent() as never);
		const payload = await response.json();
		expect(response.status).toBe(202);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(response.headers.get('server-timing')).toContain(
			'prepared-admission;dur=12;desc="hit"'
		);
		expect(payload.data).toEqual({
			outcome: 'newly_admitted',
			handle: {
				contractVersion: 'agentic_chat_worker_v1',
				executionMode: 'worker_realtime',
				turnRunId: TURN_ID,
				sessionId: SESSION_ID,
				streamRunId: 'stream-run-1',
				clientTurnId: 'client-turn-1'
			},
			status: 'queued'
		});
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledTimes(1);
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(1);
	});

	it('retries once without the prepared prompt when durable admission races an invalidation', async () => {
		const preparedPromptId = 'da000000-0000-4000-8000-000000000001';
		mocks.prepareAgenticChatWorkerAdmission
			.mockResolvedValueOnce({
				args: {
					p_user_id: USER_ID,
					p_prepared_prompt_id: preparedPromptId,
					p_request_payload: { preparedAdmissionLease: { requested: true, hit: true } }
				},
				preparedPromptUsed: true,
				preparedAdmissionLease: {
					requested: true,
					hit: true,
					missReason: null,
					inspectionMs: 12
				}
			})
			.mockResolvedValueOnce({
				args: {
					p_user_id: USER_ID,
					p_prepared_prompt_id: null,
					p_request_payload: {
						preparedAdmissionLease: { requested: false, hit: false }
					}
				},
				preparedPromptUsed: false,
				preparedAdmissionLease: {
					requested: false,
					hit: false,
					missReason: 'ineligible',
					inspectionMs: 0
				}
			});
		mocks.admitAgenticChatWorkerTurn
			.mockRejectedValueOnce(
				new AgenticChatWorkerAdmissionGatewayError(
					'database_error',
					'Worker turn admission failed: P0001 agentic_chat_worker_admission_prepared_scope_mismatch'
				)
			)
			.mockResolvedValueOnce(admitted());

		const response = await POST(
			postEvent({
				body: admissionBody({ preparedPromptKey: `pp_v1.${TURN_ID}.nonce` })
			}) as never
		);
		const payload = await response.json();

		expect(response.status).toBe(202);
		expect(payload.data.outcome).toBe('newly_admitted');
		expect(response.headers.get('server-timing')).toContain('desc="admission_race_retry"');
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledTimes(2);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenLastCalledWith(
			expect.objectContaining({
				command: expect.objectContaining({ preparedPromptKey: null })
			})
		);
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(2);
		const retryArgs = mocks.admitAgenticChatWorkerTurn.mock.calls[1]?.[0]?.args;
		expect(retryArgs.p_prepared_prompt_id).toBeNull();
		expect(retryArgs.p_request_payload.preparedAdmissionLease).toEqual({
			requested: true,
			hit: false,
			missReason: 'admission_race_retry',
			inspectionMs: expect.any(Number)
		});
	});

	it('does not retry a non-prepared admission failure', async () => {
		mocks.admitAgenticChatWorkerTurn.mockRejectedValueOnce(
			new AgenticChatWorkerAdmissionGatewayError(
				'database_error',
				'Worker turn admission failed: connection reset'
			)
		);
		const response = await POST(postEvent() as never);
		expect(response.status).toBe(503);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledTimes(1);
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(1);
	});

	it('passes strict attachment references into trusted worker preparation', async () => {
		const assetId = 'd9000000-0000-4000-8000-000000000001';
		const response = await POST(
			postEvent({
				body: admissionBody({
					attachments: [
						{
							attachmentKind: 'onto_asset',
							mediaType: 'image',
							assetId,
							projectId: null,
							displayOrder: 0
						}
					]
				})
			}) as never
		);

		expect(response.status).toBe(202);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledWith(
			expect.objectContaining({
				command: expect.objectContaining({
					attachments: [
						expect.objectContaining({
							attachment_kind: 'onto_asset',
							media_type: 'image',
							asset_id: assetId,
							display_order: 0
						})
					]
				})
			})
		);
	});

	it('returns a matching worker duplicate but never adopts a legacy duplicate', async () => {
		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(
			admitted({
				outcome: 'matching_duplicate',
				status: 'running',
				sessionCreated: undefined
			})
		);
		let response = await POST(postEvent() as never);
		expect(response.status).toBe(200);
		expect((await response.json()).data.outcome).toBe('matching_duplicate');

		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(
			admitted({
				outcome: 'matching_duplicate',
				executionMode: 'legacy_sse',
				status: 'running',
				sessionCreated: undefined
			})
		);
		response = await POST(postEvent() as never);
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe('WORKER_ADMISSION_CONFLICT');
	});

	it('hides active, request-hash, and session conflicts behind one boundary', async () => {
		for (const result of [
			admitted({ outcome: 'active_turn_conflict', executionMode: 'legacy_sse' }),
			admitted({
				outcome: 'idempotency_conflict',
				conflictReason: 'request_hash_mismatch'
			}),
			admitted({
				outcome: 'idempotency_conflict',
				conflictReason: 'session_mismatch'
			})
		]) {
			mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(result);
			const response = await POST(postEvent() as never);
			const payload = await response.json();
			expect(response.status).toBe(409);
			expect(payload.code).toBe('WORKER_ADMISSION_CONFLICT');
			expect(JSON.stringify(payload)).not.toContain(TURN_ID);
			expect(JSON.stringify(payload)).not.toContain('request_hash_mismatch');
		}
	});

	it('returns 429 only for the emergency per-user queue safety ceiling', async () => {
		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce({
			outcome: 'capacity_exceeded',
			executionMayStart: false,
			capacityReason: 'max_queued',
			retryAfterSeconds: 30,
			runningCount: 2,
			queuedCount: 100
		});
		const response = await POST(postEvent() as never);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('30');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.loggerWarn).toHaveBeenCalledWith(
			'Worker turn emergency queue safety ceiling reached',
			{
				userId: USER_ID,
				clientTurnId: 'client-turn-1',
				capacityReason: 'max_queued',
				runningCount: 2,
				queuedCount: 100,
				retryAfterSeconds: 30
			}
		);
	});

	it('keeps preparation and corrupt database receipt details private', async () => {
		mocks.admitAgenticChatWorkerTurn.mockRejectedValueOnce(
			new Error('private corrupt database receipt')
		);
		const response = await POST(postEvent() as never);
		const payload = await response.json();
		expect(response.status).toBe(503);
		expect(payload.code).toBe('WORKER_ADMISSION_UNAVAILABLE');
		expect(JSON.stringify(payload)).not.toContain('private corrupt database receipt');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
});

describe('POST /api/agent/v2/turns project review (Tasker 86)', () => {
	const PROJECT_ID = 'd9000000-0000-4000-8000-000000000001';
	const projectContext = {
		type: 'project' as const,
		entityId: PROJECT_ID,
		projectId: PROJECT_ID
	};
	const rpc = vi.fn();
	const adminFrom = vi.fn();

	function reviewBody(overrides: Record<string, unknown> = {}) {
		const context = (overrides.context as typeof projectContext | undefined) ?? projectContext;
		const lease = issueAgenticChatTransportLease({
			secret: SECRET,
			userId: USER_ID,
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			context,
			mode: 'worker_realtime',
			decisionId: DECISION_ID,
			killEpoch: 0
		});
		return admissionBody({
			leaseToken: lease.token,
			context,
			message: 'Review this project: what should we prioritize next?',
			reviewIntent: 'project_review',
			...overrides
		});
	}

	function workflowReceipt(overrides: Record<string, unknown> = {}) {
		const args = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
		return {
			outcome: 'newly_admitted',
			execution_may_start: false,
			turn_run_id: args.p_turn_run_id,
			session_id: SESSION_ID,
			session_created: false,
			user_message_id: args.p_user_message_id,
			input_artifact_id: args.p_request_artifact_id,
			queue_job_id: 'd7000000-0000-4000-8000-000000000001',
			correlation_id: args.p_correlation_id,
			stream_run_id: 'stream-run-1',
			client_turn_id: 'client-turn-1',
			execution_mode: 'worker_realtime',
			status: 'queued',
			request_hash: args.p_request_hash,
			content_hash: 'c'.repeat(64),
			history_message_count: 3,
			...overrides
		};
	}

	function respondWith(build: () => Record<string, unknown>) {
		rpc.mockImplementation(async () => ({ data: build(), error: null }));
	}

	function withoutReviewIntent() {
		const body: Record<string, unknown> = { ...reviewBody() };
		delete body.reviewIntent;
		return body;
	}

	beforeEach(() => {
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		rpc.mockReset();
		mocks.env.AGENTIC_CHAT_TRANSPORT_LEASE_SECRET = SECRET;
		mocks.env.AGENTIC_CHAT_WORKER_KILL_EPOCH = '0';
		mocks.env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'true';
		mocks.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = USER_ID;
		adminFrom.mockReset();
		mocks.createAdminSupabaseClient.mockReturnValue({ from: adminFrom, rpc });
		mocks.prepareAgenticChatWorkerAdmission.mockResolvedValue({
			args: { p_user_id: USER_ID },
			capacity: { available: true, retryAfterSeconds: 2, reason: 'open' },
			preparedPromptUsed: false,
			preparedAdmissionLease: {
				requested: false,
				hit: false,
				missReason: 'disabled',
				inspectionMs: 0
			}
		});
		mocks.admitAgenticChatWorkerTurn.mockResolvedValue(admitted());
		respondWith(() => workflowReceipt());
	});

	it('saves an eligible review raw in one RPC with no context, prompt, or lease work first', async () => {
		const request = postEvent({ body: reviewBody() });
		const response = await POST(request as never);
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(body.data).toMatchObject({
			outcome: 'newly_admitted',
			reviewMode: 'project_review',
			status: 'queued',
			handle: {
				contractVersion: 'agentic_chat_worker_v1',
				executionMode: 'worker_realtime',
				sessionId: SESSION_ID,
				streamRunId: 'stream-run-1',
				clientTurnId: 'client-turn-1'
			}
		});
		expect(rpc).toHaveBeenCalledOnce();
		expect(rpc).toHaveBeenCalledWith(
			'create_agentic_chat_workflow_turn_with_job_v1',
			expect.objectContaining({
				p_user_id: USER_ID,
				p_session_id: SESSION_ID,
				p_project_id: PROJECT_ID,
				p_transport_decision_id: DECISION_ID,
				p_message: 'Review this project: what should we prioritize next?',
				p_cache_ref: null
			})
		);
		// The heavy ordinary path never ran: no prepared lease inspection, access
		// check, history, context load, prompt build, or ordinary admission.
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.admitAgenticChatWorkerTurn).not.toHaveBeenCalled();
		// Exactly one database round trip before the queue: no table reads on the
		// service client and nothing on the user-scoped client.
		expect(adminFrom).not.toHaveBeenCalled();
		expect(request.locals.supabase.from).not.toHaveBeenCalled();
		expect(request.locals.supabase.rpc).not.toHaveBeenCalled();
		const serverTiming = response.headers.get('server-timing') ?? '';
		expect(serverTiming).toContain('prepared-admission;dur=0;desc="workflow_raw"');
		expect(serverTiming).toMatch(/worker-preparation;dur=[\d.]+/);
		expect(serverTiming).toMatch(/worker-admission;dur=[\d.]+/);
		expect(mocks.loggerInfo).toHaveBeenCalledWith(
			'Project review admission timing',
			expect.objectContaining({
				event: 'agentic_chat_workflow_admission_timing',
				outcome: 'newly_admitted',
				preQueueDbRoundTrips: 1,
				historyMessageCount: 3
			})
		);
	});

	it('returns the same handle for a duplicate Send', async () => {
		const original = 'd3000000-0000-4000-8000-0000000000aa';
		respondWith(() => ({
			outcome: 'matching_duplicate',
			conflict_reason: null,
			execution_may_start: false,
			turn_run_id: original,
			session_id: SESSION_ID,
			stream_run_id: 'stream-run-1',
			client_turn_id: 'client-turn-1',
			execution_mode: 'worker_realtime',
			status: 'running'
		}));
		const response = await POST(postEvent({ body: reviewBody() }) as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({
			outcome: 'matching_duplicate',
			handle: { turnRunId: original },
			status: 'running',
			reviewMode: 'project_review'
		});
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	it('maps changed-request, active-turn, access, capacity, and session refusals', async () => {
		const cases: Array<[() => void, number, string | null]> = [
			[
				() =>
					respondWith(() => ({
						outcome: 'idempotency_conflict',
						conflict_reason: 'request_hash_mismatch',
						execution_may_start: false
					})),
				409,
				'WORKER_ADMISSION_CONFLICT'
			],
			[
				() =>
					respondWith(() => ({
						outcome: 'active_turn_conflict',
						execution_may_start: false
					})),
				409,
				'WORKER_ADMISSION_CONFLICT'
			],
			[
				() =>
					respondWith(() => ({
						outcome: 'access_denied',
						execution_may_start: false,
						project_id: PROJECT_ID
					})),
				403,
				null
			],
			[
				() =>
					respondWith(() => ({
						outcome: 'capacity_exceeded',
						execution_may_start: false,
						capacity_reason: 'max_queued',
						retry_after_seconds: 30,
						running_count: 0,
						queued_count: 100
					})),
				429,
				'WORKER_CAPACITY_EXCEEDED'
			],
			[
				() =>
					rpc.mockImplementation(async () => ({
						data: null,
						error: { code: 'P0001', message: 'agentic_chat_session_not_owned' }
					})),
				409,
				'WORKER_SESSION_CONFLICT'
			],
			[
				() =>
					rpc.mockImplementation(async () => ({
						data: null,
						error: {
							code: 'P0001',
							message: 'agentic_chat_workflow_admission_session_scope_mismatch'
						}
					})),
				409,
				'WORKER_SESSION_CONFLICT'
			],
			[
				() =>
					rpc.mockImplementation(async () => ({
						data: null,
						error: { code: '', message: 'private connection detail' }
					})),
				503,
				'WORKER_ADMISSION_UNAVAILABLE'
			]
		];
		for (const [arrange, status, code] of cases) {
			resetAgenticChatTurnRateLimitForTests();
			arrange();
			const response = await POST(postEvent({ body: reviewBody() }) as never);
			const body = await response.json();
			expect(response.status).toBe(status);
			if (code) expect(body.code).toBe(code);
			expect(JSON.stringify(body)).not.toContain('private connection detail');
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	it('keeps ordinary chat unchanged while the switch is off, even when a review is requested', async () => {
		mocks.env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = undefined;
		const response = await POST(postEvent({ body: reviewBody() }) as never);
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body.data.reviewMode).toBeUndefined();
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledOnce();
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledOnce();
	});

	it('routes every non-eligible request to the ordinary path', async () => {
		const ordinary: Array<[string, () => Record<string, unknown>]> = [
			['no review requested', () => reviewBody({ reviewIntent: null })],
			['field omitted', withoutReviewIntent],
			[
				'global scope',
				() => reviewBody({ context: { type: 'global', entityId: null, projectId: null } })
			],
			[
				'attachment',
				() =>
					reviewBody({
						attachments: [
							{
								attachmentKind: 'onto_asset',
								mediaType: 'image',
								assetId: 'da000000-0000-4000-8000-000000000001'
							}
						]
					})
			],
			['too short', () => reviewBody({ message: 'ok' })],
			[
				'focused entity',
				() =>
					reviewBody({
						projectFocus: {
							focusType: 'task',
							focusEntityId: 'db000000-0000-4000-8000-000000000001',
							focusEntityName: 'Task',
							projectId: PROJECT_ID,
							projectName: 'Cedar House'
						}
					})
			]
		];
		for (const [label, body] of ordinary) {
			resetAgenticChatTurnRateLimitForTests();
			vi.clearAllMocks();
			const response = await POST(postEvent({ body: body() }) as never);
			expect(response.status, label).toBe(202);
			expect(rpc, label).not.toHaveBeenCalled();
			expect(mocks.prepareAgenticChatWorkerAdmission, label).toHaveBeenCalledOnce();
		}

		// A user outside the internal cohort stays ordinary too.
		mocks.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = 'd1000000-0000-4000-8000-0000000000ff';
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		await POST(postEvent({ body: reviewBody() }) as never);
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledOnce();
	});

	it('rejects any review intent value other than the one explicit request', async () => {
		const response = await POST(
			postEvent({ body: reviewBody({ reviewIntent: 'deep_research' }) }) as never
		);
		expect(response.status).toBe(422);
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});
});
