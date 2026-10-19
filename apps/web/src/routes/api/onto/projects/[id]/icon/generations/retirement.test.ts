// apps/web/src/routes/api/onto/projects/[id]/icon/generations/retirement.test.ts
// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PublicProjectHeader from '$lib/components/landing/public-project-preview/PublicProjectHeader.svelte';

afterEach(() => cleanup());

describe('project icon generation retirement', () => {
	it.each(['./+server.ts', './[generationId]/+server.ts', './[generationId]/select/+server.ts'])(
		'removes the generation endpoint %s',
		(path) => expect(existsSync(fileURLToPath(new URL(path, import.meta.url)))).toBe(false)
	);

	it('removes the web queue producer', () => {
		expect(
			existsSync(`${process.cwd()}/src/lib/server/project-icon-generation.service.ts`)
		).toBe(false);
	});

	it('still renders an existing stored SVG in the public project header', () => {
		const view = render(PublicProjectHeader, {
			props: {
				project: {
					id: 'project',
					name: 'Existing project',
					description: null,
					props: null,
					state_key: 'active',
					start_at: null,
					end_at: null,
					icon_svg:
						'<svg viewBox="0 0 24 24"><circle data-existing-icon="true" cx="12" cy="12" r="8" /></svg>'
				}
			}
		});
		expect(view.container.querySelector('svg [data-existing-icon="true"]')).not.toBeNull();
	});
});
