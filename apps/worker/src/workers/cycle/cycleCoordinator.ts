// apps/worker/src/workers/cycle/cycleCoordinator.ts
import { randomUUID } from 'node:crypto';
import { formatInTimeZone } from 'date-fns-tz';
import type {
	CycleExecutionPolicy,
	CycleKind,
	CycleRunAdmissionResult,
	CycleSchedule,
	CycleTriggerSpec,
	DailyBriefCycleRunInput,
	Json
} from '@buildos/shared-types';
import { calculateNextCycleScheduleAt } from '@buildos/shared-utils';
import { supabase } from '../../lib/supabase';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 120;
/** Scheduling jitter inside this window is an on-time tick, not an outage misfire. */
export const CYCLE_MISFIRE_GRACE_MS = 5 * 60 * 1000;

export interface ClaimedCycleTrigger {
	trigger_id: string;
	cycle_id: string;
	user_id: string;
	kind: CycleKind;
	policy: CycleExecutionPolicy;
	scheduled_for: string;
	spec: Extract<CycleTriggerSpec, { type: 'schedule' }>;
	claim_token: string;
	claim_expires_at: string;
}

export interface CycleTriggerCoordinatorStore {
	claimDue(input: {
		claimToken: string;
		dueThrough: string;
		limit: number;
		leaseSeconds: number;
		kinds: CycleKind[];
	}): Promise<ClaimedCycleTrigger[]>;
	admitClaimed(input: {
		triggerId: string;
		claimToken: string;
		executionInput: DailyBriefCycleRunInput;
		deliveryIntent: { mode: 'evaluate'; not_before: string };
		nextTriggerAt: string;
		triggeredAt: string;
	}): Promise<CycleRunAdmissionResult>;
	skipClaimed(input: {
		triggerId: string;
		claimToken: string;
		executionInput: DailyBriefCycleRunInput;
		nextTriggerAt: string;
		triggeredAt: string;
	}): Promise<CycleRunAdmissionResult>;
	release(input: { triggerId: string; claimToken: string }): Promise<boolean>;
}

export interface CycleCoordinatorSummary {
	claimed: number;
	admitted: number;
	alreadyAdmitted: number;
	skippedOverlap: number;
	skippedMisfire: number;
	failed: number;
	errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseClaim(value: unknown): ClaimedCycleTrigger {
	if (!isRecord(value) || !isRecord(value.spec) || value.spec.type !== 'schedule') {
		throw new Error('claim_due_cycle_triggers returned an invalid trigger claim.');
	}
	const requiredStrings = [
		'trigger_id',
		'cycle_id',
		'user_id',
		'kind',
		'scheduled_for',
		'claim_token',
		'claim_expires_at'
	] as const;
	if (requiredStrings.some((key) => typeof value[key] !== 'string') || !isRecord(value.policy)) {
		throw new Error('claim_due_cycle_triggers returned an invalid trigger claim.');
	}
	return value as unknown as ClaimedCycleTrigger;
}

function parseClaims(value: unknown): ClaimedCycleTrigger[] {
	if (!Array.isArray(value)) {
		throw new Error('claim_due_cycle_triggers returned a non-array response.');
	}
	return value.map(parseClaim);
}

function parseAdmissionResult(
	value: unknown,
	rpcName: string,
	allowedDispositions: CycleRunAdmissionResult['disposition'][]
): CycleRunAdmissionResult {
	if (
		!isRecord(value) ||
		typeof value.disposition !== 'string' ||
		!allowedDispositions.includes(
			value.disposition as CycleRunAdmissionResult['disposition']
		) ||
		typeof value.cycle_run_id !== 'string' ||
		(value.queue_job_record_id !== null && typeof value.queue_job_record_id !== 'string') ||
		(value.queue_job_id !== null && typeof value.queue_job_id !== 'string')
	) {
		throw new Error(`${rpcName} returned an invalid response.`);
	}
	return value as unknown as CycleRunAdmissionResult;
}

export class SupabaseCycleTriggerCoordinatorStore implements CycleTriggerCoordinatorStore {
	async claimDue(input: {
		claimToken: string;
		dueThrough: string;
		limit: number;
		leaseSeconds: number;
		kinds: CycleKind[];
	}): Promise<ClaimedCycleTrigger[]> {
		const { data, error } = await supabase.rpc('claim_due_cycle_triggers', {
			p_claim_token: input.claimToken,
			p_due_through: input.dueThrough,
			p_limit: input.limit,
			p_lease_seconds: input.leaseSeconds,
			p_kinds: input.kinds
		});
		if (error) throw new Error(`claim_due_cycle_triggers failed: ${error.message}`);
		return parseClaims(data);
	}

	async admitClaimed(input: {
		triggerId: string;
		claimToken: string;
		executionInput: DailyBriefCycleRunInput;
		deliveryIntent: { mode: 'evaluate'; not_before: string };
		nextTriggerAt: string;
		triggeredAt: string;
	}): Promise<CycleRunAdmissionResult> {
		const { data, error } = await supabase.rpc('admit_claimed_cycle_trigger', {
			p_trigger_id: input.triggerId,
			p_claim_token: input.claimToken,
			p_execution_input: input.executionInput as unknown as Json,
			p_delivery_intent: input.deliveryIntent as unknown as Json,
			p_next_trigger_at: input.nextTriggerAt,
			p_triggered_at: input.triggeredAt
		});
		if (error) throw new Error(`admit_claimed_cycle_trigger failed: ${error.message}`);
		return parseAdmissionResult(data, 'admit_claimed_cycle_trigger', [
			'admitted',
			'already_admitted',
			'skipped_overlap'
		]);
	}

	async skipClaimed(input: {
		triggerId: string;
		claimToken: string;
		executionInput: DailyBriefCycleRunInput;
		nextTriggerAt: string;
		triggeredAt: string;
	}): Promise<CycleRunAdmissionResult> {
		const { data, error } = await supabase.rpc('skip_claimed_cycle_trigger', {
			p_trigger_id: input.triggerId,
			p_claim_token: input.claimToken,
			p_execution_input: input.executionInput as unknown as Json,
			p_next_trigger_at: input.nextTriggerAt,
			p_triggered_at: input.triggeredAt
		});
		if (error) throw new Error(`skip_claimed_cycle_trigger failed: ${error.message}`);
		return parseAdmissionResult(data, 'skip_claimed_cycle_trigger', ['skipped_misfire']);
	}

	async release(input: { triggerId: string; claimToken: string }): Promise<boolean> {
		const { data, error } = await supabase.rpc('release_cycle_trigger_claim', {
			p_trigger_id: input.triggerId,
			p_claim_token: input.claimToken
		});
		if (error) throw new Error(`release_cycle_trigger_claim failed: ${error.message}`);
		return data === true;
	}
}

function scheduleFromClaim(claim: ClaimedCycleTrigger): CycleSchedule {
	const schedule = claim.spec.schedule;
	if (!schedule || typeof schedule !== 'object' || !('type' in schedule)) {
		throw new Error(`Cycle trigger ${claim.trigger_id} has no valid schedule.`);
	}
	return schedule;
}

function materializeDailyBriefOccurrence(
	claim: ClaimedCycleTrigger,
	now: Date,
	misfireGraceMs: number
): {
	executionInput: DailyBriefCycleRunInput;
	deliveryIntent: { mode: 'evaluate'; not_before: string };
	nextTriggerAt: string;
	misfired: boolean;
} {
	const scheduledFor = new Date(claim.scheduled_for);
	if (!Number.isFinite(scheduledFor.getTime())) {
		throw new Error(`Cycle trigger ${claim.trigger_id} has an invalid scheduled_for value.`);
	}
	const schedule = scheduleFromClaim(claim);
	const timezone = schedule.type === 'interval' ? 'UTC' : schedule.timezone;
	const misfired = now.getTime() - scheduledFor.getTime() > misfireGraceMs;
	const nextReference = new Date(Math.max(now.getTime(), scheduledFor.getTime()) + 1);
	const nextTriggerAt = calculateNextCycleScheduleAt(schedule, nextReference);

	return {
		executionInput: {
			mode: misfired ? 'catch_up' : 'scheduled',
			brief_date: formatInTimeZone(scheduledFor, timezone, 'yyyy-MM-dd'),
			timezone,
			force_regenerate: false,
			use_ontology: true
		},
		deliveryIntent: { mode: 'evaluate', not_before: scheduledFor.toISOString() },
		nextTriggerAt: nextTriggerAt.toISOString(),
		misfired
	};
}

export async function runDueCycleCoordinator(
	options: {
		store?: CycleTriggerCoordinatorStore;
		now?: Date;
		batchSize?: number;
		leaseSeconds?: number;
		claimToken?: string;
		misfireGraceMs?: number;
	} = {}
): Promise<CycleCoordinatorSummary> {
	const store = options.store ?? new SupabaseCycleTriggerCoordinatorStore();
	const now = options.now ?? new Date();
	const claimToken = options.claimToken ?? randomUUID();
	const misfireGraceMs = options.misfireGraceMs ?? CYCLE_MISFIRE_GRACE_MS;
	if (!Number.isFinite(misfireGraceMs) || misfireGraceMs < 0) {
		throw new Error('Cycle misfire grace must be a non-negative duration.');
	}
	const claims = await store.claimDue({
		claimToken,
		dueThrough: now.toISOString(),
		limit: options.batchSize ?? DEFAULT_BATCH_SIZE,
		leaseSeconds: options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
		kinds: ['daily_brief']
	});
	const summary: CycleCoordinatorSummary = {
		claimed: claims.length,
		admitted: 0,
		alreadyAdmitted: 0,
		skippedOverlap: 0,
		skippedMisfire: 0,
		failed: 0,
		errors: []
	};

	for (const claim of claims) {
		try {
			if (claim.kind !== 'daily_brief' || claim.claim_token !== claimToken) {
				throw new Error(
					`Cycle trigger ${claim.trigger_id} returned outside its claim scope.`
				);
			}
			const occurrence = materializeDailyBriefOccurrence(claim, now, misfireGraceMs);
			const result =
				occurrence.misfired && claim.policy.misfire === 'skip'
					? await store.skipClaimed({
							triggerId: claim.trigger_id,
							claimToken,
							executionInput: occurrence.executionInput,
							nextTriggerAt: occurrence.nextTriggerAt,
							triggeredAt: now.toISOString()
						})
					: await store.admitClaimed({
							triggerId: claim.trigger_id,
							claimToken,
							executionInput: occurrence.executionInput,
							deliveryIntent: occurrence.deliveryIntent,
							nextTriggerAt: occurrence.nextTriggerAt,
							triggeredAt: now.toISOString()
						});
			if (result.disposition === 'admitted') summary.admitted += 1;
			else if (result.disposition === 'already_admitted') summary.alreadyAdmitted += 1;
			else if (result.disposition === 'skipped_overlap') summary.skippedOverlap += 1;
			else summary.skippedMisfire += 1;
		} catch (error) {
			summary.failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			summary.errors.push(`${claim.trigger_id}: ${message}`);
			try {
				await store.release({ triggerId: claim.trigger_id, claimToken });
			} catch (releaseError) {
				summary.errors.push(
					`${claim.trigger_id}: failed to release claim: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`
				);
			}
		}
	}

	return summary;
}
