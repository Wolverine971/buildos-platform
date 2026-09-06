// Worker-only byte validation. No database, Storage, queue, or publication authority.
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const LIBRI_UPLOAD_IMAGE_LIMITS = Object.freeze({
	bytes: 25 * 1024 * 1024,
	pixels: 40_000_000,
	dimension: 16_384,
	containerChunks: 4096,
	streamChunks: 65_536,
	deadlineMs: 15_000,
	decodeSeconds: 5
});
type Mime = 'image/jpeg' | 'image/png' | 'image/webp';
export type LibriUploadImageDeclaration = { mimeType: Mime; byteSize: number; sha256: string };
export type LibriDecodedImage = { mimeType: Mime; width: number; height: number; channels: number };
export type LibriVerifiedUploadImage = LibriDecodedImage & {
	// Publish these exact owned bytes, never a second read/copy of mutable staging storage.
	bytes: Buffer;
	byteSize: number;
	sha256: string;
};
type Decoder = (bytes: Buffer, mime: Mime, signal: AbortSignal) => Promise<LibriDecodedImage>;
export class LibriUploadVerificationError extends Error {
	constructor(
		readonly code: string,
		readonly retryable: boolean
	) {
		super(`Libri upload verification failed: ${code}`);
		this.name = 'LibriUploadVerificationError';
	}
}
const fail = (code: string, retryable = false): never => {
	throw new LibriUploadVerificationError(code, retryable);
};
const discard = (body: ReadableStream<Uint8Array>) => {
	void body.cancel().catch(() => undefined);
};

/** Owns the input stream. One instance per dedicated Libri process, not per job.
 * The trusted decoder seam is for tests; never accept it from an API/job payload.
 * Cancellation returns promptly but does NOT claim to terminate native code. Busy
 * capacity remains occupied until the actual operation settles, even after timeout.
 */
export function createLibriUploadImageVerifier(
	options: { decoder?: Decoder; deadlineMs?: number } = {}
) {
	const deadlineMs = options.deadlineMs ?? LIBRI_UPLOAD_IMAGE_LIMITS.deadlineMs;
	if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 250 || deadlineMs > 15_000)
		throw new Error('Libri verification deadline must be between 250 and 15000ms');
	const decoder = options.decoder ?? decodeImage;
	let busy = false;
	return {
		isBusy: () => busy,
		async verify(input: {
			body: ReadableStream<Uint8Array>;
			declaration: LibriUploadImageDeclaration;
			signal: AbortSignal;
		}): Promise<LibriVerifiedUploadImage> {
			if (busy) {
				discard(input.body);
				return fail('verification_busy', true);
			}
			if (input.signal.aborted) {
				discard(input.body);
				return fail('verification_aborted', true);
			}
			if (!input.declaration || typeof input.declaration !== 'object') {
				discard(input.body);
				return fail('invalid_declaration');
			}
			const { mimeType, byteSize, sha256 } = input.declaration;
			if (
				!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ||
				!Number.isSafeInteger(byteSize) ||
				byteSize < 1 ||
				byteSize > LIBRI_UPLOAD_IMAGE_LIMITS.bytes ||
				typeof sha256 !== 'string' ||
				!/^[0-9a-f]{64}$/.test(sha256)
			) {
				discard(input.body);
				return fail('invalid_declaration');
			}
			busy = true;
			const timeout = new AbortController();
			const timer = setTimeout(() => timeout.abort(), deadlineMs);
			const signal = AbortSignal.any([input.signal, timeout.signal]);
			const interrupted = () =>
				new LibriUploadVerificationError(
					input.signal.aborted ? 'verification_aborted' : 'verification_timeout',
					true
				);
			let rejectInterrupted: () => void = () => {};
			const interruption = new Promise<never>((_resolve, reject) => {
				rejectInterrupted = () => reject(interrupted());
				signal.addEventListener('abort', rejectInterrupted, { once: true });
			});
			const work = (async () => {
				const bytes = await readImageBytes(input.body, byteSize, signal);
				if (signal.aborted) throw interrupted();
				const digest = createHash('sha256').update(bytes).digest('hex');
				if (digest !== sha256) fail('sha256_mismatch');
				checkContainer(bytes, mimeType);
				const decoded = await decoder(bytes, mimeType, signal);
				if (signal.aborted) throw interrupted();
				validateDimensions(decoded);
				if (decoded.mimeType !== mimeType) fail('mime_mismatch');
				return { ...decoded, bytes, byteSize, sha256: digest };
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
			} catch (error) {
				if (signal.aborted) throw interrupted();
				if (error instanceof LibriUploadVerificationError) throw error;
				return fail('read_or_decoder_unavailable', true);
			} finally {
				clearTimeout(timer);
				signal.removeEventListener('abort', rejectInterrupted);
			}
		}
	};
}

async function readImageBytes(
	body: ReadableStream<Uint8Array>,
	expected: number,
	signal: AbortSignal
) {
	const reader = body.getReader();
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	const bytes = Buffer.allocUnsafe(expected);
	let offset = 0;
	let chunks = 0;
	try {
		signal.addEventListener('abort', cancel, { once: true });
		if (signal.aborted) fail('verification_aborted', true);
		while (true) {
			const next = await reader.read();
			if (signal.aborted) fail('verification_aborted', true);
			if (next.done) break;
			// Bound even zero-byte reads: a microtask-only source must not starve timers.
			if (++chunks > LIBRI_UPLOAD_IMAGE_LIMITS.streamChunks)
				fail('stream_chunk_limit_exceeded', true);
			if (!(next.value instanceof Uint8Array)) fail('invalid_byte_stream');
			if (next.value.byteLength > expected - offset) fail('byte_size_mismatch');
			bytes.set(next.value, offset);
			offset += next.value.byteLength;
		}
		if (offset !== expected) fail('byte_size_mismatch');
		return bytes;
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel(); // An upstream cancellation promise cannot stall rejection or release.
		reader.releaseLock();
	}
}

function checkContainer(bytes: Buffer, mime: Mime) {
	if (mime === 'image/jpeg') {
		if (
			bytes.length < 4 ||
			bytes[0] !== 0xff ||
			bytes[1] !== 0xd8 ||
			bytes[2] !== 0xff ||
			bytes[bytes.length - 2] !== 0xff ||
			bytes[bytes.length - 1] !== 0xd9
		)
			fail('invalid_image_container');
		return;
	}
	if (mime === 'image/png') {
		if (
			bytes.length < 33 ||
			!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
		)
			fail('invalid_image_container');
		let offset = 8,
			count = 0,
			pixels = false;
		while (offset < bytes.length) {
			if (++count > LIBRI_UPLOAD_IMAGE_LIMITS.containerChunks || bytes.length - offset < 12)
				fail('invalid_image_container');
			const length = bytes.readUInt32BE(offset);
			if (length > bytes.length - offset - 12) fail('invalid_image_container');
			const kind = bytes.toString('ascii', offset + 4, offset + 8);
			if (count === 1 && (kind !== 'IHDR' || length !== 13)) fail('invalid_image_container');
			if (['acTL', 'fcTL', 'fdAT'].includes(kind)) fail('animated_image');
			if (kind === 'IDAT' && length > 0) pixels = true;
			offset += length + 12;
			if (kind === 'IEND') {
				if (length !== 0 || !pixels || offset !== bytes.length)
					fail('invalid_image_container');
				return;
			}
		}
		fail('invalid_image_container');
	}
	if (
		bytes.length < 20 ||
		bytes.toString('ascii', 0, 4) !== 'RIFF' ||
		bytes.toString('ascii', 8, 12) !== 'WEBP' ||
		bytes.readUInt32LE(4) + 8 !== bytes.length
	)
		fail('invalid_image_container');
	let offset = 12,
		count = 0;
	while (offset < bytes.length) {
		if (++count > LIBRI_UPLOAD_IMAGE_LIMITS.containerChunks || bytes.length - offset < 8)
			fail('invalid_image_container');
		const kind = bytes.toString('ascii', offset, offset + 4);
		const length = bytes.readUInt32LE(offset + 4);
		if (length + (length % 2) > bytes.length - offset - 8) fail('invalid_image_container');
		if (kind === 'ANIM' || kind === 'ANMF') fail('animated_image');
		offset += 8 + length + (length % 2);
	}
}

function validateDimensions(image: LibriDecodedImage) {
	if (
		![image.width, image.height, image.channels].every(Number.isSafeInteger) ||
		image.width < 1 ||
		image.height < 1 ||
		image.width > LIBRI_UPLOAD_IMAGE_LIMITS.dimension ||
		image.height > LIBRI_UPLOAD_IMAGE_LIMITS.dimension ||
		image.width * image.height > LIBRI_UPLOAD_IMAGE_LIMITS.pixels ||
		image.channels < 1 ||
		image.channels > 4
	)
		fail('image_dimensions_exceeded');
}

async function decodeImage(
	bytes: Buffer,
	mime: Mime,
	signal: AbortSignal
): Promise<LibriDecodedImage> {
	const decoder = sharp(bytes, {
		failOn: 'warning',
		limitInputPixels: LIBRI_UPLOAD_IMAGE_LIMITS.pixels,
		limitInputChannels: 4,
		sequentialRead: true,
		unlimited: false,
		pages: 1
	});
	const abort = () => decoder.destroy();
	signal.addEventListener('abort', abort, { once: true });
	try {
		if (signal.aborted) fail('verification_aborted', true);
		const metadata = await decoder.metadata();
		if (signal.aborted) fail('verification_aborted', true);
		if (`image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}` !== mime)
			fail('mime_mismatch');
		if ((metadata.pages ?? 1) !== 1) fail('animated_image');
		const result = {
			mimeType: mime,
			width: metadata.width,
			height: metadata.height,
			channels: metadata.channels
		};
		validateDimensions(result);
		// metadata() alone never validates compressed pixels. Force a full decode,
		// without resize/downsampling that could hide invalid image data.
		const decoded = await decoder
			.timeout({ seconds: LIBRI_UPLOAD_IMAGE_LIMITS.decodeSeconds })
			.raw({ depth: 'uchar' })
			.toBuffer({ resolveWithObject: true });
		if (signal.aborted) fail('verification_aborted', true);
		validateDimensions({ ...result, ...decoded.info });
		if (
			decoded.info.width !== result.width ||
			decoded.info.height !== result.height ||
			decoded.data.length !== decoded.info.width * decoded.info.height * decoded.info.channels
		)
			fail('invalid_decoded_image');
		return { ...result, channels: decoded.info.channels };
	} catch (error) {
		if (error instanceof LibriUploadVerificationError) throw error;
		if (signal.aborted) fail('verification_aborted', true);
		// Sharp's libvips timeout emits this fixed progress message. Classify only
		// this known timeout and never copy native error text into the receipt.
		if (
			error instanceof Error &&
			/(?:^|\n)timeout: \d{1,3}% complete(?:\n|$)/.test(error.message)
		)
			fail('decoder_timeout', true);
		return fail('invalid_image');
	} finally {
		signal.removeEventListener('abort', abort);
		decoder.destroy();
	}
}
