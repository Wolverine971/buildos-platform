import {
	createLibriResearchRuntime,
	createLibriResearchReadiness
} from '../src/workers/libri/researchRuntime';
import { createBookSynthesisExecution } from '../src/workers/libri/bookSynthesisExecution';
import { createBookAgentExecution } from '../src/workers/libri/bookAgentExecution';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLibriLifecycle, type ClaimedLibriStep } from '../src/workers/libri/lifecycle';
import { createChapterResearchExecution } from '../src/workers/libri/chapterResearchExecution';
import { createChapterResearchProcessor } from '../src/workers/libri/chapterResearchProcessor';
import {
	CHAPTER_RESEARCH_FIELDS,
	type ChapterResearchInput,
	type ChapterSearchEvidence
} from '../src/workers/libri/chapterResearch';
import { createLibriCostLedger } from '../src/workers/libri/costLedger';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';
import { createLibriResearchWorkflow } from '../src/workers/libri/researchWorkflow';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';
import { book, chapter } from './helpers/libriSynthesisFixture';
const available = ['initdb', 'pg_ctl', 'psql'].every(
	(cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
);
if (process.env.CI && !available) throw new Error('Book research actions require PostgreSQL in CI');
const owner = 'f1000000-0000-4000-8000-000000000001';
describe.skipIf(!available)('fenced chapter research execution', () => {
	let dir = '',
		started = false,
		admin: Pool,
		worker: Pool,
		library: string;
	const closers: Array<() => Promise<void>> = [];
	beforeAll(async () => {
		dir = mkdtempSync('/tmp/libri-chapter-research-pg-');
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
			`-k ${dir} -p 57507 -c listen_addresses=''`,
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
			'57507',
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve('../../supabase/tests/20261004042543_libri_chapter_research_execution.test.sql')
		]);
		admin = new Pool({
			host: dir,
			port: 57507,
			database: 'postgres',
			user: 'postgres',
			max: 2
		});
		worker = new Pool({
			host: dir,
			port: 57507,
			database: 'postgres',
			user: 'libri_worker',
			max: 2
		});
		closers.push(trackPoolDisconnections(admin), trackPoolDisconnections(worker));
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
			"INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd) VALUES($1,true,ARRAY['find_book_info'],1000,10000)",
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

	const signal = new AbortController().signal;
	const lifecycle = () => createLibriLifecycle(worker);
	const workflow = () => createLibriResearchWorkflow(worker, lifecycle());

	async function next(): Promise<ClaimedLibriStep> {
		const c = await lifecycle().claimNextStep({
			workerId: 'offline-workflow',
			leaseDurationMs: 60000,
			taskTypes: ['find_book_info']
		});
		if (!c || c.kind !== 'claimed') throw new Error('Expected claim');
		return c;
	}
	async function root() {
		await ownerQuery("SELECT libri.manage_research_tasks($1,'create',$2::jsonb)", [
			library,
			JSON.stringify({
				type: 'find_book_info',
				bookId: book,
				title: 'Research chapters',
				priority: 'high',
				idempotencyKey: randomUUID()
			})
		]);
		await ownerQuery("SELECT libri.admit_research_task_batch($1,$2,'round_now','{}')", [
			library,
			randomUUID()
		]);
		await createLibriTaskDispatcher(worker, lifecycle()).dispatchPending(signal);
		return next();
	}
	const state = async () =>
		(
			await admin.query(`SELECT
  (SELECT status FROM libri.research_tasks LIMIT 1) task,
  (SELECT status FROM libri.research_steps WHERE parent_step_id IS NULL LIMIT 1) parent,
  (SELECT status FROM libri.research_runs LIMIT 1) run,
  (SELECT planned_steps FROM libri.research_runs LIMIT 1) planned,
  (SELECT completed_steps FROM libri.research_runs LIMIT 1) completed,
  (SELECT failed_steps FROM libri.research_runs LIMIT 1) failed,
  (SELECT count(*)::int FROM libri.research_steps) steps`)
		).rows[0];

	const evidence: ChapterSearchEvidence = {
		query: 'Offline book chapter',
		answer: null,
		results: [
			{
				url: 'https://example.invalid/chapter',
				title: 'Offline chapter source',
				content: 'Chapter evidence supports deliberate practice and reflection.'
			}
		],
		credits: 2,
		creditMicrousd: '10',
		costBasis: 'configured_credit_rate',
		truncated: false
	};
	const fields = Object.fromEntries(
		CHAPTER_RESEARCH_FIELDS.map((f) => [
			f,
			['summary', 'coreArgument'].includes(f) ? 'Grounded practice summary.' : ['Practice']
		])
	) as ChapterResearchInput['dataset']['chapter']['fields'];
	const usage = {
		model: 'offline/chapter',
		providerRequestId: 'offline-request',
		costMicrousd: 30n,
		promptTokens: 10n,
		completionTokens: 5n
	};
	const execution = () => createChapterResearchExecution(worker, lifecycle());
	const processor = (
		hooks: {
			search?: (input: ChapterResearchInput) => Promise<void>;
			extract?: (input: ChapterResearchInput) => Promise<void>;
			empty?: boolean;
		} = {}
	) =>
		createChapterResearchProcessor(
			{
				execution: execution(),
				ledger: createLibriCostLedger(worker),
				search: {
					execute: async (input) => {
						await hooks.search?.(input);
						return {
							...usage,
							provider: 'tavily',
							model: 'advanced',
							costMicrousd: 20n,
							output: { ...evidence, results: hooks.empty ? [] : evidence.results }
						};
					}
				},
				extract: {
					execute: async (input) => {
						await hooks.extract?.(input);
						return {
							...usage,
							output: {
								status: 'complete',
								fields,
								sourceUrls: [evidence.results[0].url],
								confidence: 0.8,
								notes: 'Offline grounded result.'
							}
						};
					}
				}
			},
			{
				model: 'offline/chapter',
				searchReservedMicrousd: 20n,
				extractionReservedMicrousd: 100n
			}
		);
	async function executeNext(p = processor()) {
		await workflow().dispatch(signal);
		const c = await next();
		await p.execute(c, signal);
		return c;
	}
	it('saves search evidence, fills only missing fields, and settles separate provider costs atomically', async () => {
		const p = processor({
			search: async (input) => {
				expect(JSON.stringify(input)).not.toContain('PRIVATE SECRET NOTE');
				expect(input.dataset.requestedFields).not.toContain('summary');
			}
		});
		await p.execute(await root(), signal);
		await executeNext(p);
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.chapter_research_evidence'))
				.rows[0].n
		).toBe(1);
		await executeNext(p);
		await workflow().reconcile(signal);
		const chapterRow = (
			await admin.query(
				'SELECT summary,research_status,enrichment_payload,research_payload FROM libri.chapters WHERE id=$1',
				[chapter]
			)
		).rows[0];
		expect(chapterRow).toMatchObject({
			summary: 'Deliberate practice supports learning.',
			research_status: 'complete',
			enrichment_payload: {
				topics: ['Practice'],
				coreArgument: 'Grounded practice summary.'
			},
			research_payload: {
				researchOutline: ['Practice'],
				researchSourceUrls: ['https://example.invalid/chapter']
			}
		});
		expect(await state()).toMatchObject({
			task: 'complete',
			parent: 'completed',
			completed: 3
		});
		expect(
			(
				await admin.query(
					'SELECT provider,status,actual_cost_microusd::text cost FROM libri.provider_cost_reservations ORDER BY provider'
				)
			).rows
		).toEqual([
			{ provider: 'openrouter', status: 'settled', cost: '30' },
			{ provider: 'tavily', status: 'settled', cost: '20' }
		]);
	});
	it('does not overwrite a chapter edited after the model starts; stores a review candidate and settles cost', async () => {
		await processor().execute(await root(), signal);
		await executeNext();
		await executeNext(
			processor({
				extract: async () => {
					await admin.query(
						"UPDATE libri.chapters SET summary='New manual edit' WHERE id=$1",
						[chapter]
					);
				}
			})
		);
		await workflow().reconcile(signal);
		expect((await admin.query('SELECT summary FROM libri.chapters')).rows[0].summary).toBe(
			'New manual edit'
		);
		expect(
			(
				await admin.query(
					'SELECT status,is_current FROM libri.derived_artifacts WHERE chapter_id=$1',
					[chapter]
				)
			).rows[0]
		).toEqual({ status: 'outdated', is_current: false });
		expect(await state()).toMatchObject({ task: 'blocked', parent: 'needs_review' });
	});
	it('uses no model call when search found no evidence', async () => {
		let calls = 0;
		const p = processor({
			empty: true,
			extract: async () => {
				calls++;
			}
		});
		await p.execute(await root(), signal);
		await executeNext(p);
		await executeNext(p);
		await workflow().reconcile(signal);
		expect(calls).toBe(0);
		expect(await state()).toMatchObject({ parent: 'needs_review', task: 'blocked' });
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.provider_cost_reservations'))
				.rows[0].n
		).toBe(1);
	});
	it('does not call extraction after metadata changes between stages', async () => {
		let calls = 0;
		const p = processor({
			extract: async () => {
				calls++;
			}
		});
		await p.execute(await root(), signal);
		await executeNext(p);
		await admin.query("UPDATE libri.chapters SET title='Changed title' WHERE id=$1", [chapter]);
		await executeNext(p);
		await workflow().reconcile(signal);
		expect(calls).toBe(0);
		expect(await state()).toMatchObject({ parent: 'needs_review' });
	});
	it('rejects citations outside the exact saved results and rolls back artifact, chapter and cost writes', async () => {
		await processor().execute(await root(), signal);
		await executeNext();
		await workflow().dispatch(signal);
		const c = await next(),
			input = await execution().load(c),
			ledger = createLibriCostLedger(worker);
		const receipt = await ledger.reserveProviderCost({
			stepId: c.stepId,
			executionGeneration: c.executionGeneration,
			leaseToken: c.leaseToken,
			reservationKey: `chapter-extract:${chapter}`,
			provider: 'openrouter',
			model: 'offline/chapter',
			reservedMicrousd: 100n
		});
		if (!receipt.reservationId) throw new Error('Expected reservation');
		await execution().authorize(c, receipt.reservationId, input.fingerprint);
		await expect(
			execution().saveExtraction(c, receipt.reservationId, input, {
				...usage,
				output: {
					status: 'complete',
					fields,
					sourceUrls: ['https://example.invalid/invented'],
					confidence: 0.9,
					notes: ''
				}
			})
		).rejects.toThrow('citation');
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.derived_artifacts')).rows[0].n
		).toBe(0);
		expect(
			(
				await admin.query(
					'SELECT status FROM libri.provider_cost_reservations WHERE id=$1',
					[receipt.reservationId]
				)
			).rows[0].status
		).toBe('started');
	});
	it('runs the full admitted chapter workflow through the sustained worker with a fresh maintenance cycle between stages', async () => {
		await ownerQuery("SELECT libri.manage_research_tasks($1,'create',$2::jsonb)", [
			library,
			JSON.stringify({
				type: 'find_book_info',
				bookId: book,
				title: 'Research chapters',
				priority: 'high',
				idempotencyKey: randomUUID()
			})
		]);
		await ownerQuery("SELECT libri.admit_research_task_batch($1,$2,'round_now','{}')", [
			library,
			randomUUID()
		]);
		const life = lifecycle(),
			ledger = createLibriCostLedger(worker),
			calls: string[] = [];
		const runtime = createLibriResearchRuntime({
			database: {
				researchReadiness: createLibriResearchReadiness(worker),
				tasks: createLibriTaskDispatcher(worker, life),
				synthesis: createBookSynthesisExecution(worker),
				bookAgent: createBookAgentExecution(worker),
				chapterResearch: execution(),
				workflow: workflow(),
				reserveProviderCost: (i) => ledger.reserveProviderCost(i),
				authorizeProviderCall: (i) => ledger.authorizeProviderCall(i),
				settleProviderCost: (i) => ledger.settleProviderCost(i),
				releaseProviderCost: (i) => ledger.releaseProviderCost(i),
				claimNextStep: (i) => life.claimNextStep(i),
				heartbeatStep: (i) => life.heartbeatStep(i),
				completeStep: (i) => life.completeStep(i),
				failStep: (i) => life.failStep(i),
				recoverStaleLeases: (i) => life.recoverStaleLeases(i)
			},
			config: {
				openRouterApiKey: 'offline',
				model: 'offline/chapter',
				reservedMicrousd: 100n,
				chapter: { tavilyApiKey: 'offline', creditMicrousd: 10n },
				maintenanceIntervalMs: 1000,
				consumer: {
					workerTimeoutMs: 20000,
					leaseDurationMs: 30000,
					heartbeatIntervalMs: 10000
				}
			},
			concurrency: 1,
			workerId: 'offline-chapter-runtime',
			chapterSearchProvider: {
				execute: async () => {
					calls.push('search');
					return {
						...usage,
						provider: 'tavily',
						model: 'advanced',
						costMicrousd: 20n,
						promptTokens: 0n,
						completionTokens: 0n,
						output: evidence
					};
				}
			},
			chapterExtractionProvider: {
				execute: async () => {
					calls.push('extract');
					return {
						...usage,
						output: {
							status: 'complete',
							fields,
							sourceUrls: [evidence.results[0].url],
							confidence: 0.8,
							notes: ''
						}
					};
				}
			}
		});
		try {
			await runtime.start();
			const deadline = Date.now() + 10000;
			while ((await state()).task !== 'complete' && Date.now() < deadline) {
				await runtime.wake();
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect(await state()).toMatchObject({
				task: 'complete',
				run: 'completed',
				completed: 3
			});
			expect(calls).toEqual(['search', 'extract']);
			expect(runtime.getHealth().failedJobs).toBe(0);
		} finally {
			await runtime.stop();
		}
		const context = (
			await admin.query('SELECT libri.build_book_research_input($1,$2) input', [
				library,
				book
			])
		).rows[0].input;
		expect(context.dataset.chapters[0].topics).toEqual(['Practice']);
		expect(context.dataset.chapters[0].keyConcepts).toEqual(['Practice']);
	}, 15000);
	it('preserves the original forced chapter-details action and durable replay receipt', async () => {
		const key = randomUUID();
		const enqueue = () =>
			ownerQuery(
				"SELECT libri.enqueue_book_research($1,$2,$3,'chapter_details','force') receipt",
				[library, key, book]
			);
		const receipt = (await enqueue()).rows[0].receipt;
		expect(receipt).toMatchObject({
			taskType: 'find_book_info',
			selectedCount: 1,
			queued: true
		});
		await createLibriTaskDispatcher(worker, lifecycle()).dispatchPending(signal);
		const p = processor();
		await p.execute(await next(), signal);
		await executeNext(p);
		await executeNext(p);
		await workflow().reconcile(signal);
		expect((await admin.query('SELECT summary FROM libri.chapters')).rows[0].summary).toBe(
			'Grounded practice summary.'
		);
		expect((await enqueue()).rows[0].receipt).toMatchObject({ ...receipt, deduped: true });
		expect(
			(await admin.query('SELECT count(*)::int n FROM libri.research_tasks')).rows[0].n
		).toBe(1);
	});
});
