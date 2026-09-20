// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull7.mjs
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
const ids = [
	'83a0a7fc-5c5f-4973-ae3b-5c519dbf10ae',
	'41271a44-0407-45cf-a638-48225a79b57c',
	'b1c37abe-8e32-4d41-aa65-a6689c981a15',
	turns.find((t) => t.id.startsWith('67015082'))?.id
].filter(Boolean);
const { data: obs, error } = await sb
	.from('agentic_chat_execution_observations')
	.select('*')
	.in('turn_run_id', ids)
	.order('observed_at');
if (error) {
	console.log('ERR', error.message);
} else {
	console.log('rows:', obs.length, 'keys:', obs[0] ? Object.keys(obs[0]).join(',') : '-');
	for (const o of obs) {
		const p = o.payload || o.observation || o.data || {};
		const s = { ...o };
		delete s.payload;
		delete s.observation;
		delete s.data;
		console.log(
			JSON.stringify({
				...s,
				...Object.fromEntries(
					Object.entries(p).filter(([k]) =>
						/finish|status|model|provider|round|attempt|duration|error|pass_role|route|kind|reason/.test(
							k
						)
					)
				)
			}).slice(0, 600)
		);
	}
}
// finish_reason distribution across all worker attempts since cutoff
const cutoff = '2026-08-28T12:00:00Z';
const { data: all } = await sb
	.from('agentic_chat_execution_observations')
	.select('turn_run_id,event_type,payload,observed_at')
	.gte('observed_at', cutoff)
	.limit(3000);
if (all) {
	const fr = {};
	const ek = {};
	for (const o of all) {
		const p = o.payload || {};
		if (o.event_type === 'provider_attempt_ended' || p.finish_reason !== undefined) {
			const k = `${p.provider || '?'}|${p.finish_reason}|${p.status}`;
			fr[k] = (fr[k] || 0) + 1;
		}
		ek[o.event_type] = (ek[o.event_type] || 0) + 1;
	}
	console.log('\nobservation kinds since cutoff:', JSON.stringify(ek));
	console.log('provider|finish_reason|status:', JSON.stringify(fr, null, 1));
}
