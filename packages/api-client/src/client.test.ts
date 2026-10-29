// packages/api-client/src/client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { API_CLIENT_CONTRACT_VERSION, BuildOsApiError, createBuildOsClient } from './index';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

function envelope<T>(data: T, extra: Record<string, unknown> = {}) {
	return { success: true, data, timestamp: '2026-10-28T12:00:00.000Z', ...extra };
}

function errorEnvelope(
	status: number,
	error: string,
	code?: string,
	extra: Record<string, unknown> = {}
) {
	return jsonResponse(
		{
			success: false,
			error,
			message: error,
			code,
			timestamp: '2026-10-28T12:00:00.000Z',
			...extra
		},
		status
	);
}

function makeClient(
	fetchMock: FetchMock,
	overrides: Partial<Parameters<typeof createBuildOsClient>[0]> = {}
) {
	return createBuildOsClient({
		baseUrl: 'https://build-os.com',
		getAccessToken: async () => 'aaa.bbb.ccc',
		fetch: fetchMock,
		...overrides
	});
}

function lastCall(fetchMock: FetchMock): { url: string; init: RequestInit } {
	const call = fetchMock.mock.calls.at(-1);
	if (!call) throw new Error('fetch was not called');
	return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

function headersOf(init: RequestInit): Record<string, string> {
	return (init.headers ?? {}) as Record<string, string>;
}

describe('transport', () => {
	it('sends the bearer token, the contract header and no cookies', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ ok: 1 })));
		const api = makeClient(fetchMock, { defaultHeaders: { 'X-BuildOS-Client': 'ios/1.0.0' } });

		await api.request('/api/ping');

		const { url, init } = lastCall(fetchMock);
		const headers = headersOf(init);
		expect(url).toBe('https://build-os.com/api/ping');
		expect(init.method).toBe('GET');
		expect(init.credentials).toBe('omit');
		expect(headers.authorization).toBe('Bearer aaa.bbb.ccc');
		expect(headers['x-buildos-api-contract']).toBe(String(API_CLIENT_CONTRACT_VERSION));
		expect(headers['x-buildos-client']).toBe('ios/1.0.0');
		expect(headers.accept).toBe('application/json');
	});

	it('omits the Authorization header when there is no token (sync getter)', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(null)));
		const api = makeClient(fetchMock, { getAccessToken: () => null });

		await api.request('/api/ping');

		expect(headersOf(lastCall(fetchMock).init).authorization).toBeUndefined();
	});

	it('normalizes a trailing-slash baseUrl and a path without a leading slash', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(null)));
		const api = makeClient(fetchMock, { baseUrl: 'https://build-os.com//' });

		await api.request('api/today');

		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/today');
	});

	it('builds query strings: drops undefined/null, repeats arrays, encodes values', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(null)));
		const api = makeClient(fetchMock);

		await api.request('/api/search', {
			query: {
				q: 'a b&c',
				limit: 10,
				skip: undefined,
				nope: null,
				tag: ['x', 'y'],
				flag: true
			}
		});

		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/search?q=a%20b%26c&limit=10&tag=x&tag=y&flag=true'
		);
	});

	it('appends to a path that already carries a query string', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(null)));
		const api = makeClient(fetchMock);

		await api.request('/api/x?a=1', { query: { b: 2 } });

		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/x?a=1&b=2');
	});

	it('unwraps the envelope and exposes warnings through requestWithMeta', async () => {
		const warnings = [{ type: 'partial', message: 'calendar unavailable' }];
		// A fresh Response per call: a body can only be read once.
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async () =>
				jsonResponse(envelope({ feed: { date: '2026-10-28' } }, { warnings }))
			);
		const api = makeClient(fetchMock);

		const data = await api.request<{ feed: { date: string } }>('/api/today');
		const meta = await api.requestWithMeta<{ feed: { date: string } }>('/api/today');

		expect(data.feed.date).toBe('2026-10-28');
		expect(meta.data.feed.date).toBe('2026-10-28');
		expect(meta.warnings).toEqual(warnings);
		expect(meta.timestamp).toBe('2026-10-28T12:00:00.000Z');
		expect(meta.status).toBe(200);
	});

	it('JSON-encodes object bodies, sets content-type and defaults to POST', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ id: 't1' }), 201));
		const api = makeClient(fetchMock);

		await api.request('/api/onto/tasks/create', { body: { title: 'Call Sam', priority: 2 } });

		const { init } = lastCall(fetchMock);
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ title: 'Call Sam', priority: 2 }));
		expect(headersOf(init)['content-type']).toBe('application/json');
	});

	it('passes FormData through untouched without forcing a content-type', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ id: 'vn1' }), 201));
		const api = makeClient(fetchMock);
		const form = new FormData();
		form.append(
			'audio',
			new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/m4a' }),
			'note.m4a'
		);
		form.append('transcribe', 'true');

		await api.voiceNotes.create(form);

		const { init } = lastCall(fetchMock);
		expect(init.method).toBe('POST');
		expect(init.body).toBe(form);
		expect(headersOf(init)['content-type']).toBeUndefined();
	});

	it('per-request headers override default headers regardless of casing', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(null)));
		const api = makeClient(fetchMock, { defaultHeaders: { 'X-Trace': 'default' } });

		await api.request('/api/ping', { headers: { 'x-trace': 'override' } });

		expect(headersOf(lastCall(fetchMock).init)['x-trace']).toBe('override');
	});
});

describe('errors', () => {
	it('throws BuildOsApiError with the envelope code on success:false even with a 2xx status', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				jsonResponse(
					{ success: false, error: 'Nope', code: 'OPERATION_FAILED', timestamp: 'x' },
					200
				)
			);
		const api = makeClient(fetchMock);

		const error = await api.request('/api/thing').catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BuildOsApiError);
		expect((error as BuildOsApiError).code).toBe('OPERATION_FAILED');
		expect((error as BuildOsApiError).message).toBe('Nope');
		expect((error as BuildOsApiError).isNetworkError).toBe(false);
	});

	it('maps a 400 envelope to status, code, details and message', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			errorEnvelope(400, 'Title is required', 'INVALID_REQUEST', {
				details: { field: 'title' }
			})
		);
		const api = makeClient(fetchMock);

		const error = (await api.tasks
			.create({ project_id: 'p1', title: '' })
			.catch((e: unknown) => e)) as BuildOsApiError;

		expect(error.status).toBe(400);
		expect(error.code).toBe('INVALID_REQUEST');
		expect(error.details).toEqual({ field: 'title' });
		expect(error.message).toBe('Title is required');
		expect(error.body).toMatchObject({ success: false });
	});

	it('calls onUnauthorized once per 401 and still throws', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(errorEnvelope(401, 'Not authenticated', 'UNAUTHORIZED'));
		const onUnauthorized = vi.fn();
		const api = makeClient(fetchMock, { onUnauthorized });

		const error = (await api.me().catch((e: unknown) => e)) as BuildOsApiError;

		expect(error.isUnauthorized()).toBe(true);
		expect(error.code).toBe('UNAUTHORIZED');
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(onUnauthorized).toHaveBeenCalledWith(error);
	});

	it('does not call onUnauthorized for other statuses', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(errorEnvelope(403, 'Forbidden', 'FORBIDDEN'));
		const onUnauthorized = vi.fn();
		const api = makeClient(fetchMock, { onUnauthorized });

		await expect(api.me()).rejects.toBeInstanceOf(BuildOsApiError);
		expect(onUnauthorized).not.toHaveBeenCalled();
	});

	it('recognises the 402 billing gate and parses its fields', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse(
				{
					success: false,
					error: 'Editing is paused until billing is activated. Your workspace remains readable.',
					code: 'UPGRADE_REQUIRED',
					read_only: true,
					blocked_capability: 'workspace_write',
					activation_path: '/billing/activate',
					billing_state: 'upgrade_required_frozen',
					billing_tier: 'explorer',
					timestamp: 'x'
				},
				402
			)
		);
		const api = makeClient(fetchMock);

		const error = (await api.tasks
			.update('t1', { title: 'x' })
			.catch((e: unknown) => e)) as BuildOsApiError;

		expect(error.isUpgradeRequired()).toBe(true);
		expect(error.isUnauthorized()).toBe(false);
		expect(error.upgrade).toEqual({
			read_only: true,
			blocked_capability: 'workspace_write',
			activation_path: '/billing/activate',
			billing_state: 'upgrade_required_frozen',
			billing_tier: 'explorer'
		});
	});

	it('turns a thrown fetch into a status-0 network error', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new TypeError('Network request failed'));
		const api = makeClient(fetchMock);

		const error = (await api.today.get().catch((e: unknown) => e)) as BuildOsApiError;

		expect(error).toBeInstanceOf(BuildOsApiError);
		expect(error.status).toBe(0);
		expect(error.isNetworkError).toBe(true);
		expect(error.message).toBe('Network request failed');
		expect(error.cause).toBeInstanceOf(TypeError);
	});

	it('lets a caller abort surface as the original AbortError', async () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');
		const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abort);
		const api = makeClient(fetchMock);

		await expect(api.request('/api/slow')).rejects.toBe(abort);
	});

	it('falls back to a status message when the error body is not JSON', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
		const api = makeClient(fetchMock);

		const error = (await api.request('/api/x').catch((e: unknown) => e)) as BuildOsApiError;

		expect(error.status).toBe(502);
		expect(error.message).toBe('Request failed with status 502');
		expect(error.body).toBe('<html>Bad gateway</html>');
	});
});

describe('raw()', () => {
	it('returns the Response untouched on 200 with auth headers set', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response('event: hello\n\n', {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			})
		);
		const api = makeClient(fetchMock);

		const response = await api.raw('/api/stream');

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('event: hello\n\n');
		const headers = headersOf(lastCall(fetchMock).init);
		expect(headers.authorization).toBe('Bearer aaa.bbb.ccc');
		expect(headers.accept).toBeUndefined();
	});

	it('throws on 401 and notifies onUnauthorized', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(errorEnvelope(401, 'Unauthorized', 'UNAUTHORIZED'));
		const onUnauthorized = vi.fn();
		const api = makeClient(fetchMock, { onUnauthorized });

		const error = (await api.raw('/api/stream').catch((e: unknown) => e)) as BuildOsApiError;

		expect(error.isUnauthorized()).toBe(true);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it('throws on every non-2xx status with the envelope code', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(errorEnvelope(500, 'Boom', 'INTERNAL_ERROR'))
			.mockResolvedValueOnce(errorEnvelope(404, 'Not found', 'NOT_FOUND'));
		const api = makeClient(fetchMock);

		await expect(api.raw('/api/stream')).rejects.toMatchObject({
			status: 500,
			code: 'INTERNAL_ERROR'
		});
		await expect(api.raw('/api/stream')).rejects.toMatchObject({
			status: 404,
			code: 'NOT_FOUND'
		});
	});
});

describe('endpoint wrappers', () => {
	it('today.get and briefs.forDate pass their query parameters', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => jsonResponse(envelope({ feed: {}, brief: null })));
		const api = makeClient(fetchMock);

		await api.today.get({ timezone: 'America/New_York' });
		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/today?timezone=America%2FNew_York'
		);

		await api.briefs.forDate({ date: '2026-10-28' });
		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/daily-briefs?date=2026-10-28'
		);

		await api.briefs.forDate();
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/daily-briefs');
	});

	it('projects.tasks requires a bucket and encodes the project id', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ tasks: [] })));
		const api = makeClient(fetchMock);

		await api.projects.tasks('p/1', { bucket: 'overdue', limit: 20 });

		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/onto/projects/p%2F1/tasks?bucket=overdue&limit=20'
		);
	});

	it('projects.desktop GETs the desktop route and unwraps tiles and loose items', async () => {
		const desktop = {
			projects: [
				{
					id: 'p1',
					name: 'Novel',
					kind: 'project',
					state_key: 'active',
					updated_at: '2026-10-28T12:00:00.000Z',
					last_touch_at: '2026-10-28T11:00:00.000Z',
					next_step_short: 'Outline act two',
					emoji: ['📚'],
					parent_project_id: null,
					pulse: 'moving',
					pulse_reason: 'Finished 1 task in the last 14 days',
					bars: { docs: 1, tasks: 0.59 },
					mix: { overdue: 1, in_progress: 0, scheduled: 2, backlog: 3 },
					open_tasks: 6,
					document_count: 4,
					task_count: 9
				}
			],
			workspace: {
				id: 'w1',
				items: [
					{
						id: 'n1',
						kind: 'note',
						title: 'Call the printer',
						excerpt: null,
						updated_at: '2026-10-28T10:00:00.000Z'
					}
				],
				totals: { notes: 1, docs: 0, tasks: 0 }
			}
		};
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(envelope(desktop)));
		const api = makeClient(fetchMock);

		const result = await api.projects.desktop();

		expect(result).toEqual(desktop);
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/projects/desktop');
		expect(lastCall(fetchMock).init.method).toBe('GET');
	});

	it('tasks.remove and push.unregisterDevice send DELETE with a JSON body', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ removed: true })));
		const api = makeClient(fetchMock);

		await api.tasks.remove('t1', { archive: true });
		expect(lastCall(fetchMock).init.method).toBe('DELETE');
		expect(lastCall(fetchMock).init.body).toBe(JSON.stringify({ archive: true }));

		await api.push.unregisterDevice({ token: 'ExponentPushToken[abc]' });
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/push/devices');
		expect(lastCall(fetchMock).init.method).toBe('DELETE');
		expect(lastCall(fetchMock).init.body).toBe(
			JSON.stringify({ token: 'ExponentPushToken[abc]' })
		);
	});

	it('activity.list joins lanes with commas and omits them when empty', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(envelope({ entries: [] })));
		const api = makeClient(fetchMock);

		await api.activity.list({ lanes: ['ping', 'agent'], limit: 10 });
		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/activity?limit=10&lanes=ping%2Cagent'
		);

		await api.activity.list({ lanes: [] });
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/activity');
	});

	it('agent.sendTurnRaw posts through raw() and agent.sendTurn unwraps the admission', async () => {
		const admission = envelope({
			outcome: 'newly_admitted',
			handle: {
				contractVersion: 'agentic_chat_worker_v1',
				executionMode: 'worker_realtime',
				turnRunId: 'run1',
				sessionId: 's1',
				streamRunId: 'sr1',
				clientTurnId: 'ct1'
			},
			status: 'queued'
		});
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse(admission, 202))
			.mockResolvedValueOnce(jsonResponse(admission, 202));
		const api = makeClient(fetchMock);
		const body = {
			clientTurnId: 'ct1',
			streamRunId: 'sr1',
			context: { type: 'global' as const, entityId: null, projectId: null },
			message: 'What is due today?'
		};
		const controller = new AbortController();

		const response = await api.agent.sendTurnRaw(body, { signal: controller.signal });
		expect(response.status).toBe(202);
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/agent/v2/turns');
		expect(lastCall(fetchMock).init.method).toBe('POST');
		expect(lastCall(fetchMock).init.signal).toBe(controller.signal);

		const admitted = await api.agent.sendTurn(body);
		expect(admitted.outcome).toBe('newly_admitted');
		expect(admitted.handle.sessionId).toBe('s1');
	});

	it('workspace.capture posts the capture with its idempotency key', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse(
				envelope({
					workspaceId: 'w1',
					item: { id: 'd1', entity: 'document', kind: 'note' }
				}),
				201
			)
		);
		const api = makeClient(fetchMock);

		const result = await api.workspace.capture({
			kind: 'note',
			text: 'Call the printer about the banner',
			source: 'ios',
			idempotency_key: 'capture-0001-abcd'
		});

		expect(result.item.kind).toBe('note');
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/workspace/capture');
		expect(lastCall(fetchMock).init.method).toBe('POST');
		expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({
			kind: 'note',
			text: 'Call the printer about the banner',
			source: 'ios',
			idempotency_key: 'capture-0001-abcd'
		});
	});

	it('workspace.sortCapture and undoSort post to the sort routes', async () => {
		const receipt = { document_id: 'd1', move_batch: null, created: [], updates: [] };
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse(
					envelope({
						outcome: 'sorted',
						lines: ['2 tasks → Fading Crown'],
						added: [],
						removed_ids: ['d1'],
						receipt
					})
				)
			)
			.mockResolvedValueOnce(
				jsonResponse(envelope({ restored: null, removed_ids: [], failed: 0 }))
			);
		const api = makeClient(fetchMock);

		const sorted = await api.workspace.sortCapture({ document_id: 'd1', source: 'ios' });
		expect(sorted.lines).toEqual(['2 tasks → Fading Crown']);
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/workspace/capture/sort');
		expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({
			document_id: 'd1',
			source: 'ios'
		});

		const undone = await api.workspace.undoSort(sorted.receipt!);
		expect(undone.failed).toBe(0);
		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/workspace/capture/sort/undo'
		);
		expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ receipt });
	});

	it('push.listDevices and agent.listActiveTurns issue GETs with the right query', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => jsonResponse(envelope({ devices: [], turns: [] })));
		const api = makeClient(fetchMock);

		await api.push.listDevices();
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/push/devices');
		expect(lastCall(fetchMock).init.method).toBe('GET');

		await api.agent.listActiveTurns('11111111-2222-4333-8444-555555555555');
		expect(lastCall(fetchMock).url).toBe(
			'https://build-os.com/api/agent/v2/turns?session_id=11111111-2222-4333-8444-555555555555'
		);
		expect(lastCall(fetchMock).init.method).toBe('GET');
	});

	it('me() and auth.createHandoff hit their routes', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse(
					envelope({
						id: 'u1',
						email: 'dj@example.com',
						is_admin: false,
						is_beta_user: true
					})
				)
			)
			.mockResolvedValueOnce(
				jsonResponse(
					envelope({
						url: 'https://build-os.com/auth/handoff?code=x',
						expires_at: '2026-10-28T12:01:00Z'
					})
				)
			);
		const api = makeClient(fetchMock);

		const user = await api.me();
		expect(user.id).toBe('u1');
		expect(lastCall(fetchMock).url).toBe('https://build-os.com/api/auth/user');

		const handoff = await api.auth.createHandoff({ next: '/profile' });
		expect(handoff.url).toContain('/auth/handoff');
		expect(lastCall(fetchMock).init.method).toBe('POST');
		expect(lastCall(fetchMock).init.body).toBe(JSON.stringify({ next: '/profile' }));
	});
});
