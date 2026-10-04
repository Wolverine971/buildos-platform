import {
	createLibriResearchReadiness,
	createLibriResearchRuntime
} from '../src/workers/libri/researchRuntime';
import { createBookSynthesisExecution } from '../src/workers/libri/bookSynthesisExecution';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { book, chapter } from './helpers/libriSynthesisFixture';
import { createLibriLifecycle, type ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';
import { createLibriCostLedger } from '../src/workers/libri/costLedger';
import { createBookAgentExecution } from '../src/workers/libri/bookAgentExecution';
import {
	createBookAgentProcessor,
	validateBookAgentResult,
	type BookAgentInput
} from '../src/workers/libri/bookAgentProfile';
import { agentOutput } from './helpers/libriAgentFixture';

const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('Synthesis contracts require PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
const signal = new AbortController().signal;
describe.skipIf(!available)('book expert restricted-role PostgreSQL completion', () => {
	let dir = '',
		started = false,
		admin: Pool,
		worker: Pool,
		library: string;
	const closers: Array<() => Promise<void>> = [];
	let lifecycle: ReturnType<typeof createLibriLifecycle>;
	let execution: ReturnType<typeof createBookAgentExecution>;
	let ledger: ReturnType<typeof createLibriCostLedger>;
	beforeAll(async () => {
		dir = mkdtempSync('/tmp/libri-agent-pg-');
		const data = join(dir, 'data');
		const run = (cmd: string, args: string[]) =>
			execFileSync(cmd, args, { stdio: 'pipe', timeout: 30000 });
		run('initdb', [
			'-D',
			data,
			'--no-locale',
			'--encoding=UTF8',
			'--auth=trust',
			'--username=postgres'
		]);
		run('pg_ctl', [
			'-D',
			data,
			'-l',
			join(dir, 'server.log'),
			'-o',
			`-k ${dir} -p 57504 -c listen_addresses=''`,
			'-w',
			'start'
		]);
		started = true;
		run('psql', [
			'-X',
			'-q',
			'-h',
			dir,
			'-p',
			'57504',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve(
				'../../supabase/tests/20261004035255_libri_book_agent_profile_execution.test.sql'
			)
		]);
		admin = new Pool({
			host: dir,
			port: 57504,
			database: 'postgres',
			user: 'postgres',
			max: 2
		});
		worker = new Pool({
			host: dir,
			port: 57504,
			database: 'postgres',
			user: 'libri_worker',
			max: 2
		});
		closers.push(trackPoolDisconnections(admin), trackPoolDisconnections(worker));
		lifecycle = createLibriLifecycle(worker);
		execution = createBookAgentExecution(worker);
		ledger = createLibriCostLedger(worker);
		await admin.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
	}, 30000);
	afterAll(async () => {
		await Promise.all(closers.map((close) => close()));
		if (started)
			spawnSync('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop'], {
				stdio: 'ignore'
			});
		if (dir) rmSync(dir, { recursive: true, force: true });
	});
	beforeEach(async () => {
		await admin.query('TRUNCATE libri.libraries CASCADE; TRUNCATE public.queue_jobs');
		library = randomUUID();
		await admin.query(
			"INSERT INTO libri.libraries(id,slug,name,created_by) VALUES($1,'synthesis','Synthesis',$2)",
			[library, owner]
		);
		await admin.query(
			"INSERT INTO libri.library_members(library_id,user_id,role) VALUES($1,$2,'owner')",
			[library, owner]
		);
		await admin.query(
			"INSERT INTO libri.books(id,library_id,title) VALUES($1,$2,'Offline Book')",
			[book, library]
		);
		await admin.query(
			"INSERT INTO libri.chapters(id,library_id,book_id,position,number,title,summary) VALUES($1,$2,$3,0,'1','First','Deliberate practice supports learning.')",
			[chapter, library, book]
		);
		await admin.query(
			"INSERT INTO libri.notes(library_id,book_id,owner_user_id,visibility,content) VALUES($1,$2,$3,'private','PRIVATE SECRET NOTE'),($1,$2,$3,'shared_link','Shared practice note.')",
			[library, book, owner]
		);
		await admin.query(
			"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd) VALUES($1,true,ARRAY['generate_agent_profile'],1000,10000)",
			[library]
		);
	});
	async function ownerQuery(sql: string, values: unknown[]) {
		const c = await admin.connect();
		try {
			await c.query('BEGIN');
			await c.query('SET LOCAL ROLE authenticated');
			await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
			const r = await c.query(sql, values);
			await c.query('COMMIT');
			return r;
		} catch (e) {
			await c.query('ROLLBACK');
			throw e;
		} finally {
			c.release();
		}
	}
	async function admit(force = false, taskType = 'generate_agent_profile') {
		await ownerQuery("SELECT libri.manage_research_tasks($1,'create',$2::jsonb)", [
			library,
			JSON.stringify({
				type: taskType,
				bookId: book,
				title: 'Synthesize book',
				priority: 'high',
				idempotencyKey: randomUUID()
			})
		]);
		if (force)
			await admin.query(
				"UPDATE libri.research_tasks SET mode='force' WHERE library_id=$1 AND status='pending'",
				[library]
			);
		await ownerQuery("SELECT libri.admit_research_task_batch($1,$2,'round_now','{}')", [
			library,
			randomUUID()
		]);
	}
	async function claim(force = false): Promise<ClaimedLibriStep> {
		await admit(force);
		await createLibriTaskDispatcher(worker, lifecycle).dispatchPending(signal);
		const c = await lifecycle.claimNextStep({
			workerId: 'offline-synthesis',
			leaseDurationMs: 60000
		});
		if (!c || c.kind !== 'claimed') throw new Error('Expected claim');
		return c;
	}
	const provider = () => ({
		execute: vi.fn(async (input: BookAgentInput, model: string) => ({
			output: validateBookAgentResult(agentOutput, input),
			model,
			providerRequestId: `offline-${randomUUID()}`,
			costMicrousd: 20n,
			promptTokens: 10n,
			completionTokens: 5n
		}))
	});
	const processor = (p = provider()) =>
		createBookAgentProcessor(
			{ execution, ledger, provider: p },
			{ model: 'offline/agent', reservedMicrousd: 100n }
		);
	const prompts = async () =>
		(
			await admin.query(
				"SELECT id,content,model,version,is_current,status FROM libri.derived_artifacts WHERE artifact_type='agent_prompt' ORDER BY version"
			)
		).rows;
	async function manualPrompt() {
		const p = (await admin.query('SELECT id,updated_at::text FROM libri.agent_profiles'))
			.rows[0];
		const a = (
			await admin.query(
				"SELECT id,updated_at::text FROM libri.derived_artifacts WHERE agent_profile_id=$1 AND artifact_type='agent_prompt' AND is_current",
				[p.id]
			)
		).rows[0];
		return ownerQuery(
			"SELECT libri.edit_application_record($1,'agent_prompt',$2,$3,$4::jsonb)",
			[
				library,
				p.id,
				p.updated_at,
				JSON.stringify({
					agentPrompt: 'MANUAL: Preserve my editorial instructions.',
					expectedPromptId: a.id,
					expectedPromptUpdatedAt: a.updated_at
				})
			]
		);
	}
	it('scopes context by fenced task, excludes private notes and legacy analysis, and blocks raw access', async () => {
		await admin.query(
			"INSERT INTO libri.derived_artifacts(library_id,book_id,artifact_type,content,content_sha256,idempotency_key,structured_data) VALUES($1,$2,'book_analysis','PRIVATE LEGACY ANALYSIS',repeat('a',64),'legacy',$3)",
			[
				library,
				book,
				JSON.stringify({ overview: { elevatorPitch: 'PRIVATE LEGACY ANALYSIS' } })
			]
		);
		const c = await claim();
		const i = await execution.load(c);
		expect(i.snapshot.noteCount).toBe(1);
		expect(i.dataset.bookAnalysis).toBeNull();
		expect(JSON.stringify(i)).not.toContain('PRIVATE');
		await expect(execution.load({ ...c, leaseToken: randomUUID() })).rejects.toThrow();
		await expect(
			worker.query('SELECT libri.build_book_research_input($1,$2)', [library, book])
		).rejects.toThrow('permission denied');
		await expect(
			worker.query('SELECT libri.read_book_synthesis_input($1,$2,$3)', [
				c.stepId,
				c.executionGeneration,
				c.leaseToken
			])
		).rejects.toThrow('lease');
		await expect(worker.query('SELECT * FROM libri.notes')).rejects.toThrow(
			'permission denied'
		);
	});
	it('saves profile, prompt, deterministic briefing, charge and task completion atomically', async () => {
		const c = await claim();
		await processor().execute(c, signal);
		expect(await prompts()).toMatchObject([
			{ version: 1, is_current: true, status: 'generated', model: 'offline/agent' }
		]);
		const profile = (
			await admin.query('SELECT configuration,enabled_tools FROM libri.agent_profiles')
		).rows[0];
		expect(profile.configuration.agent_blueprint.tone).toBe('Clear');
		expect(profile.enabled_tools).toContain('getBookDetails');
		const doc = (
			await admin.query(
				"SELECT content,input_snapshot,model FROM libri.derived_artifacts WHERE artifact_type='agent_knowledge_doc'"
			)
		).rows[0];
		expect(doc.content).toContain('Shared practice note');
		expect(doc.content).not.toContain('PRIVATE SECRET');
		expect(doc.input_snapshot.notesVisibility).toBe('shared_link');
		expect(doc.model).toBe('deterministic');
		expect(
			(
				await admin.query(
					'SELECT (SELECT status FROM libri.research_tasks) task,(SELECT status FROM libri.research_steps) step,(SELECT status FROM public.queue_jobs) queue,(SELECT status FROM libri.research_runs) run,(SELECT status FROM libri.provider_cost_reservations) cost'
				)
			).rows[0]
		).toEqual({
			task: 'complete',
			step: 'completed',
			queue: 'completed',
			run: 'completed',
			cost: 'settled'
		});
	});
	it('reuses a current prompt for free, preserves manual prompts, and force adds a version without resetting settings', async () => {
		await processor().execute(await claim(), signal);
		const cached = provider();
		await processor(cached).execute(await claim(), signal);
		expect(cached.execute).not.toHaveBeenCalled();
		expect(await prompts()).toHaveLength(1);
		await manualPrompt();
		await admin.query(
			"UPDATE libri.agent_profiles SET primary_model='custom/model',is_active=false,enabled_tools=ARRAY['getBookDetails']"
		);
		await admin.query(
			"UPDATE libri.chapters SET summary='New practice evidence.' WHERE id=$1",
			[chapter]
		);
		const manual = provider();
		await processor(manual).execute(await claim(), signal);
		expect(manual.execute).not.toHaveBeenCalled();
		expect((await prompts()).at(-1)).toMatchObject({ model: 'manual', is_current: true });
		expect(
			(
				await admin.query(
					"SELECT content FROM libri.derived_artifacts WHERE artifact_type='agent_knowledge_doc' AND is_current"
				)
			).rows[0].content
		).toContain('New practice evidence');
		await processor().execute(await claim(true), signal);
		expect((await prompts()).at(-1)).toMatchObject({
			version: 3,
			model: 'offline/agent',
			is_current: true
		});
		expect(
			(
				await admin.query(
					'SELECT primary_model,is_active,enabled_tools FROM libri.agent_profiles'
				)
			).rows[0]
		).toEqual({
			primary_model: 'custom/model',
			is_active: false,
			enabled_tools: ['getBookDetails']
		});
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.provider_cost_reservations'))
				.rows[0].n
		).toBe(2);
	});
	it('preserves a newer manual prompt when a paid force generation finishes later', async () => {
		await processor().execute(await claim(), signal);
		const p = provider(),
			original = p.execute.getMockImplementation()!;
		p.execute.mockImplementation(async (i, m) => {
			await manualPrompt();
			return original(i, m);
		});
		await processor(p).execute(await claim(true), signal);
		expect(await prompts()).toMatchObject([
			{ version: 1, is_current: false },
			{ version: 2, is_current: true, model: 'manual' },
			{ version: 3, is_current: false, status: 'outdated' }
		]);
		expect(
			(
				await admin.query(
					'SELECT result FROM libri.research_steps ORDER BY created_at DESC LIMIT 1'
				)
			).rows[0].result.message
		).toContain('preserved the newer prompt');
		expect(
			(
				await admin.query(
					"SELECT count(*)::int n FROM libri.provider_cost_reservations WHERE status='settled'"
				)
			).rows[0].n
		).toBe(2);
	});
	it('database also preserves a manual prompt when an ordinary paid completion bypasses reuse', async () => {
		await processor().execute(await claim(), signal);
		await manualPrompt();
		const c = await claim();
		const input = await execution.load(c);
		const reservation = await ledger.reserveProviderCost({
			stepId: c.stepId,
			executionGeneration: c.executionGeneration,
			leaseToken: c.leaseToken,
			reservationKey: `book-agent:${book}`,
			provider: 'openrouter',
			model: 'offline/agent',
			reservedMicrousd: 100n
		});
		expect(await execution.authorize(c, reservation.reservationId!)).toBe(true);
		await execution.complete(
			c,
			reservation.reservationId!,
			input,
			await provider().execute(input, 'offline/agent'),
			'Offline deterministic briefing'
		);
		expect((await prompts()).filter((p) => p.is_current)).toMatchObject([
			{ model: 'manual', version: 2 }
		]);
		expect((await prompts()).at(-1)).toMatchObject({ is_current: false, status: 'outdated' });
	});

	it('rolls back all content when usage is invalid and leaves the attempt for reconciliation', async () => {
		const p = provider(),
			original = p.execute.getMockImplementation()!;
		p.execute.mockImplementation(async (i, m) => ({
			...(await original(i, m)),
			costMicrousd: -1n
		}));
		await expect(processor(p).execute(await claim(), signal)).rejects.toMatchObject({
			code: 'provider_reconciliation_required'
		});
		expect(await prompts()).toHaveLength(0);
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.agent_profiles')).rows[0].n
		).toBe(0);
		expect(
			(await admin.query('SELECT status FROM libri.provider_cost_reservations')).rows[0]
				.status
		).toBe('started');
	});
	it('marks generated prompt and briefing stale if source material changes during the call', async () => {
		const p = provider(),
			original = p.execute.getMockImplementation()!;
		p.execute.mockImplementation(async (i, m) => {
			await admin.query("UPDATE libri.chapters SET summary='New evidence' WHERE id=$1", [
				chapter
			]);
			return original(i, m);
		});
		await processor(p).execute(await claim(), signal);
		expect((await admin.query('SELECT status FROM libri.derived_artifacts')).rows).toEqual([
			{ status: 'outdated' },
			{ status: 'outdated' }
		]);
	});
	it('executes the agent task through the sustained runtime with the restricted worker role', async () => {
		const p = provider();
		await admit();
		const runtime = createLibriResearchRuntime({
			database: {
				researchReadiness: createLibriResearchReadiness(worker),
				tasks: createLibriTaskDispatcher(worker, lifecycle),
				synthesis: createBookSynthesisExecution(worker),
				bookAgent: execution,
				reserveProviderCost: (input) => ledger.reserveProviderCost(input),
				authorizeProviderCall: (input) => ledger.authorizeProviderCall(input),
				settleProviderCost: (input) => ledger.settleProviderCost(input),
				releaseProviderCost: (input) => ledger.releaseProviderCost(input),
				claimNextStep: (input) => lifecycle.claimNextStep(input),
				heartbeatStep: (input) => lifecycle.heartbeatStep(input),
				completeStep: (input) => lifecycle.completeStep(input),
				failStep: (input) => lifecycle.failStep(input),
				recoverStaleLeases: (input) => lifecycle.recoverStaleLeases(input)
			},
			config: {
				openRouterApiKey: 'offline',
				model: 'offline/agent',
				reservedMicrousd: 100n,
				maintenanceIntervalMs: 1000,
				consumer: {
					leaseDurationMs: 30000,
					workerTimeoutMs: 20000,
					heartbeatIntervalMs: 10000
				}
			},
			concurrency: 1,
			workerId: 'offline-agent',
			agentProvider: p
		});
		try {
			await runtime.start();
			await vi.waitFor(
				async () =>
					expect(
						(await admin.query('SELECT status FROM libri.research_tasks')).rows[0]
							.status
					).toBe('complete'),
				{ timeout: 5000 }
			);
		} finally {
			await runtime.stop();
		}
		expect(p.execute).toHaveBeenCalledOnce();
		expect(await prompts()).toHaveLength(1);
	});
});
