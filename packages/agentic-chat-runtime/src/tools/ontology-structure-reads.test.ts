// packages/agentic-chat-runtime/src/tools/ontology-structure-reads.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

const sharedOps = vi.hoisted(() => ({
	getDocTree: vi.fn(),
	loadProjectGraphData: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops/ontology/doc-structure.service', () => ({
	getDocTree: sharedOps.getDocTree
}));

vi.mock('@buildos/shared-agent-ops/ontology/project-graph-loader', () => ({
	loadProjectGraphData: sharedOps.loadProjectGraphData
}));

import { getDocumentPath, getDocumentTree, getOntoProjectGraph } from './ontology-structure-reads';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const DOCUMENT_ID = '50000000-0000-4000-8000-000000000005';

function contextWith(client: Record<string, unknown> = { from: vi.fn() }): {
	context: AgenticChatSharedReadContextV1;
	assertProjectAccess: ReturnType<typeof vi.fn>;
} {
	const assertProjectAccess = vi.fn(async () => {});
	return {
		context: {
			client: client as never,
			userId: 'user-1',
			timezone: null,
			access: {
				getActorId: vi.fn(async () => 'actor-1'),
				resolveProjectSummaries: vi.fn(async () => []),
				assertProjectAccess,
				assertEntityAccess: vi.fn(async () => {})
			}
		},
		assertProjectAccess
	};
}

function detailClient(rows: Array<Record<string, unknown> | null>) {
	const builders: Array<Record<string, any>> = [];
	const from = vi.fn(() => {
		const builder: Record<string, any> = {};
		for (const method of ['select', 'eq', 'is']) {
			builder[method] = vi.fn(() => builder);
		}
		const row = rows[builders.length] ?? null;
		builder.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
		builders.push(builder);
		return builder;
	});
	return { client: { from }, builders };
}

describe('shared ontology structure reads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads the complete project graph through the access port and strips internal fields', async () => {
		sharedOps.loadProjectGraphData.mockResolvedValue({
			project: { id: PROJECT_ID, name: 'Launch', search_vector: "'launch':1" },
			tasks: [{ id: 'task-1', title: 'Ship', search_vector: "'ship':1" }],
			edges: []
		});
		const { context, assertProjectAccess } = contextWith();

		await expect(
			getOntoProjectGraph(
				context,
				{ project_id: PROJECT_ID },
				() => new Date('2026-08-08T12:00:00.000Z')
			)
		).resolves.toEqual({
			graph: {
				project: { id: PROJECT_ID, name: 'Launch' },
				tasks: [{ id: 'task-1', title: 'Ship' }],
				edges: []
			},
			metadata: {
				projectId: PROJECT_ID,
				queryPattern: 'project-graph-loader',
				generatedAt: '2026-08-08T12:00:00.000Z'
			},
			message: 'Complete ontology project graph loaded.'
		});
		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(sharedOps.loadProjectGraphData).toHaveBeenCalledWith(context.client, PROJECT_ID, {
			excludeCompletedTasks: true
		});
	});

	it('preserves the legacy tree payload, flags, node counting, and unlinked message', async () => {
		sharedOps.getDocTree.mockResolvedValue({
			structure: {
				version: 1,
				root: [
					{
						id: 'folder-1',
						title: 'Folder',
						children: [{ id: DOCUMENT_ID, title: 'Brief' }]
					}
				]
			},
			documents: {
				[DOCUMENT_ID]: { id: DOCUMENT_ID, title: 'Brief', search_vector: "'brief':1" }
			},
			unlinked: [{ id: 'doc-unlinked', title: 'Notes', search_vector: "'notes':1" }],
			archived: [{ id: 'doc-archived' }]
		});
		const { context, assertProjectAccess } = contextWith();

		await expect(
			getDocumentTree(context, {
				project_id: PROJECT_ID,
				include_documents: true,
				include_content: true
			})
		).resolves.toEqual({
			structure: {
				version: 1,
				root: [
					{
						id: 'folder-1',
						title: 'Folder',
						children: [{ id: DOCUMENT_ID, title: 'Brief' }]
					}
				]
			},
			documents: {
				[DOCUMENT_ID]: {
					id: DOCUMENT_ID,
					title: 'Brief',
					search_vector: "'brief':1"
				}
			},
			unlinked: [{ id: 'doc-unlinked', title: 'Notes', search_vector: "'notes':1" }],
			message:
				'Document tree loaded with 2 nodes. 1 documents are not in the tree structure. 1 archived documents are hidden.'
		});
		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(sharedOps.getDocTree).toHaveBeenCalledWith(context.client, PROJECT_ID, {
			includeDocuments: true,
			includeContent: true
		});
	});

	it('authorizes an inferred document project before loading its structure', async () => {
		const { client, builders } = detailClient([
			{ id: DOCUMENT_ID, project_id: PROJECT_ID },
			{ id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Loose Notes' }
		]);
		sharedOps.getDocTree.mockResolvedValue({
			structure: { version: 1, root: [] },
			documents: {},
			unlinked: [],
			archived: []
		});
		const { context, assertProjectAccess } = contextWith(client);

		await expect(getDocumentPath(context, { document_id: DOCUMENT_ID })).resolves.toEqual({
			path: [],
			document_id: DOCUMENT_ID,
			project_id: PROJECT_ID,
			message: 'Document "Loose Notes" is not placed in the tree (unlinked).'
		});
		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(builders[1].eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
		expect(sharedOps.getDocTree).toHaveBeenCalledWith(client, PROJECT_ID, {
			includeDocuments: false,
			includeContent: false
		});
	});

	it('builds a titled path from the stored tree without loading document bodies', async () => {
		sharedOps.getDocTree.mockResolvedValue({
			structure: {
				version: 1,
				root: [
					{
						id: 'folder-1',
						title: 'Research',
						children: [{ id: DOCUMENT_ID, title: 'Brief' }]
					}
				]
			},
			documents: {},
			unlinked: [],
			archived: []
		});
		const { context } = contextWith();

		await expect(
			getDocumentPath(context, { project_id: PROJECT_ID, document_id: DOCUMENT_ID })
		).resolves.toEqual({
			path: [
				{ id: 'folder-1', title: 'Research' },
				{ id: DOCUMENT_ID, title: 'Brief' }
			],
			document_id: DOCUMENT_ID,
			project_id: PROJECT_ID,
			message: 'Document path: Research > Brief'
		});
	});
});

// Tasker 113: 4 of 9 archived documents in prod still sat in doc_structure, and ws01's
// tree read listed them as live. The chat graph showed connector-archived records too.
describe('chat structure reads keep to the present', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('drops archived tree nodes, lifts their live children, and hides archived documents', async () => {
		sharedOps.getDocTree.mockResolvedValue({
			structure: {
				version: 1,
				root: [
					{
						id: 'doc-archived-folder',
						title: 'Tacemus',
						children: [{ id: 'doc-live-child', title: 'Still current' }]
					},
					{ id: 'doc-connector-archived', title: 'Rod recovery' },
					{ id: 'doc-live', title: 'Brief' }
				]
			},
			documents: {
				'doc-archived-folder': { id: 'doc-archived-folder', state_key: 'archived' },
				'doc-live-child': { id: 'doc-live-child', state_key: 'draft' },
				'doc-connector-archived': {
					id: 'doc-connector-archived',
					state_key: 'draft',
					archived_at: '2026-03-02T00:00:00.000Z'
				},
				'doc-live': { id: 'doc-live', state_key: 'ready' }
			},
			unlinked: [],
			archived: [{ id: 'doc-archived-folder', state_key: 'archived' }]
		});
		const { context } = contextWith();

		const result = await getDocumentTree(context, { project_id: PROJECT_ID });

		expect(result.structure.root).toEqual([
			{ id: 'doc-live-child', title: 'Still current' },
			{ id: 'doc-live', title: 'Brief' }
		]);
		expect(result.documents).toEqual({});
		expect(result.message).toContain('2 archived documents are hidden.');
		expect(sharedOps.getDocTree).toHaveBeenCalledWith(context.client, PROJECT_ID, {
			includeDocuments: true,
			includeContent: false
		});
	});

	it('drops archived graph records and every edge that reaches them', async () => {
		sharedOps.loadProjectGraphData.mockResolvedValue({
			project: { id: PROJECT_ID },
			tasks: [{ id: 'task-live' }, { id: 'task-archived', archived_at: '2026-07-02T00:00:00Z' }],
			goals: [{ id: 'goal-archived', archived_at: '2026-07-02T00:00:00Z' }],
			documents: [{ id: 'doc-tree-archived', state_key: 'archived' }],
			edges: [
				{ src_id: 'task-live', dst_id: 'goal-archived' },
				{ src_id: 'task-archived', dst_id: 'task-live' },
				{ src_id: 'task-live', dst_id: 'doc-tree-archived' },
				{ src_id: PROJECT_ID, dst_id: 'task-live' }
			]
		});
		const { context } = contextWith();

		const result = await getOntoProjectGraph(context, { project_id: PROJECT_ID });

		expect(result.graph.tasks).toEqual([{ id: 'task-live' }]);
		expect(result.graph.goals).toEqual([]);
		expect(result.graph.documents).toEqual([]);
		expect(result.graph.edges).toEqual([{ src_id: PROJECT_ID, dst_id: 'task-live' }]);
	});
});
