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
		readingTime: 5,
		lineagePeople: ['Connor Murray'],
		stackWith: ['landing-page-scorecard-funnel', 'not-a-public-skill']
	},
	relatedPosts: [],
	contentHtml: '<p>Skill guide</p>',
	wordCount: 2,
	skillName: 'cold-email-engagement-first-outreach',
	stackWithLinks: [
		{
			id: 'landing_page_scorecard_funnel',
			title: 'Landing Page Scorecard Funnel',
			href: '/agent-skills/landing-page-scorecard-funnel'
		}
	]
} as unknown as PageData;

afterEach(cleanup);

describe('agent skill artifact links', () => {
	it('bypasses client-side routing for raw files and offers one SKILL.md', () => {
		render(BlogPostPage, { props: { data } });

		for (const name of ['SKILL.md', 'bundle.zip', 'index.json']) {
			expect(screen.getByRole('link', { name })).toHaveAttribute('data-sveltekit-reload');
		}
		expect(screen.queryByRole('link', { name: 'BuildOS SKILL.md' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Portable SKILL.md' })).toBeNull();
	});

	it('leads with a Run in BuildOS block and install steps', () => {
		render(BlogPostPage, { props: { data } });

		expect(screen.getByRole('heading', { name: 'Run this in BuildOS' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Try it in BuildOS' })).toHaveAttribute(
			'href',
			'/skills/try/cold-email-engagement-first-outreach'
		);
		expect(screen.getByText(/Free to start/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Workflow and starter prompts' })).toHaveAttribute(
			'href',
			'/skills/cold-email-engagement-first-outreach'
		);
		expect(
			screen.getByText(
				/unzip -o cold-email-engagement-first-outreach\.zip -d ~\/\.claude\/skills\//
			)
		).toBeInTheDocument();
		expect(
			screen.getByText(/npx skills add https:\/\/build-os\.com --skill cold-email/)
		).toBeInTheDocument();
	});

	it('links only the stack skills that have a public page', () => {
		render(BlogPostPage, { props: { data } });

		expect(screen.getByRole('link', { name: 'Landing Page Scorecard Funnel' })).toHaveAttribute(
			'href',
			'/agent-skills/landing-page-scorecard-funnel'
		);
		expect(screen.queryByText(/not-a-public-skill/)).toBeNull();
	});

	it('keeps the Run in BuildOS block off regular blog posts', () => {
		render(BlogPostPage, {
			props: {
				data: {
					...data,
					post: { ...data.post, category: 'philosophy', slug: 'some-essay' }
				} as unknown as PageData
			}
		});

		expect(screen.queryByRole('heading', { name: 'Run this in BuildOS' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'SKILL.md' })).toBeNull();
	});
});
