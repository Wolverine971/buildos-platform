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
//   Catch-up:     --created-since <ISO date | 3mo | 90d> and/or --active-only (tasker 162) with
//                 --all or --user-email. Reads every matching task (no default --limit), skips
//                 archived ones, keeps only text the current extractor has not read, and prints
//                 per-user counts with a realistic estimate. --active-only = accounts active in
//                 the last 30 days (src/lib/active-accounts.ts).
//                 e.g. pnpm exec tsx scripts/task-entities-run.ts --all --active-only --created-since 3mo

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

/** Upper bound per task on this prompt shape (fast lane, ~1,400 tokens in + output). */
const ESTIMATED_USD_PER_TASK = 0.0005;
/** Last measured real spend: 236 tasks = $0.0365 on the fast profile (DeepSeek V4 Flash first). */
const MEASURED_USD_PER_TASK = 0.00015;

type TaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	created_by: string;
};

type ReadNeed = 'never' | 'changed' | 'old_version' | 'failed';

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
	const { taskEntityText, taskEntitySourceHash, TASK_ENTITY_EXTRACTOR_VERSION } = await import(
		'../src/workers/task-entities/task-entity-prompt'
	);
	const { findActiveAccounts, parseSince } = await import('../src/lib/active-accounts');

	const activeOnly = flag('--active-only');
	const createdSinceArg = arg('--created-since');
	const createdSince = createdSinceArg ? parseSince(createdSinceArg) : null;
	const catchUp = activeOnly || !!createdSince;
	// Catch-up reads every matching task unless --limit is given.
	const limit = Number(arg('--limit', catchUp ? '100000' : '10'));
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
		if (catchUp) throw new Error('--active-only / --created-since need --all or --user-email');
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

	// Which creators (actor ids) to read; null = everyone.
	let creatorActors: string[] | null = null;
	const active = activeOnly ? await findActiveAccounts(supabase) : null;
	if (taskIds.length) {
		// Loaded above.
	} else if (email) {
		const { data: user } = await supabase
			.from('users')
			.select('id')
			.eq('email', email)
			.maybeSingle();
		if (!user) throw new Error(`No user ${email}`);
		if (active && !active.has(user.id)) {
			console.log('That account is not active (last 30 days): nothing to read.');
			return;
		}
		const { data: actor } = await supabase
			.from('onto_actors')
			.select('id')
			.eq('user_id', user.id)
			.maybeSingle();
		if (!actor) throw new Error(`No actor for ${email}`);
		creatorActors = [actor.id];
	} else if (flag('--all')) {
		if (active) {
			const { data: actors, error } = await supabase
				.from('onto_actors')
				.select('id')
				.in('user_id', [...active.keys()]);
			if (error) throw new Error(error.message);
			creatorActors = (actors ?? []).map((actor) => actor.id);
		}
	} else {
		throw new Error('Pass --task <ids>, --user-email <email>, or --all');
	}
	if (!taskIds.length) {
		if (creatorActors && !creatorActors.length) {
			console.log('No active accounts: nothing to read.');
			return;
		}
		// Paged (newest first) so catch-up runs see every matching task.
		for (let from = 0; rows.length < limit; from += 1000) {
			const take = Math.min(1000, limit - rows.length);
			let query = supabase
				.from('onto_tasks')
				.select(columns)
				.is('deleted_at', null)
				.order(catchUp ? 'created_at' : 'updated_at', { ascending: false })
				.order('id')
				.range(from, from + take - 1);
			if (updatedSince) query = query.gte('updated_at', new Date(updatedSince).toISOString());
			if (createdSince) query = query.gte('created_at', createdSince.toISOString());
			if (catchUp) query = query.is('archived_at', null);
			if (creatorActors) query = query.in('created_by', creatorActors);
			const { data: tasks, error } = await query;
			if (error) throw new Error(error.message);
			rows.push(...((tasks ?? []) as TaskRow[]));
			if ((tasks ?? []).length < take) break;
		}
	}

	const actorIds = [...new Set(rows.map((row) => row.created_by))];
	const { data: actors } = await supabase
		.from('onto_actors')
		.select('id, user_id')
		.in('id', actorIds);
	const userByActor = new Map((actors ?? []).map((actor) => [actor.id, actor.user_id]));

	if (catchUp) {
		// Keep only text the current extractor has not read (the job skips the rest for free).
		const need = new Map<string, ReadNeed>();
		const states = new Map<
			string,
			{ source_hash: string; extractor_version: number; outcome: string }
		>();
		const db = supabase as any;
		for (let i = 0; i < rows.length; i += 150) {
			const { data, error } = await db
				.from('onto_task_entity_state')
				.select('task_id, source_hash, extractor_version, outcome')
				.in(
					'task_id',
					rows.slice(i, i + 150).map((row) => row.id)
				);
			if (error) throw new Error(error.message);
			for (const state of data ?? []) states.set(state.task_id, state);
		}
		for (const row of rows) {
			const state = states.get(row.id);
			if (!state) need.set(row.id, 'never');
			else if (state.outcome === 'failed') need.set(row.id, 'failed');
			else if (state.extractor_version !== TASK_ENTITY_EXTRACTOR_VERSION)
				need.set(row.id, 'old_version');
			else if (state.source_hash !== taskEntitySourceHash(row.title, row.description))
				need.set(row.id, 'changed');
		}
		const byUser = new Map<
			string,
			{ recent: number; need: number } & Partial<Record<ReadNeed, number>>
		>();
		for (const row of rows) {
			const userId = userByActor.get(row.created_by) ?? `actor ${row.created_by}`;
			const entry = byUser.get(userId) ?? { recent: 0, need: 0 };
			entry.recent++;
			const reason = need.get(row.id);
			if (reason) {
				entry.need++;
				entry[reason] = (entry[reason] ?? 0) + 1;
			}
			byUser.set(userId, entry);
		}
		const { data: users } = await supabase
			.from('users')
			.select('id, name')
			.in(
				'id',
				[...byUser.keys()].filter((id) => !id.startsWith('actor '))
			);
		const nameOf = new Map((users ?? []).map((user) => [user.id, user.name]));
		console.log(
			`Catch-up: ${activeOnly ? `${active?.size ?? 0} active account(s), ` : ''}tasks created since ${createdSince?.toISOString().slice(0, 10) ?? 'any time'}, not archived`
		);
		for (const [userId, entry] of [...byUser].sort((a, b) => b[1].need - a[1].need)) {
			const reasons = (['never', 'changed', 'old_version', 'failed'] as const)
				.filter((reason) => entry[reason])
				.map((reason) => `${reason} ${entry[reason]}`)
				.join(', ');
			console.log(
				`  ${nameOf.get(userId) ?? userId.slice(0, 8)}: ${entry.recent} recent, ${entry.need} to read${reasons ? ` (${reasons})` : ''}`
			);
		}
		rows = rows.filter((row) => need.has(row.id));
		console.log(
			`${rows.length} task(s) to read; realistic ≈ $${(rows.length * MEASURED_USD_PER_TASK).toFixed(3)} (measured $${MEASURED_USD_PER_TASK}/task), upper bound $${(rows.length * ESTIMATED_USD_PER_TASK).toFixed(3)}, cap $${maxUsd}`
		);
	} else {
		console.log(
			`${rows.length} task(s); estimated ≤ $${(rows.length * ESTIMATED_USD_PER_TASK).toFixed(3)} (cap $${maxUsd})`
		);
	}
	if (!live) {
		const shown = catchUp ? rows.slice(0, 25) : rows;
		for (const row of shown) {
			const found = detectTaskTextEntities(taskEntityText(row.title, row.description));
			console.log(
				`- ${row.id} ${row.title.slice(0, 70)}${found.length ? `  [${found.map((entity) => `${entity.kind}:${entity.display}`).join(', ')}]` : ''}`
			);
		}
		if (shown.length < rows.length) console.log(`  … and ${rows.length - shown.length} more`);
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
