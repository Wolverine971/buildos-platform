// apps/web/src/lib/components/inbox/InboxCheckIns.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InboxCheckIns from './InboxCheckIns.svelte';
import { clearedPile, configureClearedPileForTests } from '$lib/stores/inbox-cleared-pile.svelte';
import { dueAtFromDateInput, nextWeekday, toDateInputValue } from './check-ins';
import type {
	CheckInAnswer,
	CheckInAnswerResult,
	CheckInProject,
	CheckInTaskSnapshot
} from '$lib/types/inbox-check-ins';

const PROJECT_ID = 'project-wayne';
const DUE = '2026-10-07T13:00:00+00:00';

function project(overrides: Partial<CheckInProject> = {}): CheckInProject {
	return {
		project_id: PROJECT_ID,
		project_name: 'Wayne Strategies',
		project_state: 'active',
		project_updated_at: '2026-10-20T00:00:00Z',
		last_touched_at: '2026-10-28T00:00:00Z',
		last_touched_date: '2026-10-28',
		quiet: false,
		overdue_count: 2,
		oldest_due_date: '2026-10-07',
		newest_due_date: '2026-10-07',
		truncated: false,
		groups: [
			{
				key: `${PROJECT_ID}:2026-10-07`,
				due_date: '2026-10-07',
				label: 'Oct 7',
				task_count: 2,
				tasks: [
					{ id: 'dogs', title: 'Call Dauntless Dogs', state_key: 'todo', due_at: DUE },
					{
						id: 'cindy',
						title: "Walk in: Cindy's Hot Shots",
						state_key: 'todo',
						due_at: DUE
					}
				]
			}
		],
		...overrides
	};
}

const before: CheckInTaskSnapshot = { state_key: 'todo', due_at: DUE, archived: false };

/** Answers every task answer with success (previous = the original task). */
function okSubmit() {
	return vi.fn(
		async (answers: CheckInAnswer[]): Promise<CheckInAnswerResult[]> =>
			answers.map((answer) =>
				'task_id' in answer
					? {
							kind: 'task',
							task_id: answer.task_id,
							answer: answer.answer,
							ok: true,
							changed: true,
							task: {
								state_key: answer.answer === 'done' ? 'done' : 'todo',
								due_at: answer.due_at ?? DUE,
								archived: answer.answer === 'drop'
							},
							previous: before
						}
					: {
							kind: 'project',
							project_id: answer.project_id,
							project_answer: answer.project_answer,
							ok: true,
							changed: true,
							state_key: answer.project_answer === 'pause' ? 'paused' : 'active',
							previous_state: 'active'
						}
			)
	);
}

function row(title: string) {
	return screen.getByRole('group', { name: `Did "${title}" happen?` });
}

function queryRow(title: string) {
	return screen.queryByRole('group', { name: `Did "${title}" happen?` });
}

describe('InboxCheckIns', () => {
	// Saves go out at once unless a test holds them for Undo.
	beforeEach(() => configureClearedPileForTests({ holdMs: 0 }));
	afterEach(() => {
		cleanup();
		configureClearedPileForTests();
	});

	it('shows one card per due day with Done / Move / Drop per task', () => {
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers: okSubmit() }
		});

		expect(screen.getByText('Did this happen?')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Oct 7 · 2 tasks' })).toBeInTheDocument();
		expect(screen.getByText('22 days ago, none marked yet')).toBeInTheDocument();
		expect(screen.getByText('0 of 2 answered')).toBeInTheDocument();
		const controls = within(row('Call Dauntless Dogs')).getAllByRole('button');
		expect(controls.map((button) => button.textContent?.trim())).toEqual([
			'Done',
			'Move',
			'Drop'
		]);
	});

	it('keeps the newest days open and folds older days to one line', async () => {
		const day = (date: string, label: string, count: number) => ({
			key: `${PROJECT_ID}:${date}`,
			due_date: date,
			label,
			task_count: count,
			tasks: Array.from({ length: count }, (_, index) => ({
				id: `${date}-${index}`,
				title: `${label} task ${index + 1}`,
				state_key: 'todo',
				due_at: `${date}T13:00:00+00:00`
			}))
		});
		const submitAnswers = okSubmit();
		render(InboxCheckIns, {
			props: {
				project: project({
					overdue_count: 18,
					groups: [
						day('2026-10-12', 'Oct 12', 1),
						day('2026-10-08', 'Oct 8', 5),
						day('2026-10-06', 'Oct 6', 12)
					]
				}),
				today: '2026-10-29',
				submitAnswers
			}
		});

		// Oct 12 + Oct 8 fit the budget; Oct 6 folds to a preview line.
		expect(row('Oct 8 task 1')).toBeVisible();
		expect(screen.getByText('Oct 6 task 1 · Oct 6 task 2 · +10 more')).toBeInTheDocument();
		const show = screen.getByRole('button', { name: 'Show 12 tasks' });
		expect(show).toHaveAttribute('aria-expanded', 'false');
		expect(
			screen.getByRole('group', { name: 'Did "Oct 6 task 1" happen?', hidden: true })
		).not.toBeVisible();

		await fireEvent.click(show);
		const folded = screen.getByRole('article', { name: 'Oct 6 · 12 tasks' });
		expect(within(folded).getByRole('button', { name: 'Hide' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(row('Oct 6 task 1')).toBeVisible();

		// A whole day can be marked done in one tap; it leaves the list at once.
		await fireEvent.click(within(folded).getByRole('button', { name: 'Mark all done' }));
		expect(screen.queryByRole('article', { name: 'Oct 6 · 12 tasks' })).not.toBeInTheDocument();
		await waitFor(() =>
			expect(submitAnswers).toHaveBeenCalledWith(
				Array.from({ length: 12 }, (_, index) => ({
					task_id: `2026-10-06-${index}`,
					answer: 'done'
				}))
			)
		);
	});

	it('takes an answered task off the list at once and saves it in the background', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const ok = okSubmit();
		const submitAnswers = vi.fn(async (answers: CheckInAnswer[]) => {
			await gate;
			return ok(answers);
		});
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		await fireEvent.click(
			within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' })
		);

		// Gone before the save finishes; the rest of the card stays usable.
		expect(queryRow('Call Dauntless Dogs')).not.toBeInTheDocument();
		expect(
			within(row("Walk in: Cindy's Hot Shots")).getByRole('button', { name: 'Done' })
		).toBeEnabled();
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 1,
			remaining: 1
		});
		const [entry] = clearedPile.entries;
		expect(entry).toMatchObject({
			title: 'Call Dauntless Dogs',
			label: 'Marked done',
			context: 'Wayne Strategies'
		});

		await waitFor(() =>
			expect(submitAnswers).toHaveBeenCalledWith([{ task_id: 'dogs', answer: 'done' }])
		);
		release();
		await waitFor(() => expect(clearedPile.entries[0]?.status).toBe('done'));
		expect(queryRow('Call Dauntless Dogs')).not.toBeInTheDocument();
	});

	it('puts a task back when its answer is undone before it saves', async () => {
		configureClearedPileForTests({ holdMs: 60_000 });
		const submitAnswers = okSubmit();
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		await fireEvent.click(
			within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Drop' })
		);
		expect(queryRow('Call Dauntless Dogs')).not.toBeInTheDocument();
		expect(clearedPile.entries[0]).toMatchObject({
			status: 'holding',
			label: 'Dropped (archived)'
		});

		expect(clearedPile.undoLatest()).toBe(true);
		await waitFor(() => expect(row('Call Dauntless Dogs')).toBeInTheDocument());
		expect(submitAnswers).not.toHaveBeenCalled();
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: -1,
			remaining: 2
		});
	});

	it('moves a task to the next weekday by default', async () => {
		const submitAnswers = okSubmit();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers }
		});
		const controls = within(row('Call Dauntless Dogs'));

		await fireEvent.click(controls.getByRole('button', { name: 'Move' }));
		const picker = screen.getByLabelText('Move to') as HTMLInputElement;
		const nextDay = toDateInputValue(nextWeekday());
		expect(picker.value).toBe(nextDay);
		expect(controls.getByRole('button', { name: 'Move' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);

		const confirm = screen
			.getAllByRole('button', { name: 'Move' })
			.find((button) => !button.hasAttribute('aria-expanded'))!;
		await fireEvent.click(confirm);

		expect(queryRow('Call Dauntless Dogs')).not.toBeInTheDocument();
		expect(clearedPile.entries[0]?.label).toMatch(/^Moved to /);
		await waitFor(() =>
			expect(submitAnswers).toHaveBeenCalledWith([
				{ task_id: 'dogs', answer: 'move', due_at: dueAtFromDateInput(nextDay) }
			])
		);
	});

	it('marks the whole day done as one answer in the pile', async () => {
		const submitAnswers = okSubmit();
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark all done' }));

		expect(screen.getByRole('status')).toHaveTextContent('All answered');
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 2,
			remaining: 0
		});
		expect(clearedPile.entries).toHaveLength(1);
		expect(clearedPile.entries[0]).toMatchObject({ label: 'Marked all done', count: 2 });
		await waitFor(() =>
			expect(submitAnswers).toHaveBeenCalledWith([
				{ task_id: 'dogs', answer: 'done' },
				{ task_id: 'cindy', answer: 'done' }
			])
		);
	});

	it('puts the task back and says why when saving fails', async () => {
		const submitAnswers = vi.fn(
			async (): Promise<CheckInAnswerResult[]> => [
				{
					kind: 'task',
					task_id: 'dogs',
					answer: 'done',
					ok: false,
					status: 403,
					error: 'You do not have write access to this project.'
				}
			]
		);
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		await fireEvent.click(
			within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' })
		);

		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent(
				"You do not have write access to this project. It's back on your list."
			)
		);
		expect(row('Call Dauntless Dogs')).toBeInTheDocument();
		expect(clearedPile.entries[0]?.status).toBe('failed');
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: -1,
			remaining: 2
		});
	});

	it('hands the unanswered tasks to "Tell me how it went"', async () => {
		const onTalk = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers: okSubmit(), onTalk }
		});

		await fireEvent.click(
			within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Tell me how it went' }));

		expect(onTalk).toHaveBeenCalledWith(PROJECT_ID, ['cindy']);
	});

	it('asks a quiet project "Still on?" once, and pauses it from the pile', async () => {
		const submitAnswers = okSubmit();
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: {
				project: project({
					project_name: 'BuildOS CEO Training Sprint',
					quiet: true,
					overdue_count: 12,
					oldest_due_date: '2026-07-10',
					last_touched_date: '2026-08-11'
				}),
				today: '2026-10-29',
				submitAnswers,
				onChanged
			}
		});

		expect(screen.getByText('Still on?')).toBeInTheDocument();
		expect(
			screen.getByText(
				'12 tasks have been overdue since Jul 10 and nothing has changed since Aug 11.'
			)
		).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: /Oct 7/ })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /Pause it/ }));

		expect(screen.getByRole('status')).toHaveTextContent('Answered.');
		expect(clearedPile.entries[0]).toMatchObject({
			title: 'BuildOS CEO Training Sprint',
			label: 'Paused'
		});
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 1,
			remaining: 0
		});
		await waitFor(() =>
			expect(submitAnswers).toHaveBeenCalledWith([
				{ project_id: PROJECT_ID, project_answer: 'pause' }
			])
		);
	});

	it('brings "Still on?" back when the pause is undone in time', async () => {
		configureClearedPileForTests({ holdMs: 60_000 });
		const submitAnswers = okSubmit();
		render(InboxCheckIns, {
			props: {
				project: project({ quiet: true }),
				today: '2026-10-29',
				submitAnswers
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Pause it/ }));
		expect(screen.queryByRole('button', { name: /Pause it/ })).not.toBeInTheDocument();

		clearedPile.undoLatest();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Pause it/ })).toBeInTheDocument()
		);
		expect(submitAnswers).not.toHaveBeenCalled();
	});

	it('expands a quiet project to its tasks on "Still on"', async () => {
		render(InboxCheckIns, {
			props: {
				project: project({ quiet: true }),
				today: '2026-10-29',
				submitAnswers: okSubmit()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Still on/ }));

		expect(screen.getByText('Did this happen?')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Oct 7 · 2 tasks' })).toBeInTheDocument();
	});
});
