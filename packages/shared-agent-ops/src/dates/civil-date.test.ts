// packages/shared-agent-ops/src/dates/civil-date.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	CivilDateError,
	civilDateBoundaryInstant,
	hasDateOnlyValue,
	isDateOnlyValue,
	isValidIanaTimezone,
	normalizeDateOnlyInput,
	resolveUserCivilTimezone
} from './civil-date';

describe('civilDateBoundaryInstant', () => {
	it('resolves a due date to the last second of the civil day in the user timezone', () => {
		expect(civilDateBoundaryInstant('2026-09-18', 'end', 'America/New_York')).toBe(
			'2026-09-19T03:59:59.000Z'
		);
	});

	it('resolves a start date to the first moment of the civil day in the user timezone', () => {
		expect(civilDateBoundaryInstant('2026-09-18', 'start', 'America/New_York')).toBe(
			'2026-09-18T04:00:00.000Z'
		);
	});

	it('handles the fall-back DST day where the day starts in EDT and ends in EST', () => {
		// 2026-11-01: New York leaves DST at 06:00Z, so midnight is -04:00 and
		// 23:59:59 is -05:00. A single-pass offset would land an hour off.
		expect(civilDateBoundaryInstant('2026-11-01', 'start', 'America/New_York')).toBe(
			'2026-11-01T04:00:00.000Z'
		);
		expect(civilDateBoundaryInstant('2026-11-01', 'end', 'America/New_York')).toBe(
			'2026-11-02T04:59:59.000Z'
		);
	});

	it('handles a positive-offset timezone', () => {
		expect(civilDateBoundaryInstant('2026-09-18', 'start', 'Asia/Tokyo')).toBe(
			'2026-09-17T15:00:00.000Z'
		);
		expect(civilDateBoundaryInstant('2026-09-18', 'end', 'Asia/Tokyo')).toBe(
			'2026-09-18T14:59:59.000Z'
		);
	});

	it('falls back to UTC when no timezone resolves', () => {
		expect(civilDateBoundaryInstant('2026-09-18', 'end', null)).toBe(
			'2026-09-18T23:59:59.000Z'
		);
		expect(civilDateBoundaryInstant('2026-09-18', 'start', undefined)).toBe(
			'2026-09-18T00:00:00.000Z'
		);
		expect(civilDateBoundaryInstant('2026-09-18', 'end', 'Not/AZone')).toBe(
			'2026-09-18T23:59:59.000Z'
		);
	});

	it('rejects values that are not real calendar dates', () => {
		expect(() => civilDateBoundaryInstant('2026-02-30', 'start', 'UTC')).toThrow(
			CivilDateError
		);
		expect(() => civilDateBoundaryInstant('2026-13-01', 'start', 'UTC')).toThrow(
			CivilDateError
		);
	});
});

describe('normalizeDateOnlyInput', () => {
	it('interprets a bare date at the requested civil boundary', () => {
		expect(
			normalizeDateOnlyInput('2026-09-15', {
				boundary: 'end',
				timezone: 'America/New_York'
			})
		).toBe('2026-09-16T03:59:59.000Z');
	});

	it('passes a full datetime through unchanged by default', () => {
		expect(
			normalizeDateOnlyInput(' 2026-09-18T10:30:00-04:00 ', {
				boundary: 'end',
				timezone: 'America/New_York'
			})
		).toBe('2026-09-18T10:30:00-04:00');
	});

	it('normalizes a full datetime to ISO when the caller asks for it', () => {
		expect(
			normalizeDateOnlyInput('2026-09-18T10:30:00-04:00', {
				boundary: 'end',
				timezone: 'America/New_York',
				datetimeOutput: 'iso'
			})
		).toBe('2026-09-18T14:30:00.000Z');
	});

	it('rejects unparseable and empty values', () => {
		expect(() => normalizeDateOnlyInput('next tuesday', { boundary: 'start' })).toThrow(
			CivilDateError
		);
		expect(() => normalizeDateOnlyInput('   ', { boundary: 'start' })).toThrow(CivilDateError);
	});
});

describe('date-only detection', () => {
	it('recognizes bare dates only', () => {
		expect(isDateOnlyValue('2026-09-18')).toBe(true);
		expect(isDateOnlyValue(' 2026-09-18 ')).toBe(true);
		expect(isDateOnlyValue('2026-09-18T00:00:00Z')).toBe(false);
		expect(isDateOnlyValue(null)).toBe(false);
		expect(hasDateOnlyValue([undefined, null, '2026-09-18T00:00:00Z'])).toBe(false);
		expect(hasDateOnlyValue([undefined, '2026-09-18'])).toBe(true);
	});

	it('validates IANA timezones', () => {
		expect(isValidIanaTimezone('America/New_York')).toBe(true);
		expect(isValidIanaTimezone('UTC')).toBe(true);
		expect(isValidIanaTimezone('Mars/Olympus')).toBe(false);
		expect(isValidIanaTimezone('')).toBe(false);
		expect(isValidIanaTimezone(null)).toBe(false);
	});
});

describe('resolveUserCivilTimezone', () => {
	function clientReturning(result: unknown) {
		const maybeSingle = vi.fn(async () => result);
		const eq = vi.fn(() => ({ maybeSingle }));
		const select = vi.fn(() => ({ eq }));
		const from = vi.fn(() => ({ select }));
		return { client: { from }, from, select, eq };
	}

	it('reads users.timezone', async () => {
		const { client, from, select } = clientReturning({
			data: { timezone: 'America/New_York' },
			error: null
		});
		await expect(resolveUserCivilTimezone(client, 'user-1')).resolves.toBe('America/New_York');
		expect(from).toHaveBeenCalledWith('users');
		expect(select).toHaveBeenCalledWith('timezone');
	});

	it('returns null for a missing, blank, or invalid timezone', async () => {
		await expect(
			resolveUserCivilTimezone(clientReturning({ data: null, error: null }).client, 'user-1')
		).resolves.toBeNull();
		await expect(
			resolveUserCivilTimezone(
				clientReturning({ data: { timezone: 'Mars/Olympus' }, error: null }).client,
				'user-1'
			)
		).resolves.toBeNull();
	});

	it('never throws when the lookup fails', async () => {
		const client = {
			from: () => {
				throw new Error('boom');
			}
		};
		await expect(resolveUserCivilTimezone(client, 'user-1')).resolves.toBeNull();
		await expect(resolveUserCivilTimezone(null, 'user-1')).resolves.toBeNull();
		await expect(
			resolveUserCivilTimezone(clientReturning({ data: null }).client, null)
		).resolves.toBeNull();
	});
});
