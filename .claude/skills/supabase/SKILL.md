---
name: supabase
description: Access and query the BuildOS Supabase database for debugging, data exploration, and admin operations. Use when you need to query database tables, investigate data issues, check user records, view LLM usage, inspect queue jobs, or perform admin database operations. Supports both read queries and write operations with proper safety checks.
---

# Supabase Database Access

Query and manage the BuildOS Supabase database directly.

## Quick Reference

**Environment Variables Required:**
- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PRIVATE_SUPABASE_SERVICE_KEY` - Service role key (bypasses RLS)

**Client Creation:**
```typescript
// For admin/debug operations (bypasses RLS)
import { createAdminSupabaseClient } from '$lib/supabase/admin';
const supabase = createAdminSupabaseClient();

// For user-context operations (respects RLS)
const supabase = locals.supabase; // In +server.ts routes
```

## Common Query Patterns

### Find User by Email
```typescript
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('email', 'user@example.com')
  .single();
```

### Get Recent Activity
```typescript
const { data: logs } = await supabase
  .from('user_activity_logs')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(50);
```

### Check LLM Usage
```typescript
const { data: usage } = await supabase
  .from('llm_usage_logs')
  .select('*')
  .eq('user_id', userId)
  .gte('created_at', '2026-01-01')
  .order('created_at', { ascending: false });
```

### View Queue Jobs
```typescript
const { data: jobs } = await supabase
  .from('queue_jobs')
  .select('*')
  .eq('status', 'pending')
  .order('scheduled_for', { ascending: true });
```

### Get User Projects with Tasks
```typescript
const { data: projects } = await supabase
  .from('projects')
  .select(`
    *,
    tasks (id, title, status, priority)
  `)
  .eq('user_id', userId);
```

## Database Schema

For complete table definitions, see: `references/schema.md`

### Key Table Groups

| Domain | Tables | Description |
|--------|--------|-------------|
| **Users** | `users`, `user_context`, `user_*_preferences` | User accounts and settings |
| **Projects** | `projects`, `tasks`, `phases`, `brain_dumps` | Core productivity entities |
| **Ontology** | `onto_*` | New entity system (projects, tasks, goals, etc.) |
| **Chat/AI** | `chat_sessions`, `chat_messages`, `llm_usage_logs` | AI interactions |
| **Notifications** | `notification_*`, `user_notifications` | Notification system |
| **Billing** | `customer_subscriptions`, `invoices`, `payment_methods` | Stripe integration |
| **Calendar** | `calendar_*`, `task_calendar_events`, `time_blocks` | Calendar sync |
| **SMS** | `sms_*`, `scheduled_sms_messages` | Twilio SMS integration |
| **Beta** | `beta_*` | Beta program management |
| **Admin** | `admin_*`, `error_logs`, `cron_logs` | Admin and monitoring |

## Safety Guidelines

### Read Operations (Safe)
- SELECT queries are always safe
- Use `.limit()` to avoid large result sets
- Use `.select('column1, column2')` to minimize data transfer

### Write Operations (Caution)
Before any INSERT, UPDATE, or DELETE:

1. **Verify the target**: Always confirm the correct table and conditions
2. **Use transactions** for multi-table operations
3. **Backup first**: For destructive operations, query existing data first
4. **Test conditions**: Run a SELECT with same WHERE clause first

```typescript
// Safe pattern: Check before delete
const { data: toDelete } = await supabase
  .from('table')
  .select('id, important_field')
  .eq('condition', value);

console.log('Will delete:', toDelete);
// Then proceed with delete after confirmation
```

### Admin Client Warning
The admin client (`createAdminSupabaseClient`) bypasses Row Level Security. Only use for:
- Debug/investigation operations
- Webhook handlers with verified signatures
- Background jobs
- Admin-only features

## Common Debugging Tasks

### Find User Issues
```typescript
// Get user with all preferences
const { data } = await supabase
  .from('users')
  .select(`
    *,
    user_context (*),
    user_notification_preferences (*),
    user_sms_preferences (*),
    user_calendar_preferences (*)
  `)
  .eq('email', 'user@example.com')
  .single();
```

### Check Subscription Status
```typescript
const { data } = await supabase
  .from('customer_subscriptions')
  .select('*, subscription_plans(*)')
  .eq('user_id', userId)
  .single();
```

### View Error Logs
```typescript
const { data: errors } = await supabase
  .from('error_logs')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(100);
```

### Check Queue Health
```typescript
const { data: stats } = await supabase
  .from('queue_jobs')
  .select('status, job_type')
  .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString());

// Group by status
const byStatus = stats?.reduce((acc, job) => {
  acc[job.status] = (acc[job.status] || 0) + 1;
  return acc;
}, {});
```

### Investigate Failed Jobs
```typescript
const { data: failed } = await supabase
  .from('queue_jobs')
  .select('*')
  .eq('status', 'failed')
  .order('updated_at', { ascending: false })
  .limit(20);
```

## Supabase Dashboard

For complex queries or schema exploration, use the Supabase Dashboard:
- URL: Check `PUBLIC_SUPABASE_URL` env var, replace `.supabase.co` with dashboard URL
- SQL Editor: Run raw SQL queries
- Table Editor: Browse and edit data visually
- Logs: View real-time database logs
