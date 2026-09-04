// packages/agentic-chat-runtime/src/tools/read-result-timezone.test.ts
import { describe, expect, it } from 'vitest';
import { projectReadResultInstantsToTimezone } from './read-result-timezone';

const NEW_YORK = 'America/New_York';

describe('projectReadResultInstantsToTimezone', () => {
	it('renders task scheduling instants in the user civil timezone', () => {
		const result = {
			tasks: [
				{
					id: 'task-1',
					title: 'Ship the cut',
					due_at: '2026-09-23T03:59:59+00:00',
					start_at: '2026-09-22T04:00:00.000Z',
					created_at: '2026-09-01T15:30:00.000Z',
					completed_at: null
				}
			]
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		expect(projected.tasks[0]).toEqual({
			id: 'task-1',
			title: 'Ship the cut',
			// The whole point: the stored instant is September 22 in New York.
			due_at: '2026-09-22T23:59:59-04:00',
			start_at: '2026-09-22T00:00:00-04:00',
			created_at: '2026-09-01T11:30:00-04:00',
			completed_at: null
		});
		// Input is never mutated.
		expect(result.tasks[0].due_at).toBe('2026-09-23T03:59:59+00:00');
	});

	it('rewrites nested event instants and calendar range bounds', () => {
		const result = {
			queried_range: {
				time_min: '2026-09-22T04:00:00Z',
				time_max: '2026-09-23T03:59:59Z'
			},
			events: [
				{ id: 'evt-1', start_at: '2026-09-22T18:00:00Z', end_at: '2026-09-22T19:00:00Z' },
				{ id: 'evt-2', start_at: '2026-09-22T21:30:00Z', end_at: null }
			]
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		expect(projected.queried_range).toEqual({
			time_min: '2026-09-22T00:00:00-04:00',
			time_max: '2026-09-22T23:59:59-04:00'
		});
		expect(projected.events[0]).toEqual({
			id: 'evt-1',
			start_at: '2026-09-22T14:00:00-04:00',
			end_at: '2026-09-22T15:00:00-04:00'
		});
		expect(projected.events[1]!.start_at).toBe('2026-09-22T17:30:00-04:00');
	});

	it('leaves content fields alone even when they contain an ISO instant', () => {
		const result = {
			document: {
				id: 'doc-1',
				title: '2026-09-23T03:59:59Z',
				content: '2026-09-23T03:59:59Z',
				body_markdown: 'Due 2026-09-23T03:59:59Z',
				description: '2026-09-23T03:59:59Z',
				summary: '2026-09-23T03:59:59Z',
				snippet: '2026-09-23T03:59:59Z',
				name: '2026-09-23T03:59:59Z',
				updated_at: '2026-09-23T03:59:59Z'
			}
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		expect(projected.document.title).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.content).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.body_markdown).toBe('Due 2026-09-23T03:59:59Z');
		expect(projected.document.description).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.summary).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.snippet).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.name).toBe('2026-09-23T03:59:59Z');
		expect(projected.document.updated_at).toBe('2026-09-22T23:59:59-04:00');
	});

	it('never rewrites ids or a date-only value', () => {
		const result = {
			id: '2026-09-22',
			project_id: 'proj-1',
			task_id: 'task-1',
			// A civil date is not an instant; rewriting it would invent a time.
			due_at: '2026-09-22',
			start_at: '2026-09-22T10:00:00'
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		// Nothing changed, so the projection returns the very same object.
		expect(projected).toBe(result);
	});

	it('returns the same reference when no timezone resolves', () => {
		const result = { tasks: [{ due_at: '2026-09-23T03:59:59+00:00' }] };

		expect(projectReadResultInstantsToTimezone(result, null)).toBe(result);
		expect(projectReadResultInstantsToTimezone(result, undefined)).toBe(result);
		expect(projectReadResultInstantsToTimezone(result, '')).toBe(result);
		expect(projectReadResultInstantsToTimezone(result, 'Mars/Olympus')).toBe(result);
	});

	it('uses the DST-correct offset per instant', () => {
		const result = {
			tasks: [{ due_at: '2026-09-23T03:59:59Z' }, { due_at: '2026-11-20T04:59:59Z' }]
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		expect(projected.tasks[0]!.due_at).toBe('2026-09-22T23:59:59-04:00');
		// November is EST, one hour further from UTC.
		expect(projected.tasks[1]!.due_at).toBe('2026-11-19T23:59:59-05:00');
	});

	it('copies only the containers on a changed path', () => {
		const untouched = { id: 'doc-1', content: 'nothing schedule-shaped here' };
		const result = {
			documents: [untouched],
			tasks: [{ id: 'task-1', due_at: '2026-09-23T03:59:59Z' }]
		};

		const projected = projectReadResultInstantsToTimezone(result, NEW_YORK);

		expect(projected).not.toBe(result);
		// The documents branch changed nothing, so it is shared, not copied.
		expect(projected.documents).toBe(result.documents);
		expect(projected.documents[0]).toBe(untouched);
		expect(projected.tasks).not.toBe(result.tasks);
	});

	it('preserves key order', () => {
		const result = { z_first: 1, due_at: '2026-09-23T03:59:59Z', a_last: 2 };

		expect(Object.keys(projectReadResultInstantsToTimezone(result, NEW_YORK))).toEqual([
			'z_first',
			'due_at',
			'a_last'
		]);
	});
});
