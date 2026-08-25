import type { CycleHandler } from './cycleHandlerRegistry';
import type { BriefJobData } from '../shared/queueUtils';
import { createLegacyJob } from '../shared/jobAdapter';
import { processBriefJob } from '../brief/briefWorker';

export const processDailyBriefCycle: CycleHandler<'daily_brief'> = async ({ run, job }) => {
	const input = run.execution_input;
	const suppressNotification = run.delivery_intent.mode === 'suppress';
	const notificationScheduledFor =
		run.delivery_intent.mode === 'evaluate'
			? (run.delivery_intent.not_before ?? undefined)
			: undefined;

	const briefData: BriefJobData = {
		userId: run.user_id,
		briefDate: input.brief_date,
		timezone: input.timezone,
		notificationScheduledFor,
		options: {
			forceRegenerate: input.force_regenerate,
			includeProjects: input.include_projects,
			excludeProjects: input.exclude_projects,
			customTemplate: input.custom_template,
			requestedBriefDate: input.mode === 'catch_up' ? input.brief_date : undefined,
			useOntology: input.use_ontology ?? true,
			suppressNotification,
			notificationSuppressionReason: suppressNotification
				? 'cycle_delivery_suppressed'
				: undefined
		}
	};

	const legacyJob = createLegacyJob<BriefJobData>({
		...job,
		data: briefData
	});
	const briefResult = await processBriefJob(legacyJob, {
		manageQueueRecord: false,
		cycleRunId: run.id,
		emitFailureEffects: false
	});

	const artifactRefs = briefResult.briefId
		? [{ type: 'daily_brief', id: briefResult.briefId, label: briefResult.briefDate }]
		: [];
	const outcome =
		briefResult.status === 'generated' || briefResult.status === 'existing'
			? {
					status: 'artifact_created' as const,
					attention_level: 'minor' as const,
					summary:
						briefResult.status === 'generated'
							? `Daily brief for ${briefResult.briefDate} is ready.`
							: `Daily brief for ${briefResult.briefDate} was already ready.`,
					artifact_refs: artifactRefs
				}
			: {
					status: 'no_change' as const,
					attention_level: 'none' as const,
					summary:
						briefResult.status === 'stale'
							? `Skipped stale Daily Brief occurrence for ${briefResult.briefDate}.`
							: `Daily brief for ${briefResult.briefDate} is already processing.`,
					artifact_refs: artifactRefs
				};

	return {
		outcome,
		result: {
			status: briefResult.status,
			brief_id: briefResult.briefId,
			brief_date: briefResult.briefDate,
			notification_outcome: briefResult.notificationOutcome ?? null
		}
	};
};
