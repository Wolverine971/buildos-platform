// apps/web/src/routes/docs/integrations/openclaw/setup/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(308, '/docs/connect-agents');
};
