// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-F-sections.mjs
// Per-section rendered sizes from chat_turn_input_artifacts.prepared.promptSections
// for turns since the 2026-09-04 deploy. Writes stats to lane-F-sections.json and full
// prompt samples to the session scratchpad (never the repo).
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const SCRATCH = process.env.SCRATCH;
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
const { data: turns } = await sb
	.from('chat_turn_runs')
	.select('id,context_type,user_id,request_message,history_for_model_count,started_at')
	.gte('started_at', since)
	.order('started_at', { ascending: false })
	.limit(200);
const turnById = new Map(turns.map((t) => [t.id, t]));
const { data: arts, error } = await sb
	.from('chat_turn_input_artifacts')
	.select('turn_run_id,history,prepared,content_bytes,history_bytes')
	.gte('created_at', since)
	.limit(200);
if (error) throw error;
const stats = {};
const rows = [];
const payloadStats = {};
const historyRoles = {};
let samples = { project: null, global: null };
for (const a of arts) {
	const t = turnById.get(a.turn_run_id);
	const ctx = t?.context_type ?? 'unknown';
	const p = a.prepared ?? {};
	const sections = Array.isArray(p.promptSections) ? p.promptSections : [];
	const row = {
		turn: a.turn_run_id,
		ctx,
		system_prompt_chars: (p.systemPrompt ?? '').length,
		sections: {},
		context_payload_chars: JSON.stringify(p.contextPayload ?? null).length,
		tool_surface_chars: JSON.stringify(p.toolSurface ?? null).length,
		history_bytes: a.history_bytes,
		content_bytes: a.content_bytes,
		history_count: Array.isArray(a.history) ? a.history.length : 0
	};
	for (const s of sections) {
		const id = s.id ?? 'unknown';
		const chars = typeof s.content === 'string' ? s.content.length : (s.content_chars ?? 0);
		row.sections[id] = chars;
		(stats[`${ctx}::${id}`] ||= []).push(chars);
	}
	(payloadStats[ctx] ||= []).push(row.context_payload_chars);
	if (Array.isArray(a.history))
		for (const m of a.history) {
			const k = `${ctx}::${m.role}`;
			(historyRoles[k] ||= []).push((m.content ?? '').length);
		}
	// data-array counts in context payload
	const data = p.contextPayload?.data;
	if (data && typeof data === 'object') {
		row.data_counts = Object.fromEntries(
			Object.entries(data)
				.filter(([, v]) => Array.isArray(v))
				.map(([k, v]) => [k, v.length])
		);
		row.data_keys = Object.keys(data);
		if (Array.isArray(data.projects)) row.bundle_count = data.projects.length;
	}
	rows.push(row);
	if (SCRATCH && !samples[ctx] && p.systemPrompt && (ctx === 'project' || ctx === 'global')) {
		samples[ctx] = a.turn_run_id;
		fs.writeFileSync(path.join(SCRATCH, `sample-${ctx}-system-prompt.md`), p.systemPrompt);
		fs.writeFileSync(
			path.join(SCRATCH, `sample-${ctx}-context-payload.json`),
			JSON.stringify(p.contextPayload, null, 1)
		);
		fs.writeFileSync(
			path.join(SCRATCH, `sample-${ctx}-history.json`),
			JSON.stringify(a.history, null, 1)
		);
	}
}
const sectionSummary = Object.fromEntries(
	Object.entries(stats)
		.sort()
		.map(([k, arr]) => [
			k,
			{ n: arr.length, p50: pct(arr, 0.5), p90: pct(arr, 0.9), max: Math.max(...arr) }
		])
);
const payloadSummary = Object.fromEntries(
	Object.entries(payloadStats).map(([k, arr]) => [
		k,
		{ n: arr.length, p50: pct(arr, 0.5), p90: pct(arr, 0.9), max: Math.max(...arr) }
	])
);
const histSummary = Object.fromEntries(
	Object.entries(historyRoles)
		.sort()
		.map(([k, arr]) => [
			k,
			{ n: arr.length, p50: pct(arr, 0.5), p90: pct(arr, 0.9), max: Math.max(...arr) }
		])
);
fs.writeFileSync(
	path.join(OUT, 'lane-F-sections.json'),
	JSON.stringify(
		{
			since,
			artifacts: arts.length,
			sectionSummary,
			payloadSummary,
			histSummary,
			rows: rows.map(({ ...r }) => r)
		},
		null,
		2
	)
);
console.log('artifacts', arts.length, 'samples', JSON.stringify(samples));
console.log('CONTEXT PAYLOAD CHARS', JSON.stringify(payloadSummary));
for (const [k, v] of Object.entries(sectionSummary)) console.log(k.padEnd(48), JSON.stringify(v));
console.log('HISTORY MESSAGE CHARS BY ROLE');
for (const [k, v] of Object.entries(histSummary)) console.log(k.padEnd(28), JSON.stringify(v));
