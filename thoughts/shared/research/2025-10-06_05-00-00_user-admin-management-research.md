---
title: "BuildOS User and Admin Management System Research"
date: 2025-10-06T05:00:00Z
author: Claude Code
tags: [research, users, admin, database, authentication, rls]
status: complete
context: "Comprehensive analysis of user and admin management for test bed feature implementation"
---

# BuildOS User and Admin Management System Research

## Executive Summary

BuildOS uses a dual-table approach for user management:
1. **`users` table** - Core user data with `is_admin` boolean flag
2. **`admin_users` table** - Admin audit trail tracking who granted admin access and when

Admin access is controlled through:
- Database-level RLS policies using `app_auth.is_admin()` function
- Application-level checks in API routes and server-side page loads
- The `admin_users` table for audit trail (but NOT the source of truth - `users.is_admin` is)

## Database Schema

### 1. Users Table (`users`)

**Key Fields:**
```typescript
{
  id: string;                    // UUID primary key (links to auth.users)
  email: string;                 // NOT NULL
  name: string | null;
  is_admin: boolean;             // NOT NULL, defaults to false
  is_beta_user: boolean | null;
  created_at: timestamp;
  updated_at: timestamp;
  last_visit: timestamp | null;

  // Onboarding
  completed_onboarding: boolean | null;
  onboarding_v2_completed_at: timestamp | null;
  onboarding_v2_skipped_calendar: boolean | null;
  onboarding_v2_skipped_sms: boolean | null;

  // Subscription
  stripe_customer_id: string | null;
  subscription_status: string | null;
  subscription_plan_id: uuid | null;
  trial_ends_at: timestamp | null;

  // Access control
  access_restricted: boolean | null;
  access_restricted_at: timestamp | null;

  // Other
  bio: string | null;
  usage_archetype: string | null;
  productivity_challenges: jsonb | null;
}
```

**File Location:** `/Users/annawayne/buildos-platform/packages/shared-types/src/database.schema.ts` (line 1191-1213)

**Current Admin Users:**
```
- DJ Wayne (djwayne35@gmail.com) - Primary admin
- David Wayne (dj@build-os.com) - Admin
- Zach (zach@hausofapex.com) - Admin
```

### 2. Admin Users Table (`admin_users`)

**Purpose:** Audit trail for admin access grants

**Schema:**
```typescript
{
  user_id: string;              // Primary key, foreign key to users.id
  granted_by: string | null;    // User ID who granted admin access
  granted_at: timestamp | null; // When admin access was granted
  created_at: timestamp;        // Record creation time
}
```

**File Location:** `/Users/annawayne/buildos-platform/packages/shared-types/src/database.schema.ts` (line 15-20)

**Important:** This table is for AUDIT ONLY. The `users.is_admin` field is the source of truth.

## Admin Access Control

### 1. Row Level Security (RLS) Policies

**Users Table Policies:**
```sql
-- Policy 1: Users can manage their own data
CREATE POLICY "Users can manage their own data"
  ON users FOR ALL
  USING (auth.uid() = id);

-- Policy 2: Admins can manage all users
CREATE POLICY "Admins can manage all users"
  ON users FOR ALL
  USING (app_auth.is_admin());
```

**Admin Users Table Policies:**
```sql
-- Only admins can view admin_users table
CREATE POLICY "Only admins can view admin_users"
  ON admin_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Only admins can grant admin access
CREATE POLICY "Only admins can grant admin access"
  ON admin_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- Only admins can delete admin access
CREATE POLICY "Admin Users Delete Policy"
  ON admin_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );
```

**Helper Function:**
```sql
-- Schema: app_auth
CREATE FUNCTION app_auth.is_admin() RETURNS boolean
```

This function is used in RLS policies to check if the current user is an admin.

### 2. Application-Level Admin Checks

**Admin Layout Protection:**

File: `/Users/annawayne/buildos-platform/apps/web/src/routes/admin/+layout.server.ts`

```typescript
export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();

  // Check if user is authenticated
  if (!user) {
    throw redirect(303, '/auth/login');
  }

  const { data: dbUser, error } = await supabase
    .from('users')
    .select('is_admin, email, name')
    .eq('id', user.id)
    .single();

  if (error || !dbUser?.is_admin) {
    throw redirect(303, '/');
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      is_admin: dbUser.is_admin
    }
  };
};
```

**API Route Protection:**

File: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/admin/users/+server.ts`

```typescript
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
  const { user } = await safeGetSession();

  if (!user) {
    return ApiResponse.unauthorized();
  }

  if (!user?.is_admin) {
    return ApiResponse.forbidden('Admin access required');
  }

  // ... proceed with admin operations
};
```

## User Management Endpoints

### Primary User Management API

**Endpoint:** `GET /api/admin/users`

**File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/admin/users/+server.ts`

**Capabilities:**
- List users with pagination
- Search by email or name
- Filter by admin status (`admin_filter`: 'admin' | 'regular')
- Filter by onboarding status (`onboarding_filter`: 'completed' | 'pending')
- Sort by various fields (default: `last_visit`)
- Enriched with user metrics:
  - Brain dump count
  - Daily brief count
  - Project count
  - Calendar connection status
  - Phase generation status

**Query Parameters:**
```typescript
{
  page?: number;           // Default: 1
  limit?: number;          // Default: 50
  search?: string;         // Searches email and name
  admin_filter?: 'admin' | 'regular';
  onboarding_filter?: 'completed' | 'pending';
  sort_by?: string;        // Default: 'last_visit'
  sort_order?: 'asc' | 'desc'; // Default: 'desc'
}
```

**Response Format:**
```typescript
{
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
    bio: string | null;
    completed_onboarding: boolean | null;
    last_visit: string | null;

    // Enriched metrics
    brain_dump_count: number;
    brief_count: number;
    project_count: number;
    calendar_connected: boolean;
    has_generated_phases: boolean;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Update User Endpoint

**Endpoint:** `PATCH /api/admin/users`

**Request Body:**
```typescript
{
  userId: string;
  updates: {
    name?: string;
    bio?: string;
    is_admin?: boolean;
    completed_onboarding?: boolean;
  }
}
```

**Security:**
- Whitelisted fields only (prevents privilege escalation)
- Updates `admin_users` table when `is_admin` is modified
- Tracks who granted admin access

**Implementation:**
```typescript
// Whitelist allowed fields
const ALLOWED_FIELDS = ['name', 'bio', 'is_admin', 'completed_onboarding'];
const sanitizedUpdates = Object.keys(updates)
  .filter((key) => ALLOWED_FIELDS.includes(key))
  .reduce((obj, key) => ({ ...obj, [key]: updates[key] }), {});

// Update admin_users table if is_admin was modified
if ('is_admin' in sanitizedUpdates) {
  if (sanitizedUpdates.is_admin) {
    await supabase.from('admin_users').insert({
      user_id: userId,
      granted_by: user.id
    });
  } else {
    await supabase.from('admin_users')
      .delete()
      .eq('user_id', userId);
  }
}
```

## Other Admin Endpoints

### User-Specific Endpoints

1. **User Context:** `GET /api/admin/users/[id]/context`
2. **User Activity:** `GET /api/admin/users/[userId]/activity`

### Analytics Endpoints

File: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/admin/analytics/`

- `GET /api/admin/analytics/overview` - System overview
- `GET /api/admin/analytics/comprehensive` - Detailed analytics
- `GET /api/admin/analytics/daily-users` - Daily active users
- `GET /api/admin/analytics/daily-signups` - New signups
- `GET /api/admin/analytics/brief-stats` - Daily brief statistics
- `GET /api/admin/analytics/export` - Export analytics data

### Beta Program Endpoints

File: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/admin/beta/`

- `GET /api/admin/beta/overview` - Beta program overview
- `GET /api/admin/beta/members` - Beta members list
- `GET /api/admin/beta/signups` - Beta signups
- `GET /api/admin/beta/feedback` - Beta feedback

### Error & System Management

- `GET /api/admin/errors` - Error logs
- `POST /api/admin/errors/[id]/resolve` - Resolve error
- `GET /api/admin/calendar-errors` - Calendar sync errors
- `GET /api/admin/feedback` - User feedback
- `GET /api/admin/llm-usage/stats` - LLM usage statistics

## Querying Users for Test Bed Feature

### Recommended Approach

For a test bed feature that needs to query users, use the existing admin users endpoint with appropriate filters:

```typescript
// Example: Get all users with their engagement metrics
const response = await fetch('/api/admin/users?limit=100&sort_by=created_at&sort_order=desc');
const { users, pagination } = await response.json();

// Users will include:
users.forEach(user => {
  console.log({
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin,
    metrics: {
      brainDumps: user.brain_dump_count,
      projects: user.project_count,
      briefs: user.brief_count,
      calendarConnected: user.calendar_connected,
      hasGeneratedPhases: user.has_generated_phases
    }
  });
});
```

### Direct Database Queries (Server-Side Only)

If you need custom queries on the server side:

```typescript
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const adminClient = createAdminSupabaseClient();

// Get users with specific criteria
const { data: users } = await adminClient
  .from('users')
  .select('id, email, name, is_admin, created_at, last_visit')
  .eq('is_admin', false)
  .order('last_visit', { ascending: false, nullsFirst: false });

// Join with other tables for enriched data
const { data: usersWithProjects } = await adminClient
  .from('users')
  .select(`
    id,
    email,
    name,
    is_admin,
    projects (
      id,
      name,
      status,
      created_at
    )
  `)
  .limit(50);
```

### Search and Filter Examples

```typescript
// Search by email or name
const { data } = await adminClient
  .from('users')
  .select('*')
  .or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`);

// Get active users (visited in last 30 days)
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const { data } = await adminClient
  .from('users')
  .select('*')
  .gte('last_visit', thirtyDaysAgo.toISOString());

// Get users who completed onboarding
const { data } = await adminClient
  .from('users')
  .select('*')
  .eq('completed_onboarding', true);
```

## Admin UI Components

### Admin Pages

File: `/Users/annawayne/buildos-platform/apps/web/src/routes/admin/`

1. **Users Page:** `/admin/users`
   - File: `users/+page.server.ts`
   - Lists and manages users
   - Search, filter, and sort capabilities

2. **Errors Page:** `/admin/errors`
   - File: `errors/+page.server.ts`
   - View and resolve system errors

### Admin Layout

All admin pages are protected by the layout at:
`/Users/annawayne/buildos-platform/apps/web/src/routes/admin/+layout.server.ts`

This ensures:
- User is authenticated
- User has `is_admin = true` in database
- Redirects non-admins to home page

## Security Considerations

### 1. Defense in Depth

BuildOS uses multiple layers of security:

1. **Database RLS Policies** - First line of defense
2. **API Route Guards** - Check `user.is_admin` before operations
3. **Server-Side Layout Checks** - Protect entire admin section
4. **Whitelisted Updates** - Only allowed fields can be modified

### 2. Admin Privilege Escalation Prevention

The user update endpoint uses a whitelist:

```typescript
const ALLOWED_FIELDS = ['name', 'bio', 'is_admin', 'completed_onboarding'];
```

This prevents attackers from:
- Modifying `stripe_customer_id`
- Changing `subscription_status`
- Altering `trial_ends_at`
- Updating other sensitive fields

### 3. Audit Trail

The `admin_users` table maintains:
- Who was granted admin access
- Who granted the access (`granted_by`)
- When it was granted (`granted_at`)

This is critical for:
- Security audits
- Compliance requirements
- Investigating unauthorized access

### 4. SQL Injection Prevention

Search queries sanitize input:

```typescript
const sanitizedSearch = search.replace(/[\\%_]/g, '\\$&');
query = query.or(`email.ilike.%${sanitizedSearch}%,name.ilike.%${sanitizedSearch}%`);
```

## Related Tables and Relationships

Users are referenced in many tables:

- `projects` - User's projects
- `tasks` - User's tasks
- `brain_dumps` - User's brain dumps
- `daily_briefs` - User's daily briefs
- `user_calendar_tokens` - Calendar integration
- `user_context` - Onboarding and preferences
- `user_notification_preferences` - Notification settings
- `user_sms_preferences` - SMS settings
- `customer_subscriptions` - Stripe subscriptions
- `beta_members` - Beta program participation

## Recommendations for Test Bed Feature

### 1. Use Existing Admin API

Leverage `/api/admin/users` endpoint:
- Already implements pagination
- Includes user engagement metrics
- Has search and filter capabilities
- Properly secured with admin checks

### 2. Add Test Bed Specific Fields (If Needed)

If the test bed needs to track which users are in tests:

```sql
-- Migration: Add test bed fields to users table
ALTER TABLE users
  ADD COLUMN test_bed_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN test_bed_groups TEXT[] DEFAULT '{}',
  ADD COLUMN test_bed_metadata JSONB DEFAULT '{}';
```

### 3. Create Test Bed Service

```typescript
// File: src/lib/services/test-bed.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export class TestBedService {
  async getEligibleUsers(criteria?: {
    hasProjects?: boolean;
    hasCalendar?: boolean;
    minBrainDumps?: number;
  }) {
    const adminClient = createAdminSupabaseClient();

    let query = adminClient
      .from('users')
      .select(`
        id, email, name, created_at,
        projects (count),
        brain_dumps (count),
        user_calendar_tokens (user_id)
      `)
      .eq('is_admin', false); // Exclude admins from tests

    // Apply criteria filters

    return query;
  }

  async enrollUserInTest(userId: string, testGroup: string) {
    // Implementation
  }
}
```

### 4. Admin Check Helper

Create a reusable helper for admin checks:

```typescript
// File: src/lib/utils/auth-helpers.ts
import type { RequestEvent } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';

export async function requireAdmin(event: RequestEvent) {
  const { user } = await event.locals.safeGetSession();

  if (!user) {
    return { error: ApiResponse.unauthorized() };
  }

  if (!user?.is_admin) {
    return { error: ApiResponse.forbidden('Admin access required') };
  }

  return { user };
}

// Usage in API routes:
export const GET: RequestHandler = async (event) => {
  const { user, error } = await requireAdmin(event);
  if (error) return error;

  // Proceed with admin operation
};
```

## Summary

### User/Admin Model Quick Reference

| Aspect | Implementation |
|--------|----------------|
| **Admin Flag** | `users.is_admin` boolean field (source of truth) |
| **Admin Audit** | `admin_users` table (who granted, when) |
| **Admin Check** | `app_auth.is_admin()` function (used in RLS) |
| **User Listing** | `GET /api/admin/users` with filters |
| **User Search** | Via `search` parameter (email, name) |
| **User Update** | `PATCH /api/admin/users` (whitelisted fields) |
| **Admin Pages** | `/admin/*` routes (layout-protected) |
| **Security** | Multi-layer: RLS + API guards + layout checks |

### Key Files Reference

| File | Purpose |
|------|---------|
| `/packages/shared-types/src/database.schema.ts` | TypeScript schema definitions |
| `/apps/web/src/routes/api/admin/users/+server.ts` | User management API |
| `/apps/web/src/routes/admin/+layout.server.ts` | Admin section protection |
| `/apps/web/src/lib/supabase/admin.ts` | Admin Supabase client factory |
| `/apps/web/supabase/migrations/*.sql` | Database schema and RLS policies |

### Current Admin Users

1. **DJ Wayne** - djwayne35@gmail.com (Primary)
2. **David Wayne** - dj@build-os.com
3. **Zach** - zach@hausofapex.com
