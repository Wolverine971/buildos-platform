import type {
	ClaimedLibriStep,
	CompleteLibriStepInput,
	FailLibriStepInput,
	LibriLifecyclePort
} from './lifecycle';

const MAINTENANCE_QUEUE_TYPES = ['libri_maintenance'] as const;

export const DEFAULT_LIBRI_MAINTENANCE_CONSUMER_CONFIG = {
	concurrency: 1,
	pollIntervalMs: 1_000,
	leaseDurationMs: 30_000,
	heartbeatIntervalMs: 10_000,
	workerTimeoutMs: 20_000
} as const;

export type LibriMaintenanceConsumerConfig = {
	[key in keyof typeof DEFAULT_LIBRI_MAINTENANCE_CONSUMER_CONFIG]: number;
};

export type LibriMaintenanceExecutionResult = Pick<
	CompleteLibriStepInput,
	'result' | 'provider' | 'model' | 'promptTokens' | 'completionTokens' | 'estimatedCostMicrousd'
>;

export type LibriMaintenanceProcessorPort = {
	execute(claim: ClaimedLibriStep, signal: AbortSignal): Promise<LibriMaintenanceExecutionResult>;
};

export type LibriMaintenanceConsumerState = 'idle' | 'running' | 'stopping' | 'stopped' | 'failed';

export type LibriMaintenanceConsumerHealth = {
	healthy: boolean;
	state: LibriMaintenanceConsumerState;
	reason?: string;
	activeJobs: number;
	availableConcurrency: number;
	concurrency: number;
	lastSuccessfulClaimAt: string | null;
	consecutiveClaimFailures: number;
	completedJobs: number;
	failedJobs: number;
	staleOwnershipJobs: number;
	quarantinedJobs: number;
};

type LibriMaintenanceLifecyclePort = Pick<
	LibriLifecyclePort,
	'claimNextStep' | 'heartbeatStep' | 'completeStep' | 'failStep'
>;

export type LibriMaintenanceConsumerOptions = {
	lifecycle: LibriMaintenanceLifecyclePort;
	processor: LibriMaintenanceProcessorPort;
	workerId: string;
	config?: Partial<LibriMaintenanceConsumerConfig>;
	claimStepIds?: readonly string[];
	claimDeadlineMs?: number;
};

export class LibriMaintenanceProcessorError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly retryable: boolean
	) {
		super(message);
		this.name = 'LibriMaintenanceProcessorError';
	}
}

export function createSyntheticLibriMaintenanceProcessor(): LibriMaintenanceProcessorPort {
	return {
		execute(claim, signal) {
			return Promise.resolve().then(() => {
				if (signal.aborted) throw abortedError();
				if (claim.queueType !== 'libri_maintenance') {
					throw new LibriMaintenanceProcessorError(
						'unsupported_queue_type',
						`Synthetic maintenance cannot process ${claim.queueType}`,
						false
					);
				}
				const payload = parseSyntheticMaintenancePayload(claim.payload);
				return {
					result: {
						kind: payload.kind,
						version: payload.version,
						ok: true,
						...(payload.nonce ? { nonce: payload.nonce } : {})
					},
					provider: 'synthetic',
					model: 'none',
					promptTokens: 0,
					completionTokens: 0,
					estimatedCostMicrousd: 0
				};
			});
		}
	};
}

export class LibriMaintenanceConsumer {
	private readonly config: LibriMaintenanceConsumerConfig;
	private state: LibriMaintenanceConsumerState = 'idle';
	private timer: NodeJS.Timeout | null = null;
	private pollPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;
	private readonly active = new Set<Promise<void>>();
	private readonly controllers = new Set<AbortController>();
	private lastSuccessfulClaimAtMs: number | null = null;
	private consecutiveClaimFailures = 0;
	private lastError: string | null = null;
	private completedJobs = 0;
	private failedJobs = 0;
	private staleOwnershipJobs = 0;
	private quarantinedJobs = 0;

	constructor(private readonly options: LibriMaintenanceConsumerOptions) {
		this.config = {
			...DEFAULT_LIBRI_MAINTENANCE_CONSUMER_CONFIG,
			...options.config
		};
		validateConsumerConfig(this.config);
		if (!options.workerId.trim() || options.workerId.length > 200) {
			throw new Error('Libri maintenance workerId must contain 1 to 200 characters');
		}
		if (
			options.claimDeadlineMs !== undefined &&
			(!Number.isSafeInteger(options.claimDeadlineMs) || options.claimDeadlineMs < 1)
		) {
			throw new Error('Libri maintenance claim deadline must be a positive timestamp');
		}
	}

	start(): Promise<void> {
		if (this.state !== 'idle') {
			return Promise.reject(
				new Error(`Libri maintenance consumer cannot start from ${this.state}`)
			);
		}
		this.state = 'running';
		this.schedulePoll(0);
		return Promise.resolve();
	}

	wake(): Promise<void> {
		if (this.state !== 'running') return Promise.resolve();
		this.clearTimer();
		return this.pollNow();
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopRuntime();
		return this.stopPromise;
	}

	getHealth(): LibriMaintenanceConsumerHealth {
		const operational = {
			activeJobs: this.active.size,
			availableConcurrency: Math.max(0, this.config.concurrency - this.active.size),
			concurrency: this.config.concurrency,
			lastSuccessfulClaimAt: this.lastSuccessfulClaimAtMs
				? new Date(this.lastSuccessfulClaimAtMs).toISOString()
				: null,
			consecutiveClaimFailures: this.consecutiveClaimFailures,
			completedJobs: this.completedJobs,
			failedJobs: this.failedJobs,
			staleOwnershipJobs: this.staleOwnershipJobs,
			quarantinedJobs: this.quarantinedJobs
		};
		if (this.state === 'running' && this.consecutiveClaimFailures === 0) {
			return { healthy: true, state: this.state, ...operational };
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return { healthy: true, state: this.state, reason: this.state, ...operational };
		}
		return {
			healthy: false,
			state: this.state,
			reason: this.lastError ?? `consumer_${this.state}`,
			...operational
		};
	}

	private pollNow(): Promise<void> {
		if (this.pollPromise) return this.pollPromise;
		if (this.state !== 'running') return Promise.resolve();
		const poll = this.poll().finally(() => {
			if (this.pollPromise === poll) this.pollPromise = null;
			if (this.state === 'running') this.schedulePoll(this.config.pollIntervalMs);
		});
		this.pollPromise = poll;
		return poll;
	}

	private async poll(): Promise<void> {
		if (this.claimWindowExpired()) return;
		let inspected = 0;
		const inspectionLimit = Math.max(4, this.config.concurrency * 4);
		try {
			while (
				this.state === 'running' &&
				this.active.size < this.config.concurrency &&
				inspected < inspectionLimit
			) {
				inspected += 1;
				const receipt = await this.options.lifecycle.claimNextStep({
					workerId: this.options.workerId,
					leaseDurationMs: this.config.leaseDurationMs,
					queueTypes: MAINTENANCE_QUEUE_TYPES,
					...(this.options.claimStepIds ? { stepIds: this.options.claimStepIds } : {})
				});
				this.consecutiveClaimFailures = 0;
				this.lastError = null;
				if (!receipt) break;
				if (this.claimWindowExpired()) {
					if (receipt.kind === 'quarantined') this.quarantinedJobs += 1;
					else this.startClaim(receipt, true);
					break;
				}
				if (receipt.kind === 'quarantined') {
					this.quarantinedJobs += 1;
					continue;
				}
				this.lastSuccessfulClaimAtMs = Date.now();
				this.startClaim(receipt, this.state !== 'running');
				if (this.state !== 'running') break;
			}
		} catch (error) {
			this.consecutiveClaimFailures += 1;
			this.lastError = canonicalErrorCode(error, 'claim_failed');
		}
	}

	private startClaim(claim: ClaimedLibriStep, abortImmediately: boolean = false): void {
		const controller = new AbortController();
		this.controllers.add(controller);
		if (abortImmediately) controller.abort();
		let execution: Promise<void>;
		execution = this.executeClaim(claim, controller)
			.catch((error) => {
				this.lastError = canonicalErrorCode(error, 'execution_lifecycle_failed');
				this.state = 'failed';
				this.clearTimer();
			})
			.finally(() => {
				this.controllers.delete(controller);
				this.active.delete(execution);
				if (this.state === 'running') void this.wake();
			});
		this.active.add(execution);
	}

	private async executeClaim(
		claim: ClaimedLibriStep,
		controller: AbortController
	): Promise<void> {
		let ownershipLost = false;
		let heartbeatPromise: Promise<void> | null = null;
		const heartbeat = () => {
			if (heartbeatPromise || controller.signal.aborted) return;
			heartbeatPromise = this.options.lifecycle
				.heartbeatStep({
					...ownership(claim),
					workerId: this.options.workerId,
					leaseDurationMs: this.config.leaseDurationMs
				})
				.then((accepted) => {
					if (!accepted) {
						ownershipLost = true;
						controller.abort();
					}
				})
				.catch(() => {
					ownershipLost = true;
					controller.abort();
				})
				.finally(() => {
					heartbeatPromise = null;
				});
		};
		const heartbeatTimer = setInterval(heartbeat, this.config.heartbeatIntervalMs);
		heartbeatTimer.unref();
		const workerTimeout = setTimeout(() => controller.abort(), this.config.workerTimeoutMs);
		workerTimeout.unref();

		try {
			const executionResult = await this.options.processor.execute(claim, controller.signal);
			clearInterval(heartbeatTimer);
			clearTimeout(workerTimeout);
			if (controller.signal.aborted) throw abortedError();
			if (heartbeatPromise) await heartbeatPromise;
			if (ownershipLost) {
				this.staleOwnershipJobs += 1;
				return;
			}
			const completed = await this.options.lifecycle.completeStep({
				...ownership(claim),
				...executionResult
			});
			if (completed) this.completedJobs += 1;
			else this.staleOwnershipJobs += 1;
		} catch (error) {
			clearInterval(heartbeatTimer);
			clearTimeout(workerTimeout);
			if (heartbeatPromise) await heartbeatPromise;
			if (ownershipLost) {
				this.staleOwnershipJobs += 1;
				return;
			}
			const failure = classifyFailure(error, controller.signal.aborted);
			const receipt = await this.options.lifecycle.failStep({
				...ownership(claim),
				errorClass: failure.errorClass,
				errorMessage: failure.errorMessage,
				retry: failure.retry,
				...(failure.retryDelayMs === undefined
					? {}
					: { retryDelayMs: failure.retryDelayMs })
			});
			if (receipt.accepted) this.failedJobs += 1;
			else this.staleOwnershipJobs += 1;
		} finally {
			clearInterval(heartbeatTimer);
			clearTimeout(workerTimeout);
		}
	}

	private async stopRuntime(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'idle') {
			this.state = 'stopped';
			return;
		}
		const failedBeforeStop = this.state === 'failed';
		this.state = 'stopping';
		this.clearTimer();
		for (const controller of this.controllers) controller.abort();
		await this.pollPromise?.catch(() => undefined);
		await Promise.allSettled([...this.active]);
		if (failedBeforeStop || this.hasFailed()) {
			this.state = 'failed';
			throw new Error(this.lastError ?? 'Libri maintenance consumer drain failed');
		}
		this.state = 'stopped';
	}

	private hasFailed(): boolean {
		return this.state === 'failed';
	}

	private schedulePoll(delayMs: number): void {
		if (this.state !== 'running' || this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.pollNow();
		}, delayMs);
		this.timer.unref();
	}

	private clearTimer(): void {
		if (!this.timer) return;
		clearTimeout(this.timer);
		this.timer = null;
	}

	private claimWindowExpired(): boolean {
		if (
			this.options.claimDeadlineMs === undefined ||
			Date.now() < this.options.claimDeadlineMs
		) {
			return false;
		}
		this.lastError = 'synthetic_canary_expired';
		this.state = 'failed';
		this.clearTimer();
		return true;
	}
}

function parseSyntheticMaintenancePayload(payload: Record<string, unknown>): {
	version: 1;
	kind: 'synthetic_smoke';
	nonce?: string;
} {
	const unexpectedKeys = Object.keys(payload).filter(
		(key) => !['version', 'kind', 'nonce'].includes(key)
	);
	if (unexpectedKeys.length > 0) {
		throw new LibriMaintenanceProcessorError(
			'invalid_payload',
			'Synthetic maintenance payload contains unsupported fields',
			false
		);
	}
	if (payload.version !== 1 || payload.kind !== 'synthetic_smoke') {
		throw new LibriMaintenanceProcessorError(
			'unsupported_payload',
			'Synthetic maintenance requires payload version 1 and kind synthetic_smoke',
			false
		);
	}
	const nonce = payload.nonce;
	if (
		nonce !== undefined &&
		(typeof nonce !== 'string' || nonce.trim().length < 1 || nonce.length > 120)
	) {
		throw new LibriMaintenanceProcessorError(
			'invalid_payload',
			'Synthetic maintenance nonce must contain 1 to 120 characters',
			false
		);
	}
	return { version: 1, kind: 'synthetic_smoke', ...(nonce ? { nonce } : {}) };
}

function ownership(claim: ClaimedLibriStep) {
	return {
		queueRowId: claim.queueRowId,
		stepId: claim.stepId,
		processingToken: claim.processingToken,
		leaseToken: claim.leaseToken,
		executionGeneration: claim.executionGeneration
	};
}

function classifyFailure(
	error: unknown,
	aborted: boolean
): Pick<FailLibriStepInput, 'errorClass' | 'errorMessage' | 'retry' | 'retryDelayMs'> {
	if (aborted) {
		return {
			errorClass: 'worker_interrupted',
			errorMessage: 'Libri maintenance execution was interrupted',
			retry: true,
			retryDelayMs: 0
		};
	}
	if (error instanceof LibriMaintenanceProcessorError) {
		return {
			errorClass: error.code,
			errorMessage: error.message,
			retry: error.retryable,
			retryDelayMs: error.retryable ? 0 : undefined
		};
	}
	return {
		errorClass: 'processor_failed',
		errorMessage:
			error instanceof Error ? error.message.slice(0, 10_000) : 'Unknown processor failure',
		retry: true
	};
}

function abortedError(): LibriMaintenanceProcessorError {
	return new LibriMaintenanceProcessorError(
		'worker_interrupted',
		'Libri maintenance execution was interrupted',
		true
	);
}

function validateConsumerConfig(config: LibriMaintenanceConsumerConfig): void {
	for (const [name, value] of Object.entries(config)) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} must be a positive safe integer`);
		}
	}
	if (config.concurrency > 2) {
		throw new Error('Libri maintenance concurrency cannot exceed 2');
	}
	if (config.pollIntervalMs < 500) {
		throw new Error('Libri maintenance polling cannot be below 500ms');
	}
	if (config.leaseDurationMs < 5_000 || config.leaseDurationMs > 15 * 60_000) {
		throw new Error('Libri maintenance lease duration must be between 5000 and 900000ms');
	}
	if (config.heartbeatIntervalMs >= config.leaseDurationMs / 2) {
		throw new Error(
			'Libri maintenance heartbeat interval must be below half the lease duration'
		);
	}
	if (config.workerTimeoutMs >= config.leaseDurationMs) {
		throw new Error('Libri maintenance worker timeout must be below the lease duration');
	}
}

function canonicalErrorCode(error: unknown, fallback: string): string {
	if (!(error instanceof Error) || !error.message.trim()) return fallback;
	return error.message.slice(0, 200);
}
