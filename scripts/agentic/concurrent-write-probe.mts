// scripts/agentic/concurrent-write-probe.mts
//
// Tasker 101/102: fire N task creates at once in one project through the same
// gateway path the chat worker uses (runGatewayWriteOp, service-role client),
// against the isolated gate database, and time every database call. No model
// calls, so it costs nothing. It answers "do concurrent writes in one project
// queue briefly or stall?" without running the paid gate.
//
// Usage: node --import tsx scripts/agentic/concurrent-write-probe.mts [levels] [projectId]
//   levels    comma-separated burst sizes, default 1,2,4
//   projectId defaults to the test user's newest project
// Probe tasks are soft-deleted afterwards.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import type { GatewayLookupMemo } from '../../packages/shared-agent-ops/src/gateway/op-execution-gateway.worker';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const env = parse(readFileSync(resolve(root, '.env.agentic-gate.local')));
if (env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true') {
	throw new Error('Refusing to run: the gate env does not declare an isolated database.');
}
for (const file of ['apps/web/.env', 'apps/worker/.env']) {
	const path = resolve(root, file);
	if (
		existsSync(path) &&
		parse(readFileSync(path)).PUBLIC_SUPABASE_URL === env.PUBLIC_SUPABASE_URL
	) {
		throw new Error(`Refusing to run: the gate database matches ${file}.`);
	}
}

// The gateway source loads as CommonJS under tsx, so take its exports from the namespace.
const gatewayModule = await import(
	'../../packages/shared-agent-ops/src/gateway/op-execution-gateway.worker'
);
const { runGatewayWriteOp } = (gatewayModule.default ?? gatewayModule) as typeof gatewayModule;

const requireFromWorker = createRequire(resolve(root, 'apps/worker/package.json'));
const { createClient } = (await import(
	pathToFileURL(requireFromWorker.resolve('@supabase/supabase-js')).href
)) as typeof import('@supabase/supabase-js');

type HttpCall = { path: string; ms: number; status: number; body?: string };
let httpCalls: HttpCall[] = [];
const timedFetch: typeof fetch = async (input, init) => {
	const url = new URL(
		typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
	);
	const started = performance.now();
	const response = await fetch(input, init);
	const call: HttpCall = {
		path: url.pathname.replace('/rest/v1/', ''),
		ms: Math.round(performance.now() - started),
		status: response.status
	};
	if (!response.ok) call.body = (await response.clone().text()).slice(0, 300);
	httpCalls.push(call);
	return response;
};

const admin = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
	global: { fetch: timedFetch }
});

const signIn = await createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
}).auth.signInWithPassword({
	email: env.AGENTIC_TEST_USER_EMAIL,
	password: env.AGENTIC_TEST_USER_PASSWORD
});
if (signIn.error || !signIn.data.user)
	throw new Error(`Test user sign-in failed: ${signIn.error?.message}`);
const userId = signIn.data.user.id;

let projectId = process.argv[3];
if (!projectId) {
	const actor = await admin.from('onto_actors').select('id').eq('user_id', userId).single();
	if (actor.error) throw actor.error;
	const project = await admin
		.from('onto_projects')
		.select('id, name')
		.eq('created_by', actor.data.id)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(1)
		.single();
	if (project.error) throw project.error;
	projectId = project.data.id;
	console.log(`project ${projectId} (${project.data.name})`);
}

const levels = (process.argv[2] ?? '1,2,4').split(',').map(Number);
const stamp = new Date().toISOString().slice(11, 19);
const createdIds: string[] = [];

for (const level of levels) {
	httpCalls = [];
	// One memo per burst, as the worker shares one per turn.
	const memo: GatewayLookupMemo = {};
	const started = performance.now();
	const results = await Promise.all(
		Array.from({ length: level }, async (_, index) => {
			const callStarted = performance.now();
			const result = await runGatewayWriteOp({
				admin,
				userId,
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.create'],
					project_ids: [projectId],
					write_project_ids: [projectId]
				},
				op: 'onto.task.create',
				args: {
					project_id: projectId,
					title: `Probe ${stamp} x${level} #${index + 1}`,
					state_key: 'todo',
					priority: 2,
					calendar_sync: 'none'
				},
				memo
			});
			if (result.ok && result.entityId) createdIds.push(result.entityId);
			return { ms: Math.round(performance.now() - callStarted), result };
		})
	);
	const wall = Math.round(performance.now() - started);
	console.log(`\n== ${level} at once: ${wall} ms wall`);
	for (const [index, { ms, result }] of results.entries()) {
		console.log(
			`  #${index + 1} ${ms} ms ${result.ok ? 'ok' : `FAILED ${result.error?.code}: ${result.error?.message}`}`
		);
	}
	const rpc = httpCalls.filter((call) => call.path.startsWith('rpc/'));
	console.log(
		`  create RPCs: ${rpc.map((call) => `${call.ms}ms/${call.status}`).join(', ')}` +
			`; ${httpCalls.length} HTTP calls total, slowest ${Math.max(...httpCalls.map((call) => call.ms))} ms`
	);
	for (const call of httpCalls.filter((call) => call.body)) {
		console.log(`  ${call.status} ${call.path}: ${call.body}`);
	}
}

if (createdIds.length > 0) {
	const cleanup = await admin
		.from('onto_tasks')
		.update({ deleted_at: new Date().toISOString() })
		.in('id', createdIds);
	console.log(
		`\nsoft-deleted ${createdIds.length} probe tasks${cleanup.error ? ` (failed: ${cleanup.error.message})` : ''}`
	);
}
