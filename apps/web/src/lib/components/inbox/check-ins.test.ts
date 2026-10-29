// apps/web/src/lib/components/inbox/check-ins.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	checkInTaskCount,
	civilDaysBetween,
	dueAtFromDateInput,
	fetchCheckIns,
	formatCheckInDayLabel,
	formatCheckInGroupAge,
	formatCheckInGroupTitle,
	formatCheckInTally,
	formatMoveDate,
	formatQuietDetail,
	nextWeekday,
	postCheckInAnswers,
	requestCheckInChat,
	toDateInputValue
} from './check-ins';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('check-in dates', () => {
	it('labels a due day, with the year only when it is not this year', () => {
		expect(formatCheckInDayLabel('2026-10-07', '2026-10-29')).toBe('Oct 7');
		expect(formatCheckInDayLabel('2025-12-03', '2026-10-29')).toBe('Dec 3, 2025');
	});

	it('counts days between civil dates', () => {
		expect(civilDaysBetween('2026-10-07', '2026-10-29')).toBe(22);
		expect(civilDaysBetween('2026-10-29', '2026-10-29')).toBe(0);
		expect(civilDaysBetween('nope', '2026-10-29')).toBeNull();
	});

	it('defaults a move to the next weekday', () => {
		// Thursday → Friday, Friday → Monday, Saturday → Monday.
		expect(toDateInputValue(nextWeekday(new Date(2026, 9, 29, 15)))).toBe('2026-10-30');
		expect(toDateInputValue(nextWeekday(new Date(2026, 9, 30, 15)))).toBe('2026-11-02');
		expect(toDateInputValue(nextWeekday(new Date(2026, 9, 31, 15)))).toBe('2026-11-02');
	});

	it('sends a picked date as 9 AM local time', () => {
		const iso = dueAtFromDateInput('2026-11-02');
		expect(iso).toBe(new Date(2026, 10, 2, 9, 0, 0, 0).toISOString());
		expect(dueAtFromDateInput('')).toBeNull();
		expect(formatMoveDate('2026-11-02')).toBe('Mon, Nov 2');
	});
});

describe('check-in copy', () => {
	it('titles a card by day and size', () => {
		expect(formatCheckInGroupTitle({ label: 'Oct 7', task_count: 10 })).toBe(
			'Oct 7 · 10 tasks'
		);
		expect(formatCheckInGroupTitle({ label: 'Oct 7', task_count: 1 })).toBe('Oct 7 · 1 task');
	});

	it('says how old the card is and how much is left', () => {
		expect(formatCheckInGroupAge('2026-10-07', '2026-10-29', 0, 10)).toBe(
			'22 days ago, none marked yet'
		);
		expect(formatCheckInGroupAge('2026-10-28', '2026-10-29', 3, 10)).toBe('Yesterday, 7 left');
		expect(formatCheckInGroupAge('2026-10-07', '2026-10-29', 10, 10)).toBe(
			'22 days ago, all answered'
		);
		expect(formatCheckInTally(3, 10)).toBe('3 of 10 answered');
	});

	it('describes a quiet project in one sentence', () => {
		expect(
			formatQuietDetail(
				{
					overdue_count: 12,
					oldest_due_date: '2026-07-10',
					last_touched_date: '2026-08-11'
				},
				'2026-10-29'
			)
		).toBe('12 tasks have been overdue since Jul 10 and nothing has changed since Aug 11.');
		expect(
			formatQuietDetail(
				{ overdue_count: 1, oldest_due_date: '2026-07-10', last_touched_date: null },
				'2026-10-29'
			)
		).toBe(
			'1 task has been overdue since Jul 10 and nothing here has changed in over six weeks.'
		);
	});

	it('counts the tasks shown on a project’s cards', () => {
		expect(
			checkInTaskCount({
				groups: [
					{
						key: 'a',
						due_date: '2026-10-13',
						label: 'Oct 13',
						task_count: 1,
						tasks: [{ id: '1', title: 'a', state_key: 'todo', due_at: 'x' }]
					},
					{
						key: 'b',
						due_date: '2026-10-07',
						label: 'Oct 7',
						task_count: 2,
						tasks: [
							{ id: '2', title: 'b', state_key: 'todo', due_at: 'x' },
							{ id: '3', title: 'c', state_key: 'todo', due_at: 'x' }
						]
					}
				]
			})
		).toBe(3);
	});
});

describe('check-in client', () => {
	it('loads check-ins for the viewer’s time zone', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ success: true, data: { projects: [], today: '2026-10-29' } })
			);
		const payload = await fetchCheckIns('America/New_York', fetchFn as any);
		expect(fetchFn).toHaveBeenCalledWith('/api/inbox/check-ins?tz=America%2FNew_York', {
			headers: { accept: 'application/json' }
		});
		expect(payload.today).toBe('2026-10-29');
	});

	it('posts answers and returns per-answer results', async () => {
		const results = [{ kind: 'task', task_id: 't', answer: 'done', ok: true }];
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ success: true, data: { results, changed: 1, failed: 0 } })
			);
		await expect(
			postCheckInAnswers([{ task_id: 't', answer: 'done' }], fetchFn as any)
		).resolves.toEqual(results);
		expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({
			answers: [{ task_id: 't', answer: 'done' }]
		});
	});

	it('surfaces the server error message', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				jsonResponse({ success: false, error: 'answers must be a non-empty array' }, 400)
			);
		await expect(postCheckInAnswers([], fetchFn as any)).rejects.toThrow(
			'answers must be a non-empty array'
		);
	});

	it('asks for a check-in chat', async () => {
		const fetchFn = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: {
					chat_session_id: 's',
					context_type: 'project',
					entity_id: 'p',
					created: true
				}
			})
		);
		const result = await requestCheckInChat(
			{ projectId: 'p', taskIds: ['t1'], timeZone: 'America/New_York' },
			fetchFn as any
		);
		expect(result.chat_session_id).toBe('s');
		expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({
			project_id: 'p',
			task_ids: ['t1'],
			tz: 'America/New_York'
		});
	});
});
