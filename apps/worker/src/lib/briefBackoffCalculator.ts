// apps/worker/src/lib/briefBackoffCalculator.ts
import { supabase } from './supabase';

export interface BackoffDecision {
	shouldSend: boolean;
	isReengagement: boolean;
	/** Days since the last app visit. Re-engagement copy quotes it, so it stays literal. */
	daysSinceLastLogin: number;
	/**
	 * Days since the person last showed up at all: the later of the last app visit and
	 * the last brief email they opened or clicked. The backoff stages run on this.
	 */
	daysSinceLastActivity?: number;
	engagementStage: 'standard' | 'reengagement' | 'dormant';
	reason: string;
}

/**
 * Reading the brief email counts as showing up (DJ, 2026-11-14). Before this, backoff
 * ran on `users.last_visit` alone, so someone who read the email every morning but never
 * opened the app was cut back on day 3.
 *
 * Opens and clicks come from `notification_deliveries`: the web app's tracking pixel
 * and click routes stamp `opened_at` (first open, or first click when images are
 * blocked) and `clicked_at` (first click) on the brief email's delivery row. A new
 * brief email goes out each day, so the latest stamped delivery is the latest read.
 *
 * Fifteen days covers every stage that counts single days (through the day-14
 * re-engagement) and keeps the query small. An older open is ignored: past day 14 the
 * schedule only sends the rare dormant check-ins, so it could change at most whether
 * one of those goes out, and then toward sending.
 */
const BRIEF_EMAIL_ACTIVITY_LOOKBACK_DAYS = 15;
/** One brief email per person per day: 60 people x 15 days stays under the 1,000-row cap. */
const BRIEF_EMAIL_ACTIVITY_USERS_PER_QUERY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type ActivitySource = 'app_visit' | 'brief_email';

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
	 * BATCH METHOD: Pre-fetches engagement data for multiple users in 3 queries
	 * (last visits, latest briefs, brief email opens) instead of 3 per user.
	 * Returns a Map of userId -> BackoffDecision.
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

			// BATCH QUERY 3: Latest open or click of a brief email per user. Never
			// fails the batch: without it the decision runs on app visits alone.
			const lastBriefEmailActivityMap = await this.getLastBriefEmailActivity(userIds);

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

				const daysSinceLastBrief = lastBrief
					? this.calculateDaysSince(
							lastBrief.generation_completed_at || lastBrief.brief_date
						)
					: 999;

				results.set(
					userId,
					this.decideFromActivity(
						lastVisit,
						lastBriefEmailActivityMap.get(userId),
						daysSinceLastBrief
					)
				);
			}

			console.log(
				`[BackoffCalculator] Batch processed ${userIds.length} users with 3 batched queries`
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
		// Fetch user's last visit, last brief sent and last brief email read in parallel
		const [userData, lastBrief, lastBriefEmailActivityMap] = await Promise.all([
			this.getUserLastVisit(userId),
			this.getLastBriefSent(userId),
			this.getLastBriefEmailActivity([userId])
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

		const daysSinceLastBrief = lastBrief
			? this.calculateDaysSince(lastBrief.generation_completed_at || lastBrief.brief_date)
			: 999; // If no brief ever sent, treat as very old

		// Apply backoff logic
		return this.decideFromActivity(
			userData.last_visit,
			lastBriefEmailActivityMap.get(userId),
			daysSinceLastBrief
		);
	}

	/**
	 * The backoff decision for someone with a recorded app visit. Stages run on the
	 * later of that visit and the last brief email they opened or clicked;
	 * `daysSinceLastLogin` still reports the app visit.
	 */
	private decideFromActivity(
		lastVisit: string,
		lastBriefEmailActivity: string | null | undefined,
		daysSinceLastBrief: number
	): BackoffDecision {
		const daysSinceLastLogin = this.calculateDaysSince(lastVisit);
		// NaN when there is no (or an unreadable) email stamp, which compares false.
		const emailActivityMs = lastBriefEmailActivity
			? new Date(lastBriefEmailActivity).getTime()
			: Number.NaN;
		const emailIsLater = emailActivityMs > new Date(lastVisit).getTime();
		const daysSinceLastActivity = emailIsLater
			? Math.floor((Date.now() - emailActivityMs) / DAY_MS)
			: daysSinceLastLogin;

		return {
			...this.calculateBackoffDecision(
				daysSinceLastActivity,
				daysSinceLastBrief,
				emailIsLater ? 'brief_email' : 'app_visit'
			),
			daysSinceLastLogin,
			daysSinceLastActivity
		};
	}

	/**
	 * Latest open or click of a daily brief email per user, as an ISO timestamp.
	 * Batched: one query per BRIEF_EMAIL_ACTIVITY_USERS_PER_QUERY users (one query for
	 * today's user count), never one per user. Returns an empty map on any error, so
	 * a tracking outage only means the decision runs on app visits, as it used to.
	 */
	private async getLastBriefEmailActivity(userIds: string[]): Promise<Map<string, string>> {
		const latestByUser = new Map<string, string>();
		if (userIds.length === 0) return latestByUser;

		try {
			const cutoff = new Date(
				Date.now() - BRIEF_EMAIL_ACTIVITY_LOOKBACK_DAYS * DAY_MS
			).toISOString();
			const chunks: string[][] = [];
			for (let i = 0; i < userIds.length; i += BRIEF_EMAIL_ACTIVITY_USERS_PER_QUERY) {
				chunks.push(userIds.slice(i, i + BRIEF_EMAIL_ACTIVITY_USERS_PER_QUERY));
			}

			const responses = await Promise.all(
				chunks.map((ids) =>
					supabase
						.from('notification_deliveries')
						.select('recipient_user_id, opened_at, clicked_at')
						.in('recipient_user_id', ids)
						.eq('channel', 'email')
						.eq('payload->>event_type', 'brief.completed')
						// A click also stamps opened_at, so this one filter covers both.
						.gte('opened_at', cutoff)
				)
			);

			for (const { data, error } of responses) {
				if (error) throw new Error(error.message);
				for (const row of data ?? []) {
					for (const stamp of [row.opened_at, row.clicked_at]) {
						if (!stamp) continue;
						const current = latestByUser.get(row.recipient_user_id);
						if (!current || new Date(stamp).getTime() > new Date(current).getTime()) {
							latestByUser.set(row.recipient_user_id, stamp);
						}
					}
				}
			}
		} catch (error) {
			console.warn(
				'[BackoffCalculator] Could not load brief email opens; using app visits only:',
				error
			);
			return new Map();
		}

		return latestByUser;
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
			.eq('generation_status', 'completed')
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
		daysSinceLastBrief: number,
		activitySource: ActivitySource = 'app_visit'
	): BackoffDecision {
		// Days 0-2: Send normal briefs
		if (daysSinceLastLogin <= 2) {
			return {
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin,
				engagementStage: 'standard',
				reason:
					activitySource === 'brief_email'
						? 'User is active (opened a brief email within 2 days)'
						: 'User is active (logged in within 2 days)'
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
