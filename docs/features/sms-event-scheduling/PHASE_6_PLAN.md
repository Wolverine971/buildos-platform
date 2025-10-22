# Phase 6: Testing & Monitoring - Implementation Plan

> **Status:** In Progress
> **Priority:** High (required for production rollout)
> **Estimated Time:** 1-2 weeks

---

## 🎯 Overview

Phase 6 completes the SMS Event Scheduling system by adding comprehensive testing, monitoring, and a safe production rollout strategy. This phase ensures the system is reliable, observable, and ready for real users.

### Goals

1. **Validate System Reliability** - Comprehensive integration tests
2. **Enable Observability** - Monitoring, metrics, and alerting
3. **Safe Rollout** - Gradual deployment with feedback loops
4. **Continuous Improvement** - A/B testing and optimization

---

## 📋 Phase 6 Breakdown

### Part 1: Integration Testing (Week 1, Days 1-3)

**Priority: CRITICAL** - Must complete before any production rollout

#### 6.1: Test Infrastructure Setup

**Location:** `apps/worker/tests/integration/sms-event-scheduling/`

**Setup Requirements:**

- Test database with isolated schema
- Mock Twilio client for SMS sends
- Test user accounts with various configurations
- Calendar event fixtures
- Time manipulation utilities

**Files to Create:**

```
apps/worker/tests/integration/sms-event-scheduling/
├── setup.ts                    # Test database setup, fixtures
├── helpers.ts                  # Test utilities, time travel
├── mocks.ts                    # Twilio mock, external service mocks
├── 01-scheduling.test.ts       # End-to-end scheduling flow
├── 02-calendar-sync.test.ts    # Calendar webhook → SMS updates
├── 03-validation.test.ts       # Pre-send validation tests
├── 04-delivery.test.ts         # Delivery tracking tests
└── 05-edge-cases.test.ts       # Timezone, quiet hours, limits
```

#### 6.2: Critical Path Tests

**Test: End-to-End Scheduling Flow**

```typescript
describe('SMS Event Scheduling - End to End', () => {
	it('schedules and sends SMS for calendar event', async () => {
		// 1. Create test user with SMS enabled
		// 2. Create calendar event for tomorrow 10 AM
		// 3. Trigger midnight scheduler
		// 4. Verify scheduled_sms_messages created
		// 5. Fast-forward to send time
		// 6. Verify SMS sent via mock Twilio
		// 7. Verify status updates
		// 8. Verify delivery tracking
	});
});
```

**Test: Calendar Event Changes**

```typescript
describe('Calendar Event Synchronization', () => {
	it('cancels SMS when event is deleted', async () => {
		// 1. Schedule SMS for event
		// 2. Delete event via webhook
		// 3. Verify SMS cancelled
		// 4. Verify job not sent
	});

	it('reschedules SMS when event time changes', async () => {
		// 1. Schedule SMS for 10 AM event (send at 9:45 AM)
		// 2. Reschedule event to 2 PM via webhook
		// 3. Verify SMS rescheduled to 1:45 PM
		// 4. Verify message content updated
	});

	it('regenerates message when event details change', async () => {
		// 1. Schedule SMS with event title "Meeting"
		// 2. Update event title to "Q4 Planning" via webhook
		// 3. Verify message regenerated with new title
	});
});
```

**Test: Pre-Send Validation**

```typescript
describe('Pre-Send Validation', () => {
	it('skips cancelled messages', async () => {
		// 1. Schedule SMS
		// 2. Cancel via API
		// 3. Fast-forward to send time
		// 4. Verify SMS not sent
	});

	it('reschedules during quiet hours', async () => {
		// 1. User quiet hours: 10 PM - 8 AM
		// 2. Schedule SMS for 11 PM
		// 3. Verify rescheduled to 8 AM
		// 4. Verify sent at 8 AM
	});

	it('enforces daily limits', async () => {
		// 1. User limit: 5 SMS/day
		// 2. Create 10 events
		// 3. Verify only 5 SMS scheduled
		// 4. Verify 6th+ cancelled with reason
	});
});
```

**Test: Timezone Edge Cases**

```typescript
describe('Timezone Handling', () => {
	it('handles user timezone correctly', async () => {
		// Test users in: PST, EST, UTC, Tokyo
		// Verify midnight runs at correct local time
		// Verify send times respect user timezone
	});

	it('handles DST transitions', async () => {
		// Test scheduling during DST change
		// Verify times adjust correctly
	});
});
```

#### 6.3: Failure Scenario Tests

**Test: Retry Logic**

```typescript
describe('Retry Logic', () => {
	it('retries failed sends with exponential backoff', async () => {
		// 1. Mock Twilio to fail first 2 attempts
		// 2. Trigger send
		// 3. Verify retry after 2 min, then 4 min
		// 4. Verify success on 3rd attempt
	});

	it('stops retrying after max attempts', async () => {
		// 1. Mock Twilio to always fail
		// 2. Verify 3 retry attempts
		// 3. Verify stops after max
		// 4. Verify status = 'failed' permanently
	});
});
```

### Part 2: Monitoring & Metrics (Week 1, Days 4-5)

**Priority: HIGH** - Required before production rollout

#### 6.4: Metrics Collection

**Create Metrics Service**

**Location:** `apps/worker/src/lib/services/smsMetrics.service.ts`

**Metrics to Track:**

```typescript
interface SMSMetrics {
	// Operational Metrics
	scheduled_count: number; // SMS scheduled per day
	sent_count: number; // SMS sent per day
	delivered_count: number; // SMS delivered per day
	failed_count: number; // SMS failed per day
	cancelled_count: number; // SMS cancelled per day

	// Performance Metrics
	avg_delivery_time_ms: number; // Time from send to delivery
	avg_generation_time_ms: number; // LLM generation time

	// Quality Metrics
	llm_success_rate: number; // LLM vs template ratio
	delivery_success_rate: number; // Delivered / Sent

	// Cost Metrics
	llm_cost_per_user: number; // Daily LLM cost per user
	total_daily_llm_cost: number; // Total LLM spend

	// User Engagement
	opt_out_rate: number; // Users who opt out
	quiet_hours_reschedule_rate: number;
	daily_limit_hit_rate: number;
}
```

**Implementation:**

```typescript
export class SMSMetricsService {
	async recordScheduled(userId: string, count: number) {
		// Insert into metrics table
	}

	async recordSent(smsId: string, metadata: any) {
		// Record send with timing
	}

	async recordDelivery(smsId: string, deliveryTimeMs: number) {
		// Calculate delivery time
	}

	async getDailyMetrics(date: string): Promise<SMSMetrics> {
		// Aggregate metrics for dashboard
	}

	async getUserMetrics(userId: string, days: number): Promise<SMSMetrics> {
		// Per-user metrics for analysis
	}
}
```

#### 6.5: Metrics Storage

**Option 1: Supabase Table** (Recommended for MVP)

```sql
CREATE TABLE sms_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  metric_type TEXT NOT NULL, -- 'scheduled', 'sent', 'delivered', 'failed', etc.
  metric_value INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, user_id, metric_type)
);

-- Aggregate view for dashboards
CREATE MATERIALIZED VIEW sms_metrics_daily AS
SELECT
  date,
  COUNT(*) FILTER (WHERE metric_type = 'scheduled') as scheduled_count,
  COUNT(*) FILTER (WHERE metric_type = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE metric_type = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE metric_type = 'failed') as failed_count,
  AVG((metadata->>'delivery_time_ms')::int) FILTER (WHERE metric_type = 'delivered') as avg_delivery_time_ms
FROM sms_metrics
GROUP BY date;
```

**Option 2: Time-Series DB** (Future: Prometheus/Grafana)

#### 6.6: Alerting System

**Critical Alerts (Immediate Action Required)**

**Location:** `apps/worker/src/lib/services/smsAlerts.service.ts`

```typescript
export class SMSAlertsService {
	async checkAlerts() {
		const metrics = await this.metricsService.getDailyMetrics(today());

		// Critical: Delivery rate < 90%
		if (metrics.delivery_success_rate < 0.9) {
			await this.sendAlert({
				severity: 'critical',
				title: 'SMS Delivery Rate Below 90%',
				message: `Current: ${metrics.delivery_success_rate * 100}%`,
				channel: 'pagerduty' // or 'slack' for dev
			});
		}

		// Critical: LLM failures > 50%
		if (metrics.llm_success_rate < 0.5) {
			await this.sendAlert({
				severity: 'critical',
				title: 'LLM Generation Failing',
				message: `Success rate: ${metrics.llm_success_rate * 100}%`,
				channel: 'pagerduty'
			});
		}

		// Warning: LLM cost spike
		if (metrics.total_daily_llm_cost > metrics.avg_cost * 2) {
			await this.sendAlert({
				severity: 'warning',
				title: 'LLM Cost Spike Detected',
				message: `Today: $${metrics.total_daily_llm_cost}, Avg: $${metrics.avg_cost}`,
				channel: 'slack'
			});
		}

		// Warning: High opt-out rate
		if (metrics.opt_out_rate > 0.1) {
			await this.sendAlert({
				severity: 'warning',
				title: 'High SMS Opt-Out Rate',
				message: `${metrics.opt_out_rate * 100}% users opted out in last 24h`,
				channel: 'slack'
			});
		}
	}
}
```

**Alert Channels:**

- **PagerDuty** - Critical production issues
- **Slack** - Warnings and daily summaries
- **Email** - Daily digest reports

### Part 3: Production Rollout (Week 2)

**Priority: MEDIUM** - After tests and monitoring are in place

#### 6.7: Internal Testing (Days 1-3)

**Goal:** Validate with 5 internal users

**Checklist:**

- [ ] Select 5 team members with different timezones
- [ ] Enable SMS event reminders for test accounts
- [ ] Monitor for 3 days (minimum 6 events per user)
- [ ] Collect feedback on:
    - Message quality and helpfulness
    - Timing accuracy
    - Quiet hours respect
    - UI usability

**Success Criteria:**

- 95%+ delivery rate
- 0 critical bugs
- Positive feedback from all testers
- LLM success rate > 80%

#### 6.8: Beta Rollout (Days 4-7)

**Goal:** Expand to 50 friendly users

**Implementation:**

```sql
-- Feature flag in user_sms_preferences
ALTER TABLE user_sms_preferences
ADD COLUMN beta_tester BOOLEAN DEFAULT false;

-- Enable for beta users
UPDATE user_sms_preferences
SET beta_tester = true
WHERE user_id IN (SELECT id FROM beta_users_list);
```

**Monitoring:**

- Daily metrics dashboard
- Per-user opt-out tracking
- LLM vs template quality comparison
- Cost per user analysis

**Success Criteria:**

- 90%+ user satisfaction
- <5% opt-out rate
- No critical bugs
- LLM cost <$0.02 per user per day

#### 6.9: Gradual Production Rollout (Week 2+)

**Rollout Schedule:**

| Phase    | Users | Duration | Success Gate                   |
| -------- | ----- | -------- | ------------------------------ |
| Internal | 5     | 3 days   | 0 critical bugs                |
| Beta     | 50    | 1 week   | <5% opt-out, 90%+ satisfaction |
| 10%      | ~100  | 1 week   | 95%+ delivery, <10% opt-out    |
| 25%      | ~250  | 1 week   | Stable metrics                 |
| 50%      | ~500  | 1 week   | Cost under budget              |
| 100%     | All   | Ongoing  | Continuous monitoring          |

**Rollback Plan:**

- Disable feature flag instantly
- Cancel all pending SMS jobs
- Notify affected users
- Investigate root cause
- Fix and re-deploy

### Part 4: Optimization & Iteration (Week 2+)

#### 6.10: A/B Testing

**Test: LLM vs Template Quality**

```typescript
// Randomly assign 50% users to each group
const useTemplate = Math.random() < 0.5;

if (useTemplate) {
	message = generateTemplateMessage(event);
} else {
	message = await generateLLMMessage(event);
}

// Track user feedback and engagement
```

**Metrics to Compare:**

- User satisfaction ratings
- Opt-out rates per group
- Message open/click rates (if tracking)
- Cost difference

**Test: Lead Time Variations**

- Test 5, 10, 15, 30, 60 minute lead times
- Analyze which timing gets best engagement
- Personalize per user based on behavior

#### 6.11: Prompt Optimization

**Goal:** Improve LLM message quality based on data

**Process:**

1. Collect user feedback on messages
2. Analyze low-quality message patterns
3. Update prompts in `sms/prompts.ts`
4. A/B test new prompts vs old
5. Roll out winning variants

**Feedback Collection:**

```typescript
// Add to sms_messages table
ALTER TABLE sms_messages
ADD COLUMN user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
ADD COLUMN user_feedback TEXT;
```

---

## 🚀 Implementation Priority

### Week 1: Foundation

**Days 1-3: Testing** (CRITICAL)

1. Set up integration test infrastructure
2. Write critical path tests
3. Write edge case tests
4. Achieve 80%+ coverage on core flows

**Days 4-5: Monitoring** (HIGH)

1. Create metrics service
2. Set up metrics storage
3. Build basic dashboard
4. Implement critical alerts

### Week 2: Rollout

**Days 1-3: Internal Testing**

1. Enable for 5 team members
2. Monitor closely
3. Fix any bugs
4. Collect feedback

**Days 4-7: Beta Rollout**

1. Expand to 50 users
2. A/B test LLM quality
3. Optimize based on data
4. Prepare for gradual rollout

**Week 3+: Production**

1. 10% → 25% → 50% → 100%
2. Continuous monitoring
3. Weekly optimization cycles
4. Feature enhancements

---

## 📊 Success Metrics

### Testing Phase

- [ ] 80%+ integration test coverage
- [ ] All critical paths tested
- [ ] Zero failing tests in CI/CD
- [ ] Edge cases documented and tested

### Monitoring Phase

- [ ] Real-time metrics dashboard live
- [ ] Critical alerts configured
- [ ] Daily metrics reports automated
- [ ] Cost tracking operational

### Rollout Phase

- [ ] 95%+ delivery success rate
- [ ] <5% opt-out rate in first month
- [ ] LLM cost <$0.02 per user per day
- [ ] 90%+ user satisfaction score
- [ ] Zero critical production bugs

---

## 🛠️ Tools & Technologies

**Testing:**

- Vitest (existing test framework)
- Supabase test client
- Mock servers for Twilio
- Time manipulation utilities

**Monitoring:**

- Supabase tables/views (MVP)
- Future: Grafana + Prometheus
- Slack/PagerDuty integration

**Rollout:**

- Feature flags in database
- Gradual percentage rollout
- A/B testing framework

---

## 📝 Deliverables

1. **Test Suite**
    - Integration tests for all critical flows
    - Edge case and failure scenario tests
    - Test documentation and CI/CD integration

2. **Monitoring System**
    - Metrics collection service
    - Alerting for critical issues
    - Dashboard for operations team

3. **Rollout Documentation**
    - Rollout plan and schedule
    - Success criteria per phase
    - Rollback procedures

4. **Optimization Framework**
    - A/B testing infrastructure
    - Feedback collection
    - Continuous improvement process

---

## 🎯 Next Steps

**Immediate Actions:**

1. Create integration test infrastructure
2. Write first set of critical path tests
3. Set up basic metrics collection
4. Build simple monitoring dashboard

**This Week:**

- Complete integration test suite
- Deploy monitoring system
- Begin internal testing

**Next Week:**

- Beta rollout to 50 users
- A/B testing LLM quality
- Gradual production rollout begins
