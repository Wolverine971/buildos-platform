// apps/web/src/lib/tests/agentic-e2e/harness/seed.ts
//
// Seeds and tears down scenario fixtures. Seeding reuses the production
// `instantiateProject` graph builder (the same path the app uses), so fixtures
// are shaped exactly like real projects. Teardown is a single delete: every
// onto_* child references onto_projects(id) ON DELETE CASCADE.
import { randomUUID } from 'node:crypto';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import type { ProjectSpec } from '$lib/types/onto';
import type { DbView, ScenarioContext, SeedResult } from './types';

/**
 * Prefix on every seeded project name. The orphan sweep only ever deletes
 * projects whose name starts with this — a hard guardrail against touching
 * real data even if a scenario is misconfigured.
 */
export const HARNESS_PROJECT_PREFIX = 'AE2E ·';

const STALE_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

function runLabel(): string {
	const configured = process.env.AGENTIC_E2E_RUN_LABEL?.trim();
	const safeLabel = configured?.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 24);
	return [safeLabel, randomUUID().slice(0, 12)].filter(Boolean).join('-');
}

/** Unique to this process, so concurrent harnesses never share a cleanup scope. */
export const HARNESS_RUN_ID = runLabel();
export const HARNESS_RUN_PREFIX = `${HARNESS_PROJECT_PREFIX} run=${HARNESS_RUN_ID} ·`;

/** Build a collision-free, sweepable project name for a fixture. */
export function harnessProjectName(label: string): string {
	return `${HARNESS_RUN_PREFIX} ${label} · ${randomUUID().slice(0, 8)}`;
}

/** Instantiate a fixture project under the test user and return its id. */
export async function seedProject(
	ctx: ScenarioContext,
	spec: ProjectSpec
): Promise<{ projectId: string }> {
	const { project_id } = await instantiateProject(ctx.db.admin, spec, ctx.db.userId, {
		activityLog: { changeSource: 'api' }
	});
	return { projectId: project_id };
}

/** Convenience: seed a project and return a SeedResult scaffold. */
export async function seedScenarioProject(
	ctx: ScenarioContext,
	spec: ProjectSpec
): Promise<SeedResult> {
	const { projectId } = await seedProject(ctx, spec);
	return { projectId, entityIds: {}, notes: {} };
}

/** Delete a seeded project; cascade removes all its onto_* children. */
export async function teardownProject(db: DbView, projectId: string | undefined): Promise<void> {
	if (!projectId) return;
	const { error } = await db.admin.from('onto_projects').delete().eq('id', projectId);
	if (error) {
		// Non-fatal: teardown failures shouldn't fail an otherwise-green scenario,
		// but they should be visible. The afterAll sweep is the backstop.
		console.warn(`[agentic-e2e] teardown failed for project ${projectId}: ${error.message}`);
	}
}

/**
 * Delete projects created by this harness process only. The run id in the name
 * prevents a concurrent process (including another worktree) from deleting
 * fixtures that are still in use.
 */
export async function sweepOrphanProjects(db: DbView): Promise<number> {
	const { data, error } = await db.admin
		.from('onto_projects')
		.delete()
		.eq('created_by', db.actorId)
		.like('name', `${HARNESS_RUN_PREFIX}%`)
		.select('id');
	if (error) {
		console.warn(`[agentic-e2e] run cleanup failed: ${error.message}`);
		return 0;
	}
	return data?.length ?? 0;
}

/**
 * Reap projects left by crashed harnesses, but only after a full day. Active
 * parallel runs are therefore outside the deletion window even though they use
 * the same hosted database and test actor.
 */
export async function sweepStaleOrphanProjects(db: DbView, now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - STALE_ORPHAN_AGE_MS).toISOString();
	const { data, error } = await db.admin
		.from('onto_projects')
		.delete()
		.eq('created_by', db.actorId)
		.like('name', `${HARNESS_PROJECT_PREFIX}%`)
		.lt('created_at', cutoff)
		.select('id');
	if (error) {
		console.warn(`[agentic-e2e] stale orphan sweep failed: ${error.message}`);
		return 0;
	}
	return data?.length ?? 0;
}
