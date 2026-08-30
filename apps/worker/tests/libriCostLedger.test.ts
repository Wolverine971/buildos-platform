import type { QueryResult } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createLibriCostLedger, type LibriCostQueryClient } from '../src/workers/libri/costLedger';

const STEP_ID = '82000000-0000-4000-8000-000000000001';
const RESERVATION_ID = '86000000-0000-4000-8000-000000000001';
const LEASE_TOKEN = '84000000-0000-4000-8000-000000000001';

describe('Libri provider cost ledger boundary', () => {
	it('reserves integer microusd through the atomic database routine', async () => {
		const { client, queryMock } = fakeClient({
			reservation_id: RESERVATION_ID,
			outcome: 'reserved',
			created: true,
			reservation_amount_microusd: '250',
			remaining_microusd: '750'
		});
		const ledger = createLibriCostLedger(client);

		await expect(
			ledger.reserveProviderCost({
				stepId: STEP_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				reservationKey: ' ocr-call-1 ',
				provider: ' openrouter ',
				model: ' openai/gpt-4o-mini ',
				reservedMicrousd: 250n
			})
		).resolves.toEqual({
			reservationId: RESERVATION_ID,
			outcome: 'reserved',
			created: true,
			reservationAmountMicrousd: 250n,
			remainingMicrousd: 750n
		});
		expect(queryMock).toHaveBeenCalledWith(
			expect.stringContaining('libri.reserve_provider_cost'),
			[STEP_ID, 1, LEASE_TOKEN, 'ocr-call-1', 'openrouter', 'openai/gpt-4o-mini', '250']
		);
	});

	it('maps authorize, settlement, and release receipts without number coercion', async () => {
		const rows = [
			{ authorized: true, outcome: 'started' },
			{
				accepted: true,
				outcome: 'settled',
				over_budget: false,
				total_spent_microusd: '125',
				remaining_microusd: '875'
			},
			{ accepted: false, outcome: 'started', remaining_microusd: '0' }
		];
		const queryMock = vi.fn(async (_text: string, _values?: readonly unknown[]) =>
			result([rows.shift()])
		);
		const ledger = createLibriCostLedger({ query: queryMock } as LibriCostQueryClient);
		const identity = {
			reservationId: RESERVATION_ID,
			executionGeneration: 1,
			leaseToken: LEASE_TOKEN
		};

		await expect(ledger.authorizeProviderCall(identity)).resolves.toEqual({
			authorized: true,
			outcome: 'started'
		});
		await expect(
			ledger.settleProviderCost({
				...identity,
				actualCostMicrousd: 125n,
				promptTokens: 100n,
				completionTokens: 25n,
				providerRequestId: 'openrouter-request-1'
			})
		).resolves.toEqual({
			accepted: true,
			outcome: 'settled',
			overBudget: false,
			totalSpentMicrousd: 125n,
			remainingMicrousd: 875n
		});
		await expect(
			ledger.releaseProviderCost({ ...identity, reason: 'provider call never started' })
		).resolves.toEqual({
			accepted: false,
			outcome: 'started',
			remainingMicrousd: 0n
		});
		expect(queryMock.mock.calls[1]?.[1]).toEqual([
			RESERVATION_ID,
			1,
			LEASE_TOKEN,
			'125',
			'100',
			'25',
			'openrouter-request-1'
		]);
	});

	it('rejects unsafe input before querying', async () => {
		const { client, queryMock } = fakeClient({});
		const ledger = createLibriCostLedger(client);
		const base = {
			stepId: STEP_ID,
			executionGeneration: 1,
			leaseToken: LEASE_TOKEN,
			reservationKey: 'ocr-call-1',
			provider: 'openrouter',
			model: 'openai/gpt-4o-mini',
			reservedMicrousd: 1n
		};

		await expect(ledger.reserveProviderCost({ ...base, reservedMicrousd: 0n })).rejects.toThrow(
			'positive'
		);
		await expect(ledger.reserveProviderCost({ ...base, stepId: 'not-a-uuid' })).rejects.toThrow(
			'UUID'
		);
		await expect(
			ledger.reserveProviderCost({ ...base, reservationKey: ' '.repeat(2) })
		).rejects.toThrow('reservationKey');
		expect(queryMock).not.toHaveBeenCalled();
	});

	it('fails closed on malformed or contradictory database receipts', async () => {
		const malformed = createLibriCostLedger(
			fakeClient({
				reservation_id: null,
				outcome: 'reserved',
				created: true,
				reservation_amount_microusd: '1',
				remaining_microusd: '9'
			}).client
		);
		await expect(
			malformed.reserveProviderCost({
				stepId: STEP_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				reservationKey: 'ocr-call-1',
				provider: 'openrouter',
				model: 'openai/gpt-4o-mini',
				reservedMicrousd: 1n
			})
		).rejects.toThrow('missing reservation ID');

		const unsafeInteger = createLibriCostLedger(
			fakeClient({
				reservation_id: null,
				outcome: 'budget_unavailable',
				created: false,
				reservation_amount_microusd: '1',
				remaining_microusd: '1.5'
			}).client
		);
		await expect(
			unsafeInteger.reserveProviderCost({
				stepId: STEP_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				reservationKey: 'ocr-call-2',
				provider: 'openrouter',
				model: 'openai/gpt-4o-mini',
				reservedMicrousd: 1n
			})
		).rejects.toThrow('was not an integer');

		const contradictoryMutation = createLibriCostLedger(
			fakeClient({ authorized: true, outcome: 'stale' }).client
		);
		await expect(
			contradictoryMutation.authorizeProviderCall({
				reservationId: RESERVATION_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN
			})
		).rejects.toThrow('provider authority contradicted outcome');
	});

	it('does not renew network authority for an already-started reservation', async () => {
		const ledger = createLibriCostLedger(
			fakeClient({ authorized: false, outcome: 'started' }).client
		);
		await expect(
			ledger.authorizeProviderCall({
				reservationId: RESERVATION_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN
			})
		).resolves.toEqual({ authorized: false, outcome: 'started' });
	});
});

function fakeClient(row: Record<string, unknown>) {
	const queryMock = vi.fn(async () => result([row]));
	return {
		client: { query: queryMock } as LibriCostQueryClient,
		queryMock
	};
}

function result(rows: unknown[]): QueryResult<Record<string, unknown>> {
	return { rows } as QueryResult<Record<string, unknown>>;
}
