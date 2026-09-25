// scripts/migration-rehearsal/concurrent-write-probe.mjs
//
// Tasker 105: fire concurrent writes at one project in a local rehearsal
// cluster (production's schema, no data) and count stalls, deadlocks (40P01)
// and statement timeouts (57014). With --apply it runs every scenario, applies
// the migration files, and runs them again, so one command prints before and
// after on the same cluster.
//
// It connects only through the Unix socket of a cluster kept by
// `pnpm db:rehearse <file> --keep` (/tmp/buildos-rehearsal-*). It takes no
// URL, so it cannot reach a hosted database.
//
// Usage:
//   pnpm db:rehearse <any>.sql --keep     # prints "Kept cluster files at /tmp/buildos-rehearsal-XXXX"
//   node scripts/migration-rehearsal/concurrent-write-probe.mjs /tmp/buildos-rehearsal-XXXX \
//     [--apply supabase/migrations/<file>.sql]... [--scenarios task-creates,goal-creates,...]
//     [--n 5] [--rounds 3] [--bump-delay-ms 20] [--as service|member] [--json out.json]
//
// --as service  runs as the worker and MCP do (service_role claims; RLS bypassed).
// --as member   runs as the web app does (role authenticated, the project owner's JWT).
// --bump-delay-ms adds a sleep after every project context-version bump. An empty local
//   database finishes each write in well under a millisecond; production spends real time
//   there (snapshot deletes, per-user invalidation, embedding enqueue). The delay widens
//   the same windows production has, so lock-order bugs reproduce instead of racing past.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const { Client } = createRequire(resolve(root, 'apps/worker/package.json'))('pg');

// A mixed scenario is one operation plus n-1 task creates; that operation
// starts 5 ms early so it takes its first locks before the creates arrive.
const repeat = (operation) => (n) => Array.from({ length: n }, (_, i) => operation(i));
const mixed = (first, rest = () => taskCreate) =>
	Object.assign((n) => [first, ...repeat(rest)(n - 1)], { mixed: true });
const GATEWAY_KINDS = ['goal', 'plan', 'milestone', 'risk'];
const gatewayMix = (i) => (i % 5 === 4 ? taskCreate : gatewayCreate(GATEWAY_KINDS[i % 5]));
const SCENARIOS = {
	'task-creates': repeat(() => taskCreate),
	'goal-creates': repeat(() => goalCreate),
	'plan-creates': repeat(() => planCreate),
	'goal-create+task-creates': mixed(goalCreate),
	'task-update-rel+task-creates': mixed(taskUpdateWithRelationships),
	'goal-update-rel+task-creates': mixed(goalUpdateWithRelationships),
	'plan-update-rel+task-creates': mixed(planUpdateWithRelationships),
	'project-soft-delete+task-creates': mixed(projectSoftDelete),
	'gateway-creates+task-creates': repeat(gatewayMix),
	'task-update-rel+gateway-creates': mixed(taskUpdateWithRelationships, (i) =>
		gatewayCreate(GATEWAY_KINDS[i % 4])
	),
	'links-identical': repeat(() => linkIdentical),
	'links-distinct': repeat((i) => linkDistinct(i)),
	'links-identical-rpc': repeat(() => linkIdenticalRpc),
	'links-distinct-rpc': repeat((i) => linkDistinctRpc(i)),
	'links-rpc+task-creates': repeat((i) => (i % 2 ? taskCreate : linkDistinctRpc(i)))
};

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const option = (name, fallback) => {
	const index = argv.indexOf(`--${name}`);
	return index === -1 ? fallback : argv[index + 1];
};
const clusterDir = argv[0]?.replace(/\/$/, '');
if (!clusterDir || !/^\/(private\/)?tmp\/buildos-rehearsal-[A-Za-z0-9_]+$/.test(clusterDir)) {
	console.error('First argument must be a kept rehearsal cluster: /tmp/buildos-rehearsal-XXXX');
	process.exit(2);
}
if (!existsSync(`${clusterDir}/data/PG_VERSION`)) {
	console.error(`${clusterDir} has no data directory. Re-run pnpm db:rehearse <file> --keep.`);
	process.exit(2);
}
const applyFiles = argv.flatMap((arg, i) => (arg === '--apply' ? [resolve(argv[i + 1])] : []));
const n = Number(option('n', 5));
const rounds = Number(option('rounds', 3));
const bumpDelayMs = Number(option('bump-delay-ms', 20));
const actingAs = option('as', 'service');
const jsonPath = option('json', null);
const scenarioNames = option('scenarios', Object.keys(SCENARIOS).join(',')).split(',');
for (const name of scenarioNames) {
	if (!SCENARIOS[name]) {
		console.error(`Unknown scenario ${name}. Known: ${Object.keys(SCENARIOS).join(', ')}`);
		process.exit(2);
	}
}
if (!['service', 'member'].includes(actingAs)) {
	console.error('--as must be service or member');
	process.exit(2);
}

// ------------------------------------------------------------------ cluster

const socket = `${clusterDir}/socket`;
const pgCtl = (...args) =>
	execFileSync('pg_ctl', ['-D', `${clusterDir}/data`, ...args], { encoding: 'utf8' });
let startedHere = false;
try {
	pgCtl('status');
} catch {
	// Same options rehearse.py uses, so a probe run matches a rehearsal run.
	pgCtl(
		'-l',
		`${clusterDir}/postgres.log`,
		'-o',
		`-p 5432 -k ${socket} -c listen_addresses='' -c fsync=off -c full_page_writes=off ` +
			'-c synchronous_commit=off -c max_locks_per_transaction=1024 -c deadlock_timeout=1s',
		'-w',
		'start'
	);
	startedHere = true;
}

const connect = async () => {
	const client = new Client({ host: socket, port: 5432, user: 'postgres', database: 'postgres' });
	await client.connect();
	return client;
};

const admin = await connect();

// ------------------------------------------------------------------ fixtures

const userId = randomUUID();
const actorId = randomUUID();
await admin.query('BEGIN');
await admin.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
	userId,
	`probe-${userId}@example.test`
]);
await admin.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [
	userId,
	`probe-${userId}@example.test`
]);
await admin.query(
	`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Probe', $2)`,
	[actorId, userId]
);
await admin.query('COMMIT');

async function setBumpDelay(ms) {
	await admin.query(`CREATE SCHEMA IF NOT EXISTS probe`);
	await admin.query(
		`DROP TRIGGER IF EXISTS probe_bump_delay ON private.agentic_chat_project_context_versions`
	);
	if (ms <= 0) return;
	await admin.query(`
		CREATE OR REPLACE FUNCTION probe.bump_delay() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN PERFORM pg_sleep(${ms / 1000}); RETURN NULL; END $$`);
	await admin.query(`
		CREATE TRIGGER probe_bump_delay AFTER INSERT OR UPDATE
		ON private.agentic_chat_project_context_versions
		FOR EACH ROW EXECUTE FUNCTION probe.bump_delay()`);
}

/** A fresh project per round, with one goal, one plan and n tasks to update or link. */
async function seedProject() {
	const project = {
		id: randomUUID(),
		goalId: randomUUID(),
		planId: randomUUID(),
		taskIds: Array.from({ length: n + 1 }, () => randomUUID())
	};
	await admin.query('BEGIN');
	await admin.query(
		`INSERT INTO public.onto_projects (id, name, type_key, created_by)
		 VALUES ($1, 'Probe', 'project.default', $2)`,
		[project.id, actorId]
	);
	await admin.query(
		`INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by)
		 VALUES ($1, $2, 'Probe goal', 'goal.default', $3)`,
		[project.goalId, project.id, actorId]
	);
	await admin.query(
		`INSERT INTO public.onto_plans (id, project_id, name, type_key, created_by)
		 VALUES ($1, $2, 'Probe plan', 'plan.default', $3)`,
		[project.planId, project.id, actorId]
	);
	for (const taskId of project.taskIds) {
		await admin.query(
			`INSERT INTO public.onto_tasks (id, project_id, title, created_by)
			 VALUES ($1, $2, 'Probe task', $3)`,
			[taskId, project.id, actorId]
		);
	}
	const containment = [
		['goal', project.goalId, 'has_goal'],
		['plan', project.planId, 'has_plan'],
		...project.taskIds.map((id) => ['task', id, 'has_task'])
	];
	for (const [kind, id, rel] of containment) {
		await admin.query(
			`INSERT INTO public.onto_edges (project_id, src_kind, src_id, dst_kind, dst_id, rel)
			 VALUES ($1, 'project', $1, $2, $3, $4)`,
			[project.id, kind, id, rel]
		);
	}
	await admin.query('COMMIT');
	return project;
}

// ------------------------------------------------------------------ operations
// Each operation gets its own connection and runs as one transaction, the way a
// PostgREST RPC call does. Payloads mirror the gateway and web routes.

const containmentPlan = (
	projectId,
	kind,
	id,
	rel,
	parent = { kind: 'project', id: projectId }
) => ({
	references: [],
	entityContainment: {
		type: 'containment',
		child: { kind, id },
		expectedEdges: null,
		desiredEdges: [
			{
				project_id: projectId,
				src_kind: parent.kind,
				src_id: parent.id,
				dst_kind: kind,
				dst_id: id,
				rel,
				props: { is_primary: true }
			}
		]
	},
	semantic: [],
	projectEdges: [],
	childContainment: []
});

async function taskCreate(client, project) {
	const id = randomUUID();
	await client.query(
		`SELECT public.onto_task_create_with_relationships_atomic($1::jsonb, $2::jsonb, false, NULL, NULL, 'manual', $3)`,
		[
			{
				id,
				project_id: project.id,
				title: 'Probe create',
				type_key: 'task.default',
				state_key: 'todo',
				priority: 2,
				created_by: actorId
			},
			containmentPlan(project.id, 'task', id, 'has_task'),
			`probe:${id}`
		]
	);
}

async function goalCreate(client, project) {
	const id = randomUUID();
	await client.query(`SELECT public.onto_goal_create_atomic($1::jsonb, $2::jsonb)`, [
		{
			id,
			project_id: project.id,
			name: 'Probe goal create',
			type_key: 'goal.default',
			created_by: actorId
		},
		containmentPlan(project.id, 'goal', id, 'has_goal')
	]);
}

async function planCreate(client, project) {
	const id = randomUUID();
	await client.query(`SELECT public.onto_plan_create_atomic($1::jsonb, $2::jsonb)`, [
		{
			id,
			project_id: project.id,
			name: 'Probe plan create',
			type_key: 'plan.default',
			created_by: actorId
		},
		containmentPlan(project.id, 'plan', id, 'has_plan')
	]);
}

// update_onto_task with a goal: the task moves under the goal in the same transaction.
async function taskUpdateWithRelationships(client, project) {
	const taskId = project.taskIds[0];
	await client.query(
		`SELECT public.onto_task_update_with_relationships_atomic($1, $2::jsonb, false, NULL, NULL, $3::jsonb, 'manual')`,
		[
			taskId,
			{ title: 'Probe update' },
			containmentPlan(project.id, 'task', taskId, 'has_task', {
				kind: 'goal',
				id: project.goalId
			})
		]
	);
}

async function goalUpdateWithRelationships(client, project) {
	await client.query(`SELECT public.onto_goal_update_atomic($1, $2::jsonb, $3::jsonb)`, [
		project.goalId,
		{ name: 'Probe goal update' },
		containmentPlan(project.id, 'goal', project.goalId, 'has_goal')
	]);
}

async function planUpdateWithRelationships(client, project) {
	await client.query(`SELECT public.onto_plan_update_atomic($1, $2::jsonb, $3::jsonb)`, [
		project.planId,
		{ name: 'Probe plan update' },
		containmentPlan(project.id, 'plan', project.planId, 'has_plan')
	]);
}

// create_onto_goal/plan/milestone/risk in the worker: the gateway inserts the row
// (no relationship RPC), then logs it, as two requests.
const GATEWAY_INSERTS = {
	goal: `INSERT INTO public.onto_goals (project_id, name, type_key, created_by)
		VALUES ($1, 'Probe gateway goal', 'goal.default', $2) RETURNING id`,
	plan: `INSERT INTO public.onto_plans (project_id, name, type_key, created_by)
		VALUES ($1, 'Probe gateway plan', 'plan.default', $2) RETURNING id`,
	milestone: `INSERT INTO public.onto_milestones (project_id, title, created_by)
		VALUES ($1, 'Probe gateway milestone', $2) RETURNING id`,
	risk: `INSERT INTO public.onto_risks (project_id, title, created_by)
		VALUES ($1, 'Probe gateway risk', $2) RETURNING id`
};
function gatewayCreate(kind) {
	return async (client, project) => {
		const created = await client.query(GATEWAY_INSERTS[kind], [project.id, actorId]);
		await client.query(
			`INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, changed_by, change_source)
			 VALUES ($1, $2, $3, 'created', $4, 'agent_call')`,
			[project.id, kind, created.rows[0].id, userId]
		);
	};
}

// Creates that queue behind the delete then fail on the deleted project; that
// is expected ("other"). A deadlock is not.
async function projectSoftDelete(client, project) {
	await client.query(`SELECT public.soft_delete_onto_project($1)`, [project.id]);
}

// link_onto_entities: the gateway checks for the edge, then inserts it, as two requests.
async function link(client, project, srcId, dstId) {
	const edge = [project.id, 'task', srcId, 'task', dstId, 'depends_on'];
	const existing = await client.query(
		`SELECT id FROM public.onto_edges
		 WHERE project_id = $1 AND src_kind = $2 AND src_id = $3 AND dst_kind = $4 AND dst_id = $5 AND rel = $6`,
		edge
	);
	if (existing.rowCount > 1)
		throw Object.assign(new Error('duplicate edges already exist'), { code: 'DUP' });
	if (existing.rowCount === 1) return;
	await client.query(
		`INSERT INTO public.onto_edges (project_id, src_kind, src_id, dst_kind, dst_id, rel)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		edge
	);
}
const linkIdentical = (client, project) =>
	link(client, project, project.taskIds[0], project.taskIds[1]);
const linkDistinct = (index) => (client, project) =>
	link(client, project, project.taskIds[0], project.taskIds[index + 1]);

// The same link through onto_edge_link_atomic (20260925020100): one request.
async function linkRpc(client, project, srcId, dstId) {
	await client.query(
		`SELECT public.onto_edge_link_atomic($1, 'task', $2, 'depends_on', 'task', $3, '{}'::jsonb)`,
		[project.id, srcId, dstId]
	);
}
const linkIdenticalRpc = (client, project) =>
	linkRpc(client, project, project.taskIds[0], project.taskIds[1]);
const linkDistinctRpc = (index) => (client, project) =>
	linkRpc(client, project, project.taskIds[0], project.taskIds[index + 1]);

// ------------------------------------------------------------------ runner

async function sessionFor() {
	const client = await connect();
	await client.query(`SET statement_timeout = '20s'`);
	if (actingAs === 'member') {
		await client.query(`SET ROLE authenticated`);
		await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
			JSON.stringify({ role: 'authenticated', sub: userId })
		]);
	} else {
		await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
			JSON.stringify({ role: 'service_role' })
		]);
	}
	return client;
}

async function runScenario(name) {
	const results = [];
	for (let round = 0; round < rounds; round++) {
		const project = await seedProject();
		const operations = SCENARIOS[name](n);
		const clients = await Promise.all(operations.map(() => sessionFor()));
		const started = performance.now();
		const calls = await Promise.all(
			operations.map(async (operation, index) => {
				if (index > 0 && SCENARIOS[name].mixed) await sleep(5);
				const callStarted = performance.now();
				try {
					await operation(clients[index], project);
					return { ms: performance.now() - callStarted, code: 'ok' };
				} catch (error) {
					return {
						ms: performance.now() - callStarted,
						code: error.code ?? 'error',
						message: error.message
					};
				}
			})
		);
		const wall = performance.now() - started;
		await Promise.all(clients.map((client) => client.end()));
		const duplicates = await admin.query(
			`SELECT count(*)::int - count(DISTINCT (src_id, dst_id, rel))::int AS n
			 FROM public.onto_edges WHERE project_id = $1 AND rel = 'depends_on'`,
			[project.id]
		);
		results.push({ wall, calls, duplicateEdges: duplicates.rows[0].n });
	}
	return summarize(name, results);
}

function summarize(name, results) {
	const calls = results.flatMap((result) => result.calls);
	const count = (code) => calls.filter((call) => call.code === code).length;
	const walls = results.map((result) => result.wall).sort((a, b) => a - b);
	const errors = [
		...new Set(calls.filter((c) => c.code !== 'ok').map((c) => `${c.code}: ${c.message}`))
	];
	if (calls.every((call) => call.code === '42883')) {
		return { scenario: name, missing: true, errors: errors.slice(0, 1) };
	}
	return {
		scenario: name,
		wallMedianMs: Math.round(walls[Math.floor(walls.length / 2)]),
		wallMaxMs: Math.round(walls[walls.length - 1]),
		slowestCallMs: Math.round(Math.max(...calls.map((call) => call.ms))),
		ok: count('ok'),
		deadlocks: count('40P01'),
		timeouts: count('57014'),
		otherErrors: calls.length - count('ok') - count('40P01') - count('57014'),
		duplicateEdges: results.reduce((sum, result) => sum + result.duplicateEdges, 0),
		errors: errors.slice(0, 3)
	};
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function print(phase, rows) {
	console.log(`\n${phase} (${actingAs}, n=${n}, rounds=${rounds}, bump delay ${bumpDelayMs} ms)`);
	console.log(
		'  scenario                        wall med/max ms   slowest ms   ok  40P01  57014  other  dup-edges'
	);
	for (const row of rows) {
		if (row.missing) {
			console.log(
				`  ${row.scenario.padEnd(31)} not in this schema (${row.errors[0]?.slice(0, 80)})`
			);
			continue;
		}
		console.log(
			`  ${row.scenario.padEnd(31)} ${`${row.wallMedianMs}/${row.wallMaxMs}`.padStart(15)}   ${String(row.slowestCallMs).padStart(10)}` +
				`  ${String(row.ok).padStart(3)}  ${String(row.deadlocks).padStart(5)}  ${String(row.timeouts).padStart(5)}` +
				`  ${String(row.otherErrors).padStart(5)}  ${String(row.duplicateEdges).padStart(9)}`
		);
		for (const error of row.errors) console.log(`      ${error.slice(0, 160)}`);
	}
}

async function runAll(phase) {
	const rows = [];
	for (const name of scenarioNames) rows.push(await runScenario(name));
	print(phase, rows);
	return rows;
}

const report = { cluster: clusterDir, actingAs, n, rounds, bumpDelayMs, phases: {} };
try {
	await setBumpDelay(bumpDelayMs);
	report.phases.before = await runAll(applyFiles.length ? 'BEFORE' : 'CURRENT');
	if (applyFiles.length) {
		for (const file of applyFiles) {
			await admin.query(readFileSync(file, 'utf8'));
			console.log(`\napplied ${file.replace(`${root}/`, '')}`);
		}
		report.phases.after = await runAll('AFTER');
	}
	if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 1));
} finally {
	await setBumpDelay(0).catch(() => {});
	await admin.end();
	if (startedHere && !argv.includes('--leave-running')) pgCtl('stop', '-m', 'fast');
}
