// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-usage-pull.mjs
// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-usage-pull.mjs
// Read-only service-role pull of llm_usage_logs for the agentic chat worker.
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
const since = process.argv[2] ?? '2026-09-04T17:14:00Z';
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
const group = (arr, f) => {
	const m = {};
	for (const x of arr) {
		const k = f(x) ?? 'null';
		(m[k] ||= []).push(x);
	}
	return m;
};

const rows = [];
let from = 0;
while (true) {
	const { data, error } = await sb
		.from('llm_usage_logs')
		.select(
			'id,created_at,model_requested,model_used,provider,status,prompt_tokens,completion_tokens,total_tokens,reasoning_tokens,cached_prompt_tokens,cache_write_tokens,openrouter_cache_status,openrouter_usage_cost_usd,total_cost_usd,input_cost_usd,output_cost_usd,response_time_ms,error_message,metadata,turn_run_id,chat_session_id,user_id'
		)
		.eq('operation_type', 'agentic_chat_worker_stream')
		.gte('created_at', since)
		.order('created_at', { ascending: true })
		.range(from, from + 999);
	if (error) throw error;
	rows.push(...data);
	if (data.length < 1000) break;
	from += 1000;
}
console.log('rows', rows.length, 'since', since);
const byRole = group(rows, (r) => r.metadata?.passRole ?? 'acting');
const report = {
	since,
	rows: rows.length,
	turns: new Set(rows.map((r) => r.turn_run_id)).size,
	users: new Set(rows.map((r) => r.user_id)).size,
	byRole: {},
	byModelUsed: {},
	byProvider: {},
	failures: [],
	reasoning: {},
	perTurn: {}
};
for (const [role, list] of Object.entries(byRole)) {
	const ok = list.filter((r) => r.status === 'success');
	const prompt = sum(ok.map((r) => r.prompt_tokens));
	const cached = sum(ok.map((r) => r.cached_prompt_tokens));
	const hitRates = ok.map((r) =>
		r.prompt_tokens ? (r.cached_prompt_tokens || 0) / r.prompt_tokens : 0
	);
	report.byRole[role] = {
		calls: list.length,
		success: ok.length,
		failure: list.filter((r) => r.status !== 'success').length,
		prompt_tokens: prompt,
		cached_prompt_tokens: cached,
		cache_rate: prompt ? +(cached / prompt).toFixed(3) : null,
		calls_with_any_cache: ok.filter((r) => (r.cached_prompt_tokens || 0) > 0).length,
		completion_tokens: sum(ok.map((r) => r.completion_tokens)),
		reasoning_tokens: sum(ok.map((r) => r.reasoning_tokens)),
		cost_usd: +sum(ok.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)).toFixed(4),
		p50_prompt: pct(
			ok.map((r) => r.prompt_tokens),
			0.5
		),
		p90_prompt: pct(
			ok.map((r) => r.prompt_tokens),
			0.9
		),
		p50_completion: pct(
			ok.map((r) => r.completion_tokens),
			0.5
		),
		p90_completion: pct(
			ok.map((r) => r.completion_tokens),
			0.9
		),
		max_completion: Math.max(0, ...ok.map((r) => r.completion_tokens || 0)),
		p50_ms: pct(
			ok.map((r) => r.response_time_ms),
			0.5
		),
		p90_ms: pct(
			ok.map((r) => r.response_time_ms),
			0.9
		),
		p50_hit: pct(hitRates, 0.5),
		p90_hit: pct(hitRates, 0.9)
	};
}
for (const [m, list] of Object.entries(group(rows, (r) => r.model_used))) {
	const ok = list.filter((r) => r.status === 'success');
	const prompt = sum(ok.map((r) => r.prompt_tokens));
	const cached = sum(ok.map((r) => r.cached_prompt_tokens));
	report.byModelUsed[m] = {
		calls: list.length,
		failures: list.length - ok.length,
		prompt,
		cache_rate: prompt ? +(cached / prompt).toFixed(3) : null,
		cost: +sum(ok.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)).toFixed(4),
		providers: Object.fromEntries(
			Object.entries(group(list, (r) => r.provider)).map(([k, v]) => [k, v.length])
		)
	};
}
for (const [p, list] of Object.entries(
	group(rows, (r) => `${r.provider}|${r.metadata?.passRole ?? 'acting'}`)
)) {
	const ok = list.filter((r) => r.status === 'success');
	const prompt = sum(ok.map((r) => r.prompt_tokens));
	const cached = sum(ok.map((r) => r.cached_prompt_tokens));
	report.byProvider[p] = {
		calls: list.length,
		failures: list.length - ok.length,
		cache_rate: prompt ? +(cached / prompt).toFixed(3) : null,
		p50_ms: pct(
			ok.map((r) => r.response_time_ms),
			0.5
		),
		p90_ms: pct(
			ok.map((r) => r.response_time_ms),
			0.9
		),
		cost: +sum(ok.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)).toFixed(4)
	};
}
const fails = rows.filter((r) => r.status !== 'success');
const failGroups = group(fails, (r) =>
	(r.error_message || '')
		.replace(/\d+ms/g, 'Nms')
		.replace(/[0-9a-f-]{36}/g, 'UUID')
		.slice(0, 160)
);
report.failures = Object.entries(failGroups)
	.map(([msg, list]) => ({
		msg,
		n: list.length,
		roles: Object.fromEntries(
			Object.entries(group(list, (r) => r.metadata?.passRole ?? 'acting')).map(([k, v]) => [
				k,
				v.length
			])
		),
		providers: Object.fromEntries(
			Object.entries(group(list, (r) => r.provider)).map(([k, v]) => [k, v.length])
		),
		retryable: Object.fromEntries(
			Object.entries(group(list, (r) => String(r.metadata?.retryable))).map(([k, v]) => [
				k,
				v.length
			])
		)
	}))
	.sort((a, b) => b.n - a.n);
// reasoning share for acting successes
const actOk = (byRole.acting || []).filter((r) => r.status === 'success');
report.reasoning = {
	acting_calls: actOk.length,
	calls_with_reasoning: actOk.filter((r) => (r.reasoning_tokens || 0) > 0).length,
	reasoning_tokens: sum(actOk.map((r) => r.reasoning_tokens)),
	completion_tokens: sum(actOk.map((r) => r.completion_tokens)),
	calls_at_cap_4000: actOk.filter((r) => (r.completion_tokens || 0) >= 4000).length,
	completion_ge_2000: actOk.filter((r) => (r.completion_tokens || 0) >= 2000).length
};
// per turn
const turns = group(rows, (r) => r.turn_run_id);
const perTurn = Object.values(turns).map((list) => ({
	calls: list.length,
	acting: list.filter(
		(r) =>
			(r.metadata?.passRole ?? 'acting') === 'acting' ||
			r.metadata?.passRole === 'final_response' ||
			r.metadata?.passRole === 'repair'
	).length,
	reviewer: list.filter((r) => /review/.test(r.metadata?.passRole ?? '')).length,
	prompt: sum(list.map((r) => r.prompt_tokens)),
	cost: sum(list.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)),
	failures: list.filter((r) => r.status !== 'success').length,
	modelsUsed: [...new Set(list.map((r) => r.model_used))]
}));
report.perTurn = {
	turns: perTurn.length,
	p50_calls: pct(
		perTurn.map((t) => t.calls),
		0.5
	),
	p90_calls: pct(
		perTurn.map((t) => t.calls),
		0.9
	),
	max_calls: Math.max(...perTurn.map((t) => t.calls)),
	p50_prompt: pct(
		perTurn.map((t) => t.prompt),
		0.5
	),
	p90_prompt: pct(
		perTurn.map((t) => t.prompt),
		0.9
	),
	max_prompt: Math.max(...perTurn.map((t) => t.prompt)),
	p50_cost: pct(
		perTurn.map((t) => t.cost),
		0.5
	),
	p90_cost: pct(
		perTurn.map((t) => t.cost),
		0.9
	),
	max_cost: Math.max(...perTurn.map((t) => t.cost)),
	total_cost: +sum(perTurn.map((t) => t.cost)).toFixed(4),
	turns_with_reviewer: perTurn.filter((t) => t.reviewer > 0).length,
	turns_with_failure_row: perTurn.filter((t) => t.failures > 0).length,
	turns_with_snapshot_model_switch: perTurn.filter(
		(t) =>
			t.modelsUsed.length > 1 && t.modelsUsed.some((m) => /deepseek-v4-flash-\d{8}/.test(m))
	).length,
	reviewer_cost: +sum(
		rows
			.filter((r) => /review/.test(r.metadata?.passRole ?? ''))
			.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)
	).toFixed(4)
};
fs.writeFileSync(path.join(OUT, 'lane-K-usage-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
