import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createLibriUploadPublisher,
	type LibriPublicationPorts
} from '../src/workers/libri/uploadPublication';
import type { LibriUploadClaim } from '../src/workers/libri/uploadProcessing';
import type { LibriVerifiedUploadImage } from '../src/workers/libri/uploadImageVerifier';

const NOW = Date.parse('2026-09-07T05:00:00Z');
const libraryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const publicationId = '99999999-9999-4999-8999-999999999991',
	storageObjectId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
function fixture() {
	const bytes = Buffer.from('owned bytes already verified by the native image verifier');
	const verified: LibriVerifiedUploadImage = {
		bytes,
		mimeType: 'image/png',
		byteSize: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		width: 4,
		height: 4,
		channels: 3
	};
	const claim: LibriUploadClaim = {
		libraryId,
		uploadId,
		bookId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		leaseToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
		attempt: 1,
		leaseExpiresAt: new Date(NOW + 90000).toISOString(),
		objectPath: libraryId + '/uploads/' + uploadId + '/original.png',
		declaration: {
			mimeType: verified.mimeType,
			byteSize: verified.byteSize,
			sha256: verified.sha256
		}
	};
	const { bytes: _, ...metadata } = verified;
	const prepared = {
		publication_id: publicationId,
		library_id: libraryId,
		upload_id: uploadId,
		book_id: claim.bookId,
		lease_token: claim.leaseToken,
		attempt: 1,
		bucket_id: 'libri-assets',
		status: 'prepared',
		object_path: libraryId + '/images/' + publicationId + '/original.png',
		verified_metadata: metadata
	};
	const completed = {
		publication_id: publicationId,
		image_id: publicationId,
		source_id: publicationId,
		status: 'published',
		already_published: false
	};
	const prepare = vi.fn<LibriPublicationPorts['prepare']>().mockResolvedValue(prepared);
	const createObject = vi
		.fn<LibriPublicationPorts['createObject']>()
		.mockResolvedValue({ storageObjectId });
	const finalize = vi.fn<LibriPublicationPorts['finalize']>().mockResolvedValue(completed);
	const publisher = createLibriUploadPublisher({ prepare, createObject, finalize });
	const controller = new AbortController();
	return {
		publisher,
		prepare,
		createObject,
		finalize,
		prepared,
		completed,
		controller,
		input: { claim, verified, signal: controller.signal }
	};
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('Libri immutable publication coordinator', () => {
	it('prepares once, creates exact owned bytes once, then finalizes the complete fence', async () => {
		const f = fixture();
		expect(await f.publisher.publish(f.input)).toEqual({
			publicationId,
			imageId: publicationId,
			sourceId: publicationId,
			alreadyPublished: false
		});
		expect(f.prepare).toHaveBeenCalledOnce();
		expect(f.createObject).toHaveBeenCalledOnce();
		expect(f.finalize).toHaveBeenCalledOnce();
		const put = f.createObject.mock.calls[0][0];
		expect(put.upsert).toBe(false);
		expect(put.bytes).toEqual(f.input.verified.bytes);
		expect(put.bytes).not.toBe(f.input.verified.bytes);
		expect(put.publication.objectPath).toBe(f.prepared.object_path);
		expect(f.finalize.mock.calls[0][0]).toMatchObject({
			publicationId,
			storageObjectId,
			claim: { libraryId, uploadId, attempt: 1, leaseToken: f.input.claim.leaseToken }
		});
		expect(f.prepare.mock.invocationCallOrder[0]).toBeLessThan(
			f.createObject.mock.invocationCallOrder[0]
		);
		expect(f.createObject.mock.invocationCallOrder[0]).toBeLessThan(
			f.finalize.mock.invocationCallOrder[0]
		);
		expect(f.publisher.isBusy()).toBe(false);
	});
	it('snapshots caller bytes, metadata and identity before any await', async () => {
		const f = fixture(),
			original = Buffer.from(f.input.verified.bytes);
		let release!: (v: unknown) => void;
		f.prepare.mockReturnValue(
			new Promise((done) => {
				release = done;
			})
		);
		const result = f.publisher.publish(f.input);
		f.input.verified.bytes.fill(0);
		f.input.verified.width = 99;
		f.input.claim.uploadId = storageObjectId;
		release(f.prepared);
		await result;
		expect(f.createObject.mock.calls[0][0].bytes).toEqual(original);
		expect(f.createObject.mock.calls[0][0].verified.width).toBe(4);
		expect(f.finalize.mock.calls[0][0].claim.uploadId).toBe(uploadId);
	});
	it.each([
		'library_id',
		'upload_id',
		'book_id',
		'lease_token',
		'publication_id',
		'bucket_id',
		'object_path',
		'status'
	])('rejects a retargeted %s', async (key) => {
		const f = fixture();
		f.prepare.mockResolvedValue({ ...f.prepared, [key]: 'wrong' });
		await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
			code: 'invalid_publication_preparation',
			mayHaveWrittenObject: false
		});
		expect(f.createObject).not.toHaveBeenCalled();
		expect(f.finalize).not.toHaveBeenCalled();
	});
	it.each([null, {}, [], { width: 3 }])(
		'requires complete verified metadata: %j',
		async (metadata) => {
			const f = fixture();
			f.prepare.mockResolvedValue({ ...f.prepared, verified_metadata: metadata });
			await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'invalid_publication_preparation'
			});
			expect(f.createObject).not.toHaveBeenCalled();
		}
	);
	it.each(['bad_hash', 'bad_dimensions', 'bad_size', 'expired', 'bad_uuid'])(
		'rejects unsafe input: %s',
		async (scenario) => {
			const f = fixture();
			if (scenario === 'bad_hash') f.input.verified.bytes.fill(0);
			if (scenario === 'bad_dimensions') f.input.verified.width = 16385;
			if (scenario === 'bad_size') f.input.verified.byteSize++;
			if (scenario === 'expired') f.input.claim.leaseExpiresAt = new Date(NOW).toISOString();
			if (scenario === 'bad_uuid') f.input.claim.leaseToken = 'invalid';
			await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'invalid_publication_input'
			});
			expect(f.prepare).not.toHaveBeenCalled();
		}
	);
	it('does not finalize after a failed or ambiguous create-only Storage write', async () => {
		const f = fixture();
		f.createObject.mockRejectedValue(new Error('secret URL and provider details'));
		await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
			code: 'publication_outcome_unknown',
			mayHaveWrittenObject: true,
			message: 'Libri upload publication failed: publication_outcome_unknown'
		});
		expect(f.createObject).toHaveBeenCalledOnce();
		expect(f.finalize).not.toHaveBeenCalled();
	});
	it('refuses bytes changed inside the storage adapter before finalization', async () => {
		const f = fixture();
		f.createObject.mockImplementation(async ({ bytes }) => {
			bytes.fill(0);
			return { storageObjectId };
		});
		await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
			code: 'publication_bytes_changed',
			mayHaveWrittenObject: true
		});
		expect(f.finalize).not.toHaveBeenCalled();
	});
	it.each([null, {}, { storageObjectId: 'wrong' }])(
		'rejects malformed Storage receipts: %j',
		async (value) => {
			const f = fixture();
			f.createObject.mockResolvedValue(value as never);
			await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'invalid_storage_publication_receipt',
				mayHaveWrittenObject: true
			});
			expect(f.finalize).not.toHaveBeenCalled();
		}
	);
	it.each([null, {}, { status: 'prepared' }, { image_id: storageObjectId }])(
		'never treats uncertain finalization as success: %j',
		async (value) => {
			const f = fixture();
			f.finalize.mockResolvedValue(value);
			await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'publication_outcome_unknown',
				mayHaveWrittenObject: true
			});
			expect(f.finalize).toHaveBeenCalledOnce();
			expect(f.createObject).toHaveBeenCalledOnce();
		}
	);
	it('accepts only an exact already-committed completion receipt', async () => {
		const f = fixture();
		f.finalize.mockResolvedValue({ ...f.completed, already_published: true });
		expect((await f.publisher.publish(f.input)).alreadyPublished).toBe(true);
	});
	it.each(['prepare', 'createObject', 'finalize'] as const)(
		'retains one busy slot for an uncooperative %s after timeout',
		async (stage) => {
			const f = fixture();
			let release!: (value: unknown) => void;
			(f[stage] as ReturnType<typeof vi.fn>).mockReturnValue(
				new Promise((done) => {
					release = done;
				})
			);
			const result = expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'publication_timeout',
				mayHaveWrittenObject: stage !== 'prepare'
			});
			await vi.advanceTimersByTimeAsync(30000);
			await result;
			expect(f.publisher.isBusy()).toBe(true);
			await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
				code: 'publication_busy'
			});
			release(
				stage === 'prepare'
					? f.prepared
					: stage === 'createObject'
						? { storageObjectId }
						: f.completed
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(f.publisher.isBusy()).toBe(false);
			if (stage === 'prepare') expect(f.createObject).not.toHaveBeenCalled();
			if (stage === 'createObject') expect(f.finalize).not.toHaveBeenCalled();
		}
	);
	it('respects caller cancellation before writing any object', async () => {
		const f = fixture();
		f.prepare.mockImplementation(async () => {
			f.controller.abort();
			return f.prepared;
		});
		await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
			code: 'publication_aborted',
			mayHaveWrittenObject: false
		});
		expect(f.createObject).not.toHaveBeenCalled();
	});
	it('rejects expired leases even when a timer callback has not fired', async () => {
		const f = fixture();
		f.prepare.mockImplementation(async () => {
			vi.setSystemTime(NOW + 91000);
			return f.prepared;
		});
		await expect(f.publisher.publish(f.input)).rejects.toMatchObject({
			code: 'publication_timeout'
		});
		expect(f.createObject).not.toHaveBeenCalled();
	});
});
