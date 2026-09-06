import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
	createLibriUploadImageVerifier,
	LIBRI_UPLOAD_IMAGE_LIMITS,
	type LibriDecodedImage,
	type LibriUploadImageDeclaration
} from '../src/workers/libri/uploadImageVerifier';

type Mime = LibriUploadImageDeclaration['mimeType'];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function body(bytes: Buffer) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += 17)
				controller.enqueue(bytes.subarray(i, i + 17));
			controller.close();
		}
	});
}
function input(bytes: Buffer, mimeType: Mime = 'image/png') {
	return {
		body: body(bytes),
		declaration: { byteSize: bytes.length, sha256: hash(bytes), mimeType },
		signal: new AbortController().signal
	};
}
async function picture(mime: Mime = 'image/png') {
	const pixels = Buffer.from(
		Array.from({ length: 32 * 24 * 3 }, (_, i) => (i * 71 + (i % 23) * 17) % 256)
	);
	return sharp(pixels, { raw: { width: 32, height: 24, channels: 3 } })
		.toFormat(mime === 'image/jpeg' ? 'jpeg' : mime === 'image/png' ? 'png' : 'webp')
		.toBuffer();
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { resolve, promise };
}
const decoded: LibriDecodedImage = { mimeType: 'image/png', width: 32, height: 24, channels: 3 };
function pngChunk(kind: string, payload: Buffer) {
	const result = Buffer.alloc(payload.length + 12);
	result.writeUInt32BE(payload.length);
	result.write(kind, 4, 4, 'ascii');
	payload.copy(result, 8);
	let crc = 0xffffffff;
	for (const byte of result.subarray(4, result.length - 4)) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
	return result;
}
function changePng(bytes: Buffer, kind: string, replace: (payload: Buffer) => Buffer) {
	const chunks = [bytes.subarray(0, 8)];
	for (let offset = 8; offset < bytes.length; ) {
		const length = bytes.readUInt32BE(offset);
		const type = bytes.toString('ascii', offset + 4, offset + 8);
		chunks.push(
			type === kind
				? pngChunk(type, replace(bytes.subarray(offset + 8, offset + 8 + length)))
				: bytes.subarray(offset, offset + length + 12)
		);
		offset += length + 12;
	}
	return Buffer.concat(chunks);
}

describe('worker-only Libri upload image verification', () => {
	it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
		'fully decodes %s and returns only owned verified originals',
		async (mime) => {
			const bytes = await picture(mime);
			const original = Buffer.from(bytes);
			const verifier = createLibriUploadImageVerifier();
			const result = await verifier.verify(input(bytes, mime));
			expect(result).toMatchObject({
				mimeType: mime,
				width: 32,
				height: 24,
				channels: 3,
				byteSize: bytes.length,
				sha256: hash(bytes)
			});
			expect(result.bytes).toEqual(bytes);
			bytes.fill(0);
			expect(result.bytes).toEqual(original);
			expect(verifier.isBusy()).toBe(false);
		}
	);
	it.each([0, -1, 1.2, LIBRI_UPLOAD_IMAGE_LIMITS.bytes + 1, NaN])(
		'rejects invalid declaration size %s before decoder work',
		async (size) => {
			const decoder = vi.fn();
			const request = input(await picture());
			request.declaration.byteSize = size;
			await expect(
				createLibriUploadImageVerifier({ decoder }).verify(request)
			).rejects.toMatchObject({ code: 'invalid_declaration', retryable: false });
			expect(decoder).not.toHaveBeenCalled();
		}
	);
	it('rejects unsupported MIME and noncanonical hashes before decoder work', async () => {
		for (const declaration of [
			{ mimeType: 'image/svg+xml' },
			{ sha256: 'A'.repeat(64) },
			{ sha256: 'no' }
		]) {
			const request = input(await picture());
			Object.assign(request.declaration, declaration);
			await expect(createLibriUploadImageVerifier().verify(request)).rejects.toMatchObject({
				code: 'invalid_declaration'
			});
		}
	});
	it('rejects a missing declaration and cancels its body', async () => {
		let cancelled = false;
		const request = input(await picture());
		Object.assign(request, { declaration: null });
		request.body = new ReadableStream({
			cancel() {
				cancelled = true;
			}
		});
		await expect(createLibriUploadImageVerifier().verify(request)).rejects.toMatchObject({
			code: 'invalid_declaration',
			retryable: false
		});
		expect(cancelled).toBe(true);
	});
	it.each([-1, 1])(
		'checks actual byte count independently of the declaration (%s)',
		async (delta) => {
			const decoder = vi.fn();
			const request = input(await picture());
			request.declaration.byteSize += delta;
			await expect(
				createLibriUploadImageVerifier({ decoder }).verify(request)
			).rejects.toMatchObject({ code: 'byte_size_mismatch', retryable: false });
			expect(decoder).not.toHaveBeenCalled();
		}
	);
	it('compares actual SHA-256 before any image decoding', async () => {
		const decoder = vi.fn();
		const request = input(await picture());
		request.declaration.sha256 = '0'.repeat(64);
		await expect(
			createLibriUploadImageVerifier({ decoder }).verify(request)
		).rejects.toMatchObject({ code: 'sha256_mismatch', retryable: false });
		expect(decoder).not.toHaveBeenCalled();
	});
	it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
		'does not trust a %s declaration over file signatures',
		async (mime) => {
			await expect(
				createLibriUploadImageVerifier().verify(
					input(Buffer.from('<svg>not an image</svg>'), mime)
				)
			).rejects.toMatchObject({ code: 'invalid_image_container' });
		}
	);
	it.each(['image/jpeg', 'image/png', 'image/webp'] as const)(
		'rejects appended payloads for %s',
		async (mime) => {
			await expect(
				createLibriUploadImageVerifier().verify(
					input(Buffer.concat([await picture(mime), Buffer.from('extra')]), mime)
				)
			).rejects.toMatchObject({ code: 'invalid_image_container' });
		}
	);
	it('fully decodes pixels instead of trusting valid PNG metadata', async () => {
		const corrupt = changePng(await picture(), 'IDAT', (compressed) =>
			compressed.subarray(0, compressed.length - 5)
		);
		expect((await sharp(corrupt).metadata()).width).toBe(32);
		await expect(createLibriUploadImageVerifier().verify(input(corrupt))).rejects.toMatchObject(
			{ code: 'invalid_image', retryable: false }
		);
	});
	it('rejects excessive dimensions before full decoding', async () => {
		const wide = await sharp({
			create: {
				width: LIBRI_UPLOAD_IMAGE_LIMITS.dimension + 1,
				height: 1,
				channels: 3,
				background: 'red'
			}
		})
			.png()
			.toBuffer();
		await expect(createLibriUploadImageVerifier().verify(input(wide))).rejects.toMatchObject({
			code: 'image_dimensions_exceeded'
		});
	});
	it('rejects a decompression-bomb header without allocating its claimed pixels', async () => {
		const bomb = changePng(await picture(), 'IHDR', (header) => {
			const result = Buffer.from(header);
			result.writeUInt32BE(10_000, 0);
			result.writeUInt32BE(10_000, 4);
			return result;
		});
		await expect(createLibriUploadImageVerifier().verify(input(bomb))).rejects.toMatchObject({
			retryable: false
		});
	});
	it('rejects APNG control chunks even when the decoder would see only the first frame', async () => {
		const png = await picture();
		const animated = Buffer.concat([
			png.subarray(0, 33),
			pngChunk('acTL', Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])),
			png.subarray(33)
		]);
		await expect(
			createLibriUploadImageVerifier().verify(input(animated))
		).rejects.toMatchObject({ code: 'animated_image' });
	});
	it('rejects genuinely animated WebP instead of checking only its first frame', async () => {
		const pixels = Buffer.from([255, 0, 0, 0, 0, 255]);
		const animated = await sharp(pixels, {
			raw: { width: 1, height: 2, channels: 3, pageHeight: 1 }
		})
			.webp({ delay: [100, 100] })
			.toBuffer();
		expect((await sharp(animated).metadata()).pages).toBe(2);
		await expect(
			createLibriUploadImageVerifier().verify(input(animated, 'image/webp'))
		).rejects.toMatchObject({ code: 'animated_image' });
	});
	it('bounds malformed PNG/WebP container lengths and chunk counts', async () => {
		const png = await picture();
		const broken = Buffer.from(png);
		broken.writeUInt32BE(0xffffffff, 8);
		const many = Buffer.concat([
			png.subarray(0, 33),
			...Array.from({ length: 4096 }, () => pngChunk('tEXt', Buffer.alloc(0))),
			png.subarray(33)
		]);
		const webp = await picture('image/webp');
		webp.writeUInt32LE(0xffffffff, 16);
		for (const [bytes, mime] of [
			[broken, 'image/png'],
			[many, 'image/png'],
			[webp, 'image/webp']
		] as const)
			await expect(
				createLibriUploadImageVerifier().verify(input(bytes, mime))
			).rejects.toMatchObject({ code: 'invalid_image_container' });
	});
	it('does not wait on an oversized stream cancellation promise', async () => {
		let cancelled = false;
		const request = input(await picture());
		request.body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(request.declaration.byteSize + 1));
			},
			cancel() {
				cancelled = true;
				return new Promise(() => {});
			}
		});
		await expect(
			createLibriUploadImageVerifier({ deadlineMs: 250 }).verify(request)
		).rejects.toMatchObject({ code: 'byte_size_mismatch' });
		expect(cancelled).toBe(true);
	});
	it('times out and cancels stalled body reads', async () => {
		let cancelled = false;
		const request = input(await picture());
		request.body = new ReadableStream({
			cancel() {
				cancelled = true;
				return new Promise(() => {});
			}
		});
		const verifier = createLibriUploadImageVerifier({ deadlineMs: 250 });
		await expect(verifier.verify(request)).rejects.toMatchObject({
			code: 'verification_timeout',
			retryable: true
		});
		await vi.waitFor(() => expect(verifier.isBusy()).toBe(false));
		expect(cancelled).toBe(true);
	});
	it('bounds an endless stream of empty chunks without depending on timer progress', async () => {
		let cancelled = false;
		let pulls = 0;
		const decoder = vi.fn();
		const request = input(await picture());
		request.body = new ReadableStream({
			pull(controller) {
				pulls++;
				controller.enqueue(new Uint8Array(0));
			},
			cancel() {
				cancelled = true;
			}
		});
		const verifier = createLibriUploadImageVerifier({ decoder });
		await expect(verifier.verify(request)).rejects.toMatchObject({
			code: 'stream_chunk_limit_exceeded',
			retryable: true
		});
		expect(pulls).toBeLessThanOrEqual(LIBRI_UPLOAD_IMAGE_LIMITS.streamChunks + 2);
		expect(cancelled).toBe(true);
		expect(decoder).not.toHaveBeenCalled();
		expect(verifier.isBusy()).toBe(false);
	});
	it('classifies native decoder timeout as retryable without exposing native error details', async () => {
		const request = input(await picture());
		const native = vi
			.spyOn(sharp.prototype, 'toBuffer')
			.mockRejectedValueOnce(new Error('private native detail\ntimeout: 42% complete\n'));
		try {
			await expect(createLibriUploadImageVerifier().verify(request)).rejects.toMatchObject({
				code: 'decoder_timeout',
				retryable: true,
				message: 'Libri upload verification failed: decoder_timeout'
			});
		} finally {
			native.mockRestore();
		}
	});
	it('holds its slot after decoder timeout until the underlying native work actually settles', async () => {
		const native = deferred<LibriDecodedImage>();
		const entered = deferred<void>();
		const verifier = createLibriUploadImageVerifier({
			deadlineMs: 250,
			decoder: () => {
				entered.resolve();
				return native.promise;
			}
		});
		const attempt = verifier.verify(input(await picture()));
		const rejection = expect(attempt).rejects.toMatchObject({
			code: 'verification_timeout',
			retryable: true
		});
		await entered.promise;
		await rejection;
		expect(verifier.isBusy()).toBe(true);
		await expect(verifier.verify(input(await picture()))).rejects.toMatchObject({
			code: 'verification_busy',
			retryable: true
		});
		native.resolve(decoded);
		await vi.waitFor(() => expect(verifier.isBusy()).toBe(false));
	});
	it('handles caller abort before and during decode without accepting late success', async () => {
		const native = deferred<LibriDecodedImage>();
		const entered = deferred<void>();
		const controller = new AbortController();
		const decoder = vi.fn(() => {
			entered.resolve();
			return native.promise;
		});
		const verifier = createLibriUploadImageVerifier({ decoder });
		const request = input(await picture());
		request.signal = controller.signal;
		const rejection = expect(verifier.verify(request)).rejects.toMatchObject({
			code: 'verification_aborted',
			retryable: true
		});
		await entered.promise;
		controller.abort(new Error('private upstream detail'));
		await rejection;
		expect(verifier.isBusy()).toBe(true);
		native.resolve(decoded);
		await vi.waitFor(() => expect(verifier.isBusy()).toBe(false));
		await expect(
			verifier.verify({ ...input(await picture()), signal: controller.signal })
		).rejects.toMatchObject({ code: 'verification_aborted' });
		expect(decoder).toHaveBeenCalledTimes(1);
	});
	it('redacts unexpected source/decoder errors and validates decoder receipts', async () => {
		const verifier = createLibriUploadImageVerifier({
			decoder: async () => {
				throw new Error('provider-secret-token');
			}
		});
		await expect(verifier.verify(input(await picture()))).rejects.toMatchObject({
			code: 'read_or_decoder_unavailable',
			message: 'Libri upload verification failed: read_or_decoder_unavailable'
		});
		for (const override of [
			{ width: NaN },
			{ height: -1 },
			{ channels: 7 },
			{ mimeType: 'image/jpeg' as const }
		]) {
			await expect(
				createLibriUploadImageVerifier({
					decoder: async () => ({ ...decoded, ...override })
				}).verify(input(await picture()))
			).rejects.toMatchObject({ retryable: false });
		}
	});
	it('rejects unbounded deadline configuration', () => {
		for (const deadlineMs of [0, 249, 15001, NaN])
			expect(() => createLibriUploadImageVerifier({ deadlineMs })).toThrow();
	});
});
