# BuildOS Database Schema Reference

Complete schema for all 130+ tables organized by domain.

**Source:** `packages/shared-types/src/database.schema.ts`
**Generated:** 2026-01-23

## Table of Contents

1. [Users & Authentication](#users--authentication)
2. [Projects & Tasks (Legacy)](#projects--tasks-legacy)
3. [Ontology System](#ontology-system)
4. [Brain Dumps](#brain-dumps)
5. [Chat & AI](#chat--ai)
6. [Calendar Integration](#calendar-integration)
7. [Notifications](#notifications)
8. [SMS & Messaging](#sms--messaging)
9. [Email System](#email-system)
10. [Billing & Subscriptions](#billing--subscriptions)
11. [Beta Program](#beta-program)
12. [Queue & Jobs](#queue--jobs)
13. [Monitoring & Logs](#monitoring--logs)
14. [Agents](#agents)

---

## Users & Authentication

### users
Primary user accounts table.

| Column | Type | Description |
|--------|------|-------------|
| id | string | User ID (Supabase Auth) |
| email | string | Email address |
| name | string? | Display name |
| timezone | string | User timezone |
| is_admin | boolean | Admin privileges |
| is_beta_user | boolean? | Beta program member |
| subscription_status | string? | active, trialing, canceled, etc. |
| stripe_customer_id | string? | Stripe customer reference |
| trial_ends_at | string? | Trial expiration |
| completed_onboarding | boolean? | Legacy onboarding |
| onboarding_v2_completed_at | string? | V2 onboarding completion |
| last_visit | string? | Last activity timestamp |
| created_at | string | Account creation |

### user_context
User profile and work context from onboarding.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| background | string? | Professional background |
| goals_overview | string? | Parsed goals |
| work_style | string? | Work preferences |
| productivity_challenges | string? | Challenges faced |
| active_projects | string? | Current project summary |
| focus_areas | string? | Priority areas |
| habits | string? | Work habits |
| input_* | string? | Raw onboarding inputs |

### user_notification_preferences
Notification channel preferences.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| email_enabled | boolean | Email notifications |
| sms_enabled | boolean | SMS notifications |
| push_enabled | boolean | Push notifications |
| in_app_enabled | boolean | In-app notifications |
| should_email_daily_brief | boolean | Daily brief via email |
| should_sms_daily_brief | boolean | Daily brief via SMS |
| quiet_hours_* | string? | Quiet hours settings |

### user_sms_preferences
SMS-specific settings.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| phone_number | string? | Verified phone |
| phone_verified | boolean? | Verification status |
| daily_sms_limit | number? | Rate limit |
| morning_kickoff_enabled | boolean? | Morning SMS |
| event_reminders_enabled | boolean? | Event reminders |

### user_calendar_preferences
Calendar scheduling preferences.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| work_start_time | string? | Work day start |
| work_end_time | string? | Work day end |
| working_days | number[]? | Days of week |
| default_task_duration_minutes | number? | Default task length |

### user_calendar_tokens
Google Calendar OAuth tokens.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| access_token | string | OAuth access token |
| refresh_token | string? | OAuth refresh token |
| expiry_date | number? | Token expiration |
| google_email | string? | Google account email |

### admin_users
Admin privileges tracking.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| granted_by | string? | Admin who granted |
| granted_at | string? | Grant timestamp |

---

## Projects & Tasks (Legacy)

### projects
User projects (legacy system).

| Column | Type | Description |
|--------|------|-------------|
| id | string | Project ID |
| user_id | string | FK to users |
| name | string | Project name |
| slug | string | URL slug |
| description | string? | Project description |
| context | string? | Rich context from brain dumps |
| status | string | planning, active, completed |
| executive_summary | string? | AI-generated summary |
| start_date | string? | Project start |
| end_date | string? | Project deadline |
| calendar_sync_enabled | boolean? | Calendar integration |
| tags | string[]? | Project tags |

### tasks
Individual tasks (legacy system).

| Column | Type | Description |
|--------|------|-------------|
| id | string | Task ID |
| user_id | string | FK to users |
| project_id | string? | FK to projects |
| title | string | Task title |
| description | string? | Task description |
| status | string | todo, in_progress, done |
| priority | string | low, medium, high |
| task_type | string | one_time, recurring |
| start_date | string? | Scheduled start |
| duration_minutes | number? | Estimated duration |
| recurrence_pattern | string? | Cron-like pattern |
| recurrence_ends | string? | Recurrence end date |
| completed_at | string? | Completion timestamp |
| deleted_at | string? | Soft delete |
| parent_task_id | string? | Subtask parent |
| dependencies | string[]? | Blocking task IDs |

### phases
Project phases for task grouping.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Phase ID |
| project_id | string | FK to projects |
| user_id | string | FK to users |
| name | string | Phase name |
| description | string? | Phase description |
| order | number | Sort order |
| start_date | string | Phase start |
| end_date | string | Phase end |

### phase_tasks
Task-to-phase assignments.

| Column | Type | Description |
|--------|------|-------------|
| phase_id | string | FK to phases |
| task_id | string | FK to tasks |
| order | number | Sort within phase |

---

## Ontology System

New entity management system with templates and FSM states.

### onto_projects
Projects in ontology system.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Project ID |
| created_by | string | Creator user ID |
| name | string | Project name |
| description | string? | Description |
| state_key | string | FSM state |
| type_key | string | Project type template |
| props | Json | Dynamic properties |
| facet_* | string? | Facet values |
| is_public | boolean? | Public visibility |
| org_id | string? | Organization |

### onto_tasks
Tasks in ontology system.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Task ID |
| project_id | string | FK to onto_projects |
| created_by | string | Creator user ID |
| title | string | Task title |
| description | string? | Description |
| state_key | string | FSM state (todo, in_progress, done) |
| type_key | string | Task type template |
| priority | number? | Priority (1-5) |
| due_at | string? | Due date |
| start_at | string? | Start date |
| props | Json | Dynamic properties |
| facet_scale | string? | Scale facet |
| completed_at | string? | Completion time |
| deleted_at | string? | Soft delete |

### onto_goals
Project goals.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Goal ID |
| project_id | string | FK to onto_projects |
| name | string | Goal name |
| goal | string? | Goal description |
| state_key | string | FSM state |
| target_date | string? | Target completion |

### onto_plans
Project plans.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Plan ID |
| project_id | string | FK to onto_projects |
| name | string | Plan name |
| plan | string? | Plan content |
| state_key | string | FSM state |
| type_key | string | Plan type |

### onto_documents
Project documents.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Document ID |
| project_id | string | FK to onto_projects |
| title | string | Document title |
| content | string? | Document content |
| state_key | string | FSM state |
| type_key | string | Document type |

### onto_milestones
Project milestones.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Milestone ID |
| project_id | string | FK to onto_projects |
| title | string | Milestone name |
| due_at | string? | Due date |
| state_key | string | FSM state |

### onto_events
Calendar events in ontology.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Event ID |
| project_id | string? | FK to onto_projects |
| title | string | Event title |
| start_at | string | Start time |
| end_at | string? | End time |
| all_day | boolean | All-day event |
| location | string? | Location |
| state_key | string | FSM state |

### onto_edges
Entity relationships.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Edge ID |
| project_id | string | FK to onto_projects |
| src_id | string | Source entity ID |
| src_kind | string | Source entity type |
| dst_id | string | Destination entity ID |
| dst_kind | string | Destination entity type |
| rel | string | Relationship type |

### onto_comments
Entity comments.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Comment ID |
| project_id | string | FK to onto_projects |
| entity_id | string | Target entity ID |
| entity_type | string | Target entity type |
| body | string | Comment content |
| created_by | string | Author user ID |
| parent_id | string? | Reply parent |

### onto_actors
Users and system actors.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Actor ID |
| user_id | string? | FK to users |
| kind | string | user, system, bot |
| name | string | Display name |
| email | string? | Email |

### onto_project_members
Project membership.

| Column | Type | Description |
|--------|------|-------------|
| project_id | string | FK to onto_projects |
| actor_id | string | FK to onto_actors |
| role_key | string | owner, member, viewer |
| access | string | Permission level |

---

## Brain Dumps

### brain_dumps
User brain dump entries.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Brain dump ID |
| user_id | string | FK to users |
| content | string? | Raw input content |
| title | string? | Generated title |
| status | string | pending, processing, completed |
| ai_summary | string? | AI-generated summary |
| ai_insights | string? | AI insights |
| parsed_results | Json? | Extracted entities |
| project_id | string? | Linked project |
| tags | string[]? | Tags |

### brain_dump_links
Links from brain dumps to entities.

| Column | Type | Description |
|--------|------|-------------|
| brain_dump_id | string | FK to brain_dumps |
| project_id | string? | FK to projects |
| task_id | string? | FK to tasks |
| note_id | string? | FK to notes |

### onto_braindumps
Brain dumps in ontology system.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Brain dump ID |
| user_id | string | FK to users |
| content | string | Input content |
| title | string? | Title |
| summary | string? | AI summary |
| status | string | Processing status |
| topics | string[]? | Extracted topics |
| chat_session_id | string? | Associated chat |

---

## Chat & AI

### chat_sessions
AI chat sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Session ID |
| user_id | string | FK to users |
| context_type | string | global, project, task |
| entity_id | string? | Context entity ID |
| title | string? | Session title |
| status | string | active, archived |
| message_count | number? | Total messages |
| total_tokens_used | number? | Token consumption |

### chat_messages
Individual chat messages.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Message ID |
| session_id | string | FK to chat_sessions |
| user_id | string | FK to users |
| role | string | user, assistant, system, tool |
| content | string | Message content |
| tool_calls | Json? | Tool call data |
| tool_result | Json? | Tool execution result |
| prompt_tokens | number? | Input tokens |
| completion_tokens | number? | Output tokens |

### chat_operations
Database operations from chat.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Operation ID |
| chat_session_id | string | FK to chat_sessions |
| operation_type | string | create, update, delete |
| table_name | string | Target table |
| entity_id | string? | Target entity |
| data | Json | Operation data |
| status | string? | pending, executed, failed |

### llm_usage_logs
LLM API usage tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log ID |
| user_id | string | FK to users |
| operation_type | string | Operation name |
| model_requested | string | Requested model |
| model_used | string | Actual model used |
| prompt_tokens | number | Input tokens |
| completion_tokens | number | Output tokens |
| total_tokens | number | Total tokens |
| total_cost_usd | number | Estimated cost |
| response_time_ms | number | Latency |
| status | string | success, error |
| provider | string? | openai, openrouter |

### llm_usage_summary
Aggregated LLM usage by day.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| summary_date | string | Date |
| total_requests | number | Request count |
| total_tokens | number | Token count |
| total_cost_usd | number | Total cost |

---

## Calendar Integration

### project_calendars
Google Calendars linked to projects.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Link ID |
| project_id | string | FK to projects |
| user_id | string | FK to users |
| calendar_id | string | Google Calendar ID |
| calendar_name | string | Calendar name |
| sync_enabled | boolean? | Sync active |
| sync_status | string? | Sync state |

### task_calendar_events
Calendar events linked to tasks.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Link ID |
| task_id | string | FK to tasks |
| user_id | string | FK to users |
| calendar_id | string | Google Calendar ID |
| calendar_event_id | string | Google Event ID |
| event_start | string? | Event start |
| event_end | string? | Event end |
| sync_status | string | Sync state |

### time_blocks
Scheduled time blocks.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Block ID |
| user_id | string | FK to users |
| project_id | string? | FK to projects |
| block_type | string | Block type |
| start_time | string | Start time |
| end_time | string | End time |
| duration_minutes | number | Duration |
| calendar_event_id | string? | Google Event ID |

### calendar_webhook_channels
Google Calendar webhook channels.

| Column | Type | Description |
|--------|------|-------------|
| user_id | string | FK to users |
| channel_id | string | Webhook channel ID |
| resource_id | string? | Google resource ID |
| expiration | number | Expiration timestamp |
| sync_token | string? | Incremental sync token |

---

## Notifications

### notification_events
Notification triggers.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Event ID |
| event_type | string | Event type |
| event_source | string | Source system |
| payload | Json | Event data |
| actor_user_id | string? | Triggering user |
| target_user_id | string? | Target user |

### notification_deliveries
Delivery attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Delivery ID |
| event_id | string? | FK to notification_events |
| recipient_user_id | string | Target user |
| channel | string | email, sms, push, in_app |
| status | string | pending, sent, delivered, failed |
| payload | Json | Channel-specific payload |
| sent_at | string? | Send time |
| delivered_at | string? | Delivery confirmation |

### user_notifications
In-app notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Notification ID |
| user_id | string | FK to users |
| title | string | Notification title |
| message | string | Notification message |
| type | string | Notification type |
| priority | string? | Priority level |
| read_at | string? | Read timestamp |
| dismissed_at | string? | Dismiss timestamp |
| action_url | string? | Click target |

---

## SMS & Messaging

### sms_messages
SMS message queue.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Message ID |
| user_id | string | FK to users |
| phone_number | string | Recipient phone |
| message_content | string | SMS content |
| status | string | pending, sent, delivered, failed |
| priority | string | Priority level |
| twilio_sid | string? | Twilio message SID |
| sent_at | string? | Send time |
| delivered_at | string? | Delivery time |

### scheduled_sms_messages
Scheduled SMS reminders.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Schedule ID |
| user_id | string | FK to users |
| message_content | string | SMS content |
| message_type | string | Type (reminder, kickoff) |
| scheduled_for | string | Send time |
| status | string | pending, sent, cancelled |
| calendar_event_id | string? | Related event |

### sms_templates
SMS message templates.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Template ID |
| template_key | string | Unique key |
| name | string | Template name |
| message_template | string | Template with variables |
| required_vars | Json? | Required variables |

---

## Email System

### emails
Email records.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Email ID |
| created_by | string | Sender user ID |
| from_name | string | Sender name |
| from_email | string | Sender email |
| subject | string | Email subject |
| content | string | Email body |
| status | string | draft, scheduled, sent |
| tracking_enabled | boolean | Open/click tracking |

### email_recipients
Email recipients.

| Column | Type | Description |
|--------|------|-------------|
| email_id | string | FK to emails |
| recipient_email | string | Recipient email |
| recipient_type | string | to, cc, bcc |
| status | string | pending, sent, delivered |
| opened_at | string? | First open time |

### email_logs
Legacy email logging.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log ID |
| user_id | string? | FK to users |
| to_email | string | Recipient |
| subject | string | Subject |
| status | string | Send status |

---

## Billing & Subscriptions

### customer_subscriptions
Stripe subscriptions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Subscription ID |
| user_id | string | FK to users |
| stripe_customer_id | string | Stripe customer |
| stripe_subscription_id | string | Stripe subscription |
| status | string | active, canceled, past_due |
| current_period_start | string? | Period start |
| current_period_end | string? | Period end |
| cancel_at | string? | Scheduled cancel |

### subscription_plans
Available plans.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Plan ID |
| name | string | Plan name |
| stripe_price_id | string | Stripe price ID |
| price_cents | number | Price in cents |
| billing_interval | string? | month, year |
| features | Json? | Plan features |

### invoices
Invoice records.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Invoice ID |
| user_id | string | FK to users |
| stripe_invoice_id | string | Stripe invoice ID |
| amount_due | number | Amount in cents |
| amount_paid | number | Paid amount |
| status | string | Invoice status |

### payment_methods
Saved payment methods.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Method ID |
| user_id | string | FK to users |
| stripe_payment_method_id | string | Stripe PM ID |
| type | string | card, bank |
| card_brand | string? | Visa, Mastercard |
| card_last4 | string? | Last 4 digits |
| is_default | boolean? | Default method |

### discount_codes
Promo codes.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Code ID |
| code | string | Promo code |
| discount_type | string | percent, fixed |
| discount_value | number | Discount amount |
| is_active | boolean? | Code active |

---

## Beta Program

### beta_signups
Beta waitlist.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Signup ID |
| email | string | Email address |
| full_name | string | Full name |
| signup_status | string? | pending, approved |
| why_interested | string? | Interest reason |

### beta_members
Approved beta members.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Member ID |
| user_id | string? | FK to users |
| email | string | Email |
| full_name | string | Name |
| beta_tier | string? | Tier level |
| is_active | boolean? | Active member |

### beta_feedback
Beta feedback submissions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Feedback ID |
| member_id | string? | FK to beta_members |
| feedback_title | string | Title |
| feedback_description | string | Description |
| feedback_type | string? | bug, feature, etc. |
| feedback_status | string? | Status |

---

## Queue & Jobs

### queue_jobs
Background job queue.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Job ID |
| queue_job_id | string | External job ID |
| user_id | string | FK to users |
| job_type | string | Job type name |
| status | string | pending, processing, completed, failed |
| scheduled_for | string | Scheduled run time |
| started_at | string? | Actual start |
| completed_at | string? | Completion time |
| attempts | number? | Attempt count |
| max_attempts | number? | Max retries |
| error_message | string? | Last error |
| result | Json? | Job result |

### cron_logs
Cron job execution logs.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log ID |
| job_name | string | Cron job name |
| status | string | success, error |
| executed_at | string | Execution time |
| error_message | string? | Error details |

---

## Monitoring & Logs

### error_logs
Application error tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Error ID |
| user_id | string? | FK to users |
| error_type | string | Error category |
| error_message | string | Error message |
| error_stack | string? | Stack trace |
| endpoint | string? | API endpoint |
| severity | string? | Error severity |
| resolved | boolean? | Resolution status |

### user_activity_logs
User activity tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log ID |
| user_id | string? | FK to users |
| activity_type | string | Activity type |
| activity_data | Json? | Activity details |
| ip_address | unknown | User IP |
| user_agent | string? | Browser info |

### security_logs
Security event logging.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log ID |
| user_id | string | FK to users |
| event_type | string | Security event type |
| content | string | Event details |
| was_blocked | boolean | Blocked flag |

### admin_analytics
Admin dashboard metrics.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Metric ID |
| date | string | Metric date |
| metric_name | string | Metric name |
| metric_value | number | Metric value |

---

## Agents

### agents
AI agent definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Agent ID |
| user_id | string | FK to users |
| name | string | Agent name |
| type | string | planner, executor |
| system_prompt | string | System instructions |
| available_tools | Json? | Tool list |
| status | string | active, completed |

### agent_chat_sessions
Agent conversation sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Session ID |
| user_id | string | FK to users |
| planner_agent_id | string | FK to agents |
| session_type | string | Session type |
| status | string | Session status |

### agent_plans
Agent execution plans.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Plan ID |
| session_id | string | FK to agent_chat_sessions |
| planner_agent_id | string | FK to agents |
| steps | Json | Plan steps |
| status | string | Plan status |

### agent_executions
Agent step executions.

| Column | Type | Description |
|--------|------|-------------|
| id | string | Execution ID |
| plan_id | string | FK to agent_plans |
| step_number | number | Step index |
| task | Json | Step task |
| status | string | Execution status |
| result | Json? | Step result |
