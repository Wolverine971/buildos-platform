// apps/web/src/routes/error-sign-in.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

const LINK = '/projects/p-1?tab=tasks&chat=12345678-1234-4321-9876-123456789abc';
const { pageState, goto } = vi.hoisted(() => ({
	pageState: {
		status: 401,
		error: { message: 'Unauthorized' },
		url: new URL(
			'https://build-os.com/projects/p-1?tab=tasks&chat=12345678-1234-4321-9876-123456789abc'
		)
	},
	goto: vi.fn()
}));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/stores', () => ({ page: readable(pageState) }));
vi.mock('$app/navigation', () => ({ goto }));

import RootError from './+error.svelte';
import ProjectsError from './projects/+error.svelte';

describe('error page sign-in keeps the link', () => {
	afterEach(() => {
		cleanup();
		goto.mockClear();
	});

	it('root error page signs in back to the page and its query', async () => {
		render(RootError);
		await fireEvent.click(screen.getByRole('button', { name: /sign in to buildos/i }));
		expect(goto).toHaveBeenCalledWith(`/auth/login?redirect=${encodeURIComponent(LINK)}`);
	});

	it('projects error page signs in back to the page and its query', async () => {
		render(ProjectsError);
		await fireEvent.click(screen.getByRole('button', { name: /log in/i }));
		expect(goto).toHaveBeenCalledWith(`/auth/login?redirect=${encodeURIComponent(LINK)}`);
	});
});
