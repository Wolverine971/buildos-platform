// apps/web/src/lib/server/gmail-relevance/scan-job.test.ts
import { describe, expect, it } from 'vitest';
import {
	deserializeEmailRelevanceScanJobMetadata,
	parseEmailRelevanceScanJobMetadata,
	serializeEmailRelevanceScanJobMetadata
} from './scan-job';

const SAFE_JOB_METADATA = {
	run_id: '50000000-0000-4000-8000-000000000001',
	connection_scope_id: '60000000-0000-4000-8000-000000000001',
	checkpoint_version: 8,
	processing_token: '70000000-0000-4000-8000-000000000001'
};

describe('email relevance scan job metadata', () => {
	it('round trips only the four approved content-free fields', () => {
		const serialized = serializeEmailRelevanceScanJobMetadata(SAFE_JOB_METADATA);
		expect(deserializeEmailRelevanceScanJobMetadata(serialized)).toEqual(SAFE_JOB_METADATA);
		expect(Object.keys(JSON.parse(serialized))).toEqual([
			'run_id',
			'connection_scope_id',
			'checkpoint_version',
			'processing_token'
		]);
	});

	it('rejects extra content, cursor, and provider fields with a fixed error', () => {
		for (const forbiddenField of [
			'mailbox_query',
			'cursor',
			'provider_message_id',
			'subject',
			'model_output'
		]) {
			expect(() =>
				parseEmailRelevanceScanJobMetadata({
					...SAFE_JOB_METADATA,
					[forbiddenField]: 'forbidden-synthetic-value'
				})
			).toThrowError(expect.objectContaining({ code: 'invalid_job_metadata' }));
		}
	});

	it('rejects malformed JSON without reflecting its value', () => {
		expect(() => deserializeEmailRelevanceScanJobMetadata('{forbidden')).toThrowError(
			'Email relevance scan job metadata rejected: invalid_job_metadata'
		);
	});
});
