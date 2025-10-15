// Minimal server layout for print route
// Provides only essential session data
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	return {
		user: user || null
	};
};
