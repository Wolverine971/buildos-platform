// apps/web/src/lib/tests/agentic-e2e/browser/agent-chat-modal.spec.ts
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PROMPT = 'Reply with exactly "MODAL E2E OK" and do not use tools.';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`[agentic-modal-e2e] Missing ${name} in apps/web/.env`);
	return value;
}

async function authenticateHarnessUser(
	page: Page
): Promise<{ admin: SupabaseClient; userId: string; actorId: string }> {
	const email = required('AGENTIC_TEST_USER_EMAIL');
	const password = required('AGENTIC_TEST_USER_PASSWORD');
	const supabaseUrl = required('PUBLIC_SUPABASE_URL');
	const serviceKey = required('PRIVATE_SUPABASE_SERVICE_KEY');
	const admin = createClient(supabaseUrl, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});

	const { error: createError } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (createError && createError.status !== 422) {
		throw new Error(`Failed to provision modal E2E auth user: ${createError.message}`);
	}

	const login = await page.request.post('/api/auth/login', {
		data: { email, password }
	});
	const loginBody = await login.text();
	expect(login.ok(), `Modal E2E login failed at ${login.url()}: ${loginBody.slice(0, 500)}`).toBe(
		true
	);
	const payload = JSON.parse(loginBody) as { data?: { user?: { id?: string } } };
	const userId = payload.data?.user?.id;
	if (!userId) throw new Error('Modal E2E login response did not include a user id');

	const { error: userError } = await admin.from('users').upsert(
		{
			id: userId,
			email,
			onboarding_completed_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);
	if (userError) throw new Error(`Failed to provision modal E2E user row: ${userError.message}`);

	const { data: actorId, error: actorError } = await admin.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});
	if (actorError) throw new Error(`Failed to provision modal E2E actor: ${actorError.message}`);
	if (!actorId) throw new Error('Modal E2E actor provisioning did not return an actor id');

	return { admin, userId, actorId };
}

async function openPrewarmedModal(
	page: Page,
	prompt: string,
	options: { forceSessionBootstrap?: boolean } = {}
) {
	if (options.forceSessionBootstrap) {
		await page.route('**/api/agent/v2/prewarm', async (route) => {
			const body = route.request().postDataJSON() as { ensure_session?: boolean };
			if (body.ensure_session !== false) {
				await route.continue();
				return;
			}

			const response = await route.fetch();
			const payload = (await response.json()) as {
				data?: { prepared_prompt?: unknown };
			};
			if (payload.data) payload.data.prepared_prompt = null;
			await route.fulfill({ response, json: payload });
		});
	}

	await page.goto('/dashboard');
	await page
		.getByRole('button', { name: 'Use necessary only' })
		.click({ timeout: 3_000 })
		.catch(() => undefined);
	const prewarmRequestPromise = page.waitForRequest(
		(request) =>
			request.method() === 'POST' &&
			request.url().endsWith('/api/agent/v2/prewarm') &&
			(request.postDataJSON() as { ensure_session?: boolean }).ensure_session === false,
		{ timeout: 30_000 }
	);
	const prewarmResponsePromise = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/api/agent/v2/prewarm') &&
			(response.request().postDataJSON() as { ensure_session?: boolean }).ensure_session ===
				false,
		{ timeout: 30_000 }
	);
	const sessionBootstrapResponsePromise = options.forceSessionBootstrap
		? page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					response.url().endsWith('/api/agent/v2/prewarm') &&
					(response.request().postDataJSON() as { ensure_session?: boolean })
						.ensure_session === true,
				{ timeout: 30_000 }
			)
		: null;

	await page.getByRole('button', { name: 'Open BuildOS chat' }).click();
	const dialog = page.getByRole('dialog', { name: 'BuildOS chat assistant dialog' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /Open-ended chat/ }).click();
	const composer = dialog.locator('textarea').first();
	await expect(composer).toBeEnabled();
	await composer.fill(prompt);
	const [prewarmRequest, prewarmResponse] = await Promise.all([
		prewarmRequestPromise,
		prewarmResponsePromise
	]);
	return { dialog, prewarmRequest, prewarmResponse, sessionBootstrapResponsePromise };
}

async function openPrewarmedExistingSession(page: Page, sessionId: string, prompt: string) {
	const matchesSessionPrewarm = (request: import('@playwright/test').Request): boolean => {
		if (
			request.method() !== 'POST' ||
			new URL(request.url()).pathname !== '/api/agent/v2/prewarm'
		) {
			return false;
		}
		const body = request.postDataJSON() as {
			session_id?: string;
			ensure_session?: boolean;
		};
		return body.session_id === sessionId && body.ensure_session !== true;
	};
	const prewarmRequestPromise = page.waitForRequest(matchesSessionPrewarm, { timeout: 60_000 });
	const prewarmResponsePromise = page.waitForResponse(
		(response) => matchesSessionPrewarm(response.request()),
		{ timeout: 60_000 }
	);

	await page.goto(`/history?id=${encodeURIComponent(sessionId)}&itemType=chat_session`);
	await page
		.getByRole('button', { name: 'Use necessary only' })
		.click({ timeout: 3_000 })
		.catch(() => undefined);
	const dialog = page.getByRole('dialog', { name: 'BuildOS chat assistant dialog' });
	await expect(dialog).toBeVisible({ timeout: 60_000 });
	const composer = dialog.locator('textarea').first();
	await expect(composer).toBeEnabled();
	await composer.fill(prompt);
	const [prewarmRequest, prewarmResponse] = await Promise.all([
		prewarmRequestPromise,
		prewarmResponsePromise
	]);
	return { dialog, prewarmRequest, prewarmResponse };
}

async function readBootstrappedSessionId(
	responsePromise: Promise<import('@playwright/test').Response> | null
): Promise<string> {
	if (!responsePromise) throw new Error('Modal E2E session bootstrap observer was not installed');
	const response = await responsePromise;
	const payload = (await response.json()) as { data?: { session?: { id?: string } } };
	const sessionId = payload.data?.session?.id ?? null;
	expect(sessionId, 'Send-time prewarm did not return the modal chat session id').toBeTruthy();
	return sessionId!;
}

async function seedModalProject(
	admin: SupabaseClient,
	actorId: string,
	name = `AE2E · Modal wiring · ${randomUUID().slice(0, 8)}`
): Promise<string> {
	const { data, error } = await admin
		.from('onto_projects')
		.insert({
			created_by: actorId,
			name,
			description: 'Disposable project that unlocks the real modal context chooser.',
			state_key: 'active',
			type_key: 'project.business.product_launch'
		})
		.select('id')
		.single();
	if (error) throw new Error(`Failed to seed modal E2E project: ${error.message}`);
	return data.id;
}

async function seedModalSession(admin: SupabaseClient, userId: string): Promise<string> {
	const nowMs = Date.now();
	const now = new Date(nowMs).toISOString();
	const { data, error } = await admin
		.from('chat_sessions')
		.insert({
			user_id: userId,
			context_type: 'global',
			status: 'active',
			title: `AE2E · Prepared lease · ${randomUUID().slice(0, 8)}`,
			last_message_at: now,
			message_count: 3
		})
		.select('id')
		.single();
	if (error) throw new Error(`Failed to seed modal E2E session: ${error.message}`);
	const { error: messageError } = await admin.from('chat_messages').insert([
		{
			session_id: data.id,
			user_id: userId,
			role: 'user',
			content: 'Prior canary context.',
			created_at: new Date(nowMs - 2_000).toISOString(),
			metadata: { source: 'agentic_modal_e2e_fixture' }
		},
		{
			session_id: data.id,
			user_id: userId,
			role: 'assistant',
			content: 'Prior canary acknowledgement.',
			created_at: new Date(nowMs - 1_000).toISOString(),
			metadata: { source: 'agentic_modal_e2e_fixture' }
		},
		{
			session_id: data.id,
			user_id: userId,
			role: 'user',
			content: 'Ready for the prepared-lease canary.',
			created_at: now,
			metadata: { source: 'agentic_modal_e2e_fixture' }
		}
	]);
	if (messageError) {
		await admin.from('chat_sessions').delete().eq('id', data.id);
		throw new Error(`Failed to seed modal E2E history: ${messageError.message}`);
	}
	return data.id;
}

async function cleanupModalSession(
	admin: SupabaseClient,
	userId: string,
	sessionId: string | null,
	testFailed: boolean
): Promise<void> {
	if (!sessionId) return;
	const { data, error } = await admin
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', userId)
		.select('id')
		.maybeSingle();
	if (!error && data) return;
	const retainedWorkerEvidence =
		error?.message.includes('agentic_chat_') &&
		(error.message.includes('cannot_be_deleted') ||
			error.message.includes('retention_not_elapsed'));
	if (retainedWorkerEvidence) {
		const { error: archiveError } = await admin
			.from('chat_sessions')
			.update({ archived_at: new Date().toISOString() })
			.eq('id', sessionId)
			.eq('user_id', userId);
		if (!archiveError) return;
		if (!testFailed) {
			throw new Error(
				`Failed to archive retained modal E2E session: ${archiveError.message}`
			);
		}
		console.error(archiveError);
		return;
	}

	const cleanupError = new Error(
		error
			? `Failed to clean up modal E2E session: ${error.message}`
			: `Modal E2E session ${sessionId} was not deleted`
	);
	if (!testFailed) throw cleanupError;
	console.error(cleanupError);
}

async function findSessionIdForClientTurn(
	admin: SupabaseClient,
	userId: string,
	clientTurnId: string
): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const { data, error } = await admin
			.from('chat_turn_runs')
			.select('session_id')
			.eq('user_id', userId)
			.eq('client_turn_id', clientTurnId)
			.maybeSingle();
		if (error) throw new Error(`Failed to resolve modal E2E session: ${error.message}`);
		if (data?.session_id) return data.session_id;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Modal E2E turn ${clientTurnId} did not persist a session id`);
}

async function readPreparedAdmissionReceipt(
	admin: SupabaseClient,
	userId: string,
	clientTurnId: string
): Promise<{
	sessionId: string;
	preparedPromptId: string;
	inspectionMs: number;
}> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const { data, error } = await admin
			.from('chat_turn_runs')
			.select('session_id, prepared_prompt_id, prepared_prompt_hit, request_payload')
			.eq('user_id', userId)
			.eq('client_turn_id', clientTurnId)
			.maybeSingle();
		if (error) throw new Error(`Failed to read prepared-admission receipt: ${error.message}`);
		if (data) {
			const requestPayload = data.request_payload as Record<string, unknown>;
			const lease = requestPayload.preparedAdmissionLease as
				| Record<string, unknown>
				| undefined;
			expect(data.prepared_prompt_hit).toBe(true);
			expect(data.prepared_prompt_id).toMatch(/^[0-9a-f-]{36}$/i);
			expect(lease).toMatchObject({ requested: true, hit: true, missReason: null });
			expect(lease?.inspectionMs).toEqual(expect.any(Number));
			return {
				sessionId: data.session_id,
				preparedPromptId: data.prepared_prompt_id!,
				inspectionMs: lease!.inspectionMs as number
			};
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Modal E2E turn ${clientTurnId} did not persist an admission receipt`);
}

async function cleanupModalProject(
	admin: SupabaseClient,
	actorId: string,
	projectId: string | null,
	testFailed: boolean
): Promise<void> {
	if (!projectId) return;
	const { data, error } = await admin
		.from('onto_projects')
		.delete()
		.eq('id', projectId)
		.eq('created_by', actorId)
		.select('id')
		.maybeSingle();
	if (!error && data) return;

	const cleanupError = new Error(
		error
			? `Failed to clean up modal E2E project: ${error.message}`
			: `Modal E2E project ${projectId} was not deleted`
	);
	if (!testFailed) throw cleanupError;
	console.error(cleanupError);
}

async function cleanupModalFixtures(params: {
	admin: SupabaseClient;
	userId: string;
	actorId: string;
	sessionId: string | null;
	projectId: string | null;
	testFailed: boolean;
}): Promise<void> {
	let cleanupError: unknown;
	try {
		await cleanupModalSession(params.admin, params.userId, params.sessionId, params.testFailed);
	} catch (error) {
		cleanupError = error;
	}
	try {
		await cleanupModalProject(
			params.admin,
			params.actorId,
			params.projectId,
			params.testFailed
		);
	} catch (error) {
		cleanupError ??= error;
	}
	if (cleanupError) throw cleanupError;
}

test('@live existing modal session consumes its prewarmed lease through the worker', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	let sessionId: string | null = null;
	let clientTurnId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	try {
		sessionId = await seedModalSession(admin, userId);
		const setup = await openPrewarmedExistingSession(page, sessionId, PROMPT);
		const { dialog, prewarmRequest, prewarmResponse } = setup;
		const prewarmBody = prewarmRequest.postDataJSON() as Record<string, unknown>;
		expect(prewarmBody).toMatchObject({
			session_id: sessionId,
			context_type: 'global'
		});
		expect(prewarmBody.ensure_session).toBeUndefined();
		const prewarmPayload = (await prewarmResponse.json()) as {
			data?: { prepared_prompt?: { key?: string; cache_key?: string } | null };
		};
		const preparedPromptKey = prewarmPayload.data?.prepared_prompt?.key ?? null;
		expect(preparedPromptKey).toMatch(/^pp_v1\./);
		expect(prewarmPayload.data?.prepared_prompt?.cache_key).toBe('v2|global|none|none|none');

		const composer = dialog.locator('textarea').first();
		await expect(composer).toBeEnabled();
		await expect(composer).toHaveValue(PROMPT);
		const admissionRequestPromise = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				new URL(request.url()).pathname === '/api/agent/v2/turns'
		);
		const admissionResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/api/agent/v2/turns'
		);
		await dialog.getByRole('button', { name: 'Send message' }).click();

		const [admissionRequest, admissionResponse] = await Promise.all([
			admissionRequestPromise,
			admissionResponsePromise
		]);
		const body = admissionRequest.postDataJSON() as Record<string, unknown>;
		sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
		clientTurnId = typeof body.clientTurnId === 'string' ? body.clientTurnId : null;
		expect(body).toMatchObject({
			message: PROMPT,
			context: { type: 'global', entityId: null, projectId: null },
			attachments: [],
			projectFocus: null,
			preparedPromptKey
		});
		expect(body.clientTurnId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(body.streamRunId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(body).toHaveProperty('lastTurnContext');
		expect(admissionResponse.ok()).toBe(true);
		const serverTiming = admissionResponse.headers()['server-timing'] ?? '';
		expect(serverTiming).toContain('prepared-admission');
		expect(serverTiming).toContain('desc="hit"');
		expect(serverTiming).toContain('worker-preparation');
		expect(serverTiming).toContain('worker-admission');
		if (!clientTurnId)
			throw new Error('Worker admission request did not include a client turn id');
		const receipt = await readPreparedAdmissionReceipt(admin, userId, clientTurnId);
		sessionId ??= receipt.sessionId;
		console.log(
			`[agentic-modal-e2e] prepared lease hit: ${serverTiming}; durable_inspection_ms=${receipt.inspectionMs}`
		);

		await expect(dialog.getByTestId('agent-chat-user-message').last()).toContainText(PROMPT);
		const stopButton = dialog.getByRole('button', { name: 'Stop response' });
		await expect(stopButton).toBeVisible();
		await expect(stopButton).toBeHidden({
			timeout: 180_000
		});
		await expect(dialog.getByTestId('agent-chat-assistant-message').last()).toContainText(
			'MODAL E2E OK',
			{ timeout: 180_000 }
		);
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		if (!sessionId && clientTurnId) {
			try {
				sessionId = await findSessionIdForClientTurn(admin, userId, clientTurnId);
			} catch (error) {
				if (!testFailed) throw error;
				console.error(error);
			}
		}
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId,
			testFailed
		});
	}
});

test('@prewarm project selection materializes a project-scoped prepared prompt', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const projectName = `AE2E · Project prewarm · ${randomUUID().slice(0, 8)}`;
	let projectId: string | null = null;
	let testFailed = false;

	try {
		projectId = await seedModalProject(admin, actorId, projectName);
		const projectPrewarmRequestPromise = page.waitForRequest(
			(request) => {
				if (
					request.method() !== 'POST' ||
					new URL(request.url()).pathname !== '/api/agent/v2/prewarm'
				) {
					return false;
				}
				const body = request.postDataJSON() as {
					context_type?: string;
					entity_id?: string;
					ensure_session?: boolean;
				};
				return (
					body.context_type === 'project' &&
					body.entity_id === projectId &&
					body.ensure_session === false
				);
			},
			{ timeout: 60_000 }
		);
		const projectPrewarmResponsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/api/agent/v2/prewarm' &&
				(response.request().postDataJSON() as { entity_id?: string }).entity_id ===
					projectId,
			{ timeout: 60_000 }
		);

		await page.goto('/dashboard');
		await page
			.getByRole('button', { name: 'Use necessary only' })
			.click({ timeout: 3_000 })
			.catch(() => undefined);
		await page.getByRole('button', { name: 'Open BuildOS chat' }).click();
		const dialog = page.getByRole('dialog', { name: 'BuildOS chat assistant dialog' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /Chat inside a project/ }).click();
		await dialog.getByRole('textbox', { name: 'Search projects' }).fill(projectName);
		await dialog.getByRole('button', { name: new RegExp(projectName) }).click();
		await dialog.getByRole('button', { name: /Project-wide chat/ }).click();

		const [prewarmRequest, prewarmResponse] = await Promise.all([
			projectPrewarmRequestPromise,
			projectPrewarmResponsePromise
		]);
		expect(prewarmRequest.postDataJSON()).toMatchObject({
			context_type: 'project',
			entity_id: projectId,
			ensure_session: false,
			projectFocus: {
				focusType: 'project-wide',
				focusEntityId: null,
				projectId
			}
		});
		expect(prewarmResponse.ok()).toBe(true);
		const payload = (await prewarmResponse.json()) as {
			data?: {
				cache_source?: string;
				prepared_prompt?: { key?: string; cache_key?: string } | null;
			};
		};
		expect(payload.data?.prepared_prompt?.key).toMatch(/^pp_v1\./);
		expect(payload.data?.prepared_prompt?.cache_key).toBe(
			`v2|project|${projectId}|project-wide|none`
		);
		console.log(
			`[agentic-modal-e2e] project prewarm ready: cache_source=${payload.data?.cache_source ?? 'unknown'}`
		);
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId: null,
			projectId,
			testFailed
		});
	}
});

test('@wiring modal Stop reports matching turn identity and exits streaming', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const streamStarted = deferred<Record<string, unknown>>();
	const releaseStream = deferred<void>();
	const cancelReceived = deferred<Record<string, unknown>>();
	let sessionId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	await page.route('**/api/agent/v2/stream*', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (request.method() !== 'POST' || url.pathname !== '/api/agent/v2/stream') {
			await route.continue();
			return;
		}
		streamStarted.resolve(request.postDataJSON() as Record<string, unknown>);
		await releaseStream.promise;
		await route.abort('aborted').catch(() => undefined);
	});
	await page.route('**/api/agent/v2/stream/cancel', async (route) => {
		cancelReceived.resolve(route.request().postDataJSON() as Record<string, unknown>);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ success: true })
		});
	});

	try {
		projectId = await seedModalProject(admin, actorId);
		const setup = await openPrewarmedModal(page, 'Keep working until I stop you.', {
			forceSessionBootstrap: true
		});
		const { dialog } = setup;
		await dialog.getByRole('button', { name: 'Send message' }).click();
		sessionId = await readBootstrappedSessionId(setup.sessionBootstrapResponsePromise);
		const streamBody = await streamStarted.promise;
		const stopButton = dialog.getByRole('button', { name: 'Stop response' });
		await expect(stopButton).toBeVisible();
		await stopButton.click();
		const cancelBody = await cancelReceived.promise;

		expect(cancelBody).toMatchObject({
			session_id: sessionId,
			stream_run_id: streamBody.stream_run_id,
			client_turn_id: streamBody.client_turn_id,
			reason: 'user_cancelled'
		});
		await expect(stopButton).toBeHidden();
		await expect(dialog.getByText('Stopped by you')).toBeVisible();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		releaseStream.resolve();
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId,
			testFailed
		});
	}
});

test('@wiring modal reconciles an accepted stream that closes without done', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	let sessionId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	try {
		projectId = await seedModalProject(admin, actorId);
		const setup = await openPrewarmedModal(page, 'Test interrupted response recovery.', {
			forceSessionBootstrap: true
		});
		const { dialog } = setup;
		await page.route('**/api/agent/v2/stream', async (route) => {
			const progressEvent = {
				type: 'agent_state',
				state: 'thinking',
				details: 'Accepted before transport closed'
			};
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: `data: ${JSON.stringify(progressEvent)}\n\n`
			});
		});
		const snapshotRequestPromise = page.waitForRequest(
			(request) =>
				request.method() === 'GET' &&
				new URL(request.url()).pathname.startsWith('/api/chat/sessions/') &&
				new URL(request.url()).searchParams.get('includeVoiceNotes') === '1'
		);

		await dialog.getByRole('button', { name: 'Send message' }).click();
		sessionId = await readBootstrappedSessionId(setup.sessionBootstrapResponsePromise);
		const snapshotRequest = await snapshotRequestPromise;
		expect(new URL(snapshotRequest.url()).pathname).toBe(`/api/chat/sessions/${sessionId}`);
		await expect(dialog.getByText('Restoring latest response')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Stop response' })).toBeHidden();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId,
			testFailed
		});
	}
});

test('@wiring modal forwards server continuity context on the next turn', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const firstStream = deferred<Record<string, unknown>>();
	const secondStream = deferred<Record<string, unknown>>();
	const continuityContext = {
		summary: 'Reviewed the launch checklist and identified the beta email as next.',
		entities: {
			projects: [{ id: randomUUID(), name: 'Modal continuity fixture' }]
		},
		context_type: 'global',
		data_accessed: ['onto_projects'],
		timestamp: new Date().toISOString()
	};
	let streamCount = 0;
	let sessionId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	await page.route('**/api/agent/v2/stream', async (route) => {
		streamCount += 1;
		const body = route.request().postDataJSON() as Record<string, unknown>;
		if (streamCount === 1) {
			firstStream.resolve(body);
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: [
					`data: ${JSON.stringify({ type: 'last_turn_context', context: continuityContext })}`,
					`data: ${JSON.stringify({ type: 'done', finished_reason: 'stop' })}`,
					''
				].join('\n\n')
			});
			return;
		}
		secondStream.resolve(body);
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: `data: ${JSON.stringify({ type: 'done', finished_reason: 'stop' })}\n\n`
		});
	});

	try {
		projectId = await seedModalProject(admin, actorId);
		const setup = await openPrewarmedModal(page, 'Review the launch checklist.', {
			forceSessionBootstrap: true
		});
		const { dialog } = setup;
		await dialog.getByRole('button', { name: 'Send message' }).click();
		sessionId = await readBootstrappedSessionId(setup.sessionBootstrapResponsePromise);
		const firstBody = await firstStream.promise;
		expect(firstBody.lastTurnContext).toBeNull();

		const composer = dialog.locator('textarea').first();
		await expect(composer).toBeEnabled();
		await composer.fill('What should I do next?');
		await dialog.getByRole('button', { name: 'Send message' }).click();
		const secondBody = await secondStream.promise;

		expect(secondBody).toMatchObject({
			session_id: sessionId,
			message: 'What should I do next?',
			lastTurnContext: continuityContext
		});
		expect(secondBody.client_turn_id).not.toBe(firstBody.client_turn_id);
		expect(secondBody.stream_run_id).not.toBe(firstBody.stream_run_id);
		await expect(dialog.getByRole('button', { name: 'Stop response' })).toBeHidden();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId,
			testFailed
		});
	}
});

test('@wiring modal uploads a temporary image and sends its canonical attachment ref', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const attachmentCreate = deferred<Record<string, unknown>>();
	const streamStarted = deferred<Record<string, unknown>>();
	const temporaryAttachmentId = randomUUID();
	const storagePath = `users/${userId}/chat-temp/${temporaryAttachmentId}/original.png`;
	let sessionId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	await page.route('**/api/agent/chat-attachments', async (route) => {
		attachmentCreate.resolve(route.request().postDataJSON() as Record<string, unknown>);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				success: true,
				data: {
					asset: {
						id: temporaryAttachmentId,
						project_id: null,
						kind: 'temporary_file',
						storage_bucket: 'onto-assets',
						storage_path: storagePath,
						original_filename: 'modal-fixture.png',
						content_type: 'image/png',
						file_size_bytes: 68,
						width: 1,
						height: 1,
						ocr_status: 'skipped',
						expires_at: new Date(Date.now() + 60_000).toISOString()
					},
					upload: {
						signed_url: `https://storage.invalid/storage/v1/object/upload/sign/onto-assets/${storagePath}?token=fake-token`,
						path: storagePath,
						token: 'fake-token'
					}
				}
			})
		});
	});
	await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ Key: `onto-assets/${storagePath}` })
		});
	});
	await page.route('**/api/agent/v2/stream', async (route) => {
		streamStarted.resolve(route.request().postDataJSON() as Record<string, unknown>);
		await route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: `data: ${JSON.stringify({ type: 'done', finished_reason: 'stop' })}\n\n`
		});
	});

	try {
		projectId = await seedModalProject(admin, actorId);
		const setup = await openPrewarmedModal(page, 'Describe this image.', {
			forceSessionBootstrap: true
		});
		const { dialog } = setup;
		await dialog
			.locator('input[type="file"]')
			.first()
			.setInputFiles({
				name: 'modal-fixture.png',
				mimeType: 'image/png',
				buffer: Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
					'base64'
				)
			});

		const createBody = await attachmentCreate.promise;
		expect(createBody).toMatchObject({
			project_id: null,
			file_name: 'modal-fixture.png',
			content_type: 'image/png',
			metadata: { source_component: 'agent_chat_composer' }
		});
		expect(createBody.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
		await expect(dialog.getByText('Ready to analyze')).toBeVisible();

		await dialog.getByRole('button', { name: 'Send message' }).click();
		sessionId = await readBootstrappedSessionId(setup.sessionBootstrapResponsePromise);
		const streamBody = await streamStarted.promise;
		expect(streamBody).toMatchObject({
			session_id: sessionId,
			message: 'Describe this image.',
			attachments: [
				{
					attachment_kind: 'temporary_file',
					media_type: 'image',
					temporary_attachment_id: temporaryAttachmentId,
					project_id: null,
					storage_bucket: 'onto-assets',
					storage_path: storagePath,
					file_name: 'modal-fixture.png',
					content_type: 'image/png',
					ocr_status: 'skipped',
					role: 'analysis_target',
					display_order: 0
				}
			]
		});
		await expect(dialog.getByTestId('agent-chat-user-message')).toContainText(
			'Describe this image.'
		);
		await expect(dialog.getByRole('button', { name: 'Stop response' })).toBeHidden();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId,
			testFailed
		});
	}
});
