#!/usr/bin/env node
// apps/worker/scripts/project-loop-provider-throughput.mjs
// Per-provider throughput + timeout telemetry for Project Loop LLM calls.
// Answers "which OpenRouter hosts are serving our loop calls, how fast, and
// which ones are timing out" — the question behind
// docs/plans/PROJECT_LOOP_TIMEOUT_RECOVERY_REVIEW_2026-08-22.md (RC-0).
// Read-only. Run weekly and after any provider-order change.
//   node apps/worker/scripts/project-loop-provider-throughput.mjs [--days 30] [--model deepseek/deepseek-v4-flash]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const env = Object.fromEntries(
	readFileSync(resolve(REPO, 'apps/worker/.env'), 'utf8')
		.split('\n')
		.map((l) => {
			const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
			return m ? [m[1], m[2].replace(/^"|"$/g, '')] : null;
		})
		.filter(Boolean)
);
const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DAYS = Number(arg('days', '30'));
const MODEL = arg('model', 'deepseek/deepseek-v4-flash');

const url = env.PUBLIC_SUPABASE_URL;
const key = env.PRIVATE_SUPABASE_SERVICE_KEY;
if (!url || !key)
	throw new Error(
		'PUBLIC_SUPABASE_URL / PRIVATE_SUPABASE_SERVICE_KEY missing in apps/worker/.env'
	);
const sb = createClient(url, key);
const since = new Date(Date.now() - DAYS * 864e5).toISOString();

const rows = [];
for (let from = 0; ; from += 1000) {
	const { data, error } = await sb
		.from('llm_usage_logs')
		.select(
			'operation_type,status,provider,response_time_ms,completion_tokens,request_started_at'
		)
		.eq('model_used', MODEL)
		.eq('streaming', false)
		.gte('created_at', since)
		.range(from, from + 999);
	if (error) throw error;
	rows.push(...(data ?? []));
	if (!data || data.length < 1000) break;
}

const q = (arr, p) => {
	const s = [...arr].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
};
const fmt = (n) =>
	n === null ? '-' : typeof n === 'number' && !Number.isInteger(n) ? n.toFixed(1) : String(n);
const isLoop = (r) => r.operation_type?.startsWith('project_loop');

console.log(
	`\n${MODEL} — non-streaming rows, last ${DAYS}d: ${rows.length} (${rows.filter(isLoop).length} project_loop*)\n`
);

// 1. Loop calls by provider: throughput on outputs large enough to measure.
const byProv = {};
for (const r of rows.filter(
	(r) => isLoop(r) && r.status === 'success' && r.completion_tokens >= 300
)) {
	const a = (byProv[r.provider ?? '?'] ??= { n: 0, tps: [], ms: [] });
	a.n++;
	a.tps.push(r.completion_tokens / (r.response_time_ms / 1000));
	a.ms.push(r.response_time_ms);
}
console.log('LOOP calls with >=300 output tokens — provider: n | tok/s p50 / p10 | wall p50 / p95');
for (const [p, a] of Object.entries(byProv).sort((x, y) => y[1].n - x[1].n)) {
	console.log(
		`  ${p.padEnd(16)} ${String(a.n).padStart(4)} | ${fmt(q(a.tps, 0.5)).padStart(6)} / ${fmt(q(a.tps, 0.1)).padStart(5)} | ${fmt(q(a.ms, 0.5)).padStart(6)}ms / ${fmt(q(a.ms, 0.95)).padStart(6)}ms`
	);
}

// 2. Per-detector timeout rate + latency.
const byOp = {};
for (const r of rows.filter(isLoop)) {
	const a = (byOp[r.operation_type] ??= { n: 0, to: 0, fail: 0, ms: [], out: [] });
	a.n++;
	if (r.status === 'timeout') a.to++;
	else if (r.status !== 'success') a.fail++;
	else {
		a.ms.push(r.response_time_ms);
		a.out.push(r.completion_tokens);
	}
}
console.log(
	'\nPer detector — calls | timeouts (rate) | otherFail | wall p50 / p95 | output tokens p50 / p95'
);
for (const [op, a] of Object.entries(byOp).sort((x, y) => y[1].n - x[1].n)) {
	console.log(
		`  ${op.padEnd(32)} ${String(a.n).padStart(4)} | ${String(a.to).padStart(3)} (${((100 * a.to) / a.n).toFixed(1)}%) | ${String(a.fail).padStart(3)} | ${fmt(q(a.ms, 0.5)).padStart(6)} / ${fmt(q(a.ms, 0.95)).padStart(6)} | ${fmt(q(a.out, 0.5)).padStart(5)} / ${fmt(q(a.out, 0.95)).padStart(5)}`
	);
}

// 3. Provider share trend (5-day buckets) so steering drift is visible.
const buckets = {};
for (const r of rows.filter((r) => isLoop(r) && r.status === 'success')) {
	const d = new Date(r.request_started_at);
	const k = `${d.getUTCMonth() + 1}/${String(Math.floor((d.getUTCDate() - 1) / 5) * 5 + 1).padStart(2, '0')}`;
	const b = (buckets[k] ??= { n: 0, prov: {} });
	b.n++;
	b.prov[r.provider ?? '?'] = (b.prov[r.provider ?? '?'] ?? 0) + 1;
}
console.log('\nLOOP provider share by 5-day bucket (top 3):');
for (const [k, b] of Object.entries(buckets).sort()) {
	const top = Object.entries(b.prov)
		.sort((x, y) => y[1] - x[1])
		.slice(0, 3)
		.map(([p, n]) => `${p} ${((100 * n) / b.n).toFixed(0)}%`)
		.join(', ');
	console.log(`  ${k.padEnd(6)} n=${String(b.n).padStart(4)}  ${top}`);
}
console.log();
