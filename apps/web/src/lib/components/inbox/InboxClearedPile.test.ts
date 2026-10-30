// apps/web/src/lib/components/inbox/InboxClearedPile.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InboxClearedPile from './InboxClearedPile.svelte';
import {
	clearedPile,
	configureClearedPileForTests,
	type PileOutcome
} from '$lib/stores/inbox-cleared-pile.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe('InboxClearedPile', () => {
	beforeEach(() => {
		configureClearedPileForTests({ holdMs: 60_000 });
		// jsdom has no Web Animations; Svelte's fly transitions need a finishing stub. It stays
		// in place after the tests (this file has its own jsdom), since an outro can finish late.
		Element.prototype.animate = vi.fn(() => {
			let finish: ((event: AnimationPlaybackEvent) => void) | null = null;
			return {
				cancel: vi.fn(),
				currentTime: 0,
				finished: Promise.resolve(),
				playState: 'finished',
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				get onfinish() {
					return finish;
				},
				set onfinish(handler: ((event: AnimationPlaybackEvent) => void) | null) {
					finish = handler;
					if (handler) setTimeout(() => handler({} as AnimationPlaybackEvent), 0);
				}
			} as unknown as Animation;
		});
	});

	afterEach(() => {
		cleanup();
		configureClearedPileForTests();
	});

	it('stays out of the way until something is answered', () => {
		render(InboxClearedPile);
		expect(screen.queryByRole('region', { name: 'Cleared from your inbox' })).toBeNull();
	});

	it('counts an answer as cleared the moment it is given, with Undo while it waits', async () => {
		const run = vi.fn(async (): Promise<PileOutcome> => ({}));
		render(InboxClearedPile);
		clearedPile.add({
			title: 'Move Brand Direction',
			label: 'Make this change',
			context: 'Wayne Strategies',
			keys: ['brand'],
			lane: 'wayne',
			run
		});

		const pile = await screen.findByRole('region', { name: 'Cleared from your inbox' });
		expect(pile).toHaveTextContent('Cleared 1 · 1 saving');
		expect(pile).toHaveTextContent('Move Brand Direction');
		expect(pile).toHaveTextContent('Make this change · Wayne Strategies');
		// Above the open inbox: moved to <body> as a modal root.
		expect(pile.parentElement).toBe(document.body);
		expect(pile).toHaveClass('modal-root');

		await fireEvent.click(screen.getByRole('button', { name: 'Undo: Move Brand Direction' }));
		await waitFor(() =>
			expect(screen.queryByRole('region', { name: 'Cleared from your inbox' })).toBeNull()
		);
		expect(run).not.toHaveBeenCalled();
	});

	it('undoes the newest answer with Cmd+Z, but not while typing', async () => {
		render(InboxClearedPile);
		clearedPile.add({
			title: 'Archive AI Guy Pitches',
			label: 'Make this change',
			keys: ['ai'],
			lane: 'wayne',
			run: async () => ({})
		});
		await screen.findByRole('region', { name: 'Cleared from your inbox' });

		const input = document.createElement('input');
		document.body.appendChild(input);
		await fireEvent.keyDown(input, { key: 'z', metaKey: true });
		expect(clearedPile.entries).toHaveLength(1);
		input.remove();

		await fireEvent.keyDown(window, { key: 'z', metaKey: true });
		expect(clearedPile.entries).toHaveLength(0);
	});

	it('shows saving, then done, and what came back', async () => {
		configureClearedPileForTests({ holdMs: 0 });
		const slow = deferred<PileOutcome>();
		render(InboxClearedPile);
		clearedPile.add({
			title: '2 tidy-ups',
			label: 'Applied',
			keys: ['a', 'b'],
			lane: 'wayne',
			run: () => slow.promise
		});

		const pile = await screen.findByRole('region', { name: 'Cleared from your inbox' });
		await waitFor(() => expect(pile).toHaveTextContent('Saving…'));

		slow.resolve({ returnedKeys: ['b'], detail: "Locked. It's back on your card." });
		await waitFor(() => expect(pile).toHaveTextContent('Cleared 1 · 1 back on your card'));
		expect(pile).toHaveTextContent("Locked. It's back on your card.");

		await fireEvent.click(screen.getByRole('button', { name: 'Clear the list' }));
		await waitFor(() =>
			expect(screen.queryByRole('region', { name: 'Cleared from your inbox' })).toBeNull()
		);
	});

	it('opens the whole list, newest first', async () => {
		render(InboxClearedPile);
		for (const title of ['First', 'Second', 'Third']) {
			clearedPile.add({
				title,
				label: 'Done',
				keys: [title],
				lane: 'l',
				run: async () => ({})
			});
		}
		const pile = await screen.findByRole('region', { name: 'Cleared from your inbox' });
		expect(pile).toHaveTextContent('Cleared 3 · 3 saving');

		await fireEvent.click(screen.getByRole('button', { name: /Cleared 3/ }));
		const rows = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
		expect(rows.map((text) => text.match(/First|Second|Third/)?.[0])).toEqual([
			'Third',
			'Second',
			'First'
		]);
	});
});
