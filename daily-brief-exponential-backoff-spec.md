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

### 1. Database Schema Changes (Minimal)

#### New Table: `user_engagement_tracking`
```sql
CREATE TABLE user_engagement_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  last_brief_email_sent_at TIMESTAMPTZ,
  backoff_level INTEGER DEFAULT 0, -- 0=normal, 1=4days, 2=10days, 3=31days
  next_scheduled_email_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_engagement UNIQUE(user_id)
);

-- Add RLS policies
ALTER TABLE user_engagement_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage all engagement tracking"
  ON user_engagement_tracking FOR ALL
  USING (auth.role() = 'service_role');

-- Index for performance
CREATE INDEX idx_engagement_next_email ON user_engagement_tracking(next_scheduled_email_at);
CREATE INDEX idx_engagement_user_id ON user_engagement_tracking(user_id);
```

**Note**: We'll use existing fields wherever possible:
- `users.last_visit` for last login tracking (already exists)
- Dynamic calculation of days_since_last_login in the worker
- Email type passed as job metadata (not stored in database)

### 2. Core Services Implementation

#### A. Minimal EngagementTrackingService (`apps/worker/src/lib/engagementTracking.ts`)

```typescript
// Service stays in the worker to minimize API calls
export class EngagementTrackingService {
  private readonly BACKOFF_SCHEDULE = {
    COOLING_OFF_DAYS: 2,
    FIRST_REENGAGEMENT: 4,
    SECOND_REENGAGEMENT: 10,
    THIRD_REENGAGEMENT: 31,
    RECURRING_INTERVAL: 31
  };

  public async shouldSendDailyBrief(userId: string): Promise<{
    shouldSend: boolean;
    emailType: 'standard' | 'reengagement';
    daysSinceLastLogin: number;
  }> {
    // Fetch user's last_visit from existing users table
    const { data: user } = await supabase
      .from('users')
      .select('last_visit')
      .eq('id', userId)
      .single();

    if (!user?.last_visit) {
      return { shouldSend: true, emailType: 'standard', daysSinceLastLogin: 0 };
    }

    // Calculate days since last login dynamically
    const daysSinceLastLogin = Math.floor(
      (Date.now() - new Date(user.last_visit).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get or create engagement tracking record
    const { data: tracking } = await supabase
      .from('user_engagement_tracking')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Apply backoff logic
    const decision = this.calculateBackoffDecision(daysSinceLastLogin, tracking);

    // Update tracking if we're sending
    if (decision.shouldSend) {
      await this.updateEngagementTracking(userId, decision.backoffLevel);
    }

    return {
      shouldSend: decision.shouldSend,
      emailType: decision.isReengagement ? 'reengagement' : 'standard',
      daysSinceLastLogin
    };
  }

  private calculateBackoffDecision(daysSinceLastLogin: number, tracking: any): {
    shouldSend: boolean;
    isReengagement: boolean;
    backoffLevel: number;
  } {
    // Days 0-2: Send normal briefs
    if (daysSinceLastLogin <= 2) {
      return { shouldSend: true, isReengagement: false, backoffLevel: 0 };
    }

    // Days 2-4: Cooling off period (no emails)
    if (daysSinceLastLogin > 2 && daysSinceLastLogin < 4) {
      return { shouldSend: false, isReengagement: false, backoffLevel: 0 };
    }

    // Day 4: First re-engagement
    if (daysSinceLastLogin === 4) {
      return { shouldSend: true, isReengagement: true, backoffLevel: 1 };
    }

    // Days 4-10: First backoff
    if (daysSinceLastLogin > 4 && daysSinceLastLogin < 10) {
      return { shouldSend: false, isReengagement: false, backoffLevel: 1 };
    }

    // Day 10: Second re-engagement
    if (daysSinceLastLogin === 10) {
      return { shouldSend: true, isReengagement: true, backoffLevel: 2 };
    }

    // Days 10-31: Second backoff
    if (daysSinceLastLogin > 10 && daysSinceLastLogin < 31) {
      return { shouldSend: false, isReengagement: false, backoffLevel: 2 };
    }

    // Day 31+: Check if it's been 31 days since last email
    if (daysSinceLastLogin >= 31) {
      const daysSinceLastEmail = tracking?.last_brief_email_sent_at
        ? Math.floor((Date.now() - new Date(tracking.last_brief_email_sent_at).getTime()) / (1000 * 60 * 60 * 24))
        : 31;

      if (daysSinceLastEmail >= 31) {
        return { shouldSend: true, isReengagement: true, backoffLevel: 3 };
      }
    }

    return { shouldSend: false, isReengagement: false, backoffLevel: 3 };
  }

  private async updateEngagementTracking(userId: string, backoffLevel: number): Promise<void> {
    await supabase
      .from('user_engagement_tracking')
      .upsert({
        user_id: userId,
        backoff_level: backoffLevel,
        last_brief_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
  }

  public async resetEngagement(userId: string): Promise<void> {
    // Called when user becomes active again
    await supabase
      .from('user_engagement_tracking')
      .delete()
      .eq('user_id', userId);
  }
}
```

#### B. Enhanced ActivityLogger Integration

Update `apps/web/src/lib/utils/activityLogger.ts`:

```typescript
// Add to logActivity method
public async logActivity(
  type: ActivityType,
  userId: string | null,
  data?: any
): Promise<void> {
  // Existing logging logic...

  // NEW: Reset engagement tracking on activity
  if (userId && this.isEngagementActivity(type)) {
    // Simply delete the engagement tracking record to reset backoff
    await supabase
      .from('user_engagement_tracking')
      .delete()
      .eq('user_id', userId);
  }
}

private isEngagementActivity(type: ActivityType): boolean {
  const engagementActivities = [
    'login', 'project_created', 'task_created',
    'brain_dump_processed', 'task_completed'
  ];
  return engagementActivities.includes(type);
}
```

### 3. Worker Service Updates

#### A. Enhanced Scheduler (`apps/worker/src/scheduler.ts`)

```typescript
private async checkAndQueueBriefs(): Promise<void> {
  // Existing preference fetching...

  for (const pref of activePreferences) {
    // NEW: Check engagement state
    const engagementCheck = await this.checkUserEngagement(pref.user_id);

    if (!engagementCheck.shouldSend) {
      logger.info(`Skipping brief for user ${pref.user_id} due to backoff`);
      continue;
    }

    // Existing scheduling logic...

    // NEW: Pass email type to job metadata
    const jobData = {
      userId: pref.user_id,
      briefDate,
      emailType: engagementCheck.emailType,
      daysSinceLastLogin: engagementCheck.daysSinceLastLogin,
      // ... existing fields
    };
  }
}

private async checkUserEngagement(userId: string): Promise<EngagementCheck> {
  // Call EngagementTrackingService via API
  // Return decision with email type
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

Add engagement tracking visibility to the admin dashboard:

```svelte
<script>
  // Add to existing user data fetching
  async function fetchUsersWithEngagement() {
    const users = await fetchUsers();

    // Join with engagement tracking data
    const { data: engagementData } = await supabase
      .from('user_engagement_tracking')
      .select('*');

    return users.map(user => {
      const engagement = engagementData?.find(e => e.user_id === user.id);
      const daysSinceLastLogin = user.last_visit
        ? Math.floor((Date.now() - new Date(user.last_visit).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        ...user,
        daysSinceLastLogin,
        backoffLevel: engagement?.backoff_level || 0,
        lastBriefEmailSent: engagement?.last_brief_email_sent_at,
        engagementStatus: getEngagementStatus(daysSinceLastLogin)
      };
    });
  }

  function getEngagementStatus(days) {
    if (!days || days <= 2) return 'active';
    if (days <= 4) return 'cooling_off';
    if (days <= 10) return 'backoff_1';
    if (days <= 31) return 'backoff_2';
    return 'backoff_3';
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
      <th>Backoff Level</th>
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
        <td>{formatDate(user.lastBriefEmailSent)}</td>
        <td>
          {#if user.backoffLevel > 0}
            Level {user.backoffLevel}
          {:else}
            Normal
          {/if}
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
  .status-badge.active { background: #10b981; color: white; }
  .status-badge.cooling_off { background: #f59e0b; color: white; }
  .status-badge.backoff_1 { background: #ef4444; color: white; }
  .status-badge.backoff_2 { background: #dc2626; color: white; }
  .status-badge.backoff_3 { background: #991b1b; color: white; }
</style>
```

#### B. Admin Analytics Dashboard

Add engagement metrics RPC function:

```sql
CREATE OR REPLACE FUNCTION get_engagement_analytics()
RETURNS TABLE (
  total_users INTEGER,
  active_users INTEGER,
  cooling_off_users INTEGER,
  backoff_1_users INTEGER,
  backoff_2_users INTEGER,
  backoff_3_users INTEGER,
  emails_sent_today INTEGER,
  emails_sent_week INTEGER,
  avg_days_inactive DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH user_status AS (
    SELECT
      u.id,
      u.last_visit,
      EXTRACT(EPOCH FROM (NOW() - u.last_visit::timestamptz)) / 86400 as days_inactive,
      uet.backoff_level
    FROM users u
    LEFT JOIN user_engagement_tracking uet ON u.id = uet.user_id
  )
  SELECT
    COUNT(*)::INTEGER as total_users,
    COUNT(CASE WHEN days_inactive <= 2 THEN 1 END)::INTEGER as active_users,
    COUNT(CASE WHEN days_inactive > 2 AND days_inactive <= 4 THEN 1 END)::INTEGER as cooling_off_users,
    COUNT(CASE WHEN backoff_level = 1 THEN 1 END)::INTEGER as backoff_1_users,
    COUNT(CASE WHEN backoff_level = 2 THEN 1 END)::INTEGER as backoff_2_users,
    COUNT(CASE WHEN backoff_level >= 3 THEN 1 END)::INTEGER as backoff_3_users,
    (SELECT COUNT(*)::INTEGER FROM emails WHERE created_at >= NOW() - INTERVAL '1 day'),
    (SELECT COUNT(*)::INTEGER FROM emails WHERE created_at >= NOW() - INTERVAL '7 days'),
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

### Phase 1: Core Infrastructure (3-4 days)
1. Create minimal database migration for `user_engagement_tracking` table
2. Implement `EngagementTrackingService` in worker
3. Add backoff decision logic
4. Unit test the backoff calculations

### Phase 2: Worker Integration (3-4 days)
1. Update scheduler to check engagement before queueing briefs
2. Modify brief generator to support re-engagement mode
3. Add LLM prompts for re-engagement content
4. Test the complete flow in development

### Phase 3: Admin & Monitoring (2-3 days)
1. Update admin users page with engagement columns
2. Add engagement analytics RPC function
3. Test admin dashboard updates
4. Deploy with feature flag (disabled by default)

### Phase 4: Rollout (2-3 days)
1. Enable for internal team testing
2. Monitor metrics and adjust prompts if needed
3. Gradual rollout to beta users
4. Full rollout after validation

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
```sql
-- Migration file: add_engagement_tracking.sql
BEGIN;

-- Create minimal tracking table
CREATE TABLE user_engagement_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  last_brief_email_sent_at TIMESTAMPTZ,
  backoff_level INTEGER DEFAULT 0,
  next_scheduled_email_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_engagement UNIQUE(user_id)
);

-- Add RLS and indexes
ALTER TABLE user_engagement_tracking ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_engagement_user_id ON user_engagement_tracking(user_id);
CREATE INDEX idx_engagement_next_email ON user_engagement_tracking(next_scheduled_email_at);

-- Add RPC function for admin analytics
CREATE OR REPLACE FUNCTION get_engagement_analytics() ... (as defined above)

COMMIT;
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

### Database Optimization
- Minimal new table with only essential fields
- Indexes on `user_id` and `next_scheduled_email_at` for fast lookups
- Use existing `users.last_visit` field (no duplication)
- Calculate `days_since_last_login` dynamically (not stored)

### Efficiency
- Engagement checks only during scheduler runs (hourly)
- Lightweight tracking table (~4 fields per user)
- Reuse existing activity logging infrastructure
- No additional API calls during normal user activity

## Security Considerations

1. **Minimal Data Collection**: Only track last brief sent and backoff level
2. **Service Role Only**: Engagement table accessible only via service role
3. **No User Exposure**: No user-facing APIs for engagement data
4. **Admin Only**: Engagement metrics visible only in admin dashboard

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
- **One new database table** with 4 essential fields
- **Simple backoff logic** in the worker service (no web app changes)
- **LLM-generated re-engagement emails** (no static templates)
- **Admin-only visibility** (no user-facing features)
- **Leverages existing infrastructure** (users.last_visit, activity logging, email tracking)

### Key Simplifications
- ✅ Use existing `last_visit` field (no new user columns)
- ✅ Calculate days dynamically (not stored)
- ✅ Pass email type as job metadata (not stored in DB)
- ✅ LLM generates contextual emails (no template maintenance)
- ✅ Admin dashboard only (no user APIs)
- ✅ Simple feature flag toggle

### Implementation Effort
- **Total Development**: ~2 weeks
- **Database Changes**: 1 new table, 1 RPC function
- **Code Changes**: Primarily in worker service
- **Risk**: Low (feature flag protected, graceful fallback)

The design prioritizes simplicity, reusability of existing systems, and minimal database changes while achieving the core goal of reducing email fatigue for inactive users.