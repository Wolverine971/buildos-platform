// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-F-pull3.mjs
// Lane F third pull (2026-09-09): tool results since the 09-04 one-engine deploy,
// raw size vs what the runtime's buildToolPayloadForModel actually hands the
// model (dist build of packages/agentic-chat-runtime, built 09-09 07:19), and
// how often the 6,000-char size guard replaces a payload with a JSON-string
// preview. Also: timezone rendering in tool results vs the prompt frame.
// Read-only.
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const loop = require('/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/dist/loop/index.js');
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
const since = '2026-09-04T17:14:00.000Z';
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const { data, error } = await sb
	.from('chat_tool_executions')
	.select('tool_name,success,result,arguments,created_at,turn_run_id')
	.gte('created_at', since)
	.order('created_at', { ascending: false })
	.limit(1500);
if (error) throw error;

const byTool = {};
const tzSamples = {};
const offsetRe = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})/g;
for (const row of data) {
	const raw = JSON.stringify(row.result ?? null);
	let model;
	try {
		model = loop.buildToolPayloadForModel(
			{ id: 'x', type: 'function', function: { name: row.tool_name, arguments: '{}' } },
			{ success: row.success, result: row.result },
			() => ({}),
			{ callableToolNames: [] }
		);
	} catch (e) {
		model = { error: String(e) };
	}
	const modelJson = JSON.stringify(model ?? null);
	const guarded =
		model &&
		typeof model === 'object' &&
		model.truncated === true &&
		typeof model.preview === 'string';
	const t = (byTool[row.tool_name] ||= { n: 0, raw: [], model: [], guarded: 0, fail: 0 });
	t.n += 1;
	t.raw.push(raw.length);
	t.model.push(modelJson.length);
	if (guarded) t.guarded += 1;
	if (!row.success) t.fail += 1;
	// timezone rendering: count offset suffixes in the raw result
	const offsets = {};
	for (const m of raw.matchAll(offsetRe)) offsets[m[1]] = (offsets[m[1]] || 0) + 1;
	if (Object.keys(offsets).length) {
		const s = (tzSamples[row.tool_name] ||= {});
		for (const [k, v] of Object.entries(offsets)) s[k] = (s[k] || 0) + v;
	}
}
const rows = Object.entries(byTool)
	.map(([tool, t]) => ({
		tool,
		n: t.n,
		fail: t.fail,
		raw_p50: pct(t.raw, 0.5),
		raw_p90: pct(t.raw, 0.9),
		raw_max: Math.max(...t.raw),
		model_p50: pct(t.model, 0.5),
		model_p90: pct(t.model, 0.9),
		model_max: Math.max(...t.model),
		guarded: t.guarded,
		guarded_share: +(t.guarded / t.n).toFixed(2)
	}))
	.sort((a, b) => b.guarded - a.guarded || b.n - a.n);
const totalModelChars = rows.reduce((s, r) => s + r.n * r.model_p50, 0);
fs.writeFileSync(
	path.join(OUT, 'lane-F-toolsizes-post0904.json'),
	JSON.stringify(
		{ since, executions: data.length, rows, tz_offsets_in_results: tzSamples },
		null,
		2
	)
);
console.log('executions', data.length, 'since', since);
console.log(
	'tool'.padEnd(32),
	'n'.padStart(4),
	'fail'.padStart(4),
	'raw50'.padStart(7),
	'raw90'.padStart(7),
	'mdl50'.padStart(7),
	'mdl90'.padStart(7),
	'mdlmax'.padStart(7),
	'guard'.padStart(5),
	'share'
);
for (const r of rows)
	console.log(
		r.tool.padEnd(32),
		String(r.n).padStart(4),
		String(r.fail).padStart(4),
		String(r.raw_p50).padStart(7),
		String(r.raw_p90).padStart(7),
		String(r.model_p50).padStart(7),
		String(r.model_p90).padStart(7),
		String(r.model_max).padStart(7),
		String(r.guarded).padStart(5),
		String(r.guarded_share).padStart(5)
	);
console.log('TZ OFFSETS IN RAW RESULTS', JSON.stringify(tzSamples));
