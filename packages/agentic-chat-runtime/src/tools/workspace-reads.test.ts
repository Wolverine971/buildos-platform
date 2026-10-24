// packages/agentic-chat-runtime/src/tools/workspace-reads.test.ts
//
// The Workspace tools on the worker's read lane (tasker 146): the Workspace comes from
// the acting user's actor, never from arguments; only live loose items count (not
// deleted, archived, pinned, or in another project); suggestions are the user's own,
// open, resolved to titles, and dropped when their items left; the two cards block
// instead of guessing and, when they do mint a card, it parses under the shared
// contract and matches the tool's own arguments exactly as the web resolver checks.
import { describe, expect, it, vi } from 'vitest';
import {
	parseProposalCardEnvelope,
	parseProposalCardNonCardResult,
	proposalCardSpec,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceProjectProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { AgenticChatToolAccessDeniedError, type AgenticChatToolAccessLevelV1 } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { executeAgenticChatSharedReadToolV1 } from './shared-read-dispatch';
import {
	listWorkspaceSuggestions,
	loadWorkspaceItemsV1,
	proposeWorkspaceFiling,
	proposeWorkspaceProject
} from './workspace-reads';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1);
const ACTOR = id(2);
const CARD = id(3);
const SESSION = id(4);
const TURN = id(5);
const WORKSPACE = id(10);
const OTHER_WORKSPACE = id(11);
const BUILDOS = id(20);
const ARCHIVED = id(21);
const READ_ONLY = id(22);
const NOTE = id(30);
const DOC = id(31);
const NESTED = id(32);
const TASK = id(33);
const DONE_ELSEWHERE = id(34);
const DELETED = id(35);
const ABOUT_YOU = id(36);
const SUGGEST_FILE = id(40);
const SUGGEST_START = id(41);
const SUGGEST_GONE = id(42);
const SUGGEST_OTHER_USER = id(43);
const NOW = new Date('2026-10-23T15:00:00.000Z');

type Row = Record<string, unknown>;

const PROJECTS: Row[] = [
	{
		id: WORKSPACE,
		name: 'Workspace',
		kind: 'workspace',
		created_by: ACTOR,
		deleted_at: null,
		archived_at: null,
		merged_into_project_id: null,
		doc_structure: { root: [{ id: DOC, children: [{ id: NESTED }] }, { id: NOTE }] }
	},
	{
		id: OTHER_WORKSPACE,
		name: 'Workspace',
		kind: 'workspace',
		created_by: id(99),
		deleted_at: null,
		archived_at: null,
		merged_into_project_id: null
	},
	{
		id: BUILDOS,
		name: 'BuildOS',
		kind: 'project',
		created_by: ACTOR,
		deleted_at: null,
		archived_at: null,
		merged_into_project_id: null
	},
	{
		id: ARCHIVED,
		name: 'Old Thing',
		kind: 'project',
		created_by: ACTOR,
		deleted_at: null,
		archived_at: '2026-10-01T00:00:00Z',
		merged_into_project_id: null
	},
	{
		id: READ_ONLY,
		name: 'Shared With Me',
		kind: 'project',
		created_by: id(99),
		deleted_at: null,
		archived_at: null,
		merged_into_project_id: null
	}
];

const doc = (docId: string, extra: Row = {}): Row => ({
	id: docId,
	title: 'Untitled',
	type_key: 'document.default',
	project_id: WORKSPACE,
	state_key: 'draft',
	deleted_at: null,
	archived_at: null,
	...extra
});

const DOCUMENTS: Row[] = [
	doc(NOTE, { title: 'Pricing thought', type_key: 'document.note' }),
	doc(DOC, { title: 'Reading list' }),
	doc(NESTED, { title: 'Week one' }),
	doc(DELETED, { title: 'Gone', deleted_at: '2026-10-22T00:00:00Z' }),
	doc(ABOUT_YOU, { title: 'About you', type_key: 'document.context.about_you' })
];

const TASKS: Row[] = [
	{
		id: TASK,
		title: 'Email Cadre',
		project_id: WORKSPACE,
		deleted_at: null,
		archived_at: null
	},
	{
		id: DONE_ELSEWHERE,
		title: 'Ship it',
		project_id: BUILDOS,
		deleted_at: null,
		archived_at: null
	}
];

const suggestion = (suggestionId: string, extra: Row): Row => ({
	id: suggestionId,
	user_id: USER,
	workspace_project_id: WORKSPACE,
	status: 'open',
	reason: 'Looks related.',
	confidence: 0.8,
	proposed_name: null,
	target_project_id: null,
	items: [],
	created_at: '2026-10-23T10:00:00.000Z',
	...extra
});

const SUGGESTIONS: Row[] = [
	suggestion(SUGGEST_FILE, {
		kind: 'file',
		target_project_id: BUILDOS,
		items: [
			{ kind: 'document', id: NOTE },
			{ kind: 'document', id: DELETED }
		]
	}),
	suggestion(SUGGEST_START, {
		kind: 'graduate',
		proposed_name: 'Kids History Project',
		items: [
			{ kind: 'document', id: DOC },
			{ kind: 'task', id: TASK }
		],
		created_at: '2026-10-23T09:00:00.000Z'
	}),
	// Its only item was filed: dropped from the list.
	suggestion(SUGGEST_GONE, {
		kind: 'file',
		target_project_id: BUILDOS,
		items: [{ kind: 'task', id: DONE_ELSEWHERE }]
	}),
	suggestion(SUGGEST_OTHER_USER, {
		kind: 'file',
		user_id: id(98),
		target_project_id: BUILDOS,
		items: [{ kind: 'document', id: NOTE }]
	})
];

function fakeClient(tables: Record<string, Row[]>) {
	const from = vi.fn((table: string) => {
		const filters: Array<(row: Row) => boolean> = [];
		let limit: number | null = null;
		const query: any = {
			select: () => query,
			eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), query),
			in: (key: string, values: unknown[]) => (
				filters.push((row) => values.includes(row[key])),
				query
			),
			is: (key: string, value: unknown) => (
				filters.push((row) => (row[key] ?? null) === value),
				query
			),
			order: () => query,
			limit: (value: number) => ((limit = value), query),
			then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
				const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
				return Promise.resolve({
					data: limit === null ? rows : rows.slice(0, limit),
					error: null
				}).then(resolve, reject);
			}
		};
		return query;
	});
	return { from };
}

function context(
	options: {
		access?: Record<string, AgenticChatToolAccessLevelV1>;
		withoutProposal?: boolean;
		tables?: Partial<Record<string, Row[]>>;
	} = {}
): AgenticChatSharedReadContextV1 {
	const access = options.access ?? {
		[BUILDOS]: 'admin',
		[ARCHIVED]: 'admin',
		[READ_ONLY]: 'read'
	};
	const rank = { read: 1, write: 2, admin: 3 } as const;
	return {
		client: fakeClient({
			onto_projects: PROJECTS,
			onto_documents: DOCUMENTS,
			onto_tasks: TASKS,
			workspace_suggestions: SUGGESTIONS,
			...(options.tables as Record<string, Row[]>)
		}) as never,
		userId: USER,
		timezone: null,
		access: {
			getActorId: async () => ACTOR,
			resolveProjectSummaries: async () => [],
			assertProjectAccess: async (projectId: string, level: AgenticChatToolAccessLevelV1) => {
				const granted = access[projectId];
				if (!granted || rank[granted] < rank[level])
					throw new AgenticChatToolAccessDeniedError();
			},
			assertEntityAccess: async () => undefined
		},
		...(options.withoutProposal
			? {}
			: {
					proposal: {
						toolExecutionId: CARD,
						sessionId: SESSION,
						turnRunId: TURN,
						startDuplicateCheck: async () => null,
						now: () => NOW
					}
				})
	};
}

describe('loadWorkspaceItemsV1', () => {
	it('keeps live loose items in order and counts docs nested under moving docs', async () => {
		const view = await loadWorkspaceItemsV1(context().client, {
			workspaceProjectId: WORKSPACE,
			items: [
				{ entity: 'task', id: TASK },
				{ entity: 'document', id: DOC },
				{ entity: 'document', id: DELETED },
				{ entity: 'document', id: ABOUT_YOU },
				{ entity: 'task', id: DONE_ELSEWHERE }
			]
		});
		expect(view.items).toEqual([
			{ entity: 'task', id: TASK, kind: 'task', title: 'Email Cadre' },
			{ entity: 'document', id: DOC, kind: 'doc', title: 'Reading list' }
		]);
		// Deleted, pinned (About you) and items in another project are not loose.
		expect(view.missing.map((item) => item.id)).toEqual([DELETED, ABOUT_YOU, DONE_ELSEWHERE]);
		expect(view.nested_documents).toBe(1);
	});

	it('does not count a nested doc that moves on its own', async () => {
		const view = await loadWorkspaceItemsV1(context().client, {
			workspaceProjectId: WORKSPACE,
			items: [
				{ entity: 'document', id: DOC },
				{ entity: 'document', id: NESTED }
			]
		});
		expect(view.items).toHaveLength(2);
		expect(view.nested_documents).toBe(0);
	});
});

describe('list_workspace_suggestions', () => {
	it("lists the user's open suggestions with live items only", async () => {
		const result = await listWorkspaceSuggestions(context());
		expect(result.workspace_project_id).toBe(WORKSPACE);
		expect(result.total).toBe(2);
		expect(result.suggestions).toEqual([
			{
				id: SUGGEST_FILE,
				kind: 'file',
				reason: 'Looks related.',
				confidence: 0.8,
				target_project: { id: BUILDOS, name: 'BuildOS' },
				items: [{ entity: 'document', id: NOTE, kind: 'note', title: 'Pricing thought' }],
				created_at: '2026-10-23T10:00:00.000Z'
			},
			{
				id: SUGGEST_START,
				kind: 'graduate',
				reason: 'Looks related.',
				confidence: 0.8,
				proposed_name: 'Kids History Project',
				items: [
					{ entity: 'document', id: DOC, kind: 'doc', title: 'Reading list' },
					{ entity: 'task', id: TASK, kind: 'task', title: 'Email Cadre' }
				],
				created_at: '2026-10-23T09:00:00.000Z'
			}
		]);
	});

	it('drops a filing suggestion whose project the user can no longer add to', async () => {
		const result = await listWorkspaceSuggestions(context({ access: {} }));
		expect((result.suggestions as Array<{ id: string }>).map((s) => s.id)).toEqual([
			SUGGEST_START
		]);
	});

	it('answers plainly when the user has no Workspace yet', async () => {
		const result = await listWorkspaceSuggestions(
			context({ tables: { onto_projects: PROJECTS.filter((p) => p.id !== WORKSPACE) } })
		);
		expect(result).toMatchObject({ workspace_project_id: null, suggestions: [], total: 0 });
	});

	it('runs through the shared dispatch', async () => {
		const result = await executeAgenticChatSharedReadToolV1({
			toolName: 'list_workspace_suggestions',
			context: context(),
			arguments: {}
		});
		expect(result.total).toBe(2);
	});
});

describe('propose_workspace_filing', () => {
	const args = {
		items: [
			{ entity: 'document' as const, id: NOTE },
			{ entity: 'document' as const, id: DOC }
		],
		target_project_id: BUILDOS,
		reason: '  Both are about pricing.  '
	};

	it('mints a card that parses and matches its own arguments', async () => {
		const result = await proposeWorkspaceFiling(context(), args);
		const card = parseProposalCardEnvelope(result);
		expect(card?.kind).toBe('workspace_file');
		expect(card?.card_id).toBe(CARD);
		const payload = card!.client_action.payload as WorkspaceFileProposalPayloadV1;
		expect(payload).toMatchObject({
			workspace: { id: WORKSPACE, name: 'Workspace' },
			target: { id: BUILDOS, name: 'BuildOS' },
			nested_documents: 1,
			suggestion_id: null,
			reason: 'Both are about pricing.',
			checked_at: NOW.toISOString()
		});
		expect(payload.items.map((item) => item.title)).toEqual([
			'Pricing thought',
			'Reading list'
		]);
		expect(proposalCardSpec('workspace_file').argumentsMatch(args, payload)).toBe(true);
		expect(card?.message).toContain('only the user');
	});

	it('answers a matching open suggestion', async () => {
		const withSuggestion = { ...args, items: [args.items[0]!], suggestion_id: SUGGEST_FILE };
		const card = parseProposalCardEnvelope(
			await proposeWorkspaceFiling(context(), withSuggestion)
		);
		expect(card?.client_action.payload).toMatchObject({ suggestion_id: SUGGEST_FILE });
		expect(
			proposalCardSpec('workspace_file').argumentsMatch(
				withSuggestion,
				card!.client_action.payload
			)
		).toBe(true);
	});

	it.each([
		['the Workspace itself', { target_project_id: WORKSPACE }, {}, 'target_is_workspace'],
		[
			'a project the user can only read',
			{ target_project_id: READ_ONLY },
			{},
			'target_not_found'
		],
		['an archived project', { target_project_id: ARCHIVED }, {}, 'target_archived'],
		[
			'an item that is not loose',
			{ items: [{ entity: 'task', id: DONE_ELSEWHERE }] },
			{},
			'items_not_in_workspace'
		],
		[
			'a pinned doc',
			{ items: [{ entity: 'document', id: ABOUT_YOU }] },
			{},
			'items_not_in_workspace'
		],
		[
			'a closed suggestion',
			{ suggestion_id: SUGGEST_GONE },
			{ status: 'dismissed' },
			'suggestion_not_open'
		],
		[
			"another user's suggestion",
			{ suggestion_id: SUGGEST_OTHER_USER },
			{},
			'suggestion_not_open'
		],
		['a graduate suggestion', { suggestion_id: SUGGEST_START }, {}, 'suggestion_not_open']
	])('blocks %s', async (_label, overrides, suggestionPatch, code) => {
		const tables = Object.keys(suggestionPatch).length
			? {
					workspace_suggestions: SUGGESTIONS.map((row) =>
						row.id === SUGGEST_GONE ? { ...row, ...suggestionPatch } : row
					)
				}
			: {};
		const result = await proposeWorkspaceFiling(context({ tables }), {
			...args,
			items: [args.items[0]!],
			...(overrides as object)
		});
		expect(parseProposalCardNonCardResult(result)).toMatchObject({
			status: 'blocked',
			kind: 'workspace_file',
			reason_code: code
		});
	});

	it('blocks a suggestion for a different project', async () => {
		const tables = {
			workspace_suggestions: SUGGESTIONS.map((row) =>
				row.id === SUGGEST_FILE ? { ...row, target_project_id: ARCHIVED } : row
			)
		};
		const result = await proposeWorkspaceFiling(context({ tables }), {
			...args,
			suggestion_id: SUGGEST_FILE
		});
		expect(parseProposalCardNonCardResult(result)?.reason_code).toBe(
			'suggestion_target_mismatch'
		);
	});

	it('fails the call on bad arguments and without the card identity', async () => {
		await expect(proposeWorkspaceFiling(context(), { ...args, items: [] })).rejects.toThrow(
			'items must name 1 to 20'
		);
		await expect(
			proposeWorkspaceFiling(context(), {
				...args,
				items: [{ entity: 'goal' as never, id: NOTE }]
			})
		).rejects.toThrow("entity must be 'document' or 'task'");
		await expect(
			proposeWorkspaceFiling(context(), { ...args, target_project_id: 'BuildOS' })
		).rejects.toThrow('target_project_id must be a UUID');
		await expect(
			proposeWorkspaceFiling(context({ withoutProposal: true }), args)
		).rejects.toThrow('only available where chat can show its card');
	});
});

describe('propose_workspace_project', () => {
	const args = {
		name: '  Kids   History Project ',
		items: [
			{ entity: 'document' as const, id: DOC },
			{ entity: 'task' as const, id: TASK }
		],
		suggestion_id: SUGGEST_START
	};

	it('mints a card with the cleaned name that matches its own arguments', async () => {
		const card = parseProposalCardEnvelope(await proposeWorkspaceProject(context(), args));
		expect(card?.kind).toBe('workspace_project');
		const payload = card!.client_action.payload as WorkspaceProjectProposalPayloadV1;
		expect(payload).toMatchObject({
			name: 'Kids History Project',
			description: null,
			nested_documents: 1,
			suggestion_id: SUGGEST_START
		});
		expect(proposalCardSpec('workspace_project').argumentsMatch(args, payload)).toBe(true);
	});

	it('needs two loose items, a name, and an open graduate suggestion', async () => {
		await expect(
			proposeWorkspaceProject(context(), { ...args, items: [args.items[0]!] })
		).rejects.toThrow('items must name 2 to 20');
		await expect(proposeWorkspaceProject(context(), { ...args, name: '   ' })).rejects.toThrow(
			'name is required'
		);
		expect(
			parseProposalCardNonCardResult(
				await proposeWorkspaceProject(context(), { ...args, suggestion_id: SUGGEST_FILE })
			)?.reason_code
		).toBe('suggestion_not_open');
		expect(
			parseProposalCardNonCardResult(
				await proposeWorkspaceProject(context(), {
					...args,
					items: [...args.items, { entity: 'document', id: DELETED }]
				})
			)?.reason_code
		).toBe('items_not_in_workspace');
	});
});
