// apps/web/scripts/reentry-compass/generate-packets.mjs
// tasker/43 Phase 0 — offline Re-entry Compass packet generator. DETERMINISTIC, no LLM.
// Assembles packets per the grounding contract from dumped prod data. Never touches prod UI.
// Packet kinds: current (dormant user, as-of now), replay (historical return episode, as-of t0-1s),
// dogfood (internal users, replay). Gate math counts EXTERNAL packets only.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const SCRATCH = process.env.OUT_DIR ?? new URL('./out', import.meta.url).pathname;
const NOW = Date.parse('2026-08-04T18:00:00Z');
const D = 86400e3;
const RANKING_VERSION = 'phase0-v1';
const ASSEMBLY_VERSION = 'phase0-v1';

const J = (f) => JSON.parse(readFileSync(`${SCRATCH}/${f}`, 'utf8'));
const users = J('dump-users.json');
const logs = J('dump-logs.json');
const projectsRaw = J('dump-projects.json');
const actors = J('dump-actors.json');
const tasks = J('dump-tasks.json');
const docs = J('dump-documents.json');
const episodes = J('episodes.json');

const actorUser = new Map(actors.filter((a) => a.user_id).map((a) => [a.id, a.user_id]));
const userById = new Map(users.map((u) => [u.id, u]));
const projects = projectsRaw.map((p) => ({ ...p, owner: actorUser.get(p.created_by) ?? null }));
const internal = new Set(
	users
		.filter(
			(u) =>
				u.is_admin ||
				/djwayne|@build-os\.com|buildos|\+test|test@|example\.com/i.test(u.email || '')
		)
		.map((u) => u.id)
);

const titleByEntity = new Map();
for (const t of tasks) titleByEntity.set(t.id, t.title);
for (const d of docs) titleByEntity.set(d.id, d.title);
for (const g of J('dump-goals.json')) titleByEntity.set(g.id, g.name ?? g.title);
for (const p of J('dump-plans.json')) titleByEntity.set(p.id, p.name ?? p.title);
for (const m of J('dump-milestones.json')) titleByEntity.set(m.id, m.name ?? m.title);

// Per-user per-project mutation index (user-attributed only)
const mutIdx = new Map(); // `${user}|${project}` -> sorted times
const lastUserActivity = new Map();
for (const l of logs) {
	if (l.change_source === 'agent_call' || !l.changed_by) continue;
	const t = Date.parse(l.created_at);
	const k = `${l.changed_by}|${l.project_id}`;
	if (!mutIdx.has(k)) mutIdx.set(k, []);
	mutIdx.get(k).push(t);
	if (!lastUserActivity.has(l.changed_by) || t > lastUserActivity.get(l.changed_by))
		lastUserActivity.set(l.changed_by, t);
}
for (const arr of mutIdx.values()) arr.sort((a, b) => a - b);

const aliveAt = (row, asOf) =>
	Date.parse(row.created_at) <= asOf &&
	(!row.deleted_at || Date.parse(row.deleted_at) > asOf) &&
	(!row.archived_at || Date.parse(row.archived_at) > asOf);

// Start Here extraction, mirroring packages/shared-agent-ops/src/ontology/start-here.ts:
// doc = most recent live document.context.project; status.now lives in the
// <!-- managed:status --> fenced region; placeholder lines normalize to null.
// Fallback allowed by the grounding contract: bounded authored orientation.
function parseManagedStatus(md) {
	const m = md.match(/<!--\s*managed:status[^>]*-->([\s\S]*?)<!--\s*\/managed:status\s*-->/);
	if (!m) return null;
	const body = m[1];
	const line = (re, placeholder) => {
		const v = body.match(re)?.[1]?.trim();
		return v && !placeholder.test(v) ? v : null;
	};
	return {
		now: line(/\*\*Now:\*\*\s*(.+)/, /No project snapshot has been rendered yet/i),
		nextStep: line(/\*\*Next step:\*\*\s*(.+)/, /Not captured yet/i),
		refreshedAt: body.match(/_Last refreshed\s+([0-9T:.Z+-]+)/)?.[1] ?? null
	};
}
function startHereState(projectId, asOf, isReplay) {
	if (isReplay) return { omit: 'not-reconstructible-at-replay-time' };
	const cand = docs
		.filter(
			(d) =>
				d.project_id === projectId &&
				d.type_key === 'document.context.project' &&
				aliveAt(d, asOf)
		)
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
	if (!cand) return { omit: 'no-start-here-document' };
	const md = cand.content || cand.props?.body_markdown || '';
	const status = parseManagedStatus(md);
	const ageDays = (asOf - Date.parse(cand.updated_at)) / D;
	if (status?.now)
		return {
			text: status.now.slice(0, 280),
			managed_next_step: status.nextStep,
			source: {
				doc_id: cand.id,
				kind: 'managed:status.now',
				refreshed_at: status.refreshedAt,
				doc_updated_at: cand.updated_at
			},
			age_days: status.refreshedAt
				? +((asOf - Date.parse(status.refreshedAt)) / D).toFixed(1)
				: +ageDays.toFixed(1)
		};
	// authored-orientation fallback: first real paragraph outside managed fences
	const stripped = md
		.replace(/<!--\s*managed:[a-z]+[^>]*-->[\s\S]*?<!--\s*\/managed:[a-z]+\s*-->/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
	const para = stripped
		.split(/\n\s*\n/)
		.map((s) => s.trim())
		.find((s) => s && !s.startsWith('#') && !s.startsWith('**State:') && s.length > 30);
	if (para)
		return {
			text: para.replace(/\n+/g, ' ').slice(0, 240),
			managed_next_step: status?.nextStep ?? null,
			source: {
				doc_id: cand.id,
				kind: 'authored-orientation',
				doc_updated_at: cand.updated_at
			},
			age_days: +ageDays.toFixed(1)
		};
	return { omit: 'no-rendered-status-and-no-authored-orientation', doc_id: cand.id };
}

function describeReceipt(l, ownerId) {
	const title = titleByEntity.get(l.entity_id);
	const what = title ? `${l.entity_type} “${String(title).slice(0, 60)}”` : `a ${l.entity_type}`;
	const verb = { created: 'added', updated: 'updated', deleted: 'removed' }[l.action] ?? l.action;
	let who;
	if (l.change_source === 'agent_call') who = 'An agent';
	else if (l.changed_by === ownerId) who = 'You';
	else who = userById.get(l.changed_by)?.name || 'A collaborator';
	return {
		text: `${who} ${verb} ${what}`,
		source: {
			log_id: l.id,
			entity_type: l.entity_type,
			entity_id: l.entity_id,
			at: l.created_at,
			change_source: l.change_source
		}
	};
}

function assemble(userId, asOf, kind, awaySince) {
	const isReplay = kind !== 'current';
	// Active-facing only (state_key is current-value; replay caveat recorded in packet).
	const owned = projects.filter(
		(p) =>
			p.owner === userId &&
			aliveAt(p, asOf) &&
			(!p.state_key || ['planning', 'active'].includes(p.state_key))
	);
	if (!owned.length) return null;

	// Ranking v1: most recent user mutation before asOf; fallback most recent created_at.
	const lastMut = (p) => {
		const arr = mutIdx.get(`${userId}|${p.id}`) ?? [];
		let best = 0;
		for (const t of arr) if (t < asOf && t > best) best = t;
		return best;
	};
	const scored = owned
		.map((p) => ({ p, score: lastMut(p) || Date.parse(p.created_at) }))
		.sort((a, b) => b.score - a.score);
	const top = scored[0].p;
	const alt = scored[1]?.p ?? null;
	const lowConfidence = scored.length > 1 && scored[0].score - scored[1].score < 7 * D;

	const projTasks = tasks.filter((t) => t.project_id === top.id && aliveAt(t, asOf));
	const activeAt = projTasks.filter(
		(t) =>
			!['done', 'completed', 'cancelled', 'canceled'].includes(t.state_key) ||
			(t.completed_at && Date.parse(t.completed_at) > asOf)
	);

	// Since you were away: project logs in (awaySince, asOf], newest 2, excluding noise types.
	let sinceRows = null;
	if (awaySince) {
		const rel = logs
			.filter(
				(l) =>
					l.project_id === top.id &&
					!['edge', 'event'].includes(l.entity_type) &&
					Date.parse(l.created_at) > awaySince &&
					Date.parse(l.created_at) <= asOf
			)
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
			.slice(0, 2);
		sinceRows = rel.length
			? rel.map((l) => describeReceipt(l, userId))
			: { omit: 'no-changes-while-away' };
	} else sinceRows = { omit: 'no-away-window-boundary' };

	// Blocked / needs attention: real blocked task, else most-overdue active task.
	let blockedRow;
	const blocked = activeAt.filter((t) => t.state_key === 'blocked');
	const overdue = activeAt
		.filter((t) => t.due_at && Date.parse(t.due_at) < asOf)
		.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
	if (blocked.length)
		blockedRow = {
			text: `Blocked: “${blocked[0].title.slice(0, 70)}”`,
			source: { task_id: blocked[0].id, state_key: 'blocked' },
			replay_caveat: isReplay ? 'state_key-not-time-traveled' : undefined
		};
	else if (overdue.length)
		blockedRow = {
			text: `Overdue: “${overdue[0].title.slice(0, 70)}” (due ${overdue[0].due_at.slice(0, 10)})`,
			source: { task_id: overdue[0].id, due_at: overdue[0].due_at }
		};
	else blockedRow = { omit: 'no-blocked-or-overdue-task' };

	// Next move precedence (mirrors ProjectMemoryCard): managed status.nextStep →
	// onto_projects.next_step_short → deterministic top active task. Replay: task-only.
	const stateRow = startHereState(top.id, asOf, isReplay);
	let nextRow;
	if (!isReplay && stateRow.managed_next_step)
		nextRow = {
			text: stateRow.managed_next_step.slice(0, 160),
			source: { kind: 'managed:status.nextStep', doc_id: stateRow.source?.doc_id }
		};
	else if (!isReplay && top.next_step_short && top.next_step_short.trim())
		nextRow = {
			text: top.next_step_short.trim().slice(0, 160),
			source: {
				field: 'onto_projects.next_step_short',
				project_id: top.id,
				next_step_source: top.next_step_source ?? null,
				next_step_updated_at: top.next_step_updated_at ?? null
			}
		};
	else {
		const pick = [...activeAt].sort((a, b) => {
			const da = a.due_at ? Date.parse(a.due_at) : Infinity;
			const db = b.due_at ? Date.parse(b.due_at) : Infinity;
			if (da !== db) return da - db;
			return Date.parse(b.created_at) - Date.parse(a.created_at);
		})[0];
		nextRow = pick
			? {
					text: `Work “${pick.title.slice(0, 80)}”`,
					source: {
						task_id: pick.id,
						state_key: pick.state_key,
						rule: 'earliest-due-else-newest'
					}
				}
			: { omit: 'no-active-task-and-no-next-step' };
	}

	const u = userById.get(userId);
	return {
		packet_id: `${kind}-${userId.slice(0, 8)}-${top.id.slice(0, 8)}-${new Date(asOf).toISOString().slice(0, 10)}`,
		kind,
		internal: internal.has(userId),
		as_of: new Date(asOf).toISOString(),
		away_days: awaySince ? +((asOf - awaySince) / D).toFixed(1) : null,
		user: { id: userId, name: u?.name ?? null },
		ranking: {
			version: RANKING_VERSION,
			selected: { id: top.id, name: top.name },
			alternate: alt ? { id: alt.id, name: alt.name } : null,
			low_confidence_offer_choice: lowConfidence,
			candidates_considered: scored.length
		},
		rows: {
			where_it_stands: stateRow,
			since_you_were_away: sinceRows,
			blocked: blockedRow,
			next_move: nextRow
		},
		evidence_coverage: {
			user_mutations_on_selected: (mutIdx.get(`${userId}|${top.id}`) ?? []).filter(
				(t) => t < asOf
			).length,
			active_tasks_at_asof: activeAt.length,
			has_next_step_field: !!(top.next_step_short && top.next_step_short.trim())
		},
		assembly_version: ASSEMBLY_VERSION
	};
}

const packets = [];
// A) current-dormant external users (absent >= 3d)
for (const u of users) {
	if (internal.has(u.id) || !u.onboarding_completed_at) continue;
	const lastActive = Math.max(
		lastUserActivity.get(u.id) ?? 0,
		u.last_visit ? Date.parse(u.last_visit) : 0
	);
	if (!lastActive || (NOW - lastActive) / D < 3) continue;
	const pk = assemble(u.id, NOW, 'current', lastActive);
	if (pk) packets.push(pk);
}
// B) replay of historical external return episodes (gap 3-90d)
for (const e of episodes) {
	if (e.internal) continue;
	const t0 = Date.parse(e.t0_iso);
	const awaySince = t0 - e.gap_days * D;
	const pk = assemble(e.user, t0 - 1000, 'replay', awaySince);
	if (pk) packets.push(pk);
}
// C) dogfood: internal replay episodes (up to 6)
let df = 0;
for (const e of episodes) {
	if (!e.internal || df >= 6) continue;
	const t0 = Date.parse(e.t0_iso);
	const pk = assemble(e.user, t0 - 1000, 'dogfood', t0 - e.gap_days * D);
	if (pk) {
		packets.push(pk);
		df++;
	}
}

mkdirSync(`${SCRATCH}/packets`, { recursive: true });
writeFileSync(`${SCRATCH}/packets/packets.json`, JSON.stringify(packets, null, 1));
const ext = packets.filter((p) => !p.internal);
console.log(
	JSON.stringify(
		{
			total: packets.length,
			external: ext.length,
			by_kind: packets.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {}),
			external_rows_populated: {
				where_it_stands: ext.filter((p) => !p.rows.where_it_stands.omit).length,
				since_away: ext.filter((p) => Array.isArray(p.rows.since_you_were_away)).length,
				blocked: ext.filter((p) => !p.rows.blocked.omit).length,
				next_move: ext.filter((p) => !p.rows.next_move.omit).length
			}
		},
		null,
		2
	)
);
