// apps/web/src/lib/server/gmail-relevance/metadata-retention.ts
const PURGE_BATCH_LIMIT = 1_000;
const MAX_PURGE_BATCHES = 10;

type RetentionDatabase = {
	rpc(
		name: string,
		parameters: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export type EmailRelevanceMetadataPurgeResult = {
	observations_deleted: number;
	candidates_deleted: number;
	batches_run: number;
	drained: boolean;
};

export class EmailRelevanceMetadataRetentionError extends Error {
	constructor() {
		super('Gmail relevance metadata retention failed');
		this.name = 'EmailRelevanceMetadataRetentionError';
	}
}

function parsePurgeRow(value: unknown): {
	observations_deleted: number;
	candidates_deleted: number;
} {
	const row = Array.isArray(value) ? value[0] : value;
	if (!row || typeof row !== 'object') throw new EmailRelevanceMetadataRetentionError();
	const observationsDeleted = Reflect.get(row, 'observations_deleted');
	const candidatesDeleted = Reflect.get(row, 'candidates_deleted');
	if (
		!Number.isInteger(observationsDeleted) ||
		observationsDeleted < 0 ||
		observationsDeleted > PURGE_BATCH_LIMIT ||
		!Number.isInteger(candidatesDeleted) ||
		candidatesDeleted < 0 ||
		candidatesDeleted > PURGE_BATCH_LIMIT
	) {
		throw new EmailRelevanceMetadataRetentionError();
	}
	return {
		observations_deleted: observationsDeleted,
		candidates_deleted: candidatesDeleted
	};
}

export async function purgeExpiredEmailRelevanceMetadata(
	database: RetentionDatabase
): Promise<EmailRelevanceMetadataPurgeResult> {
	let observationsDeleted = 0;
	let candidatesDeleted = 0;
	for (let batch = 1; batch <= MAX_PURGE_BATCHES; batch += 1) {
		const result = await database.rpc('purge_expired_email_relevance_metadata', {
			p_limit: PURGE_BATCH_LIMIT
		});
		if (result.error) throw new EmailRelevanceMetadataRetentionError();
		const current = parsePurgeRow(result.data);
		observationsDeleted += current.observations_deleted;
		candidatesDeleted += current.candidates_deleted;
		const drained =
			current.observations_deleted < PURGE_BATCH_LIMIT &&
			current.candidates_deleted < PURGE_BATCH_LIMIT;
		if (drained) {
			return {
				observations_deleted: observationsDeleted,
				candidates_deleted: candidatesDeleted,
				batches_run: batch,
				drained: true
			};
		}
	}
	return {
		observations_deleted: observationsDeleted,
		candidates_deleted: candidatesDeleted,
		batches_run: MAX_PURGE_BATCHES,
		drained: false
	};
}
