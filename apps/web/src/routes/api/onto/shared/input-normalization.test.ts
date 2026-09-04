// apps/web/src/routes/api/onto/shared/input-normalization.test.ts
import { describe, expect, it } from 'vitest';
import {
	needsCivilTimezone,
	normalizeCalendarSyncInput,
	normalizeDateTimeInput,
	normalizePriorityInput,
	toTaskCalendarSyncReceipt
} from './input-normalization';

describe('normalizeDateTimeInput civil-day semantics', () => {
	it("closes a date-only due date on the user's civil day", () => {
		expect(normalizeDateTimeInput('2026-09-15', 'due_at', 'end', 'America/New_York')).toEqual({
			ok: true,
			value: '2026-09-16T03:59:59.000Z'
		});
	});

	it("opens a date-only start date on the user's civil day", () => {
		expect(
			normalizeDateTimeInput('2026-09-15', 'start_at', 'start', 'America/New_York')
		).toEqual({ ok: true, value: '2026-09-15T04:00:00.000Z' });
	});

	it('falls back to UTC boundaries when no timezone resolves', () => {
		expect(normalizeDateTimeInput('2026-09-15', 'due_at', 'end')).toEqual({
			ok: true,
			value: '2026-09-15T23:59:59.000Z'
		});
		expect(normalizeDateTimeInput('2026-09-15', 'start_at', 'start', null)).toEqual({
			ok: true,
			value: '2026-09-15T00:00:00.000Z'
		});
	});

	it('normalizes full datetimes to ISO and keeps null/undefined semantics', () => {
		expect(
			normalizeDateTimeInput('2026-09-15T09:30:00-04:00', 'due_at', 'end', 'America/New_York')
		).toEqual({ ok: true, value: '2026-09-15T13:30:00.000Z' });
		expect(normalizeDateTimeInput(undefined, 'due_at', 'end')).toEqual({
			ok: true,
			value: undefined
		});
		expect(normalizeDateTimeInput(null, 'due_at', 'end')).toEqual({ ok: true, value: null });
		expect(normalizeDateTimeInput('  ', 'due_at', 'end')).toEqual({ ok: true, value: null });
	});

	it('rejects unusable dates', () => {
		expect(normalizeDateTimeInput('2026-02-30', 'due_at', 'end', 'UTC')).toEqual({
			ok: false,
			error: 'due_at must be a valid date'
		});
		expect(normalizeDateTimeInput('next tuesday', 'due_at', 'end')).toEqual({
			ok: false,
			error: 'due_at must be a valid date'
		});
	});
});

describe('needsCivilTimezone', () => {
	it('is true only when a bare calendar date is present', () => {
		expect(needsCivilTimezone(undefined, '2026-09-15')).toBe(true);
		expect(needsCivilTimezone('2026-09-15T00:00:00Z', null)).toBe(false);
		expect(needsCivilTimezone(undefined, undefined)).toBe(false);
	});
});

describe('normalizeCalendarSyncInput', () => {
	it('defaults to auto and accepts none', () => {
		expect(normalizeCalendarSyncInput(undefined)).toEqual({ ok: true, value: 'auto' });
		expect(normalizeCalendarSyncInput(null)).toEqual({ ok: true, value: 'auto' });
		expect(normalizeCalendarSyncInput(' NONE ')).toEqual({ ok: true, value: 'none' });
	});

	it('rejects anything else', () => {
		expect(normalizeCalendarSyncInput('off')).toEqual({
			ok: false,
			error: 'calendar_sync must be one of: auto, none'
		});
	});
});

describe('toTaskCalendarSyncReceipt', () => {
	it('reports the synced events and any removals', () => {
		expect(
			toTaskCalendarSyncReceipt({
				events: [
					{
						id: 'event-1',
						title: 'Due: Ship',
						start_at: '2026-09-16T03:29:59.000Z',
						end_at: '2026-09-16T03:59:59.000Z'
					}
				],
				removed_event_count: 2
			})
		).toEqual({
			calendar_sync: 'synced',
			calendar_events: [
				{
					id: 'event-1',
					title: 'Due: Ship',
					start_at: '2026-09-16T03:29:59.000Z',
					end_at: '2026-09-16T03:59:59.000Z'
				}
			],
			removed_calendar_event_count: 2
		});
	});

	it('degrades to an empty synced receipt for an unrecognized result', () => {
		expect(toTaskCalendarSyncReceipt(undefined)).toEqual({
			calendar_sync: 'synced',
			calendar_events: []
		});
	});
});

describe('normalizePriorityInput word scale', () => {
	// The five rungs are the UI labels: 1 Critical, 2 High, 3 Medium, 4 Low,
	// 5 Nice to have. The map this replaced collapsed them to three, so "high"
	// resolved to 1 (Critical) and "low" to 5 (Nice to have).
	it.each([
		['critical', 1],
		['urgent', 1],
		['high', 2],
		['medium', 3],
		['normal', 3],
		['low', 4],
		['minimal', 5],
		['nice to have', 5]
	])('maps %s to priority %i', (word, expected) => {
		expect(normalizePriorityInput(word)).toEqual({ ok: true, value: expected });
	});

	it('is case- and whitespace-insensitive', () => {
		expect(normalizePriorityInput('  High  ')).toEqual({ ok: true, value: 2 });
	});

	it('clamps and rounds numeric input into the 1-5 range', () => {
		expect(normalizePriorityInput(0)).toEqual({ ok: true, value: 1 });
		expect(normalizePriorityInput(9)).toEqual({ ok: true, value: 5 });
		expect(normalizePriorityInput('4')).toEqual({ ok: true, value: 4 });
	});

	it('keeps null/undefined semantics and rejects unknown words', () => {
		expect(normalizePriorityInput(undefined, { defaultValue: 3 })).toEqual({
			ok: true,
			value: 3
		});
		expect(normalizePriorityInput(null, { allowNull: true })).toEqual({
			ok: true,
			value: null
		});
		expect(normalizePriorityInput('whenever')).toEqual({
			ok: false,
			error: 'priority must be a number from 1 to 5'
		});
	});
});
