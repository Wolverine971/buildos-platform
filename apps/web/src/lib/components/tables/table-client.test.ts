// apps/web/src/lib/components/tables/table-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	createTableClient,
	isTableConflict,
	TableClientError,
	type FetchLike
} from './table-client';
import { buildJobApplicationsTable } from './fixtures';

function respond(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('table client', () => {
	it('unwraps ApiResponse data and builds encoded paths', async () => {
		const table = buildJobApplicationsTable();
		const fetcher = vi.fn<FetchLike>(async () =>
			respond(200, { success: true, data: { table, totals: { c: 1 } } })
		);
		const client = createTableClient(fetcher);
		const result = await client.getTable('doc/1');
		expect(result.table.document.title).toBe('Job applications');
		expect(result.totals).toEqual({ c: 1 });
		expect(result.rowTasks).toEqual({});
		expect(fetcher).toHaveBeenCalledWith(
			'/api/onto/tables/doc%2F1',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('posts row ops as JSON and defaults a missing receipt to null', async () => {
		const fetcher = vi.fn<FetchLike>(async () =>
			respond(200, { success: true, data: { apply: { results: [] } } })
		);
		const client = createTableClient(fetcher);
		const result = await client.applyRows('d1', {
			ops: [{ op: 'delete', row_id: 'r', expected_version: 2 }]
		});
		expect(result.receipt).toBeNull();
		const [path, init] = fetcher.mock.calls[0]!;
		expect(path).toBe('/api/onto/tables/d1/rows');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({
			ops: [{ op: 'delete', row_id: 'r', expected_version: 2 }]
		});
	});

	it('turns a 409 into a conflict error carrying the table code', async () => {
		const client = createTableClient(async () =>
			respond(409, { success: false, error: 'Row changed', code: 'ROW_CONFLICT' })
		);
		const error = await client.applyRows('d1', { ops: [] }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TableClientError);
		expect((error as TableClientError).code).toBe('ROW_CONFLICT');
		expect(isTableConflict(error)).toBe(true);
	});

	it('reads codes nested in details and reports network failures', async () => {
		const nested = createTableClient(async () =>
			respond(400, { success: false, error: 'Bad', details: { code: 'VALIDATION_ERROR' } })
		);
		const error = (await nested
			.patchTable('d1', {})
			.catch((e: unknown) => e)) as TableClientError;
		expect(error.code).toBe('VALIDATION_ERROR');
		expect(error.isConflict).toBe(false);

		const offline = createTableClient(async () => {
			throw new TypeError('Failed to fetch');
		});
		const networkError = (await offline
			.getTable('d1')
			.catch((e: unknown) => e)) as TableClientError;
		expect(networkError.code).toBe('NETWORK_ERROR');
		expect(networkError.status).toBe(0);
	});

	it('builds the AI fill and export paths', async () => {
		const fetcher = vi.fn<FetchLike>(async () =>
			respond(200, {
				success: true,
				data: { status: 'running', filled: 1, failed: 0, total: 3 }
			})
		);
		const client = createTableClient(fetcher);
		await client.getAiFillStatus('d1', 'run 1');
		expect(fetcher.mock.calls[0]![0]).toBe('/api/onto/tables/d1/ai-fill/run%201');
		expect(client.exportCsvUrl('d1')).toBe('/api/onto/tables/d1/export.csv');
	});
});
