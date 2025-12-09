<!-- apps/web/docs/features/admin-dashboard/README.md -->

# LLM Usage Admin Dashboard

## Overview

A comprehensive admin dashboard for monitoring LLM API usage, costs, and performance across the BuildOS platform.

## Location

**URL:** `/admin/llm-usage`

**Access:** Admin users only (checked via `admin_users` table)

## Features

### 📊 Overview Metrics (Top Cards)

- **Total Cost** - Total spend across selected time period
- **Total Requests** - Number of API calls made
- **Total Tokens** - Combined prompt + completion tokens
- **Avg Cost/Request** - Average cost per API call
- **Success Rate** - Percentage of successful requests
- **Avg Response Time** - Average response time in milliseconds

### 📈 Charts & Visualizations

#### Cost Over Time

- Horizontal bar chart showing daily costs
- Last 14 days displayed
- Helps identify cost spikes and trends

#### Requests Over Time

- Horizontal bar chart showing daily request volume
- Last 14 days displayed
- Helps identify usage patterns

### 📋 Detailed Tables

#### Model Breakdown

Shows performance by AI model:

- Model name
- Number of requests
- Total cost
- Total tokens used
- Average response time
- Success rate

Sorted by cost (highest first)

#### Operation Breakdown

Shows usage by operation type:

- Operation name (brain_dump, daily_brief, etc.)
- Number of requests
- Total cost
- Total tokens used
- Average response time
- Success rate

Sorted by cost (highest first)

#### Top Users by Cost

Shows users ranked by spend:

- User name and email
- Number of requests
- Total cost
- Total tokens used
- Average response time
- Last usage timestamp

Limited to top 20 users

#### Recent Activity

Real-time feed of latest requests:

- Timestamp
- User email
- Operation type
- Model used
- Cost
- Tokens
- Response time
- Status (success/failure/timeout)

Shows last 50 requests

### 🔍 Filters

- **Time Range Selector**
    - Last 7 days
    - Last 30 days (default)
    - Last 90 days
    - Last year

- **Refresh Button** - Reload data on demand

## Implementation Details

### API Endpoint

**File:** `/routes/api/admin/llm-usage/stats/+server.ts`

**Method:** GET

**Query Params:**

- `days` - Number of days to look back (default: 30)

**Response:**

```json
{
  "success": true,
  "data": {
    "overview": { ... },
    "dailyData": [ ... ],
    "modelBreakdown": [ ... ],
    "operationBreakdown": [ ... ],
    "topUsers": [ ... ],
    "recentLogs": [ ... ],
    "dateRange": { ... }
  }
}
```

### Database Functions

Added to migration SQL:

#### `get_admin_model_breakdown()`

```sql
get_admin_model_breakdown(p_start_date, p_end_date)
```

Returns aggregated stats per model.

#### `get_admin_operation_breakdown()`

```sql
get_admin_operation_breakdown(p_start_date, p_end_date)
```

Returns aggregated stats per operation type.

#### `get_admin_top_users()`

```sql
get_admin_top_users(p_start_date, p_end_date, p_limit)
```

Returns top users by cost with a configurable limit.

### Security

- **RLS Policies:** All data queries respect Row Level Security
- **Admin Check:** Route requires user to exist in `admin_users` table
- **Server-Side:** All queries executed server-side for security

## Setup

### 1. Run Migration

The migration at `apps/web/supabase/migrations/llm_usage_tracking.sql` now includes:

- Main tables
- Admin RPC functions (added)
- Admin views

### 2. Grant Admin Access

To grant admin access to a user:

```sql
INSERT INTO admin_users (user_id, granted_by)
VALUES ('user-uuid-here', 'admin-uuid-here');
```

### 3. Access Dashboard

Navigate to: `https://yourapp.com/admin/llm-usage`

## Usage Examples

### Monitoring Costs

1. Select time range (e.g., "Last 30 days")
2. Check "Total Cost" card for overall spend
3. Review "Cost Over Time" chart for trends
4. Check "Model Breakdown" to see which models are most expensive
5. Review "Top Users" to identify high-usage accounts

### Identifying Issues

1. Check "Success Rate" in overview - should be >95%
2. Review "Recent Activity" for failed requests
3. Check "Avg Response Time" - spikes may indicate performance issues
4. Filter to specific time periods to isolate issues

### Optimizing Costs

1. Review "Model Breakdown" - identify expensive models
2. Check "Operation Breakdown" - see which operations cost most
3. Review "Top Users" - identify users with high costs
4. Analyze if cheaper models can be used for specific operations

## Future Enhancements

Potential additions:

- **Export functionality** - Download reports as CSV/PDF
- **Real-time updates** - Auto-refresh dashboard
- **Advanced filters** - Filter by model, operation, user
- **Cost forecasting** - Predict future costs based on trends
- **Alerts setup** - Email notifications for cost thresholds
- **Custom date ranges** - Specific start/end dates
- **Comparison views** - Compare periods (week over week, etc.)
- **Provider breakdown** - Group by AI provider (OpenAI, Anthropic, etc.)
- **Interactive charts** - Zoom, pan, tooltips
- **Error analysis** - Detailed breakdown of failures

## Maintenance

### Regular Tasks

1. **Monthly Review**
    - Check total costs vs budget
    - Review model performance
    - Identify optimization opportunities

2. **User Management**
    - Monitor top users
    - Address unusually high usage
    - Set up cost alerts if needed

3. **Performance Monitoring**
    - Track response times
    - Monitor success rates
    - Investigate failures

### Troubleshooting

**Dashboard not loading?**

- Check admin access in database
- Verify migration ran successfully
- Check browser console for errors

**Data seems incorrect?**

- Verify `llm_usage_summary` table is being updated (trigger should auto-update)
- Check if logging is working in `SmartLLMService`
- Run summary update manually:
    ```sql
    SELECT update_llm_usage_summary('user-id', '2025-09-30');
    ```

**Performance issues?**

- Reduce time range
- Check database indexes
- Consider archiving old logs

## Screenshots Reference

The dashboard displays:

- **Top:** 6 metric cards in a responsive grid
- **Middle:** 2 bar charts side by side
- **Below:** 4 detailed tables (models, operations, users, activity)
- **Header:** Time range filter and refresh button

All tables are:

- Sortable by default (by cost/requests)
- Responsive and scrollable on mobile
- Formatted for readability (currency, numbers, percentages)

## Color Coding

- **Purple** (#9333EA) - Cost charts and primary metrics
- **Blue** (#2563EB) - Request charts
- **Green** (#16A34A) - Success indicators
- **Red** (#DC2626) - Failure indicators
- **Yellow** (#CA8A04) - Timeout indicators
- **Gray** - Neutral/unknown statuses
