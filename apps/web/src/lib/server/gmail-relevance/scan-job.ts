// apps/web/src/lib/server/gmail-relevance/scan-job.ts
import { z } from 'zod';

export const EMAIL_RELEVANCE_SCAN_JOB_TYPE = 'email_relevance_scan_step';

const SCAN_JOB_METADATA_SCHEMA = z
	.object({
		run_id: z.string().uuid(),
		connection_scope_id: z.string().uuid(),
		checkpoint_version: z.number().int().nonnegative(),
		processing_token: z.string().uuid()
	})
	.strict();

export type EmailRelevanceScanJobMetadata = z.infer<typeof SCAN_JOB_METADATA_SCHEMA>;

export class EmailRelevanceScanJobMetadataError extends Error {
	readonly code = 'invalid_job_metadata';

	constructor() {
		super('Email relevance scan job metadata rejected: invalid_job_metadata');
		this.name = 'EmailRelevanceScanJobMetadataError';
	}
}

export function parseEmailRelevanceScanJobMetadata(value: unknown): EmailRelevanceScanJobMetadata {
	const parsed = SCAN_JOB_METADATA_SCHEMA.safeParse(value);
	if (!parsed.success) {
		throw new EmailRelevanceScanJobMetadataError();
	}
	return parsed.data;
}

export function serializeEmailRelevanceScanJobMetadata(value: unknown): string {
	return JSON.stringify(parseEmailRelevanceScanJobMetadata(value));
}

export function deserializeEmailRelevanceScanJobMetadata(
	value: string
): EmailRelevanceScanJobMetadata {
	try {
		return parseEmailRelevanceScanJobMetadata(JSON.parse(value));
	} catch {
		throw new EmailRelevanceScanJobMetadataError();
	}
}
