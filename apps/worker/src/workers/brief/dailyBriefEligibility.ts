// apps/worker/src/workers/brief/dailyBriefEligibility.ts
import { supabase } from '../../lib/supabase';

interface DailyBriefEligibilityRow {
	user_id: string;
}

interface DailyBriefEligibilityRpcClient {
	rpc(
		fn: 'get_daily_brief_eligible_user_ids',
		args: { user_ids: string[] }
	): Promise<{
		data: DailyBriefEligibilityRow[] | null;
		error: { message: string } | null;
	}>;
}

const eligibilityRpcClient = supabase as typeof supabase & DailyBriefEligibilityRpcClient;

/**
 * Resolve daily-brief project eligibility in one database round trip.
 *
 * The RPC mirrors the generator's accepted project states and legacy access
 * seams. Failing closed prevents a transient preflight error from enqueueing a
 * batch of jobs that cannot be proven useful; the next scheduler tick retries.
 */
export async function getDailyBriefEligibleUserIds(userIds: string[]): Promise<Set<string>> {
	const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
	if (uniqueUserIds.length === 0) return new Set();

	const { data, error } = await eligibilityRpcClient.rpc('get_daily_brief_eligible_user_ids', {
		user_ids: uniqueUserIds
	});

	if (error) {
		throw new Error(`Failed to resolve daily brief project eligibility: ${error.message}`);
	}

	const requestedUserIds = new Set(uniqueUserIds);
	return new Set(
		(data ?? []).map((row) => row.user_id).filter((userId) => requestedUserIds.has(userId))
	);
}
