// packages/agentic-chat-runtime/src/tools/ontology-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { getOntoDocumentDetails, listOntoDocuments, listOntoTasks } from './ontology-reads';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

function makeBuilder(rows: unknown[]) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.then = (
		onFulfilled: (value: unknown) => unknown,
		onRejected: (reason: unknown) => unknown
	) =>
		Promise.resolve({ data: rows, count: rows.length, error: null }).then(
			onFulfilled,
			onRejected
		);
	return builder;
}

function contextWith(rows: unknown[]): AgenticChatSharedReadContextV1 {
	return {
		client: { from: vi.fn(() => makeBuilder(rows)) } as never,
		userId: 'user-1',
		timezone: null,
		access: {
			getActorId: vi.fn(async () => 'actor-1'),
			resolveProjectSummaries: vi.fn(async () => []),
			assertProjectAccess: vi.fn(async () => {}),
			assertEntityAccess: vi.fn(async () => {})
		}
	} as never;
}

describe('ontology list reads', () => {
	// 2026-09-29 Wayne Strategies cleanup: 16 archived "todo" tasks were reported as live work
	// because archived rows looked identical to active ones.
	it('marks archived task rows and says so in the message', async () => {
		const task = {
			id: 'task-1',
			title: 'Reach out to Julian',
			state_key: 'todo',
			project: null
		};
		const result = await listOntoTasks(contextWith([task]), {
			project_id: PROJECT_ID,
			archived: true
		});

		expect(result.tasks).toEqual([
			expect.objectContaining({ id: 'task-1', state_key: 'todo', archived: true })
		]);
		expect(result.message).toContain('ARCHIVED records, not active work');
	});

	it('leaves active rows and messages unchanged', async () => {
		const task = { id: 'task-1', title: 'Send proofs', state_key: 'todo', project: null };
		const result = await listOntoTasks(contextWith([task]), { project_id: PROJECT_ID });

		expect(result.tasks[0]).not.toHaveProperty('archived');
		expect(result.message).toBe('Found 1 ontology tasks.');
	});

	it('marks archived document rows', async () => {
		const document = { id: 'doc-1', title: 'Rod Recovery', state_key: 'archived' };
		const result = await listOntoDocuments(contextWith([document]), {
			project_id: PROJECT_ID,
			archived: true
		});

		expect(result.documents[0]).toMatchObject({ id: 'doc-1', archived: true });
		expect(result.message).toContain('ARCHIVED records');
	});
});

// Tasker 113: archived tasks now carry deleted_at too (board shape), so the archive read must
// not require deleted_at IS NULL, or "double-check those were archived" finds nothing.
describe('archived reads', () => {
	function recordingContext(rows: unknown[]) {
		const builder = makeBuilder(rows);
		const context = contextWith(rows);
		(context as any).client = { from: vi.fn(() => builder) };
		return { context, builder };
	}

	it('finds archived tasks whatever their deleted_at', async () => {
		const { context, builder } = recordingContext([]);
		await listOntoTasks(context, { project_id: PROJECT_ID, archived: true });
		expect(builder.not).toHaveBeenCalledWith('archived_at', 'is', null);
		expect(builder.is).not.toHaveBeenCalledWith('deleted_at', null);
	});

	it('keeps deleted rows out of active task reads and other archive reads', async () => {
		const tasks = recordingContext([]);
		await listOntoTasks(tasks.context, { project_id: PROJECT_ID });
		expect(tasks.builder.is).toHaveBeenCalledWith('deleted_at', null);
		expect(tasks.builder.is).toHaveBeenCalledWith('archived_at', null);

		const documents = recordingContext([]);
		await listOntoDocuments(documents.context, { project_id: PROJECT_ID, archived: true });
		expect(documents.builder.is).toHaveBeenCalledWith('deleted_at', null);
	});
});

describe('document detail read', () => {
	it('fences the body read to the project whose access was checked', async () => {
		const DOCUMENT_ID = '50000000-0000-4000-8000-000000000005';
		const queries: Array<{ eq: ReturnType<typeof vi.fn> }> = [];
		const responses = [
			{ data: { id: DOCUMENT_ID, project_id: PROJECT_ID }, error: null },
			// The document moved after the access check: the fenced read finds nothing.
			{ data: null, error: null }
		];
		const client = {
			from: vi.fn(() => {
				const index = queries.length;
				const query: Record<string, any> = {};
				for (const method of ['select', 'eq', 'is']) query[method] = vi.fn(() => query);
				query.maybeSingle = vi.fn(async () => responses[index]);
				queries.push(query as { eq: ReturnType<typeof vi.fn> });
				return query;
			})
		};
		const context = contextWith([]);
		(context as any).client = client;

		const result = await getOntoDocumentDetails(context, { document_id: DOCUMENT_ID });

		expect(context.access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(queries).toHaveLength(2);
		expect(queries[1]!.eq).toHaveBeenCalledWith('id', DOCUMENT_ID);
		expect(queries[1]!.eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
		expect(result).toMatchObject({ status: 'not_found', document: null });
	});
});
