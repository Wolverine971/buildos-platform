// apps/web/src/lib/tests/layout-shift/fixture.ts
//
// One throwaway project under the dedicated test user (never DJ's account),
// built with the app's own project builder, deleted after the run. Names carry
// a prefix so a crashed run's leftovers can be swept without touching anything else.
import { randomUUID } from 'node:crypto';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import type { ProjectSpec } from '$lib/types/onto';
import type { DbView } from '../agentic-e2e/harness/types';

export const FIXTURE_PREFIX = 'LSH ·';
const STALE_MS = 6 * 60 * 60 * 1000;

const day = (offset: number) => {
	const date = new Date();
	date.setDate(date.getDate() + offset);
	date.setHours(17, 0, 0, 0);
	return date.toISOString();
};

/** Open tasks, in the order we want to walk them. Titles are unique: the probe finds rows by them. */
export const OPEN_TASKS = [
	{ title: 'LSH Draft the outline', state_key: 'todo', due_at: day(0) },
	{ title: 'LSH Review the pricing page', state_key: 'todo', due_at: day(-2) },
	{ title: 'LSH Call the printer', state_key: 'in_progress', due_at: day(0) },
	{ title: 'LSH Wait on legal sign-off', state_key: 'blocked', due_at: day(-1) },
	{ title: 'LSH Send the launch email', state_key: 'todo', due_at: day(0) },
	{ title: 'LSH Tidy the asset folder', state_key: 'todo' }
] as const;
export const DONE_TASKS = [
	{ title: 'LSH Pick the venue', state_key: 'done' },
	{ title: 'LSH Book the photographer', state_key: 'done' }
] as const;
export const ALL_TITLES: string[] = [...OPEN_TASKS, ...DONE_TASKS].map((task) => task.title);

export interface Fixture {
	projectId: string;
	projectName: string;
}

export async function seedFixture(db: DbView): Promise<Fixture> {
	const projectName = `${FIXTURE_PREFIX} Launch checklist · ${randomUUID().slice(0, 8)}`;
	const spec: ProjectSpec = {
		project: {
			name: projectName,
			type_key: 'project.business.product_launch',
			description: 'Layout-shift harness fixture. Safe to delete.'
		},
		entities: [...OPEN_TASKS, ...DONE_TASKS].map((task, index) => ({
			temp_id: `task-${index}`,
			kind: 'task' as const,
			type_key: 'task.default',
			...task
		})),
		relationships: []
	} as ProjectSpec;
	const seededFrom = new Date().toISOString();
	const { project_id } = await instantiateProject(db.admin, spec, db.userId, {
		activityLog: { changeSource: 'api' }
	});
	await cancelSeedJobs(db, seededFrom);
	return { projectId: project_id, projectName };
}

/**
 * Inserting tasks fires the database triggers that queue background work for them (entity
 * extraction is a paid model call; embeddings too). The fixture is throwaway, so the jobs its
 * seed queued for the test user are dropped before a worker picks them up (they wait ~15 s).
 */
async function cancelSeedJobs(db: DbView, since: string): Promise<void> {
	const { error } = await db.admin
		.from('queue_jobs')
		.delete()
		.eq('user_id', db.userId)
		.eq('status', 'pending')
		.gte('created_at', since);
	if (error)
		console.warn(`[layout-shift] could not drop the seed's queued jobs: ${error.message}`);
}

export async function teardownFixture(db: DbView, fixture: Fixture | null): Promise<void> {
	if (!fixture) return;
	const { error } = await db.admin.from('onto_projects').delete().eq('id', fixture.projectId);
	if (error) console.warn(`[layout-shift] teardown failed: ${error.message}`);
}

/** Leftovers from crashed runs, only ours, only old ones. */
export async function sweepStaleFixtures(db: DbView): Promise<void> {
	const cutoff = new Date(Date.now() - STALE_MS).toISOString();
	await db.admin
		.from('onto_projects')
		.delete()
		.eq('created_by', db.actorId)
		.like('name', `${FIXTURE_PREFIX}%`)
		.lt('created_at', cutoff);
}
