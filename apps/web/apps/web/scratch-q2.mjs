// apps/web/apps/web/scratch-q2.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(
	fs
		.readFileSync('/Users/djwayne/buildos-platform/apps/web/.env', 'utf8')
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
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY);
const { data: u } = await sb
	.from('users')
	.select('id,email')
	.eq('email', 'djwayne35@gmail.com')
	.single();
console.log('user', u?.id);
const uid = u.id;

for (const ch of ['in_app', 'email', 'push', 'sms']) {
	const { count } = await sb
		.from('notification_deliveries')
		.select('*', { count: 'exact', head: true })
		.eq('channel', ch);
	console.log('deliveries channel', ch, count);
}
const { count: mine } = await sb
	.from('notification_deliveries')
	.select('*', { count: 'exact', head: true })
	.eq('recipient_user_id', uid);
console.log('MY deliveries total:', mine);
const { data: myd } = await sb
	.from('notification_deliveries')
	.select('channel,status,created_at,notification_events(event_type)')
	.eq('recipient_user_id', uid)
	.order('created_at', { ascending: false })
	.limit(30);
console.log(
	'my recent 30:',
	JSON.stringify(
		(myd ?? []).map((d) => [
			d.notification_events?.event_type,
			d.channel,
			d.status,
			d.created_at?.slice(0, 10)
		])
	)
);

// what background work happened for DJ in last 30d
const since = new Date(Date.now() - 30 * 864e5).toISOString();
for (const [t, col] of [
	['project_loop_runs', 'user_id'],
	['project_audits', 'user_id'],
	['agent_runs', 'user_id'],
	['project_suggestions', null],
	['daily_briefs', 'user_id'],
	['voice_notes', 'user_id'],
	['inbox_items', 'user_id'],
	['calendar_analyses', 'user_id'],
	['onto_braindumps', 'user_id']
]) {
	let q = sb.from(t).select('*', { count: 'exact', head: true }).gte('created_at', since);
	if (col) q = q.eq(col, uid);
	const { count, error } = await q;
	console.log('30d', t, error ? 'ERR ' + error.message : count);
}
// project logs by action
const { data: logs } = await sb
	.from('onto_project_logs')
	.select('action,entity_type,change_source')
	.gte('created_at', since)
	.limit(1000);
const lc = {};
for (const l of logs ?? []) lc[`${l.change_source}`] = (lc[`${l.change_source}`] || 0) + 1;
console.log('30d project_logs by change_source', lc);
const la = {};
for (const l of logs ?? [])
	la[`${l.entity_type}.${l.action}`] = (la[`${l.entity_type}.${l.action}`] || 0) + 1;
console.log(
	'30d project_logs by entity.action',
	Object.entries(la)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15)
);
