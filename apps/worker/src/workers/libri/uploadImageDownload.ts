// Dedicated-worker transport. Not wired to a consumer or a live signing broker yet.
import type { LibriUploadClaim } from './uploadProcessing';
import {
	LIBRI_UPLOAD_IMAGE_LIMITS,
	LibriUploadVerificationError,
	type LibriVerifiedUploadImage,
	type createLibriUploadImageVerifier
} from './uploadImageVerifier';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MARGIN_MS = 2_000;
type Verifier = ReturnType<typeof createLibriUploadImageVerifier>;
export type LibriUploadDownloadGrant = { signedUrl: string; expiresAt: string };
export type LibriUploadDownloadAuthorizer = (input: {
	claim: Readonly<LibriUploadClaim>;
	signal: AbortSignal;
}) => Promise<LibriUploadDownloadGrant>;

export class LibriUploadDownloadError extends Error {
	constructor(
		readonly code: string,
		readonly retryable: boolean
	) {
		super(`Libri upload download failed: ${code}`);
		this.name = 'LibriUploadDownloadError';
	}
}
const fail = (code: string, retryable = false): never => {
	throw new LibriUploadDownloadError(code, retryable);
};
const discard = (body: ReadableStream<Uint8Array> | null) => {
	if (body && !body.locked) void body.cancel().catch(() => undefined);
};

/** One instance plus one shared verifier per dedicated Libri process.
 * `authorize` is trusted application wiring, NOT a job field. Its future server
 * implementation must recheck membership, both controls and the full lease fence
 * before signing. This module cannot authorize a database row by inspecting a URL.
 * No database/service key, Storage SDK, publication, retry or acknowledgment here.
 */
export function createLibriUploadImageDownloader(options: {
	storageOrigin: string;
	authorize: LibriUploadDownloadAuthorizer;
	verifier: Verifier;
	fetchImpl?: typeof fetch;
	now?: () => number;
	deadlineMs?: number;
}) {
	const origin = storageOrigin(options.storageOrigin);
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? Date.now;
	const deadlineMs = options.deadlineMs ?? 15_000;
	if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 250 || deadlineMs > 15_000)
		throw new Error('Libri upload download deadline must be between 250 and 15000ms');
	let busy = false;
	return {
		isBusy: () => busy || options.verifier.isBusy(),
		async downloadAndVerify(input: {
			claim: LibriUploadClaim;
			signal: AbortSignal;
		}): Promise<LibriVerifiedUploadImage> {
			if (busy || options.verifier.isBusy()) fail('download_busy', true);
			const callerSignal = input.signal;
			if (!(callerSignal instanceof AbortSignal)) fail('invalid_download_signal');
			if (callerSignal.aborted) fail('download_aborted', true);
			const claim = snapshotClaim(input.claim);
			const leaseRemaining = Date.parse(claim.leaseExpiresAt) - now();
			if (
				!Number.isFinite(leaseRemaining) ||
				leaseRemaining <= MARGIN_MS ||
				leaseRemaining > 92_000
			)
				fail('download_lease_expired');
			busy = true;
			const timeout = new AbortController();
			const signal = AbortSignal.any([callerSignal, timeout.signal]);
			const budgetMs = Math.min(deadlineMs, leaseRemaining - MARGIN_MS);
			const deadlineAt = performance.now() + budgetMs;
			let capabilityExpiresAt = Date.parse(claim.leaseExpiresAt);
			const timer = setTimeout(() => timeout.abort(), budgetMs);
			let grantTimer: ReturnType<typeof setTimeout> | undefined;
			const interrupted = () =>
				new LibriUploadDownloadError(
					callerSignal.aborted ? 'download_aborted' : 'download_timeout',
					true
				);
			const checkDeadline = () => {
				// Timers may be delayed by event-loop work. Never accept a completion
				// just because the timer callback has not run yet; elapsed time is monotonic.
				if (performance.now() >= deadlineAt) timeout.abort();
				if (signal.aborted) throw interrupted();
				if (now() + MARGIN_MS >= capabilityExpiresAt) fail('download_lease_expired');
			};
			let rejectInterrupted: () => void = () => {};
			const interruption = new Promise<never>((_resolve, reject) => {
				rejectInterrupted = () => reject(interrupted());
				signal.addEventListener('abort', rejectInterrupted, { once: true });
			});
			const work = (async () => {
				// Pass a frozen snapshot: caller mutation during an await cannot retarget
				// the download, declaration, fence or deadline.
				const grant = await options.authorize({ claim, signal });
				checkDeadline();
				const { signedUrl, expiresAt } = reviewGrant(grant, claim, origin, now());
				capabilityExpiresAt = expiresAt;
				checkDeadline();
				grantTimer = setTimeout(() => timeout.abort(), expiresAt - now() - MARGIN_MS);
				let response: Response | undefined;
				try {
					response = await fetchImpl(signedUrl, {
						method: 'GET',
						redirect: 'manual',
						credentials: 'omit',
						cache: 'no-store',
						headers: {
							Accept: claim.declaration.mimeType,
							'Accept-Encoding': 'identity'
						},
						signal
					});
					checkDeadline();
					reviewResponse(response, claim);
					const verified = await options.verifier.verify({
						body: response.body!,
						declaration: claim.declaration,
						signal
					});
					checkDeadline();
					return verified; // Exact owned bytes, never a second Storage read.
				} finally {
					discard(response?.body ?? null);
				}
			})();
			// A dependency that ignores cancellation cannot open another transport slot.
			// The verifier separately retains its slot until native work truly settles.
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
				if (
					error instanceof LibriUploadDownloadError ||
					error instanceof LibriUploadVerificationError
				)
					throw error;
				return fail('download_unavailable', true);
			} finally {
				clearTimeout(timer);
				clearTimeout(grantTimer);
				signal.removeEventListener('abort', rejectInterrupted);
			}
		}
	};
}

function snapshotClaim(value: LibriUploadClaim): Readonly<LibriUploadClaim> {
	if (
		!value ||
		![value.libraryId, value.uploadId, value.leaseToken, value.bookId].every(
			(id) => typeof id === 'string' && UUID.test(id)
		)
	)
		fail('invalid_download_claim');
	const d = value.declaration;
	if (
		!d ||
		!['image/jpeg', 'image/png', 'image/webp'].includes(d.mimeType) ||
		!Number.isSafeInteger(d.byteSize) ||
		d.byteSize < 1 ||
		d.byteSize > LIBRI_UPLOAD_IMAGE_LIMITS.bytes ||
		typeof d.sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(d.sha256) ||
		!Number.isSafeInteger(value.attempt) ||
		value.attempt < 1 ||
		value.attempt > 3 ||
		typeof value.leaseExpiresAt !== 'string' ||
		value.leaseExpiresAt.length > 64
	)
		fail('invalid_download_claim');
	const extension =
		d.mimeType === 'image/jpeg' ? 'jpeg' : d.mimeType === 'image/png' ? 'png' : 'webp';
	if (value.objectPath !== `${value.libraryId}/uploads/${value.uploadId}/original.${extension}`)
		fail('invalid_download_claim');
	return Object.freeze({
		libraryId: value.libraryId,
		uploadId: value.uploadId,
		bookId: value.bookId,
		leaseToken: value.leaseToken,
		attempt: value.attempt,
		leaseExpiresAt: value.leaseExpiresAt,
		objectPath: value.objectPath,
		declaration: Object.freeze({ mimeType: d.mimeType, byteSize: d.byteSize, sha256: d.sha256 })
	});
}

function storageOrigin(value: string): string {
	try {
		const url = new URL(value);
		if (
			url.protocol !== 'https:' ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== '/' ||
			(value !== url.origin && value !== `${url.origin}/`)
		)
			throw new Error();
		return url.origin;
	} catch {
		throw new Error(
			'Libri upload Storage origin must be a canonical credential-free HTTPS origin'
		);
	}
}

function reviewGrant(
	grant: LibriUploadDownloadGrant,
	claim: Readonly<LibriUploadClaim>,
	origin: string,
	now: number
) {
	try {
		if (
			!grant ||
			typeof grant.signedUrl !== 'string' ||
			grant.signedUrl.length > 4096 ||
			typeof grant.expiresAt !== 'string' ||
			grant.expiresAt.length > 64
		)
			throw new Error();
		const url = new URL(grant.signedUrl);
		const expiresAt = Date.parse(grant.expiresAt);
		if (
			url.origin !== origin ||
			url.href !== grant.signedUrl ||
			url.username ||
			url.password ||
			url.hash ||
			url.pathname !== `/storage/v1/object/sign/libri-assets/${claim.objectPath}` ||
			Array.from(url.searchParams.keys()).length !== 1 ||
			!/^[A-Za-z0-9_.-]{1,3500}$/.test(url.searchParams.get('token') ?? '') ||
			!Number.isFinite(expiresAt) ||
			expiresAt <= now + MARGIN_MS ||
			expiresAt > now + 60_000 ||
			expiresAt > Date.parse(claim.leaseExpiresAt)
		)
			throw new Error();
		return { signedUrl: url.href, expiresAt };
	} catch {
		return fail('invalid_download_grant');
	}
}

function reviewResponse(response: Response, claim: Readonly<LibriUploadClaim>) {
	if (response.status !== 200 || response.redirected || !response.body)
		fail('download_response_unavailable', true);
	const size = response.headers.get('content-length');
	const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	const encoding = response.headers.get('content-encoding');
	if (
		mime !== claim.declaration.mimeType ||
		response.headers.has('content-range') ||
		(encoding !== null && encoding !== 'identity') ||
		(size !== null &&
			(!/^[1-9][0-9]{0,7}$/.test(size) || Number(size) !== claim.declaration.byteSize))
	)
		fail('invalid_download_response');
}
