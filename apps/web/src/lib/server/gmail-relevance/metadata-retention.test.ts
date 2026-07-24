// apps/web/src/lib/server/gmail-relevance/metadata-retention.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	EmailRelevanceMetadataRetentionError,
	purgeExpiredEmailRelevanceMetadata
} from './metadata-retention';

describe('Gmail relevance metadata retention', () => {
	it('drains expired rows in bounded batches and returns counts only', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({
				data: [{ observations_deleted: 1_000, candidates_deleted: 1_000 }],
				error: null
			})
			.mockResolvedValueOnce({
				data: [{ observations_deleted: 148, candidates_deleted: 731 }],
				error: null
			});

		await expect(purgeExpiredEmailRelevanceMetadata({ rpc })).resolves.toEqual({
			observations_deleted: 1_148,
			candidates_deleted: 1_731,
			batches_run: 2,
			drained: true
		});
		expect(rpc).toHaveBeenCalledTimes(2);
		expect(rpc).toHaveBeenCalledWith('purge_expired_email_relevance_metadata', {
			p_limit: 1_000
		});
	});

	it('fails closed on database errors and malformed aggregate output', async () => {
		await expect(
			purgeExpiredEmailRelevanceMetadata({
				rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'fixed_error' } })
			})
		).rejects.toBeInstanceOf(EmailRelevanceMetadataRetentionError);
		await expect(
			purgeExpiredEmailRelevanceMetadata({
				rpc: vi.fn().mockResolvedValue({
					data: [{ observations_deleted: 'restricted', candidates_deleted: 0 }],
					error: null
				})
			})
		).rejects.toBeInstanceOf(EmailRelevanceMetadataRetentionError);
	});

	it('stops after ten full batches instead of looping without a ceiling', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: [{ observations_deleted: 1_000, candidates_deleted: 1_000 }],
			error: null
		});
		await expect(purgeExpiredEmailRelevanceMetadata({ rpc })).resolves.toEqual({
			observations_deleted: 10_000,
			candidates_deleted: 10_000,
			batches_run: 10,
			drained: false
		});
		expect(rpc).toHaveBeenCalledTimes(10);
	});
});
