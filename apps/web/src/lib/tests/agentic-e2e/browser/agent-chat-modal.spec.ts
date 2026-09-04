// apps/web/src/lib/tests/agentic-e2e/browser/agent-chat-modal.spec.ts
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AGENTIC_CHAT_WORKER_CONTRACT_VERSION } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT,
	POSTHOG_CAPTURE_RECEIPT_DOM_EVENT,
	type PostHogCaptureReceipt
} from '../../../services/posthog-capture-receipt';

const PROMPT = 'Reply with exactly "MODAL E2E OK" and do not use tools.';
const CAPTURE_ANALYTICS = process.env.AGENTIC_E2E_CAPTURE_ANALYTICS === 'true';
const TRACKING_CONSENT_BUTTON = CAPTURE_ANALYTICS ? 'Accept all' : 'Use necessary only';
const TRACKING_PREFERENCES_STORAGE_KEY = 'buildos_tracking_preferences_v1';
const TRACKING_PREFERENCES_OPEN_EVENT = 'buildos:open-tracking-preferences';
const POSTHOG_CAPTURE_RECEIPT_SLOT = '__buildosAgenticPostHogCaptureReceiptV1';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

/**
 * The legacy web streaming engine is deleted (stage S8): POST
 * /api/agent/v2/stream no longer exists. Every modal turn negotiates through
 * POST /api/agent/v2/turns and streams from the worker, so a request to the old
 * route is a regression, not something to mock a response for. The GET
 * `?purpose=warmup` ping is the one known exception: `agent-chat-session.ts`
 * still fires it and B6 removes that call with the rest of the client fallback.
 */
function guardLegacyStreamRouteGone(page: Page): { assertNeverCalled: () => Promise<void> } {
	const calls: string[] = [];
	const routed = page.route('**/api/agent/v2/stream*', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const isWarmupPing =
			request.method() === 'GET' && url.searchParams.get('purpose') === 'warmup';
		if (!isWarmupPing) calls.push(`${request.method()} ${url.pathname}${url.search}`);
		await route.fulfill({
			status: 410,
			contentType: 'application/json',
			body: JSON.stringify({ success: false, error: 'legacy stream route removed' })
		});
	});
	return {
		assertNeverCalled: async () => {
			await routed;
			expect(calls, 'the legacy /api/agent/v2/stream route is deleted').toEqual([]);
		}
	};
}

function required(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`[agentic-modal-e2e] Missing ${name} in apps/web/.env`);
	return value;
}

async function chooseTrackingConsent(page: Page): Promise<void> {
	if (!CAPTURE_ANALYTICS) {
		await page
			.locator('button')
			.filter({ hasText: TRACKING_CONSENT_BUTTON })
			.click({ timeout: 3_000 })
			.catch(() => undefined);
		return;
	}

	await page.evaluate((eventName) => {
		window.dispatchEvent(new CustomEvent(eventName));
	}, TRACKING_PREFERENCES_OPEN_EVENT);
	const acceptAllButton = page.locator('button').filter({ hasText: TRACKING_CONSENT_BUTTON });
	await expect(acceptAllButton).toBeVisible({ timeout: 15_000 });
	await acceptAllButton.click();
	await expect
		.poll(() =>
			page.evaluate((key) => {
				const raw = localStorage.getItem(key);
				if (!raw) return false;
				try {
					return (JSON.parse(raw) as { analytics?: unknown }).analytics === true;
				} catch {
					return false;
				}
			}, TRACKING_PREFERENCES_STORAGE_KEY)
		)
		.toBe(true);
}

async function armPostHogCaptureReceipt(page: Page): Promise<void> {
	if (!CAPTURE_ANALYTICS) return;

	await page.evaluate(
		({ domEvent, eventName, slot }) => {
			const state: { receipt: PostHogCaptureReceipt | null } = { receipt: null };
			Object.defineProperty(window, slot, {
				value: state,
				configurable: true
			});

			const handler = (event: Event) => {
				const detail = (event as CustomEvent<PostHogCaptureReceipt>).detail;
				if (!detail || detail.event !== eventName) return;
				state.receipt = {
					event: detail.event,
					status: detail.status,
					delivery: detail.delivery,
					reason: detail.reason
				};
				window.removeEventListener(domEvent, handler);
			};
			window.addEventListener(domEvent, handler);
		},
		{
			domEvent: POSTHOG_CAPTURE_RECEIPT_DOM_EVENT,
			eventName: AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT,
			slot: POSTHOG_CAPTURE_RECEIPT_SLOT
		}
	);
}

async function readPostHogCaptureReceipt(page: Page): Promise<PostHogCaptureReceipt | null> {
	if (!CAPTURE_ANALYTICS) return null;

	const readReceipt = () =>
		page.evaluate(
			(slot) =>
				(window as unknown as Record<string, { receipt?: PostHogCaptureReceipt | null }>)[
					slot
				]?.receipt ?? null,
			POSTHOG_CAPTURE_RECEIPT_SLOT
		);
	await expect.poll(readReceipt, { timeout: 15_000 }).not.toBeNull();
	return readReceipt();
}

async function authenticateHarnessUser(
	page: Page
): Promise<{ admin: SupabaseClient; userId: string; actorId: string }> {
	if (CAPTURE_ANALYTICS) {
		await page.addInitScript(() => {
			// PostHog deliberately suppresses automation UAs. Sanitize Playwright-only markers so
			// the explicitly opted-in analytics canary exercises the production capture path.
			Object.defineProperty(Navigator.prototype, 'webdriver', {
				configurable: true,
				get: () => false
			});

			const navigatorWithUaData = navigator as Navigator & {
				userAgentData?: { brands?: Array<{ brand: string; version: string }> };
			};
			const userAgentData = navigatorWithUaData.userAgentData;
			if (userAgentData?.brands) {
				const brands = userAgentData.brands.map((brand) => ({
					...brand,
					brand: brand.brand === 'HeadlessChrome' ? 'Google Chrome' : brand.brand
				}));
				const sanitizedUserAgentData = new Proxy(userAgentData, {
					get(target, property) {
						if (property === 'brands') return brands;
						const value = Reflect.get(target, property, target);
						return typeof value === 'function' ? value.bind(target) : value;
					}
				});
				Object.defineProperty(navigator, 'userAgentData', {
					configurable: true,
					get: () => sanitizedUserAgentData
				});
			}
		});
	}

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

async function openPrewarmedExistingSession(page: Page, sessionId: string, prompt: string) {
	await page.goto('/dashboard');
	await chooseTrackingConsent(page);

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
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);
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
		await armPostHogCaptureReceipt(page);
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
		const posthogCaptureReceipt = await readPostHogCaptureReceipt(page);
		if (posthogCaptureReceipt) {
			expect(posthogCaptureReceipt).toEqual({
				event: AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT,
				status: 'accepted',
				delivery: 'immediate_fetch',
				reason: null
			});
			console.log(
				`[agentic-modal-e2e] PostHog capture accepted: delivery=${posthogCaptureReceipt.delivery}`
			);
		}
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
		await legacyStreamRoute.assertNeverCalled();
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

test('@analytics admission capture reaches PostHog without a model call', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const admissionIntercepted = deferred<void>();
	let sessionId: string | null = null;
	let projectId: string | null = null;
	let testFailed = false;
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);

	await page.route('**/api/agent/v2/turns*', async (route) => {
		const request = route.request();
		if (
			request.method() !== 'POST' ||
			new URL(request.url()).pathname !== '/api/agent/v2/turns'
		) {
			await route.continue();
			return;
		}

		const body = request.postDataJSON() as {
			clientTurnId: string;
			streamRunId: string;
			sessionId: string;
		};
		admissionIntercepted.resolve();
		await route.fulfill({
			status: 202,
			contentType: 'application/json',
			headers: {
				'server-timing': [
					'prepared-admission;dur=1;desc="hit"',
					'worker-preparation;dur=2',
					'worker-admission;dur=3'
				].join(', ')
			},
			body: JSON.stringify({
				success: true,
				data: {
					outcome: 'newly_admitted',
					status: 'queued',
					handle: {
						contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
						executionMode: 'worker_realtime',
						turnRunId: randomUUID(),
						sessionId: body.sessionId,
						streamRunId: body.streamRunId,
						clientTurnId: body.clientTurnId
					}
				}
			})
		});
	});

	try {
		sessionId = await seedModalSession(admin, userId);
		const { dialog } = await openPrewarmedExistingSession(page, sessionId, PROMPT);
		await armPostHogCaptureReceipt(page);
		await dialog.getByRole('button', { name: 'Send message' }).click();
		await admissionIntercepted.promise;

		const receipt = await readPostHogCaptureReceipt(page);
		expect(receipt).toEqual({
			event: AGENTIC_CHAT_ADMISSION_COMPLETED_EVENT,
			status: 'accepted',
			delivery: 'immediate_fetch',
			reason: null
		});
		// Give the fire-and-forget request a bounded delivery window before fixture teardown.
		await page.waitForTimeout(2_000);
		await legacyStreamRoute.assertNeverCalled();
		console.log('[agentic-modal-e2e] no-model PostHog capture accepted on the worker path');
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

test('@prewarm project selection materializes a project-scoped prepared prompt', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);
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
		await chooseTrackingConsent(page);
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
		await legacyStreamRoute.assertNeverCalled();
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

// ---------------------------------------------------------------------------
// The four @wiring tests below replace the mocked-SSE originals deleted with the
// legacy engine (stage S8). Each drives the real modal through the real
// transport route (a genuine worker lease is minted and verified) and mocks only
// the worker-transport HTTP boundary — POST /api/agent/v2/turns, the owned-turn
// cancel and discovery endpoints — so no model call is made. Realtime is the one
// thing that cannot be faked over HTTP: it is a WebSocket, so a behavior whose
// only observable is a durable worker event is skipped rather than weakened.
// ---------------------------------------------------------------------------

const WORKER_CONTRACT = AGENTIC_CHAT_WORKER_CONTRACT_VERSION;

type AdmissionRecord = {
	turnRunId: string;
	clientTurnId: string;
	streamRunId: string;
	body: Record<string, unknown>;
};

/**
 * Answers POST /api/agent/v2/turns with a synthetic admitted handle (so no
 * model runs) while letting POST /api/agent/v2/transport hit the real route,
 * which mints and later verifies a genuine worker lease. GET
 * /api/agent/v2/turns?session_id=... (owned-turn discovery) is left alone.
 */
async function stubWorkerAdmission(
	page: Page,
	options: { status?: number; body?: Record<string, unknown> } = {}
): Promise<{ admissions: AdmissionRecord[]; waitForAdmission: () => Promise<AdmissionRecord> }> {
	const admissions: AdmissionRecord[] = [];
	await page.route('**/api/agent/v2/turns', async (route) => {
		const request = route.request();
		if (request.method() !== 'POST') {
			await route.continue();
			return;
		}
		const body = request.postDataJSON() as Record<string, unknown>;
		const turnRunId = randomUUID();
		admissions.push({
			turnRunId,
			clientTurnId: String(body.clientTurnId),
			streamRunId: String(body.streamRunId),
			body
		});
		if (options.status && options.status >= 400) {
			await route.fulfill({
				status: options.status,
				contentType: 'application/json',
				body: JSON.stringify(options.body ?? { success: false })
			});
			return;
		}
		await route.fulfill({
			status: 202,
			contentType: 'application/json',
			body: JSON.stringify({
				success: true,
				data: {
					outcome: 'newly_admitted',
					status: 'queued',
					handle: {
						contractVersion: WORKER_CONTRACT,
						executionMode: 'worker_realtime',
						turnRunId,
						sessionId: body.sessionId,
						streamRunId: body.streamRunId,
						clientTurnId: body.clientTurnId
					}
				}
			})
		});
	});

	return {
		admissions,
		waitForAdmission: async () => {
			await expect.poll(() => admissions.length, { timeout: 30_000 }).toBeGreaterThan(0);
			return admissions[admissions.length - 1]!;
		}
	};
}

test('@wiring modal Stop cancels exactly the negotiated worker turn', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);
	const cancels: Array<{ url: string; body: Record<string, unknown> }> = [];
	let sessionId: string | null = null;
	let testFailed = false;

	const worker = await stubWorkerAdmission(page);
	await page.route('**/api/agent/v2/turns/*/cancel', async (route) => {
		const request = route.request();
		cancels.push({
			url: new URL(request.url()).pathname,
			body: request.postDataJSON() as Record<string, unknown>
		});
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				success: true,
				data: { outcome: 'cancel_requested' }
			})
		});
	});

	try {
		sessionId = await seedModalSession(admin, userId);
		const { dialog } = await openPrewarmedExistingSession(page, sessionId, PROMPT);
		await dialog.getByRole('button', { name: 'Send message' }).click();
		const admission = await worker.waitForAdmission();

		const stopButton = dialog.getByRole('button', { name: 'Stop response' });
		await expect(stopButton).toBeVisible();
		await stopButton.click();
		await expect.poll(() => cancels.length, { timeout: 30_000 }).toBe(1);

		// Turn identity travels in the URL for a worker cancel; the reason is the
		// only body field. Both must name the turn admission just returned.
		expect(cancels[0]!.url).toBe(`/api/agent/v2/turns/${admission.turnRunId}/cancel`);
		expect(cancels[0]!.body).toEqual({ reason: 'user_cancelled' });
		// Stop must never dispatch another turn.
		expect(worker.admissions).toHaveLength(1);
		await legacyStreamRoute.assertNeverCalled();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId: null,
			testFailed
		});
	}
});

test('@wiring modal recovers an uncertain worker admission from server truth', async ({ page }) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);
	let sessionId: string | null = null;
	let testFailed = false;

	// The worker equivalent of the deleted "accepted stream closes without done"
	// test: admission outcome is unknown, so the client must reconcile against
	// owned-turn discovery instead of guessing or re-sending.
	const worker = await stubWorkerAdmission(page, {
		status: 503,
		body: {
			success: false,
			error: 'Worker turn admission is temporarily unavailable',
			code: 'WORKER_ADMISSION_UNAVAILABLE'
		}
	});

	try {
		sessionId = await seedModalSession(admin, userId);
		const discoveryPromise = page.waitForRequest(
			(request) =>
				request.method() === 'GET' &&
				new URL(request.url()).pathname === '/api/agent/v2/turns' &&
				new URL(request.url()).searchParams.get('session_id') === sessionId,
			{ timeout: 60_000 }
		);
		const { dialog } = await openPrewarmedExistingSession(page, sessionId, PROMPT);
		await dialog.getByRole('button', { name: 'Send message' }).click();
		await worker.waitForAdmission();

		const discovery = await discoveryPromise;
		expect(new URL(discovery.url()).searchParams.get('session_id')).toBe(sessionId);
		// An uncertain admission never rolls the bubble back: a duplicate turn is
		// worse than a lost one, so the sent message stays put.
		await expect(dialog.getByTestId('agent-chat-user-message').last()).toContainText(PROMPT);
		await expect(dialog.getByRole('button', { name: 'Stop response' })).toBeHidden();
		expect(worker.admissions).toHaveLength(1);
		await legacyStreamRoute.assertNeverCalled();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId: null,
			testFailed
		});
	}
});

// Continuity forwarding: `lastTurnContext` is only ever set from the worker's
// `last_turn_context` event, which arrives over the Supabase Realtime WebSocket
// and has no HTTP boundary to mock, so this needs a live worker turn.
test.skip('@wiring modal forwards worker continuity context on the next turn', async () => {});

test('@wiring modal uploads a temporary image and admits its canonical attachment ref', async ({
	page
}) => {
	const { admin, userId, actorId } = await authenticateHarnessUser(page);
	const legacyStreamRoute = guardLegacyStreamRouteGone(page);
	const attachmentCreate = deferred<Record<string, unknown>>();
	const temporaryAttachmentId = randomUUID();
	const storagePath = `users/${userId}/chat-temp/${temporaryAttachmentId}/original.png`;
	const expiresAt = new Date(Date.now() + 60_000).toISOString();
	let sessionId: string | null = null;
	let testFailed = false;

	const worker = await stubWorkerAdmission(page);
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
						expires_at: expiresAt
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

	try {
		sessionId = await seedModalSession(admin, userId);
		const { dialog } = await openPrewarmedExistingSession(
			page,
			sessionId,
			'Describe this image.'
		);
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
		const admission = await worker.waitForAdmission();

		expect(admission.body).toMatchObject({
			sessionId,
			message: 'Describe this image.',
			attachments: [
				{
					attachmentKind: 'temporary_file',
					mediaType: 'image',
					temporaryAttachmentId,
					storageBucket: 'onto-assets',
					storagePath,
					fileName: 'modal-fixture.png',
					contentType: 'image/png',
					fileSizeBytes: 68,
					width: 1,
					height: 1
				}
			]
		});
		expect(String((admission.body.attachments as any[])[0].checksumSha256)).toMatch(
			/^[a-f0-9]{64}$/
		);
		expect(admission.body.leaseToken).toMatch(/^actl1\./);
		await legacyStreamRoute.assertNeverCalled();
	} catch (error) {
		testFailed = true;
		throw error;
	} finally {
		await cleanupModalFixtures({
			admin,
			userId,
			actorId,
			sessionId,
			projectId: null,
			testFailed
		});
	}
});
