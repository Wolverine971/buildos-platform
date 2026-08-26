// apps/worker/src/workers/cycle/dailyBriefCycleShadow.ts
import type { CycleSchedule, Json } from '@buildos/shared-types';
import { calculateNextCycleScheduleAt } from '@buildos/shared-utils';
import { supabase } from '../../lib/supabase';
import {
	type DailyBriefBackfillUser,
	type LegacyBriefPreference,
	buildDailyBriefCycleBackfillCandidate
} from './dailyBriefCycleBackfill';

export interface DailyBriefShadowCycle {
	id: string;
	user_id: string;
	state: string;
	cycle_triggers: Array<{
		id: string;
		state: string;
		trigger_type: string;
		spec: Json;
	}>;
}

export interface DailyBriefCycleShadowStore {
	listActivePreferences(input: {
		afterPreferenceId: string | null;
		limit: number;
	}): Promise<LegacyBriefPreference[]>;
	loadUsers(userIds: string[]): Promise<DailyBriefBackfillUser[]>;
	loadCycles(userIds: string[]): Promise<DailyBriefShadowCycle[]>;
}

export interface DailyBriefCycleShadowMismatch {
	preferenceId: string;
	userId: string;
	cycleId: string | null;
	reason:
		| 'missing_cycle'
		| 'missing_schedule_trigger'
		| 'legacy_invalid'
		| 'cycle_invalid'
		| 'projection_mismatch';
	legacyNextRunAt: string | null;
	cycleNextRunAt: string | null;
}

export interface DailyBriefCycleShadowSummary {
	startedAt: string;
	completedAt: string;
	durationMs: number;
	scanned: number;
	comparable: number;
	matched: number;
	mismatched: number;
	missingCycle: number;
	invalid: number;
	matchRatePct: number;
	examples: DailyBriefCycleShadowMismatch[];
}

export interface DailyBriefCycleShadowHealthSnapshot {
	enabled: boolean;
	state: 'disabled' | 'idle' | 'healthy' | 'degraded';
	healthy: boolean;
	lastSummary: DailyBriefCycleShadowSummary | null;
	lastError: string | null;
}

type LegacyProjection = (
	preference: LegacyBriefPreference,
	now: Date,
	timezone: string
) => Date | null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scheduleFromCycle(cycle: DailyBriefShadowCycle): CycleSchedule | null {
	const trigger = cycle.cycle_triggers.find(
		(candidate) => candidate.state === 'active' && candidate.trigger_type === 'schedule'
	);
	if (!trigger || !isRecord(trigger.spec) || trigger.spec.type !== 'schedule') return null;
	const schedule = trigger.spec.schedule;
	if (!isRecord(schedule) || typeof schedule.type !== 'string') return null;
	return schedule as unknown as CycleSchedule;
}

export class SupabaseDailyBriefCycleShadowStore implements DailyBriefCycleShadowStore {
	async listActivePreferences(input: {
		afterPreferenceId: string | null;
		limit: number;
	}): Promise<LegacyBriefPreference[]> {
		let query = supabase
			.from('user_brief_preferences')
			.select(
				'id, user_id, created_at, updated_at, frequency, day_of_week, time_of_day, is_active'
			)
			.eq('is_active', true)
			.order('id', { ascending: true })
			.limit(input.limit);
		if (input.afterPreferenceId) query = query.gt('id', input.afterPreferenceId);
		const { data, error } = await query;
		if (error)
			throw new Error(`Failed to list active Daily Brief preferences: ${error.message}`);
		return data ?? [];
	}

	async loadUsers(userIds: string[]): Promise<DailyBriefBackfillUser[]> {
		if (userIds.length === 0) return [];
		const { data, error } = await supabase
			.from('users')
			.select('id, timezone')
			.in('id', userIds);
		if (error) throw new Error(`Failed to load Daily Brief shadow users: ${error.message}`);
		return data ?? [];
	}

	async loadCycles(userIds: string[]): Promise<DailyBriefShadowCycle[]> {
		if (userIds.length === 0) return [];
		const { data, error } = await supabase
			.from('cycles')
			.select('id, user_id, state, cycle_triggers(id, state, trigger_type, spec)')
			.eq('kind', 'daily_brief')
			.is('deleted_at', null)
			.in('user_id', userIds);
		if (error) throw new Error(`Failed to load Daily Brief shadow Cycles: ${error.message}`);
		return (data ?? []) as unknown as DailyBriefShadowCycle[];
	}
}

let lastShadowSummary: DailyBriefCycleShadowSummary | null = null;
let lastShadowError: string | null = null;

export function getDailyBriefCycleShadowHealthSnapshot(
	enabled: boolean
): DailyBriefCycleShadowHealthSnapshot {
	if (!enabled) {
		return {
			enabled: false,
			state: 'disabled',
			healthy: true,
			lastSummary: lastShadowSummary,
			lastError: null
		};
	}
	if (lastShadowError) {
		return {
			enabled: true,
			state: 'degraded',
			healthy: false,
			lastSummary: lastShadowSummary,
			lastError: lastShadowError
		};
	}
	const semanticDrift = Boolean(
		lastShadowSummary &&
			(lastShadowSummary.mismatched > 0 ||
				lastShadowSummary.missingCycle > 0 ||
				lastShadowSummary.invalid > 0)
	);
	return {
		enabled: true,
		state: semanticDrift ? 'degraded' : lastShadowSummary ? 'healthy' : 'idle',
		healthy: Boolean(lastShadowSummary) && !semanticDrift,
		lastSummary: lastShadowSummary,
		lastError: semanticDrift ? 'shadow_projection_drift_detected' : null
	};
}

export async function runDailyBriefCycleShadow(options: {
	calculateLegacyNextRunAt: LegacyProjection;
	store?: DailyBriefCycleShadowStore;
	now?: Date;
	batchSize?: number;
	maxRecords?: number;
}): Promise<DailyBriefCycleShadowSummary> {
	const store = options.store ?? new SupabaseDailyBriefCycleShadowStore();
	const now = options.now ?? new Date();
	const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
	const maxRecords = Math.max(options.maxRecords ?? Number.MAX_SAFE_INTEGER, 0);
	const startedAt = new Date();
	const summary: DailyBriefCycleShadowSummary = {
		startedAt: startedAt.toISOString(),
		completedAt: startedAt.toISOString(),
		durationMs: 0,
		scanned: 0,
		comparable: 0,
		matched: 0,
		mismatched: 0,
		missingCycle: 0,
		invalid: 0,
		matchRatePct: 0,
		examples: []
	};
	let afterPreferenceId: string | null = null;

	try {
		while (summary.scanned < maxRecords) {
			const preferences = await store.listActivePreferences({
				afterPreferenceId,
				limit: Math.min(batchSize, maxRecords - summary.scanned)
			});
			if (preferences.length === 0) break;
			afterPreferenceId = preferences.at(-1)?.id ?? null;
			summary.scanned += preferences.length;

			const userIds = [...new Set(preferences.map((preference) => preference.user_id))];
			const [users, cycles] = await Promise.all([
				store.loadUsers(userIds),
				store.loadCycles(userIds)
			]);
			const usersById = new Map(users.map((user) => [user.id, user]));
			const cyclesByUserId = new Map(cycles.map((cycle) => [cycle.user_id, cycle]));

			for (const preference of preferences) {
				const user = usersById.get(preference.user_id);
				const built = buildDailyBriefCycleBackfillCandidate({ preference, user, now });
				const cycle = cyclesByUserId.get(preference.user_id);
				if (!cycle) {
					summary.missingCycle += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: null,
							reason: 'missing_cycle',
							legacyNextRunAt: null,
							cycleNextRunAt: null
						});
					}
					continue;
				}
				if ('error' in built || !user?.timezone) {
					summary.invalid += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'legacy_invalid',
							legacyNextRunAt: null,
							cycleNextRunAt: null
						});
					}
					continue;
				}

				const schedule = scheduleFromCycle(cycle);
				if (!schedule) {
					summary.invalid += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'missing_schedule_trigger',
							legacyNextRunAt: null,
							cycleNextRunAt: null
						});
					}
					continue;
				}

				let legacyNext: Date | null = null;
				try {
					legacyNext = options.calculateLegacyNextRunAt(preference, now, user.timezone);
				} catch {
					summary.invalid += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'legacy_invalid',
							legacyNextRunAt: null,
							cycleNextRunAt: null
						});
					}
					continue;
				}
				if (!legacyNext) {
					summary.invalid += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'legacy_invalid',
							legacyNextRunAt: null,
							cycleNextRunAt: null
						});
					}
					continue;
				}

				let cycleNext: Date;
				try {
					cycleNext = calculateNextCycleScheduleAt(schedule, now);
				} catch {
					summary.invalid += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'cycle_invalid',
							legacyNextRunAt: legacyNext.toISOString(),
							cycleNextRunAt: null
						});
					}
					continue;
				}
				summary.comparable += 1;
				if (legacyNext.getTime() === cycleNext.getTime()) {
					summary.matched += 1;
				} else {
					summary.mismatched += 1;
					if (summary.examples.length < 20) {
						summary.examples.push({
							preferenceId: preference.id,
							userId: preference.user_id,
							cycleId: cycle.id,
							reason: 'projection_mismatch',
							legacyNextRunAt: legacyNext.toISOString(),
							cycleNextRunAt: cycleNext.toISOString()
						});
					}
				}
			}
		}

		const completedAt = new Date();
		summary.completedAt = completedAt.toISOString();
		summary.durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
		summary.matchRatePct =
			summary.comparable > 0
				? Number(((summary.matched / summary.comparable) * 100).toFixed(2))
				: 0;
		lastShadowSummary = summary;
		lastShadowError = null;
		return summary;
	} catch (error) {
		lastShadowError = error instanceof Error ? error.message : String(error);
		throw error;
	}
}
