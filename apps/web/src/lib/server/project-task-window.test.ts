// apps/web/src/lib/server/project-task-window.test.ts
import { describe, expect, it } from 'vitest';
import type { Task } from '$lib/types/onto';
import { buildInitialProjectTaskWindow } from './project-task-window';
import {
	getProjectTaskAsOfMs,
	getProjectTaskBoardBucket,
	groupProjectTasksByBucket,
	selectProjectPulseTasks
} from '$lib/utils/project-task-board';

const NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');

function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		project_id: '11111111-1111-4111-8111-111111111111',
		title: id,
		state_key: 'todo',
		deleted_at: null,
		due_at: null,
		start_at: null,
		completed_at: null,
		priority: null,
		updated_at: '2026-07-15T10:00:00.000Z',
		...overrides
	} as Task;
}

describe('project task board windows', () => {
	it('uses mutually exclusive time-aware buckets', () => {
		expect(getProjectTaskAsOfMs('2026-07-15T12:00:00.000Z')).toBe(NOW_MS);
		expect(
			getProjectTaskBoardBucket(
				task('done', { state_key: 'done', due_at: '2026-07-14T12:00:00.000Z' }),
				NOW_MS
			)
		).toBe('done');
		expect(
			getProjectTaskBoardBucket(
				task('overdue', {
					state_key: 'in_progress',
					due_at: '2026-07-14T12:00:00.000Z'
				}),
				NOW_MS
			)
		).toBe('overdue');
		expect(
			getProjectTaskBoardBucket(
				task('scheduled', { start_at: '2026-07-16T12:00:00.000Z' }),
				NOW_MS
			)
		).toBe('scheduled');
		expect(getProjectTaskBoardBucket(task('backlog'), NOW_MS)).toBe('backlog');
		expect(
			getProjectTaskBoardBucket(
				task('archived', { deleted_at: '2026-07-15T11:00:00.000Z' }),
				NOW_MS
			)
		).toBe('archived');
	});

	it('keeps board grouping on the hydration clock and archived ordering newest-first', () => {
		const grouped = groupProjectTasksByBucket(
			[
				task('scheduled-at-hydration', { due_at: '2026-07-15T13:00:00.000Z' }),
				task('archived-older', {
					deleted_at: '2026-07-14T12:00:00.000Z',
					priority: 1
				}),
				task('archived-newer', {
					deleted_at: '2026-07-15T11:00:00.000Z',
					priority: 5
				})
			],
			NOW_MS
		);

		expect(grouped.scheduled.map((item) => item.id)).toEqual(['scheduled-at-hydration']);
		expect(grouped.archived.map((item) => item.id)).toEqual([
			'archived-newer',
			'archived-older'
		]);
	});

	it('caps each active bucket independently and reports exact totals', () => {
		const tasks = [
			...Array.from({ length: 25 }, (_, index) =>
				task(`backlog-${index}`, { priority: index + 1 })
			),
			...Array.from({ length: 3 }, (_, index) =>
				task(`active-${index}`, { state_key: 'in_progress', priority: index + 1 })
			),
			task('archived', { deleted_at: '2026-07-15T11:00:00.000Z' })
		];

		const result = buildInitialProjectTaskWindow(tasks, {
			limitPerBucket: 20,
			nowMs: NOW_MS
		});

		expect(result.tasks).toHaveLength(23);
		expect(result.tasks.some((item) => item.id === 'backlog-24')).toBe(false);
		expect(result.tasks.some((item) => item.id === 'archived')).toBe(false);
		expect(result.coverage).toMatchObject({
			scope: 'initial-board',
			as_of: '2026-07-15T12:00:00.000Z',
			complete: false,
			returned: 23,
			total: 28,
			limit_per_bucket: 20
		});
		expect(result.coverage.buckets.backlog).toEqual({
			returned: 20,
			total: 25,
			complete: false
		});
		expect(result.coverage.buckets.in_progress).toEqual({
			returned: 3,
			total: 3,
			complete: true
		});
	});

	it('keeps Pulse independent from the paginated board ordering', () => {
		const tasks = [
			task('future-late', { due_at: '2026-07-20T12:00:00.000Z', priority: 1 }),
			task('overdue-recent', { due_at: '2026-07-14T12:00:00.000Z', priority: 5 }),
			task('future-near', { start_at: '2026-07-16T12:00:00.000Z', priority: 5 }),
			task('overdue-old', { due_at: '2026-07-10T12:00:00.000Z', priority: 5 }),
			task('done', {
				state_key: 'done',
				due_at: '2026-07-09T12:00:00.000Z'
			})
		];

		expect(selectProjectPulseTasks(tasks, 3, NOW_MS).map((item) => item.id)).toEqual([
			'overdue-old',
			'overdue-recent',
			'future-near'
		]);
	});
});
