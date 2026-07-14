// apps/worker/tests/scheduledAuditScan.test.ts
import { describe, expect, it, vi } from 'vitest';
import { scanScheduledAuditProjectPages } from '../src/workers/project-loop/scheduledAuditScan';

function makeProjects(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `project-${index.toString().padStart(4, '0')}`,
		created_by: `user-${index}`
	}));
}

describe('scanScheduledAuditProjectPages', () => {
	it('continues beyond the first 500 projects so older projects cannot starve', async () => {
		const projects = makeProjects(1_201);
		const processed: string[] = [];
		const cursors: Array<string | null> = [];

		const result = await scanScheduledAuditProjectPages({
			pageSize: 500,
			fetchPage: async (afterProjectId, pageSize) => {
				cursors.push(afterProjectId);
				const start = afterProjectId
					? projects.findIndex((project) => project.id === afterProjectId) + 1
					: 0;
				return { data: projects.slice(start, start + pageSize), error: null };
			},
			processPage: async (page) => {
				processed.push(...page.map((project) => project.id));
			}
		});

		expect(result).toEqual({ scanned: 1_201, scanFailed: false });
		expect(cursors).toEqual([null, 'project-0499', 'project-0999']);
		expect(processed).toEqual(projects.map((project) => project.id));
	});

	it('reports a later page failure without losing the completed scan count', async () => {
		const projects = makeProjects(500);
		const onError = vi.fn();
		const result = await scanScheduledAuditProjectPages({
			pageSize: 500,
			fetchPage: async (afterProjectId) =>
				afterProjectId
					? { data: [], error: { message: 'database unavailable' } }
					: { data: projects, error: null },
			processPage: async () => undefined,
			onError
		});

		expect(result).toEqual({ scanned: 500, scanFailed: true });
		expect(onError).toHaveBeenCalledWith({ message: 'database unavailable' });
	});

	it('finishes an exact page multiple by advancing to the final empty page', async () => {
		const projects = makeProjects(1_000);
		let fetchCount = 0;
		const result = await scanScheduledAuditProjectPages({
			pageSize: 500,
			fetchPage: async (afterProjectId, pageSize) => {
				fetchCount += 1;
				const start = afterProjectId
					? projects.findIndex((project) => project.id === afterProjectId) + 1
					: 0;
				return { data: projects.slice(start, start + pageSize), error: null };
			},
			processPage: async () => undefined
		});

		expect(result).toEqual({ scanned: 1_000, scanFailed: false });
		expect(fetchCount).toBe(3);
	});
});
