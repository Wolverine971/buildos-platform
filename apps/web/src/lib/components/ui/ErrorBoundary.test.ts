// apps/web/src/lib/components/ui/ErrorBoundary.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { reportClientError } = vi.hoisted(() => ({ reportClientError: vi.fn(async () => {}) }));
vi.mock('$lib/utils/client-error-reporting', () => ({ reportClientError }));
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false }));

import Harness from './ErrorBoundary.test-harness.svelte';

afterEach(() => {
	cleanup();
	reportClientError.mockClear();
	vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
	it('swaps a crashing child for the inline card, keeps siblings, and reports', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		render(Harness, { props: { shouldFail: () => true } });

		expect(await screen.findByText("This part didn't load.")).toBeTruthy();
		expect(screen.getByText('Sibling stays')).toBeTruthy();
		expect(reportClientError).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'runtime',
				metadata: { source: 'svelte:boundary', boundary: 'test-area', itemId: 'item-1' }
			})
		);
	});

	it('re-renders the children on Try again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let failing = true;
		render(Harness, { props: { shouldFail: () => failing } });
		await screen.findByText("This part didn't load.");

		failing = false;
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(await screen.findByText('Loaded content')).toBeTruthy();
		expect(screen.queryByText("This part didn't load.")).toBeNull();
	});

	it('tries again when resetKey changes (e.g. the user navigates)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let failing = true;
		const view = render(Harness, { props: { shouldFail: () => failing, resetKey: '/a' } });
		await screen.findByText("This part didn't load.");

		failing = false;
		await view.rerender({ shouldFail: () => failing, resetKey: '/b' });

		expect(await screen.findByText('Loaded content')).toBeTruthy();
	});

	it('renders children normally when nothing throws', async () => {
		render(Harness, { props: { shouldFail: () => false } });
		expect(await screen.findByText('Loaded content')).toBeTruthy();
		expect(reportClientError).not.toHaveBeenCalled();
	});
});
