import { describe, expect, it, vi } from 'vitest';
import type { LibriPgPool } from '../src/workers/libri/database';
import { createLibriUploadProcessing } from '../src/workers/libri/uploadProcessing';

const libraryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const leaseToken = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const input = { libraryId, uploadId, leaseToken };
const receipt = () => ({
	library_id: libraryId,
	upload_id: uploadId,
	lease_token: leaseToken,
	book_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	object_path: `${libraryId}/uploads/${uploadId}/original.png`,
	declaration: {
		mimeType: 'image/png',
		byteSize: 1024,
		sha256: 'a'.repeat(64),
		imageType: 'page'
	},
	attempt: 1,
	lease_expires_at: '2026-09-06T21:00:00.000Z'
});
function harness(rows: Record<string, unknown>[]) {
	const query = vi.fn(async () => ({
		rows,
		rowCount: rows.length,
		fields: [],
		command: 'SELECT',
		oid: 0
	}));
	return { query, port: createLibriUploadProcessing({ query: query as LibriPgPool['query'] }) };
}
describe('Libri upload processing database port', () => {
	it('lists a bounded set of IDs without raw table reads', async () => {
		const { port, query } = harness([{ upload_id: uploadId }]);
		expect(await port.listCandidates(libraryId.toUpperCase())).toEqual([uploadId]);
		expect(query).toHaveBeenCalledWith(
			'SELECT upload_id FROM libri.list_image_upload_candidates($1::uuid)',
			[libraryId]
		);
	});
	it.each([
		{ rows: Array.from({ length: 11 }, () => ({ upload_id: uploadId })) },
		{ rows: [{ upload_id: uploadId }, { upload_id: uploadId }] },
		{ rows: [{ upload_id: '../private' }] }
	])('rejects malformed candidate sets', async ({ rows }) => {
		await expect(harness(rows).port.listCandidates(libraryId)).rejects.toThrow('Invalid Libri');
	});
	it('maps an exact scoped claim without generating or replacing its retry token', async () => {
		const { port, query } = harness([{ receipt: receipt() }]);
		expect(await port.claim(input)).toMatchObject({
			...input,
			attempt: 1,
			objectPath: receipt().object_path,
			declaration: receipt().declaration
		});
		expect(query).toHaveBeenCalledWith(
			'SELECT libri.claim_image_upload($1::uuid, $2::uuid, $3::uuid) AS receipt',
			[libraryId, uploadId, leaseToken]
		);
		expect(query).toHaveBeenCalledOnce();
	});
	it('distinguishes no available lease from a malformed response', async () => {
		expect(await harness([{ receipt: null }]).port.claim(input)).toBeNull();
		for (const rows of [
			[],
			[{}],
			[{ receipt: [] }],
			[{ receipt: receipt() }, { receipt: receipt() }]
		])
			await expect(harness(rows).port.claim(input)).rejects.toThrow(
				'Invalid Libri upload processing receipt'
			);
	});
	it.each([
		{ library_id: uploadId },
		{ upload_id: libraryId },
		{ lease_token: uploadId },
		{ object_path: 'other-library/canonical.png' },
		{ object_path: `${libraryId}/uploads/${uploadId}/original.jpeg` },
		{ book_id: 'bad' },
		{ attempt: 0 },
		{ attempt: 4 },
		{ attempt: 1.5 },
		{ attempt: '1' },
		{ lease_expires_at: 'not a date' },
		{ declaration: null },
		{ declaration: { ...receipt().declaration, mimeType: 'image/svg+xml' } },
		{ declaration: { ...receipt().declaration, byteSize: 26_214_401 } },
		{ declaration: { ...receipt().declaration, byteSize: '1024' } },
		{ declaration: { ...receipt().declaration, sha256: 'A'.repeat(64) } }
	])('rejects an invalid or substituted claim receipt: %j', async (override) => {
		await expect(
			harness([{ receipt: { ...receipt(), ...override } }]).port.claim(input)
		).rejects.toThrow('Invalid Libri');
	});
	it('sends the complete fencing tuple and only an allowlisted safe failure code', async () => {
		const { port, query } = harness([{ accepted: true }]);
		expect(await port.fail({ ...input, attempt: 2, failureCode: 'storage_unavailable' })).toBe(
			true
		);
		expect(query).toHaveBeenCalledWith(
			'SELECT libri.fail_image_upload($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::text) AS accepted',
			[libraryId, uploadId, leaseToken, 2, 'storage_unavailable']
		);
		expect(
			await harness([{ accepted: false }]).port.fail({
				...input,
				attempt: 2,
				failureCode: 'invalid_image'
			})
		).toBe(false);
	});
	it('rejects invalid requests before any database call', async () => {
		const { port, query } = harness([]);
		await expect(
			port.claim({ ...input, uploadId: "x'); DROP TABLE libri.images;--" })
		).rejects.toThrow('Invalid Libri upload identifier');
		await expect(port.fail({ ...input, attempt: 4, failureCode: 'cancelled' })).rejects.toThrow(
			'Invalid Libri upload failure'
		);
		const bad = { ...input, attempt: 1, failureCode: 'cancelled' as const };
		Object.assign(bad, { failureCode: 'provider-secret-token' });
		await expect(port.fail(bad)).rejects.toThrow('Invalid Libri upload failure');
		expect(query).not.toHaveBeenCalled();
	});
	it('rejects missing or truthy-but-not-boolean acknowledgments', async () => {
		for (const rows of [[], [{ accepted: 'true' }], [{ accepted: true }, { accepted: true }]])
			await expect(
				harness(rows).port.fail({ ...input, attempt: 1, failureCode: 'cancelled' })
			).rejects.toThrow('Invalid Libri upload processing receipt');
	});
	it('redacts provider errors and never retries an ambiguous mutation automatically', async () => {
		const { query, port } = harness([]);
		query.mockRejectedValueOnce(new Error('postgres://private-secret@host/db'));
		await expect(port.claim(input)).rejects.toThrow(
			'Libri upload processing database request failed'
		);
		expect(query).toHaveBeenCalledOnce();
	});
});
