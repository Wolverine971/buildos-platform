// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { state: {} } }));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn() }));
vi.mock('$lib/services/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: { success: vi.fn(), error: vi.fn() } }));

import { captureEvent } from '$lib/services/posthog';
import { toastService } from '$lib/stores/toast.store';
import ChatResumeLink from './ChatResumeLink.svelte';

describe('Copy chat link', () => {
	const writeText = vi.fn();
	beforeEach(() => {
		writeText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		window.history.replaceState({}, '', '/today?view=week&chat=other#agenda');
	});
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it.each(['global', 'embedded'] as const)(
		'copies the current session on %s surfaces',
		async (surface) => {
			render(ChatResumeLink, { sessionId: 'session', surface });
			await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
			await waitFor(() => expect(toastService.success).toHaveBeenCalledWith('Link copied'));
			const url = new URL(writeText.mock.calls[0]![0]);
			expect(url.pathname + url.search + url.hash).toBe(
				'/today?view=week&chat=session#agenda'
			);
			expect(captureEvent).toHaveBeenCalledWith('chat_link_copied', { surface });
		}
	);

	it('shows an error and does not record a copy when clipboard access fails', async () => {
		writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
		render(ChatResumeLink, { sessionId: 'session' });
		await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
		await waitFor(() =>
			expect(toastService.error).toHaveBeenCalledWith("Couldn't copy that link. Try again.")
		);
		expect(toastService.success).not.toHaveBeenCalled();
		expect(captureEvent).not.toHaveBeenCalled();
	});
});
