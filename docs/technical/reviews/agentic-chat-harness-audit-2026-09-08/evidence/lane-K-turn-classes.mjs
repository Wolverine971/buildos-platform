// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-turn-classes.mjs
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
const { data, error } = await sb
	.from('llm_usage_logs')
	.select(
		'model_used,provider,status,prompt_tokens,cached_prompt_tokens,completion_tokens,reasoning_tokens,openrouter_usage_cost_usd,total_cost_usd,metadata,turn_run_id,response_time_ms'
	)
	.eq('operation_type', 'agentic_chat_worker_stream')
	.gte('created_at', '2026-09-04T17:14:00Z')
	.limit(2000);
if (error) throw error;
const ok = data.filter((r) => r.status === 'success');
const isRev = (r) => /review/.test(r.metadata?.passRole ?? '');
const turns = {};
for (const r of ok) (turns[r.turn_run_id] ||= []).push(r);
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
const cls = { read_only: [], reviewed_write: [] };
for (const [id, rows] of Object.entries(turns)) {
	const t = {
		calls: rows.length,
		actCalls: rows.filter((r) => !isRev(r)).length,
		revCalls: rows.filter(isRev).length,
		actPrompt: sum(rows.filter((r) => !isRev(r)).map((r) => r.prompt_tokens)),
		actCached: sum(rows.filter((r) => !isRev(r)).map((r) => r.cached_prompt_tokens)),
		actCompletion: sum(rows.filter((r) => !isRev(r)).map((r) => r.completion_tokens)),
		revPrompt: sum(rows.filter(isRev).map((r) => r.prompt_tokens)),
		revCached: sum(rows.filter(isRev).map((r) => r.cached_prompt_tokens)),
		revCompletion: sum(rows.filter(isRev).map((r) => r.completion_tokens)),
		cost: sum(rows.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)),
		actCost: sum(
			rows
				.filter((r) => !isRev(r))
				.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)
		),
		revCost: sum(
			rows.filter(isRev).map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd)
		),
		wallMs: sum(rows.map((r) => r.response_time_ms))
	};
	(t.revCalls > 0 ? cls.reviewed_write : cls.read_only).push(t);
}
const mean = (a, k) => (a.length ? sum(a.map((t) => t[k])) / a.length : 0);
const out = {};
for (const [k, a] of Object.entries(cls)) {
	out[k] = { turns: a.length };
	for (const f of [
		'calls',
		'actCalls',
		'revCalls',
		'actPrompt',
		'actCached',
		'actCompletion',
		'revPrompt',
		'revCached',
		'revCompletion',
		'cost',
		'actCost',
		'revCost',
		'wallMs'
	])
		out[k]['mean_' + f] = +mean(a, f).toFixed(f === 'cost' || f.endsWith('Cost') ? 5 : 0);
}
console.log(JSON.stringify(out, null, 2));
// effective price actually paid for acting
const act = ok.filter((r) => !isRev(r));
const actCost = sum(act.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd));
console.log(
	'acting effective $/M prompt-equivalent:',
	(actCost / (sum(act.map((r) => r.prompt_tokens)) / 1e6)).toFixed(4),
	'prompt tokens',
	sum(act.map((r) => r.prompt_tokens)),
	'cached',
	sum(act.map((r) => r.cached_prompt_tokens)),
	'completion',
	sum(act.map((r) => r.completion_tokens)),
	'cost',
	actCost.toFixed(4)
);
const rev = ok.filter(isRev);
const revCost = sum(rev.map((r) => r.openrouter_usage_cost_usd ?? r.total_cost_usd));
console.log(
	'reviewer: prompt',
	sum(rev.map((r) => r.prompt_tokens)),
	'cached',
	sum(rev.map((r) => r.cached_prompt_tokens)),
	'completion',
	sum(rev.map((r) => r.completion_tokens)),
	'reasoning',
	sum(rev.map((r) => r.reasoning_tokens)),
	'cost',
	revCost.toFixed(4),
	'calls',
	rev.length,
	'mean $/call',
	(revCost / rev.length).toFixed(5)
);
fs.writeFileSync(
	'/Users/djwayne/buildos-platform/docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-turn-classes.json',
	JSON.stringify(out, null, 2)
);
