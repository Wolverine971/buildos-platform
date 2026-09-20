// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull3.mjs
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
const ids = turns.map((t) => t.id);
// reviewer verification
let usage = [];
for (let i = 0; i < ids.length; i += 200) {
	const { data } = await sb
		.from('llm_usage_logs')
		.select(
			'turn_run_id,model_used,total_cost_usd,prompt_tokens,cached_prompt_tokens,metadata,operation_type'
		)
		.in('turn_run_id', ids.slice(i, i + 200))
		.eq('operation_type', 'agentic_chat_worker_stream');
	usage.push(...data);
}
const byRoute = {};
for (const u of usage) {
	const k = `${u.metadata?.routeId}|${u.model_used}`;
	const r = (byRoute[k] ||= { n: 0, cost: 0, p: 0, c: 0 });
	r.n++;
	r.cost += Number(u.total_cost_usd);
	r.p += u.prompt_tokens;
	r.c += u.cached_prompt_tokens;
}
console.log('=== worker usage by routeId|model');
for (const [k, r] of Object.entries(byRoute))
	console.log(
		k.padEnd(60),
		`n=${r.n} cost=$${r.cost.toFixed(3)} prompt=${r.p} cached=${((r.c / Math.max(1, r.p)) * 100).toFixed(0)}%`
	);
const total = usage.reduce((a, u) => a + Number(u.total_cost_usd), 0);
const rev = usage
	.filter((u) => u.metadata?.routeId === 'openrouter_semantic_reviewer')
	.reduce((a, u) => a + Number(u.total_cost_usd), 0);
console.log(
	`reviewer share of worker spend: ${((rev / total) * 100).toFixed(1)}% ($${rev.toFixed(3)} of $${total.toFixed(3)})`
);
// reviewer calls per turn distribution for turns that had any
const perTurn = {};
for (const u of usage) {
	const p = (perTurn[u.turn_run_id] ||= { act: 0, rev: 0 });
	if (u.metadata?.routeId === 'openrouter_semantic_reviewer') p.rev++;
	else p.act++;
}
const withRev = Object.values(perTurn).filter((p) => p.rev > 0);
console.log(
	'turns with reviewer:',
	withRev.length,
	'of',
	Object.keys(perTurn).length,
	'reviewer calls dist:',
	JSON.stringify(
		withRev.reduce((m, p) => {
			m[p.rev] = (m[p.rev] || 0) + 1;
			return m;
		}, {})
	),
	'acting calls dist on those:',
	JSON.stringify(
		withRev.reduce((m, p) => {
			m[p.act] = (m[p.act] || 0) + 1;
			return m;
		}, {})
	)
);
// events for a not_allowlisted turn
const na = turns.filter((t) => t.failure_code === 'provider_tool_not_allowlisted').slice(0, 3);
for (const t of na) {
	const { data: ev } = await sb
		.from('chat_turn_events')
		.select('event_type,phase,sequence_index,payload')
		.eq('turn_run_id', t.id)
		.order('sequence_index', { ascending: true });
	console.log(`\n=== events for ${t.id} (${t.request_message.slice(0, 50)}) n=${ev.length}`);
	const types = {};
	for (const e of ev) types[e.event_type] = (types[e.event_type] || 0) + 1;
	console.log(JSON.stringify(types));
	for (const e of ev) {
		const p = JSON.stringify(e.payload);
		if (/tool|allowlist|diagnostic|name/i.test(p) && !/text_delta/.test(e.event_type))
			console.log(e.sequence_index, e.event_type, p.slice(0, 300));
	}
}
// timing: try chat_turn_timing_metrics
const dj = turns
	.filter((t) => t.execution_mode === 'worker_realtime' && t.timing_metric_id)
	.slice(0, 40);
console.log('\nturns with timing_metric_id:', turns.filter((t) => t.timing_metric_id).length);
