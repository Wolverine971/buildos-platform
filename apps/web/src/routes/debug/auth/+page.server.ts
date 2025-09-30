// apps/web/src/routes/debug/auth/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const sessionData = await safeGetSession();

	return {
		...sessionData,
		debugInfo: {
			timestamp: new Date().toISOString(),
			hasSession: !!sessionData.session,
			hasUser: !!sessionData.user
		}
	};
};
