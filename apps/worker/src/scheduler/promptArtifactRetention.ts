// apps/worker/src/scheduler/promptArtifactRetention.ts
import { supabase } from '../lib/supabase';

function numericSummaryValue(summary: Record<string, unknown>, key: string): number {
	return typeof summary[key] === 'number' ? summary[key] : 0;
}

export async function runPreparedPromptRetentionCleanup(): Promise<void> {
	try {
		const batchSize = 1_000;
		const maxBatches = 25;
		let preparedDeleted = 0;
		let snapshotsDeleted = 0;
		let renderedDumpsCleared = 0;
		let cleanupAvailable = true;
		let drained = false;

		for (let batch = 0; batch < maxBatches; batch += 1) {
			const { data, error } = await supabase.rpc('cleanup_agentic_chat_prompt_artifacts', {
				p_batch_size: batchSize
			});
			if (error) {
				cleanupAvailable = false;
				if (batch > 0) {
					console.warn(
						'⚠️ Prompt artifact cleanup stopped before fully draining:',
						error
					);
				}
				break;
			}

			const summary = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
			preparedDeleted += numericSummaryValue(summary, 'prepared_prompts_deleted');
			const snapshotBatch = numericSummaryValue(summary, 'prompt_snapshots_deleted');
			const dumpBatch = numericSummaryValue(summary, 'rendered_dumps_cleared');
			snapshotsDeleted += snapshotBatch;
			renderedDumpsCleared += dumpBatch;
			if (snapshotBatch < batchSize && dumpBatch < batchSize) {
				drained = true;
				break;
			}
		}

		if (!cleanupAvailable && snapshotsDeleted === 0 && renderedDumpsCleared === 0) {
			console.warn(
				'⚠️ Scheduled prompt artifact cleanup failed; falling back to prepared prompt cleanup.'
			);
			const fallback = await supabase.rpc('cleanup_expired_agentic_chat_prepared_prompts');
			if (fallback.error) {
				console.warn(
					'⚠️ Scheduled prepared prompt cleanup fallback failed:',
					fallback.error
				);
				return;
			}
			const fallbackDeletedCount = typeof fallback.data === 'number' ? fallback.data : 0;
			if (fallbackDeletedCount > 0) {
				console.log(
					`✅ Scheduled prepared prompt cleanup removed ${fallbackDeletedCount} expired prompt(s)`
				);
			}
			return;
		}

		if (!drained) {
			console.warn(
				`⚠️ Prompt artifact cleanup reached its ${maxBatches * batchSize}-row safety cap; stale artifacts remain and the next retention run must continue draining.`
			);
		}
		if (preparedDeleted > 0 || snapshotsDeleted > 0 || renderedDumpsCleared > 0) {
			console.log(
				`✅ Scheduled prompt artifact cleanup complete: prepared=${preparedDeleted}, snapshots=${snapshotsDeleted}, dumpsCleared=${renderedDumpsCleared}`
			);
		}
	} catch (error) {
		console.error('❌ Scheduled prompt artifact cleanup failed:', error);
	}
}
