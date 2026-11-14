// apps/mobile/tests/today-picks.test.ts
import type {
	TodayTask,
	TodayTaskBucket,
	TodayWaitingItem,
	WhatChangedEntry
} from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	buildDayDraft,
	dueWeekday,
	nudgeDraft,
	pickTodayFocus,
	seenYouLine,
	snoozeDueAt,
	summarizeDay,
	taskMeta,
	timeOfDay
} from '@/components/today/picks';

function task(id: string, bucket: TodayTaskBucket, extra: Partial<TodayTask> = {}): TodayTask {
	return {
		id,
		project_id: extra.project_id ?? `p-${id}`,
		project_name: extra.project_name ?? `Project ${id}`,
		title: extra.title ?? id,
		description: null,
		state_key: 'todo',
		due_at: null,
		start_at: null,
		priority: null,
		updated_at: '',
		bucket,
		...extra
	};
}

function waiting(id: string, extra: Partial<TodayWaitingItem> = {}): TodayWaitingItem {
	return {
		id,
		direction: 'on_you',
		who: 'Logan',
		who_kind: 'person',
		what: `Reply ${id}`,
		project_id: null,
		project_name: null,
		task_id: null,
		since: '2026-11-03',
		...extra
	};
}

const noWeekday = () => null;
const pick = (input: Partial<Parameters<typeof pickTodayFocus>[0]>) =>
	pickTodayFocus({ tasks: [], waiting: [], doneIds: new Set(), weekdayOf: noWeekday, ...input });

describe('pickTodayFocus', () => {
	it('puts the soonest due first, then what starts today, then who is waiting', () => {
		const picks = pick({
			tasks: [
				task('later', 'due_soon', { due_in_days: 6 }),
				task('start', 'starts_today'),
				task('tomorrow', 'due_soon', { due_in_days: 1 })
			],
			waiting: [waiting('w1')]
		});
		expect(picks.map((p) => p.key)).toEqual(['task:tomorrow', 'task:start', 'waiting:w1']);
		expect(picks[0]).toMatchObject({ kind: 'due', why: 'Due tomorrow.' });
		expect(picks[2]).toMatchObject({
			kind: 'waiting',
			why: 'Logan is waiting on you since Nov 3.'
		});
	});

	it('takes at most one pick per project, three in all', () => {
		const picks = pick({
			tasks: [
				task('a', 'due_today', { due_in_days: 0, project_id: 'p1' }),
				task('b', 'due_today', { due_in_days: 0, project_id: 'p1' }),
				task('c', 'new', { created_by_you: true }),
				task('d', 'new'),
				task('e', 'in_progress')
			]
		});
		expect(picks.map((p) => p.key)).toEqual(['task:a', 'task:c', 'task:d']);
		expect(picks[2]).toMatchObject({ kind: 'agent' });
	});

	it('drops done, blocked and finished-this-visit tasks, and asks tied to them', () => {
		const picks = pick({
			tasks: [
				task('done', 'due_today', { due_in_days: 0, state_key: 'done' }),
				task('blocked', 'due_today', { due_in_days: 0, state_key: 'blocked' }),
				task('fresh', 'due_today', { due_in_days: 0 })
			],
			waiting: [waiting('w1', { task_id: 'fresh' }), waiting('w2', { direction: 'on_them' })],
			doneIds: new Set(['fresh'])
		});
		expect(picks).toEqual([]);
	});
});

describe('task rows and words', () => {
	it('labels due-this-week and new rows like the web', () => {
		expect(
			taskMeta(task('w', 'due_soon', { due_in_days: 3, due_at: '2026-11-14' }), 'UTC')
		).toBe('Due Sat');
		expect(taskMeta(task('n', 'new', { created_by_you: true }), 'UTC')).toBe('You added this');
		expect(taskMeta(task('n', 'new'), 'UTC')).toBe('Added by one of your agents');
		expect(taskMeta(task('t', 'due_today'), 'UTC')).toBeNull();
	});

	it('reads a due instant in the feed timezone', () => {
		// 2 AM UTC Saturday is still Friday evening in New York.
		expect(dueWeekday('2026-11-14T02:00:00.000Z', 'America/New_York')).toBe('Fri');
	});

	it('splits the day at noon and 5 PM', () => {
		expect([9, 12, 16, 17].map(timeOfDay)).toEqual([
			'morning',
			'afternoon',
			'afternoon',
			'evening'
		]);
	});

	it('snoozes a month out, to the end of that day on the phone', () => {
		const snoozed = new Date(snoozeDueAt('2026-11-13'));
		expect([snoozed.getFullYear(), snoozed.getMonth(), snoozed.getDate()]).toEqual([
			2026, 11, 13
		]);
		expect(snoozed.getHours()).toBe(23);
	});

	it('drafts a follow-up without sending it', () => {
		expect(nudgeDraft({ who: 'Logan', what: 'the signed contract' })).toBe(
			"Help me follow up with Logan. I'm waiting on: the signed contract"
		);
	});
});

describe('summarizeDay', () => {
	const entry = (
		actor_kind: WhatChangedEntry['actor_kind'],
		actor_label: string,
		project: string
	) => ({ actor_kind, actor_label, project_name: project }) as WhatChangedEntry;

	it('counts the person and BuildOS chat as you, one line per outside agent or member', () => {
		const seen = summarizeDay([
			entry('you', 'You', 'BuildOS'),
			entry('agent', 'Agent chat', 'BuildOS'),
			entry('external_agent', 'Claude Code', 'TBPN'),
			entry('external_agent', 'Claude Code', 'Radar'),
			entry('member', 'Sam', 'Cadre'),
			entry('system', 'System', 'BuildOS')
		]);
		expect(seen).toEqual({
			you: 2,
			agents: ['Claude Code: 2 changes in TBPN, Radar', 'Sam: 1 change in Cadre']
		});
		expect(seenYouLine(null)).toBe('Checking…');
		expect(seenYouLine(0)).toBe("You didn't change anything in BuildOS today.");
		expect(seenYouLine(1)).toBe('You changed 1 thing in BuildOS.');
	});
});

describe('buildDayDraft', () => {
	it('writes the day out for chat, capped like the web', () => {
		const draft = buildDayDraft({
			dateLabel: 'Friday, November 13',
			allDay: [{ title: 'Holiday' }],
			schedule: [{ timeLabel: '9:00 AM', title: 'Standup', kind: 'event', projectId: 'p1' }],
			anytime: [{ title: 'Ship it', project_name: 'BuildOS', bucket: 'in_progress' }],
			overdueCount: 2,
			projectName: (id) => (id === 'p1' ? 'BuildOS' : null)
		});
		expect(draft).toBe(
			[
				"Here's my day (Friday, November 13):",
				'',
				'All day:',
				'- Holiday',
				'',
				'Schedule:',
				'- 9:00 AM: Standup (BuildOS)',
				'',
				'Tasks for today (anytime):',
				'- Ship it (BuildOS) — in progress',
				'',
				'I also have 2 overdue tasks.',
				'',
				'Help me review my day and figure out what to focus on.'
			].join('\n')
		);
	});
});
