// apps/web/src/lib/server/asset-ocr-queue.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export async function queueAssetOcrExtraction(params: {
	assetId: string;
	projectId: string;
	userId: string;
	forceOverwrite?: boolean;
	priority?: number;
	dedupKey?: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const dedupKey = params.dedupKey ?? `asset-ocr-${params.assetId}`;
		const { data, error } = await supabase.rpc('add_queue_job', {
			p_user_id: params.userId,
			p_job_type: 'extract_onto_asset_ocr',
			p_metadata: {
				assetId: params.assetId,
				projectId: params.projectId,
				userId: params.userId,
				forceOverwrite: Boolean(params.forceOverwrite)
			},
			p_priority: params.priority ?? 8,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: dedupKey
		});

		if (error) {
			return { queued: false, reason: error.message };
		}

		return { queued: true, jobId: typeof data === 'string' ? data : undefined };
	} catch (error) {
		return {
			queued: false,
			reason: error instanceof Error ? error.message : 'Failed to queue OCR extraction'
		};
	}
}
