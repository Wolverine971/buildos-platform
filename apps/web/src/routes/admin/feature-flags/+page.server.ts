// apps/web/src/routes/admin/feature-flags/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { enableFeature, disableFeature } from '$lib/utils/feature-flags';
import type { FeatureName } from '@buildos/shared-types';

type UserFeatureRow = {
	id: string;
	email: string;
	name: string | null;
	feature_flags: Array<{
		id: string;
		feature_name: FeatureName;
		enabled: boolean;
		enabled_at: string | null;
		updated_at: string;
	}>;
};

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const { data, error: usersError } = await supabase
		.from('users')
		.select('id, email, name, feature_flags(id, feature_name, enabled, enabled_at, updated_at)')
		.order('email', { ascending: true });

	if (usersError) {
		console.error('[FeatureFlags] Failed to load users:', usersError);
		throw error(500, 'Failed to load feature flags');
	}

	return {
		users: (data as UserFeatureRow[]) ?? []
	};
};

export const actions: Actions = {
	toggle: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const targetUserId = formData.get('user_id');
		const featureName = formData.get('feature_name') as FeatureName | null;
		const enable = formData.get('enable') === 'true';

		if (!targetUserId || !featureName) {
			return fail(400, { error: 'Missing required parameters' });
		}

		try {
			if (enable) {
				await enableFeature(supabase, String(targetUserId), featureName);
			} else {
				await disableFeature(supabase, String(targetUserId), featureName);
			}

			return {
				success: true
			};
		} catch (err) {
			console.error('[FeatureFlags] Failed to toggle feature flag:', err);
			return fail(500, { error: 'Failed to update feature flag' });
		}
	}
};
