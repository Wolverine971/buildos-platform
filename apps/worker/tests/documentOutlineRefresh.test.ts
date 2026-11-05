// apps/worker/tests/documentOutlineRefresh.test.ts
import { describe, expect, it } from 'vitest';
import {
	extractOutline,
	hashDocumentContent
} from '@buildos/shared-agent-ops/utils/document-outline';
import {
	refreshDocumentOutline,
	type OutlineRefreshClient
} from '../src/workers/embeddings/documentOutlineRefresh';

const DOC = '50000000-0000-4000-8000-000000000005';
const TEXT = '## Budget\n$300K.\n## Team\nBoard.';

function fakeClient(row: Record<string, unknown> | null, writeError = false) {
	const writes: { values: Record<string, unknown>; filters: [string, string][] }[] = [];
	const client = {
		from() {
			const filters: [string, string][] = [];
			let values: Record<string, unknown> | null = null;
			const builder: Record<string, unknown> = {
				select: () => builder,
				update: (v: Record<string, unknown>) => ((values = v), builder),
				eq: (column: string, value: string) => (filters.push([column, value]), builder),
				maybeSingle: () => Promise.resolve({ data: row, error: null }),
				then: (ok: (value: unknown) => unknown) => {
					if (values) writes.push({ values, filters });
					return Promise.resolve({
						data: null,
						error: writeError ? { message: 'denied' } : null
					}).then(ok);
				}
			};
			return builder;
		}
	} as unknown as OutlineRefreshClient;
	return { client, writes };
}

describe('refreshDocumentOutline', () => {
	it('writes a missing outline, guarded by the hash it was computed from', async () => {
		const hash = hashDocumentContent(TEXT);
		const { client, writes } = fakeClient({
			content: TEXT,
			content_hash: hash,
			outline: null,
			deleted_at: null
		});
		await expect(refreshDocumentOutline(client, DOC)).resolves.toBe('written');
		expect(writes).toEqual([
			{
				values: { outline: extractOutline(TEXT) },
				filters: [
					['id', DOC],
					['content_hash', hash]
				]
			}
		]);
	});

	it('leaves a fresh outline alone and skips deleted documents', async () => {
		const hash = hashDocumentContent(TEXT);
		const fresh = fakeClient({
			content: TEXT,
			content_hash: hash,
			outline: extractOutline(TEXT),
			deleted_at: null
		});
		await expect(refreshDocumentOutline(fresh.client, DOC)).resolves.toBe('fresh');
		const deleted = fakeClient({
			content: TEXT,
			content_hash: hash,
			outline: null,
			deleted_at: '2026-11-01T00:00:00Z'
		});
		await expect(refreshDocumentOutline(deleted.client, DOC)).resolves.toBe('skipped');
		expect([...fresh.writes, ...deleted.writes]).toEqual([]);
	});

	it('never throws, so the embedding job still runs', async () => {
		const { client } = fakeClient(
			{
				content: TEXT,
				content_hash: hashDocumentContent(TEXT),
				outline: extractOutline('## Old'),
				deleted_at: null
			},
			true
		);
		await expect(refreshDocumentOutline(client, DOC)).resolves.toBe('failed');
		const broken = {
			from: () => {
				throw new Error('network');
			}
		} as unknown as OutlineRefreshClient;
		await expect(refreshDocumentOutline(broken, DOC)).resolves.toBe('failed');
	});
});
