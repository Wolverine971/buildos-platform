// apps/worker/tests/agentRunCostReport.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildAgentRunCostReconciliationReport,
	loadAgentRunCostReconciliationReport
} from '../src/workers/agent-run/agentRunCostReport';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const CUTOFF = new Date('2026-07-19T11:50:00.000Z');

function rawRow(overrides: Record<string, unknown> = {}) {
	return {
		id: '40000000-0000-4000-8000-000000000001',
		root_run_id: '10000000-0000-4000-8000-000000000001',
		leaf_run_id: '20000000-0000-4000-8000-000000000001',
		attempt_key: 'llm:job-1:turn:1',
		provider: 'openrouter',
		operation: 'agent.turn',
		resource: 'openai/gpt-5-mini',
		status: 'reserved',
		reserved_cost_usd: '0.02000000',
		actual_cost_usd: null,
		provider_request_id: 'gen-1',
		reserved_at: '2026-07-19T11:00:00.000Z',
		updated_at: '2026-07-19T11:00:00.000Z',
		reconciliation_attempts: 1,
		reconciliation_lock_expires_at: null,
		reconciliation_next_attempt_at: null,
		reconciliation_last_error: null,
		reconciliation_needs_operator_at: null,
		...overrides
	};
}

describe('Agent Run cost reconciliation operator report', () => {
	it('summarizes conservative exposure and separates operator, retry, and leased rows', () => {
		const values = [
			rawRow(),
			rawRow({
				id: '40000000-0000-4000-8000-000000000002',
				provider_request_id: null
			}),
			rawRow({
				id: '40000000-0000-4000-8000-000000000003',
				provider: 'tavily',
				operation: 'util.web.search',
				resource: 'advanced'
			}),
			rawRow({
				id: '40000000-0000-4000-8000-000000000004',
				reconciliation_next_attempt_at: '2026-07-19T12:15:00.000Z'
			}),
			rawRow({
				id: '40000000-0000-4000-8000-000000000005',
				reconciliation_lock_expires_at: '2026-07-19T12:02:00.000Z'
			}),
			rawRow({
				id: '40000000-0000-4000-8000-000000000006',
				status: 'reconciliation_required',
				actual_cost_usd: '0.03000000',
				reconciliation_needs_operator_at: '2026-07-19T11:30:00.000Z'
			}),
			{ id: 'malformed' }
		];

		const report = buildAgentRunCostReconciliationReport({
			values,
			now: NOW,
			cutoff: CUTOFF,
			totalMatchingRows: 10
		});

		expect(report).toMatchObject({
			totalMatchingRows: 10,
			returnedRows: 6,
			truncated: true,
			invalidRows: 1,
			totalExposureUsd: 0.13,
			operatorRequiredCount: 3,
			automaticRetryCount: 2,
			leaseInFlightCount: 1,
			oldestReservedAt: '2026-07-19T11:00:00.000Z'
		});
		expect(report.rows.map((row) => row.disposition)).toEqual([
			'automatic_retry_due',
			'operator_missing_request_id',
			'operator_unsupported_provider',
			'automatic_retry_scheduled',
			'lease_in_flight',
			'operator_marked'
		]);
		expect(report.providers).toEqual([
			{
				provider: 'openrouter',
				count: 5,
				exposureUsd: 0.11,
				operatorRequired: 2
			},
			{
				provider: 'tavily',
				count: 1,
				exposureUsd: 0.02,
				operatorRequired: 1
			}
		]);
	});

	it('loads only aged unresolved rows with an exact count and bounded limit', async () => {
		class FakeQuery {
			select = vi.fn(() => this);
			in = vi.fn(() => this);
			lte = vi.fn(() => this);
			order = vi.fn(() => this);
			limit = vi.fn(async () => ({
				data: [rawRow()],
				error: null,
				count: 1
			}));
		}
		const query = new FakeQuery();
		const client = { from: vi.fn(() => query) };

		const report = await loadAgentRunCostReconciliationReport({
			now: NOW,
			minAgeMinutes: 10,
			limit: 25,
			client
		});

		expect(client.from).toHaveBeenCalledWith('agent_run_cost_entries');
		expect(query.select).toHaveBeenCalledWith(expect.stringContaining('attempt_key'), {
			count: 'exact'
		});
		expect(query.in).toHaveBeenCalledWith('status', ['reserved', 'reconciliation_required']);
		expect(query.lte).toHaveBeenCalledWith('reserved_at', CUTOFF.toISOString());
		expect(query.order).toHaveBeenCalledWith('reserved_at', { ascending: true });
		expect(query.limit).toHaveBeenCalledWith(25);
		expect(report).toMatchObject({
			totalMatchingRows: 1,
			returnedRows: 1,
			truncated: false
		});
	});

	it('fails loudly when the deployed ledger cannot be queried', async () => {
		class FakeQuery {
			select = vi.fn(() => this);
			in = vi.fn(() => this);
			lte = vi.fn(() => this);
			order = vi.fn(() => this);
			limit = vi.fn(async () => ({
				data: null,
				error: { message: 'permission denied' },
				count: null
			}));
		}

		await expect(
			loadAgentRunCostReconciliationReport({
				now: NOW,
				client: { from: vi.fn(() => new FakeQuery()) }
			})
		).rejects.toThrow('permission denied');
	});
});
