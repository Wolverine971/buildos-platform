// apps/web/src/routes/docs/+page.server.ts
import type { PageServerLoad } from './$types';
import { listDocSections } from '$lib/utils/docs';

export const load: PageServerLoad = async () => {
	return {
		sections: listDocSections()
	};
};
