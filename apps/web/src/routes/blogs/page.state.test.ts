// apps/web/src/routes/blogs/page.state.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import { BLOG_CATEGORIES, type BlogPost } from '$lib/utils/blog';
import { setPageUrl } from './blogs-page-state.test.svelte';
import BlogsPage from './+page.svelte';

vi.mock('$app/state', async () => {
	const state = await import('./blogs-page-state.test.svelte');
	return { page: state.page };
});

const data = {
	allPosts: [],
	categories: {},
	categoryCounts: {},
	totalPosts: 0
} as unknown as PageData;

function createPost(index: number, category = 'user-guides'): BlogPost {
	return {
		slug: `post-${index}`,
		category,
		title: `Post ${index}`,
		description: `Description for post ${index}`,
		author: 'BuildOS Team',
		date: '2026-08-01',
		lastmod: '2026-08-01',
		changefreq: 'monthly',
		priority: '0.7',
		published: true,
		tags: [],
		readingTime: 5
	};
}

const populatedPosts = Array.from({ length: 15 }, (_, index) => createPost(index + 1));
const populatedData = {
	allPosts: populatedPosts,
	categories: BLOG_CATEGORIES,
	categoryCounts: Object.fromEntries(
		Object.keys(BLOG_CATEGORIES).map((category) => [
			category,
			category === 'user-guides' ? populatedPosts.length : 0
		])
	),
	totalPosts: populatedPosts.length
} as unknown as PageData;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('blogs search state ownership', () => {
	it('allows a local search draft and resets it when the URL query changes', async () => {
		setPageUrl(new URL('https://build-os.com/blogs?q=initial'));
		render(BlogsPage, { props: { data } });
		const search = screen.getByRole('textbox', { name: 'Search articles' }) as HTMLInputElement;

		expect(search.value).toBe('initial');
		await fireEvent.input(search, { target: { value: 'local draft' } });
		expect(search.value).toBe('local draft');

		setPageUrl(new URL('https://build-os.com/blogs?q=navigation'));
		await tick();
		expect(search.value).toBe('navigation');
	});

	it('keeps the mobile category controls collapsed until requested', async () => {
		setPageUrl(new URL('https://build-os.com/blogs'));
		render(BlogsPage, { props: { data: populatedData } });
		const filters = screen.getByRole('button', { name: 'Filters All categories' });

		expect(filters).toHaveAttribute('aria-expanded', 'false');
		expect(document.querySelector('#mobile-blog-filters')).not.toBeInTheDocument();

		await fireEvent.click(filters);
		expect(filters).toHaveAttribute('aria-expanded', 'true');
		expect(document.querySelector('#mobile-blog-filters')).toBeInTheDocument();
	});

	it('caps the default article run and reveals the complete list on request', async () => {
		setPageUrl(new URL('https://build-os.com/blogs'));
		render(BlogsPage, { props: { data: populatedData } });

		expect(screen.queryByRole('heading', { name: 'Post 15' })).not.toBeInTheDocument();
		const showAll = screen.getByRole('button', { name: 'Show all 14 more articles' });
		await fireEvent.click(showAll);

		expect(screen.getByRole('heading', { name: 'Post 15' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show fewer articles' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('keeps the no-results state to one clear action and a level-two heading', async () => {
		setPageUrl(new URL('https://build-os.com/blogs'));
		render(BlogsPage, { props: { data: populatedData } });
		const search = screen.getByRole('textbox', { name: 'Search articles' }) as HTMLInputElement;

		await fireEvent.input(search, { target: { value: 'zzzz-no-match' } });

		expect(
			screen.getByRole('heading', { level: 2, name: 'No matching articles' })
		).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: 'Clear search' })).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
		expect(search.value).toBe('');
	});
});
