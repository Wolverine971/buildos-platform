// apps/web/src/lib/components/knowledge/KnowledgeCleanup.test.ts
// @vitest-environment jsdom
//
// Clean up, driven the way it is used: one key per card. What would go wrong on screen:
//   - a key does the wrong thing, or fires while typing in the "Same as…" search
//   - Undo doesn't bring the card back, or the answer was already saved
//   - closing loses the last answer
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import KnowledgeCleanup from './KnowledgeCleanup.svelte';
import {
	knowledgeApi,
	type KnowledgeCleanupEntry,
	type KnowledgeCleanupQueue
} from './knowledge-client';
import { whereApi } from './where-types';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function entry(name: string, over: Partial<KnowledgeCleanupEntry> = {}): KnowledgeCleanupEntry {
	return {
		id: name,
		kind: 'org',
		name,
		summary: null,
		sources: ['work'],
		circle: null,
		tasks: 1,
		documents: 0,
		people: 0,
		people_names: [],
		details: 0,
		created_at: '2026-11-01T00:00:00Z',
		reasons: ['Named in one task', 'No people attached'],
		similar: [],
		...over
	};
}

function mount() {
	const queue: KnowledgeCleanupQueue = {
		entries: [
			entry('Murtech, Inc', {
				similar: [
					{
						id: 'Murtech',
						name: 'Murtech',
						rule: 'ending',
						reason: 'Same name, one with a company ending',
						score: 0.9,
						sources: ['work'],
						records: 3,
						people: 3
					}
				]
			}),
			entry('Desk'),
			entry('LinkedIn Co', {
				sources: ['linkedin'],
				tasks: 0,
				people: 1,
				people_names: ['Maya Chen']
			})
		],
		remaining: 3,
		by_source: { work: 2, linkedin: 1 }
	};
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	const api = {
		queue: vi
			.spyOn(knowledgeApi, 'cleanupQueue')
			.mockResolvedValueOnce(queue)
			.mockResolvedValue({ entries: [], remaining: 0, by_source: queue.by_source }),
		where: vi.spyOn(whereApi, 'forEntities').mockImplementation(async (ids) =>
			Object.fromEntries(
				ids.map((id) => [
					id,
					{
						projects: [],
						documents: [],
						tasks:
							id === 'Desk'
								? [
										{
											id: 'task-1',
											kind: 'task' as const,
											title: 'Set up the office',
											project_id: 'p1',
											project_name: 'Home',
											done: false,
											quote: 'Order the standing desk this week.'
										}
									]
								: []
					}
				])
			)
		),
		remove: vi.spyOn(knowledgeApi, 'removeMany').mockImplementation(async (ids) => ({ ids })),
		update: vi.spyOn(knowledgeApi, 'update').mockResolvedValue({ ok: true }),
		merge: vi.spyOn(knowledgeApi, 'merge').mockResolvedValue({}),
		list: vi.spyOn(knowledgeApi, 'list')
	};
	const onClose = vi.fn();
	render(KnowledgeCleanup, { onClose });
	return { api, onClose };
}

const card = () => screen.getByRole('article').getAttribute('aria-label');
const press = (key: string, code = `Key${key.toUpperCase()}`) =>
	fireEvent.keyDown(window, { key, code });

it('answers a card per key, undoes the last one, and saves everything on Done', async () => {
	const { api, onClose } = mount();
	await waitFor(() => expect(card()).toBe('Murtech, Inc'));
	expect(screen.getByText('Same name, one with a company ending')).toBeTruthy();

	// 1 = same company as the first look-alike; the fuller entry (Murtech) survives.
	await press('1', 'Digit1');
	expect(card()).toBe('Desk');
	expect(screen.getByRole('status')).toHaveTextContent('Merged “Murtech, Inc” into “Murtech”');
	expect(api.merge).not.toHaveBeenCalled();

	// Z takes it back before anything is saved.
	await press('z');
	expect(card()).toBe('Murtech, Inc');
	expect(screen.queryByRole('status')).toBeNull();

	await press('1', 'Digit1');
	// The card shows the sentence the name was read from.
	expect(await screen.findByText('“Order the standing desk this week.”')).toBeTruthy();
	await press('x');
	expect(card()).toBe('LinkedIn Co');
	expect(screen.getByText('Maya Chen')).toBeTruthy();
	await press('k');

	await fireEvent.click(screen.getAllByRole('button', { name: /Done/ })[0]!);
	await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
	expect(api.merge).toHaveBeenCalledWith('Murtech', 'Murtech, Inc');
	expect(api.remove).toHaveBeenCalledWith(['Desk']);
	expect(api.update).toHaveBeenCalledWith('LinkedIn Co', { circle: 'inner' });
	expect(api.merge.mock.invocationCallOrder[0]!).toBeLessThan(
		api.remove.mock.invocationCallOrder[0]!
	);
});

it('does not treat typing in the "Same as…" search as answers', async () => {
	const { api, onClose } = mount();
	await waitFor(() => expect(card()).toBe('Murtech, Inc'));
	api.list.mockResolvedValue({ entities: [], total: 0, counts: {}, known_count: 0 });

	await press('s');
	const search = screen.getByPlaceholderText('Search your organizations');
	await fireEvent.keyDown(search, { key: 'x', code: 'KeyX' });
	await fireEvent.keyDown(search, { key: 'k', code: 'KeyK' });
	expect(card()).toBe('Murtech, Inc');
	// Escape closes the search, not Clean up.
	await fireEvent.keyDown(search, { key: 'Escape' });
	expect(screen.queryByPlaceholderText('Search your organizations')).toBeNull();
	expect(onClose).not.toHaveBeenCalled();

	// Skip and Back move without answering; closing then reports nothing changed.
	await press('ArrowRight', 'ArrowRight');
	expect(card()).toBe('Desk');
	await press('ArrowLeft', 'ArrowLeft');
	expect(card()).toBe('Murtech, Inc');
	await fireEvent.click(screen.getAllByRole('button', { name: /Done/ })[0]!);
	await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
	expect(api.remove).not.toHaveBeenCalled();
	expect(api.update).not.toHaveBeenCalled();
});
