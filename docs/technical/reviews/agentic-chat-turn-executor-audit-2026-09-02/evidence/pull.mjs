// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull.mjs
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.dirname(new URL(import.meta.url).pathname);
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
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const count = (arr, f) =>
	arr.reduce((m, x) => {
		const k = f(x) ?? 'null';
		m[k] = (m[k] || 0) + 1;
		return m;
	}, {});

// 1. turns
const { data: turns, error: e1 } = await sb
	.from('chat_turn_runs')
	.select(
		'id,user_id,session_id,status,execution_mode,context_type,source,llm_pass_count,tool_call_count,tool_round_count,validation_failure_count,started_at,worker_started_at,execution_started_at,finished_at,failure_code,finished_reason,prepared_surface_profile,prepared_prompt_hit,prepared_prompt_miss_reason,request_prewarmed_context,history_for_model_count,raw_history_count,history_strategy,prompt_snapshot_id,first_lane,first_canonical_op,first_skill_path,mutation_reserved_at,request_message'
	)
	.gte('started_at', since)
	.order('started_at', { ascending: false })
	.limit(1000);
if (e1) throw e1;
const dur = (t) =>
	t.finished_at && t.started_at
		? (new Date(t.finished_at) - new Date(t.started_at)) / 1000
		: null;
const durs = turns.map(dur).filter((x) => x != null);
const summary = {
	window_since: since,
	turns: turns.length,
	distinct_users: new Set(turns.map((t) => t.user_id)).size,
	by_status: count(turns, (t) => t.status),
	by_execution_mode: count(turns, (t) => t.execution_mode),
	by_context: count(turns, (t) => t.context_type),
	by_source: count(turns, (t) => t.source),
	by_surface: count(turns, (t) => t.prepared_surface_profile),
	by_failure_code: count(
		turns.filter((t) => t.failure_code),
		(t) => t.failure_code
	),
	by_finished_reason: count(turns, (t) => t.finished_reason),
	prepared_prompt_hit: count(turns, (t) => String(t.prepared_prompt_hit)),
	miss_reason: count(
		turns.filter((t) => t.prepared_prompt_miss_reason),
		(t) => t.prepared_prompt_miss_reason
	),
	prewarmed: count(turns, (t) => String(t.request_prewarmed_context)),
	history_strategy: count(turns, (t) => t.history_strategy),
	duration_s: {
		p50: pct(durs, 0.5),
		p75: pct(durs, 0.75),
		p90: pct(durs, 0.9),
		p95: pct(durs, 0.95),
		max: pct(durs, 1)
	},
	llm_pass_count_dist: count(turns, (t) => t.llm_pass_count),
	tool_call_count_dist: count(turns, (t) => t.tool_call_count),
	tool_round_dist: count(turns, (t) => t.tool_round_count),
	validation_failures_gt0: turns.filter((t) => t.validation_failure_count > 0).length,
	mutation_reserved: turns.filter((t) => t.mutation_reserved_at).length,
	first_lane: count(turns, (t) => t.first_lane),
	first_skill_path: count(
		turns.filter((t) => t.first_skill_path),
		(t) => t.first_skill_path
	),
	history_for_model: {
		p50: pct(
			turns.map((t) => t.history_for_model_count).filter((x) => x != null),
			0.5
		),
		max: pct(
			turns.map((t) => t.history_for_model_count).filter((x) => x != null),
			1
		)
	}
};
// worker-only slice
const w = turns.filter((t) => (t.execution_mode || '').includes('worker'));
const wd = w.map(dur).filter((x) => x != null);
summary.worker_slice = {
	turns: w.length,
	by_status: count(w, (t) => t.status),
	duration_s: { p50: pct(wd, 0.5), p90: pct(wd, 0.9), max: pct(wd, 1) },
	llm_pass_count_dist: count(w, (t) => t.llm_pass_count),
	by_failure_code: count(
		w.filter((t) => t.failure_code),
		(t) => t.failure_code
	)
};

// 2. llm usage per turn
const ids = turns.map((t) => t.id);
let usage = [];
for (let i = 0; i < ids.length; i += 200) {
	const { data, error } = await sb
		.from('llm_usage_logs')
		.select(
			'turn_run_id,operation_type,model_requested,model_used,provider,prompt_tokens,completion_tokens,cached_prompt_tokens,reasoning_tokens,total_cost_usd,openrouter_cache_status,response_time_ms,status,profile,temperature'
		)
		.in('turn_run_id', ids.slice(i, i + 200));
	if (error) throw error;
	usage.push(...data);
}
const perTurn = {};
for (const u of usage) {
	const p = (perTurn[u.turn_run_id] ||= {
		calls: 0,
		prompt: 0,
		completion: 0,
		cached: 0,
		reasoning: 0,
		cost: 0,
		ops: {},
		models: {},
		providers: {},
		cache: {}
	});
	p.calls++;
	p.prompt += u.prompt_tokens;
	p.completion += u.completion_tokens;
	p.cached += u.cached_prompt_tokens;
	p.reasoning += u.reasoning_tokens;
	p.cost += Number(u.total_cost_usd);
	p.ops[u.operation_type] = (p.ops[u.operation_type] || 0) + 1;
	p.models[u.model_used] = (p.models[u.model_used] || 0) + 1;
	p.providers[u.provider] = (p.providers[u.provider] || 0) + 1;
	p.cache[u.openrouter_cache_status] = (p.cache[u.openrouter_cache_status] || 0) + 1;
}
const pts = Object.values(perTurn);
summary.usage = {
	turns_with_usage: pts.length,
	calls_total: usage.length,
	calls_per_turn: {
		p50: pct(
			pts.map((p) => p.calls),
			0.5
		),
		p90: pct(
			pts.map((p) => p.calls),
			0.9
		),
		max: pct(
			pts.map((p) => p.calls),
			1
		)
	},
	prompt_tokens_per_turn: {
		p50: pct(
			pts.map((p) => p.prompt),
			0.5
		),
		p90: pct(
			pts.map((p) => p.prompt),
			0.9
		),
		max: pct(
			pts.map((p) => p.prompt),
			1
		)
	},
	cost_per_turn_usd: {
		p50: pct(
			pts.map((p) => p.cost),
			0.5
		),
		p90: pct(
			pts.map((p) => p.cost),
			0.9
		),
		max: pct(
			pts.map((p) => p.cost),
			1
		),
		total: pts.reduce((a, p) => a + p.cost, 0)
	},
	cached_ratio_overall:
		usage.reduce((a, u) => a + u.cached_prompt_tokens, 0) /
		Math.max(
			1,
			usage.reduce((a, u) => a + u.prompt_tokens, 0)
		),
	by_operation_type: count(usage, (u) => u.operation_type),
	by_model: count(usage, (u) => u.model_used),
	by_provider: count(usage, (u) => u.provider),
	by_cache_status: count(usage, (u) => u.openrouter_cache_status),
	provider_cache_ratio: Object.fromEntries(
		Object.entries(
			usage.reduce((m, u) => {
				const k = u.provider || 'null';
				const r = (m[k] ||= { p: 0, c: 0, n: 0 });
				r.p += u.prompt_tokens;
				r.c += u.cached_prompt_tokens;
				r.n++;
				return m;
			}, {})
		).map(([k, r]) => [k, { calls: r.n, cached_ratio: +(r.c / Math.max(1, r.p)).toFixed(3) }])
	),
	response_ms_by_op: Object.fromEntries(
		Object.entries(
			usage.reduce((m, u) => {
				(m[u.operation_type] ||= []).push(u.response_time_ms);
				return m;
			}, {})
		).map(([k, a]) => [k, { n: a.length, p50: pct(a, 0.5), p90: pct(a, 0.9) }])
	)
};
// per-pass-count first-pass prompt token size by surface
summary.first_pass_prompt_tokens_by_surface = {};
for (const t of turns) {
	const p = perTurn[t.id];
	if (!p) continue;
	const k = t.prepared_surface_profile || 'null';
	(summary.first_pass_prompt_tokens_by_surface[k] ||= []).push(Math.round(p.prompt / p.calls));
}
for (const k of Object.keys(summary.first_pass_prompt_tokens_by_surface)) {
	const a = summary.first_pass_prompt_tokens_by_surface[k];
	summary.first_pass_prompt_tokens_by_surface[k] = {
		n: a.length,
		avg_prompt_tokens_per_call_p50: pct(a, 0.5),
		p90: pct(a, 0.9)
	};
}

// 3. tool executions
const { data: tools, error: e3 } = await sb
	.from('chat_tool_executions')
	.select(
		'tool_name,tool_category,success,execution_time_ms,zero_result,requires_user_action,result_count,created_at'
	)
	.gte('created_at', since)
	.limit(5000);
if (e3) throw e3;
const tstats = {};
for (const x of tools) {
	const r = (tstats[x.tool_name] ||= { n: 0, fail: 0, zero: 0, ms: [], cat: x.tool_category });
	r.n++;
	if (!x.success) r.fail++;
	if (x.zero_result) r.zero++;
	if (x.execution_time_ms != null) r.ms.push(x.execution_time_ms);
}
summary.tools = Object.entries(tstats)
	.sort((a, b) => b[1].n - a[1].n)
	.map(([k, r]) => ({
		tool: k,
		cat: r.cat,
		n: r.n,
		fail: r.fail,
		zero: r.zero,
		ms_p50: pct(r.ms, 0.5),
		ms_p90: pct(r.ms, 0.9)
	}));

// 4. slowest / most expensive worker turns (no message content beyond 60 chars)
summary.worst_turns = w
	.map((t) => ({
		id: t.id,
		ctx: t.context_type,
		status: t.status,
		dur_s: dur(t),
		passes: t.llm_pass_count,
		calls: perTurn[t.id]?.calls,
		tools: t.tool_call_count,
		rounds: t.tool_round_count,
		vfail: t.validation_failure_count,
		cost: perTurn[t.id]?.cost?.toFixed(4),
		prompt_tok: perTurn[t.id]?.prompt,
		ops: perTurn[t.id]?.ops,
		failure: t.failure_code,
		msg: (t.request_message || '').slice(0, 60)
	}))
	.sort((a, b) => (b.cost || 0) - (a.cost || 0))
	.slice(0, 25);

fs.writeFileSync(path.join(OUT, 'telemetry-summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
	path.join(OUT, 'turns.json'),
	JSON.stringify(
		turns.map((t) => ({
			...t,
			request_message: (t.request_message || '').slice(0, 120),
			usage: perTurn[t.id]
		})),
		null,
		1
	)
);
console.log(
	JSON.stringify({
		turns: turns.length,
		worker: w.length,
		usage: usage.length,
		tools: tools.length
	})
);

// 5. prompt snapshots for DJ's own recent worker turns
const { data: me } = await sb
	.from('users')
	.select('id')
	.eq('email', 'djwayne35@gmail.com')
	.single();
const mine = w.filter((t) => t.user_id === me.id && t.prompt_snapshot_id).slice(0, 12);
const { data: snaps, error: e5 } = await sb
	.from('chat_prompt_snapshots')
	.select('*')
	.in(
		'turn_run_id',
		mine.map((t) => t.id)
	);
if (e5) throw e5;
fs.mkdirSync(path.join(OUT, 'snapshots'), { recursive: true });
const snapIndex = [];
for (const s of snaps) {
	const t = mine.find((t) => t.id === s.turn_run_id);
	fs.writeFileSync(
		path.join(OUT, 'snapshots', `${s.turn_run_id}.json`),
		JSON.stringify(s, null, 1)
	);
	const tools = Array.isArray(s.tool_definitions) ? s.tool_definitions : [];
	const toolSizes = tools
		.map((td) => {
			const f = td.function || td;
			return { name: f.name, chars: JSON.stringify(td).length };
		})
		.sort((a, b) => b.chars - a.chars);
	const msgs = Array.isArray(s.model_messages) ? s.model_messages : [];
	snapIndex.push({
		turn: s.turn_run_id,
		ctx: t?.context_type,
		surface: t?.prepared_surface_profile,
		variant: s.prompt_variant,
		version: s.snapshot_version,
		system_chars: s.system_prompt_chars,
		message_chars: s.message_chars,
		approx_tokens: s.approx_prompt_tokens,
		tools_total_chars: toolSizes.reduce((a, x) => a + x.chars, 0),
		tool_count: tools.length,
		tools: toolSizes,
		message_roles: msgs.map(
			(m) =>
				`${m.role}${m.tool_calls ? '+tc' : ''}:${typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length}`
		),
		sections: s.prompt_sections ? Object.keys(s.prompt_sections) : null,
		msg: (t?.request_message || '').slice(0, 80)
	});
}
fs.writeFileSync(path.join(OUT, 'snapshots-index.json'), JSON.stringify(snapIndex, null, 2));
console.log(
	JSON.stringify({ my_worker_turns_with_snapshot: mine.length, snapshots: snaps.length })
);
