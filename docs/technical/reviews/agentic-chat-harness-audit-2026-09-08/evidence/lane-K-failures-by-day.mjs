// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-failures-by-day.mjs
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
const { data } = await sb
	.from('llm_usage_logs')
	.select('created_at,status,error_message,turn_run_id,provider,metadata')
	.eq('operation_type', 'agentic_chat_worker_stream')
	.gte('created_at', '2026-09-04T17:14:00Z')
	.limit(2000);
const days = {};
for (const r of data) {
	const d = r.created_at.slice(0, 10);
	const x = (days[d] ||= { calls: 0, turns: new Set(), f404: 0, f429: 0, other: 0 });
	x.calls++;
	x.turns.add(r.turn_run_id);
	if (r.status !== 'success') {
		if (/404/.test(r.error_message)) x.f404++;
		else if (/429/.test(r.error_message)) x.f429++;
		else x.other++;
	}
}
for (const [d, x] of Object.entries(days).sort())
	console.log(
		d,
		'calls',
		x.calls,
		'turns',
		x.turns.size,
		'404s',
		x.f404,
		'429s',
		x.f429,
		'other',
		x.other
	);
