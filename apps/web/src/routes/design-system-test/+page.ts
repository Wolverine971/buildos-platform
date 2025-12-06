// apps/web/src/routes/design-system-test/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	return {
		title: 'Scratchpad Ops Design System Test',
		description:
			'Visual reference for all BuildOS components using the Scratchpad Ops design system'
	};
};
