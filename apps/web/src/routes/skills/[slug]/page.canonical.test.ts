// apps/web/src/routes/skills/[slug]/page.canonical.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import SkillPage from './+page.svelte';
import { load } from './+page.server';

async function loadSkill(slug: string): Promise<PageData> {
	return (await load({ params: { slug } } as unknown as Parameters<typeof load>[0])) as PageData;
}

afterEach(() => {
	cleanup();
	document.head.innerHTML = '';
});

describe('skill gallery page', () => {
	it('points canonical at the agent-skill article and offers one SKILL.md', async () => {
		const data = await loadSkill('google-calendar-for-ai-agents-search-before-you-create');
		render(SkillPage, { props: { data } });

		expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create'
		);
		expect(screen.queryByRole('link', { name: /BuildOS SKILL\.md/ })).toBeNull();
		expect(screen.queryByText('Not covered')).toBeNull();
		expect(screen.getAllByText(/Free to start/).length).toBeGreaterThanOrEqual(2);
		// Install steps use the SKILL.md name, which is also the bundle folder.
		expect(
			screen.getByText(/unzip -o google-calendar\.zip -d ~\/\.agents\/skills\//)
		).toBeInTheDocument();
	});
});
