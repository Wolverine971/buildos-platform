// apps/worker/src/lib/briefBackoffCalculator.ts
import { supabase } from './supabase';

export interface BackoffDecision {
	shouldSend: boolean;
	isReengagement: boolean;
	daysSinceLastLogin: number;
	engagementStage: 'standard' | 'reengagement' | 'dormant';
	reason: string;
}

interface UserLastVisit {
	last_visit: string | null;
}

interface LastBriefSent {
	brief_date: string;
	generation_completed_at: string | null;
}

interface LatestOntologyDailyBriefRow {
	user_id: string;
	brief_date: string;
	generation_completed_at: string | null;
}

/**
 * BriefBackoffCalculator - Pure function calculator for determining
 * whether to send daily briefs based on user engagement.
 *
 * Uses existing database tables (users.last_visit, ontology_daily_briefs) with
 * no additional state storage required.
 */
export class BriefBackoffCalculator {
	private readonly BACKOFF_SCHEDULE = {
		COOLING_OFF_DAYS: 2,
		FIRST_REENGAGEMENT: 4,
		SECOND_REENGAGEMENT: 14,
		DORMANT_CHECK_IN: 60,
		DORMANT_RECURRING_INTERVAL: 90
	};

	private readonly latestBriefRpcClient = supabase as typeof supabase & {
		rpc(
			fn: 'get_latest_ontology_daily_briefs',
			args: { user_ids: string[] }
		): Promise<{
			data: LatestOntologyDailyBriefRow[] | null;
			error: { message: string } | null;
		}>;
	};

	/**
	 * BATCH METHOD: Pre-fetches engagement data for multiple users in 2 queries
	 * instead of 2 queries per user. Returns a Map of userId -> BackoffDecision.
	 *
	 * For 100 users, this uses 2 queries instead of 200 queries.
	 */
	public async shouldSendDailyBriefBatch(
		userIds: string[]
	): Promise<Map<string, BackoffDecision>> {
		if (userIds.length === 0) {
			return new Map();
		}

		const results = new Map<string, BackoffDecision>();

		try {
			// BATCH QUERY 1: Fetch all user last_visit data in single query
			const { data: usersData, error: usersError } = await supabase
				.from('users')
				.select('id, last_visit')
				.in('id', userIds);

			if (usersError) {
				console.error('Error batch fetching user last visits:', usersError);
				// Fall back to individual queries on error
				return this.fallbackToIndividualQueries(userIds);
			}

			const userLastVisitMap = new Map<string, string | null>();
			usersData?.forEach((user) => {
				userLastVisitMap.set(user.id, user.last_visit);
			});

			// BATCH QUERY 2: Fetch most recent brief for each user via RPC
			const { data: briefsData, error: briefsError } = await this.latestBriefRpcClient.rpc(
				'get_latest_ontology_daily_briefs',
				{ user_ids: userIds }
			);

			if (briefsError) {
				console.error('Error batch fetching last briefs:', briefsError);
				// Fall back to individual queries on error
				return this.fallbackToIndividualQueries(userIds);
			}

			// Build map of userId -> most recent brief
			const userLastBriefMap = new Map<
				string,
				{ brief_date: string; generation_completed_at: string | null }
			>();
			const typedBriefs = briefsData || [];
			typedBriefs.forEach((brief) => {
				userLastBriefMap.set(brief.user_id, {
					brief_date: brief.brief_date,
					generation_completed_at: brief.generation_completed_at
				});
			});

			// Calculate backoff decision for each user using pre-fetched data
			for (const userId of userIds) {
				const lastVisit = userLastVisitMap.get(userId);
				const lastBrief = userLastBriefMap.get(userId);

				if (!lastVisit) {
					// New user or never logged in - send normal brief
					results.set(userId, {
						shouldSend: true,
						isReengagement: false,
						daysSinceLastLogin: 0,
						engagementStage: 'standard',
						reason: 'No last visit recorded'
					});
					continue;
				}

				const daysSinceLastLogin = this.calculateDaysSince(lastVisit);
				const daysSinceLastBrief = lastBrief
					? this.calculateDaysSince(
							lastBrief.generation_completed_at || lastBrief.brief_date
						)
					: 999;

				results.set(
					userId,
					this.calculateBackoffDecision(daysSinceLastLogin, daysSinceLastBrief)
				);
			}

			console.log(
				`[BackoffCalculator] Batch processed ${userIds.length} users with 2 queries`
			);
			return results;
		} catch (error) {
			console.error('Error in batch backoff calculation:', error);
			return this.fallbackToIndividualQueries(userIds);
		}
	}

	/**
	 * Fallback method when batch query fails - uses individual queries
	 */
	private async fallbackToIndividualQueries(
		userIds: string[]
	): Promise<Map<string, BackoffDecision>> {
		console.warn(
			`[BackoffCalculator] Falling back to individual queries for ${userIds.length} users`
		);
		const results = new Map<string, BackoffDecision>();

		for (const userId of userIds) {
			try {
				const decision = await this.shouldSendDailyBrief(userId);
				results.set(userId, decision);
			} catch (error) {
				console.error(`Failed to check engagement for user ${userId}:`, error);
				// Default to sending on error
				results.set(userId, {
					shouldSend: true,
					isReengagement: false,
					daysSinceLastLogin: 0,
					engagementStage: 'standard',
					reason: 'Error checking engagement - defaulting to send'
				});
			}
		}

		return results;
	}

	/**
	 * Determines if a daily brief should be sent to a user based on their
	 * last login and last brief sent.
	 */
	public async shouldSendDailyBrief(userId: string): Promise<BackoffDecision> {
		// Fetch user's last visit and last brief sent in parallel
		const [userData, lastBrief] = await Promise.all([
			this.getUserLastVisit(userId),
			this.getLastBriefSent(userId)
		]);

		if (!userData?.last_visit) {
			// New user or never logged in - send normal brief
			return {
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin: 0,
				engagementStage: 'standard',
				reason: 'No last visit recorded'
			};
		}

		const daysSinceLastLogin = this.calculateDaysSince(userData.last_visit);
		const daysSinceLastBrief = lastBrief
			? this.calculateDaysSince(lastBrief.generation_completed_at || lastBrief.brief_date)
			: 999; // If no brief ever sent, treat as very old

		// Apply backoff logic
		return this.calculateBackoffDecision(daysSinceLastLogin, daysSinceLastBrief);
	}

	/**
	 * Fetch user's last visit timestamp
	 */
	private async getUserLastVisit(userId: string): Promise<UserLastVisit | null> {
		const { data, error } = await supabase
			.from('users')
			.select('last_visit')
			.eq('id', userId)
			.single();

		if (error) {
			console.error(`Error fetching last visit for user ${userId}:`, error.message);
			return null;
		}

		return data;
	}

	/**
	 * Fetch the most recent ontology daily brief for a user
	 */
	private async getLastBriefSent(userId: string): Promise<LastBriefSent | null> {
		const { data, error } = await supabase
			.from('ontology_daily_briefs')
			.select('brief_date, generation_completed_at')
			.eq('user_id', userId)
			.order('brief_date', { ascending: false })
			.limit(1)
			.single();

		if (error) {
			// No briefs found is not an error, just means first brief
			if (error.code === 'PGRST116') {
				return null;
			}
			console.error(`Error fetching last brief for user ${userId}:`, error.message);
			return null;
		}

		return data;
	}

	/**
	 * Calculate the number of days since a given date
	 */
	private calculateDaysSince(dateString: string): number {
		return Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
	}

	/**
	 * Apply backoff logic to determine if brief should be sent
	 */
	private calculateBackoffDecision(
		daysSinceLastLogin: number,
		daysSinceLastBrief: number
	): BackoffDecision {
		// Days 0-2: Send normal briefs
		if (daysSinceLastLogin <= 2) {
			return {
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: 'User is active (logged in within 2 days)'
			};
		}

		// Days 2-4: Cooling off period (no emails)
		if (daysSinceLastLogin > 2 && daysSinceLastLogin < 4) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: 'Cooling off period (3 days inactive)'
			};
		}

		// Day 4: First re-engagement (if we haven't sent recently)
		if (
			daysSinceLastLogin === this.BACKOFF_SCHEDULE.FIRST_REENGAGEMENT &&
			daysSinceLastBrief >= 2
		) {
			return {
				shouldSend: true,
				isReengagement: true,
				daysSinceLastLogin,
				engagementStage: 'reengagement',
				reason: '4-day re-engagement email'
			};
		}
		if (daysSinceLastLogin === this.BACKOFF_SCHEDULE.FIRST_REENGAGEMENT) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: `Waiting after recent brief (last brief ${daysSinceLastBrief} days ago)`
			};
		}

		// Days 5-13: First backoff
		if (
			daysSinceLastLogin > this.BACKOFF_SCHEDULE.FIRST_REENGAGEMENT &&
			daysSinceLastLogin < this.BACKOFF_SCHEDULE.SECOND_REENGAGEMENT
		) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: 'First backoff period (5-13 days)'
			};
		}

		// Day 14: Second re-engagement (if we haven't sent recently)
		if (
			daysSinceLastLogin === this.BACKOFF_SCHEDULE.SECOND_REENGAGEMENT &&
			daysSinceLastBrief >= 10
		) {
			return {
				shouldSend: true,
				isReengagement: true,
				daysSinceLastLogin,
				engagementStage: 'reengagement',
				reason: '14-day re-engagement email'
			};
		}
		if (daysSinceLastLogin === this.BACKOFF_SCHEDULE.SECOND_REENGAGEMENT) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: `Waiting after recent brief (last brief ${daysSinceLastBrief} days ago)`
			};
		}

		// Days 15-59: Long backoff before treating the account as dormant
		if (
			daysSinceLastLogin > this.BACKOFF_SCHEDULE.SECOND_REENGAGEMENT &&
			daysSinceLastLogin < this.BACKOFF_SCHEDULE.DORMANT_CHECK_IN
		) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: 'Long backoff period (15-59 days)'
			};
		}

		// Day 60+: Dormant account check-in, then no more than every 90 days.
		if (daysSinceLastLogin >= this.BACKOFF_SCHEDULE.DORMANT_CHECK_IN) {
			if (daysSinceLastBrief >= this.BACKOFF_SCHEDULE.DORMANT_RECURRING_INTERVAL) {
				return {
					shouldSend: true,
					isReengagement: true,
					daysSinceLastLogin,
					engagementStage: 'dormant',
					reason: `Dormant account check-in (${daysSinceLastLogin} days inactive)`
				};
			}
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason: `Waiting for 90-day dormant interval (last brief ${daysSinceLastBrief} days ago)`
			};
		}

		// Fallback (shouldn't reach here)
		return {
			shouldSend: false,
			isReengagement: false,
			daysSinceLastLogin,
			engagementStage: 'standard',
			reason: 'Default: no email'
		};
	}
}
