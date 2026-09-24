// apps/web/src/lib/privacy/user-data.test.ts
import { describe, expect, it } from 'vitest';
import {
	formatBytes,
	formatRelativeTime,
	toDataSummary,
	toExportView,
	userDataExportObjectPath,
	type UserDataExportRow
} from './user-data';

const NOW = new Date('2026-09-24T15:00:00.000Z').getTime();

function row(overrides: Partial<UserDataExportRow> = {}): UserDataExportRow {
	return {
		id: 'e1',
		user_id: 'u1',
		status: 'ready',
		storage_path: 'u1/e1.zip',
		byte_size: 10,
		part_count: 1,
		error_code: null,
		requested_at: new Date(NOW - 60_000).toISOString(),
		started_at: null,
		completed_at: new Date(NOW - 30_000).toISOString(),
		expires_at: new Date(NOW + 86_400_000).toISOString(),
		...overrides
	};
}

describe('user data helpers', () => {
	it('names export objects the way the worker and SQL cleanup expect', () => {
		expect(userDataExportObjectPath('u1', 'e1')).toBe('u1/e1.zip');
		expect(userDataExportObjectPath('u1', 'e1', 3)).toBe('u1/e1.part3.zip');
	});

	it('offers downloads only for a ready export inside its window', () => {
		expect(toExportView(row({ part_count: 2 }), NOW).downloadPaths).toHaveLength(2);
		expect(
			toExportView(row({ expires_at: new Date(NOW - 1).toISOString() }), NOW)
		).toMatchObject({
			status: 'expired',
			downloadPaths: []
		});
		expect(
			toExportView(row({ status: 'failed', error_code: 'upload_failed' }), NOW)
		).toMatchObject({
			status: 'failed',
			errorCode: 'upload_failed',
			downloadPaths: []
		});
	});

	it('normalizes a partial summary to zero and not connected', () => {
		const summary = toDataSummary({ workspace: { projects: 3, tasks: -1 }, connections: {} });
		expect(summary.workspace.projects).toBe(3);
		expect(summary.workspace.tasks).toBe(0);
		expect(summary.connections.gmail.connected).toBe(false);
		expect(summary.connections.agents).toEqual([]);
	});

	it('formats sizes and times for people', () => {
		expect(formatBytes(52 * 1024 * 1024)).toBe('52 MB');
		expect(formatBytes(900)).toBe('900 B');
		const now = new Date(NOW);
		expect(formatRelativeTime(new Date(NOW - 2 * 3_600_000).toISOString(), now)).toBe('2h ago');
		expect(formatRelativeTime(new Date(NOW - 30_000).toISOString(), now)).toBe('just now');
		expect(formatRelativeTime('2026-09-01T12:00:00.000Z', now)).toBe('Sep 1');
	});
});
