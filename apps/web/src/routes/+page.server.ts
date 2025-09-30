// apps/web/src/routes/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, depends }) => {
	depends('app:auth');

	try {
		const { user } = await safeGetSession();

		// Just return user - dashboard data will be fetched client-side with timezone
		return {
			user
		};
	} catch (err) {
		console.error('Error loading user:', err);
		return {
			user: null
		};
	}
};
