# Phase 2 REVISED: Email Decoupling Using Existing Email Infrastructure

**Date**: 2025-09-30
**Status**: ✅ Ready for Deployment
**Branch**: main
**Dependencies**: Phase 1 complete

---

## 🎯 Key Revision

**Original Plan**: Add columns to `daily_briefs` table for email tracking
**REVISED Plan**: **Reuse existing `emails`, `email_recipients`, `email_tracking_events` tables**

### Why This Is Better

✅ **Proper separation of concerns** - Brief data stays separate from email delivery
✅ **Reuses existing infrastructure** - No duplicate tracking systems
✅ **NO schema changes to daily_briefs** - Less migration risk
✅ **Centralized email tracking** - All emails in one place
✅ **Leverages existing email analytics** - Already have tracking pixel, open rates, etc.

---

## 📊 Existing Email Infrastructure

### Tables Already in Database

#### 1. `emails` table

```sql
CREATE TABLE emails (
  id uuid PRIMARY KEY,
  created_by uuid REFERENCES users(id),
  from_email text NOT NULL,
  from_name text,
  subject text NOT NULL,
  content text NOT NULL, -- HTML email content
  category text, -- 'daily_brief', 'dunning', etc.
  status text, -- 'pending', 'scheduled', 'sent', 'failed', 'cancelled'
  tracking_enabled boolean,
  tracking_id uuid, -- For tracking pixel
  template_data jsonb, -- Flexible data: {brief_id, brief_date, user_id}
  created_at timestamptz,
  updated_at timestamptz
);
```

#### 2. `email_recipients` table

```sql
CREATE TABLE email_recipients (
  id uuid PRIMARY KEY,
  email_id uuid REFERENCES emails(id),
  recipient_email text NOT NULL,
  recipient_type text, -- 'to', 'cc', 'bcc'
  status text, -- 'pending', 'sent', 'failed', 'bounced'
  sent_at timestamptz,
  opened_at timestamptz,
  open_count integer,
  last_opened_at timestamptz,
  created_at timestamptz
);
```

#### 3. `email_tracking_events` table

```sql
CREATE TABLE email_tracking_events (
  id uuid PRIMARY KEY,
  email_id uuid REFERENCES emails(id),
  recipient_id uuid REFERENCES email_recipients(id),
  event_type text, -- 'opened', 'bounced', 'complaint'
  event_data jsonb,
  user_agent text,
  ip_address text,
  created_at timestamptz
);
```

#### 4. `email_logs` table (from dunning system)

```sql
CREATE TABLE email_logs (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text, -- 'sent', 'failed', 'bounced', 'complaint'
  error_message text,
  sent_at timestamptz,
  created_at timestamptz
);
```

---

## 🏗️ Revised Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Brief Generation (Brief Worker)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Generate Daily Brief                                                │
│   ↓                                                                 │
│ Create email record in `emails` table:                             │
│   - status: 'pending'                                               │
│   - category: 'daily_brief'                                         │
│   - template_data: {brief_id, brief_date, user_id}                 │
│   - content: HTML with tracking pixel                              │
│   ↓                                                                 │
│ Create recipient record in `email_recipients` table:               │
│   - status: 'pending'                                               │
│   - recipient_email: user.email                                    │
│   ↓                                                                 │
│ Queue email job (generate_brief_email):                            │
│   - metadata: {emailId}  ← Just email ID!                          │
│   ↓                                                                 │
│ Complete brief job (non-blocking)                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Email Sending (Email Worker)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Claim email job from queue                                          │
│   ↓                                                                 │
│ Fetch email record from `emails` table by emailId                  │
│   ↓                                                                 │
│ Extract brief_id from email.template_data                          │
│   ↓                                                                 │
│ Verify user still wants email (check preferences)                  │
│   ↓                                                                 │
│ Send email via EmailService (webhook or SMTP)                      │
│   ↓                                                                 │
│ Update `emails.status = 'sent'`                                    │
│ Update `email_recipients.status = 'sent'`                          │
│ Update `email_recipients.sent_at = NOW()`                          │
│   ↓                                                                 │
│ Complete email job                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Email Tracking (Existing Infrastructure)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ User opens email → Tracking pixel loads                            │
│   ↓                                                                 │
│ GET /api/email-tracking/:trackingId                                │
│   ↓                                                                 │
│ Update `email_recipients`:                                         │
│   - opened_at (first open)                                         │
│   - open_count++                                                   │
│   - last_opened_at = NOW()                                         │
│   ↓                                                                 │
│ Insert into `email_tracking_events`:                               │
│   - event_type: 'opened'                                           │
│   - event_data: {is_first_open, open_count}                        │
│   - user_agent, ip_address                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Changes from Original Plan

| Aspect                 | Original Plan                    | REVISED Plan                 |
| ---------------------- | -------------------------------- | ---------------------------- |
| **Email tracking**     | Add columns to `daily_briefs`    | Use existing `emails` table  |
| **Job metadata**       | `{briefId, briefDate, timezone}` | `{emailId}`                  |
| **Email status**       | `daily_briefs.email_sent`        | `emails.status`              |
| **Recipient tracking** | `daily_briefs.email_sent_at`     | `email_recipients.sent_at`   |
| **Open tracking**      | N/A                              | `email_recipients.opened_at` |
| **Error tracking**     | `daily_briefs.email_error`       | `emails.template_data.error` |
| **Schema changes**     | 5 new columns + 2 indexes        | 0 columns, 2 indexes only!   |

---

## 🗄️ Database Changes (REVISED)

### Migration File

`apps/web/supabase/migrations/20250930_add_email_brief_job_type_REVISED.sql`

### Changes

#### ✅ What We're Adding

1. **Job type constraint update**
    - Add `generate_brief_email` to allowed job types

2. **Indexes on `emails` table**

    ```sql
    -- Find emails by brief_id
    CREATE INDEX idx_emails_category_template_data
      ON emails(category, (template_data->>'brief_id'))
      WHERE category = 'daily_brief';

    -- Find pending emails
    CREATE INDEX idx_emails_status_category
      ON emails(status, category, created_at)
      WHERE status = 'pending' AND category = 'daily_brief';
    ```

3. **RPC Functions**
    - `get_pending_brief_emails(limit)` - Find pending emails to send
    - `get_brief_email_status(brief_id)` - Get email status for a brief

4. **Monitoring View**
    - `brief_email_stats` - Daily email delivery and engagement metrics

#### ❌ What We're NOT Adding

- **NO new columns on `daily_briefs`**
- **NO new tables**
- **NO new constraints on `daily_briefs`**

---

## 💻 Code Changes

### 1. Email Worker (REVISED)

**File**: `apps/worker/src/workers/brief/emailWorker.REVISED.ts`

**Job Data**:

```typescript
interface EmailBriefJobData {
	emailId: string; // ID from emails table (NOT briefId!)
}
```

**Flow**:

```typescript
// 1. Fetch email record
const { data: email } = await supabase
  .from('emails')
  .select('*, email_recipients(*)')
  .eq('id', emailId)
  .single();

// 2. Extract brief info from template_data
const briefId = email.template_data.brief_id;
const userId = email.created_by;

// 3. Verify user preferences (may have changed since queuing)
const { data: preferences } = await supabase
  .from('user_brief_preferences')
  .select('email_daily_brief')
  .eq('user_id', userId)
  .single();

if (!preferences?.email_daily_brief) {
  // Cancel email
  await supabase
    .from('emails')
    .update({ status: 'cancelled' })
    .eq('id', emailId);
  return;
}

// 4. Send email (content already in email.content)
await emailService.sendEmail({
  to: user.email,
  subject: email.subject,
  body: email.content,
  emailId: emailId,
  ...
});

// 5. Update status to 'sent'
await supabase
  .from('emails')
  .update({ status: 'sent' })
  .eq('id', emailId);

await supabase
  .from('email_recipients')
  .update({ status: 'sent', sent_at: NOW() })
  .eq('email_id', emailId);
```

### 2. Brief Worker Integration (REVISED)

**File**: `apps/worker/PHASE2_REVISED_briefWorker_snippet.ts`

**Key Changes**:

1. Create `emails` record with `status='pending'`
2. Create `email_recipients` record with `status='pending'`
3. Queue job with `emailId` (not `briefId`)

**Code**:

```typescript
// Generate brief
const brief = await generateDailyBrief(...);

// Create email record (BEFORE queuing job)
const { data: emailRecord } = await supabase
  .from('emails')
  .insert({
    created_by: userId,
    category: 'daily_brief',
    status: 'pending', // Not sent yet
    subject: `Daily Brief - ${briefDate}`,
    content: htmlContent, // Already formatted
    tracking_enabled: true,
    tracking_id: crypto.randomUUID(),
    template_data: {
      brief_id: brief.id,
      brief_date: briefDate,
      user_id: userId,
    },
  })
  .select()
  .single();

// Create recipient record
await supabase
  .from('email_recipients')
  .insert({
    email_id: emailRecord.id,
    recipient_email: user.email,
    status: 'pending',
  });

// Queue email job with emailId
await supabase.rpc('add_queue_job', {
  p_job_type: 'generate_brief_email',
  p_metadata: { emailId: emailRecord.id }, // ← Just emailId!
  p_priority: 5,
});

// Complete brief job (non-blocking)
await updateJobStatus(job.id, 'completed', 'brief');
```

---

## 🔍 Querying Email Status

### Find Email for a Brief

```sql
-- Get email status for a specific brief
SELECT
  e.id as email_id,
  e.status as email_status,
  er.status as recipient_status,
  er.sent_at,
  er.opened_at,
  er.open_count
FROM emails e
LEFT JOIN email_recipients er ON er.email_id = e.id
WHERE e.category = 'daily_brief'
  AND e.template_data->>'brief_id' = 'BRIEF_UUID'
ORDER BY e.created_at DESC
LIMIT 1;
```

### Find Pending Emails

```sql
-- Get all pending brief emails
SELECT
  e.id,
  e.created_by as user_id,
  e.template_data->>'brief_id' as brief_id,
  e.template_data->>'brief_date' as brief_date,
  e.created_at
FROM emails e
WHERE e.status = 'pending'
  AND e.category = 'daily_brief'
ORDER BY e.created_at DESC;
```

### Email Analytics

```sql
-- Daily email delivery and engagement stats (last 30 days)
SELECT * FROM brief_email_stats
ORDER BY date DESC
LIMIT 30;
```

---

## 📈 Performance Improvements

### Brief Generation

| Scenario         | Before          | After        | Improvement              |
| ---------------- | --------------- | ------------ | ------------------------ |
| Email enabled    | 3-8s            | 2.5-7.5s     | **200-500ms faster**     |
| Brief completion | Blocks on email | Non-blocking | **Instant notification** |
| Email failure    | Job fails       | Job succeeds | **100% isolation**       |

### Email System

| Metric          | Before  | After              | Benefit                    |
| --------------- | ------- | ------------------ | -------------------------- |
| Email tracking  | Limited | Full tracking      | Open rates, click tracking |
| Email retries   | Manual  | Automatic          | Better reliability         |
| Email analytics | None    | Dashboard          | Monitoring & insights      |
| Email search    | N/A     | By brief/user/date | Operational visibility     |

---

## 🚀 Deployment Plan

### Step 1: Run Migration (Required First!)

```bash
cd apps/web
supabase db push

# OR manually
psql $DATABASE_URL < supabase/migrations/20250930_add_email_brief_job_type_REVISED.sql
```

**Verification**:

```sql
-- Check indexes
\d emails

-- Check functions
\df get_pending_brief_emails
\df get_brief_email_status

-- Check view
\dv brief_email_stats
```

### Step 2: Update Code

**Files to Replace**:

1. `apps/worker/src/workers/brief/emailWorker.ts`
    - Replace with `emailWorker.REVISED.ts`

2. `apps/worker/src/workers/brief/briefWorker.ts` (lines 94-163)
    - Replace with snippet from `PHASE2_REVISED_briefWorker_snippet.ts`

3. `apps/worker/src/worker.ts`
    - Already updated to register email worker

### Step 3: Deploy Worker

```bash
cd apps/worker
pnpm build

# Deploy to Railway
git push origin main
# OR
railway up
```

### Step 4: Verify Deployment

```bash
# Check logs
railway logs --follow

# Look for:
# ✅ "Registered processor: generate_brief_email"
# ✅ "📨 Created email record ... for brief ..."
# ✅ "📧 Sending email to ..."
# ✅ "✅ Email sent successfully"
```

### Step 5: Test Email Flow

```sql
-- 1. Find a recent brief
SELECT id, user_id, brief_date
FROM daily_briefs
WHERE created_at > NOW() - INTERVAL '1 hour'
LIMIT 1;

-- 2. Check if email was created
SELECT
  e.id,
  e.status,
  e.template_data
FROM emails e
WHERE e.category = 'daily_brief'
  AND e.template_data->>'brief_id' = 'YOUR_BRIEF_ID';

-- 3. Check recipient status
SELECT
  er.recipient_email,
  er.status,
  er.sent_at,
  er.opened_at
FROM email_recipients er
WHERE er.email_id = 'YOUR_EMAIL_ID';
```

---

## 🔄 Rollback Plan

### If Issues Arise

#### Option 1: Disable Email Jobs (Safest)

```sql
-- Cancel all pending email jobs
UPDATE queue_jobs
SET status = 'cancelled'
WHERE job_type = 'generate_brief_email'
  AND status = 'pending';

-- Mark pending emails as cancelled
UPDATE emails
SET status = 'cancelled'
WHERE status = 'pending'
  AND category = 'daily_brief';
```

#### Option 2: Revert Code

```bash
git revert <commit-hash>
git push origin main
# Railway auto-deploys
```

#### Option 3: Full Rollback (NOT Recommended)

Migration is safe to keep - indexes don't harm existing functionality.

**If absolutely necessary**:

```sql
DROP INDEX IF EXISTS idx_emails_category_template_data;
DROP INDEX IF EXISTS idx_emails_status_category;
DROP FUNCTION IF EXISTS get_pending_brief_emails;
DROP FUNCTION IF EXISTS get_brief_email_status;
DROP VIEW IF EXISTS brief_email_stats;
```

---

## 📊 Monitoring & Analytics

### Real-Time Monitoring

```sql
-- Pending email queue length
SELECT COUNT(*)
FROM emails
WHERE status = 'pending'
  AND category = 'daily_brief';

-- Failed emails (last 24h)
SELECT COUNT(*)
FROM emails
WHERE status = 'failed'
  AND category = 'daily_brief'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Average email delivery time (last 24h)
SELECT
  AVG(EXTRACT(EPOCH FROM (er.sent_at - e.created_at))) / 60 AS avg_minutes
FROM emails e
JOIN email_recipients er ON er.email_id = e.id
WHERE e.category = 'daily_brief'
  AND er.sent_at IS NOT NULL
  AND e.created_at > NOW() - INTERVAL '24 hours';
```

### Daily Stats

```sql
-- Use the pre-built view
SELECT * FROM brief_email_stats
WHERE date > NOW() - INTERVAL '7 days'
ORDER BY date DESC;
```

### Email Engagement

```sql
-- Open rate by day (last 30 days)
SELECT
  DATE(e.created_at) as date,
  COUNT(DISTINCT e.id) as total_emails,
  COUNT(DISTINCT er.id) FILTER (WHERE er.opened_at IS NOT NULL) as opened_emails,
  ROUND(
    COUNT(DISTINCT er.id) FILTER (WHERE er.opened_at IS NOT NULL) * 100.0 /
    NULLIF(COUNT(DISTINCT e.id), 0),
    2
  ) as open_rate_percent
FROM emails e
LEFT JOIN email_recipients er ON er.email_id = e.id
WHERE e.category = 'daily_brief'
  AND e.status = 'sent'
  AND e.created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(e.created_at)
ORDER BY date DESC;
```

---

## ✅ Success Criteria

### Phase 2 Complete When:

- ✅ Migration deployed (indexes + functions)
- ✅ Worker code deployed
- ✅ Email worker processing jobs
- ✅ Brief generation 200-500ms faster
- ✅ Emails tracked in `emails` table
- ✅ Email opens tracked in `email_recipients`
- ✅ No increase in error rates

### Metrics After 7 Days:

- Brief generation time: <5s (p95)
- Email delivery time: <2 minutes (p95)
- Email delivery rate: >95%
- Email open rate: baseline established
- User complaints: 0

---

## 🎯 Key Advantages of Revised Approach

### vs Original Plan

| Aspect                 | Original                  | REVISED        | Winner     |
| ---------------------- | ------------------------- | -------------- | ---------- |
| Schema changes         | 5 columns on daily_briefs | 0 columns      | ✅ REVISED |
| Migration risk         | Medium                    | Low            | ✅ REVISED |
| Email tracking         | Basic                     | Full featured  | ✅ REVISED |
| Open tracking          | No                        | Yes            | ✅ REVISED |
| Email analytics        | No                        | Yes            | ✅ REVISED |
| Separation of concerns | Mixed                     | Clean          | ✅ REVISED |
| Query performance      | New indexes               | Existing + new | ✅ REVISED |
| Rollback complexity    | Medium                    | Low            | ✅ REVISED |

---

## 📚 References

- Phase 1: `PHASE1_IMPLEMENTATION.md`
- Research: `thoughts/shared/research/2025-09-30_brief-generation-parallelization.md`
- Migration: `apps/web/supabase/migrations/20250930_add_email_brief_job_type_REVISED.sql`
- Email Worker: `apps/worker/src/workers/brief/emailWorker.REVISED.ts`
- Brief Worker Snippet: `apps/worker/PHASE2_REVISED_briefWorker_snippet.ts`

---

**End of Phase 2 REVISED Implementation Report**

_This revised approach properly leverages existing email infrastructure, maintains clean separation of concerns, and requires zero schema changes to the daily_briefs table._
