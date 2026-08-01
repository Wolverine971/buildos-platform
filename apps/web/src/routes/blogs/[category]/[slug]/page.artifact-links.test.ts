// apps/web/src/routes/blogs/[category]/[slug]/page.artifact-links.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import BlogPostPage from './+page.svelte';

const data = {
	post: {
		slug: 'cold-email-engagement-first-outreach',
		category: 'agent-skills',
		title: 'Cold Email Engagement-First Outreach',
		description: 'A portable outreach skill.',
		author: 'BuildOS Team',
		date: '2026-05-14',
		lastmod: '2026-05-15',
		changefreq: 'monthly',
		priority: '0.9',
		published: true,
		tags: ['agent-skills'],
		readingTime: 5
	},
	relatedPosts: [],
	contentHtml: '<p>Skill guide</p>',
	wordCount: 2
} as unknown as PageData;

afterEach(cleanup);

describe('agent skill artifact links', () => {
	it('bypasses client-side routing for raw files', () => {
		render(BlogPostPage, { props: { data } });

		for (const name of ['Portable SKILL.md', 'bundle.zip', 'BuildOS SKILL.md', 'index.json']) {
			expect(screen.getByRole('link', { name })).toHaveAttribute('data-sveltekit-reload');
		}
	});
});
