import {
	type BookAgentProvider,
	createBookAgentProcessor,
	createBookAgentProvider
} from './bookAgentProfile';
import { LibriMaintenanceProcessorError } from './maintenanceConsumer';
import type { LibriResearchRuntimeConfig } from '../../config/libriWorkerProfile';
import type { LibriDatabasePort, LibriPgPool } from './database';
import {
	type SynthesisProvider,
	createBookSynthesisProcessor,
	createBookSynthesisProvider
} from './bookSynthesis';
import {
	LibriMaintenanceConsumer,
	type LibriMaintenanceConsumerHealth
} from './maintenanceConsumer';

export const LIBRI_RESEARCH_TASK_TYPES = ['synthesize_book', 'generate_agent_profile'] as const;

/** Read-only readiness check. It neither changes controls nor admits work. */
export function createLibriResearchReadiness(database: Pick<LibriPgPool, 'query'>) {
	return {
		async assertReady(reservedMicrousd: bigint): Promise<void> {
			const result = await database.query<{ ready: boolean }>(
				`
			 SELECT
			  coalesce(has_function_privilege(current_user, to_regprocedure('libri.read_book_synthesis_input(uuid,integer,uuid)'), 'EXECUTE'), false)
			  AND coalesce(has_function_privilege(current_user, to_regprocedure('libri.persist_book_synthesis_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,bigint,bigint,bigint,text)'), 'EXECUTE'), false)
			  AND coalesce(has_function_privilege(current_user,to_regprocedure('libri.read_book_agent_input(uuid,integer,uuid)'), 'EXECUTE'),false)
			  AND coalesce(has_function_privilege(current_user,to_regprocedure('libri.persist_book_agent_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint,bigint,bigint,text)'), 'EXECUTE'),false)
			  AND NOT EXISTS (
			   SELECT 1 FROM libri.research_queue_controls
			   WHERE dispatch_enabled AND (NOT supported_task_types <@ $1::text[] OR task_budget_microusd < $2::bigint)
			  ) AS ready`,
				[LIBRI_RESEARCH_TASK_TYPES, reservedMicrousd.toString()]
			);
			if (result.rows.length !== 1 || result.rows[0].ready !== true) {
				throw new Error(
					'Libri research capabilities, enabled processors or budgets are not ready'
				);
			}
		}
	};
}

type RuntimeConsumer = Pick<LibriMaintenanceConsumer, 'start' | 'stop' | 'wake' | 'getHealth'>;
type RuntimeOptions = {
	consumer: RuntimeConsumer;
	assertReady: () => Promise<void>;
	dispatch: (signal: AbortSignal) => Promise<unknown>;
	recover: () => Promise<unknown>;
	maintenanceIntervalMs: number;
};

/** One owned loop for outbox/recovery plus the existing bounded claim/heartbeat
 * consumer. Stop aborts dispatch, waits for in-flight database work, and drains
 * claims before the bootstrap closes the pool. Errors expose no database text. */
export class LibriResearchRuntime {
	private state: LibriMaintenanceConsumerHealth['state'] = 'idle';
	private readonly controller = new AbortController();
	private timer: NodeJS.Timeout | null = null;
	private startPromise: Promise<void> | null = null;
	private tickPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private maintenanceFailed = false;

	constructor(private readonly options: RuntimeOptions) {
		if (
			!Number.isInteger(options.maintenanceIntervalMs) ||
			options.maintenanceIntervalMs < 1000 ||
			options.maintenanceIntervalMs > 60000
		) {
			throw new Error('Research maintenance interval must be 1000 to 60000 milliseconds');
		}
	}

	start(): Promise<void> {
		if (this.startPromise || this.state !== 'idle')
			return Promise.reject(new Error('Research runtime already started or stopped'));
		this.startPromise = this.startRuntime();
		return this.startPromise;
	}

	private async startRuntime(): Promise<void> {
		try {
			await this.cycle();
			if (this.controller.signal.aborted) return;
			await this.options.consumer.start();
			if (this.controller.signal.aborted) return;
			this.state = 'running';
			this.schedule();
		} catch (error) {
			if (this.controller.signal.aborted) return;
			this.state = 'failed';
			throw error;
		}
	}

	wake(): Promise<void> {
		if (this.state !== 'running') return Promise.resolve();
		if (this.tickPromise) return this.tickPromise;
		this.clearTimer();
		this.tickPromise = this.cycle()
			.then(async () => {
				this.maintenanceFailed = false;
				if (!this.controller.signal.aborted) await this.options.consumer.wake();
			})
			.catch(() => {
				if (!this.controller.signal.aborted) this.maintenanceFailed = true;
			})
			.finally(() => {
				this.tickPromise = null;
				this.schedule();
			});
		return this.tickPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.state = 'stopping';
		this.controller.abort();
		this.clearTimer();
		// Begin draining immediately, including a provider currently in progress.
		const drain = this.options.consumer.stop();
		this.stopPromise = Promise.allSettled([this.startPromise, this.tickPromise, drain]).then(
			(results) => {
				this.state = 'stopped';
				const failure = results.find((result) => result.status === 'rejected');
				if (failure?.status === 'rejected') throw failure.reason;
			}
		);
		return this.stopPromise;
	}

	getHealth(): LibriMaintenanceConsumerHealth {
		const consumer = this.options.consumer.getHealth();
		return {
			...consumer,
			state: this.state,
			healthy: this.state === 'running' && !this.maintenanceFailed && consumer.healthy,
			...(this.state !== 'running'
				? { reason: `research_${this.state}` }
				: this.maintenanceFailed
					? { reason: 'research_maintenance_failed' }
					: {})
		};
	}

	private async cycle(): Promise<void> {
		this.controller.signal.throwIfAborted();
		await this.options.assertReady();
		this.controller.signal.throwIfAborted();
		await this.options.recover();
		this.controller.signal.throwIfAborted();
		await this.options.dispatch(this.controller.signal);
	}

	private schedule(): void {
		if (this.state !== 'running' || this.controller.signal.aborted) return;
		this.clearTimer();
		this.timer = setTimeout(() => void this.wake(), this.options.maintenanceIntervalMs);
		this.timer.unref();
	}
	private clearTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}

export function createLibriResearchRuntime(options: {
	database: Pick<
		LibriDatabasePort,
		| 'researchReadiness'
		| 'tasks'
		| 'synthesis'
		| 'bookAgent'
		| 'reserveProviderCost'
		| 'authorizeProviderCall'
		| 'settleProviderCost'
		| 'releaseProviderCost'
		| 'claimNextStep'
		| 'heartbeatStep'
		| 'completeStep'
		| 'failStep'
		| 'recoverStaleLeases'
	>;
	config: LibriResearchRuntimeConfig;
	concurrency: number;
	workerId: string;
	/** Offline verification can provide a deterministic, free provider. */
	provider?: SynthesisProvider;
	agentProvider?: BookAgentProvider;
}): LibriResearchRuntime {
	const { database, config } = options;
	const assertReady = () => database.researchReadiness.assertReady(config.reservedMicrousd);
	const synthesis = createBookSynthesisProcessor(
		{
			execution: database.synthesis,
			ledger: database,
			provider:
				options.provider ??
				createBookSynthesisProvider({
					apiKey: config.openRouterApiKey,
					allowedModels: [config.model]
				})
		},
		{ model: config.model, reservedMicrousd: config.reservedMicrousd }
	);
	const bookAgent = createBookAgentProcessor(
		{
			execution: database.bookAgent,
			ledger: database,
			provider:
				options.agentProvider ??
				createBookAgentProvider({
					apiKey: config.openRouterApiKey,
					allowedModels: [config.model]
				})
		},
		{ model: config.model, reservedMicrousd: config.reservedMicrousd }
	);

	const consumer = new LibriMaintenanceConsumer({
		lifecycle: {
			claimNextStep: async (input) => {
				await assertReady();
				return database.claimNextStep(input);
			},
			heartbeatStep: (input) => database.heartbeatStep(input),
			completeStep: (input) => database.completeStep(input),
			failStep: (input) => database.failStep(input)
		},
		processor: {
			execute(claim, signal) {
				if (claim.payload.taskType === 'synthesize_book')
					return synthesis.execute(claim, signal);
				if (claim.payload.taskType === 'generate_agent_profile')
					return bookAgent.execute(claim, signal);
				throw new LibriMaintenanceProcessorError(
					'unsupported_research_task',
					'Research processor unavailable',
					false
				);
			}
		},
		workerId: options.workerId,
		config: { concurrency: options.concurrency, ...config.consumer },
		claimQueueTypes: ['libri_research'],
		claimTaskTypes: LIBRI_RESEARCH_TASK_TYPES,
		processorManagesCompletion: true
	});
	return new LibriResearchRuntime({
		consumer,
		assertReady,
		recover: () => database.recoverStaleLeases({ limit: 10, queueTypes: ['libri_research'] }),
		dispatch: (signal) => database.tasks.dispatchPending(signal, 5),
		maintenanceIntervalMs: config.maintenanceIntervalMs
	});
}
