// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull6.mjs
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
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
					.replace(/^"|"$/g, '')
			];
		})
);
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});
const turns = JSON.parse(fs.readFileSync('turns.json', 'utf8'));
const pct = (a, p) => {
	if (!a.length) return null;
	const s = [...a].sort((x, y) => x - y);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const cutoff = '2026-08-28T12:00:00Z';
const ok = turns.filter(
	(t) =>
		t.started_at >= cutoff && t.execution_mode === 'worker_realtime' && t.status === 'completed'
);
const agg = {};
let sample = null;
const perTurn = [];
for (const t of ok) {
	const { data: ev } = await sb
		.from('chat_turn_events')
		.select('payload')
		.eq('turn_run_id', t.id)
		.eq('event_type', 'timing')
		.limit(1);
	const tp = ev?.[0]?.payload?.timing;
	if (!tp) continue;
	if (!sample) sample = tp;
	const flat = (o, p = '') =>
		Object.entries(o).forEach(([k, v]) =>
			typeof v === 'number'
				? (agg[p + k] ||= []).push(v)
				: v && typeof v === 'object' && !Array.isArray(v)
					? flat(v, p + k + '.')
					: 0
		);
	flat(tp);
	perTurn.push({
		id: t.id.slice(0, 8),
		calls: t.usage?.calls,
		tools: t.tool_call_count,
		total: Math.round(tp.phases?.total_request_ms),
		prov: Math.round(tp.phases?.provider_authority_to_finish_ms),
		gen: Math.round(tp.phases?.response_generation_ms),
		ttfr: Math.round(tp.phases?.time_to_first_response_ms),
		queue: tp.phases?.queue_wait_ms,
		msg: t.request_message.slice(0, 40)
	});
}
console.log('timing sample:', JSON.stringify(sample).slice(0, 3500));
console.log('\n=== phase aggregates over', perTurn.length, 'completed worker turns since cutoff');
for (const [k, a] of Object.entries(agg).sort())
	console.log(
		k.padEnd(62),
		`n=${a.length} p50=${Math.round(pct(a, 0.5))} p90=${Math.round(pct(a, 0.9))}`
	);
console.log('\n=== per-turn (total / provider-authority / generation / ttfr / queue)');
for (const p of perTurn.sort((a, b) => b.total - a.total).slice(0, 20))
	console.log(JSON.stringify(p));
// search result item shape from the Theo Von turn
const { data: ev } = await sb
	.from('chat_turn_events')
	.select('payload')
	.eq('turn_run_id', '3cd50ea6-1d38-4e4f-8c5a-32d6499290d8')
	.eq('event_type', 'tool_result')
	.order('sequence_index')
	.limit(1);
console.log(
	'\n=== search_all_projects first result item:',
	JSON.stringify(ev?.[0]?.payload?.result?.result?.results?.[0] || ev?.[0]?.payload).slice(
		0,
		1200
	)
);
const { data: ev2 } = await sb
	.from('chat_turn_events')
	.select('payload')
	.eq('turn_run_id', '3cd50ea6-1d38-4e4f-8c5a-32d6499290d8')
	.eq('event_type', 'tool_result')
	.eq('sequence_index', 15);
console.log(
	'\n=== explore_project result item:',
	JSON.stringify(ev2?.[0]?.payload?.result?.result?.results?.[0]).slice(0, 1200)
);
