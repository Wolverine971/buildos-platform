import type { QueryResult } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
	createLibriAssetGrantIssuer,
	type LibriAssetGrantQueryClient
} from '../src/workers/libri/assetGrant';

const NOW_MS = Date.parse('2026-08-30T23:55:00.000Z');
const STEP_ID = '94000000-0000-4000-8000-000000000001';
const LEASE_TOKEN = '94333333-3333-4333-8333-333333333333';
const IMAGE_ID = '92000000-0000-4000-8000-000000000001';
const GRANT_ID = '97000000-0000-4000-8000-000000000001';

describe('Libri OCR asset grant issuer', () => {
	it('issues one opaque capability through the lease-validating database routine', async () => {
		const { client, queryMock } = fakeClient({
			grant_id: GRANT_ID,
			expires_at: new Date(NOW_MS + 60_000)
		});
		const issuer = createLibriAssetGrantIssuer(client, () => NOW_MS);

		await expect(
			issuer.issueOcrAssetGrant({
				stepId: STEP_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				imageId: IMAGE_ID
			})
		).resolves.toEqual({
			grantId: GRANT_ID,
			expiresAt: '2026-08-30T23:56:00.000Z'
		});
		expect(queryMock).toHaveBeenCalledWith(
			expect.stringContaining('libri.issue_ocr_asset_grant'),
			[STEP_ID, 1, LEASE_TOKEN, IMAGE_ID]
		);
	});

	it.each([
		['stepId', 'not-a-uuid'],
		['leaseToken', 'not-a-uuid'],
		['imageId', 'not-a-uuid'],
		['executionGeneration', 0],
		['executionGeneration', 1.5]
	] as const)('rejects unsafe %s before querying', async (field, value) => {
		const { client, queryMock } = fakeClient({});
		const issuer = createLibriAssetGrantIssuer(client, () => NOW_MS);
		const input = {
			stepId: STEP_ID,
			executionGeneration: 1,
			leaseToken: LEASE_TOKEN,
			imageId: IMAGE_ID,
			[field]: value
		};

		await expect(issuer.issueOcrAssetGrant(input as never)).rejects.toThrow();
		expect(queryMock).not.toHaveBeenCalled();
	});

	it.each([
		[[], 'returned 0 rows'],
		[
			[
				{ grant_id: GRANT_ID, expires_at: '2026-08-30T23:56:00.000Z' },
				{ grant_id: GRANT_ID, expires_at: '2026-08-30T23:56:00.000Z' }
			],
			'returned 2 rows'
		],
		[[{ grant_id: 'bad', expires_at: '2026-08-30T23:56:00.000Z' }], 'grantId'],
		[[{ grant_id: GRANT_ID, expires_at: '2026-08-30T23:54:59.000Z' }], 'expiry'],
		[[{ grant_id: GRANT_ID, expires_at: '2026-08-30T23:56:06.000Z' }], 'expiry']
	] as const)('fails closed on malformed database receipt %#', async (rows, message) => {
		const queryMock = vi.fn(async () => result([...rows]));
		const issuer = createLibriAssetGrantIssuer(
			{ query: queryMock } as LibriAssetGrantQueryClient,
			() => NOW_MS
		);

		await expect(
			issuer.issueOcrAssetGrant({
				stepId: STEP_ID,
				executionGeneration: 1,
				leaseToken: LEASE_TOKEN,
				imageId: IMAGE_ID
			})
		).rejects.toThrow(message);
	});
});

function fakeClient(row: Record<string, unknown>) {
	const queryMock = vi.fn(async (_text: string, _values?: readonly unknown[]) => result([row]));
	return { client: { query: queryMock } as LibriAssetGrantQueryClient, queryMock };
}

function result(rows: readonly unknown[]): QueryResult<any> {
	return { rows: [...rows] } as QueryResult<any>;
}
