// apps/web/src/lib/components/inbox/InboxCheckIns.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InboxCheckIns from './InboxCheckIns.svelte';
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

describe('InboxCheckIns', () => {
	afterEach(cleanup);

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
		expect(controls.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(
			true
		);
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

		// A folded day can still be marked done in one tap.
		const folded = screen.getByRole('article', { name: 'Oct 6 · 12 tasks' });
		await fireEvent.click(within(folded).getByRole('button', { name: 'Mark all done' }));
		expect(submitAnswers).toHaveBeenCalledWith(
			Array.from({ length: 12 }, (_, index) => ({
				task_id: `2026-10-06-${index}`,
				answer: 'done'
			}))
		);

		await fireEvent.click(show);
		expect(within(folded).getByRole('button', { name: 'Hide' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(row('Oct 6 task 1')).toBeVisible();
	});

	it('saves Done right away and can undo it', async () => {
		const submitAnswers = okSubmit();
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		const done = within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' });
		await fireEvent.click(done);

		expect(submitAnswers).toHaveBeenCalledWith([{ task_id: 'dogs', answer: 'done' }]);
		await waitFor(() => expect(screen.getByText('1 of 2 answered')).toBeInTheDocument());
		expect(done).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByText('Marked done')).toBeInTheDocument();
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 1,
			remaining: 1
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

		expect(submitAnswers).toHaveBeenLastCalledWith([
			{ task_id: 'dogs', answer: 'restore', previous: before }
		]);
		await waitFor(() => expect(screen.getByText('0 of 2 answered')).toBeInTheDocument());
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: -1,
			remaining: 2
		});
	});

	it('puts a task back before saving a different answer', async () => {
		const submitAnswers = okSubmit();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers }
		});
		const controls = within(row('Call Dauntless Dogs'));

		await fireEvent.click(controls.getByRole('button', { name: 'Done' }));
		await waitFor(() => expect(screen.getByText('Marked done')).toBeInTheDocument());
		await fireEvent.click(controls.getByRole('button', { name: 'Drop' }));

		expect(submitAnswers).toHaveBeenLastCalledWith([
			{ task_id: 'dogs', answer: 'restore', previous: before },
			{ task_id: 'dogs', answer: 'drop' }
		]);
		await waitFor(() => expect(screen.getByText('Dropped (archived)')).toBeInTheDocument());
		expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
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
			.find((button) => !button.hasAttribute('aria-pressed'))!;
		await fireEvent.click(confirm);

		expect(submitAnswers).toHaveBeenCalledWith([
			{ task_id: 'dogs', answer: 'move', due_at: dueAtFromDateInput(nextDay) }
		]);
		await waitFor(() =>
			expect(controls.getByRole('button', { name: 'Move' })).toHaveAttribute(
				'aria-pressed',
				'true'
			)
		);
		expect(screen.getByText(/^Moved to /)).toBeInTheDocument();
	});

	it('marks the whole day done with one Undo for the batch', async () => {
		const submitAnswers = okSubmit();
		const onChanged = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers, onChanged }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark all done' }));

		expect(submitAnswers).toHaveBeenCalledWith([
			{ task_id: 'dogs', answer: 'done' },
			{ task_id: 'cindy', answer: 'done' }
		]);
		await waitFor(() => expect(screen.getByText('2 of 2 answered')).toBeInTheDocument());
		expect(screen.getByText('Marked 2 done')).toBeInTheDocument();
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 2,
			remaining: 0
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(submitAnswers).toHaveBeenLastCalledWith([
			{ task_id: 'dogs', answer: 'restore', previous: before },
			{ task_id: 'cindy', answer: 'restore', previous: before }
		]);
	});

	it('keeps the task unanswered and says why when saving fails', async () => {
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
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers }
		});
		const done = within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' });

		await fireEvent.click(done);

		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent(
				'You do not have write access to this project.'
			)
		);
		expect(done).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByText('0 of 2 answered')).toBeInTheDocument();
	});

	it('hands the unanswered tasks to "Tell me how it went"', async () => {
		const onTalk = vi.fn();
		render(InboxCheckIns, {
			props: { project: project(), today: '2026-10-29', submitAnswers: okSubmit(), onTalk }
		});

		await fireEvent.click(
			within(row('Call Dauntless Dogs')).getByRole('button', { name: 'Done' })
		);
		await waitFor(() => expect(screen.getByText('1 of 2 answered')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Tell me how it went' }));

		expect(onTalk).toHaveBeenCalledWith(PROJECT_ID, ['cindy']);
	});

	it('asks a quiet project "Still on?" once, and can pause it with Undo', async () => {
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

		expect(submitAnswers).toHaveBeenCalledWith([
			{ project_id: PROJECT_ID, project_answer: 'pause' }
		]);
		await waitFor(() =>
			expect(screen.getByRole('status')).toHaveTextContent(
				'Paused BuildOS CEO Training Sprint.'
			)
		);
		expect(onChanged).toHaveBeenLastCalledWith({
			projectId: PROJECT_ID,
			handled: 1,
			remaining: 0
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(submitAnswers).toHaveBeenLastCalledWith([
			{ project_id: PROJECT_ID, project_answer: 'restore', previous_state: 'active' }
		]);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Pause it/ })).toBeInTheDocument()
		);
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
