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

async function seedModalProject(admin: SupabaseClient, actorId: string): Promise<string> {
	const { data, error } = await admin
		.from('onto_projects')
		.insert({
			created_by: actorId,
			name: `AE2E · Modal wiring · ${randomUUID().slice(0, 8)}`,
			description: 'Disposable project that unlocks the real modal context chooser.',
			state_key: 'active',
			type_key: 'project.business.product_launch'
		})
		.select('id')
		.single();
	if (error) throw new Error(`Failed to seed modal E2E project: ${error.message}`);
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

test('@live real modal prewarms, sends the canonical request, and renders the streamed reply', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	let sessionId: string | null = null;
	let clientTurnId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;

	try {
		projectId = await seedModalProject(admin, actorId);
		const streamRequestPromise = page.waitForRequest(
			(request) =>
				request.method() === 'POST' && request.url().endsWith('/api/agent/v2/stream')
		);

		const setup = await openPrewarmedModal(page, PROMPT);
		const { dialog, prewarmRequest } = setup;
		expect(prewarmRequest.postDataJSON()).toMatchObject({
			context_type: 'global',
			ensure_session: false
		});

		const composer = dialog.locator('textarea').first();
		await expect(composer).toBeEnabled();
		await expect(composer).toHaveValue(PROMPT);
		await dialog.getByRole('button', { name: 'Send message' }).click();

		const streamRequest = await streamRequestPromise;
		const body = streamRequest.postDataJSON() as Record<string, unknown>;
		sessionId = typeof body.session_id === 'string' ? body.session_id : null;
		clientTurnId = typeof body.client_turn_id === 'string' ? body.client_turn_id : null;
		expect(body).toMatchObject({
			message: PROMPT,
			context_type: 'global',
			attachments: [],
			projectFocus: null
		});
		expect(body.client_turn_id).toMatch(/^[0-9a-f-]{36}$/i);
		expect(body.stream_run_id).toMatch(/^[0-9a-f-]{36}$/i);
		expect(body).toHaveProperty('lastTurnContext');
		expect(body).toHaveProperty('preparedPromptKey');

		await expect(dialog.getByTestId('agent-chat-user-message')).toContainText(PROMPT);
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
