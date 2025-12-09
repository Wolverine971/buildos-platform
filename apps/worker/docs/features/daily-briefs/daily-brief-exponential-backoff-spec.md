<!-- apps/worker/docs/features/daily-briefs/daily-brief-exponential-backoff-spec.md -->

# Daily Brief Exponential Backoff Implementation Spec

**Date**: 2025-09-29T18:42:25-04:00
**Author**: Claude
**Repository**: buildos-platform
**Git Commit**: be0cb6e0593341eeae5167dc7688089e70871827
**Branch**: main

## Executive Summary

This specification outlines a minimal implementation of an exponential backoff system for daily brief emails based on user engagement. The system will automatically adjust email frequency when users haven't logged in, send AI-generated re-engagement messages with contextual content, and reset to normal cadence upon user return.

## Business Requirements

### Core Objectives

1. **Reduce email fatigue** for inactive users while maintaining engagement
2. **Implement smart re-engagement** campaigns with AI-generated contextual messaging
3. **Automatically reset** to daily briefs when users become active again
4. **Preserve user preferences** while adding engagement-based intelligence

### Backoff Schedule

- **Day 0-2**: Normal daily briefs (existing behavior)
- **Day 2-4**: Skip daily brief (cooling off period)
- **Day 4**: Re-engagement email #1 ("Haven't seen you since...")
- **Day 4-10**: No emails (first backoff)
- **Day 10**: Re-engagement email #2 (stronger call-to-action)
- **Day 10-31**: No emails (second backoff)
- **Day 31+**: Re-engagement email every 31 days

### Reset Conditions

- User logs into BuildOS (updates existing `last_visit` field)
- User interacts with email links (tracked via existing email_tracking_events)
- User completes any tracked activity (via ActivityLogger)

## Technical Architecture

### 1. Database Schema Changes

**NO NEW TABLES REQUIRED!** We'll use existing tables:

- **`users.last_visit`**: Already tracks when user last logged in
- **`daily_briefs` table**: Already tracks when briefs are generated
    - `brief_date`: The date of the brief
    - `generation_completed_at`: When the brief was generated/sent
- **`emails` table**: Already tracks all sent emails if we need more granular tracking

All backoff logic will be calculated dynamically in the worker - no state storage needed.

### 2. Core Services Implementation

#### A. Dynamic Backoff Calculator (`apps/worker/src/lib/briefBackoffCalculator.ts`)

```typescript
// Pure function approach - no database state needed!
export class BriefBackoffCalculator {
	private readonly BACKOFF_SCHEDULE = {
		COOLING_OFF_DAYS: 2,
		FIRST_REENGAGEMENT: 4,
		SECOND_REENGAGEMENT: 10,
		THIRD_REENGAGEMENT: 31,
		RECURRING_INTERVAL: 31
	};

	public async shouldSendDailyBrief(userId: string): Promise<{
		shouldSend: boolean;
		isReengagement: boolean;
		daysSinceLastLogin: number;
		reason: string; // For logging/debugging
	}> {
		// Fetch user's last visit and last brief sent
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

	private async getUserLastVisit(userId: string): Promise<{ last_visit: string } | null> {
		const { data } = await supabase
			.from('users')
			.select('last_visit')
			.eq('id', userId)
			.single();
		return data;
	}

	private async getLastBriefSent(userId: string): Promise<any> {
		// Get the most recent daily brief
		const { data } = await supabase
			.from('daily_briefs')
			.select('brief_date, generation_completed_at')
			.eq('user_id', userId)
			.order('brief_date', { ascending: false })
			.limit(1)
			.single();
		return data;
	}

	private calculateDaysSince(dateString: string): number {
		return Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
	}

	private calculateBackoffDecision(
		daysSinceLastLogin: number,
		daysSinceLastBrief: number
	): {
		shouldSend: boolean;
		isReengagement: boolean;
		daysSinceLastLogin: number;
		reason: string;
	} {
		// Days 0-2: Send normal briefs
		if (daysSinceLastLogin <= 2) {
			return {
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin,
				reason: 'User is active (logged in within 2 days)'
			};
		}

		// Days 2-4: Cooling off period (no emails)
		if (daysSinceLastLogin > 2 && daysSinceLastLogin < 4) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				reason: 'Cooling off period (3-4 days inactive)'
			};
		}

		// Day 4: First re-engagement (if we haven't sent recently)
		if (daysSinceLastLogin === 4 && daysSinceLastBrief >= 2) {
			return {
				shouldSend: true,
				isReengagement: true,
				daysSinceLastLogin,
				reason: '4-day re-engagement email'
			};
		}

		// Days 4-10: First backoff
		if (daysSinceLastLogin > 4 && daysSinceLastLogin < 10) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				reason: 'First backoff period (5-9 days)'
			};
		}

		// Day 10: Second re-engagement (if we haven't sent recently)
		if (daysSinceLastLogin === 10 && daysSinceLastBrief >= 6) {
			return {
				shouldSend: true,
				isReengagement: true,
				daysSinceLastLogin,
				reason: '10-day re-engagement email'
			};
		}

		// Days 10-31: Second backoff
		if (daysSinceLastLogin > 10 && daysSinceLastLogin < 31) {
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				reason: 'Second backoff period (11-30 days)'
			};
		}

		// Day 31+: Send every 31 days if we haven't sent recently
		if (daysSinceLastLogin >= 31) {
			// Only send if it's been at least 31 days since last brief
			if (daysSinceLastBrief >= 31) {
				return {
					shouldSend: true,
					isReengagement: true,
					daysSinceLastLogin,
					reason: `31+ day re-engagement (${daysSinceLastLogin} days inactive)`
				};
			}
			return {
				shouldSend: false,
				isReengagement: false,
				daysSinceLastLogin,
				reason: `Waiting for 31-day interval (last brief ${daysSinceLastBrief} days ago)`
			};
		}

		// Fallback (shouldn't reach here)
		return {
			shouldSend: false,
			isReengagement: false,
			daysSinceLastLogin,
			reason: 'Default: no email'
		};
	}
}
```

#### B. Activity-Based Reset

**No code changes needed!** The backoff automatically resets when:

1. **User logs in**: Updates `users.last_visit` field (existing behavior)
2. **User performs activities**: Also updates `last_visit` via existing middleware
3. **Next scheduler run**: Sees recent `last_visit` and sends normal briefs

The beauty of the dynamic approach is that user activity automatically resets the backoff without any explicit tracking or database updates.

### 3. Worker Service Updates

#### A. Enhanced Scheduler (`apps/worker/src/scheduler.ts`)

```typescript
private async checkAndQueueBriefs(): Promise<void> {
  // Existing preference fetching...

  for (const pref of activePreferences) {
    // NEW: Check backoff status
    const backoffDecision = await this.backoffCalculator.shouldSendDailyBrief(pref.user_id);

    if (!backoffDecision.shouldSend) {
      logger.info(`Skipping brief for user ${pref.user_id}: ${backoffDecision.reason}`);
      continue;
    }

    // Existing scheduling logic...

    // NEW: Pass engagement info to job metadata
    const jobData = {
      userId: pref.user_id,
      briefDate,
      isReengagement: backoffDecision.isReengagement,
      daysSinceLastLogin: backoffDecision.daysSinceLastLogin,
      // ... existing fields
    };

    logger.info(`Queueing ${backoffDecision.isReengagement ? 're-engagement' : 'standard'} brief for user ${pref.user_id}`);
  }
}

// Initialize in constructor
constructor() {
  this.backoffCalculator = new BriefBackoffCalculator();
  // ... existing initialization
}
```

#### B. Brief Generator Updates (`apps/worker/src/workers/brief/briefGenerator.ts`)

```typescript
public async generateBrief(
  userId: string,
  briefDate: Date,
  options?: {
    isReengagement?: boolean;
    daysSinceLastLogin?: number;
  }
): Promise<GeneratedBrief> {
  // Existing data fetching...

  // NEW: Use LLM to generate contextual re-engagement content
  if (options?.isReengagement && options?.daysSinceLastLogin) {
    return this.generateReengagementBrief(
      userData,
      options.daysSinceLastLogin
    );
  }

  // Existing standard brief generation...
}

private async generateReengagementBrief(
  userData: UserData,
  daysSinceLastLogin: number
): Promise<GeneratedBrief> {
  // Collect user context for LLM
  const context = {
    daysSinceLastLogin,
    lastLoginDate: userData.user.last_visit,
    pendingTasksCount: userData.tasks.filter(t => t.status !== 'completed').length,
    overdueTasksCount: userData.tasks.filter(t => t.is_overdue).length,
    activeProjectsCount: userData.projects.filter(p => p.status === 'active').length,
    topPriorityTasks: userData.tasks
      .filter(t => t.priority === 'high' && t.status !== 'completed')
      .slice(0, 3)
      .map(t => ({ title: t.title, project: t.project_name })),
    recentCompletions: userData.tasks
      .filter(t => t.status === 'completed' && t.completed_at)
      .slice(0, 3)
      .map(t => ({ title: t.title, completedAt: t.completed_at }))
  };

  // Generate re-engagement email with LLM
  const prompt = this.buildReengagementPrompt(context);
  const llmResponse = await this.smartLLMService.generateContent({
    systemPrompt: this.getReengagementSystemPrompt(daysSinceLastLogin),
    userPrompt: prompt,
    temperature: 0.7,
    maxTokens: 1500
  });

  return {
    ...userData,
    analysisMarkdown: llmResponse.content,
    emailSubject: this.generateReengagementSubject(daysSinceLastLogin),
    metadata: {
      isReengagement: true,
      daysSinceLastLogin,
      generatedAt: new Date().toISOString()
    }
  };
}

private getReengagementSystemPrompt(daysSinceLastLogin: number): string {
  const tone = daysSinceLastLogin <= 4
    ? "gentle and encouraging"
    : daysSinceLastLogin <= 10
    ? "motivating and action-oriented"
    : "warm but direct with a clear value proposition";

  return `You are a BuildOS productivity coach writing a re-engagement email to a user who hasn't logged in for ${daysSinceLastLogin} days.

Your tone should be ${tone}. Focus on:
1. Acknowledging their absence without guilt
2. Highlighting what's waiting for them (tasks, projects)
3. Providing motivation to return
4. Keeping the message concise and actionable

Format the response in Markdown with clear sections.
Do not use any placeholders - write the actual content.
Be specific about their pending work but encouraging about getting back on track.`;
}

private buildReengagementPrompt(context: any): string {
  return `Generate a re-engagement email for a user with the following context:

- Days since last login: ${context.daysSinceLastLogin}
- Last login: ${context.lastLoginDate}
- Pending tasks: ${context.pendingTasksCount} (${context.overdueTasksCount} overdue)
- Active projects: ${context.activeProjectsCount}
${context.topPriorityTasks.length > 0 ? `- Top priority tasks:\n${context.topPriorityTasks.map(t => `  - ${t.title} (${t.project})`).join('\n')}` : ''}
${context.recentCompletions.length > 0 ? `- Recent completions before leaving:\n${context.recentCompletions.map(t => `  - ${t.title}`).join('\n')}` : ''}

Create a personalized message that encourages them to return and continue their productivity journey.`;
}

private generateReengagementSubject(daysSinceLastLogin: number): string {
  if (daysSinceLastLogin <= 4) {
    return "Your BuildOS tasks are waiting for you";
  } else if (daysSinceLastLogin <= 10) {
    return "You've made progress - don't let it slip away";
  } else {
    return "We miss you at BuildOS - here's what's waiting";
  }
}
```

### 4. Admin Dashboard Updates

#### A. Enhanced Admin Users Page (`apps/web/src/routes/admin/users/+page.svelte`)

Add engagement visibility to the admin dashboard:

```svelte
<script>
	// Add to existing user data fetching
	async function fetchUsersWithEngagement() {
		const users = await fetchUsers();

		// Fetch last brief sent for each user
		const userIds = users.map((u) => u.id);
		const { data: briefsData } = await supabase
			.from('daily_briefs')
			.select('user_id, brief_date, generation_completed_at')
			.in('user_id', userIds)
			.order('brief_date', { ascending: false });

		// Group briefs by user (get most recent)
		const briefsByUser = {};
		briefsData?.forEach((brief) => {
			if (!briefsByUser[brief.user_id]) {
				briefsByUser[brief.user_id] = brief;
			}
		});

		return users.map((user) => {
			const lastBrief = briefsByUser[user.id];
			const daysSinceLastLogin = user.last_visit
				? Math.floor(
						(Date.now() - new Date(user.last_visit).getTime()) / (1000 * 60 * 60 * 24)
					)
				: null;

			const daysSinceLastBrief = lastBrief
				? Math.floor(
						(Date.now() -
							new Date(
								lastBrief.generation_completed_at || lastBrief.brief_date
							).getTime()) /
							(1000 * 60 * 60 * 24)
					)
				: null;

			return {
				...user,
				daysSinceLastLogin,
				daysSinceLastBrief,
				lastBriefDate: lastBrief?.brief_date,
				engagementStatus: getEngagementStatus(daysSinceLastLogin),
				nextBriefStatus: getNextBriefStatus(daysSinceLastLogin, daysSinceLastBrief)
			};
		});
	}

	function getEngagementStatus(days) {
		if (!days || days <= 2) return 'active';
		if (days <= 4) return 'cooling_off';
		if (days <= 10) return 'first_backoff';
		if (days <= 31) return 'second_backoff';
		return 'inactive_long_term';
	}

	function getNextBriefStatus(daysSinceLogin, daysSinceBrief) {
		if (!daysSinceLogin || daysSinceLogin <= 2) return 'Tomorrow (regular)';
		if (daysSinceLogin === 4 && daysSinceBrief >= 2) return 'Today (re-engagement)';
		if (daysSinceLogin === 10 && daysSinceBrief >= 6) return 'Today (re-engagement)';
		if (daysSinceLogin >= 31 && daysSinceBrief >= 31) return 'Today (monthly)';
		if (daysSinceLogin < 4) return 'Cooling off';
		if (daysSinceLogin < 10) return `Day ${10} (re-engagement)`;
		if (daysSinceLogin < 31) return `Day ${31} (re-engagement)`;
		return 'Every 31 days';
	}
</script>

<!-- Add columns to user table -->
<table>
	<thead>
		<tr>
			<th>User</th>
			<th>Last Login</th>
			<th>Days Inactive</th>
			<th>Engagement Status</th>
			<th>Last Brief Sent</th>
			<th>Next Brief Status</th>
		</tr>
	</thead>
	<tbody>
		{#each users as user}
			<tr>
				<td>{user.email}</td>
				<td>{formatDate(user.last_visit)}</td>
				<td>
					{#if user.daysSinceLastLogin !== null}
						<span class="badge" class:warning={user.daysSinceLastLogin > 7}>
							{user.daysSinceLastLogin} days
						</span>
					{/if}
				</td>
				<td>
					<span class="status-badge {user.engagementStatus}">
						{user.engagementStatus}
					</span>
				</td>
				<td>{formatDate(user.lastBriefDate)}</td>
				<td>
					<span class="next-brief-status">
						{user.nextBriefStatus}
					</span>
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.status-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.875rem;
	}
	.status-badge.active {
		background: #10b981;
		color: white;
	}
	.status-badge.cooling_off {
		background: #f59e0b;
		color: white;
	}
	.status-badge.first_backoff {
		background: #ef4444;
		color: white;
	}
	.status-badge.second_backoff {
		background: #dc2626;
		color: white;
	}
	.status-badge.inactive_long_term {
		background: #991b1b;
		color: white;
	}
</style>
```

#### B. Admin Analytics Dashboard

Add engagement metrics RPC function (optional, for analytics):

```sql
CREATE OR REPLACE FUNCTION get_engagement_analytics()
RETURNS TABLE (
  total_users INTEGER,
  active_users INTEGER,
  cooling_off_users INTEGER,
  inactive_4_10_days INTEGER,
  inactive_10_31_days INTEGER,
  inactive_31_plus_days INTEGER,
  briefs_sent_today INTEGER,
  briefs_sent_week INTEGER,
  avg_days_inactive DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH user_status AS (
    SELECT
      u.id,
      u.last_visit,
      CASE
        WHEN u.last_visit IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (NOW() - u.last_visit::timestamptz)) / 86400
      END as days_inactive
    FROM users u
  )
  SELECT
    COUNT(*)::INTEGER as total_users,
    COUNT(CASE WHEN days_inactive <= 2 THEN 1 END)::INTEGER as active_users,
    COUNT(CASE WHEN days_inactive > 2 AND days_inactive <= 4 THEN 1 END)::INTEGER as cooling_off_users,
    COUNT(CASE WHEN days_inactive > 4 AND days_inactive <= 10 THEN 1 END)::INTEGER as inactive_4_10_days,
    COUNT(CASE WHEN days_inactive > 10 AND days_inactive <= 31 THEN 1 END)::INTEGER as inactive_10_31_days,
    COUNT(CASE WHEN days_inactive > 31 THEN 1 END)::INTEGER as inactive_31_plus_days,
    (SELECT COUNT(*)::INTEGER FROM daily_briefs WHERE brief_date = CURRENT_DATE),
    (SELECT COUNT(*)::INTEGER FROM daily_briefs WHERE brief_date >= CURRENT_DATE - INTERVAL '7 days'),
    AVG(days_inactive)::DECIMAL(10,2)
  FROM user_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 5. Monitoring and Analytics

The system will track engagement metrics through the admin dashboard without exposing data to end users. Key metrics include:

- User distribution across engagement states
- Email send rates with backoff applied
- Re-engagement success rates (users who return after re-engagement emails)
- Average days inactive before return

All monitoring is internal-only through the admin interface at `/admin/users` with enhanced engagement tracking columns.

## Implementation Plan

### Phase 1: Core Logic (1-2 days)

1. Implement `BriefBackoffCalculator` class in worker
2. Write unit tests for backoff calculations
3. Test with mock data for all scenarios

### Phase 2: Worker Integration (2-3 days)

1. Update scheduler to use backoff calculator
2. Modify brief generator to support re-engagement mode
3. Add LLM prompts for contextual re-engagement
4. Test complete flow in development

### Phase 3: Admin Dashboard (1 day)

1. Update admin users page to show engagement metrics
2. Optionally add analytics RPC function
3. Test dashboard with real data

### Phase 4: Rollout (1-2 days)

1. Deploy with feature flag disabled
2. Enable for internal testing
3. Monitor and adjust LLM prompts
4. Gradual rollout after validation

## Testing Strategy

### Unit Tests

```typescript
// apps/worker/src/__tests__/engagementTracking.test.ts
describe('EngagementTrackingService', () => {
	test('should send normal briefs for active users (0-2 days)', () => {});
	test('should skip briefs during cooling off (2-4 days)', () => {});
	test('should send re-engagement on day 4, 10, and 31', () => {});
	test('should reset on user activity', () => {});
	test('should handle 31+ day recurring emails', () => {});
});
```

### Integration Tests

- Test scheduler with mock engagement data
- Test LLM prompt generation for re-engagement
- Test database updates and resets
- Test admin dashboard data accuracy

### Manual Testing Checklist

- [ ] Create test user with manipulated `last_visit` dates
- [ ] Verify emails sent/skipped on correct days
- [ ] Test reset when user logs in
- [ ] Verify admin dashboard shows correct status
- [ ] Test LLM generates appropriate content for each stage

## Migration Strategy

### Database Migration

**NO MIGRATION REQUIRED!** The implementation uses only existing tables:

- `users.last_visit` (already exists)
- `daily_briefs` table (already exists)

Optionally, add the analytics RPC function for the admin dashboard:

```sql
-- Optional: Add analytics function for admin dashboard
CREATE OR REPLACE FUNCTION get_engagement_analytics()
... (as defined above)
```

### Feature Flag

```typescript
// Simple environment variable toggle
const ENGAGEMENT_BACKOFF_ENABLED = process.env.ENGAGEMENT_BACKOFF_ENABLED === 'true';

// In scheduler.ts
if (ENGAGEMENT_BACKOFF_ENABLED) {
	const engagement = await engagementTracking.shouldSendDailyBrief(userId);
	if (!engagement.shouldSend) continue;
	// Pass engagement metadata to job
} else {
	// Existing logic
}
```

## Performance Considerations

### Zero Database Overhead

- **No new tables** - uses only existing data
- **No state tracking** - everything calculated on-demand
- **No cleanup needed** - no stale data to manage
- **No migrations** - works with current schema

### Efficiency

- Two simple queries per user during scheduling (last_visit + last_brief)
- Calculations done in memory (pure functions)
- Runs only during hourly scheduler checks
- No impact on normal user activity or API calls

## Security Considerations

1. **No New Data Collection**: Uses only existing user data (last_visit, daily_briefs)
2. **No State Storage**: No tracking data to secure or manage
3. **Read-Only Calculations**: Pure functions with no side effects
4. **Admin-Only Visibility**: Metrics shown only in admin dashboard

## Success Metrics

### Key Metrics (Tracked in Admin Dashboard)

- **Email Volume Reduction**: % decrease in daily brief emails sent
- **Re-engagement Success**: % of users who login after re-engagement email
- **Unsubscribe Rate Change**: Impact on opt-out rates
- **Cost Savings**: Reduced email sending and LLM generation costs

### Monitoring via Admin Analytics

- User distribution across backoff levels
- Average days inactive before return
- Email send patterns with backoff applied
- Re-engagement email performance

## Rollback Plan

1. Set `ENGAGEMENT_BACKOFF_ENABLED=false` (immediate effect)
2. System reverts to normal daily brief schedule
3. Engagement tracking table preserved for analysis
4. No user communication needed (internal feature)

## Future Enhancements

1. **Smart Timing**: Use activity patterns to optimize send times
2. **Refined Prompts**: A/B test different LLM prompts for better engagement
3. **Granular Control**: Per-user backoff customization in admin
4. **SMS Integration**: Apply same logic to SMS notifications
5. **Predictive Churn**: Flag users likely to disengage before they do

## Appendix: LLM-Generated Email Examples

The system uses AI to generate contextual re-engagement emails. Here are example prompts and expected outputs:

### 4-Day Re-engagement (Gentle)

**LLM System Prompt**: "You are a BuildOS productivity coach writing to a user who hasn't logged in for 4 days. Tone: gentle and encouraging."

**Expected Output Style**:

- Acknowledges short absence without guilt
- Highlights 2-3 specific pending tasks
- Soft encouragement to return when ready
- Links to dashboard

### 10-Day Re-engagement (Motivating)

**LLM System Prompt**: "You are a BuildOS productivity coach writing to a user who hasn't logged in for 10 days. Tone: motivating and action-oriented."

**Expected Output Style**:

- Acknowledges progress made before absence
- Creates urgency around pending work
- Clear action items to restart
- Stronger CTA to return

### 31-Day Re-engagement (Win-back)

**LLM System Prompt**: "You are a BuildOS productivity coach writing to a user who hasn't logged in for 31+ days. Tone: warm but direct with clear value proposition."

**Expected Output Style**:

- Comprehensive summary of all pending work
- No guilt, just clear picture of what's waiting
- Value proposition of using BuildOS
- Open invitation to return

The LLM dynamically generates content based on:

- Actual task counts and priorities
- Recent completion history
- Project status
- Time of year/holidays
- User's historical patterns

---

## Summary

This specification provides a **minimal, practical implementation** of exponential backoff for daily brief emails:

### What We're Building

- **ZERO new database tables** - pure calculation approach
- **Simple helper function** in the worker service
- **LLM-generated re-engagement emails** (no static templates)
- **Admin-only visibility** (no user-facing features)
- **100% existing infrastructure** (users.last_visit, daily_briefs table)

### Key Simplifications

- ✅ NO new tables or columns
- ✅ Everything calculated dynamically
- ✅ Automatic reset on user activity
- ✅ LLM generates contextual emails
- ✅ Admin dashboard only (no user APIs)
- ✅ Simple feature flag toggle

### Implementation Effort

- **Total Development**: ~1 week
- **Database Changes**: NONE (optional RPC function for analytics)
- **Code Changes**: One new calculator class + scheduler update
- **Risk**: Minimal (feature flag protected, zero schema changes)

The design prioritizes simplicity, reusability of existing systems, and minimal database changes while achieving the core goal of reducing email fatigue for inactive users.

---

## Implementation Progress

**Last Updated**: 2025-09-30T03:45:00-04:00
**Status**: Phase 1-2 Complete (Core Logic + Worker Integration)

### ✅ Phase 1: Core Logic (COMPLETED)

- **BriefBackoffCalculator Class** (`apps/worker/src/lib/briefBackoffCalculator.ts`)
    - ✅ Pure function calculator implemented
    - ✅ Dynamic backoff logic (0-2 days active, 3-day cooling, 4-day/10-day/31-day re-engagement)
    - ✅ Automatic reset on user activity (no explicit state tracking needed)
    - ✅ Comprehensive unit tests (20 tests passing) in `tests/briefBackoffCalculator.test.ts`
    - ✅ Uses existing database tables (`users.last_visit`, `daily_briefs`)

### ✅ Phase 2: Worker Integration (COMPLETED)

#### Scheduler Integration

- **Updated** `apps/worker/src/scheduler.ts`:
    - ✅ Integrated `BriefBackoffCalculator`
    - ✅ Feature flag support (`ENGAGEMENT_BACKOFF_ENABLED` env var, defaults to `false`)
    - ✅ Backoff check before scheduling briefs
    - ✅ Engagement metadata passed to job queue (isReengagement, daysSinceLastLogin)
    - ✅ Detailed logging for debugging and monitoring

#### Brief Generator Updates

- **Updated** `apps/worker/src/workers/brief/briefGenerator.ts`:
    - ✅ Detects re-engagement emails from job metadata
    - ✅ Generates contextual content using LLM for re-engagement
    - ✅ Calculates engagement statistics (pending/overdue tasks, top priorities, recent completions)
    - ✅ Stores engagement metadata in daily brief record
    - ✅ Custom subject lines for re-engagement emails

#### LLM Prompts

- **Created** `ReengagementBriefPrompt` in `apps/worker/src/workers/brief/prompts.ts`:
    - ✅ Dynamic system prompts based on inactivity level (4/10/31+ days)
    - ✅ Tone adjustment (gentle → motivating → direct with value proposition)
    - ✅ Subject line generation (context-aware)
    - ✅ User prompt builder with task/project context

#### Email Service

- **Updated** `apps/worker/src/lib/services/email-sender.ts`:
    - ✅ Reads custom subject line from brief metadata
    - ✅ Falls back to default subject for standard briefs
    - ✅ Supports both webhook and SMTP email delivery

#### Type Definitions

- **Updated** `apps/worker/src/workers/shared/queueUtils.ts`:
    - ✅ Extended `BriefJobData` interface with engagement metadata

### 🔄 Phase 3: Admin Dashboard (OPTIONAL)

**Status**: SQL migration provided, UI implementation deferred

**Completed**:

- ✅ Analytics RPC function SQL created (`apps/worker/migrations/engagement_analytics_rpc.sql`)
    - Can be run manually in Supabase SQL Editor
    - Provides aggregated engagement metrics
    - Includes total users, active/inactive breakdowns, brief counts

**Deferred** (not required for Phase 1-2 rollout):

- Admin users page engagement metrics UI
- Real-time engagement dashboard
- Per-user engagement status display

These UI components can be added later if monitoring shows they're needed.

### ⏳ Phase 4: Testing & Rollout (PENDING)

**Status**: Not started

**Next Steps**:

1. Set `ENGAGEMENT_BACKOFF_ENABLED=false` initially (feature flag)
2. Test with manipulated `last_visit` dates on test users
3. Verify re-engagement email generation and content quality
4. Monitor LLM prompt performance
5. Gradual rollout after validation

### Testing Summary

**Unit Tests**: ✅ 20/20 passing

- Active users (0-2 days): 3 tests
- Cooling off period: 1 test
- 4-day re-engagement: 2 tests
- First backoff (5-9 days): 2 tests
- 10-day re-engagement: 2 tests
- Second backoff (11-30 days): 2 tests
- 31+ day re-engagement: 3 tests
- Edge cases: 3 tests
- Automatic reset: 2 tests

**Integration Tests**: Pending

### Configuration

**Environment Variables**:

```bash
# Feature flag (default: false for safety)
ENGAGEMENT_BACKOFF_ENABLED=false

# Set to true to enable engagement-based backoff
ENGAGEMENT_BACKOFF_ENABLED=true
```

### Key Implementation Decisions

1. **Zero Database Changes**: Uses only existing `users.last_visit` and `daily_briefs` table
2. **Feature Flag Protection**: Disabled by default, easy rollback by setting env var
3. **Pure Function Design**: No state storage, all calculated dynamically
4. **Automatic Reset**: User activity updates `last_visit`, triggering normal briefs
5. **LLM-Generated Content**: Re-engagement emails are personalized using AI based on user context

### Files Modified/Created

**Created**:

- `apps/worker/src/lib/briefBackoffCalculator.ts` - Core backoff logic
- `apps/worker/tests/briefBackoffCalculator.test.ts` - Comprehensive unit tests (20 tests)
- `apps/worker/migrations/engagement_analytics_rpc.sql` - Optional analytics SQL function

**Modified**:

- `apps/worker/src/scheduler.ts` - Integrated backoff calculator with feature flag
- `apps/worker/src/workers/brief/briefGenerator.ts` - Re-engagement email generation
- `apps/worker/src/workers/brief/prompts.ts` - Added ReengagementBriefPrompt class
- `apps/worker/src/lib/services/email-sender.ts` - Custom subject line support
- `apps/worker/src/workers/shared/queueUtils.ts` - Extended BriefJobData interface
- `daily-brief-exponential-backoff-spec.md` - Updated with implementation progress

### Rollback Plan

To disable the feature:

```bash
export ENGAGEMENT_BACKOFF_ENABLED=false
```

Restart the worker service. System immediately reverts to normal daily brief schedule with no data cleanup needed.
