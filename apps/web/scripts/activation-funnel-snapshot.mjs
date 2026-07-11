// apps/web/scripts/activation-funnel-snapshot.mjs
// tasker/26 WP-5: READ-ONLY activation funnel snapshot (baseline recorded 2026-07-11T03:09Z pre-gate;
// rerun after the gate ships for the before/after comparison). Run: node apps/web/scripts/activation-funnel-snapshot.mjs
// signup -> onboarding_completed -> completed-with->=1-project -> reopened-within-7d proxy.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n')
		.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
		.map((l) => {
			const i = l.indexOf('=');
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^["']|["']$/g, '')
			];
		})
);

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

async function fetchAll(table, columns, orderCol = 'created_at') {
	const rows = [];
	const page = 1000;
	for (let from = 0; ; from += page) {
		const { data, error } = await supabase
			.from(table)
			.select(columns)
			.order(orderCol, { ascending: true })
			.range(from, from + page - 1);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...data);
		if (data.length < page) break;
	}
	return rows;
}

const users = await fetchAll('users', 'id, created_at, onboarding_completed_at, onboarding_intent');
const projects = await fetchAll('onto_projects', 'id, created_by, created_at');
const logs = await fetchAll('onto_project_logs', 'id, project_id, changed_by, created_at');
// onto_projects.created_by is an ACTOR id — map back to users via onto_actors.
const actors = await fetchAll('onto_actors', 'id, user_id');
const actorToUser = new Map(actors.map((a) => [a.id, a.user_id]));

const projectsByUser = new Map();
for (const p of projects) {
	const uid = actorToUser.get(p.created_by);
	if (!uid) continue;
	if (!projectsByUser.has(uid)) projectsByUser.set(uid, []);
	projectsByUser.get(uid).push(p);
}
const logsByUser = new Map();
for (const l of logs) {
	if (!logsByUser.has(l.changed_by)) logsByUser.set(l.changed_by, []);
	logsByUser.get(l.changed_by).push(l);
}

const now = Date.now();
const d30 = now - 30 * 86400e3;
const d90 = now - 90 * 86400e3;

function funnel(cohort, label) {
	const total = cohort.length;
	const completed = cohort.filter((u) => u.onboarding_completed_at);
	const withProject = completed.filter((u) => (projectsByUser.get(u.id) ?? []).length >= 1);
	const zeroProject = completed.filter((u) => (projectsByUser.get(u.id) ?? []).length === 0);

	// Reopen proxy: any onto_project_logs row by this user on one of their own
	// projects, >24h after their FIRST project's creation and within 7 days of it.
	const reopened = withProject.filter((u) => {
		const own = projectsByUser.get(u.id);
		const first = own.reduce((a, b) => (a.created_at < b.created_at ? a : b));
		const t0 = new Date(first.created_at).getTime();
		const ownIds = new Set(own.map((p) => p.id));
		return (logsByUser.get(u.id) ?? []).some((l) => {
			if (!ownIds.has(l.project_id)) return false;
			const t = new Date(l.created_at).getTime();
			return t > t0 + 24 * 3600e3 && t <= t0 + 7 * 86400e3;
		});
	});

	const byIntent = {};
	for (const u of completed) {
		const intent = u.onboarding_intent ?? '(null)';
		byIntent[intent] ??= { completed: 0, zeroProjects: 0 };
		byIntent[intent].completed++;
		if ((projectsByUser.get(u.id) ?? []).length === 0) byIntent[intent].zeroProjects++;
	}

	console.log(`\n=== ${label} ===`);
	console.log(`signups:                      ${total}`);
	console.log(
		`onboarding_completed:         ${completed.length} (${pct(completed.length, total)})`
	);
	console.log(
		`completed with >=1 project:   ${withProject.length} (${pct(withProject.length, completed.length)} of completed)`
	);
	console.log(
		`completed with 0 projects:    ${zeroProject.length} (${pct(zeroProject.length, completed.length)} of completed)  <-- false-positive rate`
	);
	console.log(
		`reopen-within-7d proxy:       ${reopened.length} (${pct(reopened.length, withProject.length)} of with-project)`
	);
	console.log(`completed by intent (completed / zero-project):`);
	for (const [intent, s] of Object.entries(byIntent)) {
		console.log(
			`  ${intent.padEnd(10)} ${String(s.completed).padStart(4)} completed, ${String(s.zeroProjects).padStart(4)} at 0 projects (${pct(s.zeroProjects, s.completed)})`
		);
	}
}

function pct(a, b) {
	return b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a';
}

console.log(`Snapshot at ${new Date(now).toISOString()}`);
console.log(
	`rows: users=${users.length} onto_projects=${projects.length} onto_project_logs=${logs.length}`
);
funnel(users, 'ALL-TIME');
funnel(
	users.filter((u) => new Date(u.created_at).getTime() >= d90),
	'LAST 90 DAYS (signup cohort)'
);
funnel(
	users.filter((u) => new Date(u.created_at).getTime() >= d30),
	'LAST 30 DAYS (signup cohort)'
);
