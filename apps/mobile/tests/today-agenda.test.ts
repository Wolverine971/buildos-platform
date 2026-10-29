// apps/mobile/tests/today-agenda.test.ts
import type { CalendarItem, TodayFeed, TodayTask, TodayTaskBucket } from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	buildAgenda,
	describeDegraded,
	groupTodayTasks,
	isActiveFacing,
	isCurrent,
	isDateOnly,
	isPast,
	nextEntry,
	nowMarkerIndex,
	splitClock,
	walkOrder
} from '@/components/today/agenda';

// A zone that is not UTC, so the date-only checks exercise wall-clock boundaries.
const TZ = 'America/New_York';

function task(
	id: string,
	bucket: TodayTaskBucket,
	extra: Partial<Pick<TodayTask, 'project_id' | 'project_name' | 'title' | 'state_key'>> & {
		due?: string;
		start?: string;
	} = {}
): TodayTask {
	return {
		id,
		project_id: extra.project_id ?? 'p1',
		project_name: extra.project_name ?? 'BuildOS',
		title: extra.title ?? id,
		description: null,
		state_key: extra.state_key ?? 'todo',
		due_at: extra.due ?? null,
		start_at: extra.start ?? null,
		priority: null,
		updated_at: '',
		bucket
	};
}

function event(
	id: string,
	start: string,
	end: string | null,
	extra: { title?: string; allDay?: boolean; task?: string } = {}
): CalendarItem {
	return {
		calendar_item_id: id,
		item_type: 'event',
		item_kind: 'event',
		source_table: 'x',
		title: extra.title ?? id,
		start_at: start,
		end_at: end,
		all_day: extra.allDay ?? false,
		timezone: null,
		project_id: null,
		owner_entity_type: null,
		owner_entity_id: null,
		task_id: extra.task ?? null,
		event_id: null,
		state_key: null,
		type_key: null,
		props: null,
		created_at: '',
		updated_at: ''
	} as unknown as CalendarItem;
}

const feed: TodayFeed = {
	date: '2026-10-29',
	timezone: TZ,
	dayStart: '',
	dayEnd: '',
	events: [
		event('standup', '2026-10-29T14:00:00Z', '2026-10-29T14:30:00Z', { title: 'Standup' }),
		event('off', '2026-10-29T04:00:00Z', null, { allDay: true, title: 'Holiday' }),
		event('linked', '2026-10-29T18:00:00Z', '2026-10-29T19:00:00Z', {
			task: 'tL',
			title: 'Pair on L'
		})
	],
	tasks: [
		task('tZ', 'due_today', { title: 'Zeta', due: '2026-10-30T03:59:59.000Z' }),
		task('tA', 'due_today', {
			title: 'Alpha',
			due: '2026-10-29T03:59:59Z',
			project_id: 'p2',
			project_name: '9takes'
		}),
		task('tTimed', 'due_today', { title: 'Timed', due: '2026-10-29T19:30:00Z' }),
		task('tS', 'starts_today', { title: 'Starter', start: '2026-10-29T04:00:00Z' }),
		task('tP', 'in_progress', { title: 'Prog', state_key: 'in_progress' }),
		task('tL', 'in_progress', { title: 'Linked' })
	],
	overdueCount: 3,
	degradedSections: [],
	projectNames: { p1: 'BuildOS', p2: '9takes' },
	projects: []
};

describe('splitClock', () => {
	it('stacks the day period under the time for the 48pt rail', () => {
		expect(splitClock('12:00 PM')).toEqual({ time: '12:00', period: 'PM' });
		expect(splitClock('9:05 a.m.')).toEqual({ time: '9:05', period: 'a.m.' });
		expect(splitClock('13:00')).toEqual({ time: '13:00', period: null });
	});
});

describe('isDateOnly', () => {
	it('spots legacy sentinels and wall-clock day boundaries in the feed timezone', () => {
		expect(isDateOnly('2026-10-29T23:59:59Z', 'end', TZ)).toBe(true);
		expect(isDateOnly('2026-10-29T00:00:00+00:00', 'start', TZ)).toBe(true);
		expect(isDateOnly('2026-10-30T03:59:59.000Z', 'end', TZ)).toBe(true); // 23:59:59 EDT
		expect(isDateOnly('2026-10-29T19:00:00.000Z', 'end', TZ)).toBe(false); // 3 PM EDT
		expect(isDateOnly('2026-10-29T04:00:00.000Z', 'start', TZ)).toBe(true); // 00:00 EDT
	});
});

describe('buildAgenda', () => {
	const agenda = buildAgenda(feed);
	const groups = groupTodayTasks(agenda.anytime);

	it('splits all-day events, the timed schedule and anytime tasks', () => {
		expect(agenda.allDay.map((entry) => entry.title)).toEqual(['Holiday']);
		expect(agenda.schedule.map((entry) => entry.key)).toEqual([
			'event-standup',
			'event-linked',
			'task-tTimed'
		]);
		// An event linked to a task opens that task, so the task leaves the anytime list.
		expect(agenda.schedule[1]?.task?.id).toBe('tL');
		expect(agenda.schedule[2]?.metaLabel).toMatch(/^Due 3:30/);
		expect(agenda.anytime.map((t) => t.id)).toEqual(['tA', 'tZ', 'tS', 'tP']);
	});

	it('groups anytime tasks by bucket, then project', () => {
		expect(
			groups.map((group) => [
				group.label,
				group.projects.map((p) => `${p.name}:${p.tasks.map((t) => t.id).join(',')}`)
			])
		).toEqual([
			['Due today', ['9takes:tA', 'BuildOS:tZ']],
			['Starts today', ['BuildOS:tS']],
			['In progress', ['BuildOS:tP']]
		]);
	});

	it('walks the reader in page order: schedule, then anytime', () => {
		expect(walkOrder(agenda, groups)).toEqual(['tL', 'tTimed', 'tA', 'tZ', 'tS', 'tP']);
	});

	it('places the now line and finds what is current, past and next', () => {
		const now = Date.parse('2026-10-29T14:10:00Z');
		expect(nowMarkerIndex(agenda.schedule, now)).toBe(1);
		expect(isCurrent(agenda.schedule[0]!, now)).toBe(true);
		expect(isPast(agenda.schedule[0]!, Date.parse('2026-10-29T15:00:00Z'))).toBe(true);
		expect(nextEntry(agenda.schedule, now)?.key).toBe('event-linked');
		expect(nowMarkerIndex(agenda.schedule, Date.parse('2026-10-29T23:00:00Z'))).toBe(3);
	});
});

describe('small helpers', () => {
	it('describes degraded sections and active-facing states', () => {
		expect(describeDegraded(['events', 'tasks'])).toBe(
			'Calendar events, tasks may be incomplete.'
		);
		expect(isActiveFacing(' Paused ')).toBe(false);
		expect(isActiveFacing(null)).toBe(true);
	});
});
