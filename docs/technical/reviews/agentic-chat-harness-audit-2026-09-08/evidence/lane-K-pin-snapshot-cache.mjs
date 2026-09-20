// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-K-pin-snapshot-cache.mjs
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
		'created_at,model_requested,model_used,provider,status,cached_prompt_tokens,prompt_tokens,metadata,turn_run_id,error_message'
	)
	.eq('operation_type', 'agentic_chat_worker_stream')
	.gte('created_at', '2026-09-04T17:14:00Z')
	.order('created_at', { ascending: true })
	.limit(2000);
if (error) throw error;
const snapReq = data.filter((r) => /-\d{8}$/.test(r.model_requested));
console.log(
	'rows requesting a dated snapshot id:',
	snapReq.length,
	'statuses:',
	snapReq.reduce((m, r) => {
		m[r.status] = (m[r.status] || 0) + 1;
		return m;
	}, {}),
	'providers:',
	snapReq.reduce((m, r) => {
		m[r.provider] = (m[r.provider] || 0) + 1;
		return m;
	}, {})
);
console.log(
	'cache on snapshot-requested successes:',
	snapReq
		.filter((r) => r.status === 'success')
		.map((r) => `${r.cached_prompt_tokens}/${r.prompt_tokens}`)
		.join(' ')
);
// per turn: how many distinct providers served acting passes (pin effectiveness)
const turns = {};
for (const r of data)
	if (r.status === 'success' && !/review/.test(r.metadata?.passRole ?? ''))
		(turns[r.turn_run_id] ||= []).push(r.provider);
const dist = Object.values(turns).map((p) => new Set(p).size);
console.log(
	'acting passes per turn: turns',
	dist.length,
	'single-provider turns',
	dist.filter((d) => d === 1).length,
	'2 providers',
	dist.filter((d) => d === 2).length,
	'3+',
	dist.filter((d) => d >= 3).length
);
// within-turn continuation cache: for each acting success that follows an acting success on the same provider vs different
let same = [],
	diff = [];
for (const [id] of Object.entries(turns)) {
	const rows = data.filter(
		(r) =>
			r.turn_run_id === id &&
			r.status === 'success' &&
			!/review/.test(r.metadata?.passRole ?? '')
	);
	for (let i = 1; i < rows.length; i++) {
		const hit = (rows[i].cached_prompt_tokens || 0) / rows[i].prompt_tokens;
		(rows[i].provider === rows[i - 1].provider ? same : diff).push(hit);
	}
}
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
console.log(
	'continuation cache hit: same-provider n=',
	same.length,
	'median',
	med(same)?.toFixed(2),
	'| provider-switched n=',
	diff.length,
	'median',
	med(diff)?.toFixed(2)
);
// pass-1 cache
const first = Object.keys(turns).map((id) =>
	data.find(
		(r) =>
			r.turn_run_id === id && r.status === 'success' && r.metadata?.logicalProviderRound === 1
	)
);
const fh = first.filter(Boolean).map((r) => ({
	hit: (r.cached_prompt_tokens || 0) / r.prompt_tokens,
	cached: r.cached_prompt_tokens,
	prompt: r.prompt_tokens
}));
console.log(
	'pass-1 (round 1): n=',
	fh.length,
	'median hit',
	med(fh.map((x) => x.hit))?.toFixed(3),
	'median cached tokens',
	med(fh.map((x) => x.cached)),
	'median prompt',
	med(fh.map((x) => x.prompt)),
	'with any cache',
	fh.filter((x) => x.cached > 0).length
);
