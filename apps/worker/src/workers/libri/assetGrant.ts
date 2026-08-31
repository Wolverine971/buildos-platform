import type { QueryResult } from 'pg';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GRANT_TTL_MS = 65_000;

export type LibriAssetGrantQueryClient = {
	query: <T extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	) => Promise<QueryResult<T>>;
};

export type IssueLibriOcrAssetGrantInput = {
	stepId: string;
	executionGeneration: number;
	leaseToken: string;
	imageId: string;
};

export type IssueLibriOcrAssetGrantReceipt = {
	grantId: string;
	expiresAt: string;
};

export type LibriAssetGrantPort = {
	issueOcrAssetGrant(
		input: IssueLibriOcrAssetGrantInput
	): Promise<IssueLibriOcrAssetGrantReceipt>;
};

type AssetGrantRow = {
	grant_id: string;
	expires_at: string | Date;
};

export function createLibriAssetGrantIssuer(
	client: LibriAssetGrantQueryClient,
	now: () => number = Date.now
): LibriAssetGrantPort {
	return new LibriAssetGrantIssuer(client, now);
}

class LibriAssetGrantIssuer implements LibriAssetGrantPort {
	constructor(
		private readonly client: LibriAssetGrantQueryClient,
		private readonly now: () => number
	) {}

	async issueOcrAssetGrant(
		input: IssueLibriOcrAssetGrantInput
	): Promise<IssueLibriOcrAssetGrantReceipt> {
		assertUuid(input.stepId, 'stepId');
		assertPositiveGeneration(input.executionGeneration);
		assertUuid(input.leaseToken, 'leaseToken');
		assertUuid(input.imageId, 'imageId');

		const result = await this.client.query<AssetGrantRow>(
			`SELECT * FROM libri.issue_ocr_asset_grant($1, $2, $3, $4)`,
			[input.stepId, input.executionGeneration, input.leaseToken, input.imageId]
		);
		if (result.rows.length !== 1) {
			throw invalidReceipt(`OCR asset grant returned ${result.rows.length} rows`);
		}
		const row = result.rows[0];
		assertUuid(row.grant_id, 'grantId');
		const expiresAt = readExpiry(row.expires_at, this.now());
		return { grantId: row.grant_id, expiresAt };
	}
}

function assertUuid(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw new Error(`Libri OCR asset ${name} must be a UUID`);
	}
}

function assertPositiveGeneration(value: number): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error('Libri OCR asset executionGeneration must be a positive integer');
	}
}

function readExpiry(value: unknown, nowMs: number): string {
	const expiry =
		value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
	const expiryMs = expiry?.getTime() ?? Number.NaN;
	if (!Number.isFinite(expiryMs) || expiryMs <= nowMs || expiryMs > nowMs + MAX_GRANT_TTL_MS) {
		throw invalidReceipt('OCR asset grant returned an invalid expiry');
	}
	return expiry!.toISOString();
}

function invalidReceipt(reason: string): Error {
	return new Error(`Invalid Libri database receipt: ${reason}`);
}
