// apps/web/src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import type { DashboardData } from '$lib/services/dashboardData.service';

export const load: PageServerLoad = async ({
	locals: { safeGetSession },
	depends,
	fetch,
	request
}) => {
	depends('app:auth');
	depends('dashboard:data');

	try {
		const { user } = await safeGetSession();

		if (!user) {
			return {
				user: null,
				dashboardData: null,
				dashboardTimezone: null
			};
		}

		const timezone =
			(user.user_metadata?.timezone as string | undefined) ||
			request.headers.get('x-timezone') ||
			request.headers.get('time-zone') ||
			'UTC';

		const dashboardData: Promise<DashboardData> = fetch(
			`/api/dashboard?timezone=${encodeURIComponent(timezone)}`
		)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Failed to load dashboard data (${response.status})`);
				}

				const payload = await response.json();
				if (!payload.success) {
					throw new Error(payload.error || 'Failed to load dashboard data');
				}

				return payload.data as DashboardData;
			})
			.catch((err) => {
				console.error('[Dashboard] Failed to load initial data', err);
				throw err;
			});

		return {
			user,
			dashboardData,
			dashboardTimezone: timezone
		};
	} catch (err) {
		console.error('Error loading dashboard page data:', err);
		return {
			user: null,
			dashboardData: null,
			dashboardTimezone: null
		};
	}
};
