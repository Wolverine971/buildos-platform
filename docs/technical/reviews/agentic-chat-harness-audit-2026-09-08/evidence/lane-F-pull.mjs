// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-F-pull.mjs
// Lane F evidence pull: prepared-prompt hit rate, history shape, prompt section sizes
// for turns since the 2026-09-04 one-engine deploy. Read-only.
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

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
const count = (arr, f) =>
	arr.reduce((m, x) => {
		const k = f(x) ?? 'null';
		m[k] = (m[k] || 0) + 1;
		return m;
	}, {});
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const { data: turns, error: e1 } = await sb
	.from('chat_turn_runs')
	.select(
		'id,user_id,session_id,status,execution_mode,context_type,llm_pass_count,tool_call_count,tool_round_count,started_at,finished_at,failure_code,finished_reason,prepared_surface_profile,prepared_prompt_hit,prepared_prompt_miss_reason,request_prewarmed_context,history_for_model_count,raw_history_count,history_strategy,prompt_snapshot_id,cache_source,cache_age_seconds,request_message'
	)
	.gte('started_at', since)
	.order('started_at', { ascending: false })
	.limit(500);
if (e1) throw e1;

const summary = {
	window_since: since,
	turns: turns.length,
	by_status: count(turns, (t) => t.status),
	by_context: count(turns, (t) => t.context_type),
	prepared_prompt_hit: count(turns, (t) => String(t.prepared_prompt_hit)),
	miss_reasons: count(
		turns.filter((t) => t.prepared_prompt_miss_reason),
		(t) => t.prepared_prompt_miss_reason
	),
	request_prewarmed_context: count(turns, (t) => String(t.request_prewarmed_context)),
	cache_source: count(turns, (t) => t.cache_source),
	history_strategy: count(turns, (t) => t.history_strategy),
	history_for_model_count: count(turns, (t) => String(t.history_for_model_count)),
	raw_history_count: count(turns, (t) => String(t.raw_history_count)),
	llm_pass_count: count(turns, (t) => String(t.llm_pass_count)),
	tool_round_count: count(turns, (t) => String(t.tool_round_count))
};

// prompt snapshots: section sizes
const snapIds = turns
	.map((t) => t.prompt_snapshot_id)
	.filter(Boolean)
	.slice(0, 120);
const { data: snaps, error: e2 } = await sb
	.from('chat_prompt_snapshots')
	.select(
		'id,turn_run_id,created_at,system_prompt_chars,message_chars,approx_prompt_tokens,prompt_sections,prompt_variant'
	)
	.in('id', snapIds);
if (e2) throw e2;
const turnById = new Map(turns.map((t) => [t.id, t]));
const sectionStats = {};
const perSnap = [];
for (const s of snaps) {
	const t = turnById.get(s.turn_run_id);
	const ctx = t?.context_type ?? 'unknown';
	const sections = Array.isArray(s.prompt_sections) ? s.prompt_sections : [];
	const row = {
		snapshot_id: s.id,
		turn_run_id: s.turn_run_id,
		context_type: ctx,
		system_prompt_chars: s.system_prompt_chars,
		message_chars: s.message_chars,
		approx_prompt_tokens: s.approx_prompt_tokens,
		sections: {}
	};
	for (const sec of sections) {
		const id = sec.id ?? sec.title ?? 'unknown';
		const chars =
			typeof sec.content_chars === 'number'
				? sec.content_chars
				: typeof sec.content === 'string'
					? sec.content.length
					: null;
		row.sections[id] = chars;
		const key = `${ctx}::${id}`;
		(sectionStats[key] ||= []).push(chars ?? 0);
	}
	perSnap.push(row);
}
const sectionSummary = Object.fromEntries(
	Object.entries(sectionStats).map(([k, arr]) => [
		k,
		{ n: arr.length, p50: pct(arr, 0.5), p90: pct(arr, 0.9), max: Math.max(...arr) }
	])
);
const sysChars = { global: [], project: [], project_create: [] };
for (const r of perSnap) (sysChars[r.context_type] ||= []).push(r.system_prompt_chars);
const sysSummary = Object.fromEntries(
	Object.entries(sysChars).map(([k, arr]) => [
		k,
		{
			n: arr.length,
			p50: pct(arr, 0.5),
			p90: pct(arr, 0.9),
			max: arr.length ? Math.max(...arr) : null
		}
	])
);

// input artifacts: history bytes
const { data: artifacts, error: e3 } = await sb
	.from('chat_turn_input_artifacts')
	.select(
		'turn_run_id,history_source,history_bytes,content_bytes,source_prepared_prompt_id,created_at'
	)
	.gte('created_at', since)
	.limit(500);
if (e3) throw e3;
const artSummary = {
	n: artifacts.length,
	history_source: count(artifacts, (a) => a.history_source),
	with_prepared_prompt: artifacts.filter((a) => a.source_prepared_prompt_id).length,
	history_bytes: {
		p50: pct(
			artifacts.map((a) => a.history_bytes),
			0.5
		),
		p90: pct(
			artifacts.map((a) => a.history_bytes),
			0.9
		),
		max: Math.max(...artifacts.map((a) => a.history_bytes))
	},
	content_bytes: {
		p50: pct(
			artifacts.map((a) => a.content_bytes),
			0.5
		),
		p90: pct(
			artifacts.map((a) => a.content_bytes),
			0.9
		)
	}
};

// prepared prompt rows created in window (prewarm volume) vs consumed
const { count: preparedCount, error: e4 } = await sb
	.from('agentic_chat_prepared_prompts')
	.select('id', { count: 'exact', head: true })
	.gte('created_at', since);
const { count: consumedCount, error: e5 } = await sb
	.from('agentic_chat_prepared_prompts')
	.select('id', { count: 'exact', head: true })
	.gte('created_at', since)
	.not('consumed_at', 'is', null);
const { count: ctxSnapCount } = await sb
	.from('agentic_chat_context_snapshots')
	.select('user_id', { count: 'exact', head: true });

const out = {
	summary,
	system_prompt_chars_by_context: sysSummary,
	section_summary: sectionSummary,
	artifacts: artSummary,
	prepared_rows_in_window: preparedCount,
	prepared_rows_consumed: consumedCount,
	prepared_errors: [e4?.message, e5?.message].filter(Boolean),
	context_snapshot_rows: ctxSnapCount,
	per_snapshot: perSnap
};
fs.writeFileSync(path.join(OUT, 'lane-F-evidence.json'), JSON.stringify(out, null, 2));
console.log(
	JSON.stringify(
		{
			summary,
			system_prompt_chars_by_context: sysSummary,
			artifacts: artSummary,
			prepared_rows_in_window: preparedCount,
			prepared_rows_consumed: consumedCount,
			context_snapshot_rows: ctxSnapCount
		},
		null,
		2
	)
);
console.log('SECTIONS');
for (const [k, v] of Object.entries(sectionSummary).sort()) console.log(k, JSON.stringify(v));
