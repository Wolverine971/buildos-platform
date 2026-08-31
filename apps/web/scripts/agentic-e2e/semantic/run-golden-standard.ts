// apps/web/scripts/agentic-e2e/semantic/run-golden-standard.ts
// Phase-4 golden-standard runner for semantic discovery.
//
// This runs review-required Agent Runs against the isolated Driftline demo
// fixture and grades durable database evidence. It never approves or commits a
// change set.
//
//   cd apps/web
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-golden-standard.ts --dispatch --scenario=gs1
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-golden-standard.ts --dispatch --scenario=all
//   pnpm exec tsx scripts/agentic-e2e/semantic/run-golden-standard.ts --scenario=gs2 --run-id=<uuid>

import { randomUUID } from 'node:crypto';
import { createCustomClient } from '@buildos/supabase-client';
import { ensureActorId } from '@buildos/shared-agent-ops';
import dotenv from 'dotenv';
import path from 'node:path';
import { FIXTURE_PROJECT_NAME } from './fixture';
import {
	GOLDEN_SCENARIOS,
	gradeGoldenRun,
	type GoldenExecution,
	type GoldenGrade,
	type GoldenRun,
	type GoldenScenario,
	type GoldenScenarioId
} from './golden-standard';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.PRIVATE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo-author@build-os.com';
const DISPATCH = process.argv.includes('--dispatch');
const RUN_ID = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
const SCENARIO_ARG =
	process.argv.find((arg) => arg.startsWith('--scenario='))?.slice('--scenario='.length) ?? 'all';
const POLL_MS = 5_000;
const TIMEOUT_MS = 15 * 60_000;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY');
	process.exit(1);
}
if (!DISPATCH && !RUN_ID) {
	console.error(
		'Choose --dispatch or provide --run-id=<uuid>. This runner never commits changes.'
	);
	process.exit(1);
}
if (RUN_ID && SCENARIO_ARG === 'all') {
	console.error('--run-id requires --scenario=gs1 or --scenario=gs2.');
	process.exit(1);
}
if (!['all', 'gs1', 'gs2'].includes(SCENARIO_ARG)) {
	console.error('--scenario must be gs1, gs2, or all.');
	process.exit(1);
}

const admin = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

const ENTITY_TABLES = [
	{ kind: 'document', table: 'onto_documents', label: 'title' },
	{ kind: 'task', table: 'onto_tasks', label: 'title' },
	{ kind: 'goal', table: 'onto_goals', label: 'name' },
	{ kind: 'plan', table: 'onto_plans', label: 'name' },
	{ kind: 'milestone', table: 'onto_milestones', label: 'title' },
	{ kind: 'risk', table: 'onto_risks', label: 'title' },
	{ kind: 'requirement', table: 'onto_requirements', label: 'text' }
] as const;

const TERMINAL_STATUSES = new Set([
	'completed',
	'partial',
	'failed',
	'needs_input',
	'proposal_ready',
	'cancelled',
	'paused'
]);

type FixtureContext = {
	userId: string;
	actorId: string;
	projectId: string;
	entityIds: Map<string, string>;
};

type LiveSnapshot = Record<string, Array<{ id: string; updated_at: string | null }>>;

async function resolveFixture(): Promise<FixtureContext> {
	const { data: list, error: listError } = await admin.auth.admin.listUsers({
		page: 1,
		perPage: 200
	});
	if (listError) throw new Error(`listUsers failed: ${listError.message}`);
	const user = list.users.find((entry) => entry.email === DEMO_EMAIL);
	if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found.`);
	const actorId = await ensureActorId(admin, user.id);

	const { data: projects, error: projectError } = await admin
		.from('onto_projects')
		.select('id')
		.eq('created_by', actorId)
		.eq('name', FIXTURE_PROJECT_NAME)
		.is('deleted_at', null);
	if (projectError) throw new Error(`fixture lookup failed: ${projectError.message}`);
	if (!projects || projects.length !== 1) {
		throw new Error(
			`Expected exactly one ${FIXTURE_PROJECT_NAME} fixture for ${DEMO_EMAIL}; found ${projects?.length ?? 0}. Run semantic/seed.ts first.`
		);
	}
	const projectId = projects[0]!.id;
	const entityIds = new Map<string, string>();
	for (const source of ENTITY_TABLES) {
		const { data, error } = await (admin as any)
			.from(source.table)
			.select(`id, ${source.label}`)
			.eq('project_id', projectId)
			.is('deleted_at', null);
		if (error) throw new Error(`fixture scan ${source.table} failed: ${error.message}`);
		for (const row of data ?? []) {
			const key = `${source.kind}:${String(row[source.label])}`;
			if (entityIds.has(key)) throw new Error(`Fixture label is not unique: ${key}`);
			entityIds.set(key, String(row.id));
		}
	}

	const requiredKeys = new Set(
		Object.values(GOLDEN_SCENARIOS).flatMap((scenario) => [
			...scenario.requiredReadKeys,
			...scenario.requiredUpdateKeys,
			...scenario.allowedExistingTouchKeys,
			...scenario.decoyKeys
		])
	);
	const unresolved = [...requiredKeys].filter((key) => !entityIds.has(key));
	if (unresolved.length > 0) {
		throw new Error(`Fixture is incomplete; unresolved labels: ${unresolved.join(', ')}`);
	}
	return { userId: user.id, actorId, projectId, entityIds };
}

async function snapshotFixture(projectId: string): Promise<LiveSnapshot> {
	const snapshot: LiveSnapshot = {};
	for (const source of ENTITY_TABLES) {
		const { data, error } = await (admin as any)
			.from(source.table)
			.select('id, updated_at')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('id', { ascending: true });
		if (error) throw new Error(`snapshot ${source.table} failed: ${error.message}`);
		snapshot[source.table] = (data ?? []).map(
			(row: { id: string; updated_at: string | null }) => ({
				id: row.id,
				updated_at: row.updated_at
			})
		);
	}
	return snapshot;
}

function snapshotsEqual(before: LiveSnapshot, after: LiveSnapshot): boolean {
	return JSON.stringify(before) === JSON.stringify(after);
}

async function dispatchScenario(
	fixture: FixtureContext,
	scenario: GoldenScenario
): Promise<{ runId: string; queueJobId: string }> {
	const budgets = {
		wall_clock_ms: TIMEOUT_MS,
		max_tokens: 100_000,
		max_tool_calls: 40,
		max_cost_usd: 0.5
	};
	const metadata = {
		run_id: '',
		trigger: 'manual',
		context_type: 'project',
		project_id: fixture.projectId,
		parent_run_id: null,
		depth: 0,
		scope_mode: 'read_write',
		effort: 'standard',
		run_template: 'agent',
		allowed_ops: null,
		review_required: true,
		budgets,
		correlationId: randomUUID()
	};
	const { data, error } = await (admin as any).rpc('create_agent_run_with_job', {
		p_run: {
			user_id: fixture.userId,
			trigger: 'manual',
			label: scenario.label,
			goal: scenario.goal,
			instructions: scenario.instructions,
			expected_output: scenario.expectedOutput,
			context_type: 'project',
			project_id: fixture.projectId,
			scope_mode: 'read_write',
			effort: 'standard',
			run_template: 'agent',
			allowed_ops: null,
			review_required: true,
			budgets,
			parent_run_id: null,
			parent_session_id: null,
			parent_message_id: null,
			depth: 0,
			source_suggestion_id: null,
			source_decision: null
		},
		p_job_metadata: metadata,
		p_priority: 7
	});
	if (error || !data?.run?.id || !data?.job_id) {
		throw new Error(`dispatch failed: ${error?.message ?? 'invalid RPC receipt'}`);
	}
	return { runId: String(data.run.id), queueJobId: String(data.job_id) };
}

async function loadRun(runId: string): Promise<GoldenRun> {
	const { data, error } = await admin
		.from('agent_runs')
		.select('id, status, review_required, scope_mode, project_id, change_set')
		.eq('id', runId)
		.single();
	if (error || !data) throw new Error(`load run ${runId} failed: ${error?.message ?? 'missing'}`);
	return data as GoldenRun;
}

async function waitForRun(runId: string): Promise<GoldenRun> {
	const startedAt = Date.now();
	let priorStatus = '';
	while (Date.now() - startedAt < TIMEOUT_MS + 30_000) {
		const run = await loadRun(runId);
		if (run.status !== priorStatus) {
			console.log(`[${runId}] status=${run.status}`);
			priorStatus = run.status;
		}
		if (TERMINAL_STATUSES.has(run.status)) return run;
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	throw new Error(`run ${runId} did not reach a review/terminal state within ${TIMEOUT_MS}ms`);
}

async function loadExecutions(runId: string): Promise<GoldenExecution[]> {
	const { data, error } = await admin
		.from('agent_tool_executions')
		.select(
			'id, tool_category, gateway_op, arguments, result, success, mutation_mode, proposed_change_id, created_at'
		)
		.eq('agent_run_id', runId)
		.order('created_at', { ascending: true });
	if (error) throw new Error(`load executions ${runId} failed: ${error.message}`);
	return (data ?? []) as GoldenExecution[];
}

async function inferLiveStateUnchanged(run: GoldenRun): Promise<boolean> {
	if (!run.change_set || typeof run.change_set !== 'object' || Array.isArray(run.change_set)) {
		return false;
	}
	const changes = (run.change_set as { changes?: unknown }).changes;
	if (!Array.isArray(changes)) return false;
	for (const change of changes) {
		if (!change || typeof change !== 'object') return false;
		const candidate = change as {
			action?: string;
			entity_type?: string;
			entity_id?: string;
			before?: { updated_at?: unknown };
		};
		if (candidate.action === 'create') continue;
		const source = ENTITY_TABLES.find((entry) => entry.kind === candidate.entity_type);
		if (!source || !candidate.entity_id) return false;
		const { data, error } = await (admin as any)
			.from(source.table)
			.select('updated_at')
			.eq('id', candidate.entity_id)
			.maybeSingle();
		if (error || !data) return false;
		if (
			typeof candidate.before?.updated_at === 'string' &&
			data.updated_at !== candidate.before.updated_at
		) {
			return false;
		}
	}
	return true;
}

function printGrade(scenario: GoldenScenario, runId: string, grade: GoldenGrade): void {
	console.log(`\n${scenario.label}`);
	console.log(`run ${runId}`);
	for (const entry of grade.checks) {
		console.log(`${entry.pass ? 'PASS' : 'FAIL'}  ${entry.id.padEnd(28)} ${entry.detail}`);
	}
	console.log(`\n${scenario.id.toUpperCase()} GATE: ${grade.pass ? 'PASS' : 'FAIL'}`);
	if (!grade.pass) {
		console.log(`missing reads: ${grade.readCoverage.missing.join('; ') || 'none'}`);
		console.log(`touched: ${grade.touched.join('; ') || 'none'}`);
		console.log(`decoys: ${grade.decoysTouched.join('; ') || 'none'}`);
	}
}

async function gradeScenario(params: {
	fixture: FixtureContext;
	scenario: GoldenScenario;
	run: GoldenRun;
	before?: LiveSnapshot;
}): Promise<GoldenGrade> {
	const executions = await loadExecutions(params.run.id);
	const liveStateUnchanged = params.before
		? snapshotsEqual(params.before, await snapshotFixture(params.fixture.projectId))
		: await inferLiveStateUnchanged(params.run);
	return gradeGoldenRun({
		scenario: params.scenario,
		projectId: params.fixture.projectId,
		entityIds: params.fixture.entityIds,
		run: params.run,
		executions,
		liveStateUnchanged
	});
}

async function main() {
	const fixture = await resolveFixture();
	console.log(
		`fixture=${fixture.projectId} user=${fixture.userId} actor=${fixture.actorId} account=${DEMO_EMAIL}`
	);
	const scenarioIds: GoldenScenarioId[] =
		SCENARIO_ARG === 'all' ? ['gs1', 'gs2'] : [SCENARIO_ARG as GoldenScenarioId];
	let failed = false;

	for (const scenarioId of scenarioIds) {
		const scenario = GOLDEN_SCENARIOS[scenarioId];
		if (RUN_ID) {
			const run = await loadRun(RUN_ID);
			const grade = await gradeScenario({ fixture, scenario, run });
			printGrade(scenario, RUN_ID, grade);
			failed ||= !grade.pass;
			continue;
		}

		const before = await snapshotFixture(fixture.projectId);
		const receipt = await dispatchScenario(fixture, scenario);
		console.log(
			`dispatched ${scenario.id}: run=${receipt.runId} queue_job=${receipt.queueJobId} (review only; never auto-committed)`
		);
		const run = await waitForRun(receipt.runId);
		const grade = await gradeScenario({ fixture, scenario, run, before });
		printGrade(scenario, receipt.runId, grade);
		failed ||= !grade.pass;
	}

	process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
