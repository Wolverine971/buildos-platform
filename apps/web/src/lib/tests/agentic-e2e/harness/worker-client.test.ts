// apps/web/src/lib/tests/agentic-e2e/harness/worker-client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticE2EWorkerClient,
	createAuthenticatedHarnessFetch,
	HARNESS_EXECUTION_MODE,
	requireAdvertisedMutationTools,
	waitForWorkerTerminalWithRecovery
} from './worker-client';
import { workerAdmissionRequestSchema } from '../../../../routes/api/agent/v2/turns/worker-admission-schema';

const PROJECT_ID = 'a1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'a2000000-0000-4000-8000-000000000001';

function harnessClient(fetchImpl: typeof fetch): AgenticE2EWorkerClient {
	return new AgenticE2EWorkerClient({
		fetchImpl,
		runtime: {},
		realtimeClient: {}
	} as never);
}

function healthResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('agentic E2E worker client boundaries', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		delete process.env.AGENTIC_E2E_EXECUTION_MODE;
	});

	it('retains intake headers and includes prewarm and admission in the original total clock', async () => {
		vi.stubEnv('AGENTIC_BATTERY', 'cedar-house');
		let clock = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => clock);
		const fetchImpl = vi.fn<typeof fetch>(async (url) => {
			if (url === '/api/agent/v2/prewarm') {
				clock += 70;
				return Response.json(
					{ data: { prepared_prompt: { key: 'prepared-key' } } },
					{
						headers: { 'server-timing': 'request;dur=65' }
					}
				);
			}
			clock += 110;
			return new Response('admission unavailable', {
				status: 503,
				headers: { 'server-timing': 'worker-preparation;dur=80, worker-admission;dur=20' }
			});
		});
		const result = await harnessClient(fetchImpl).runTurn({
			message: 'Read the saved task',
			contextType: 'project',
			entityId: PROJECT_ID,
			sessionId: SESSION_ID
		});
		expect(result.timing.intakeRequests).toEqual([
			{
				phase: 'prewarm',
				startedMs: 0,
				responseHeadersMs: 70,
				status: 200,
				serverTiming: 'request;dur=65'
			},
			{
				phase: 'admission',
				startedMs: 70,
				responseHeadersMs: 180,
				status: 503,
				serverTiming: 'worker-preparation;dur=80, worker-admission;dur=20'
			}
		]);
		expect(result.timing.responseHeadersMs).toBe(180);
		expect(result.timing.totalDurationMs).toBe(180);
		expect(result.errors).toHaveLength(1);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/agent/v2/turns');
		const admissionBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
		expect(admissionBody).not.toHaveProperty('leaseToken');
		expect(admissionBody).toMatchObject({
			sessionId: SESSION_ID,
			preparedPromptKey: 'prepared-key'
		});
	});

	it('admits a first turn exactly like the product client: one lease-less request, no pre-created session', async () => {
		vi.stubEnv('AGENTIC_BATTERY', 'cedar-house');
		const fetchImpl = vi.fn<typeof fetch>(
			async () => new Response('admission unavailable', { status: 503 })
		);
		const result = await harnessClient(fetchImpl).runTurn({
			message: 'Start a plan for the kitchen remodel',
			contextType: 'project',
			entityId: PROJECT_ID
		});

		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0]!;
		expect(url).toBe('/api/agent/v2/turns');
		expect(init?.method).toBe('POST');
		const body = JSON.parse(String(init?.body));
		// The same body `requestAgenticChatWorkerAdmission` builds for the chat
		// controller: no leaseToken, a null session the server creates inline.
		expect(body).toEqual({
			clientTurnId: result.clientTurnId,
			streamRunId: result.streamRunId,
			sessionId: null,
			context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
			message: 'Start a plan for the kitchen remodel',
			attachments: [],
			projectFocus: null,
			lastTurnContext: null,
			voiceNoteGroupId: null,
			preparedPromptKey: null
		});
		const parsed = workerAdmissionRequestSchema.safeParse(body);
		expect(parsed.success).toBe(true);
		expect(parsed.data?.leaseToken).toBeNull();
		expect(result.sessionId).toBeNull();
		expect(result.errors).toEqual([
			{ error: 'worker admission failed (503): admission unavailable' }
		]);
	});

	it('skips the prepared prompt for an explicit review follow-up, as the product client does', async () => {
		vi.stubEnv('AGENTIC_BATTERY', 'cedar-house');
		const fetchImpl = vi.fn<typeof fetch>(
			async () => new Response('admission unavailable', { status: 503 })
		);
		await harnessClient(fetchImpl).runTurn({
			message: 'Review the project',
			contextType: 'project',
			entityId: PROJECT_ID,
			sessionId: SESSION_ID,
			reviewIntent: 'project_review'
		});

		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/agent/v2/turns');
		expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
			sessionId: SESSION_ID,
			preparedPromptKey: null,
			reviewIntent: 'project_review'
		});
	});

	it('preflights the admission route with a free owned-turn lookup', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ success: true, data: { turns: [] } })
		);
		await expect(
			harnessClient(fetchImpl).requireWorkerAdmissionReachable()
		).resolves.toBeUndefined();
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0]!;
		expect(String(url)).toMatch(/^\/api\/agent\/v2\/turns\?session_id=[0-9a-f-]{36}$/);
		expect(init?.method).toBe('GET');
	});

	it('fails the preflight loudly when the admission route rejects the harness user', async () => {
		for (const response of [
			Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
			Response.json({ success: true, data: {} })
		]) {
			const fetchImpl = vi.fn<typeof fetch>(async () => response);
			await expect(
				harnessClient(fetchImpl).requireWorkerAdmissionReachable()
			).rejects.toThrow(
				'[agentic-e2e] worker admission route is not reachable for the harness user'
			);
		}
	});

	it('requires a prepared key before a battery follow-up can be admitted', async () => {
		vi.stubEnv('AGENTIC_BATTERY', 'cedar-house');
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({ data: { prepared_prompt: null } })
		);
		await expect(
			harnessClient(fetchImpl).runTurn({
				message: 'Read the saved task',
				contextType: 'project',
				entityId: PROJECT_ID,
				sessionId: SESSION_ID
			})
		).rejects.toThrow('refusing cold-path substitution');
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/agent/v2/prewarm');
		expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
			session_id: SESSION_ID,
			prepare_prompt: true
		});
	});

	it('pins the harness to the worker lane regardless of the retired env override', () => {
		process.env.AGENTIC_E2E_EXECUTION_MODE = 'legacy_sse';
		expect(HARNESS_EXECUTION_MODE).toBe('worker_realtime');
	});

	it('prefixes product-relative requests and carries the authenticated cookie', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const authenticatedFetch = createAuthenticatedHarnessFetch(
			'https://build-os.example/base',
			'sb-auth-token=secret-cookie'
		);

		await authenticatedFetch('/api/agent/v2/turns', {
			method: 'POST',
			headers: { Accept: 'application/json' }
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe('https://build-os.example/api/agent/v2/turns');
		const headers = new Headers(init?.headers);
		expect(headers.get('accept')).toBe('application/json');
		expect(headers.get('cookie')).toBe('sb-auth-token=secret-cookie');
	});

	it('recovers a missed terminal broadcast from durable truth after the deadline', async () => {
		vi.useFakeTimers();
		let resolveTerminal!: () => void;
		const terminal = new Promise<void>((resolve) => {
			resolveTerminal = resolve;
		});
		const requestReconciliation = vi.fn(() => {
			setTimeout(resolveTerminal, 10);
		});
		const waiting = waitForWorkerTerminalWithRecovery({
			terminal,
			turnRunId: 'd4000000-0000-4000-8000-000000000001',
			requestReconciliation,
			timeoutMs: 100,
			recoveryTimeoutMs: 50
		});

		await vi.advanceTimersByTimeAsync(100);
		expect(requestReconciliation).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(10);
		await expect(waiting).resolves.toBeUndefined();
	});

	it('reports a distinct failure when final durable reconciliation also misses', async () => {
		vi.useFakeTimers();
		const requestReconciliation = vi.fn();
		const waiting = waitForWorkerTerminalWithRecovery({
			terminal: new Promise<void>(() => undefined),
			turnRunId: 'd4000000-0000-4000-8000-000000000001',
			requestReconciliation,
			timeoutMs: 100,
			recoveryTimeoutMs: 50
		});
		const rejected = expect(waiting).rejects.toThrow(
			'did not terminate after final durable reconciliation'
		);

		await vi.advanceTimersByTimeAsync(150);
		await rejected;
		expect(requestReconciliation).toHaveBeenCalledOnce();
	});

	it('does not hide a non-timeout terminal observer failure behind reconciliation', async () => {
		const requestReconciliation = vi.fn();
		await expect(
			waitForWorkerTerminalWithRecovery({
				terminal: Promise.reject(new Error('terminal observer failed')),
				turnRunId: 'd4000000-0000-4000-8000-000000000001',
				requestReconciliation,
				timeoutMs: 100,
				recoveryTimeoutMs: 50
			})
		).rejects.toThrow('terminal observer failed');
		expect(requestReconciliation).not.toHaveBeenCalled();
	});
});

describe('requireAdvertisedMutationTools', () => {
	it('passes when the advertised tool set is a superset of what is required', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			healthResponse({
				agenticChat: {
					mutationCapabilities: {
						provider: { count: 2, names: ['create_onto_task', 'update_onto_task'] },
						adapter: { count: 2, names: ['create_onto_task', 'update_onto_task'] },
						advertisedMutationToolNames: [
							'create_onto_task',
							'update_onto_task',
							'create_onto_document'
						]
					}
				}
			})
		);

		const result = await requireAdvertisedMutationTools({
			healthUrl: 'https://worker.example',
			required: ['create_onto_task', 'update_onto_task'],
			fetchImpl
		});

		expect(result.advertised).toEqual([
			'create_onto_task',
			'update_onto_task',
			'create_onto_document'
		]);
		expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/health');
	});

	it('throws a distinct error when the worker predates capability readback', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({ ok: true }));

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task'],
				fetchImpl
			})
		).rejects.toThrow(
			'[agentic-e2e] worker /health has no agenticChat.mutationCapabilities field — deployed worker predates the capability readback; deploy before running mutation scenarios'
		);
	});

	it('throws listing the missing tools when the worker does not advertise them all', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			healthResponse({
				agenticChat: {
					mutationCapabilities: {
						provider: { count: 1, names: ['create_onto_task'] },
						adapter: { count: 1, names: ['create_onto_task'] },
						advertisedMutationToolNames: ['create_onto_task']
					}
				}
			})
		);

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task', 'update_onto_task'],
				fetchImpl
			})
		).rejects.toThrow(
			'[agentic-e2e] worker does not advertise required write tools: [update_onto_task]; advertised: [create_onto_task]; refusing to spend on a read-only worker'
		);
	});

	it('skips the fetch entirely when no tools are required', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({}));

		const result = await requireAdvertisedMutationTools({
			healthUrl: 'https://worker.example',
			required: [],
			fetchImpl
		});

		expect(result.advertised).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('throws on a non-2xx health response', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({}, 503));

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task'],
				fetchImpl
			})
		).rejects.toThrow('[agentic-e2e] worker health 503');
	});
});
