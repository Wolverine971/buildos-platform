// apps/web/src/routes/api/agent/specialists/workbench/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecialistWorkbenchDraftV1 } from '@buildos/agentic-chat-runtime/specialists';
const state = vi.hoisted(() => ({
	env: { AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: 'ff000000-0000-4000-8000-000000000001' },
	client: { marker: 'service' },
	create: vi.fn(),
	save: vi.fn(),
	publish: vi.fn(),
	get: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: state.create }));
vi.mock('$lib/services/agentic-chat-v2/specialist-workbench.server', async (original) => ({
	...(await original<object>()),
	saveSpecialistWorkbenchDraft: state.save,
	publishSpecialistWorkbenchVersion: state.publish,
	getSpecialistWorkbenchVersion: state.get
}));
import { GET, POST } from './+server';
import { SpecialistWorkbenchStoreError } from '$lib/services/agentic-chat-v2/specialist-workbench.server';
const user = 'ff000000-0000-4000-8000-000000000001';
const id = 'fd000000-0000-4000-8000-000000000001';
const url = new URL('http://localhost/api/agent/specialists/workbench');
function event(
	body: unknown,
	options: { userId?: string | null; origin?: string; contentType?: string; raw?: boolean } = {}
) {
	return {
		url,
		locals: {
			safeGetSession: async () => ({
				user: options.userId === null ? null : { id: options.userId ?? user }
			})
		},
		request: new Request(url, {
			method: 'POST',
			headers: {
				origin: options.origin ?? url.origin,
				'content-type': options.contentType ?? 'application/json'
			},
			body: options.raw ? String(body) : JSON.stringify(body)
		})
	} as any;
}
beforeEach(() => {
	vi.clearAllMocks();
	state.create.mockReturnValue(state.client);
	state.save.mockResolvedValue({ draft: { id, revision: 1 } });
	state.publish.mockResolvedValue({
		version: { draftId: id, version: 1 },
		snapshot: { activation: 'catalog_only' }
	});
});
describe('specialist workbench API', () => {
	it('previews bounded input without creating a service client or calling a model', async () => {
		const response = await POST(
			event({ action: 'preview', draft: createSpecialistWorkbenchDraftV1() })
		);
		expect(response.status).toBe(200);
		expect((await response.json()).preview.canPublish).toBe(true);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(state.create).not.toHaveBeenCalled();
	});
	it.each([
		[null, 401],
		['ff000000-0000-4000-8000-000000000002', 404]
	] as const)('rejects access before touching storage: %s', async (userId, status) => {
		const response = await POST(event({ action: 'save' }, { userId }));
		expect(response.status).toBe(status);
		expect(state.create).not.toHaveBeenCalled();
	});
	it('requires same-origin JSON and bounds the actual body rather than trusting content-length', async () => {
		expect((await POST(event({}, { origin: 'https://evil.example' }))).status).toBe(403);
		expect((await POST(event({}, { contentType: 'text/plain' }))).status).toBe(415);
		expect((await POST(event('x'.repeat(125001), { raw: true }))).status).toBe(413);
		expect((await POST(event('{broken', { raw: true }))).status).toBe(422);
		expect(state.create).not.toHaveBeenCalled();
	});
	it('uses the verified session owner even when the client submits another user ID', async () => {
		const draft = createSpecialistWorkbenchDraftV1();
		const response = await POST(
			event({ action: 'save', id, expectedRevision: 0, draft, userId: 'attacker' })
		);
		expect(response.status).toBe(200);
		expect(state.save).toHaveBeenCalledWith(state.client, user, id, 0, draft);
	});
	it('publishes the saved revision and never accepts a client-authored compiled snapshot', async () => {
		const response = await POST(
			event({
				action: 'publish',
				id,
				expectedRevision: 1,
				snapshot: { capabilities: 'arbitrary' }
			})
		);
		expect(response.status).toBe(200);
		expect(state.publish).toHaveBeenCalledExactlyOnceWith(state.client, user, id, 1);
	});
	it('returns explicit edit conflicts without exposing database error details', async () => {
		state.save.mockRejectedValueOnce(new SpecialistWorkbenchStoreError(409, 'Draft changed.'));
		expect(
			(await POST(event({ action: 'save', id, expectedRevision: 1, draft: {} }))).status
		).toBe(409);
		state.save.mockRejectedValueOnce(new Error('secret SQL connection string'));
		const r = await POST(event({ action: 'save', id, expectedRevision: 1, draft: {} }));
		expect(r.status).toBe(503);
		expect(await r.text()).not.toContain('secret');
	});
	it('scopes exact-version reads to the signed-in owner', async () => {
		state.get.mockResolvedValueOnce({ version: { version: 1 }, snapshot: {} });
		const e = event({});
		e.url = new URL(`${url}?id=${id}&version=1`);
		expect((await GET(e)).status).toBe(200);
		expect(state.get).toHaveBeenCalledWith(state.client, user, id, 1);
	});
});
