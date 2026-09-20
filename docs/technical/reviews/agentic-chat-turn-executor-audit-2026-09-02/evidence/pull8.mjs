// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/pull8.mjs
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
const pct = (a, p) => {
	if (!a.length) return null;
	const s = [...a].sort((x, y) => x - y);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const since = new Date(Date.now() - 14 * 864e5).toISOString();
let rows = [];
let from = 0;
while (true) {
	const { data, error } = await sb
		.from('agentic_chat_execution_observations')
		.select('turn_run_id,payload,observed_at')
		.eq('event_type', 'provider_attempt_ended')
		.gte('observed_at', since)
		.order('observed_at')
		.range(from, from + 999);
	if (error) {
		console.log(error.message);
		break;
	}
	rows.push(...data);
	if (data.length < 1000) break;
	from += 1000;
}
console.log('provider_attempt_ended rows:', rows.length);
const g = {};
for (const r of rows) {
	const p = r.payload;
	const k = `${p.pass_role}|${p.provider}|${p.status}`;
	(g[k] ||= []).push(p.duration_ms);
}
console.log('\n=== duration_ms by pass_role|provider|status');
for (const [k, a] of Object.entries(g).sort((x, y) => y[1].length - x[1].length))
	console.log(
		k.padEnd(45),
		`n=${a.length} p50=${pct(a, 0.5)} p90=${pct(a, 0.9)} max=${pct(a, 1)}`
	);
const fr = {};
for (const r of rows) {
	const p = r.payload;
	const k = `${p.pass_role}|${p.finish_reason}|${p.status}|${p.error_class}`;
	fr[k] = (fr[k] || 0) + 1;
}
console.log('\n=== finish_reason by pass_role');
for (const [k, n] of Object.entries(fr).sort((x, y) => y[1] - x[1])) console.log(k.padEnd(60), n);
// reviewer time per turn: share of provider time
const perTurn = {};
for (const r of rows) {
	const p = r.payload;
	const t = (perTurn[r.turn_run_id] ||= { rev: 0, act: 0, revN: 0, actN: 0 });
	if (/review/.test(p.pass_role || '')) {
		t.rev += p.duration_ms;
		t.revN++;
	} else {
		t.act += p.duration_ms;
		t.actN++;
	}
}
const wr = Object.values(perTurn).filter((t) => t.revN > 0);
console.log(
	'\nturns with reviewer:',
	wr.length,
	'reviewer ms per turn p50=',
	pct(
		wr.map((t) => t.rev),
		0.5
	),
	'p90=',
	pct(
		wr.map((t) => t.rev),
		0.9
	),
	'max=',
	pct(
		wr.map((t) => t.rev),
		1
	),
	'| reviewer share of model time p50=',
	(
		pct(
			wr.map((t) => t.rev / (t.rev + t.act)),
			0.5
		) * 100
	).toFixed(0) + '%'
);
const roles = {};
for (const r of rows) {
	roles[r.payload.pass_role] = (roles[r.payload.pass_role] || 0) + 1;
}
console.log('pass roles:', JSON.stringify(roles));
