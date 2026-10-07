// apps/worker/scripts/task-entities-run.ts
//
// Runs the extract_task_entities job body on existing tasks: a live check, the accuracy
// sample, or the backfill of tasks written before the trigger existed. Same code path as the
// queued job (src/workers/task-entities/extractTaskEntitiesWorker.ts), so it writes
// onto_task_entities and onto_task_entity_state in production and skips text already read.
//
//   Dry (free):   pnpm exec tsx scripts/task-entities-run.ts --user-email <email> --limit 10
//                 Lists the tasks it would read, the fixed formats found in each, and the
//                 estimated cost. No model call, no writes.
//   Live (paid):  TASK_ENTITIES_LIVE=1 pnpm exec tsx scripts/task-entities-run.ts --live \
//                   (--task <id>[,<id>] | --user-email <email> [--limit 10]) [--max-usd 0.25] \
//                   [--out <file.json>]
//                 Reads apps/worker/.env. Usage is logged as task_entity_extraction. Stops
//                 starting tasks once --max-usd is spent. --concurrency N (default 4) reads
//                 several tasks at once.
//   Task list:    --task-file <file> with one task id per line, instead of --task.
//   All users:    --all [--limit N] instead of --user-email (live backfill, newest first).
//   Recent only:  --updated-since <ISO date> with --all or --user-email (e.g. the last 2 months).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const arg = (name: string, fallback?: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : fallback;
};
const flag = (name: string) => process.argv.includes(name);

/** Measured fast-lane spend on this prompt shape (DeepSeek V4 Flash, ~1,400 tokens in). */
const ESTIMATED_USD_PER_TASK = 0.0005;

type TaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	created_by: string;
};

async function main() {
	const live = flag('--live');
	if (live && process.env.TASK_ENTITIES_LIVE !== '1') {
		throw new Error('Live runs are paid: set TASK_ENTITIES_LIVE=1 after approval');
	}
	const { supabase } = await import('../src/lib/supabase');
	const { detectTaskTextEntities } = await import('@buildos/shared-agent-ops/task-entities');
	const { processExtractTaskEntitiesJob } = await import(
		'../src/workers/task-entities/extractTaskEntitiesWorker'
	);
	const { taskEntityText } = await import('../src/workers/task-entities/task-entity-prompt');

	const limit = Number(arg('--limit', '10'));
	const maxUsd = Number(arg('--max-usd', '0.25'));
	const concurrency = Math.max(1, Number(arg('--concurrency', '4')));
	const taskFile = arg('--task-file');
	const taskIds = (
		taskFile ? readFileSync(taskFile, 'utf8').split(/\s+/) : (arg('--task') ?? '').split(',')
	).filter(Boolean);
	const email = arg('--user-email');
	const updatedSince = arg('--updated-since');
	if (updatedSince && Number.isNaN(Date.parse(updatedSince))) {
		throw new Error(`--updated-since is not a date: ${updatedSince}`);
	}

	const columns = 'id, project_id, title, description, created_by';
	let rows: TaskRow[] = [];
	if (taskIds.length) {
		// Chunked so a long id list stays inside the request URL limit; kept in the given order.
		const found = new Map<string, TaskRow>();
		for (let i = 0; i < taskIds.length; i += 50) {
			const { data, error } = await supabase
				.from('onto_tasks')
				.select(columns)
				.is('deleted_at', null)
				.in('id', taskIds.slice(i, i + 50));
			if (error) throw new Error(error.message);
			for (const row of (data ?? []) as TaskRow[]) found.set(row.id, row);
		}
		rows = taskIds.map((id) => found.get(id)).filter((row): row is TaskRow => !!row);
	}
	let query = supabase
		.from('onto_tasks')
		.select(columns)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });
	if (updatedSince) query = query.gte('updated_at', new Date(updatedSince).toISOString());
	if (taskIds.length) {
		// Loaded above.
	} else if (email) {
		const { data: user } = await supabase
			.from('users')
			.select('id')
			.eq('email', email)
			.maybeSingle();
		if (!user) throw new Error(`No user ${email}`);
		const { data: actor } = await supabase
			.from('onto_actors')
			.select('id')
			.eq('user_id', user.id)
			.maybeSingle();
		if (!actor) throw new Error(`No actor for ${email}`);
		query = query.eq('created_by', actor.id).limit(limit);
	} else if (flag('--all')) {
		query = query.limit(limit);
	} else {
		throw new Error('Pass --task <ids>, --user-email <email>, or --all');
	}
	if (!taskIds.length) {
		const { data: tasks, error } = await query;
		if (error) throw new Error(error.message);
		rows = (tasks ?? []) as TaskRow[];
	}

	const actorIds = [...new Set(rows.map((row) => row.created_by))];
	const { data: actors } = await supabase
		.from('onto_actors')
		.select('id, user_id')
		.in('id', actorIds);
	const userByActor = new Map((actors ?? []).map((actor) => [actor.id, actor.user_id]));

	console.log(
		`${rows.length} task(s); estimated ≤ $${(rows.length * ESTIMATED_USD_PER_TASK).toFixed(3)} (cap $${maxUsd})`
	);
	if (!live) {
		for (const row of rows) {
			const found = detectTaskTextEntities(taskEntityText(row.title, row.description));
			console.log(
				`- ${row.id} ${row.title.slice(0, 70)}${found.length ? `  [${found.map((entity) => `${entity.kind}:${entity.display}`).join(', ')}]` : ''}`
			);
		}
		console.log(
			'Dry run: no model calls, nothing written. Add --live with TASK_ENTITIES_LIVE=1.'
		);
		return;
	}

	let spent = 0;
	let next = 0;
	let capped = false;
	const results: unknown[] = [];
	const runOne = async (row: TaskRow) => {
		const userId = userByActor.get(row.created_by);
		if (!userId) {
			console.log(`- ${row.id} skipped: no user for its creator`);
			return;
		}
		const job = {
			id: `script-${row.id}`,
			userId,
			data: { taskId: row.id, projectId: row.project_id, userId },
			attempts: 0,
			correlationId: null,
			signal: new AbortController().signal,
			log: async (message: string) => console.log(`  ${message}`),
			updateProgress: async () => {}
		};
		try {
			const result = await processExtractTaskEntitiesJob(job as never);
			spent += result.costUsd ?? 0;
			results.push({ id: row.id, title: row.title, ...result });
			console.log(
				`- ${row.title.slice(0, 60)} → ${result.outcome}${result.inserted !== undefined ? ` +${result.inserted} ~${result.updated} -${result.removed}` : ''}${result.reason ? ` (${result.reason})` : ''} $${(result.costUsd ?? 0).toFixed(5)}`
			);
		} catch (error) {
			results.push({ id: row.id, title: row.title, outcome: 'error', reason: String(error) });
			console.log(`- ${row.title.slice(0, 60)} → error: ${String(error)}`);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
			while (next < rows.length) {
				if (spent >= maxUsd) {
					if (!capped)
						console.log(`Stopping: $${spent.toFixed(4)} spent (cap $${maxUsd}).`);
					capped = true;
					return;
				}
				await runOne(rows[next++]!);
			}
		})
	);
	console.log(`Spent $${spent.toFixed(4)} on ${results.length} task(s).`);
	const out = arg('--out');
	if (out) writeFileSync(out, JSON.stringify(results, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
