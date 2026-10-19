// packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createTaskDocument } from './op-execution-gateway.documents';
import {
	createGoal,
	createPlan,
	createMilestone,
	createRisk
} from './op-execution-gateway.core-entities';

const { project } = vi.hoisted(() => ({
	project: { id: '11111111-1111-4111-8111-111111111111', name: 'Project', access_level: 'admin' }
}));
vi.mock('./op-execution-gateway.access', async (importOriginal) => ({
	...(await importOriginal<object>()),
	loadVisibleProjects: vi.fn(async () => ({
		projects: [project],
		projectMap: new Map([[project.id, project]])
	})),
	assertAccessibleProject: vi.fn(() => project),
	assertProjectWriteAccess: vi.fn(),
	contextActorId: vi.fn(async () => 'actor')
}));
vi.mock('./op-execution-gateway.entity-access', async (importOriginal) => ({
	...(await importOriginal<object>()),
	loadCoreEntityForAccess: vi.fn(async () => ({
		entity: { id: '22222222-2222-4222-8222-222222222222', title: 'Task' },
		project
	}))
}));
vi.mock('./op-execution-gateway.edges', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createOptionalParentEdges: vi.fn(),
	createEdge: vi.fn(async () => ({ edge: { id: 'edge' } }))
}));
vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	logUpdateAsync: vi.fn()
}));
vi.mock('../ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn()
}));
vi.mock('../ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(),
	toDocumentSnapshot: vi.fn((x) => x)
}));
vi.mock('../ontology/doc-structure.service', () => ({
	addDocumentToTree: vi.fn(),
	getDocTree: vi.fn(async () => ({ structure: { root: [] } })),
	getNodePath: vi.fn(() => [])
}));

function memoryDb() {
	const rows = new Map<string, Record<string, unknown>>();
	let sequence = 0;
	return {
		rows,
		admin: {
			from(table: string) {
				let payload: Record<string, unknown> | undefined;
				const filters: Array<[string, unknown]> = [];
				const run = async () => {
					if (payload) {
						const id = payload.id ?? `new-${++sequence}`;
						if (rows.has(`${table}:${id}`))
							return {
								data: null,
								error: { code: '23505', message: 'duplicate key' }
							};
						const row = { ...payload, id };
						rows.set(`${table}:${id}`, row);
						return { data: { ...row }, error: null };
					}
					const row = [...rows.entries()].find(
						([key, row]) =>
							key.startsWith(`${table}:`) && filters.every(([k, v]) => row[k] === v)
					)?.[1];
					return { data: row ? { ...row } : null, error: null };
				};
				const query: any = {
					insert: (value: Record<string, unknown>) => {
						payload = value;
						return query;
					},
					select: () => query,
					eq: (k: string, v: unknown) => {
						filters.push([k, v]);
						return query;
					},
					single: run,
					maybeSingle: run
				};
				return query;
			}
		}
	};
}

beforeEach(() => vi.clearAllMocks());
describe('downstream create idempotency', () => {
	it.each([
		[
			'document',
			createTaskDocument,
			{ task_id: '22222222-2222-4222-8222-222222222222', title: 'Task doc' }
		],
		['document', createDocument, { title: 'Document', content: 'Initial content' }],
		['goal', createGoal, { name: 'Goal' }],
		['plan', createPlan, { name: 'Plan' }],
		[
			'milestone',
			createMilestone,
			{ title: 'Milestone', goal_id: '22222222-2222-4222-8222-222222222222' }
		],
		['risk', createRisk, { title: 'Risk', impact: 'low' }]
	] as const)(
		'replays %s without duplicating or overwriting later edits',
		async (kind, create, args) => {
			const db = memoryDb();
			const context: any = {
				admin: db.admin,
				userId: 'user',
				scope: { mode: 'read_write' },
				downstreamIdempotencyKey: 'agent-run:run:change'
			};
			const first: any = await create(context, { ...args, project_id: project.id });
			const row = [...db.rows.values()][0]!;
			row.props = { human_edit: true };
			const second: any = await create(context, { ...args, project_id: project.id });
			expect(db.rows.size).toBe(1);
			expect(second[kind].id).toBe(first[kind].id);
			expect(second[kind].props).toEqual({ human_edit: true });
			await create(
				{ ...context, downstreamIdempotencyKey: 'agent-run:run:other' },
				{ ...args, project_id: project.id }
			);
			expect(db.rows.size).toBe(2);
		}
	);
});
