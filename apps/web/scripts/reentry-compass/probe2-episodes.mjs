// apps/web/scripts/reentry-compass/probe2-episodes.mjs
// Phase 0 baseline probe — READ ONLY.
// Operationalizes return episodes + verified advances from onto_project_logs + chat activity.
// Dumps raw pulls to scratchpad JSON for reuse by the packet generator.
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

async function fetchAll(table, select, orderCol = 'created_at') {
	const rows = [];
	const PAGE = 1000;
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await sb
			.from(table)
			.select(select)
			.order(orderCol, { ascending: true })
			.range(from, from + PAGE - 1);
		if (error) throw new Error(`${table}: ${error.message}`);
		rows.push(...data);
		if (data.length < PAGE) break;
		if (from > 200000) break;
	}
	return rows;
}

// Column discovery for chat tables
for (const t of ['chat_sessions', 'chat_messages']) {
	const { data, error } = await sb.from(t).select('*').limit(1);
	console.error(`${t} cols:`, error ? error.message : Object.keys(data?.[0] ?? {}).join(','));
}

const users = await fetchAll(
	'users',
	'id, email, name, is_admin, created_at, last_visit, onboarding_completed_at'
);
const logs = await fetchAll(
	'onto_project_logs',
	'id, project_id, entity_type, entity_id, action, change_source, changed_by, changed_by_actor_id, agent_call_session_id, chat_session_id, external_agent_caller_id, created_at'
);
const projects = await fetchAll(
	'onto_projects',
	'id, name, created_by, created_at, updated_at, next_step_short, next_step_long, facet_stage, facet_context, facet_scale, archived_at, deleted_at, description'
);
const sessions = await fetchAll('chat_sessions', '*');
const messages = await fetchAll('chat_messages', '*');

writeFileSync(`${SCRATCH}/dump-users.json`, JSON.stringify(users));
writeFileSync(`${SCRATCH}/dump-logs.json`, JSON.stringify(logs));
writeFileSync(`${SCRATCH}/dump-projects.json`, JSON.stringify(projects));
writeFileSync(`${SCRATCH}/dump-chat-sessions.json`, JSON.stringify(sessions));
writeFileSync(`${SCRATCH}/dump-chat-messages.json`, JSON.stringify(messages));

// ---- Operationalization v0 ----
// Internal users: admins + DJ addresses (report separately as dogfood).
const internalIds = new Set(
	users
		.filter(
			(u) =>
				u.is_admin ||
				/djwayne|@build-os\.com|buildos|\+test|test@|example\.com/i.test(u.email || '')
		)
		.map((u) => u.id)
);

// A "user activity event": user-attributed mutation (change_source chat|api) OR a user chat message.
// A "verified advance": mutation with change_source chat|api, entity_type in canonical set.
const ADVANCE_TYPES = new Set([
	'task',
	'project',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'output'
]);
const sessionUser = new Map(sessions.map((s) => [s.id, s.user_id]));
const events = []; // {user, t, kind: 'mutation'|'chat', isAdvance, project_id}
for (const l of logs) {
	if (l.change_source === 'agent_call') continue; // external-agent mutation: not user activity
	if (!l.changed_by) continue;
	events.push({
		user: l.changed_by,
		t: Date.parse(l.created_at),
		kind: 'mutation',
		isAdvance: ADVANCE_TYPES.has(l.entity_type),
		project_id: l.project_id
	});
}
const msgUserKey = messages[0]?.user_id !== undefined ? 'user_id' : null;
const msgSessionKey =
	messages[0]?.session_id !== undefined
		? 'session_id'
		: messages[0]?.chat_session_id !== undefined
			? 'chat_session_id'
			: null;
for (const m of messages) {
	if ((m.role || m.message_role) !== 'user') continue;
	const uid = msgUserKey ? m[msgUserKey] : sessionUser.get(m[msgSessionKey]);
	if (!uid) continue;
	events.push({ user: uid, t: Date.parse(m.created_at), kind: 'chat', isAdvance: false });
}

// Per-user streams → return episodes
const byUser = new Map();
for (const e of events) {
	if (!byUser.has(e.user)) byUser.set(e.user, []);
	byUser.get(e.user).push(e);
}
const H72 = 72 * 3600e3,
	D30 = 30 * 24 * 3600e3,
	M30 = 30 * 60e3;
const episodes = [];
for (const [user, evs] of byUser) {
	evs.sort((a, b) => a.t - b.t);
	for (let i = 1; i < evs.length; i++) {
		const gap = evs[i].t - evs[i - 1].t;
		if (gap < H72) continue;
		// episode t0 = first event after gap
		const t0 = evs[i].t;
		const win = evs.filter((e) => e.t >= t0 && e.t <= t0 + M30);
		const advances = win.filter((e) => e.isAdvance);
		const firstAdvance = advances.length ? advances[0].t : null;
		episodes.push({
			user,
			internal: internalIds.has(user),
			gap_days: +(gap / 86400e3).toFixed(1),
			bucket:
				gap <= 7 * 86400e3
					? '3-7d'
					: gap <= 14 * 86400e3
						? '8-14d'
						: gap <= D30
							? '15-30d'
							: '>30d',
			t0_iso: new Date(t0).toISOString(),
			anchor_kind: evs[i].kind,
			anchor_is_advance: evs[i].isAdvance,
			advance_within_30m: !!firstAdvance,
			mins_to_advance: firstAdvance ? +((firstAdvance - t0) / 60e3).toFixed(1) : null,
			events_in_window: win.length
		});
	}
}
writeFileSync(`${SCRATCH}/episodes.json`, JSON.stringify(episodes, null, 1));

// ---- Aggregate readout ----
function summarize(eps, label) {
	const n = eps.length;
	const adv = eps.filter((e) => e.advance_within_30m);
	const anchorAdv = eps.filter((e) => e.anchor_is_advance);
	const chatAnchor = eps.filter((e) => e.anchor_kind === 'chat');
	const chatAnchorAdv = chatAnchor.filter((e) => e.advance_within_30m);
	// restricted mean time-to-advance (non-converters censored at 30)
	const rmst = n ? eps.reduce((s, e) => s + (e.mins_to_advance ?? 30), 0) / n : null;
	return {
		label,
		episodes: n,
		unique_users: new Set(eps.map((e) => e.user)).size,
		advance_within_30m: adv.length,
		advance_rate: n ? +(adv.length / n).toFixed(3) : null,
		anchor_event_was_itself_advance: anchorAdv.length,
		chat_anchored_episodes: chatAnchor.length,
		chat_anchored_advance_rate: chatAnchor.length
			? +(chatAnchorAdv.length / chatAnchor.length).toFixed(3)
			: null,
		restricted_mean_mins_to_advance: rmst ? +rmst.toFixed(1) : null,
		by_bucket: Object.fromEntries(
			['3-7d', '8-14d', '15-30d', '>30d'].map((b) => {
				const be = eps.filter((e) => e.bucket === b);
				return [
					b,
					{
						n: be.length,
						adv: be.filter((e) => e.advance_within_30m).length
					}
				];
			})
		)
	};
}
const ext = episodes.filter((e) => !e.internal);
const int_ = episodes.filter((e) => e.internal);
const out = {
	totals: {
		users: users.length,
		internal_users: internalIds.size,
		activity_events: events.length,
		users_with_activity: byUser.size
	},
	external: summarize(ext, 'external (primary readout)'),
	external_le_30d: summarize(
		ext.filter((e) => e.bucket !== '>30d'),
		'external, gap 3-30d (doc eligibility window)'
	),
	internal_dogfood: summarize(int_, 'internal/dogfood'),
	currently_dormant_external_users: users
		.filter((u) => !internalIds.has(u.id) && u.last_visit)
		.map((u) => ({
			id: u.id,
			days_since_last_visit: +((Date.now() - Date.parse(u.last_visit)) / 86400e3).toFixed(1),
			onboarded: !!u.onboarding_completed_at
		}))
		.filter((u) => u.days_since_last_visit >= 3 && u.days_since_last_visit <= 30).length
};
console.log(JSON.stringify(out, null, 2));
