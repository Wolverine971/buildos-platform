// apps/web/src/routes/api/onto/documents/[id]/public-page/server.write-access.test.ts
// Public page rows are server-owned: the unpublish and live-sync routes may only
// reach the service-role client after the user-scoped write-access check passes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureDocumentAccessForPublicPage: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	unpublishDocumentPublicPage: vi.fn(),
	setDocumentPublicPageLiveSync: vi.fn()
}));

vi.mock('$lib/server/public-page.service', () => ({
	unpublishDocumentPublicPage: mocks.unpublishDocumentPublicPage,
	setDocumentPublicPageLiveSync: mocks.setDocumentPublicPageLiveSync
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('../../shared-public-page', () => ({
	ensureDocumentAccessForPublicPage: mocks.ensureDocumentAccessForPublicPage
}));

import { POST as unpublishPOST } from './unpublish/+server';
import { POST as liveSyncPOST } from './live-sync/+server';

const ADMIN_CLIENT = { __client: 'service-role' };
const USER_CLIENT = { __client: 'user-scoped' };

function requestEvent(path: string, body?: Record<string, unknown>) {
	return {
		params: { id: 'doc-1' },
		request: new Request(`http://localhost/api/onto/documents/doc-1/public-page/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body ?? {})
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase: USER_CLIENT
		}
	} as any;
}

const routes = [
	{
		name: 'unpublish',
		call: () => unpublishPOST(requestEvent('unpublish')),
		service: mocks.unpublishDocumentPublicPage
	},
	{
		name: 'live-sync',
		call: () => liveSyncPOST(requestEvent('live-sync', { live_sync_enabled: false })),
		service: mocks.setDocumentPublicPageLiveSync
	}
];

describe('public page write routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue(ADMIN_CLIENT);
		mocks.ensureDocumentAccessForPublicPage.mockResolvedValue({
			document: { id: 'doc-1', project_id: 'project-1' },
			actorId: 'actor-1'
		});
		mocks.unpublishDocumentPublicPage.mockResolvedValue({ id: 'page-1' });
		mocks.setDocumentPublicPageLiveSync.mockResolvedValue({ id: 'page-1' });
	});

	it.each(routes)(
		'$name writes through the service role only after the write-access check',
		async ({ call, service }) => {
			const response = await call();

			expect(response.status).toBe(200);
			expect(mocks.ensureDocumentAccessForPublicPage).toHaveBeenCalledWith(
				expect.anything(),
				'doc-1',
				'user-1',
				'write'
			);
			const [clients] = service.mock.calls[0] ?? [];
			expect(clients.supabase).toBe(USER_CLIENT);
			expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
			expect(clients.getAdminSupabase()).toBe(ADMIN_CLIENT);
			expect(
				mocks.ensureDocumentAccessForPublicPage.mock.invocationCallOrder[0]
			).toBeLessThan(mocks.createAdminSupabaseClient.mock.invocationCallOrder[0]!);
		}
	);

	it.each(routes)(
		'$name writes nothing when the access check fails',
		async ({ call, service }) => {
			mocks.ensureDocumentAccessForPublicPage.mockResolvedValue({
				error: new Response(JSON.stringify({ success: false }), { status: 403 })
			});

			const response = await call();

			expect(response.status).toBe(403);
			expect(service).not.toHaveBeenCalled();
			expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		}
	);
});
