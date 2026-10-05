// apps/web/src/lib/server/consolidation/consolidation-tasks.test.ts
// Task merges, plans, roll-ups and closings against an in-memory database,
// and Undo putting each back.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	prepareRelationshipMutationPlan: vi.fn(async () => ({ operations: [] }))
}));

import { applyTaskOps, emptyTaskReceipt, undoTaskChanges } from './consolidation-tasks';

type Row = Record<string, any>;
let db: Record<string, Row[]>;
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 9, 4, 12, 0, clock++)).toISOString();

/** Enough of the Supabase client for the task writes: queries, inserts, updates, deletes, two RPCs. */
function fakeClient() {
	return {
		rpc: async (name: string, args: Row) => {
			if (name === 'onto_plan_create_atomic') {
				db.onto_plans!.push({ ...args.p_plan, deleted_at: null, updated_at: tick() });
				return { data: { plan: args.p_plan }, error: null };
			}
			if (name === 'onto_task_create_with_relationships_atomic') {
				db.onto_tasks!.push({ ...args.p_task, deleted_at: null, updated_at: tick() });
				return { data: { task: args.p_task }, error: null };
			}
			return { data: null, error: { message: `unknown rpc ${name}` } };
		},
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let mode: 'select' | 'update' | 'insert' | 'delete' = 'select';
			let payload: any = null;
			const rows = () => (db[table] ??= []);
			const run = () => {
				if (mode === 'insert') {
					const inserted = (Array.isArray(payload) ? payload : [payload]).map(
						(row: Row) => ({
							id: `${table}-${clock++}`,
							...row
						})
					);
					rows().push(...inserted);
					return inserted;
				}
				const matched = rows().filter((row) => filters.every((test) => test(row)));
				if (mode === 'update')
					for (const row of matched) {
						Object.assign(row, payload);
						// The database stamps every write.
						if (!('updated_at' in payload) && 'updated_at' in row)
							row.updated_at = tick();
					}
				if (mode === 'delete') db[table] = rows().filter((row) => !matched.includes(row));
				return matched;
			};
			const builder: any = {
				select: () => builder,
				eq: (column: string, value: unknown) => (
					filters.push((row) => row[column] === value),
					builder
				),
				in: (column: string, values: unknown[]) => (
					filters.push((row) => values.includes(row[column])),
					builder
				),
				is: (column: string, value: unknown) => (
					filters.push((row) => (row[column] ?? null) === value),
					builder
				),
				update: (patch: Row) => ((mode = 'update'), (payload = patch), builder),
				insert: (value: unknown) => ((mode = 'insert'), (payload = value), builder),
				delete: () => ((mode = 'delete'), builder),
				maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
					Promise.resolve({ data: run(), error: null }).then(resolve, reject)
			};
			return builder;
		}
	};
}

const [WAYNE, BUILDOS, HANNIBAL, JULIAN] = ['p-wayne', 'p-buildos', 'p-hannibal', 'p-julian'];
const task = (id: string, title: string, project_id = BUILDOS, extra: Row = {}): Row => ({
	id,
	project_id,
	title,
	description: null,
	state_key: 'todo',
	completed_at: null,
	props: {},
	updated_at: '2026-10-01T00:00:00.000Z',
	deleted_at: null,
	...extra
});

function setup(tasks: Row[], extra: Partial<Record<string, Row[]>> = {}) {
	db = {
		onto_tasks: tasks,
		onto_plans: [],
		onto_edges: [],
		onto_events: [],
		onto_documents: [],
		...extra
	} as Record<string, Row[]>;
}

const session = () => fakeClient() as never;
function apply(ops: any[]) {
	const receipt = emptyTaskReceipt();
	const failures: any[] = [];
	return applyTaskOps(
		{
			session: session(),
			actorId: 'actor-1',
			runId: 'run-1',
			ops,
			inFamily: (id) => [WAYNE, BUILDOS, HANNIBAL, JULIAN].includes(id),
			projectName: (id) =>
				({ [HANNIBAL]: 'Hannibal Is Hungry', [JULIAN]: 'Julian Dorey' })[id] ?? 'BuildOS',
			documentTitle: () => 'a doc',
			save: async () => undefined
		},
		receipt,
		failures
	).then(() => ({ receipt, failures }));
}
async function undo(receipt: ReturnType<typeof emptyTaskReceipt>) {
	const out = { undone: [] as string[], left: [] as string[], failures: [] as string[] };
	await undoTaskChanges({
		session: session(),
		tasks: receipt,
		...out,
		save: async () => undefined
	});
	return out;
}
const row = (id: string) => db.onto_tasks!.find((item) => item.id === id)!;

beforeEach(() => {
	clock = 0;
});

describe('merge_tasks', () => {
	it('folds duplicates into the kept task as checklist lines, archives them, and undoes cleanly', async () => {
		setup([
			task('kit', 'Twitter brand kit: icon + 3 templates + rollout note', BUILDOS, {
				description: 'Ship by Friday.'
			}),
			task('guides', 'Create Twitter visual brand guidelines for BuildOS', BUILDOS, {
				description: 'Logo spacing, colors.'
			}),
			task('palette', 'Define color palette and typography for Twitter posts')
		]);
		const { receipt, failures } = await apply([
			{ op: 'merge_tasks', task_ids: ['guides', 'palette'], keep_id: 'kit' }
		]);
		expect(failures).toEqual([]);
		expect(row('kit').description).toContain('Ship by Friday.');
		expect(row('kit').description).toContain(
			'☐ Create Twitter visual brand guidelines for BuildOS\n   Logo spacing, colors.'
		);
		expect(row('kit').description).toContain(
			'☐ Define color palette and typography for Twitter posts'
		);
		expect(row('guides')).toMatchObject({
			archived_at: expect.any(String),
			props: { consolidation: { merged_into: 'kit', run_id: 'run-1' } }
		});

		const result = await undo(receipt);
		expect(result.failures).toEqual([]);
		expect(row('kit').description).toBe('Ship by Friday.');
		expect(row('guides')).toMatchObject({ deleted_at: null, archived_at: null, props: {} });
	});

	it('leaves a duplicate with calendar events open, since archiving would delete them', async () => {
		setup([task('kit', 'Kit'), task('guides', 'Guides')], {
			onto_events: [
				{ owner_entity_type: 'task', owner_entity_id: 'guides', deleted_at: null }
			]
		});
		const { failures } = await apply([
			{ op: 'merge_tasks', task_ids: ['guides'], keep_id: 'kit' }
		]);
		expect(failures[0]).toMatchObject({
			id: 'guides',
			message: expect.stringContaining('calendar')
		});
		expect(row('guides').deleted_at).toBeNull();
		expect(row('kit').description).toBeNull();
	});
});

describe('close_tasks', () => {
	it('marks a task done as of its evidence doc, citing it', async () => {
		setup([task('script', 'Script 90-second launch video')], {
			onto_documents: [
				{
					id: 'doc-script',
					title: 'Launch video script',
					created_at: '2026-09-19T15:00:00.000Z',
					deleted_at: null
				}
			]
		});
		await apply([
			{
				op: 'close_tasks',
				task_ids: ['script'],
				how: 'done',
				evidence_document_id: 'doc-script',
				note: 'The script is written.'
			}
		]);
		expect(row('script')).toMatchObject({
			state_key: 'done',
			completed_at: '2026-09-19T15:00:00.000Z'
		});
		expect(row('script').description).toContain('See “Launch video script”.');
	});

	it('does not mark done when the evidence doc is gone', async () => {
		setup([task('script', 'Script')]);
		const { failures } = await apply([
			{
				op: 'close_tasks',
				task_ids: ['script'],
				how: 'done',
				evidence_document_id: 'gone',
				note: 'x'
			}
		]);
		expect(row('script').state_key).toBe('todo');
		expect(failures[0].message).toMatch(/evidence/);
	});
});

describe('plan_tasks', () => {
	it('puts steps in order in a new plan, each waiting on the one before, and undo removes it', async () => {
		setup([
			task('format', 'Decide hackathon format and set date'),
			task('scenario', 'Define the hackathon scenario'),
			task('landing', 'Build hackathon landing page')
		]);
		const { receipt } = await apply([
			{
				op: 'plan_tasks',
				task_ids: ['format', 'scenario', 'landing'],
				project_id: BUILDOS,
				name: 'Hackathon',
				sequence: true
			}
		]);
		expect(db.onto_plans).toHaveLength(1);
		expect(db.onto_plans![0]).toMatchObject({ name: 'Hackathon', project_id: BUILDOS });
		const edges = db.onto_edges!;
		expect(edges.filter((edge) => edge.rel === 'has_task').map((edge) => edge.dst_id)).toEqual([
			'format',
			'scenario',
			'landing'
		]);
		expect(
			edges
				.filter((edge) => edge.rel === 'depends_on')
				.map((edge) => [edge.src_id, edge.dst_id])
		).toEqual([
			['scenario', 'format'],
			['landing', 'scenario']
		]);

		await undo(receipt);
		expect(db.onto_edges).toHaveLength(0);
		expect(db.onto_plans![0]!.deleted_at).toEqual(expect.any(String));
	});

	it('leaves a task that is already in a plan where it is', async () => {
		setup(
			[
				task('suite', 'Create User Guide Suite'),
				task('adhd', 'ADHD guide'),
				task('writers', 'Writers guide')
			],
			{
				onto_edges: [
					{
						id: 'e0',
						src_kind: 'plan',
						src_id: 'old-plan',
						rel: 'has_task',
						dst_kind: 'task',
						dst_id: 'adhd'
					}
				]
			}
		);
		const { failures } = await apply([
			{
				op: 'plan_tasks',
				task_ids: ['suite', 'adhd', 'writers'],
				project_id: BUILDOS,
				name: 'Guides',
				sequence: false
			}
		]);
		expect(failures.map((item) => item.id)).toEqual(['adhd']);
		expect(
			db.onto_edges!.filter((edge) => edge.src_id !== 'old-plan').map((edge) => edge.dst_id)
		).toEqual(['suite', 'writers']);
	});
});

describe('rollup_tasks', () => {
	it('adds one task in the parent with a checklist naming each project, and undo archives it', async () => {
		setup([
			task('hannibal', 'Finalize and send Hannibal outreach', HANNIBAL),
			task('julian', 'Finalize and send JDP team outreach', JULIAN)
		]);
		const { receipt } = await apply([
			{
				op: 'rollup_tasks',
				task_ids: ['hannibal', 'julian'],
				project_id: WAYNE,
				title: 'Send creator outreach (2)'
			}
		]);
		const created = db.onto_tasks!.find((item) => item.title === 'Send creator outreach (2)')!;
		expect(created.project_id).toBe(WAYNE);
		expect(created.description).toContain(
			'☐ Finalize and send Hannibal outreach (Hannibal Is Hungry)'
		);
		expect(row('hannibal').deleted_at).toBeNull();
		await undo(receipt);
		expect(created.deleted_at).toEqual(expect.any(String));
	});
});

describe('undo', () => {
	it('keeps an edit made after Apply and lists the task instead of overwriting it', async () => {
		setup([task('kit', 'Kit'), task('guides', 'Guides')]);
		const { receipt } = await apply([
			{ op: 'merge_tasks', task_ids: ['guides'], keep_id: 'kit' }
		]);
		row('kit').description = 'I rewrote this after the merge.';
		row('kit').updated_at = tick();
		const result = await undo(receipt);
		expect(row('kit').description).toBe('I rewrote this after the merge.');
		expect(result.left).toEqual(['Kit: changed after Apply']);
		expect(row('guides').deleted_at).toBeNull();
	});
});
