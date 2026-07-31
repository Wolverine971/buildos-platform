// apps/web/src/lib/tests/agentic-e2e/harness/seed.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { DbView } from './types';
import {
	HARNESS_PROJECT_PREFIX,
	HARNESS_RUN_ID,
	HARNESS_RUN_PREFIX,
	harnessProjectName,
	sweepOrphanProjects,
	sweepStaleOrphanProjects
} from './seed';

function mockDb() {
	const query: Record<string, ReturnType<typeof vi.fn>> = {};
	query.delete = vi.fn(() => query);
	query.eq = vi.fn(() => query);
	query.like = vi.fn(() => query);
	query.lt = vi.fn(() => query);
	query.select = vi.fn(async () => ({ data: [{ id: 'project-1' }], error: null }));
	const db = {
		actorId: 'actor-1',
		admin: { from: vi.fn(() => query) }
	} as unknown as DbView;
	return { db, query };
}

describe('agentic E2E fixture cleanup scopes', () => {
	it('tags every fixture name with a process-unique run id', () => {
		const name = harnessProjectName('Pricing');

		expect(HARNESS_RUN_ID.length).toBeGreaterThanOrEqual(12);
		expect(name.startsWith(`${HARNESS_RUN_PREFIX} `)).toBe(true);
	});

	it('normal cleanup deletes only the current run prefix', async () => {
		const { db, query } = mockDb();

		await expect(sweepOrphanProjects(db)).resolves.toBe(1);
		expect(query.like).toHaveBeenCalledWith('name', `${HARNESS_RUN_PREFIX}%`);
		expect(query.lt).not.toHaveBeenCalled();
	});

	it('stale cleanup keeps the broad prefix behind a 24-hour age guard', async () => {
		const { db, query } = mockDb();
		const now = new Date('2026-07-30T12:00:00.000Z');

		await expect(sweepStaleOrphanProjects(db, now)).resolves.toBe(1);
		expect(query.like).toHaveBeenCalledWith('name', `${HARNESS_PROJECT_PREFIX}%`);
		expect(query.lt).toHaveBeenCalledWith('created_at', '2026-07-29T12:00:00.000Z');
	});
});
