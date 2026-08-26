// apps/worker/src/workers/cycle/dailyBriefCycleBackfill.ts
import {
	type CycleSchedule,
	DEFAULT_CYCLE_EXECUTION_POLICY,
	DEFAULT_DAILY_BRIEF_GENERATION_LEAD_MINUTES,
	type Json
} from '@buildos/shared-types';
import { calculateNextCycleScheduleAt } from '@buildos/shared-utils';
import { supabase } from '../../lib/supabase';

export interface LegacyBriefPreference {
	id: string;
	user_id: string;
	created_at: string;
	updated_at: string;
	frequency: string | null;
	day_of_week: number | null;
	time_of_day: string | null;
	is_active: boolean | null;
}

export interface DailyBriefBackfillUser {
	id: string;
	timezone: string | null;
}

export interface DailyBriefCycleBackfillCandidate {
	preferenceId: string;
	userId: string;
	schedule: Extract<CycleSchedule, { type: 'daily' | 'weekly' }>;
	nextRunAt: string;
}

export interface DailyBriefCycleBackfillStore {
	listPreferences(input: {
		afterPreferenceId: string | null;
		limit: number;
	}): Promise<LegacyBriefPreference[]>;
	loadUsers(userIds: string[]): Promise<DailyBriefBackfillUser[]>;
	loadExistingCycleUserIds(userIds: string[]): Promise<Set<string>>;
	createPausedCycle(
		candidate: DailyBriefCycleBackfillCandidate
	): Promise<'created' | 'already_exists'>;
}

export interface DailyBriefCycleBackfillSummary {
	dryRun: boolean;
	scanned: number;
	valid: number;
	wouldCreate: number;
	created: number;
	alreadyExists: number;
	skippedInvalid: number;
	failed: number;
	errors: string[];
}

function validTimezone(value: string | null): value is string {
	if (!value) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export function buildDailyBriefCycleBackfillCandidate(input: {
	preference: LegacyBriefPreference;
	user: DailyBriefBackfillUser | undefined;
	now: Date;
}): { candidate: DailyBriefCycleBackfillCandidate } | { error: string } {
	const { preference, user, now } = input;
	if (!user) return { error: 'user_missing' };
	if (!validTimezone(user.timezone)) return { error: 'timezone_invalid' };

	const timeOfDay = preference.time_of_day ?? '09:00:00';
	if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(timeOfDay)) {
		return { error: 'time_of_day_invalid' };
	}

	let schedule: Extract<CycleSchedule, { type: 'daily' | 'weekly' }>;
	if (preference.frequency === 'weekly') {
		if (
			!Number.isInteger(preference.day_of_week) ||
			preference.day_of_week === null ||
			preference.day_of_week < 0 ||
			preference.day_of_week > 6
		) {
			return { error: 'day_of_week_invalid' };
		}
		schedule = {
			type: 'weekly',
			days_of_week: [preference.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6],
			time_of_day: timeOfDay,
			timezone: user.timezone
		};
	} else if (preference.frequency === 'daily' || preference.frequency === null) {
		schedule = { type: 'daily', time_of_day: timeOfDay, timezone: user.timezone };
	} else {
		return { error: 'frequency_unsupported' };
	}

	return {
		candidate: {
			preferenceId: preference.id,
			userId: preference.user_id,
			schedule,
			nextRunAt: calculateNextCycleScheduleAt(schedule, now).toISOString()
		}
	};
}

export class SupabaseDailyBriefCycleBackfillStore implements DailyBriefCycleBackfillStore {
	async listPreferences(input: {
		afterPreferenceId: string | null;
		limit: number;
	}): Promise<LegacyBriefPreference[]> {
		let query = supabase
			.from('user_brief_preferences')
			.select(
				'id, user_id, created_at, updated_at, frequency, day_of_week, time_of_day, is_active'
			)
			.order('id', { ascending: true })
			.limit(input.limit);
		if (input.afterPreferenceId) query = query.gt('id', input.afterPreferenceId);
		const { data, error } = await query;
		if (error) throw new Error(`Failed to list Daily Brief preferences: ${error.message}`);
		return data ?? [];
	}

	async loadUsers(userIds: string[]): Promise<DailyBriefBackfillUser[]> {
		if (userIds.length === 0) return [];
		const { data, error } = await supabase
			.from('users')
			.select('id, timezone')
			.in('id', userIds);
		if (error) throw new Error(`Failed to load Daily Brief users: ${error.message}`);
		return data ?? [];
	}

	async loadExistingCycleUserIds(userIds: string[]): Promise<Set<string>> {
		if (userIds.length === 0) return new Set();
		const { data, error } = await supabase
			.from('cycles')
			.select('user_id')
			.eq('kind', 'daily_brief')
			.is('deleted_at', null)
			.in('user_id', userIds);
		if (error) throw new Error(`Failed to load existing Daily Brief Cycles: ${error.message}`);
		return new Set((data ?? []).map((row) => row.user_id));
	}

	async createPausedCycle(
		candidate: DailyBriefCycleBackfillCandidate
	): Promise<'created' | 'already_exists'> {
		const { data, error } = await supabase.rpc('create_cycle', {
			p_user_id: candidate.userId,
			p_request_id: `daily-brief-preference-backfill-v1:${candidate.preferenceId}`,
			p_label: 'Daily Brief',
			p_kind: 'daily_brief',
			p_target_type: 'user',
			p_project_id: null as unknown as string,
			p_config: {
				generation_lead_minutes: DEFAULT_DAILY_BRIEF_GENERATION_LEAD_MINUTES
			},
			p_triggers: [
				{
					type: 'schedule',
					schedule: candidate.schedule,
					state: 'active',
					next_run_at: candidate.nextRunAt
				}
			] as unknown as Json,
			p_policy: { ...DEFAULT_CYCLE_EXECUTION_POLICY },
			p_attention_policy: 'always',
			p_state: 'paused'
		});
		if (error) {
			if (
				error.code === '23505' ||
				error.message.includes('cycle_already_exists_for_target')
			) {
				return 'already_exists';
			}
			throw new Error(`create_cycle failed for ${candidate.userId}: ${error.message}`);
		}
		if (!data || typeof data !== 'object') {
			throw new Error(`create_cycle returned no Cycle for ${candidate.userId}`);
		}
		return 'created';
	}
}

export async function backfillDailyBriefCycles(
	options: {
		store?: DailyBriefCycleBackfillStore;
		now?: Date;
		dryRun?: boolean;
		batchSize?: number;
		maxRecords?: number;
	} = {}
): Promise<DailyBriefCycleBackfillSummary> {
	const store = options.store ?? new SupabaseDailyBriefCycleBackfillStore();
	const now = options.now ?? new Date();
	const dryRun = options.dryRun ?? true;
	const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500);
	const maxRecords = Math.max(options.maxRecords ?? Number.MAX_SAFE_INTEGER, 0);
	const summary: DailyBriefCycleBackfillSummary = {
		dryRun,
		scanned: 0,
		valid: 0,
		wouldCreate: 0,
		created: 0,
		alreadyExists: 0,
		skippedInvalid: 0,
		failed: 0,
		errors: []
	};
	let afterPreferenceId: string | null = null;

	while (summary.scanned < maxRecords) {
		const remaining = maxRecords - summary.scanned;
		const preferences = await store.listPreferences({
			afterPreferenceId,
			limit: Math.min(batchSize, remaining)
		});
		if (preferences.length === 0) break;
		afterPreferenceId = preferences.at(-1)?.id ?? null;
		summary.scanned += preferences.length;

		const userIds = [...new Set(preferences.map((preference) => preference.user_id))];
		const [users, existingUserIds] = await Promise.all([
			store.loadUsers(userIds),
			store.loadExistingCycleUserIds(userIds)
		]);
		const usersById = new Map(users.map((user) => [user.id, user]));

		for (const preference of preferences) {
			if (existingUserIds.has(preference.user_id)) {
				summary.alreadyExists += 1;
				continue;
			}
			const built = buildDailyBriefCycleBackfillCandidate({
				preference,
				user: usersById.get(preference.user_id),
				now
			});
			if ('error' in built) {
				summary.skippedInvalid += 1;
				if (summary.errors.length < 20) {
					summary.errors.push(`${preference.id}: ${built.error}`);
				}
				continue;
			}
			summary.valid += 1;
			if (dryRun) {
				summary.wouldCreate += 1;
				continue;
			}
			try {
				const disposition = await store.createPausedCycle(built.candidate);
				if (disposition === 'created') summary.created += 1;
				else summary.alreadyExists += 1;
			} catch (error) {
				summary.failed += 1;
				if (summary.errors.length < 20) {
					summary.errors.push(
						`${preference.id}: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			}
		}
	}

	return summary;
}
