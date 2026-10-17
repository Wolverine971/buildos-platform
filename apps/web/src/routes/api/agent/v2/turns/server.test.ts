// apps/web/src/routes/api/agent/v2/turns/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const TURN_ID = 'd3000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mocks = vi.hoisted(() => ({
	env: {
		AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: undefined as string | undefined,
		AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED: undefined as string | undefined,
		AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: undefined as string | undefined
	},
	createAdminSupabaseClient: vi.fn(),
	listOwnedActiveAgenticChatWorkerTurns: vi.fn(),
	prepareAgenticChatWorkerAdmission: vi.fn(),
	admitAgenticChatWorkerTurn: vi.fn(),
	loggerWarn: vi.fn(),
	loggerInfo: vi.fn(),
	wakeAgenticChatWorkerQueue: vi.fn(async () => 'sent' as const),
	startAgenticChatWorkerQueueWake: vi.fn()
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
vi.mock('$lib/services/agentic-chat-v2/worker-queue-wake.server', () => ({
	wakeAgenticChatWorkerQueue: mocks.wakeAgenticChatWorkerQueue,
	startAgenticChatWorkerQueueWake: mocks.startAgenticChatWorkerQueueWake
}));
vi.mock('$lib/utils/logger', () => ({
	createLogger: () => ({ warn: mocks.loggerWarn, info: mocks.loggerInfo })
}));

import { resetAgenticChatTurnRateLimitForTests } from '$lib/server/agentic-chat-turn-rate-limit';
import { AgenticChatWorkerAdmissionGatewayError } from '$lib/services/agentic-chat-v2/worker-turn-admission.server';
import { AgenticChatWorkerPreparationError } from '$lib/services/agentic-chat-v2/worker-turn-preparation.server';
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
	return {
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		sessionId: SESSION_ID,
		context: { type: 'global' as const, entityId: null, projectId: null },
		message: 'Ship the next worker slice',
		attachments: [],
		projectFocus: null,
		voiceNoteGroupId: null,
		preparedPromptKey: null,
		...overrides
	};
}

function postEvent(
	options: { userId?: string | null; body?: unknown; headers?: Record<string, string> } = {}
) {
	return {
		request: new Request('http://localhost/api/agent/v2/turns', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...options.headers },
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

function ownedTurnRow(overrides: Record<string, unknown> = {}) {
	return {
		id: TURN_ID,
		user_id: USER_ID,
		session_id: SESSION_ID,
		stream_run_id: 'stream-run-1',
		client_turn_id: 'client-turn-1',
		context_type: 'global',
		entity_id: null,
		project_id: null,
		execution_mode: 'worker_realtime',
		transport_contract_version: 'agentic_chat_worker_v1',
		transport_decision_id: DECISION_ID,
		...overrides
	};
}

function sessionRow(overrides: Record<string, unknown> = {}) {
	return {
		id: SESSION_ID,
		user_id: USER_ID,
		context_type: 'global',
		entity_id: null,
		title: null,
		status: 'active',
		...overrides
	};
}

/** Service client double for the inline decision lookup and the session read. */
function fakeAdminClient(
	options: {
		turnRows?: unknown[];
		turnError?: { message: string } | null;
		session?: unknown;
		sessionError?: { message: string } | null;
		sessionThrows?: boolean;
		rpc?: ReturnType<typeof vi.fn>;
	} = {}
) {
	const turnLookups: Array<Array<[string, string]>> = [];
	const sessionLookups: Array<Array<[string, string]>> = [];
	const from = vi.fn((_table: string) => {
		const filters: Array<[string, string]> = [];
		const query = {
			select: vi.fn(() => query),
			eq: vi.fn((column: string, value: string) => {
				filters.push([column, value]);
				return query;
			}),
			limit: vi.fn(async () => {
				turnLookups.push(filters);
				return { data: options.turnRows ?? [], error: options.turnError ?? null };
			}),
			maybeSingle: vi.fn(async () => {
				sessionLookups.push(filters);
				if (options.sessionThrows) throw new Error('private session read detail');
				return {
					data: options.sessionError ? null : (options.session ?? null),
					error: options.sessionError ?? null
				};
			})
		};
		return query;
	});
	return { client: { from, rpc: options.rpc ?? vi.fn() }, from, turnLookups, sessionLookups };
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
		mocks.createAdminSupabaseClient.mockReturnValue(fakeAdminClient().client);
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
			admissionBody({ turnRunId: TURN_ID }),
			// The retired transport lease is refused like any other unknown field.
			admissionBody({ leaseToken: 'actl1.retired-transport-lease' }),
			admissionBody({ leaseToken: '' }),
			admissionBody({ requestedSkillId: ' task_management ' }),
			admissionBody({ requestedSkillId: '' }),
			admissionBody({ requestedSkillId: 'x'.repeat(129) }),
			admissionBody({ requestedSkillId: 42 })
		]) {
			response = await POST(postEvent({ body }) as never);
			expect(response.status).toBe(422);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
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
		// A newly admitted turn wakes the worker instead of waiting for its poll.
		expect(mocks.startAgenticChatWorkerQueueWake).toHaveBeenCalledOnce();
		expect(response.headers.get('server-timing')).toContain('desc="admission_race_retry"');
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledTimes(2);
		// The retry keeps the key, so it hashes the same lineage an identical resend
		// will, but it may not adopt the prepared content.
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenLastCalledWith(
			expect.objectContaining({
				command: expect.objectContaining({ preparedPromptKey: `pp_v1.${TURN_ID}.nonce` }),
				preparedPromptLineageOnly: true
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

	it('hands a launch skill request to preparation, which decides whether to trust it', async () => {
		let response = await POST(
			postEvent({ body: admissionBody({ requestedSkillId: 'task_management' }) }) as never
		);
		expect(response.status).toBe(202);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenLastCalledWith(
			expect.objectContaining({
				command: expect.objectContaining({ requestedSkillId: 'task_management' })
			})
		);

		resetAgenticChatTurnRateLimitForTests();
		response = await POST(postEvent() as never);
		expect(response.status).toBe(202);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenLastCalledWith(
			expect.objectContaining({
				command: expect.objectContaining({ requestedSkillId: null })
			})
		);
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

	it('separates an existing clientTurnId from an active-turn conflict without leaking either', async () => {
		for (const [result, code] of [
			[
				admitted({ outcome: 'active_turn_conflict', executionMode: 'legacy_sse' }),
				'WORKER_ADMISSION_CONFLICT'
			],
			// A turn with this clientTurnId exists, so the browser must not treat
			// this as "not admitted".
			[
				admitted({
					outcome: 'idempotency_conflict',
					conflictReason: 'request_hash_mismatch'
				}),
				'WORKER_IDEMPOTENCY_CONFLICT'
			],
			[
				admitted({
					outcome: 'idempotency_conflict',
					conflictReason: 'session_mismatch'
				}),
				'WORKER_IDEMPOTENCY_CONFLICT'
			]
		] as const) {
			mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(result);
			const response = await POST(postEvent() as never);
			const payload = await response.json();
			expect(response.status).toBe(409);
			expect(payload.code).toBe(code);
			expect(JSON.stringify(payload)).not.toContain(TURN_ID);
			expect(JSON.stringify(payload)).not.toContain('request_hash_mismatch');
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.startAgenticChatWorkerQueueWake).not.toHaveBeenCalled();
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

	it('reports failures before the admission RPC, and RPC raises, as provably not admitted', async () => {
		const notAdmitted: Array<[string, () => void]> = [
			[
				'unexpected preparation error',
				() =>
					mocks.prepareAgenticChatWorkerAdmission.mockRejectedValueOnce(
						new Error('private context read detail')
					)
			],
			[
				'preparation database error',
				() =>
					mocks.prepareAgenticChatWorkerAdmission.mockRejectedValueOnce(
						new AgenticChatWorkerPreparationError('database_error', 'private detail')
					)
			],
			[
				'admission RPC raised (SQLSTATE, rolled back)',
				() =>
					mocks.admitAgenticChatWorkerTurn.mockRejectedValueOnce(
						new AgenticChatWorkerAdmissionGatewayError(
							'database_error',
							'Worker turn admission failed: P0001 agentic_chat_worker_admission_invalid_command',
							true
						)
					)
			]
		];
		for (const [label, arrange] of notAdmitted) {
			resetAgenticChatTurnRateLimitForTests();
			arrange();
			const response = await POST(postEvent() as never);
			const payload = await response.json();
			expect(response.status, label).toBe(503);
			expect(payload.code, label).toBe('WORKER_ADMISSION_NOT_ADMITTED');
			expect(payload.error, label).toBe("Your message wasn't sent. Try again.");
			expect(JSON.stringify(payload), label).not.toContain('private');
			expect(response.headers.get('cache-control'), label).toBe('private, no-store');
		}

		// Commit unknown: a network failure, or a receipt that fails to parse after
		// the RPC returned, stays "maybe admitted" so only an identical resend follows.
		for (const error of [
			new AgenticChatWorkerAdmissionGatewayError(
				'database_error',
				'Worker turn admission failed: TypeError: fetch failed'
			),
			new AgenticChatWorkerAdmissionGatewayError('protocol_error', 'receipt is invalid')
		]) {
			resetAgenticChatTurnRateLimitForTests();
			mocks.admitAgenticChatWorkerTurn.mockRejectedValueOnce(error);
			const response = await POST(postEvent() as never);
			expect(response.status).toBe(503);
			expect((await response.json()).code).toBe('WORKER_ADMISSION_UNAVAILABLE');
		}
		expect(mocks.startAgenticChatWorkerQueueWake).not.toHaveBeenCalled();
	});

	it('reports a failed retry preparation as not admitted: the first attempt rolled back', async () => {
		mocks.prepareAgenticChatWorkerAdmission
			.mockResolvedValueOnce({
				args: {
					p_user_id: USER_ID,
					p_prepared_prompt_id: 'da000000-0000-4000-8000-000000000001',
					p_request_payload: {}
				},
				preparedPromptUsed: true,
				preparedAdmissionLease: {
					requested: true,
					hit: true,
					missReason: null,
					inspectionMs: 1
				}
			})
			.mockRejectedValueOnce(new Error('private retry detail'));
		mocks.admitAgenticChatWorkerTurn.mockRejectedValueOnce(
			new AgenticChatWorkerAdmissionGatewayError(
				'database_error',
				'Worker turn admission failed: P0001 agentic_chat_worker_admission_prepared_expired',
				true
			)
		);
		const response = await POST(
			postEvent({
				body: admissionBody({ preparedPromptKey: `pp_v1.${TURN_ID}.nonce` })
			}) as never
		);
		expect(response.status).toBe(503);
		expect((await response.json()).code).toBe('WORKER_ADMISSION_NOT_ADMITTED');
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(1);
	});

	it('re-prepares once when a newer message moved the history window before the RPC', async () => {
		mocks.admitAgenticChatWorkerTurn
			.mockRejectedValueOnce(
				new AgenticChatWorkerAdmissionGatewayError(
					'database_error',
					'Worker turn admission failed: P0001 agentic_chat_worker_admission_history_lineage_mismatch',
					true
				)
			)
			.mockResolvedValueOnce(admitted());

		const response = await POST(postEvent() as never);

		expect(response.status).toBe(202);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledTimes(2);
		// No prepared prompt was involved, so the retry prepares exactly as before.
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenLastCalledWith(
			expect.objectContaining({ preparedPromptLineageOnly: false })
		);
		expect(response.headers.get('server-timing')).not.toContain('admission_race_retry');
		expect(mocks.startAgenticChatWorkerQueueWake).toHaveBeenCalledOnce();

		// A second consecutive window race is surfaced, not retried again.
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		const race = () =>
			new AgenticChatWorkerAdmissionGatewayError(
				'database_error',
				'Worker turn admission failed: P0001 agentic_chat_worker_admission_history_lineage_mismatch',
				true
			);
		mocks.admitAgenticChatWorkerTurn
			.mockRejectedValueOnce(race())
			.mockRejectedValueOnce(race());
		const failed = await POST(postEvent() as never);
		expect(failed.status).toBe(503);
		expect((await failed.json()).code).toBe('WORKER_ADMISSION_NOT_ADMITTED');
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(2);
	});

	it('starts the worker wake for a new turn without awaiting it, and never for a duplicate', async () => {
		// A wake that never settles must not hold the response.
		mocks.wakeAgenticChatWorkerQueue.mockImplementation(() => new Promise(() => undefined));
		const response = await POST(postEvent() as never);
		expect(response.status).toBe(202);
		expect(mocks.startAgenticChatWorkerQueueWake).toHaveBeenCalledOnce();
		expect(mocks.wakeAgenticChatWorkerQueue).not.toHaveBeenCalled();
		expect(mocks.startAgenticChatWorkerQueueWake.mock.invocationCallOrder[0]).toBeGreaterThan(
			mocks.admitAgenticChatWorkerTurn.mock.invocationCallOrder[0]!
		);

		vi.clearAllMocks();
		resetAgenticChatTurnRateLimitForTests();
		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(
			admitted({
				outcome: 'matching_duplicate',
				status: 'running',
				sessionCreated: undefined
			})
		);
		const duplicate = await POST(postEvent() as never);
		expect(duplicate.status).toBe(200);
		expect(mocks.startAgenticChatWorkerQueueWake).not.toHaveBeenCalled();
	});

	it('persists web admission timing in the request payload, covering both preparations on a retry', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			const receivedAt = new Date('2026-10-17T12:00:00.000Z');
			vi.setSystemTime(receivedAt);
			const preparedPromptId = 'da000000-0000-4000-8000-000000000001';
			mocks.prepareAgenticChatWorkerAdmission
				.mockImplementationOnce(async () => {
					vi.setSystemTime(Date.now() + 40);
					return {
						args: {
							p_user_id: USER_ID,
							p_prepared_prompt_id: preparedPromptId,
							p_request_payload: { message: 'kept' }
						},
						preparedPromptUsed: true,
						preparedAdmissionLease: {
							requested: true,
							hit: true,
							missReason: null,
							inspectionMs: 3
						}
					};
				})
				.mockImplementationOnce(async () => {
					vi.setSystemTime(Date.now() + 25);
					return {
						args: {
							p_user_id: USER_ID,
							p_prepared_prompt_id: null,
							p_request_payload: { message: 'kept' }
						},
						preparedPromptUsed: false,
						preparedAdmissionLease: {
							requested: true,
							hit: false,
							missReason: 'ineligible',
							inspectionMs: 0
						}
					};
				});
			mocks.admitAgenticChatWorkerTurn
				.mockImplementationOnce(async () => {
					vi.setSystemTime(Date.now() + 10);
					throw new AgenticChatWorkerAdmissionGatewayError(
						'database_error',
						'Worker turn admission failed: P0001 agentic_chat_worker_admission_prepared_already_consumed',
						true
					);
				})
				.mockResolvedValueOnce(admitted());

			const response = await POST(
				postEvent({
					body: admissionBody({ preparedPromptKey: `pp_v1.${TURN_ID}.nonce` })
				}) as never
			);

			expect(response.status).toBe(202);
			const [first, retry] = mocks.admitAgenticChatWorkerTurn.mock.calls.map(
				(call) => call[0].args.p_request_payload
			);
			expect(first).toEqual({
				message: 'kept',
				preparationMs: 40,
				requestReceivedAt: receivedAt.toISOString()
			});
			// Both preparations count; the failed RPC in between does not.
			expect(retry).toMatchObject({
				message: 'kept',
				preparationMs: 65,
				requestReceivedAt: receivedAt.toISOString()
			});
			expect(response.headers.get('server-timing')).toContain('worker-preparation;dur=65');
		} finally {
			vi.useRealTimers();
		}
	});

	it('records harness traffic as source harness, and everything else as live_ui', async () => {
		const sourceFor = async (headers?: Record<string, string>) => {
			resetAgenticChatTurnRateLimitForTests();
			mocks.prepareAgenticChatWorkerAdmission.mockClear();
			const response = await POST(postEvent({ headers }) as never);
			expect(response.status).toBe(202);
			return mocks.prepareAgenticChatWorkerAdmission.mock.calls[0]?.[0]?.source;
		};
		expect(await sourceFor({ 'x-buildos-turn-source': 'harness' })).toBe('harness');
		expect(await sourceFor()).toBe('live_ui');
		expect(await sourceFor({ 'x-buildos-turn-source': 'something-else' })).toBe('live_ui');
	});
});

describe('POST /api/agent/v2/turns inline transport decision', () => {
	beforeEach(() => {
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		mocks.env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = undefined;
		mocks.env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED = undefined;
		mocks.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = undefined;
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
	});

	function preparedDecisionId(): string {
		return mocks.prepareAgenticChatWorkerAdmission.mock.calls[0]?.[0]?.lease?.decisionId;
	}

	it('admits a new turn under a server-minted decision bound to the authenticated owner', async () => {
		const admin = fakeAdminClient();
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);

		const response = await POST(postEvent({ body: admissionBody() }) as never);
		const payload = await response.json();

		expect(response.status).toBe(202);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(payload.data.handle.turnRunId).toBe(TURN_ID);
		// The owned-turn lookup is scoped to the session user, never the body.
		expect(admin.from).toHaveBeenCalledWith('chat_turn_runs');
		expect(admin.turnLookups).toEqual([
			[
				['user_id', USER_ID],
				['client_turn_id', 'client-turn-1']
			]
		]);
		expect(preparedDecisionId()).toMatch(CANONICAL_UUID);
		expect(preparedDecisionId()).not.toBe(DECISION_ID);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				command: expect.objectContaining({
					clientTurnId: 'client-turn-1',
					streamRunId: 'stream-run-1',
					sessionId: SESSION_ID,
					context: { type: 'global', entityId: null, projectId: null }
				}),
				lease: {
					decisionId: preparedDecisionId(),
					mode: 'worker_realtime',
					contractVersion: 'agentic_chat_worker_v1'
				}
			})
		);
		// One service client serves both the decision and the admission.
		expect(mocks.createAdminSupabaseClient).toHaveBeenCalledTimes(1);
		expect(mocks.admitAgenticChatWorkerTurn).toHaveBeenCalledTimes(1);
	});

	it('reuses the persisted decision when the same owned turn is retried', async () => {
		const admin = fakeAdminClient({ turnRows: [ownedTurnRow()] });
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(
			admitted({
				outcome: 'matching_duplicate',
				status: 'running',
				sessionCreated: undefined
			})
		);

		const response = await POST(postEvent({ body: admissionBody() }) as never);

		expect(response.status).toBe(200);
		expect((await response.json()).data.outcome).toBe('matching_duplicate');
		expect(preparedDecisionId()).toBe(DECISION_ID);
	});

	it('ignores a null retired lease field but rejects any lease token', async () => {
		const admin = fakeAdminClient();
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		const accepted = await POST(
			postEvent({ body: admissionBody({ leaseToken: null }) }) as never
		);
		expect(accepted.status).toBe(202);
		expect(admin.turnLookups).toHaveLength(1);

		for (const leaseToken of ['', 'actl1.retired-transport-lease']) {
			vi.clearAllMocks();
			const rejected = await POST(
				postEvent({ body: admissionBody({ leaseToken }) }) as never
			);
			expect(rejected.status).toBe(422);
			expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		}
	});

	it('refuses a binding that conflicts with an existing owned turn before preparation', async () => {
		for (const turnRows of [
			[ownedTurnRow({ stream_run_id: 'other-stream' })],
			[ownedTurnRow({ context_type: 'calendar' })],
			[ownedTurnRow({ session_id: 'd2000000-0000-4000-8000-0000000000ff' })],
			[ownedTurnRow(), ownedTurnRow({ id: 'd3000000-0000-4000-8000-0000000000ff' })],
			[ownedTurnRow({ execution_mode: 'legacy_sse' })]
		]) {
			resetAgenticChatTurnRateLimitForTests();
			mocks.createAdminSupabaseClient.mockReturnValue(fakeAdminClient({ turnRows }).client);
			const response = await POST(postEvent({ body: admissionBody() }) as never);
			const payload = await response.json();
			expect(response.status).toBe(409);
			expect(payload.code).toBe('TRANSPORT_CONFLICT');
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.admitAgenticChatWorkerTurn).not.toHaveBeenCalled();
	});

	it('maps a decision lookup outage to a retryable worker outage', async () => {
		mocks.createAdminSupabaseClient.mockReturnValue(
			fakeAdminClient({ turnError: { message: 'private database detail' } }).client
		);
		const response = await POST(postEvent({ body: admissionBody() }) as never);
		const payload = await response.json();
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('2');
		expect(payload.code).toBe('WORKER_UNAVAILABLE');
		expect(JSON.stringify(payload)).not.toContain('private database detail');
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	it('returns the admitted session row only when the send had no session', async () => {
		const session = sessionRow();
		let admin = fakeAdminClient({ session });
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		const created = await POST(
			postEvent({ body: admissionBody({ sessionId: null }) }) as never
		);
		const createdPayload = await created.json();
		expect(created.status).toBe(202);
		expect(createdPayload.data.session).toEqual(session);
		expect(createdPayload.data.handle.sessionId).toBe(SESSION_ID);
		expect(admin.from).toHaveBeenCalledWith('chat_sessions');
		expect(admin.sessionLookups).toEqual([
			[
				['id', SESSION_ID],
				['user_id', USER_ID]
			]
		]);
		expect(mocks.prepareAgenticChatWorkerAdmission).toHaveBeenCalledWith(
			expect.objectContaining({ command: expect.objectContaining({ sessionId: null }) })
		);
		// The row is read after durable admission, never before it.
		const sessionQuery = admin.from.mock.results.at(-1)?.value;
		expect(sessionQuery.maybeSingle.mock.invocationCallOrder[0]).toBeGreaterThan(
			mocks.admitAgenticChatWorkerTurn.mock.invocationCallOrder[0]!
		);

		// A lost-response retry of the same session-less send also gets the row.
		resetAgenticChatTurnRateLimitForTests();
		admin = fakeAdminClient({ session });
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		mocks.admitAgenticChatWorkerTurn.mockResolvedValueOnce(
			admitted({
				outcome: 'matching_duplicate',
				status: 'running',
				sessionCreated: undefined
			})
		);
		const duplicate = await POST(
			postEvent({ body: admissionBody({ sessionId: null }) }) as never
		);
		expect(duplicate.status).toBe(200);
		expect((await duplicate.json()).data.session).toEqual(session);

		// A send that already named its session gets the unchanged payload.
		resetAgenticChatTurnRateLimitForTests();
		admin = fakeAdminClient({ session });
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		const existing = await POST(postEvent({ body: admissionBody() }) as never);
		const existingPayload = await existing.json();
		expect(existing.status).toBe(202);
		expect(existingPayload.data).not.toHaveProperty('session');
		expect(Object.keys(existingPayload.data).sort()).toEqual(['handle', 'outcome', 'status']);
		expect(admin.from).not.toHaveBeenCalledWith('chat_sessions');
	});

	it('never fails a durable admission because the session read failed', async () => {
		for (const options of [
			{ sessionThrows: true },
			{ sessionError: { message: 'private session read detail' } },
			{ session: null }
		]) {
			resetAgenticChatTurnRateLimitForTests();
			mocks.loggerWarn.mockClear();
			mocks.createAdminSupabaseClient.mockReturnValue(fakeAdminClient(options).client);
			const response = await POST(
				postEvent({ body: admissionBody({ sessionId: null }) }) as never
			);
			const payload = await response.json();
			expect(response.status).toBe(202);
			expect(payload.data.outcome).toBe('newly_admitted');
			expect(payload.data.handle.sessionId).toBe(SESSION_ID);
			expect(payload.data).not.toHaveProperty('session');
			expect(JSON.stringify(payload)).not.toContain('private session read detail');
			expect(mocks.loggerWarn).toHaveBeenCalledWith(
				expect.stringMatching(/^Admitted worker session read/),
				expect.objectContaining({ userId: USER_ID, sessionId: SESSION_ID })
			);
		}
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
	let admin: ReturnType<typeof fakeAdminClient>;

	function reviewBody(overrides: Record<string, unknown> = {}) {
		return admissionBody({
			context: projectContext,
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
		mocks.env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'true';
		mocks.env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED = undefined;
		mocks.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = USER_ID;
		admin = fakeAdminClient({ rpc });
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
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

	it('keeps document selection fail-closed, then admits the enabled profile through its atomic RPC', async () => {
		const request = () =>
			postEvent({ body: reviewBody({ reviewIntent: 'document_organization' }) });
		const disabled = await POST(request() as never);
		expect(disabled.status).toBe(409);
		expect((await disabled.json()).code).toBe('WORKFLOW_REVIEW_UNAVAILABLE');
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
		mocks.env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED = 'true';
		const enabled = await POST(request() as never);
		expect(enabled.status).toBe(202);
		expect((await enabled.json()).data.reviewMode).toBe('project_review');
		expect(rpc).toHaveBeenCalledWith(
			'create_agentic_chat_document_review_turn_v2',
			expect.objectContaining({
				p_policy_ref: 'internal-document-organization:v2',
				p_specialist_snapshot: expect.objectContaining({
					profileId: 'document_organization'
				})
			})
		);
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	it('saves an eligible review raw in one RPC with no context or prompt work first', async () => {
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
				p_transport_decision_id: expect.stringMatching(CANONICAL_UUID),
				p_message: 'Review this project: what should we prioritize next?',
				p_cache_ref: null
			})
		);
		// The heavy ordinary path never ran: no prepared lease inspection, access
		// check, history, context load, prompt build, or ordinary admission.
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.admitAgenticChatWorkerTurn).not.toHaveBeenCalled();
		// Besides the owned-turn transport-decision lookup, one database round
		// trip before the queue: no other service-client table reads and nothing
		// on the user-scoped client.
		expect(admin.from.mock.calls).toEqual([['chat_turn_runs']]);
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

	it('returns the created session for a session-less review, read after its one RPC', async () => {
		const session = sessionRow({
			context_type: 'project',
			entity_id: PROJECT_ID
		});
		const withSession = fakeAdminClient({ session, rpc });
		mocks.createAdminSupabaseClient.mockReturnValue(withSession.client);
		respondWith(() => workflowReceipt({ session_created: true }));

		const response = await POST(postEvent({ body: reviewBody({ sessionId: null }) }) as never);
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body.data).toMatchObject({ reviewMode: 'project_review', session });
		expect(rpc).toHaveBeenCalledWith(
			'create_agentic_chat_workflow_turn_with_job_v1',
			expect.objectContaining({
				p_session_id: null,
				p_transport_decision_id: expect.stringMatching(CANONICAL_UUID)
			})
		);
		expect(withSession.from.mock.calls).toEqual([['chat_turn_runs'], ['chat_sessions']]);
		expect(withSession.sessionLookups).toEqual([
			[
				['id', SESSION_ID],
				['user_id', USER_ID]
			]
		]);
		const sessionQuery = withSession.from.mock.results.at(-1)?.value;
		expect(sessionQuery.maybeSingle.mock.invocationCallOrder[0]).toBeGreaterThan(
			rpc.mock.invocationCallOrder[0]!
		);
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
	});

	it('admits a review under a fresh inline decision bound to the authenticated owner', async () => {
		const response = await POST(postEvent({ body: reviewBody() }) as never);

		expect(response.status).toBe(202);
		expect(admin.turnLookups).toEqual([
			[
				['user_id', USER_ID],
				['client_turn_id', 'client-turn-1']
			]
		]);
		const decisionId = rpc.mock.calls[0]?.[1]?.p_transport_decision_id;
		expect(decisionId).toMatch(CANONICAL_UUID);
		expect(decisionId).not.toBe(DECISION_ID);
		expect((await response.json()).data).not.toHaveProperty('session');
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
				'WORKER_IDEMPOTENCY_CONFLICT'
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
				// A raised RPC rolled back: provably not admitted.
				() =>
					rpc.mockImplementation(async () => ({
						data: null,
						error: { code: 'P0001', message: 'private connection detail' }
					})),
				503,
				'WORKER_ADMISSION_NOT_ADMITTED'
			],
			[
				// No SQLSTATE (network/gateway): commit unknown.
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
		expect(mocks.startAgenticChatWorkerQueueWake).not.toHaveBeenCalled();
	});

	it('wakes the worker for a newly admitted review, never for a duplicate (B6)', async () => {
		const response = await POST(postEvent({ body: reviewBody() }) as never);
		expect(response.status).toBe(202);
		expect(mocks.startAgenticChatWorkerQueueWake).toHaveBeenCalledOnce();
		expect(mocks.startAgenticChatWorkerQueueWake.mock.invocationCallOrder[0]).toBeGreaterThan(
			rpc.mock.invocationCallOrder[0]!
		);

		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		respondWith(() => ({
			outcome: 'matching_duplicate',
			conflict_reason: null,
			execution_may_start: false,
			turn_run_id: 'd3000000-0000-4000-8000-0000000000aa',
			session_id: SESSION_ID,
			stream_run_id: 'stream-run-1',
			client_turn_id: 'client-turn-1',
			execution_mode: 'worker_realtime',
			status: 'queued'
		}));
		const duplicate = await POST(postEvent({ body: reviewBody() }) as never);
		expect(duplicate.status).toBe(200);
		expect(mocks.startAgenticChatWorkerQueueWake).not.toHaveBeenCalled();
	});

	it('rejects an explicit review when disabled without starting ordinary chat', async () => {
		mocks.env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = undefined;
		const response = await POST(postEvent({ body: reviewBody() }) as never);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.code).toBe('WORKFLOW_REVIEW_UNAVAILABLE');
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
		expect(mocks.admitAgenticChatWorkerTurn).not.toHaveBeenCalled();
	});

	it('keeps ordinary chat unchanged and rejects unsupported explicit reviews', async () => {
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
			const ordinaryTurn = label === 'no review requested' || label === 'field omitted';
			expect(response.status, label).toBe(ordinaryTurn ? 202 : 422);
			expect(rpc, label).not.toHaveBeenCalled();
			expect(mocks.prepareAgenticChatWorkerAdmission, label).toHaveBeenCalledTimes(
				ordinaryTurn ? 1 : 0
			);
		}

		// A user outside the internal cohort cannot silently start an ordinary turn.
		mocks.env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS = 'd1000000-0000-4000-8000-0000000000ff';
		resetAgenticChatTurnRateLimitForTests();
		vi.clearAllMocks();
		const denied = await POST(postEvent({ body: reviewBody() }) as never);
		expect(denied.status).toBe(409);
		expect(rpc).not.toHaveBeenCalled();
		expect(mocks.prepareAgenticChatWorkerAdmission).not.toHaveBeenCalled();
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
