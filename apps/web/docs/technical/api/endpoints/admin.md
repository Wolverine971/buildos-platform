# Admin API

**Base Path:** `/api/admin`

The Admin API provides administrative functionality for managing users, monitoring system health, viewing analytics, and configuring system settings. All endpoints require admin-level authentication.

---

## Table of Contents

1. [User Management](#user-management)
2. [System Analytics](#system-analytics)
3. [System Health & Monitoring](#system-health--monitoring)
4. [System Configuration](#system-configuration)
5. [Database Operations](#database-operations)

---

## Authentication

**All admin endpoints require admin-level authentication:**

```typescript
const { session } = await safeGetSession(event);
if (!session?.user) {
	return ApiResponse.unauthorized('Authentication required');
}

// Check if user is admin
const { data: user } = await supabase
	.from('users')
	.select('is_admin')
	.eq('id', session.user.id)
	.single();

if (!user?.is_admin) {
	return ApiResponse.forbidden('Admin access required');
}
```

---

## User Management

### 1. `GET /api/admin/users` - List All Users

**Purpose:** Retrieve all users with filtering and pagination.

**File:** `src/routes/api/admin/users/+server.ts`

**Authentication:** Admin required

#### Query Parameters

| Parameter      | Type                                                | Required | Description                        |
| -------------- | --------------------------------------------------- | -------- | ---------------------------------- |
| `status`       | `'active' \| 'trial' \| 'inactive' \| 'banned'`     | No       | Filter by user status              |
| `subscription` | `'free' \| 'paid' \| 'trial' \| 'expired'`          | No       | Filter by subscription status      |
| `search`       | `string`                                            | No       | Search by name or email            |
| `sort_by`      | `'created_at' \| 'last_login' \| 'email' \| 'name'` | No       | Sort field (default: 'created_at') |
| `order`        | `'asc' \| 'desc'`                                   | No       | Sort order (default: 'desc')       |
| `limit`        | `number`                                            | No       | Max results (default: 50)          |
| `offset`       | `number`                                            | No       | Pagination offset                  |

#### Response: `ApiResponse<{ users: User[], total: number }>`

```typescript
{
  success: true,
  data: {
    users: [
      {
        id: "uuid",
        email: "user@example.com",
        name: "John Doe",
        status: "active",
        subscription_status: "paid",
        trial_ends_at: null,
        created_at: "2025-01-01T00:00:00Z",
        last_login_at: "2025-01-15T10:00:00Z",
        metadata: {
          total_projects: 5,
          total_tasks: 45,
          total_brain_dumps: 12
        }
      }
    ],
    total: 150
  }
}
```

---

### 2. `GET /api/admin/users/[id]` - Get User Details

**Purpose:** Retrieve detailed information about a specific user.

**File:** `src/routes/api/admin/users/[id]/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ user: UserDetail }>`

```typescript
{
  success: true,
  data: {
    user: {
      id: "uuid",
      email: "user@example.com",
      name: "John Doe",
      status: "active",
      subscription_status: "paid",

      // Account details
      created_at: "2025-01-01T00:00:00Z",
      last_login_at: "2025-01-15T10:00:00Z",
      trial_ends_at: null,
      subscription_id: "stripe-sub-id",

      // Usage statistics
      statistics: {
        total_projects: 5,
        total_tasks: 45,
        completed_tasks: 23,
        total_brain_dumps: 12,
        total_daily_briefs: 30,
        storage_used_bytes: 1048576,
        api_calls_this_month: 1250
      },

      // Activity log (recent 10)
      recent_activity: [
        {
          type: "brain_dump_created",
          timestamp: "2025-01-15T10:00:00Z",
          metadata: { project_id: "uuid" }
        }
      ],

      // Billing info
      billing: {
        stripe_customer_id: "cus_xxx",
        subscription_plan: "pro",
        subscription_status: "active",
        current_period_end: "2025-02-01T00:00:00Z",
        total_revenue: 99.00
      }
    }
  }
}
```

---

### 3. `PATCH /api/admin/users/[id]` - Update User

**Purpose:** Update user details or status.

**File:** `src/routes/api/admin/users/[id]/+server.ts`

**Authentication:** Admin required

#### Request Body (All Optional)

```typescript
{
  status?: 'active' | 'inactive' | 'banned';
  is_admin?: boolean;
  trial_ends_at?: string | null;  // ISO date
  subscription_status?: 'free' | 'paid' | 'trial' | 'expired';
  notes?: string;  // Admin notes about user
}
```

#### Response: `ApiResponse<{ user: User }>`

---

### 4. `DELETE /api/admin/users/[id]` - Delete User

**Purpose:** Permanently delete a user account.

**File:** `src/routes/api/admin/users/[id]/+server.ts`

**Authentication:** Admin required

#### Query Parameters

| Parameter             | Type      | Required | Description                                |
| --------------------- | --------- | -------- | ------------------------------------------ |
| `cancel_subscription` | `boolean` | No       | Cancel Stripe subscription (default: true) |

#### Response: `ApiResponse<{ deleted: true }>`

#### Side Effects

- Permanently deletes user record
- Cascades to all projects, tasks, brain dumps
- Cancels Stripe subscription if active
- Removes all calendar integrations
- Deletes user files/storage
- Cannot be undone

---

### 5. `POST /api/admin/users/[id]/extend-trial` - Extend Trial

**Purpose:** Extend a user's trial period.

**File:** `src/routes/api/admin/users/[id]/extend-trial/+server.ts`

**Authentication:** Admin required

#### Request Body

```typescript
{
  days: number;  // Number of days to extend
  reason?: string;  // Optional reason for extension
}
```

#### Response: `ApiResponse<{ user: User, new_trial_end: string }>`

```typescript
{
  success: true,
  data: {
    user: { /* updated user */ },
    new_trial_end: "2025-02-15T00:00:00Z"
  },
  message: "Trial extended by 14 days"
}
```

---

## System Analytics

### 6. `GET /api/admin/analytics/overview` - System Overview

**Purpose:** Get high-level system analytics and metrics.

**File:** `src/routes/api/admin/analytics/overview/+server.ts`

**Authentication:** Admin required

#### Query Parameters

| Parameter | Type                              | Required | Description                  |
| --------- | --------------------------------- | -------- | ---------------------------- |
| `period`  | `'7d' \| '30d' \| '90d' \| 'all'` | No       | Time period (default: '30d') |

#### Response: `ApiResponse<{ analytics: SystemAnalytics }>`

```typescript
{
  success: true,
  data: {
    analytics: {
      // User metrics
      total_users: 1500,
      active_users: 850,
      trial_users: 200,
      paid_users: 650,
      new_users_this_period: 120,

      // Usage metrics
      total_projects: 4500,
      total_tasks: 35000,
      total_brain_dumps: 8000,
      total_daily_briefs_generated: 12000,

      // Revenue metrics
      monthly_recurring_revenue: 6500,
      total_revenue: 45000,
      average_revenue_per_user: 30,

      // Engagement metrics
      daily_active_users: 450,
      weekly_active_users: 700,
      monthly_active_users: 850,
      average_session_duration: 1800,  // seconds

      // AI usage
      total_ai_requests: 25000,
      ai_cost_this_month: 125.50,
      average_ai_cost_per_user: 0.08,

      // System health
      api_error_rate: 0.02,  // 2%
      average_response_time: 250,  // ms
      uptime_percentage: 99.9
    }
  }
}
```

---

### 7. `GET /api/admin/analytics/growth` - Growth Analytics

**Purpose:** Retrieve user growth and retention metrics.

**File:** `src/routes/api/admin/analytics/growth/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ growth: GrowthAnalytics }>`

```typescript
{
  success: true,
  data: {
    growth: {
      // Daily signups (last 30 days)
      daily_signups: [
        { date: "2025-01-01", signups: 15 },
        { date: "2025-01-02", signups: 12 }
        // ... more data
      ],

      // Conversion funnel
      funnel: {
        visitors: 5000,
        signups: 150,
        trial_started: 120,
        converted_to_paid: 45,
        conversion_rate: 0.009  // 0.9%
      },

      // Retention cohorts
      retention: {
        week_1: 0.85,
        week_2: 0.72,
        week_4: 0.65,
        month_3: 0.58,
        month_6: 0.52
      },

      // Churn analysis
      churn: {
        monthly_churn_rate: 0.05,  // 5%
        churned_users_this_month: 32,
        churn_reasons: {
          "too_expensive": 12,
          "not_using": 15,
          "missing_features": 5
        }
      }
    }
  }
}
```

---

### 8. `GET /api/admin/analytics/revenue` - Revenue Analytics

**Purpose:** Detailed revenue and subscription analytics.

**File:** `src/routes/api/admin/analytics/revenue/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ revenue: RevenueAnalytics }>`

```typescript
{
  success: true,
  data: {
    revenue: {
      // Monthly recurring revenue trend
      mrr_trend: [
        { month: "2024-12", mrr: 5500 },
        { month: "2025-01", mrr: 6500 }
      ],

      // Revenue breakdown
      revenue_by_plan: {
        "starter": 1500,
        "pro": 3500,
        "enterprise": 1500
      },

      // Subscription metrics
      subscriptions: {
        total_active: 650,
        new_this_month: 45,
        cancelled_this_month: 12,
        net_new: 33
      },

      // Lifetime value
      average_customer_lifetime_value: 450,
      average_subscription_duration_months: 15,

      // Forecasting
      projected_mrr_next_month: 7200,
      projected_annual_revenue: 86400
    }
  }
}
```

---

## System Health & Monitoring

### 9. `GET /api/admin/health` - System Health Check

**Purpose:** Check overall system health and service status.

**File:** `src/routes/api/admin/health/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ health: SystemHealth }>`

```typescript
{
  success: true,
  data: {
    health: {
      status: "healthy",  // "healthy" | "degraded" | "down"

      // Service status
      services: {
        database: {
          status: "healthy",
          response_time: 15,  // ms
          last_check: "2025-01-15T10:00:00Z"
        },
        openai: {
          status: "healthy",
          response_time: 850,
          last_check: "2025-01-15T10:00:00Z"
        },
        stripe: {
          status: "healthy",
          response_time: 120,
          last_check: "2025-01-15T10:00:00Z"
        },
        google_calendar: {
          status: "healthy",
          response_time: 200,
          last_check: "2025-01-15T10:00:00Z"
        },
        redis: {
          status: "healthy",
          response_time: 5,
          last_check: "2025-01-15T10:00:00Z"
        }
      },

      // Performance metrics
      performance: {
        average_api_response_time: 250,
        p95_response_time: 850,
        p99_response_time: 1500,
        error_rate: 0.02
      },

      // Resource usage
      resources: {
        database_connections: {
          active: 25,
          idle: 15,
          max: 100
        },
        memory_usage_percent: 65,
        cpu_usage_percent: 45
      }
    }
  }
}
```

---

### 10. `GET /api/admin/logs` - System Logs

**Purpose:** Retrieve system logs with filtering.

**File:** `src/routes/api/admin/logs/+server.ts`

**Authentication:** Admin required

#### Query Parameters

| Parameter    | Type                                     | Required | Description                |
| ------------ | ---------------------------------------- | -------- | -------------------------- |
| `level`      | `'error' \| 'warn' \| 'info' \| 'debug'` | No       | Filter by log level        |
| `service`    | `string`                                 | No       | Filter by service name     |
| `start_date` | `string (ISO date)`                      | No       | Start date for logs        |
| `end_date`   | `string (ISO date)`                      | No       | End date for logs          |
| `search`     | `string`                                 | No       | Search in log messages     |
| `limit`      | `number`                                 | No       | Max results (default: 100) |

#### Response: `ApiResponse<{ logs: Log[], total: number }>`

```typescript
{
  success: true,
  data: {
    logs: [
      {
        id: "uuid",
        timestamp: "2025-01-15T10:00:00Z",
        level: "error",
        service: "braindump-processor",
        message: "OpenAI API request failed",
        metadata: {
          user_id: "uuid",
          error_code: "rate_limit_exceeded",
          retry_count: 3
        }
      }
    ],
    total: 250
  }
}
```

---

## System Configuration

### 11. `GET /api/admin/config` - Get Configuration

**Purpose:** Retrieve current system configuration.

**File:** `src/routes/api/admin/config/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ config: SystemConfig }>`

```typescript
{
  success: true,
  data: {
    config: {
      // Feature flags
      features: {
        brain_dump_enabled: true,
        calendar_integration_enabled: true,
        daily_briefs_enabled: true,
        stripe_payments_enabled: true,
        ai_phase_generation_enabled: true
      },

      // Rate limits
      rate_limits: {
        brain_dumps_per_day: 10,
        ai_requests_per_hour: 50,
        api_requests_per_minute: 100
      },

      // AI configuration
      ai_config: {
        default_model: "gpt-4",
        max_tokens: 4000,
        temperature: 0.7,
        enable_streaming: true
      },

      // Trial settings
      trial_settings: {
        trial_duration_days: 14,
        trial_project_limit: 3,
        trial_task_limit: 50
      },

      // Email settings
      email_settings: {
        daily_brief_enabled: true,
        marketing_emails_enabled: false,
        trial_reminder_days: [7, 3, 1]
      }
    }
  }
}
```

---

### 12. `PATCH /api/admin/config` - Update Configuration

**Purpose:** Update system configuration settings.

**File:** `src/routes/api/admin/config/+server.ts`

**Authentication:** Admin required

#### Request Body

Accepts partial configuration object (same structure as GET response).

#### Response: `ApiResponse<{ config: SystemConfig }>`

#### Side Effects

- Configuration changes take effect immediately
- Some changes may trigger system-wide notifications
- All changes are logged in audit trail

---

## Database Operations

### 13. `POST /api/admin/database/backup` - Trigger Database Backup

**Purpose:** Manually trigger a database backup.

**File:** `src/routes/api/admin/database/backup/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ backup: BackupInfo }>`

```typescript
{
  success: true,
  data: {
    backup: {
      id: "backup-uuid",
      started_at: "2025-01-15T10:00:00Z",
      status: "in_progress",
      estimated_completion: "2025-01-15T10:15:00Z"
    }
  }
}
```

---

### 14. `GET /api/admin/database/stats` - Database Statistics

**Purpose:** Get database performance and usage statistics.

**File:** `src/routes/api/admin/database/stats/+server.ts`

**Authentication:** Admin required

#### Response: `ApiResponse<{ stats: DatabaseStats }>`

```typescript
{
  success: true,
  data: {
    stats: {
      // Table sizes
      table_sizes: {
        users: { rows: 1500, size_mb: 5.2 },
        projects: { rows: 4500, size_mb: 12.8 },
        tasks: { rows: 35000, size_mb: 85.4 },
        brain_dumps: { rows: 8000, size_mb: 45.2 }
      },

      // Performance
      total_database_size_mb: 256.8,
      average_query_time_ms: 25,
      slow_queries_count: 3,

      // Connection pool
      connection_pool: {
        active: 25,
        idle: 15,
        waiting: 0,
        max: 100
      }
    }
  }
}
```

---

## Common Patterns

### Admin Authorization Check

```typescript
async function requireAdmin(session: Session): Promise<boolean> {
	const { data: user } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', session.user.id)
		.single();

	return user?.is_admin === true;
}
```

### Audit Logging

All admin actions are automatically logged:

```typescript
await supabase.from('admin_audit_log').insert({
	admin_id: session.user.id,
	action: 'user_updated',
	target_id: userId,
	changes: { status: 'banned' },
	ip_address: request.headers.get('x-forwarded-for'),
	timestamp: new Date().toISOString()
});
```

---

## Security Considerations

### Admin Access Control

- Admin status stored in `users.is_admin` boolean field
- All admin endpoints verify `is_admin = true`
- Admin actions logged in audit trail
- IP whitelist for admin access (optional)

### Sensitive Operations

Some operations (delete user, update config) require:

- Admin authentication
- Confirmation token
- Audit logging
- Optional 2FA verification

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0
