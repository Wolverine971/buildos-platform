#!/usr/bin/env node
// apps/worker/scripts/deep-research-bakeoff.mjs
// Deep-research $2 bake-off driver. One run per invocation:
//   node apps/worker/scripts/deep-research-bakeoff.mjs <runKey>
// runKey ∈ q1-fanout | q1-single | q2-fanout | q2-single | status | unbrick
//
// Requires local web dev on :5173 and a local agent_run worker running (use
// apps/worker/src/scripts/bakeoffAgentRunWorker.ts), plus the production Railway
// worker PAUSED (see DEEP_RESEARCH_BAKEOFF_RUNBOOK.md). Reads env from the repo
// .env files. Hard stop: refuses to dispatch if committed ledger spend for this
// session + the next run's $0.50 ceiling would exceed $2.00.
// Results (JSON capture + report markdown) are written under BAKEOFF_OUT or
// tmp/bakeoff-results (gitignored).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/worker/scripts -> repo root
const REPO = resolve(HERE, '../../..');
const OUT = process.env.BAKEOFF_OUT || resolve(REPO, 'tmp/bakeoff-results');
mkdirSync(OUT, { recursive: true });

const BASE_URL = process.env.BAKEOFF_BASE_URL || 'http://localhost:5173';
const HARD_BUDGET_USD = 2.0;
const RUN_CEILING_USD = 0.5;
const POLL_MS = 10_000;
const RUN_TIMEOUT_MS = 22 * 60 * 1000; // > 20-min enforced max wall clock

function loadEnv(file) {
	const out = {};
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
	}
	return out;
}
const rootEnv = loadEnv(resolve(REPO, '.env'));
const webEnv = loadEnv(resolve(REPO, 'apps/web/.env'));
const SUPABASE_URL = rootEnv.PUBLIC_SUPABASE_URL || webEnv.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = rootEnv.PRIVATE_SUPABASE_SERVICE_KEY || webEnv.PRIVATE_SUPABASE_SERVICE_KEY;
const TEST_EMAIL = webEnv.AGENTIC_TEST_USER_EMAIL;
const TEST_PASSWORD = webEnv.AGENTIC_TEST_USER_PASSWORD;
if (!SUPABASE_URL || !SERVICE_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
	console.error('missing env (supabase url/service key/test creds)');
	process.exit(1);
}

const Q1 =
	'Compare Tavily, Exa, and Brave Search APIs for powering an AI research agent in 2026. I need: current pricing per search/credit, free tiers, rate limits, content quality and freshness characteristics, and the effective monthly cost at roughly 1,000 searches per month. Cite sources for every pricing claim and note where sources conflict or information is stale.';
const Q2 =
	'What budget-control and spend-limit mechanisms does OpenRouter offer in 2026 (provisioned/managed API keys with credit limits, account-level limits, per-request max_price, prepaid credits)? For each: what exactly is enforced, at what granularity, what its documented limitations are, and whether a platform can rely on it as a hard backstop against runaway agent spend. Cite official documentation wherever possible.';

const RUNS = {
	'q1-fanout': {
		goal: Q1,
		body: { run_template: 'deep_research' },
		label: 'Q1 search-API fan-out'
	},
	'q1-single': {
		goal: Q1,
		body: {
			effort: 'deep',
			allowed_ops: ['util.web.search', 'util.web.visit'],
			budgets: { max_tool_calls: 12, max_tokens: 60_000, wall_clock_ms: 600_000 }
		},
		label: 'Q1 search-API single-deep'
	},
	'q2-fanout': {
		goal: Q2,
		body: { run_template: 'deep_research' },
		label: 'Q2 openrouter-limits fan-out'
	},
	'q2-single': {
		goal: Q2,
		body: {
			effort: 'deep',
			allowed_ops: ['util.web.search', 'util.web.visit'],
			budgets: { max_tool_calls: 12, max_tokens: 60_000, wall_clock_ms: 600_000 }
		},
		label: 'Q2 openrouter-limits single-deep'
	}
};

async function sb(path, init = {}) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		...init,
		headers: {
			apikey: SERVICE_KEY,
			Authorization: `Bearer ${SERVICE_KEY}`,
			'Content-Type': 'application/json',
			...(init.headers || {})
		}
	});
	if (!res.ok) throw new Error(`supabase ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

function sessionRunIds() {
	const f = resolve(OUT, 'session-runs.json');
	return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
function saveSessionRun(key, runId) {
	const f = resolve(OUT, 'session-runs.json');
	const cur = sessionRunIds();
	cur[key] = runId;
	writeFileSync(f, JSON.stringify(cur, null, 2));
}

async function sessionSpend() {
	const ids = Object.values(sessionRunIds());
	if (ids.length === 0) return { committed: 0, rows: [] };
	const rows = await sb(
		`agent_run_cost_entries?root_run_id=in.(${ids.join(',')})&select=root_run_id,leaf_run_id,provider,operation,status,reserved_cost_usd,actual_cost_usd,provider_request_id`
	);
	const committed = rows.reduce((sum, r) => {
		const reserved = Number(r.reserved_cost_usd) || 0;
		const actual = r.actual_cost_usd === null ? null : Number(r.actual_cost_usd);
		if (r.status === 'released') return sum;
		if (r.status === 'settled') return sum + (actual ?? reserved);
		if (r.status === 'reconciliation_required')
			return sum + Math.max(reserved, actual ?? reserved);
		return sum + reserved; // reserved
	}, 0);
	return { committed, rows };
}

async function login() {
	const res = await fetch(`${BASE_URL}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
	});
	const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
	const jar = cookies.map((c) => c.split(';')[0]).join('; ');
	if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
	if (!jar.includes('auth-token')) throw new Error('login cookie jar missing auth-token');
	const payload = await res.json();
	return { jar, userId: payload?.data?.user?.id };
}

async function dispatch(runKey) {
	const spec = RUNS[runKey];
	const { committed } = await sessionSpend();
	console.log(`session committed spend so far: $${committed.toFixed(4)}`);
	if (committed + RUN_CEILING_USD > HARD_BUDGET_USD + 1e-9) {
		console.error(
			`HARD STOP: $${committed.toFixed(4)} committed + $${RUN_CEILING_USD} ceiling > $${HARD_BUDGET_USD}`
		);
		process.exit(2);
	}
	const { jar } = await login();
	const body = {
		goal: spec.goal,
		context_type: 'global',
		scope_mode: 'read_only',
		label: `bakeoff ${runKey}`,
		budgets: { max_cost_usd: RUN_CEILING_USD, ...(spec.body.budgets || {}) },
		...(spec.body.run_template ? { run_template: spec.body.run_template } : {}),
		...(spec.body.effort ? { effort: spec.body.effort } : {})
	};
	const res = await fetch(`${BASE_URL}/api/agent-runs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Cookie: jar },
		body: JSON.stringify(body)
	});
	const payload = await res.json().catch(() => ({}));
	if (!res.ok || !payload?.data?.run?.id) {
		throw new Error(`dispatch failed: ${res.status} ${JSON.stringify(payload)}`);
	}
	const runId = payload.data.run.id;
	saveSessionRun(runKey, runId);
	console.log(`[${runKey}] dispatched run ${runId}`);
	return runId;
}

async function awaitTerminal(runKey, runId) {
	const started = Date.now();
	for (;;) {
		const [run] = await sb(
			`agent_runs?id=eq.${runId}&select=id,status,result,metrics,orchestration_state,started_at,completed_at,budgets`
		);
		if (!run) throw new Error('run row vanished');
		const terminal = ['completed', 'partial', 'failed', 'cancelled'].includes(run.status);
		process.stdout.write(
			`\r[${runKey}] ${run.status} stage=${run.orchestration_state?.stage ?? '-'} elapsed=${Math.round((Date.now() - started) / 1000)}s   `
		);
		if (terminal) {
			console.log('');
			const events = await sb(
				`agent_run_events?run_id=eq.${runId}&select=seq,event_type,payload,created_at&order=seq.asc&limit=500`
			);
			const children = await sb(
				`agent_runs?parent_run_id=eq.${runId}&select=id,status,result,metrics,budgets`
			);
			const childEvents = [];
			for (const child of children) {
				childEvents.push({
					child: child.id,
					events: await sb(
						`agent_run_events?run_id=eq.${child.id}&select=seq,event_type,payload,created_at&order=seq.asc&limit=500`
					)
				});
			}
			const treeIds = [runId, ...children.map((c) => c.id)];
			const ledger = await sb(
				`agent_run_cost_entries?leaf_run_id=in.(${treeIds.join(',')})&select=*&order=reserved_at.asc`
			);
			const record = { runKey, runId, run, children, events, childEvents, ledger };
			writeFileSync(resolve(OUT, `${runKey}.json`), JSON.stringify(record, null, 2));
			const report = run.result?.answer || run.result?.summary || '(no answer)';
			writeFileSync(resolve(OUT, `${runKey}-report.md`), String(report));
			const spent = ledger.reduce((s, r) => {
				if (r.status === 'released') return s;
				const reserved = Number(r.reserved_cost_usd) || 0;
				const actual = r.actual_cost_usd === null ? null : Number(r.actual_cost_usd);
				if (r.status === 'settled') return s + (actual ?? reserved);
				return s + Math.max(reserved, actual ?? reserved);
			}, 0);
			console.log(`[${runKey}] terminal=${run.status} tree-spend=$${spent.toFixed(4)}`);
			console.log(
				`[${runKey}] ledger states: ${ledger.map((r) => `${r.provider}:${r.status}`).join(', ')}`
			);
			console.log(`[${runKey}] wrote ${runKey}.json and ${runKey}-report.md`);
			return;
		}
		if (Date.now() - started > RUN_TIMEOUT_MS) {
			console.error(
				`\n[${runKey}] TIMEOUT waiting for terminal state — inspect run ${runId}`
			);
			process.exit(3);
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
}

const key = process.argv[2];
if (key === 'status') {
	const { committed, rows } = await sessionSpend();
	console.log(`committed session spend: $${committed.toFixed(4)} across ${rows.length} entries`);
	for (const r of rows) {
		console.log(
			`  ${r.provider}/${r.operation} ${r.status} reserved=$${r.reserved_cost_usd} actual=${r.actual_cost_usd ?? '-'}`
		);
	}
	process.exit(0);
} else if (key === 'unbrick') {
	// Emergency: cancel every non-terminal bakeoff run for the test user.
	const ids = Object.values(sessionRunIds());
	for (const id of ids) {
		const [run] = await sb(`agent_runs?id=eq.${id}&select=id,status`);
		if (run && !['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) {
			await sb(`agent_runs?id=eq.${id}`, {
				method: 'PATCH',
				headers: { Prefer: 'return=minimal' },
				body: JSON.stringify({
					status: 'cancelled',
					completed_at: new Date().toISOString()
				})
			});
			console.log(`cancelled ${id}`);
		}
		const children = await sb(`agent_runs?parent_run_id=eq.${id}&select=id,status`);
		for (const child of children) {
			if (!['completed', 'partial', 'failed', 'cancelled'].includes(child.status)) {
				await sb(`agent_runs?id=eq.${child.id}`, {
					method: 'PATCH',
					headers: { Prefer: 'return=minimal' },
					body: JSON.stringify({
						status: 'cancelled',
						completed_at: new Date().toISOString()
					})
				});
				console.log(`cancelled child ${child.id}`);
			}
		}
	}
	process.exit(0);
} else if (RUNS[key]) {
	const runId = await dispatch(key);
	await awaitTerminal(key, runId);
	const { committed } = await sessionSpend();
	console.log(`session committed spend now: $${committed.toFixed(4)} of $${HARD_BUDGET_USD}`);
} else {
	console.error(
		'usage: node run-bakeoff.mjs <q1-fanout|q1-single|q2-fanout|q2-single|status|unbrick>'
	);
	process.exit(1);
}
