// apps/web/src/routes/admin/feature-flags/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	enableFeature: vi.fn(),
	disableFeature: vi.fn()
}));

vi.mock('$lib/utils/feature-flags', () => ({
	enableFeature: mocks.enableFeature,
	disableFeature: mocks.disableFeature,
	FEATURE_KEYS: { beta: 'beta_feature' }
}));

import { actions } from './+page.server';

function toggleEvent(isAdmin: boolean) {
	const body = new FormData();
	body.set('user_id', 'target-user');
	body.set('feature_name', 'beta_feature');
	body.set('enable', 'true');
	return {
		request: new Request('http://localhost/admin/feature-flags?/toggle', {
			method: 'POST',
			body
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'caller' } }),
			supabase: {},
			user: { id: 'caller', is_admin: isAdmin }
		}
	} as any;
}

describe('/admin/feature-flags toggle action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('refuses a non-admin caller before touching any flag', async () => {
		const result = await actions.toggle!(toggleEvent(false));

		expect(result).toMatchObject({ status: 403 });
		expect(mocks.enableFeature).not.toHaveBeenCalled();
		expect(mocks.disableFeature).not.toHaveBeenCalled();
	});

	it('lets an admin toggle a managed flag', async () => {
		const result = await actions.toggle!(toggleEvent(true));

		expect(result).toEqual({ success: true });
		expect(mocks.enableFeature).toHaveBeenCalledWith({}, 'target-user', 'beta_feature');
	});
});
