// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull4.mjs
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
console.log('=== failure dates');
for (const t of turns.filter((t) =>
	[
		'provider_tool_not_allowlisted',
		'internal_cohort_rejected',
		'provider_tool_finish_reason_invalid',
		'provider_forced_synthesis_failed'
	].includes(t.failure_code)
))
	console.log(t.failure_code.padEnd(38), t.started_at, t.request_message.slice(0, 40));
// timing metrics: find rows for recent worker turns
const { data: cols } = await sb
	.from('timing_metrics')
	.select('*')
	.order('created_at', { ascending: false })
	.limit(3);
console.log(
	'\n=== timing_metrics sample keys:',
	cols?.[0] ? Object.keys(cols[0]).join(',') : 'none'
);
console.log(JSON.stringify(cols?.[0]).slice(0, 1500));
const dj = turns
	.filter((t) => t.execution_mode === 'worker_realtime' && t.status === 'completed')
	.slice(0, 60);
const ids = dj.map((t) => t.id);
const sids = dj.map((t) => t.stream_run_id);
let tm = [];
for (const col of ['turn_run_id', 'stream_run_id', 'entity_id', 'metric_key', 'correlation_id']) {
	try {
		const { data, error } = await sb
			.from('timing_metrics')
			.select('*')
			.in(col, col === 'stream_run_id' ? sids : ids)
			.limit(200);
		if (!error && data?.length) {
			console.log(`matched via ${col}: ${data.length}`);
			tm = data;
			break;
		}
	} catch (e) {}
}
if (!tm.length) {
	const { data } = await sb
		.from('timing_metrics')
		.select('*')
		.gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString())
		.limit(300);
	console.log('recent timing rows:', data?.length);
	tm = data || [];
	const kinds = {};
	for (const r of tm)
		kinds[r.metric_type || r.kind || r.name || r.source || '?'] =
			(kinds[r.metric_type || r.kind || r.name || r.source || '?'] || 0) + 1;
	console.log(JSON.stringify(kinds));
	console.log(JSON.stringify(tm.slice(0, 2)).slice(0, 3000));
} else {
	console.log(JSON.stringify(tm.slice(0, 3)).slice(0, 4000));
}
