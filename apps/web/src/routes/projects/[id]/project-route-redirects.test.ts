// apps/web/src/routes/projects/[id]/project-route-redirects.test.ts
import { describe, expect, it } from 'vitest';

import { load as loadClassicProject } from './old/+page.server';
import { load as loadProjectsOld } from '../../projects-old/[id]/+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('legacy project route redirects', () => {
	it.each([
		['/projects/[id]/old', loadClassicProject, `/projects/${PROJECT_ID}/old`],
		['/projects-old/[id]', loadProjectsOld, `/projects-old/${PROJECT_ID}`]
	])(
		'%s preserves the query while redirecting to the canonical V2 route',
		async (_, load, path) => {
			await expect(
				Promise.resolve().then(() =>
					load({
						params: { id: PROJECT_ID },
						url: new URL(`https://buildos.test${path}?from=bookmark`)
					} as never)
				)
			).rejects.toMatchObject({
				status: 307,
				location: `/projects/${PROJECT_ID}?from=bookmark`
			});
		}
	);
});
