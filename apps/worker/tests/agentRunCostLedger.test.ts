// apps/worker/tests/agentRunCostLedger.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgentRunCostLedgerError,
	claimAgentRunCostReconciliations,
	reconcileAgentRunCost,
	releaseAgentRunCostReconciliation,
	reserveAgentRunCost,
	settleAgentRunCost
} from '../src/workers/agent-run/agentRunCostLedger';

const ENTRY = {
	id: '40000000-0000-4000-8000-000000000001',
	root_run_id: '10000000-0000-4000-8000-000000000001',
	leaf_run_id: '20000000-0000-4000-8000-000000000001',
	attempt_key: 'tool:job-1:1:util.web.search',
	provider: 'tavily',
	operation: 'util.web.search',
	resource: 'advanced',
	status: 'reserved',
	reserved_units: '2.0000',
	actual_units: null,
	unit_type: 'credits',
	reserved_cost_usd: '0.01600000',
	actual_cost_usd: null,
	provider_request_id: null,
	metadata: { job_id: 'job-1' },
	idempotent: false
} as const;

describe('Agent Run durable cost ledger adapter', () => {
	it('reserves with the database RPC and normalizes numeric fields', async () => {
		const rpc = vi.fn(async () => ({ data: ENTRY, error: null }));

		const result = await reserveAgentRunCost(
			{
				leafRunId: ENTRY.leaf_run_id,
				attemptKey: ENTRY.attempt_key,
				provider: 'tavily',
				operation: 'util.web.search',
				resource: 'advanced',
				reservedCostUsd: 0.016,
				reservedUnits: 2,
				unitType: 'credits',
				metadata: { job_id: 'job-1' },
				requireNewAttempt: true
			},
			{ rpc }
		);

		expect(rpc).toHaveBeenCalledWith('reserve_agent_run_cost', {
			p_leaf_run_id: ENTRY.leaf_run_id,
			p_attempt_key: ENTRY.attempt_key,
			p_provider: 'tavily',
			p_operation: 'util.web.search',
			p_resource: 'advanced',
			p_reserved_cost_usd: 0.016,
			p_reserved_units: 2,
			p_unit_type: 'credits',
			p_metadata: { job_id: 'job-1' }
		});
		expect(result).toMatchObject({
			status: 'reserved',
			reserved_units: 2,
			reserved_cost_usd: 0.016,
			idempotent: false
		});
	});

	it('refuses to redispatch an idempotently repeated logical attempt', async () => {
		const rpc = vi.fn(async () => ({
			data: { ...ENTRY, idempotent: true },
			error: null
		}));

		await expect(
			reserveAgentRunCost(
				{
					leafRunId: ENTRY.leaf_run_id,
					attemptKey: ENTRY.attempt_key,
					provider: 'tavily',
					operation: 'util.web.search',
					resource: 'advanced',
					reservedCostUsd: 0.016,
					requireNewAttempt: true
				},
				{ rpc }
			)
		).rejects.toMatchObject({
			name: 'AgentRunCostLedgerError',
			code: 'duplicate_attempt'
		});
	});

	it('classifies an atomic database budget rejection', async () => {
		const rpc = vi.fn(async () => ({
			data: null,
			error: { message: 'AGENT_RUN_COST_BUDGET_EXCEEDED' }
		}));

		let error: unknown;
		try {
			await reserveAgentRunCost(
				{
					leafRunId: ENTRY.leaf_run_id,
					attemptKey: ENTRY.attempt_key,
					provider: 'tavily',
					operation: 'util.web.search',
					resource: 'advanced',
					reservedCostUsd: 0.016
				},
				{ rpc }
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(AgentRunCostLedgerError);
		expect(error).toMatchObject({ code: 'budget_exceeded' });
	});

	it('settles through the lifecycle RPC without mutating the reservation directly', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				...ENTRY,
				status: 'settled',
				actual_units: '2.0000',
				actual_cost_usd: '0.01600000',
				provider_request_id: 'tavily-request-1'
			},
			error: null
		}));

		const result = await settleAgentRunCost(
			{
				leafRunId: ENTRY.leaf_run_id,
				attemptKey: ENTRY.attempt_key,
				status: 'settled',
				actualCostUsd: 0.016,
				actualUnits: 2,
				providerRequestId: 'tavily-request-1',
				metadata: { cost_source: 'provider_reported' }
			},
			{ rpc }
		);

		expect(rpc).toHaveBeenCalledWith('settle_agent_run_cost', {
			p_leaf_run_id: ENTRY.leaf_run_id,
			p_attempt_key: ENTRY.attempt_key,
			p_terminal_status: 'settled',
			p_actual_cost_usd: 0.016,
			p_actual_units: 2,
			p_provider_request_id: 'tavily-request-1',
			p_metadata: { cost_source: 'provider_reported' },
			p_allow_overrun: false
		});
		expect(result).toMatchObject({
			status: 'settled',
			actual_units: 2,
			actual_cost_usd: 0.016
		});
	});

	it('claims a bounded stale batch with a database lease', async () => {
		const rpc = vi.fn(async () => ({
			data: [
				{
					...ENTRY,
					reconciliation_attempts: 1,
					reconciliation_lock_token: '50000000-0000-4000-8000-000000000001',
					reconciliation_locked_at: '2026-07-19T12:00:00.000Z',
					reconciliation_lock_expires_at: '2026-07-19T12:02:00.000Z'
				}
			],
			error: null
		}));

		const result = await claimAgentRunCostReconciliations(
			{
				staleBefore: new Date('2026-07-19T11:50:00.000Z'),
				limit: 10,
				leaseSeconds: 120,
				maxAttempts: 8
			},
			{ rpc }
		);

		expect(rpc).toHaveBeenCalledWith('claim_agent_run_cost_reconciliation', {
			p_stale_before: '2026-07-19T11:50:00.000Z',
			p_limit: 10,
			p_lease_seconds: 120,
			p_max_attempts: 8
		});
		expect(result[0]).toMatchObject({
			reconciliation_attempts: 1,
			reconciliation_lock_token: '50000000-0000-4000-8000-000000000001'
		});
	});

	it('releases retryable claims and settles authoritative reconciliation through fenced RPCs', async () => {
		const lockToken = '50000000-0000-4000-8000-000000000001';
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({
				data: {
					...ENTRY,
					reconciliation_attempts: 1,
					reconciliation_next_attempt_at: '2026-07-19T12:15:00.000Z'
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: {
					...ENTRY,
					status: 'settled',
					actual_units: '800',
					actual_cost_usd: '0.012',
					provider_request_id: 'gen-1'
				},
				error: null
			});

		await releaseAgentRunCostReconciliation(
			{
				entryId: ENTRY.id,
				lockToken,
				error: 'not ready',
				retryable: true,
				retryAfter: new Date('2026-07-19T12:15:00.000Z')
			},
			{ rpc }
		);
		await reconcileAgentRunCost(
			{
				entryId: ENTRY.id,
				lockToken,
				actualCostUsd: 0.012,
				actualUnits: 800,
				providerRequestId: 'gen-1',
				metadata: { reconciliation_source: 'openrouter_generation_api' }
			},
			{ rpc }
		);

		expect(rpc).toHaveBeenNthCalledWith(1, 'release_agent_run_cost_reconciliation', {
			p_entry_id: ENTRY.id,
			p_lock_token: lockToken,
			p_error: 'not ready',
			p_retryable: true,
			p_retry_after: '2026-07-19T12:15:00.000Z'
		});
		expect(rpc).toHaveBeenNthCalledWith(2, 'reconcile_agent_run_cost', {
			p_entry_id: ENTRY.id,
			p_lock_token: lockToken,
			p_actual_cost_usd: 0.012,
			p_actual_units: 800,
			p_provider_request_id: 'gen-1',
			p_metadata: { reconciliation_source: 'openrouter_generation_api' }
		});
	});
});
