// apps/worker/tests/projectIconRetirement.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: mocks }));
vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor')
}));
vi.mock('@buildos/shared-agent-ops/ontology/start-here.service', () => ({
	refreshProjectStartHereManagedRegions: vi.fn().mockResolvedValue({ ok: true, skipped: true })
}));

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

afterEach(() => vi.unstubAllEnvs());

describe('project icon generation retirement', () => {
	it('has no icon processor, registration or typed queue producer contract', () => {
		expect(existsSync(resolve(root, 'apps/worker/src/workers/project-icon'))).toBe(false);
		expect(read('apps/worker/src/worker.ts')).not.toContain('generate_project_icon');
		expect(read('packages/shared-types/src/queue-types.ts')).not.toContain(
			'ProjectIconGeneration'
		);
	});

	it('builds a ready project snapshot without icon work even with the retired flag enabled', async () => {
		vi.stubEnv('ENABLE_PROJECT_ICON_GENERATION', 'true');
		vi.resetModules();
		const { processProjectContextSnapshotJob } = await import(
			'../src/workers/ontology/projectContextSnapshotWorker'
		);
		const timestamp = '2026-10-18T12:00:00Z';
		mocks.from.mockImplementation((table: string) => {
			const query = {
				select: vi.fn(),
				eq: vi.fn(),
				order: vi.fn(),
				limit: vi.fn(),
				maybeSingle: vi.fn().mockResolvedValue({
					data:
						table === 'onto_projects'
							? { state_key: 'active', description: 'Ready project', icon_svg: null }
							: null,
					error: null
				}),
				insert: vi.fn().mockResolvedValue({ error: null }),
				upsert: mocks.upsert
			};
			for (const method of [query.select, query.eq, query.order, query.limit]) {
				method.mockReturnValue(query);
			}
			return query;
		});
		mocks.upsert.mockResolvedValue({ error: null });
		mocks.rpc.mockResolvedValue({
			data: {
				project: {
					id: 'project',
					name: 'Ready project',
					description: 'Ready project',
					type_key: 'project.default',
					state_key: 'active',
					facet_context: null,
					facet_scale: null,
					facet_stage: null,
					start_at: null,
					end_at: null,
					next_step_short: null,
					next_step_long: null,
					created_at: timestamp,
					updated_at: timestamp
				},
				tasks: [],
				goals: [],
				plans: [],
				milestones: [],
				risks: [],
				requirements: [],
				signals: [],
				insights: [],
				edges: [],
				documents: [1, 2, 3].map((id) => ({
					id: `doc-${id}`,
					title: `Document ${id}`,
					description: null,
					type_key: 'document.default',
					state_key: 'draft',
					created_at: timestamp,
					updated_at: timestamp
				}))
			},
			error: null
		});
		const job = {
			id: 'snapshot',
			userId: 'user',
			data: { projectId: 'project', force: true },
			log: vi.fn()
		} as unknown as Parameters<typeof processProjectContextSnapshotJob>[0];
		await expect(processProjectContextSnapshotJob(job)).resolves.toMatchObject({
			success: true
		});
		expect(mocks.upsert).toHaveBeenCalledOnce();
		expect(mocks.from).not.toHaveBeenCalledWith('onto_project_icon_generations');
		expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['load_project_graph_context']);
	});
});
