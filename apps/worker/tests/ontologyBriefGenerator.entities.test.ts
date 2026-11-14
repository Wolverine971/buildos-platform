// apps/worker/tests/ontologyBriefGenerator.entities.test.ts
// Saving the list of things a brief mentions (ontology_brief_entities). The database is
// an in-memory stand-in; no model is involved.
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OntologyBriefData } from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: vi.fn()
}));

import { recordBriefEntities } from '../src/workers/brief/ontologyBriefGenerator';

type EntityRow = {
	daily_brief_id: string;
	project_id: string | null;
	entity_kind: string;
	entity_id: string;
	role: string;
};
type DbError = { code: string; message: string };
type Call = { op: 'delete'; column: string; value: unknown } | { op: 'insert'; rows: EntityRow[] };

const KIND_CHECK_MESSAGE =
	'new row for relation "ontology_brief_entities" violates check constraint "ontology_brief_entities_kind_check"';

/** Stands in for the ontology_brief_entities table: delete().eq() and insert(). */
function fakeEntitiesTable(
	options: { insertErrors?: Array<DbError | null>; deleteError?: DbError } = {}
) {
	const rows: EntityRow[] = [];
	const calls: Call[] = [];
	const insertErrors = [...(options.insertErrors ?? [])];

	mocks.from.mockImplementation((table: string) => {
		if (table !== 'ontology_brief_entities') throw new Error(`unexpected table ${table}`);
		return {
			delete: () => ({
				eq: async (column: string, value: unknown) => {
					calls.push({ op: 'delete', column, value });
					if (options.deleteError) return { error: options.deleteError };
					for (let index = rows.length - 1; index >= 0; index -= 1) {
						if (rows[index][column as keyof EntityRow] === value) rows.splice(index, 1);
					}
					return { error: null };
				}
			}),
			insert: async (payload: EntityRow[]) => {
				calls.push({ op: 'insert', rows: payload });
				const error = insertErrors.shift() ?? null;
				if (!error) rows.push(...payload);
				return { error };
			}
		};
	});

	return { rows, calls };
}

/** A brief that mentions a task, a calendar event, a paused project and a changed event. */
function createBriefData(): OntologyBriefData {
	return {
		recentlyPausedProjects: [{ projectId: 'project-paused', projectName: 'Paused' }],
		todaysTasks: [{ id: 'task-today', project_id: 'project-1' }],
		blockedTasks: [],
		goals: [],
		risks: [],
		requirements: [],
		recentUpdates: { tasks: [], goals: [], documents: [] },
		calendar: {
			today: [{ eventId: 'event-standup', taskId: null, projectId: 'project-1' }],
			upcoming: [{ eventId: null, taskId: 'task-scheduled', projectId: 'project-1' }]
		},
		projects: [
			{
				project: { id: 'project-1' },
				recentChanges: [
					{ kind: 'event', id: 'event-moved', action: 'updated' },
					{ kind: 'document', id: 'doc-new', action: 'created' }
				]
			}
		]
	} as unknown as OntologyBriefData;
}

function insertedKinds(call: Call | undefined): string[] {
	if (!call || call.op !== 'insert') throw new Error('expected an insert call');
	return call.rows.map((row) => `${row.entity_kind}:${row.entity_id}:${row.role}`).sort();
}

function loggedText(spy: MockInstance<typeof console.error>): string {
	return spy.mock.calls.map((args) => String(args[0])).join('\n');
}

describe('recordBriefEntities', () => {
	let errorSpy: MockInstance<typeof console.error>;
	let warnSpy: MockInstance<typeof console.warn>;

	beforeEach(() => {
		vi.clearAllMocks();
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
		warnSpy.mockRestore();
	});

	it('saves event and project rows in the same batch as the rest', async () => {
		const db = fakeEntitiesTable();

		await recordBriefEntities('brief-1', createBriefData());

		expect(db.calls.map((call) => call.op)).toEqual(['delete', 'insert']);
		expect(db.calls[0]).toEqual({ op: 'delete', column: 'daily_brief_id', value: 'brief-1' });
		expect(insertedKinds(db.calls[1])).toEqual([
			'document:doc-new:created',
			'event:event-moved:recently_updated',
			'event:event-standup:calendar_today',
			'project:project-paused:recently_paused',
			'task:task-scheduled:calendar_upcoming',
			'task:task-today:highlighted'
		]);
		expect(db.rows.every((row) => row.daily_brief_id === 'brief-1')).toBe(true);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it('replaces the earlier rows when the same brief is generated again', async () => {
		const db = fakeEntitiesTable();

		await recordBriefEntities('brief-1', createBriefData());
		const firstRun = db.rows.length;
		await recordBriefEntities('brief-1', createBriefData());

		expect(firstRun).toBe(6);
		expect(db.rows).toHaveLength(firstRun);
		expect(db.calls.map((call) => call.op)).toEqual(['delete', 'insert', 'delete', 'insert']);
	});

	it('clears stale rows even when the new brief mentions nothing', async () => {
		const db = fakeEntitiesTable();
		await recordBriefEntities('brief-1', createBriefData());

		await recordBriefEntities('brief-1', {
			...createBriefData(),
			recentlyPausedProjects: [],
			todaysTasks: [],
			calendar: { today: [], upcoming: [] },
			projects: []
		} as unknown as OntologyBriefData);

		expect(db.rows).toHaveLength(0);
		expect(db.calls.map((call) => call.op)).toEqual(['delete', 'insert', 'delete']);
	});

	it('before the migration: logs the database message and saves the rows the old check allows', async () => {
		const db = fakeEntitiesTable({
			insertErrors: [{ code: '23514', message: KIND_CHECK_MESSAGE }, null]
		});

		await expect(recordBriefEntities('brief-1', createBriefData())).resolves.toBeUndefined();

		expect(db.calls.map((call) => call.op)).toEqual(['delete', 'insert', 'insert']);
		expect(loggedText(errorSpy)).toContain(KIND_CHECK_MESSAGE);
		expect(insertedKinds(db.calls[2])).toEqual([
			'document:doc-new:created',
			'task:task-scheduled:calendar_upcoming',
			'task:task-today:highlighted'
		]);
		expect(db.rows).toHaveLength(3);
	});

	it('logs any other failed save with the database message and does not retry', async () => {
		const message =
			'insert or update on table "ontology_brief_entities" violates foreign key constraint';
		const db = fakeEntitiesTable({ insertErrors: [{ code: '23503', message }] });

		await expect(recordBriefEntities('brief-1', createBriefData())).resolves.toBeUndefined();

		expect(db.calls.map((call) => call.op)).toEqual(['delete', 'insert']);
		expect(loggedText(errorSpy)).toContain(message);
		expect(db.rows).toHaveLength(0);
	});

	it('logs the retry failure too', async () => {
		const retryMessage = 'canceling statement due to statement timeout';
		const db = fakeEntitiesTable({
			insertErrors: [
				{ code: '23514', message: KIND_CHECK_MESSAGE },
				{ code: '57014', message: retryMessage }
			]
		});

		await expect(recordBriefEntities('brief-1', createBriefData())).resolves.toBeUndefined();

		expect(loggedText(errorSpy)).toContain(KIND_CHECK_MESSAGE);
		expect(loggedText(errorSpy)).toContain(retryMessage);
		expect(db.rows).toHaveLength(0);
	});

	it('does not insert when the earlier rows could not be cleared', async () => {
		const message = 'permission denied for table ontology_brief_entities';
		const db = fakeEntitiesTable({ deleteError: { code: '42501', message } });

		await expect(recordBriefEntities('brief-1', createBriefData())).resolves.toBeUndefined();

		expect(db.calls.map((call) => call.op)).toEqual(['delete']);
		expect(loggedText(errorSpy)).toContain(message);
	});
});
