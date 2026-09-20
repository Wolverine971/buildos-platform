// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-pin-trace.mjs
// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-pin-trace.mjs
// Read-only: per-turn provider sequences around pre-stream failures.
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
const since = '2026-09-04T17:14:00Z';
const { data, error } = await sb
	.from('llm_usage_logs')
	.select(
		'created_at,model_used,provider,status,prompt_tokens,cached_prompt_tokens,completion_tokens,response_time_ms,error_message,metadata,turn_run_id'
	)
	.eq('operation_type', 'agentic_chat_worker_stream')
	.gte('created_at', since)
	.order('created_at', { ascending: true })
	.limit(2000);
if (error) throw error;
const turns = {};
for (const r of data) (turns[r.turn_run_id] ||= []).push(r);
let shown = 0;
const before404 = {};
const beforeAll = {};
let retryCold = 0,
	retryTotal = 0,
	retryGapMs = [];
for (const [id, rows] of Object.entries(turns)) {
	const failing = rows.some((r) => r.status !== 'success');
	if (!failing) continue;
	rows.forEach((r, i) => {
		if (r.status === 'success') return;
		const prev = [...rows.slice(0, i)]
			.reverse()
			.find((p) => p.status === 'success' && !/review/.test(p.metadata?.passRole ?? ''));
		const next = rows
			.slice(i + 1)
			.find(
				(n) =>
					n.status === 'success' &&
					n.metadata?.logicalProviderRound === r.metadata?.logicalProviderRound &&
					n.metadata?.passRole === r.metadata?.passRole
			);
		const key = prev ? `${prev.provider}` : 'none';
		beforeAll[key] ||= 0;
		beforeAll[key] += 1;
		if (/404/.test(r.error_message || '')) {
			before404[key] ||= 0;
			before404[key] += 1;
		}
		if (next) {
			retryTotal += 1;
			if ((next.cached_prompt_tokens || 0) === 0) retryCold += 1;
			retryGapMs.push(new Date(next.created_at) - new Date(r.created_at));
		}
	});
	if (shown < 6) {
		shown += 1;
		console.log(`\nturn ${id.slice(0, 8)}`);
		for (const r of rows)
			console.log(
				`  r${r.metadata?.logicalProviderRound} a${r.metadata?.providerAttempt} ${(r.metadata?.passRole || 'acting').padEnd(16)} ${String(r.provider).padEnd(10)} ${r.status.padEnd(8)} ${String(r.model_used).padEnd(40)} p=${r.prompt_tokens} c=${r.cached_prompt_tokens} ${r.response_time_ms}ms ${r.error_message ? '| ' + r.error_message.slice(0, 70) : ''}`
			);
	}
}
console.log('\nprovider that served the pass before a failure (any):', beforeAll);
console.log('provider that served the pass before a 404:', before404);
console.log(
	'retries observed:',
	retryTotal,
	'retries that landed cold (0 cached tokens):',
	retryCold,
	'p50 gap ms:',
	retryGapMs.sort((a, b) => a - b)[Math.floor(retryGapMs.length / 2)]
);
// tool_choice=none violations
console.log(
	'\nfinal_response passes by provider:',
	Object.entries(
		data
			.filter((r) => r.metadata?.passRole === 'final_response')
			.reduce((m, r) => {
				m[r.provider] = (m[r.provider] || 0) + 1;
				return m;
			}, {})
	)
);
