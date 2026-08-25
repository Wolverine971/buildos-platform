import type {
	CycleQueueJobMetadata,
	CycleQueueJobResult,
	CycleRun,
	CycleRunOutcome,
	Json
} from '@buildos/shared-types';
import { validateCycleQueueJobMetadata } from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import {
	classifyQueueError,
	PermanentQueueError,
	TransientQueueError
} from '../../lib/queueErrors';
import { supabase } from '../../lib/supabase';
import { CycleHandlerRegistry } from './cycleHandlerRegistry';
import { processDailyBriefCycle } from './dailyBriefCycleHandler';

export interface CycleRunClaim {
	disposition: 'claimed' | 'already_terminal';
	run: CycleRun;
}

export interface CycleRunStore {
	claim(input: {
		cycleRunId: string;
		queueJobRecordId: string;
		processingToken: string;
	}): Promise<CycleRunClaim>;
	complete(input: {
		cycleRunId: string;
		processingToken: string;
		outcome: CycleRunOutcome;
		result: Json | null;
	}): Promise<boolean>;
	fail(input: {
		cycleRunId: string;
		processingToken: string;
		errorCode: string;
		errorMessage: string;
		terminal: boolean;
	}): Promise<boolean>;
}

class SupabaseCycleRunStore implements CycleRunStore {
	async claim(input: {
		cycleRunId: string;
		queueJobRecordId: string;
		processingToken: string;
	}): Promise<CycleRunClaim> {
		const { data, error } = await (supabase.rpc as any)('claim_cycle_run', {
			p_cycle_run_id: input.cycleRunId,
			p_queue_job_record_id: input.queueJobRecordId,
			p_processing_token: input.processingToken
		});
		if (error) throw new Error(`claim_cycle_run failed: ${error.message}`);
		if (
			!data ||
			typeof data !== 'object' ||
			!['claimed', 'already_terminal'].includes(data.disposition) ||
			!data.run ||
			typeof data.run !== 'object'
		) {
			throw new PermanentQueueError(
				'cycle_claim_contract_invalid',
				'claim_cycle_run returned an invalid response.'
			);
		}
		return data as CycleRunClaim;
	}

	async complete(input: {
		cycleRunId: string;
		processingToken: string;
		outcome: CycleRunOutcome;
		result: Json | null;
	}): Promise<boolean> {
		const { data, error } = await (supabase.rpc as any)('complete_cycle_run', {
			p_cycle_run_id: input.cycleRunId,
			p_processing_token: input.processingToken,
			p_outcome: input.outcome,
			p_result: input.result
		});
		if (error) throw new Error(`complete_cycle_run failed: ${error.message}`);
		return data === true;
	}

	async fail(input: {
		cycleRunId: string;
		processingToken: string;
		errorCode: string;
		errorMessage: string;
		terminal: boolean;
	}): Promise<boolean> {
		const { data, error } = await (supabase.rpc as any)('fail_cycle_run', {
			p_cycle_run_id: input.cycleRunId,
			p_processing_token: input.processingToken,
			p_error_code: input.errorCode,
			p_error_message: input.errorMessage,
			p_terminal: input.terminal
		});
		if (error) throw new Error(`fail_cycle_run failed: ${error.message}`);
		return data === true;
	}
}

export function createCycleRunProcessor(options: {
	registry: CycleHandlerRegistry;
	store: CycleRunStore;
}) {
	return async function processCycleRun(
		job: ProcessingJob<CycleQueueJobMetadata>
	): Promise<CycleQueueJobResult> {
		let metadata: CycleQueueJobMetadata;
		try {
			metadata = validateCycleQueueJobMetadata(job.data);
		} catch (error) {
			throw new PermanentQueueError(
				'cycle_metadata_invalid',
				error instanceof Error ? error.message : 'Cycle metadata is invalid.'
			);
		}

		if (!job.queueRowId || !job.processingToken) {
			throw new PermanentQueueError(
				'cycle_queue_fence_missing',
				'Cycle jobs require a queue row ID and processing token.'
			);
		}

		const claim = await options.store.claim({
			cycleRunId: metadata.cycle_run_id,
			queueJobRecordId: job.queueRowId,
			processingToken: job.processingToken
		});

		if (claim.disposition === 'already_terminal') {
			await job.log(
				`Cycle Run ${claim.run.id} is already ${claim.run.status}; acknowledging retry.`
			);
			return {
				cycle_run_id: claim.run.id,
				outcome: claim.run.outcome,
				already_terminal: true
			};
		}

		try {
			if (
				claim.run.id !== metadata.cycle_run_id ||
				claim.run.cycle_id !== metadata.cycle_id ||
				claim.run.kind !== metadata.kind ||
				claim.run.user_id !== job.userId
			) {
				throw new PermanentQueueError(
					'cycle_envelope_mismatch',
					'Cycle queue metadata does not match the admitted Cycle Run.'
				);
			}

			await job.log(`Executing ${claim.run.kind} Cycle Run ${claim.run.id}.`);
			if (!options.registry.has(claim.run.kind)) {
				throw new PermanentQueueError(
					'cycle_handler_missing',
					`No Cycle handler is registered for kind: ${claim.run.kind}`
				);
			}
			const handlerResult = await options.registry.execute(claim.run, job);
			const completed = await options.store.complete({
				cycleRunId: claim.run.id,
				processingToken: job.processingToken,
				outcome: handlerResult.outcome,
				result: handlerResult.result
			});
			if (!completed) {
				throw new TransientQueueError(
					'cycle_completion_fence_lost',
					`Lost the Cycle Run completion fence for ${claim.run.id}.`
				);
			}

			return {
				cycle_run_id: claim.run.id,
				outcome: handlerResult.outcome,
				already_terminal: false
			};
		} catch (error) {
			const failure = classifyQueueError(error);
			const maxAttempts = claim.run.definition_snapshot.policy.max_attempts;
			const terminal = failure.kind === 'permanent' || job.attempts + 1 >= maxAttempts;
			try {
				await options.store.fail({
					cycleRunId: claim.run.id,
					processingToken: job.processingToken,
					errorCode: failure.code,
					errorMessage: failure.message,
					terminal
				});
			} catch (recordError) {
				await job.log(
					`Could not record Cycle Run failure: ${recordError instanceof Error ? recordError.message : String(recordError)}`
				);
			}
			throw error;
		}
	};
}

export function createDefaultCycleHandlerRegistry(): CycleHandlerRegistry {
	const registry = new CycleHandlerRegistry();
	registry.register('daily_brief', processDailyBriefCycle);
	return registry;
}

export const processCycleRun = createCycleRunProcessor({
	registry: createDefaultCycleHandlerRegistry(),
	store: new SupabaseCycleRunStore()
});
