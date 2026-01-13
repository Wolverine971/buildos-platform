// apps/web/src/routes/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
	return {
		...data,
		clientLoadTime: new Date().toISOString(),
		searchParams: url.searchParams.toString()
	};
};
