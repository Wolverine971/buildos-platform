// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull5.mjs
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
const { data: me } = await sb
	.from('users')
	.select('id')
	.eq('email', 'djwayne35@gmail.com')
	.single();
const cutoff = '2026-08-28T12:00:00Z';
// A. failed DJ turns: events + usage
const failed = turns.filter(
	(t) =>
		t.user_id === me.id &&
		t.started_at >= cutoff &&
		['provider_tool_finish_reason_invalid', 'provider_forced_synthesis_failed'].includes(
			t.failure_code
		)
);
for (const t of failed) {
	console.log(
		`\n=== ${t.failure_code} ${t.id} ctx=${t.context_type} :: ${t.request_message.slice(0, 90)}`
	);
	const { data: u } = await sb
		.from('llm_usage_logs')
		.select(
			'model_used,provider,prompt_tokens,completion_tokens,reasoning_tokens,max_tokens,status,error_message,response_time_ms,metadata'
		)
		.eq('turn_run_id', t.id)
		.order('created_at');
	for (const r of u)
		console.log(
			`  call route=${r.metadata?.routeId} round=${r.metadata?.logicalProviderRound} attempt=${r.metadata?.providerAttempt} model=${r.model_used}@${r.provider} prompt=${r.prompt_tokens} comp=${r.completion_tokens} reason=${r.reasoning_tokens} max=${r.max_tokens} status=${r.status} ${r.response_time_ms}ms ${r.error_message ? 'ERR: ' + r.error_message.slice(0, 160) : ''} pstatus=${r.metadata?.providerStatus}`
		);
	const { data: ev } = await sb
		.from('chat_turn_events')
		.select('event_type,sequence_index,payload')
		.eq('turn_run_id', t.id)
		.order('sequence_index');
	for (const e of ev) {
		if (e.event_type === 'tool_call') {
			const f = e.payload.tool_call?.function;
			console.log(
				`  [${e.sequence_index}] CALL ${f?.name} ${(f?.arguments || '').slice(0, 160)}`
			);
		} else if (e.event_type === 'tool_result') {
			const r = JSON.stringify(e.payload.result || {});
			console.log(`  [${e.sequence_index}] RESULT ${r.slice(0, 200)}`);
		} else if (!/text_delta|agent_state|context_usage|session|turn_phase/.test(e.event_type))
			console.log(
				`  [${e.sequence_index}] ${e.event_type} ${JSON.stringify(e.payload).slice(0, 300)}`
			);
	}
}
// B. timing decomposition from 'done' events for DJ completed worker turns after cutoff
console.log('\n=== TIMING (DJ completed worker turns since cutoff)');
const ok = turns.filter(
	(t) =>
		t.user_id === me.id &&
		t.started_at >= cutoff &&
		t.execution_mode === 'worker_realtime' &&
		t.status === 'completed'
);
let printedKeys = false;
const agg = {};
for (const t of ok) {
	const { data: ev } = await sb
		.from('chat_turn_events')
		.select('event_type,payload')
		.eq('turn_run_id', t.id)
		.in('event_type', ['done', 'timing', 'turn_timing', 'terminal']);
	const done = ev.find((e) => e.event_type === 'done');
	const tp =
		done?.payload?.timing ||
		done?.payload?.async_timing ||
		done?.payload?.timing_summary ||
		null;
	if (!printedKeys && done) {
		console.log('done payload keys:', Object.keys(done.payload).join(','));
		console.log(JSON.stringify(done.payload).slice(0, 2500));
		printedKeys = true;
	}
	if (tp) {
		const flat = (o, p = '') =>
			Object.entries(o).forEach(([k, v]) =>
				typeof v === 'number'
					? (agg[p + k] ||= []).push(v)
					: v && typeof v === 'object' && !Array.isArray(v)
						? flat(v, p + k + '.')
						: 0
			);
		flat(tp);
	}
}
for (const [k, a] of Object.entries(agg))
	console.log(k.padEnd(60), `n=${a.length} p50=${pct(a, 0.5)} p90=${pct(a, 0.9)}`);
// C. post-cutoff reviewer share
const ids = turns.filter((t) => t.started_at >= cutoff).map((t) => t.id);
let usage = [];
for (let i = 0; i < ids.length; i += 200) {
	const { data } = await sb
		.from('llm_usage_logs')
		.select(
			'turn_run_id,model_used,prompt_tokens,cached_prompt_tokens,completion_tokens,total_cost_usd,metadata,response_time_ms'
		)
		.in('turn_run_id', ids.slice(i, i + 200))
		.eq('operation_type', 'agentic_chat_worker_stream');
	usage.push(...data);
}
const rev = usage.filter((u) => u.metadata?.routeId === 'openrouter_semantic_reviewer'),
	act = usage.filter((u) => u.metadata?.routeId !== 'openrouter_semantic_reviewer');
const sum = (a, f) => a.reduce((x, y) => x + Number(f(y)), 0);
console.log(
	`\n=== POST-CUTOFF worker usage: acting n=${act.length} cost=$${sum(act, (u) => u.total_cost_usd).toFixed(3)} prompt=${sum(act, (u) => u.prompt_tokens)} cached=${((sum(act, (u) => u.cached_prompt_tokens) / sum(act, (u) => u.prompt_tokens)) * 100).toFixed(0)}% ms_p50=${pct(
		act.map((u) => u.response_time_ms),
		0.5
	)} | reviewer n=${rev.length} cost=$${sum(rev, (u) => u.total_cost_usd).toFixed(3)} prompt=${sum(rev, (u) => u.prompt_tokens)} avg_prompt/call=${Math.round(sum(rev, (u) => u.prompt_tokens) / Math.max(1, rev.length))} cached=${(
		(sum(rev, (u) => u.cached_prompt_tokens) /
			Math.max(
				1,
				sum(rev, (u) => u.prompt_tokens)
			)) *
		100
	).toFixed(0)}% ms_p50=${pct(
		rev.map((u) => u.response_time_ms),
		0.5
	)} share=${((sum(rev, (u) => u.total_cost_usd) / (sum(rev, (u) => u.total_cost_usd) + sum(act, (u) => u.total_cost_usd))) * 100).toFixed(0)}%`
);
const pt = {};
for (const u of usage) {
	const p = (pt[u.turn_run_id] ||= { a: 0, r: 0 });
	if (u.metadata?.routeId === 'openrouter_semantic_reviewer') p.r++;
	else p.a++;
}
const vals = Object.values(pt);
console.log(
	'turns:',
	vals.length,
	'with reviewer:',
	vals.filter((p) => p.r > 0).length,
	'reviewer dist:',
	JSON.stringify(
		vals
			.filter((p) => p.r > 0)
			.reduce((m, p) => {
				m[p.r] = (m[p.r] || 0) + 1;
				return m;
			}, {})
	),
	'acting dist:',
	JSON.stringify(
		vals.reduce((m, p) => {
			m[p.a] = (m[p.a] || 0) + 1;
			return m;
		}, {})
	)
);
