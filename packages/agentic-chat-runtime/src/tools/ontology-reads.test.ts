// packages/agentic-chat-runtime/src/tools/ontology-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { listOntoDocuments, listOntoTasks } from './ontology-reads';

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
