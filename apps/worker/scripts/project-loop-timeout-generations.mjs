#!/usr/bin/env node
// apps/worker/scripts/project-loop-timeout-generations.mjs
// For every llm_usage_logs row with status='timeout' in the window, fetch the
// authoritative OpenRouter generation record: which provider actually served
// it, how many tokens it produced before we cancelled, whether it finished
// after we hung up, and what it cost. Accepted-generation timeouts are logged
// locally as 0 tokens / $0 with billingDisposition='uncertain'; this is the
// reconciliation view until the scheduled reconciler exists
// (docs/plans/PROJECT_LOOP_TIMEOUT_RECOVERY_REVIEW_2026-08-22.md §2.2, P2).
// Generation IDs expire at OpenRouter within days — run this soon after incidents.
// Read-only.
//   node apps/worker/scripts/project-loop-timeout-generations.mjs [--days 30] [--all-ops]
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
const ALL_OPS = process.argv.includes('--all-ops');

const KEY = env.PRIVATE_OPENROUTER_API_KEY;
if (!KEY) throw new Error('PRIVATE_OPENROUTER_API_KEY missing in apps/worker/.env');
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY);
const since = new Date(Date.now() - DAYS * 864e5).toISOString();

let query = sb
	.from('llm_usage_logs')
	.select('operation_type,request_started_at,model_used,metadata')
	.eq('status', 'timeout')
	.gte('created_at', since)
	.order('request_started_at');
if (!ALL_OPS) query = query.like('operation_type', 'project_loop%');
const { data: rows, error } = await query;
if (error) throw error;

console.log(`\nTimeout rows, last ${DAYS}d${ALL_OPS ? '' : ' (project_loop*)'}: ${rows.length}\n`);
const providers = {};
let found = 0;
let expired = 0;
let unaccountedCost = 0;
for (const row of rows) {
	const genId = row.metadata?.openrouterRequestId;
	const stamp = row.request_started_at.slice(0, 16);
	if (!genId) {
		console.log(
			`  ${row.operation_type.padEnd(32)} ${stamp}  (no generation id — pre-header timeout)`
		);
		continue;
	}
	const res = await fetch(
		`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(genId)}`,
		{
			headers: { Authorization: `Bearer ${KEY}` }
		}
	);
	if (!res.ok) {
		expired++;
		console.log(
			`  ${row.operation_type.padEnd(32)} ${stamp}  lookup HTTP ${res.status} (${genId})`
		);
		continue;
	}
	const d = (await res.json()).data;
	found++;
	providers[d.provider_name] = (providers[d.provider_name] ?? 0) + 1;
	unaccountedCost += d.total_cost ?? 0;
	const tps = d.generation_time
		? (d.tokens_completion / (d.generation_time / 1000)).toFixed(1)
		: '-';
	console.log(
		`  ${row.operation_type.padEnd(32)} ${stamp}  ${String(d.provider_name).padEnd(14)} out=${String(d.tokens_completion).padEnd(5)} gen=${String(d.generation_time).padEnd(6)}ms finish=${String(d.finish_reason).padEnd(5)} cancelled=${String(d.cancelled).padEnd(5)} ${tps} tok/s  $${d.total_cost}`
	);
}
console.log(
	`\nretrievable=${found} expired=${expired}  providers=${JSON.stringify(providers)}  unaccounted cost=$${unaccountedCost.toFixed(5)}\n`
);
