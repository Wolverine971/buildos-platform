// apps/worker/scripts/knowledge-backfill-task-entities.ts
//
// Tasker 160: copy the people and organizations already read out of tasks (onto_task_entities)
// into each task owner's private knowledge graph, linked back to their tasks. Free: no model
// calls, only database reads and writes. Re-running is safe (identity keys and name matching
// land on the same entries; facts and links deduplicate).
//
//   Dry (default):  pnpm exec tsx scripts/knowledge-backfill-task-entities.ts --user-email <email>
//                   Reads production, prints what would be created. Writes nothing.
//   Live:           KNOWLEDGE_BACKFILL_LIVE=1 pnpm exec tsx scripts/knowledge-backfill-task-entities.ts \
//                     --user-email <email> --live
//                   Writes to production (needs the 20261116230000 migration applied).
// Reads apps/worker/.env for the service key.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const arg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : undefined;
};

async function main() {
	const live = process.argv.includes('--live');
	if (live && process.env.KNOWLEDGE_BACKFILL_LIVE !== '1') {
		throw new Error(
			'Live runs write to production: set KNOWLEDGE_BACKFILL_LIVE=1 after approval'
		);
	}
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email <email>');

	const { supabase } = await import('../src/lib/supabase');
	const { KnowledgeStore, planTaskEntityKnowledge } = await import(
		'@buildos/shared-agent-ops/knowledge'
	);
	const db = supabase as any;

	const { data: user, error: userError } = await db
		.from('users')
		.select('id, name')
		.eq('email', email)
		.maybeSingle();
	if (userError || !user)
		throw new Error(`No user with that email (${userError?.message ?? 'not found'})`);
	const { data: actor } = await db
		.from('onto_actors')
		.select('id')
		.eq('user_id', user.id)
		.maybeSingle();
	if (!actor) throw new Error('User has no actor');

	// Tasks the user created, plus tasks in projects they created (the extraction job's owner rule).
	const { data: projects } = await db
		.from('onto_projects')
		.select('id')
		.eq('created_by', actor.id);
	const projectIds = (projects ?? []).map((p: { id: string }) => p.id);

	const rows: any[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await db
			.from('onto_task_entities')
			.select(
				'id, task_id, project_id, kind, natural_key, value, display, role, about, quote, status'
			)
			.in('project_id', projectIds)
			.range(from, from + 999);
		if (error) throw new Error(error.message);
		rows.push(...(data ?? []));
		if ((data ?? []).length < 1000) break;
	}
	const taskIds = [...new Set(rows.map((r) => r.task_id))];
	const tasks = new Map<
		string,
		{ id: string; title: string; created_by: string; deleted_at: string | null }
	>();
	for (let i = 0; i < taskIds.length; i += 150) {
		const { data } = await db
			.from('onto_tasks')
			.select('id, title, created_by, deleted_at')
			.in('id', taskIds.slice(i, i + 150));
		for (const t of data ?? []) tasks.set(t.id, t);
	}

	const store = new KnowledgeStore(db, user.id);
	let planned = { tasks: 0, entities: 0, facts: 0, links: 0 };
	const totals = { created: 0, matched: 0, facts: 0, links: 0, problems: 0 };
	const names = new Map<string, number>();
	for (const taskId of taskIds) {
		const task = tasks.get(taskId);
		if (!task || task.deleted_at) continue;
		// Only the task creator's own tasks, unless the creator is unknown (project owner rule).
		if (task.created_by && task.created_by !== actor.id) continue;
		const batch = planTaskEntityKnowledge(
			{ id: task.id, title: task.title ?? '' },
			rows.filter((r) => r.task_id === taskId)
		);
		if (!batch.entities.length) continue;
		planned.tasks++;
		planned.entities += batch.entities.length;
		planned.facts += batch.facts.length;
		planned.links += batch.links?.length ?? 0;
		for (const e of batch.entities)
			names.set(`${e.kind}: ${e.name}`, (names.get(`${e.kind}: ${e.name}`) ?? 0) + 1);
		if (!live) continue;
		const receipt = await store.record(batch, { via: 'backfill' });
		totals.created += receipt.entities.filter((e) => e.matched === 'created').length;
		totals.matched += receipt.entities.filter((e) => e.matched !== 'created').length;
		totals.facts += receipt.facts.added;
		totals.links += receipt.links;
		totals.problems += receipt.problems.length;
	}

	console.log(`User: ${user.name ?? email}`);
	console.log(`Tasks with people or organizations: ${planned.tasks}`);
	console.log(
		`Mentions: ${planned.entities} (distinct names: ${names.size}), facts: ${planned.facts}, task links: ${planned.links}`
	);
	const top = [...names].sort((a, b) => b[1] - a[1]).slice(0, 15);
	console.log('Most mentioned:\n' + top.map(([n, c]) => `  ${c}× ${n}`).join('\n'));
	if (live) console.log('Written:', totals);
	else
		console.log(
			'Dry run: nothing written. Add --live with KNOWLEDGE_BACKFILL_LIVE=1 to write.'
		);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
