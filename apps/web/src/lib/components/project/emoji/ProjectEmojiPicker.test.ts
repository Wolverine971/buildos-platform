// apps/web/src/lib/components/project/emoji/ProjectEmojiPicker.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectEmojiPicker from './ProjectEmojiPicker.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function renderPicker(onSaved = vi.fn(), onClose = vi.fn()) {
	render(ProjectEmojiPicker, {
		isOpen: true,
		projectId: PROJECT_ID,
		projectName: 'Beyond Exit Planning',
		emoji: { glyphs: ['📖', '🔚'], source: 'llm', suggestions: ['📖', '📘', '🚪'] },
		onClose,
		onSaved
	});
	return { onSaved, onClose };
}

describe('ProjectEmojiPicker', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					data: { emoji: { glyphs: ['📖', '🚪'], source: 'user', suggestions: ['📖'] } }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		fetchMock.mockReset();
	});

	it('swaps the second emoji for a suggestion and saves the pair', async () => {
		const { onSaved, onClose } = renderPicker();
		await waitFor(() => expect(screen.getByRole('tab', { name: 'Objects' })).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: /^Second emoji: end arrow/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'door' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe(`/api/onto/projects/${PROJECT_ID}/emoji`);
		expect(JSON.parse(init.body)).toEqual({ glyphs: ['📖', '🚪'] });
		expect(onClose).toHaveBeenCalled();
	});

	it('finds emoji by name and can go back to initials', async () => {
		renderPicker();
		await waitFor(() => expect(screen.getByRole('tab', { name: 'Objects' })).toBeTruthy());

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search emoji by name' }), {
			target: { value: 'money bag' }
		});
		expect(screen.getByRole('button', { name: 'money bag' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Use initials' }));
		expect(screen.getByText('BE')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ glyphs: [] });
	});
});
