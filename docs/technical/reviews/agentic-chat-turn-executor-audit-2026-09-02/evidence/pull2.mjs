// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull2.mjs
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
const since = new Date(Date.now() - 14 * 864e5).toISOString();
const pct = (a, p) => {
	if (!a.length) return null;
	const s = [...a].sort((x, y) => x - y);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const turns = JSON.parse(fs.readFileSync('turns.json', 'utf8'));
const { data: users } = await sb
	.from('users')
	.select('id,email')
	.in('id', [...new Set(turns.map((t) => t.user_id))]);
const label = Object.fromEntries(
	users.map((u) => [
		u.id,
		u.email.includes('djwayne')
			? 'DJ'
			: u.email.includes('e2e') || u.email.includes('harness') || u.email.includes('test')
				? 'HARNESS:' + u.email.split('@')[0]
				: 'OTHER:' + u.email.split('@')[0]
	])
);
const dur = (t) =>
	t.finished_at && t.started_at
		? (new Date(t.finished_at) - new Date(t.started_at)) / 1000
		: null;
console.log('=== PER USER');
for (const [uid, name] of Object.entries(label)) {
	const ts = turns.filter((t) => t.user_id === uid);
	const w = ts.filter((t) => t.execution_mode === 'worker_realtime');
	const d = w.map(dur).filter((x) => x != null);
	const calls = w.map((t) => t.usage?.calls).filter((x) => x);
	const cost = w.map((t) => t.usage?.cost).filter((x) => x != null);
	const ptok = w.map((t) => t.usage?.prompt).filter((x) => x);
	console.log(
		name,
		JSON.stringify({
			turns: ts.length,
			worker: w.length,
			failed: w.filter((t) => t.status === 'failed').length,
			dur_p50: pct(d, 0.5),
			dur_p90: pct(d, 0.9),
			calls_p50: pct(calls, 0.5),
			calls_p90: pct(calls, 0.9),
			cost_p50: pct(cost, 0.5)?.toFixed(4),
			cost_total: cost.reduce((a, b) => a + b, 0).toFixed(3),
			prompt_tok_p50: pct(ptok, 0.5),
			by_ctx: w.reduce((m, t) => {
				m[t.context_type] = (m[t.context_type] || 0) + 1;
				return m;
			}, {}),
			distinct_msgs: new Set(ts.map((t) => t.request_message)).size
		})
	);
}
// usage by model x op x provider x profile x temperature
let usage = [];
const ids = turns.map((t) => t.id);
for (let i = 0; i < ids.length; i += 200) {
	const { data } = await sb
		.from('llm_usage_logs')
		.select(
			'turn_run_id,operation_type,model_used,provider,profile,temperature,prompt_tokens,cached_prompt_tokens,completion_tokens,reasoning_tokens,total_cost_usd,response_time_ms,metadata,status'
		)
		.in('turn_run_id', ids.slice(i, i + 200));
	usage.push(...data);
}
const g = {};
for (const u of usage) {
	const k = `${u.operation_type}|${u.model_used}|${u.provider}|profile=${u.profile}|T=${u.temperature}`;
	const r = (g[k] ||= { n: 0, p: 0, c: 0, comp: 0, reason: 0, cost: 0, ms: [] });
	r.n++;
	r.p += u.prompt_tokens;
	r.c += u.cached_prompt_tokens;
	r.comp += u.completion_tokens;
	r.reason += u.reasoning_tokens;
	r.cost += Number(u.total_cost_usd);
	r.ms.push(u.response_time_ms);
}
console.log('\n=== USAGE by op|model|provider|profile|temp');
for (const [k, r] of Object.entries(g).sort((a, b) => b[1].n - a[1].n))
	console.log(
		k.padEnd(95),
		`n=${r.n} prompt=${r.p} cached=${((r.c / Math.max(1, r.p)) * 100).toFixed(0)}% comp=${r.comp} reasoning=${r.reason} cost=$${r.cost.toFixed(3)} ms_p50=${pct(r.ms, 0.5)} p90=${pct(r.ms, 0.9)}`
	);
console.log('\n=== sample metadata keys from worker usage rows');
const metas = usage
	.filter((u) => u.operation_type === 'agentic_chat_worker_stream' && u.metadata)
	.slice(0, 400);
const keys = {};
for (const u of metas) for (const k of Object.keys(u.metadata)) keys[k] = (keys[k] || 0) + 1;
console.log(JSON.stringify(keys));
const lanes = {};
for (const u of metas) {
	const m = u.metadata;
	const lane = m.lane ?? m.pass_kind ?? m.passKind ?? m.role ?? m.stage ?? m.request_kind ?? '?';
	const k = `${lane}|${u.model_used}`;
	lanes[k] = (lanes[k] || 0) + 1;
}
console.log('lane|model:', JSON.stringify(lanes));
console.log('\nexample metadata:', JSON.stringify(metas[0]?.metadata).slice(0, 1500));
console.log(
	'example metadata (gpt):',
	JSON.stringify(
		usage.find(
			(u) =>
				u.model_used.startsWith('openai/gpt') &&
				u.operation_type === 'agentic_chat_worker_stream'
		)?.metadata
	).slice(0, 1500)
);
// failure detail for not_allowlisted
const bad = turns.filter((t) =>
	[
		'provider_tool_not_allowlisted',
		'internal_cohort_rejected',
		'provider_tool_finish_reason_invalid',
		'provider_forced_synthesis_failed',
		'provider_tool_arguments_invalid',
		'provider_round_budget_exceeded',
		'provider_tool_validation_repair_exhausted'
	].includes(t.failure_code)
);
console.log('\n=== FAILED TURNS');
for (const t of bad) {
	const { data: ev } = await sb
		.from('chat_turn_events')
		.select('event_type,payload,phase,sequence_index')
		.eq('turn_run_id', t.id)
		.order('sequence_index', { ascending: false })
		.limit(3);
	const term = ev?.find((e) => /terminal|fail|error/i.test(e.event_type)) || ev?.[0];
	const p = JSON.stringify(term?.payload || {});
	const m = p.match(/"(message|error|errorMessage|failure_message|detail)":"([^"]{0,220})/);
	console.log(
		label[t.user_id],
		t.failure_code,
		t.context_type,
		`calls=${t.usage?.calls}`,
		JSON.stringify(t.request_message.slice(0, 70)),
		'::',
		m ? m[2] : p.slice(0, 220)
	);
}
// exact tool execution counts (paginated) split at 2026-08-28T00:00Z
const cutoff = '2026-08-28T00:00:00Z';
let all = [];
let from = 0;
while (true) {
	const { data } = await sb
		.from('chat_tool_executions')
		.select('tool_name,tool_category,success,created_at,turn_run_id')
		.gte('created_at', since)
		.order('created_at', { ascending: true })
		.range(from, from + 999);
	all.push(...data);
	if (data.length < 1000) break;
	from += 1000;
}
const split = (arr) => {
	const m = {};
	for (const x of arr) {
		const r = (m[x.tool_name] ||= { n: 0, fail: 0 });
		r.n++;
		if (!x.success) r.fail++;
	}
	return m;
};
const before = split(all.filter((x) => x.created_at < cutoff)),
	after = split(all.filter((x) => x.created_at >= cutoff));
console.log(
	`\n=== TOOL EXECUTIONS total=${all.length} before-08-28=${all.filter((x) => x.created_at < cutoff).length} after=${all.filter((x) => x.created_at >= cutoff).length}`
);
const names = [...new Set(all.map((x) => x.tool_name))].sort(
	(a, b) => (after[b]?.n || 0) + (before[b]?.n || 0) - ((after[a]?.n || 0) + (before[a]?.n || 0))
);
for (const n of names)
	console.log(
		n.padEnd(36),
		`before n=${before[n]?.n || 0} fail=${before[n]?.fail || 0}`.padEnd(28),
		`after n=${after[n]?.n || 0} fail=${after[n]?.fail || 0}`
	);
const ctl = new Set([
	'declare_turn_contract',
	'approve_mutation_batch_review',
	'approve_turn_contract_review',
	'request_proposal_revision',
	'declare_read_only_turn',
	'approve_read_only_turn_review',
	'request_turn_clarification',
	'cancel_turn_contract'
]);
const aft = all.filter((x) => x.created_at >= cutoff);
console.log(
	'control share after 08-28:',
	((aft.filter((x) => ctl.has(x.tool_name)).length / aft.length) * 100).toFixed(1) + '%',
	'before:',
	(
		(all.filter((x) => x.created_at < cutoff && ctl.has(x.tool_name)).length /
			all.filter((x) => x.created_at < cutoff).length) *
		100
	).toFixed(1) + '%'
);
// per-turn after cutoff by user: calls, cost, dur for organic DJ turns
const aftTurns = turns.filter(
	(t) => t.started_at >= cutoff && t.execution_mode === 'worker_realtime'
);
console.log('\n=== worker turns since 08-28 by user');
for (const [uid, name] of Object.entries(label)) {
	const w = aftTurns.filter((t) => t.user_id === uid);
	if (!w.length) continue;
	const d = w.map(dur).filter((x) => x != null);
	console.log(
		name,
		JSON.stringify({
			n: w.length,
			failed: w.filter((t) => t.status === 'failed').length,
			dur_p50: pct(d, 0.5),
			dur_p90: pct(d, 0.9),
			calls_p50: pct(
				w.map((t) => t.usage?.calls || 0),
				0.5
			),
			calls_p90: pct(
				w.map((t) => t.usage?.calls || 0),
				0.9
			),
			cost_p50: pct(
				w.map((t) => t.usage?.cost || 0),
				0.5
			)?.toFixed(4),
			ptok_p50: pct(
				w.map((t) => t.usage?.prompt || 0),
				0.5
			)
		})
	);
}
console.log('\n=== DJ worker turns since 08-28 (each)');
for (const t of aftTurns.filter((t) => label[t.user_id] === 'DJ'))
	console.log(
		JSON.stringify({
			ctx: t.context_type,
			status: t.status,
			dur: dur(t),
			calls: t.usage?.calls,
			tools: t.tool_call_count,
			rounds: t.tool_round_count,
			cost: t.usage?.cost?.toFixed(4),
			ptok: t.usage?.prompt,
			cached: t.usage?.cached,
			fail: t.failure_code,
			hist: t.history_for_model_count,
			msg: t.request_message.slice(0, 70)
		})
	);
