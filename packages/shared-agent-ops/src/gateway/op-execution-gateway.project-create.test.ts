import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const COUNTS = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	documents: 1,
	sources: 0,
	metrics: 0,
	milestones: 0,
	risks: 0,
	edges: 0
};
const CREATED_ENTITIES = [
	{ kind: 'project', id: PROJECT_ID, project_id: PROJECT_ID },
	{ kind: 'document', id: DOCUMENT_ID, project_id: PROJECT_ID }
];

const mocks = vi.hoisted(() => ({
	instantiateProject: vi.fn()
}));

vi.mock('../ontology/instantiation.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('../ontology/instantiation.service')>()),
	instantiateProject: mocks.instantiateProject
}));

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';

function context(admin: unknown) {
	return {
		admin,
		userId: USER_ID,
		scope: {
			mode: 'read_write',
			allowed_ops: ['onto.project.create'],
			project_ids: [],
			write_project_ids: []
		}
	} as never;
}

function admin(queueError: unknown = null) {
	const project = {
		id: PROJECT_ID,
		name: 'Launch Site',
		description: 'Ship it',
		type_key: 'project.business.product_launch',
		state_key: 'active',
		props: { facets: { stage: 'execution' } }
	};
	const query: Record<string, any> = {};
	query.select = vi.fn(() => query);
	query.eq = vi.fn(() => query);
	query.maybeSingle = vi.fn(async () => ({ data: project, error: null }));
	return {
		client: {
			from: vi.fn(() => query),
			rpc: vi.fn(async () => ({ data: null, error: queueError }))
		},
		project
	};
}

describe('project gateway create parity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.instantiateProject.mockResolvedValue({
			project_id: PROJECT_ID,
			counts: COUNTS,
			created_entities: CREATED_ENTITIES
		});
	});

	it('strips server-owned project props, returns created refs, and queues the snapshot', async () => {
		const fixture = admin();
		const result = await EXTERNAL_OP_HANDLERS['onto.project.create'](context(fixture.client), {
			project: {
				name: 'Launch Site',
				type_key: 'project.business.product_launch',
				description: 'Ship it',
				state_key: 'active',
				props: {
					facets: { stage: 'execution' },
					preferences: { hidden: true },
					agent_workspace: { mode: 'living_reference' }
				}
			},
			entities: [],
			relationships: [],
			context_document: {
				title: 'Launch Site Context Document',
				content: '# Launch Site',
				type_key: 'document.context.project',
				state_key: 'active'
			}
		});

		expect(mocks.instantiateProject).toHaveBeenCalledWith(
			fixture.client,
			{
				project: {
					name: 'Launch Site',
					type_key: 'project.business.product_launch',
					description: 'Ship it',
					state_key: 'active',
					props: { facets: { stage: 'execution' } }
				},
				entities: [],
				relationships: [],
				context_document: {
					title: 'Launch Site Context Document',
					content: '# Launch Site',
					body_markdown: '# Launch Site',
					type_key: 'document.context.project',
					state_key: 'active'
				}
			},
			USER_ID,
			{
				activityLog: { changeSource: 'agent_call', actorContext: undefined }
			}
		);
		expect(fixture.client.rpc).toHaveBeenCalledWith('add_queue_job', {
			p_user_id: USER_ID,
			p_job_type: 'build_project_context_snapshot',
			p_metadata: {
				projectId: PROJECT_ID,
				reason: 'project_created',
				force: true
			},
			p_priority: 7,
			p_scheduled_for: expect.any(String),
			p_dedup_key: `project-context-snapshot-${PROJECT_ID}`
		});
		expect(result).toEqual({
			project_id: PROJECT_ID,
			project: fixture.project,
			counts: COUNTS,
			created_entities: CREATED_ENTITIES,
			message: 'Created project "Launch Site".'
		});
	});

	it('keeps a snapshot enqueue failure best-effort after project creation', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fixture = admin(new Error('queue unavailable'));

		await expect(
			EXTERNAL_OP_HANDLERS['onto.project.create'](context(fixture.client), {
				project: {
					name: 'Launch Site',
					type_key: 'project.business.product_launch'
				},
				entities: [],
				relationships: []
			})
		).resolves.toMatchObject({
			project_id: PROJECT_ID,
			created_entities: CREATED_ENTITIES
		});
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});
