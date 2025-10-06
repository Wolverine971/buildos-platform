/**
 * Shared Notification Types for BuildOS Platform
 *
 * Used across web and worker apps for extensible notification system
 */

// =====================================================
// EVENT TYPES
// =====================================================

export type EventType =
  // Admin Events (restricted to admin users)
  | "user.signup"
  | "user.trial_expired"
  | "payment.failed"
  | "error.critical"

  // User Events (per-user notifications)
  | "brief.completed"
  | "brief.failed"
  | "brain_dump.processed"
  | "task.due_soon"
  | "project.phase_scheduled"
  | "calendar.sync_failed";

export type EventSource =
  | "database_trigger"
  | "worker_job"
  | "api_action"
  | "cron_scheduler";

export type NotificationChannel = "push" | "email" | "sms" | "in_app";

export type NotificationStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "opened"
  | "clicked";

export type NotificationPriority = "urgent" | "normal" | "low";

// =====================================================
// CORE INTERFACES
// =====================================================

export interface NotificationEvent<T = any> {
  id?: string;
  event_type: EventType;
  event_source: EventSource;
  actor_user_id?: string;
  target_user_id?: string;
  payload: T;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface NotificationSubscription {
  id: string;
  user_id: string;
  event_type: EventType;
  is_active: boolean;
  admin_only: boolean;
  filters?: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface UserNotificationPreferences {
  id?: string;
  user_id?: string;
  event_type: EventType;

  // Channel preferences
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;

  // Delivery preferences
  priority: NotificationPriority;
  batch_enabled: boolean;
  batch_interval_minutes?: number;

  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;

  // Frequency limits
  max_per_day?: number;
  max_per_hour?: number;

  created_at?: string;
  updated_at?: string;
}

export interface NotificationDelivery {
  id: string;
  event_id: string;
  subscription_id?: string;
  recipient_user_id: string;

  channel: NotificationChannel;
  channel_identifier?: string;
  status: NotificationStatus;
  payload: Record<string, any>;

  // Tracking
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  failed_at?: string;

  // Retry tracking
  attempts: number;
  max_attempts: number;
  last_error?: string;

  // External tracking
  external_id?: string;
  tracking_id?: string;

  created_at: string;
  updated_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent?: string;
  created_at: string;
  last_used_at?: string;
  is_active: boolean;
}

// =====================================================
// EVENT PAYLOAD TYPES
// =====================================================

export interface UserSignupEventPayload {
  user_id: string;
  user_email: string;
  signup_method: "email" | "google_oauth";
  referral_source?: string;
  created_at: string;
}

export interface BriefCompletedEventPayload {
  brief_id: string;
  brief_date: string;
  timezone: string;
  task_count: number;
  project_count: number;
}

export interface BriefFailedEventPayload {
  brief_date: string;
  timezone: string;
  error_message: string;
  retry_count: number;
}

export interface BrainDumpProcessedEventPayload {
  brain_dump_id: string;
  project_id?: string;
  project_name?: string;
  tasks_created: number;
  processing_time_ms: number;
}

export interface TaskDueSoonEventPayload {
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  due_date: string;
  hours_until_due: number;
}

export interface ProjectPhaseScheduledEventPayload {
  project_id: string;
  project_name: string;
  phase_id: string;
  phase_name: string;
  scheduled_date: string;
  task_count: number;
}

export interface CalendarSyncFailedEventPayload {
  calendar_id: string;
  project_id?: string;
  error_message: string;
  sync_attempted_at: string;
}

// =====================================================
// NOTIFICATION PAYLOAD (for delivery)
// =====================================================

export interface NotificationPayload {
  title: string;
  body: string;
  action_url?: string;
  icon_url?: string;
  image_url?: string;
  data?: Record<string, any>;
}

// =====================================================
// WORKER JOB METADATA
// =====================================================

export interface NotificationJobMetadata {
  event_id: string;
  delivery_id: string;
  channel: NotificationChannel;
  event_type: EventType;
}

// =====================================================
// ANALYTICS TYPES
// =====================================================

export interface NotificationMetrics {
  channels: ChannelMetrics[];
  event_types: EventTypeMetrics[];
  time_period: string;
}

export interface ChannelMetrics {
  channel: NotificationChannel;
  total_count: number;
  sent_count: number;
  failed_count: number;
  success_rate: number;
}

export interface EventTypeMetrics {
  event_type: EventType;
  total_deliveries: number;
  opened_count: number;
  clicked_count: number;
  open_rate: number;
  click_rate: number;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface EmitEventRequest<T = any> {
  event_type: EventType;
  event_source: EventSource;
  actor_user_id?: string;
  target_user_id?: string;
  payload: T;
  metadata?: Record<string, any>;
}

export interface EmitEventResponse {
  event_id: string;
  subscriptions_notified: number;
  deliveries_queued: number;
}

export interface UpdatePreferencesRequest {
  event_type: EventType;
  preferences: Partial<UserNotificationPreferences>;
}

export interface SubscribeToEventRequest {
  event_type: EventType;
  filters?: Record<string, any>;
}

export interface UnsubscribeFromEventRequest {
  event_type: EventType;
}

export interface CreatePushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
}
