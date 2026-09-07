// Trusted worker composition only. Not activated, and never owns a service key.
import { createHash } from 'node:crypto';
import type { LibriUploadClaim } from './uploadProcessing';
import { LIBRI_UPLOAD_IMAGE_LIMITS, type LibriVerifiedUploadImage } from './uploadImageVerifier';

type Verified = Omit<LibriVerifiedUploadImage, 'bytes'>;
type Fence = Readonly<
	Pick<
		LibriUploadClaim,
		'libraryId' | 'uploadId' | 'bookId' | 'leaseToken' | 'attempt' | 'leaseExpiresAt'
	>
>;
export type LibriPreparedPublication = Readonly<{
	publicationId: string;
	libraryId: string;
	uploadId: string;
	bookId: string;
	leaseToken: string;
	attempt: number;
	bucketId: 'libri-assets';
	objectPath: string;
}>;
export type LibriPublicationReceipt = {
	publicationId: string;
	imageId: string;
	sourceId: string;
	alreadyPublished: boolean;
};
export type LibriPublicationPorts = {
	prepare(input: {
		claim: Fence;
		verified: Readonly<Verified>;
		signal: AbortSignal;
	}): Promise<unknown>;
	// Trusted adapter MUST perform one create-only write of these exact owned bytes.
	// A preexisting object/uncertain result is NOT success and must not be adopted here.
	createObject(input: {
		publication: LibriPreparedPublication;
		bytes: Buffer;
		verified: Readonly<Verified>;
		upsert: false;
		signal: AbortSignal;
	}): Promise<{ objectPath: string }>;
	// Trusted server must attest the exact successful Storage write. SQL cannot inspect
	// bytes; do not expose a raw caller-supplied Storage object ID to the service-role RPC.
	finalize(input: {
		claim: Fence;
		publicationId: string;
		verified: Readonly<Verified>;
		signal: AbortSignal;
	}): Promise<unknown>;
};
export class LibriUploadPublicationError extends Error {
	constructor(
		readonly code: string,
		readonly mayHaveWrittenObject: boolean
	) {
		super('Libri upload publication failed: ' + code);
		this.name = 'LibriUploadPublicationError';
	}
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** One coordinator per dedicated Libri process. Prepare -> exact immutable write ->
 * atomic finalize. No automatic retries, compensation deletes, quota release, or OCR.
 * On unknown outcomes, reconcile the durable publication record before any new attempt.
 */
export function createLibriUploadPublisher(ports: LibriPublicationPorts) {
	let busy = false;
	return {
		isBusy: () => busy,
		async publish(input: {
			claim: LibriUploadClaim;
			verified: LibriVerifiedUploadImage;
			signal: AbortSignal;
		}): Promise<LibriPublicationReceipt> {
			if (busy) throw new LibriUploadPublicationError('publication_busy', false);
			const invalid = () => {
				throw new LibriUploadPublicationError('invalid_publication_input', false);
			};
			if (!(input.signal instanceof AbortSignal) || input.signal.aborted) invalid();
			const c = input.claim,
				v = input.verified;
			if (
				!c ||
				!v ||
				![c.libraryId, c.uploadId, c.bookId, c.leaseToken].every(
					(id) => typeof id === 'string' && UUID.test(id)
				) ||
				!Number.isSafeInteger(c.attempt) ||
				c.attempt < 1 ||
				c.attempt > 3 ||
				typeof c.leaseExpiresAt !== 'string' ||
				c.leaseExpiresAt.length > 64 ||
				!Buffer.isBuffer(v.bytes) ||
				v.bytes.length < 1 ||
				v.bytes.length > LIBRI_UPLOAD_IMAGE_LIMITS.bytes ||
				v.byteSize !== v.bytes.length ||
				!c.declaration ||
				v.byteSize !== c.declaration.byteSize ||
				v.mimeType !== c.declaration.mimeType ||
				v.sha256 !== c.declaration.sha256 ||
				!['image/png', 'image/jpeg', 'image/webp'].includes(v.mimeType) ||
				typeof v.sha256 !== 'string' ||
				!/^[0-9a-f]{64}$/.test(v.sha256) ||
				![v.width, v.height, v.channels].every((n) => Number.isSafeInteger(n) && n > 0) ||
				v.width > LIBRI_UPLOAD_IMAGE_LIMITS.dimension ||
				v.height > LIBRI_UPLOAD_IMAGE_LIMITS.dimension ||
				v.width * v.height > LIBRI_UPLOAD_IMAGE_LIMITS.pixels ||
				v.channels > 4
			)
				invalid();
			const remaining = Date.parse(c.leaseExpiresAt) - Date.now() - 2000;
			if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 92000) invalid();
			const started = performance.now(),
				budget = Math.min(30000, remaining);
			const bytes = Buffer.from(v.bytes); // own before the first await
			if (digest(bytes) !== v.sha256) invalid();
			const verified: Readonly<Verified> = Object.freeze({
				mimeType: v.mimeType,
				byteSize: v.byteSize,
				sha256: v.sha256,
				width: v.width,
				height: v.height,
				channels: v.channels
			});
			const claim: Fence = Object.freeze({
				libraryId: c.libraryId,
				uploadId: c.uploadId,
				bookId: c.bookId,
				leaseToken: c.leaseToken,
				attempt: c.attempt,
				leaseExpiresAt: c.leaseExpiresAt
			});
			const caller = input.signal,
				timeout = new AbortController();
			const signal = AbortSignal.any([caller, timeout.signal]);
			let mayHaveWrittenObject = false;
			const fail: (code: string) => never = (code) => {
				throw new LibriUploadPublicationError(code, mayHaveWrittenObject);
			};
			const interrupted = () =>
				new LibriUploadPublicationError(
					caller.aborted ? 'publication_aborted' : 'publication_timeout',
					mayHaveWrittenObject
				);
			const check = () => {
				if (
					performance.now() - started >= budget ||
					Date.now() + 2000 >= Date.parse(claim.leaseExpiresAt)
				)
					timeout.abort();
				if (signal.aborted) throw interrupted();
			};
			busy = true;
			const timer = setTimeout(() => timeout.abort(), budget);
			let rejectInterrupted = () => {};
			const interruption = new Promise<never>((_resolve, reject) => {
				rejectInterrupted = () => reject(interrupted());
				signal.addEventListener('abort', rejectInterrupted, { once: true });
			});
			const work = (async () => {
				check();
				const result = await ports.prepare({ claim, verified, signal });
				check();
				if (!record(result) || !record(result.verified_metadata))
					fail('invalid_publication_preparation');
				const preparedMetadata = result.verified_metadata;
				const expectedExtension =
					verified.mimeType === 'image/jpeg'
						? 'jpeg'
						: verified.mimeType === 'image/png'
							? 'png'
							: 'webp';
				if (
					typeof result.publication_id !== 'string' ||
					!UUID.test(result.publication_id) ||
					result.library_id !== claim.libraryId ||
					result.upload_id !== claim.uploadId ||
					result.book_id !== claim.bookId ||
					result.lease_token !== claim.leaseToken ||
					result.attempt !== claim.attempt ||
					result.bucket_id !== 'libri-assets' ||
					result.status !== 'prepared' ||
					result.object_path !==
						claim.libraryId +
							'/images/' +
							result.publication_id +
							'/original.' +
							expectedExtension ||
					Object.keys(result.verified_metadata).length !== 6 ||
					Object.entries(verified).some(([key, value]) => preparedMetadata[key] !== value)
				)
					fail('invalid_publication_preparation');
				const publication: LibriPreparedPublication = Object.freeze({
					publicationId: result.publication_id,
					libraryId: claim.libraryId,
					uploadId: claim.uploadId,
					bookId: claim.bookId,
					leaseToken: claim.leaseToken,
					attempt: claim.attempt,
					bucketId: 'libri-assets',
					objectPath: String(result.object_path)
				});
				mayHaveWrittenObject = true; // conservative even if a transport throws synchronously
				const uploaded = await ports.createObject({
					publication,
					bytes,
					verified,
					upsert: false,
					signal
				});
				check();
				if (!uploaded || uploaded.objectPath !== publication.objectPath)
					fail('invalid_storage_publication_receipt');
				if (digest(bytes) !== verified.sha256) fail('publication_bytes_changed');
				check();
				const completed = await ports.finalize({
					claim,
					publicationId: publication.publicationId,
					verified,
					signal
				});
				check();
				if (
					!record(completed) ||
					completed.publication_id !== publication.publicationId ||
					completed.image_id !== publication.publicationId ||
					completed.source_id !== publication.publicationId ||
					completed.status !== 'published' ||
					typeof completed.already_published !== 'boolean'
				)
					fail('publication_outcome_unknown');
				return {
					publicationId: publication.publicationId,
					imageId: publication.publicationId,
					sourceId: publication.publicationId,
					alreadyPublished: completed.already_published
				};
			})();
			void work.then(
				() => {
					busy = false;
				},
				() => {
					busy = false;
				}
			);
			try {
				return await Promise.race([work, interruption]);
			} catch (cause) {
				if (cause instanceof LibriUploadPublicationError) throw cause;
				return fail('publication_outcome_unknown');
			} finally {
				clearTimeout(timer);
				signal.removeEventListener('abort', rejectInterrupted);
				timeout.abort();
			}
		}
	};
}
