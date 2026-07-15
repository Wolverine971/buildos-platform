// apps/web/src/routes/blogs/page.state.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
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
});
