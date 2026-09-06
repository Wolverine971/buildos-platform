// Worker-only database port. Not wired into a consumer or activation mode yet.
import type { LibriPgPool } from './database';
import type { LibriUploadImageDeclaration } from './uploadImageVerifier';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAILURES = [
	'invalid_image',
	'verification_unavailable',
	'storage_unavailable',
	'cancelled'
] as const;
export type LibriUploadFailure = (typeof FAILURES)[number];
export type LibriUploadClaimInput = { libraryId: string; uploadId: string; leaseToken: string };
export type LibriUploadClaim = LibriUploadClaimInput & {
	bookId: string;
	objectPath: string;
	declaration: LibriUploadImageDeclaration & Record<string, unknown>;
	attempt: number;
	leaseExpiresAt: string;
};

/** Compose only with the dedicated, probed libri_worker pool (maximum 3 connections).
 * Every operation is one atomic SQL call. No automatic mutation retry: reuse the
 * same claim token after an ambiguous response; use a fresh token for a new attempt.
 * A receipt is a lease, NOT a verified image, download capability or publication.
 */
export function createLibriUploadProcessing(pool: Pick<LibriPgPool, 'query'>) {
	async function query(sql: string, values: readonly unknown[]) {
		try {
			return (await pool.query(sql, values)).rows;
		} catch {
			throw new Error('Libri upload processing database request failed');
		}
	}
	return {
		async listCandidates(libraryId: string): Promise<string[]> {
			const rows = await query(
				'SELECT upload_id FROM libri.list_image_upload_candidates($1::uuid)',
				[uuid(libraryId)]
			);
			const ids = rows.map((row) => uuid(row.upload_id));
			if (ids.length > 10 || new Set(ids).size !== ids.length) invalidReceipt();
			return ids;
		},
		async claim(input: LibriUploadClaimInput): Promise<LibriUploadClaim | null> {
			const [libraryId, uploadId, leaseToken] = scope(input);
			const rows = await query(
				'SELECT libri.claim_image_upload($1::uuid, $2::uuid, $3::uuid) AS receipt',
				[libraryId, uploadId, leaseToken]
			);
			if (rows.length !== 1) invalidReceipt();
			const value = rows[0]?.receipt;
			if (value === null) return null;
			if (!record(value)) invalidReceipt();
			if (
				value.library_id !== libraryId ||
				value.upload_id !== uploadId ||
				value.lease_token !== leaseToken
			)
				invalidReceipt();
			const declaration = value.declaration;
			if (
				!record(declaration) ||
				JSON.stringify(declaration).length > 16_384 ||
				!['image/jpeg', 'image/png', 'image/webp'].includes(String(declaration.mimeType)) ||
				!Number.isSafeInteger(declaration.byteSize) ||
				Number(declaration.byteSize) < 1 ||
				Number(declaration.byteSize) > 26_214_400 ||
				typeof declaration.sha256 !== 'string' ||
				!/^[0-9a-f]{64}$/.test(declaration.sha256)
			)
				invalidReceipt();
			const extension =
				declaration.mimeType === 'image/jpeg'
					? 'jpeg'
					: declaration.mimeType === 'image/png'
						? 'png'
						: 'webp';
			const objectPath = `${libraryId}/uploads/${uploadId}/original.${extension}`;
			if (
				value.object_path !== objectPath ||
				!Number.isSafeInteger(value.attempt) ||
				Number(value.attempt) < 1 ||
				Number(value.attempt) > 3 ||
				typeof value.lease_expires_at !== 'string' ||
				!Number.isFinite(Date.parse(value.lease_expires_at))
			)
				invalidReceipt();
			return {
				libraryId,
				uploadId,
				leaseToken,
				bookId: uuid(value.book_id),
				objectPath,
				declaration: declaration as LibriUploadClaim['declaration'],
				attempt: Number(value.attempt),
				leaseExpiresAt: value.lease_expires_at
			};
		},
		async fail(
			input: LibriUploadClaimInput & { attempt: number; failureCode: LibriUploadFailure }
		): Promise<boolean> {
			const values = scope(input);
			if (
				!Number.isSafeInteger(input.attempt) ||
				input.attempt < 1 ||
				input.attempt > 3 ||
				!FAILURES.includes(input.failureCode)
			)
				throw new Error('Invalid Libri upload failure');
			const rows = await query(
				'SELECT libri.fail_image_upload($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::text) AS accepted',
				[...values, input.attempt, input.failureCode]
			);
			if (rows.length !== 1 || typeof rows[0]?.accepted !== 'boolean') invalidReceipt();
			return rows[0].accepted;
		}
	};
}
function uuid(value: unknown): string {
	if (typeof value !== 'string' || !UUID.test(value))
		throw new Error('Invalid Libri upload identifier');
	return value.toLowerCase();
}
function scope(input: LibriUploadClaimInput): [string, string, string] {
	return [uuid(input.libraryId), uuid(input.uploadId), uuid(input.leaseToken)];
}
function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
function invalidReceipt(): never {
	throw new Error('Invalid Libri upload processing receipt');
}
