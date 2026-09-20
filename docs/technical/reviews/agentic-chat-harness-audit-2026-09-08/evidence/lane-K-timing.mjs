// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-timing.mjs
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
	.from('chat_turn_events')
	.select('turn_run_id,event_type,payload,created_at')
	.eq('event_type', 'timing')
	.gte('created_at', '2026-09-04T17:14:00Z')
	.limit(200);
if (error) throw error;
console.log('timing events', data.length);
if (data[0]) console.log('keys', Object.keys(data[0].payload || {}));
const pct = (arr, p) => {
	const s = [...arr].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
};
const g = (k) => data.map((d) => d.payload?.[k] ?? d.payload?.phases?.[k]);
const keys = Object.keys(data[0]?.payload || {});
for (const k of keys) {
	const vals = g(k);
	if (vals.every((v) => typeof v === 'number'))
		console.log(k.padEnd(40), 'p50', pct(vals, 0.5), 'p90', pct(vals, 0.9));
	else if (typeof vals[0] === 'object' && vals[0]) {
		for (const kk of Object.keys(vals[0])) {
			const vv = vals.map((v) => v?.[kk]);
			if (vv.every((x) => typeof x === 'number'))
				console.log((k + '.' + kk).padEnd(40), 'p50', pct(vv, 0.5), 'p90', pct(vv, 0.9));
		}
	}
}
console.log(JSON.stringify(data[0].payload.timing, null, 1).slice(0, 1500));
const t = data.map((d) => d.payload.timing);
const num = (k) => t.map((x) => x?.[k]).filter((v) => typeof v === 'number');
for (const k of Object.keys(t[0] || {})) {
	const v = num(k);
	if (v.length) console.log(k.padEnd(44), 'p50', pct(v, 0.5), 'p90', pct(v, 0.9));
}
console.log('--- phases ---');
const ph = t.map((x) => x?.phases || {});
for (const k of Object.keys(ph[0])) {
	const v = ph.map((p) => p[k]).filter((x) => typeof x === 'number');
	console.log(k.padEnd(52), 'p50', Math.round(pct(v, 0.5)), 'p90', Math.round(pct(v, 0.9)));
}
// join with llm_usage_logs response_time sum per turn to get non-model time in the loop
const ids = data.map((d) => d.turn_run_id);
const { data: usage } = await sb
	.from('llm_usage_logs')
	.select('turn_run_id,response_time_ms,status')
	.eq('operation_type', 'agentic_chat_worker_stream')
	.in('turn_run_id', ids)
	.limit(2000);
const modelMs = {};
for (const u of usage)
	modelMs[u.turn_run_id] = (modelMs[u.turn_run_id] || 0) + (u.response_time_ms || 0);
const nonModel = data
	.map(
		(d) =>
			(d.payload.timing.phases.provider_authority_to_finish_ms || 0) -
			(modelMs[d.turn_run_id] || 0)
	)
	.filter((x) => Number.isFinite(x));
const share = data.map(
	(d) =>
		(modelMs[d.turn_run_id] || 0) /
		(d.payload.timing.phases.provider_authority_to_finish_ms || 1)
);
console.log(
	'non-model ms inside provider loop (authority→finish − Σ provider response_time): p50',
	Math.round(pct(nonModel, 0.5)),
	'p90',
	Math.round(pct(nonModel, 0.9)),
	'| model share p50',
	pct(share, 0.5).toFixed(2)
);
