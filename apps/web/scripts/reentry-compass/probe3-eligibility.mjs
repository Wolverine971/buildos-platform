// apps/web/scripts/reentry-compass/probe3-eligibility.mjs
// Phase 0 eligibility-funnel probe — READ ONLY.
// How many external users pass each tasker/43 eligibility criterion TODAY, and which
// (user, project) pairs are packet candidates.
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const SCRATCH = process.env.OUT_DIR ?? new URL('./out', import.meta.url).pathname;
const envRaw = readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i < 0) continue;
	env[t.slice(0, i).trim()] = t
		.slice(i + 1)
		.trim()
		.replace(/^["']|["']$/g, '');
}
const require = createRequire(new URL('../../package.json', import.meta.url).pathname);
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

async function fetchAll(table, select) {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await sb
			.from(table)
			.select(select)
			.range(from, from + 999);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...data);
		if (data.length < 1000) break;
	}
	return rows;
}

const users = JSON.parse(readFileSync(`${SCRATCH}/dump-users.json`, 'utf8'));
const logs = JSON.parse(readFileSync(`${SCRATCH}/dump-logs.json`, 'utf8'));
const projectsRaw = JSON.parse(readFileSync(`${SCRATCH}/dump-projects.json`, 'utf8'));
const actors = JSON.parse(readFileSync(`${SCRATCH}/dump-actors.json`, 'utf8'));
// onto_projects.created_by is an onto_actors.id — resolve to the owning user id.
const actorUser = new Map(actors.filter((a) => a.user_id).map((a) => [a.id, a.user_id]));
const projects = projectsRaw.map((p) => ({
	...p,
	created_by: actorUser.get(p.created_by) ?? null
}));
const tasks = await fetchAll(
	'onto_tasks',
	'id, project_id, title, state_key, due_at, completed_at, created_by, created_at, updated_at, deleted_at, archived_at'
);
writeFileSync(`${SCRATCH}/dump-tasks.json`, JSON.stringify(tasks));

const NOW = Date.parse('2026-08-04T18:00:00Z');
const D = 86400e3;
const internal = new Set(
	users
		.filter(
			(u) =>
				u.is_admin ||
				/djwayne|@build-os\.com|buildos|\+test|test@|example\.com/i.test(u.email || '')
		)
		.map((u) => u.id)
);

// Last user activity: max(user-attributed log, last_visit) — last_visit is the better
// "was here" signal when present; logs are the floor.
const lastLog = new Map();
const userMutByProject = new Map(); // user -> project -> {count, days:Set, lastT}
for (const l of logs) {
	if (l.change_source === 'agent_call' || !l.changed_by) continue;
	const t = Date.parse(l.created_at);
	if (!lastLog.has(l.changed_by) || t > lastLog.get(l.changed_by)) lastLog.set(l.changed_by, t);
	if (!userMutByProject.has(l.changed_by)) userMutByProject.set(l.changed_by, new Map());
	const pm = userMutByProject.get(l.changed_by);
	if (!pm.has(l.project_id)) pm.set(l.project_id, { count: 0, days: new Set(), lastT: 0 });
	const rec = pm.get(l.project_id);
	rec.count++;
	rec.days.add(l.created_at.slice(0, 10));
	if (t > rec.lastT) rec.lastT = t;
}

const liveProjects = projects.filter((p) => !p.deleted_at && !p.archived_at);
const projById = new Map(liveProjects.map((p) => [p.id, p]));
const activeTasksByProject = new Map();
for (const t of tasks) {
	if (t.deleted_at || t.archived_at) continue;
	if (['done', 'completed', 'cancelled', 'canceled'].includes(t.state_key)) continue;
	if (!activeTasksByProject.has(t.project_id)) activeTasksByProject.set(t.project_id, []);
	activeTasksByProject.get(t.project_id).push(t);
}

// Funnel over external users
const funnel = {
	external_users: 0,
	onboarded: 0,
	has_live_project: 0,
	absent_72h_30d: 0,
	absent_gt_30d: 0,
	has_qualifying_project: 0, // >=3d old, >=3 user muts across >=2 days
	has_resumption_cue: 0 // next_step_short OR active task on qualifying project
};
const candidates = [];
for (const u of users) {
	if (internal.has(u.id)) continue;
	funnel.external_users++;
	if (!u.onboarding_completed_at) continue;
	funnel.onboarded++;
	const owned = liveProjects.filter((p) => p.created_by === u.id);
	if (!owned.length) continue;
	funnel.has_live_project++;
	const lastActive = Math.max(
		lastLog.get(u.id) ?? 0,
		u.last_visit ? Date.parse(u.last_visit) : 0
	);
	if (!lastActive) continue;
	const absentDays = (NOW - lastActive) / D;
	if (absentDays > 30) {
		funnel.absent_gt_30d++;
		continue;
	}
	if (absentDays < 3) continue;
	funnel.absent_72h_30d++;
	const pm = userMutByProject.get(u.id) ?? new Map();
	const qual = owned.filter((p) => {
		const rec = pm.get(p.id);
		const ageDays = (NOW - Date.parse(p.created_at)) / D;
		return ageDays >= 3 && rec && rec.count >= 3 && rec.days.size >= 2;
	});
	if (!qual.length) continue;
	funnel.has_qualifying_project++;
	const cued = qual.filter(
		(p) => (p.next_step_short && p.next_step_short.trim()) || activeTasksByProject.has(p.id)
	);
	if (!cued.length) continue;
	funnel.has_resumption_cue++;
	// Ranking v0: most recently user-mutated qualifying project
	cued.sort((a, b) => (pm.get(b.id)?.lastT ?? 0) - (pm.get(a.id)?.lastT ?? 0));
	candidates.push({
		user_id: u.id,
		absent_days: +absentDays.toFixed(1),
		bucket: absentDays <= 7 ? '3-7d' : absentDays <= 14 ? '8-14d' : '15-30d',
		n_qualifying: cued.length,
		top_project: cued[0].id,
		top_project_name: cued[0].name,
		alt_project: cued[1]?.id ?? null,
		has_next_step: !!(cued[0].next_step_short && cued[0].next_step_short.trim()),
		active_tasks: (activeTasksByProject.get(cued[0].id) ?? []).length,
		user_muts_on_top: pm.get(cued[0].id)?.count ?? 0
	});
}

// Relaxed pool for packet generation (any absence >=3d incl. >30d — packets don't need
// the 30d cap; the cap is an assignment rule, not a truth-audit rule)
const relaxed = [];
for (const u of users) {
	if (internal.has(u.id)) continue;
	if (!u.onboarding_completed_at) continue;
	const owned = liveProjects.filter((p) => p.created_by === u.id);
	const lastActive = Math.max(
		lastLog.get(u.id) ?? 0,
		u.last_visit ? Date.parse(u.last_visit) : 0
	);
	if (!lastActive || (NOW - lastActive) / D < 3) continue;
	const pm = userMutByProject.get(u.id) ?? new Map();
	for (const p of owned) {
		const rec = pm.get(p.id);
		const ageDays = (NOW - Date.parse(p.created_at)) / D;
		if (ageDays < 3 || !rec || rec.count < 3 || rec.days.size < 2) continue;
		if (!((p.next_step_short && p.next_step_short.trim()) || activeTasksByProject.has(p.id)))
			continue;
		relaxed.push({
			user_id: u.id,
			absent_days: +((NOW - lastActive) / D).toFixed(1),
			project_id: p.id,
			project_name: p.name,
			last_user_mut_on_project_days_ago: rec.lastT
				? +((NOW - rec.lastT) / D).toFixed(1)
				: null,
			muts: rec.count,
			mut_days: rec.days.size,
			has_next_step: !!(p.next_step_short && p.next_step_short.trim()),
			active_tasks: (activeTasksByProject.get(p.id) ?? []).length
		});
	}
}
writeFileSync(
	`${SCRATCH}/packet-candidates.json`,
	JSON.stringify({ candidates, relaxed }, null, 1)
);

console.log(
	JSON.stringify(
		{ funnel, strict_candidates: candidates.length, relaxed_pairs: relaxed.length },
		null,
		2
	)
);
console.log('strict:', JSON.stringify(candidates, null, 1).slice(0, 3000));
