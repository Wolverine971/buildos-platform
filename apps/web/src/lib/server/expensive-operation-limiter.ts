// apps/web/src/lib/server/expensive-operation-limiter.ts
type BudgetMetric = 'tokens' | 'bytes';

export type ExpensiveOperationPolicyKey = 'agent_fastchat' | 'transcribe';

export interface ExpensiveOperationPolicy {
	key: ExpensiveOperationPolicyKey;
	startWindowMs: number;
	maxStartsPerWindow: number;
	budgetWindowMs: number;
	maxBudgetPerWindow: number;
	maxConcurrent: number;
	defaultEstimatedCost: number;
	budgetMetric: BudgetMetric;
	activeTtlMs?: number;
}

type RejectionReason = 'concurrency' | 'starts' | 'budget';

interface BudgetEntry {
	at: number;
	cost: number;
	reservationId: string;
}

interface ActiveReservation {
	startedAt: number;
}

interface PolicyState {
	policyKey: ExpensiveOperationPolicyKey;
	starts: number[];
	budgetEntries: BudgetEntry[];
	activeReservations: Map<string, ActiveReservation>;
}

export interface ExpensiveOperationLease {
	recordCost(actualCost: number): void;
	cancel(): void;
	release(): void;
}

export interface ExpensiveOperationAllowed {
	allowed: true;
	lease: ExpensiveOperationLease;
	headers: Record<string, string>;
}

export interface ExpensiveOperationBlocked {
	allowed: false;
	message: string;
	reason: RejectionReason;
	retryAfterSeconds: number;
	headers: Record<string, string>;
}

export type ExpensiveOperationDecision = ExpensiveOperationAllowed | ExpensiveOperationBlocked;

export interface ExpensiveOperationSnapshot {
	active: number;
	startsInWindow: number;
	startsRemaining: number;
	budgetUsed: number;
	budgetRemaining: number;
}

const DEFAULT_POLICIES: Record<ExpensiveOperationPolicyKey, ExpensiveOperationPolicy> = {
	agent_fastchat: {
		key: 'agent_fastchat',
		startWindowMs: 10 * 60 * 1000,
		maxStartsPerWindow: 30,
		budgetWindowMs: 60 * 60 * 1000,
		maxBudgetPerWindow: 500_000,
		maxConcurrent: 3,
		defaultEstimatedCost: 12_000,
		budgetMetric: 'tokens',
		activeTtlMs: 30 * 60 * 1000
	},
	transcribe: {
		key: 'transcribe',
		startWindowMs: 10 * 60 * 1000,
		maxStartsPerWindow: 20,
		budgetWindowMs: 60 * 60 * 1000,
		maxBudgetPerWindow: 150 * 1024 * 1024,
		maxConcurrent: 2,
		defaultEstimatedCost: 2 * 1024 * 1024,
		budgetMetric: 'bytes',
		activeTtlMs: 15 * 60 * 1000
	}
};

function normalizePositiveInt(value: unknown, fallback: number): number {
	const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function loadPolicyOverrides(
	key: ExpensiveOperationPolicyKey,
	base: ExpensiveOperationPolicy
): ExpensiveOperationPolicy {
	const prefix = `EXPENSIVE_LIMIT_${key.toUpperCase()}`;
	return {
		...base,
		startWindowMs: normalizePositiveInt(
			process.env[`${prefix}_START_WINDOW_MS`],
			base.startWindowMs
		),
		maxStartsPerWindow: normalizePositiveInt(
			process.env[`${prefix}_MAX_STARTS`],
			base.maxStartsPerWindow
		),
		budgetWindowMs: normalizePositiveInt(
			process.env[`${prefix}_BUDGET_WINDOW_MS`],
			base.budgetWindowMs
		),
		maxBudgetPerWindow: normalizePositiveInt(
			process.env[`${prefix}_MAX_BUDGET`],
			base.maxBudgetPerWindow
		),
		maxConcurrent: normalizePositiveInt(
			process.env[`${prefix}_MAX_CONCURRENT`],
			base.maxConcurrent
		),
		defaultEstimatedCost: normalizePositiveInt(
			process.env[`${prefix}_DEFAULT_COST`],
			base.defaultEstimatedCost
		),
		activeTtlMs: normalizePositiveInt(
			process.env[`${prefix}_ACTIVE_TTL_MS`],
			base.activeTtlMs ?? 0
		)
	};
}

function buildDefaultPolicies(): Record<ExpensiveOperationPolicyKey, ExpensiveOperationPolicy> {
	return {
		agent_fastchat: loadPolicyOverrides('agent_fastchat', DEFAULT_POLICIES.agent_fastchat),
		transcribe: loadPolicyOverrides('transcribe', DEFAULT_POLICIES.transcribe)
	};
}

function clampCost(value: number, fallback: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return Math.max(1, Math.floor(value));
}

function stateKey(userId: string, policyKey: ExpensiveOperationPolicyKey): string {
	return `${policyKey}:${userId}`;
}

function retryAfterSecondsFromMs(ms: number): number {
	return Math.max(1, Math.ceil(ms / 1000));
}

export function estimateFastChatReservation(message: string): number {
	return clampCost(Math.max(6_000, Math.min(30_000, Math.ceil(message.length * 12))), 12_000);
}

export function estimateTranscriptionReservation(bytes: number): number {
	return clampCost(
		Math.max(512 * 1024, Math.min(25 * 1024 * 1024, Math.ceil(bytes))),
		2 * 1024 * 1024
	);
}

export function withRateLimitHeaders(
	response: Response,
	headers: Record<string, string>
): Response {
	for (const [key, value] of Object.entries(headers)) {
		response.headers.set(key, value);
	}
	return response;
}

export class ExpensiveOperationLimiter {
	private readonly states = new Map<string, PolicyState>();
	private readonly cleanupInterval: NodeJS.Timeout;

	constructor(
		private readonly policies: Record<ExpensiveOperationPolicyKey, ExpensiveOperationPolicy>,
		private readonly now: () => number = () => Date.now()
	) {
		this.cleanupInterval = setInterval(() => {
			this.cleanup();
		}, 60_000);
		this.cleanupInterval.unref?.();
	}

	acquire(params: {
		userId: string;
		policyKey: ExpensiveOperationPolicyKey;
		estimatedCost?: number;
	}): ExpensiveOperationDecision {
		const policy = this.policies[params.policyKey];
		const now = this.now();
		const key = stateKey(params.userId, params.policyKey);
		const state = this.getOrCreateState(key, policy.key);

		this.pruneState(state, policy, now);

		const active = state.activeReservations.size;
		if (active >= policy.maxConcurrent) {
			const snapshot = this.snapshotState(state, policy);
			return this.reject(
				policy,
				snapshot,
				'concurrency',
				'Too many BuildOS AI operations are already running for this account. Wait for one to finish and try again.',
				10
			);
		}

		if (state.starts.length >= policy.maxStartsPerWindow) {
			const oldestStart = state.starts[0] ?? now;
			const snapshot = this.snapshotState(state, policy);
			return this.reject(
				policy,
				snapshot,
				'starts',
				'Too many expensive requests were started in a short period. Slow down and retry shortly.',
				retryAfterSecondsFromMs(oldestStart + policy.startWindowMs - now)
			);
		}

		const reservationCost = clampCost(
			params.estimatedCost ?? policy.defaultEstimatedCost,
			policy.defaultEstimatedCost
		);
		const budgetUsed = state.budgetEntries.reduce((total, entry) => total + entry.cost, 0);
		if (budgetUsed + reservationCost > policy.maxBudgetPerWindow) {
			const retryAfterSeconds = this.calculateBudgetRetryAfterSeconds(
				state.budgetEntries,
				policy,
				now,
				reservationCost
			);
			const snapshot = this.snapshotState(state, policy);
			return this.reject(
				policy,
				snapshot,
				'budget',
				`You have hit the rolling ${policy.budgetMetric} budget for expensive BuildOS operations. Wait for the window to recover and try again.`,
				retryAfterSeconds
			);
		}

		const reservationId = `${policy.key}:${now}:${Math.random().toString(36).slice(2, 10)}`;
		state.starts.push(now);
		state.budgetEntries.push({
			at: now,
			cost: reservationCost,
			reservationId
		});
		state.activeReservations.set(reservationId, { startedAt: now });

		let released = false;
		const cleanupReservation = (removeBudgetEntry: boolean) => {
			if (released) return;
			released = true;
			state.activeReservations.delete(reservationId);
			if (removeBudgetEntry) {
				state.budgetEntries = state.budgetEntries.filter(
					(entry) => entry.reservationId !== reservationId
				);
			}
			this.pruneState(state, policy, this.now());
			if (
				state.activeReservations.size === 0 &&
				state.starts.length === 0 &&
				state.budgetEntries.length === 0
			) {
				this.states.delete(key);
			}
		};
		const lease: ExpensiveOperationLease = {
			recordCost: (actualCost: number) => {
				if (released) return;
				const entry = state.budgetEntries.find(
					(item) => item.reservationId === reservationId
				);
				if (!entry) return;
				entry.cost = clampCost(actualCost, reservationCost);
			},
			cancel: () => {
				cleanupReservation(true);
			},
			release: () => {
				cleanupReservation(false);
			}
		};

		return {
			allowed: true,
			lease,
			headers: this.buildHeaders(policy, this.snapshotState(state, policy), 'ok')
		};
	}

	getSnapshot(
		userId: string,
		policyKey: ExpensiveOperationPolicyKey
	): ExpensiveOperationSnapshot {
		const policy = this.policies[policyKey];
		const key = stateKey(userId, policyKey);
		const state = this.states.get(key);
		if (!state) {
			return {
				active: 0,
				startsInWindow: 0,
				startsRemaining: policy.maxStartsPerWindow,
				budgetUsed: 0,
				budgetRemaining: policy.maxBudgetPerWindow
			};
		}

		this.pruneState(state, policy, this.now());
		return this.snapshotState(state, policy);
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.states.clear();
	}

	private getOrCreateState(key: string, policyKey: ExpensiveOperationPolicyKey): PolicyState {
		const existing = this.states.get(key);
		if (existing) {
			return existing;
		}

		const created: PolicyState = {
			policyKey,
			starts: [],
			budgetEntries: [],
			activeReservations: new Map()
		};
		this.states.set(key, created);
		return created;
	}

	private pruneState(state: PolicyState, policy: ExpensiveOperationPolicy, now: number): void {
		const startCutoff = now - policy.startWindowMs;
		const budgetCutoff = now - policy.budgetWindowMs;
		const activeCutoff =
			now - (policy.activeTtlMs ?? Math.max(policy.startWindowMs, 15 * 60_000));

		state.starts = state.starts.filter((startedAt) => startedAt > startCutoff);
		state.budgetEntries = state.budgetEntries.filter((entry) => entry.at > budgetCutoff);
		for (const [reservationId, reservation] of state.activeReservations.entries()) {
			if (reservation.startedAt <= activeCutoff) {
				state.activeReservations.delete(reservationId);
			}
		}
	}

	private snapshotState(
		state: PolicyState,
		policy: ExpensiveOperationPolicy
	): ExpensiveOperationSnapshot {
		const budgetUsed = state.budgetEntries.reduce((total, entry) => total + entry.cost, 0);
		return {
			active: state.activeReservations.size,
			startsInWindow: state.starts.length,
			startsRemaining: Math.max(0, policy.maxStartsPerWindow - state.starts.length),
			budgetUsed,
			budgetRemaining: Math.max(0, policy.maxBudgetPerWindow - budgetUsed)
		};
	}

	private calculateBudgetRetryAfterSeconds(
		entries: BudgetEntry[],
		policy: ExpensiveOperationPolicy,
		now: number,
		requestedCost: number
	): number {
		let total = entries.reduce((sum, entry) => sum + entry.cost, 0);
		for (const entry of entries) {
			total -= entry.cost;
			if (total + requestedCost <= policy.maxBudgetPerWindow) {
				return retryAfterSecondsFromMs(entry.at + policy.budgetWindowMs - now);
			}
		}
		return retryAfterSecondsFromMs(policy.budgetWindowMs);
	}

	private reject(
		policy: ExpensiveOperationPolicy,
		snapshot: ExpensiveOperationSnapshot,
		reason: RejectionReason,
		message: string,
		retryAfterSeconds: number
	): ExpensiveOperationBlocked {
		return {
			allowed: false,
			message,
			reason,
			retryAfterSeconds,
			headers: this.buildHeaders(policy, snapshot, reason, retryAfterSeconds)
		};
	}

	private buildHeaders(
		policy: ExpensiveOperationPolicy,
		snapshot: ExpensiveOperationSnapshot,
		reason: RejectionReason | 'ok',
		retryAfterSeconds?: number
	): Record<string, string> {
		const headers: Record<string, string> = {
			'X-BuildOS-Limit-Policy': policy.key,
			'X-BuildOS-Limit-Reason': reason,
			'X-BuildOS-Limit-Starts-Limit': String(policy.maxStartsPerWindow),
			'X-BuildOS-Limit-Starts-Remaining': String(snapshot.startsRemaining),
			'X-BuildOS-Limit-Budget-Limit': String(policy.maxBudgetPerWindow),
			'X-BuildOS-Limit-Budget-Remaining': String(snapshot.budgetRemaining),
			'X-BuildOS-Limit-Budget-Metric': policy.budgetMetric,
			'X-BuildOS-Limit-Concurrent-Limit': String(policy.maxConcurrent),
			'X-BuildOS-Limit-Concurrent-Active': String(snapshot.active)
		};

		if (retryAfterSeconds !== undefined) {
			headers['Retry-After'] = String(retryAfterSeconds);
		}

		return headers;
	}

	private cleanup(): void {
		const now = this.now();
		for (const [key, state] of this.states.entries()) {
			const policy = this.policies[state.policyKey];
			this.pruneState(state, policy, now);
			if (
				state.activeReservations.size === 0 &&
				state.starts.length === 0 &&
				state.budgetEntries.length === 0
			) {
				this.states.delete(key);
			}
		}
	}
}

export const expensiveOperationLimiter = new ExpensiveOperationLimiter(buildDefaultPolicies());
