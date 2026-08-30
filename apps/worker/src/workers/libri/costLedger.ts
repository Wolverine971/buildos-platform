import type { QueryResult } from 'pg';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BIGINT = 9_223_372_036_854_775_807n;
type ReservationOutcome =
	| 'reserved'
	| 'started'
	| 'settled'
	| 'released'
	| 'budget_unavailable'
	| 'reconciliation_required'
	| 'stale';
type MutationOutcome = 'reserved' | 'started' | 'settled' | 'released' | 'stale';

const RESERVATION_OUTCOMES: ReadonlySet<ReservationOutcome> = new Set([
	'reserved',
	'started',
	'settled',
	'released',
	'budget_unavailable',
	'reconciliation_required',
	'stale'
]);
const MUTATION_OUTCOMES: ReadonlySet<MutationOutcome> = new Set([
	'reserved',
	'started',
	'settled',
	'released',
	'stale'
]);

export type LibriCostQueryClient = {
	query: <T extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	) => Promise<QueryResult<T>>;
};

export type ReserveLibriProviderCostInput = {
	stepId: string;
	executionGeneration: number;
	leaseToken: string;
	reservationKey: string;
	provider: string;
	model: string;
	reservedMicrousd: bigint;
};

export type ReserveLibriProviderCostReceipt = {
	reservationId: string | null;
	outcome: ReservationOutcome;
	created: boolean;
	reservationAmountMicrousd: bigint;
	remainingMicrousd: bigint;
};

export type AuthorizeLibriProviderCostInput = {
	reservationId: string;
	executionGeneration: number;
	leaseToken: string;
};

export type AuthorizeLibriProviderCostReceipt = {
	authorized: boolean;
	outcome: MutationOutcome;
};

export type LibriProviderCostMutationReceipt = {
	accepted: boolean;
	outcome: MutationOutcome;
};

export type SettleLibriProviderCostInput = AuthorizeLibriProviderCostInput & {
	actualCostMicrousd: bigint;
	promptTokens: bigint;
	completionTokens: bigint;
	providerRequestId: string;
};

export type SettleLibriProviderCostReceipt = LibriProviderCostMutationReceipt & {
	overBudget: boolean;
	totalSpentMicrousd: bigint;
	remainingMicrousd: bigint;
};

export type ReleaseLibriProviderCostInput = AuthorizeLibriProviderCostInput & {
	reason: string;
};

export type ReleaseLibriProviderCostReceipt = LibriProviderCostMutationReceipt & {
	remainingMicrousd: bigint;
};

export type LibriCostLedgerPort = {
	reserveProviderCost(
		input: ReserveLibriProviderCostInput
	): Promise<ReserveLibriProviderCostReceipt>;
	authorizeProviderCall(
		input: AuthorizeLibriProviderCostInput
	): Promise<AuthorizeLibriProviderCostReceipt>;
	settleProviderCost(
		input: SettleLibriProviderCostInput
	): Promise<SettleLibriProviderCostReceipt>;
	releaseProviderCost(
		input: ReleaseLibriProviderCostInput
	): Promise<ReleaseLibriProviderCostReceipt>;
};

type ReserveRow = {
	reservation_id: string | null;
	outcome: string;
	created: boolean;
	reservation_amount_microusd: string;
	remaining_microusd: string;
};

type AuthorizationRow = {
	authorized: boolean;
	outcome: string;
};

type MutationRow = {
	accepted: boolean;
	outcome: string;
};

type SettlementRow = MutationRow & {
	over_budget: boolean;
	total_spent_microusd: string;
	remaining_microusd: string;
};

type ReleaseRow = MutationRow & {
	remaining_microusd: string;
};

export function createLibriCostLedger(client: LibriCostQueryClient): LibriCostLedgerPort {
	return new LibriCostLedger(client);
}

class LibriCostLedger implements LibriCostLedgerPort {
	constructor(private readonly client: LibriCostQueryClient) {}

	async reserveProviderCost(
		input: ReserveLibriProviderCostInput
	): Promise<ReserveLibriProviderCostReceipt> {
		assertUuid(input.stepId, 'stepId');
		assertPositiveGeneration(input.executionGeneration);
		assertUuid(input.leaseToken, 'leaseToken');
		const reservationKey = normalizeText(input.reservationKey, 128, 'reservationKey');
		const provider = normalizeText(input.provider, 64, 'provider');
		const model = normalizeText(input.model, 120, 'model');
		assertPositiveBigint(input.reservedMicrousd, 'reservedMicrousd');

		const result = await this.client.query<ReserveRow>(
			`SELECT * FROM libri.reserve_provider_cost($1, $2, $3, $4, $5, $6, $7)`,
			[
				input.stepId,
				input.executionGeneration,
				input.leaseToken,
				reservationKey,
				provider,
				model,
				input.reservedMicrousd.toString()
			]
		);
		const row = readOneRow(result.rows, 'provider cost reservation');
		const outcome = readOutcome(row.outcome, RESERVATION_OUTCOMES);
		if (row.reservation_id !== null) assertUuid(row.reservation_id, 'reservationId');
		if (['reserved', 'started', 'settled', 'released'].includes(outcome)) {
			if (row.reservation_id === null) throw invalidReceipt('missing reservation ID');
		} else if (row.reservation_id !== null || row.created) {
			throw invalidReceipt('denied reservation had a durable identity');
		}
		if (readBoolean(row.created, 'created') && outcome !== 'reserved') {
			throw invalidReceipt('new reservation did not return reserved');
		}
		return {
			reservationId: row.reservation_id,
			outcome,
			created: row.created,
			reservationAmountMicrousd: readNonnegativeBigint(
				row.reservation_amount_microusd,
				'reservation_amount_microusd'
			),
			remainingMicrousd: readNonnegativeBigint(row.remaining_microusd, 'remaining_microusd')
		};
	}

	async authorizeProviderCall(
		input: AuthorizeLibriProviderCostInput
	): Promise<AuthorizeLibriProviderCostReceipt> {
		validateReservationIdentity(input);
		const result = await this.client.query<AuthorizationRow>(
			`SELECT * FROM libri.start_provider_cost($1, $2, $3)`,
			[input.reservationId, input.executionGeneration, input.leaseToken]
		);
		const row = readOneRow(result.rows, 'provider cost authorization');
		const authorized = readBoolean(row.authorized, 'authorized');
		const outcome = readOutcome(row.outcome, MUTATION_OUTCOMES);
		if (authorized && outcome !== 'started') {
			throw invalidReceipt('provider authority contradicted outcome');
		}
		return { authorized, outcome };
	}

	async settleProviderCost(
		input: SettleLibriProviderCostInput
	): Promise<SettleLibriProviderCostReceipt> {
		validateReservationIdentity(input);
		assertNonnegativeBigint(input.actualCostMicrousd, 'actualCostMicrousd');
		assertNonnegativeBigint(input.promptTokens, 'promptTokens');
		assertNonnegativeBigint(input.completionTokens, 'completionTokens');
		const providerRequestId = normalizeText(input.providerRequestId, 256, 'providerRequestId');
		const result = await this.client.query<SettlementRow>(
			`SELECT * FROM libri.settle_provider_cost($1, $2, $3, $4, $5, $6, $7)`,
			[
				input.reservationId,
				input.executionGeneration,
				input.leaseToken,
				input.actualCostMicrousd.toString(),
				input.promptTokens.toString(),
				input.completionTokens.toString(),
				providerRequestId
			]
		);
		const row = readOneRow(result.rows, 'provider cost settlement');
		const mutation = readMutationRow(row);
		assertAcceptedOutcome(mutation, 'settled');
		return {
			...mutation,
			overBudget: readBoolean(row.over_budget, 'over_budget'),
			totalSpentMicrousd: readNonnegativeBigint(
				row.total_spent_microusd,
				'total_spent_microusd'
			),
			remainingMicrousd: readNonnegativeBigint(row.remaining_microusd, 'remaining_microusd')
		};
	}

	async releaseProviderCost(
		input: ReleaseLibriProviderCostInput
	): Promise<ReleaseLibriProviderCostReceipt> {
		validateReservationIdentity(input);
		const reason = normalizeText(input.reason, 256, 'reason');
		const result = await this.client.query<ReleaseRow>(
			`SELECT * FROM libri.release_provider_cost($1, $2, $3, $4)`,
			[input.reservationId, input.executionGeneration, input.leaseToken, reason]
		);
		const row = readOneRow(result.rows, 'provider cost release');
		const mutation = readMutationRow(row);
		assertAcceptedOutcome(mutation, 'released');
		return {
			...mutation,
			remainingMicrousd: readNonnegativeBigint(row.remaining_microusd, 'remaining_microusd')
		};
	}
}

function validateReservationIdentity(input: AuthorizeLibriProviderCostInput): void {
	assertUuid(input.reservationId, 'reservationId');
	assertPositiveGeneration(input.executionGeneration);
	assertUuid(input.leaseToken, 'leaseToken');
}

function readMutationRow(row: MutationRow): LibriProviderCostMutationReceipt {
	return {
		accepted: readBoolean(row.accepted, 'accepted'),
		outcome: readOutcome(row.outcome, MUTATION_OUTCOMES)
	};
}

function assertAcceptedOutcome(
	receipt: LibriProviderCostMutationReceipt,
	acceptedOutcome: MutationOutcome
): void {
	if (receipt.accepted !== (receipt.outcome === acceptedOutcome)) {
		throw invalidReceipt('accepted flag contradicted outcome');
	}
}

function readOneRow<T>(rows: T[], name: string): T {
	if (rows.length !== 1) throw invalidReceipt(`${name} returned ${rows.length} rows`);
	return rows[0];
}

function readOutcome<T extends string>(value: unknown, allowed: ReadonlySet<T>): T {
	if (typeof value !== 'string' || !allowed.has(value as T)) {
		throw invalidReceipt('unsupported outcome');
	}
	return value as T;
}

function readBoolean(value: unknown, name: string): boolean {
	if (typeof value !== 'boolean') throw invalidReceipt(`${name} was not boolean`);
	return value;
}

function readNonnegativeBigint(value: unknown, name: string): bigint {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) {
		throw invalidReceipt(`${name} was not an integer`);
	}
	const parsed = BigInt(value);
	if (parsed > MAX_BIGINT) throw invalidReceipt(`${name} exceeded bigint`);
	return parsed;
}

function assertUuid(value: string, name: string): void {
	if (!UUID_PATTERN.test(value)) throw new Error(`Libri provider cost ${name} must be a UUID`);
}

function assertPositiveGeneration(value: number): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error('Libri provider cost executionGeneration must be a positive integer');
	}
}

function assertPositiveBigint(value: bigint, name: string): void {
	assertNonnegativeBigint(value, name);
	if (value === 0n) throw new Error(`Libri provider cost ${name} must be positive`);
}

function assertNonnegativeBigint(value: bigint, name: string): void {
	if (typeof value !== 'bigint' || value < 0n || value > MAX_BIGINT) {
		throw new Error(`Libri provider cost ${name} must fit a nonnegative PostgreSQL bigint`);
	}
}

function normalizeText(value: string, maximum: number, name: string): string {
	if (typeof value !== 'string') throw new Error(`Libri provider cost ${name} must be text`);
	const normalized = value.trim();
	if (!normalized || normalized.length > maximum) {
		throw new Error(`Libri provider cost ${name} must contain 1 to ${maximum} characters`);
	}
	return normalized;
}

function invalidReceipt(message: string): Error {
	return new Error(`Invalid Libri provider cost receipt: ${message}`);
}
