// packages/shared-types/src/payloadTransformer.ts
/**
 * Payload Transformer Service
 *
 * Transforms event-specific payloads into notification delivery payloads
 * with proper title and body fields for all notification channels.
 *
 * This solves the architectural gap where event payloads contain structured
 * data but notification delivery expects user-facing content.
 */

import type {
  EventType,
  NotificationPayload,
  BriefCompletedEventPayload,
  BriefFailedEventPayload,
  BrainDumpProcessedEventPayload,
  TaskDueSoonEventPayload,
  ProjectPhaseScheduledEventPayload,
  CalendarSyncFailedEventPayload,
  UserSignupEventPayload,
} from "./notification.types";

// =====================================================
// TRANSFORMER INTERFACE
// =====================================================

export type EventPayload =
  | BriefCompletedEventPayload
  | BriefFailedEventPayload
  | BrainDumpProcessedEventPayload
  | TaskDueSoonEventPayload
  | ProjectPhaseScheduledEventPayload
  | CalendarSyncFailedEventPayload
  | UserSignupEventPayload
  | Record<string, any>;

export interface TransformResult {
  success: boolean;
  payload?: NotificationPayload;
  error?: string;
}

// =====================================================
// INDIVIDUAL TRANSFORMERS
// =====================================================

/**
 * Transform brief.completed event payload
 */
function transformBriefCompleted(
  payload: BriefCompletedEventPayload,
): NotificationPayload {
  const taskText =
    payload.task_count === 1 ? "1 task" : `${payload.task_count || 0} tasks`;
  const projectText =
    payload.project_count === 1
      ? "1 project"
      : `${payload.project_count || 0} projects`;

  return {
    title: "Your Daily Brief is Ready! 📋",
    body: `${taskText} across ${projectText} for ${payload.brief_date}`,
    action_url: `/briefs/${payload.brief_id}`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      brief_id: payload.brief_id,
      brief_date: payload.brief_date,
      timezone: payload.timezone,
    },
  };
}

/**
 * Transform brief.failed event payload
 */
function transformBriefFailed(
  payload: BriefFailedEventPayload,
): NotificationPayload {
  return {
    title: "Daily Brief Generation Failed",
    body: `We couldn't generate your brief for ${payload.brief_date}. Our team has been notified.`,
    action_url: "/profile",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      brief_date: payload.brief_date,
      error_message: payload.error_message,
      retry_count: payload.retry_count,
    },
  };
}

/**
 * Transform brain_dump.processed event payload
 */
function transformBrainDumpProcessed(
  payload: BrainDumpProcessedEventPayload,
): NotificationPayload {
  const taskText =
    payload.tasks_created === 1 ? "1 task" : `${payload.tasks_created} tasks`;

  if (payload.project_name) {
    return {
      title: "Brain Dump Processed ✨",
      body: `Created ${taskText} in "${payload.project_name}"`,
      action_url: `/projects/${payload.project_id}`,
      icon_url: "/AppImages/android/android-launchericon-192-192.png",
      data: {
        brain_dump_id: payload.brain_dump_id,
        project_id: payload.project_id,
        tasks_created: payload.tasks_created,
      },
    };
  }

  return {
    title: "Brain Dump Processed ✨",
    body: `Your thoughts have been organized into ${taskText}`,
    action_url: "/projects",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      brain_dump_id: payload.brain_dump_id,
      tasks_created: payload.tasks_created,
    },
  };
}

/**
 * Transform task.due_soon event payload
 */
function transformTaskDueSoon(
  payload: TaskDueSoonEventPayload,
): NotificationPayload {
  const hoursText =
    payload.hours_until_due === 1
      ? "1 hour"
      : `${payload.hours_until_due} hours`;

  return {
    title: `Task Due Soon: ${payload.task_title}`,
    body: `Due in ${hoursText} in ${payload.project_name}`,
    action_url: `/projects/${payload.project_id}#task-${payload.task_id}`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      task_id: payload.task_id,
      project_id: payload.project_id,
      due_date: payload.due_date,
    },
  };
}

/**
 * Transform project.phase_scheduled event payload
 */
function transformProjectPhaseScheduled(
  payload: ProjectPhaseScheduledEventPayload,
): NotificationPayload {
  const taskText =
    payload.task_count === 1 ? "1 task" : `${payload.task_count} tasks`;

  return {
    title: `Phase Scheduled: ${payload.phase_name}`,
    body: `${taskText} scheduled for ${payload.scheduled_date} in ${payload.project_name}`,
    action_url: `/projects/${payload.project_id}#phase-${payload.phase_id}`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      project_id: payload.project_id,
      phase_id: payload.phase_id,
      scheduled_date: payload.scheduled_date,
    },
  };
}

/**
 * Transform calendar.sync_failed event payload
 */
function transformCalendarSyncFailed(
  payload: CalendarSyncFailedEventPayload,
): NotificationPayload {
  return {
    title: "Calendar Sync Failed",
    body: "We couldn't sync with your Google Calendar. Please reconnect.",
    action_url: "/profile",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      calendar_id: payload.calendar_id,
      error_message: payload.error_message,
      sync_attempted_at: payload.sync_attempted_at,
    },
  };
}

/**
 * Transform user.signup event payload (admin notification)
 */
function transformUserSignup(
  payload: UserSignupEventPayload,
): NotificationPayload {
  const methodText =
    payload.signup_method === "google_oauth" ? "Google" : "Email";

  return {
    title: "New User Signup",
    body: `${payload.user_email} signed up via ${methodText}`,
    action_url: `/admin/users/${payload.user_id}`,
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      user_id: payload.user_id,
      user_email: payload.user_email,
      signup_method: payload.signup_method,
    },
  };
}

/**
 * Transform user.trial_expired event payload
 */
function transformTrialExpired(
  payload: Record<string, any>,
): NotificationPayload {
  return {
    title: "Trial Expired",
    body: "Your free trial has ended. Upgrade to continue using BuildOS.",
    action_url: "/profile?tab=billing",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: payload,
  };
}

/**
 * Transform payment.failed event payload
 */
function transformPaymentFailed(
  payload: Record<string, any>,
): NotificationPayload {
  return {
    title: "Payment Failed",
    body: "We couldn't process your payment. Please update your payment method.",
    action_url: "/profile?tab=billing",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: payload,
  };
}

/**
 * Transform error.critical event payload (admin notification)
 */
function transformCriticalError(
  payload: Record<string, any>,
): NotificationPayload {
  return {
    title: "Critical System Error",
    body: payload.error_message || "A critical error occurred in the system.",
    action_url: "/admin/errors",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: payload,
  };
}

// =====================================================
// MAIN TRANSFORMER
// =====================================================

/**
 * Transform an event payload into a notification delivery payload
 *
 * @param eventType - The type of event to transform
 * @param eventPayload - The event-specific payload
 * @returns Notification payload with title and body
 * @throws Error if event type is unknown or transformation fails
 */
export function transformEventPayload(
  eventType: EventType,
  eventPayload: EventPayload,
): NotificationPayload {
  try {
    switch (eventType) {
      case "brief.completed":
        return transformBriefCompleted(
          eventPayload as BriefCompletedEventPayload,
        );

      case "brief.failed":
        return transformBriefFailed(eventPayload as BriefFailedEventPayload);

      case "brain_dump.processed":
        return transformBrainDumpProcessed(
          eventPayload as BrainDumpProcessedEventPayload,
        );

      case "task.due_soon":
        return transformTaskDueSoon(eventPayload as TaskDueSoonEventPayload);

      case "project.phase_scheduled":
        return transformProjectPhaseScheduled(
          eventPayload as ProjectPhaseScheduledEventPayload,
        );

      case "calendar.sync_failed":
        return transformCalendarSyncFailed(
          eventPayload as CalendarSyncFailedEventPayload,
        );

      case "user.signup":
        return transformUserSignup(eventPayload as UserSignupEventPayload);

      case "user.trial_expired":
        return transformTrialExpired(eventPayload);

      case "payment.failed":
        return transformPaymentFailed(eventPayload);

      case "error.critical":
        return transformCriticalError(eventPayload);

      default:
        throw new Error(`No transformer found for event type: ${eventType}`);
    }
  } catch (error) {
    console.error(
      `[PayloadTransformer] Error transforming ${eventType}:`,
      error,
    );
    throw error;
  }
}

/**
 * Transform an event payload into a notification delivery payload (safe version)
 *
 * @param eventType - The type of event to transform
 * @param eventPayload - The event-specific payload
 * @returns Transform result with success flag and payload or error
 */
export function safeTransformEventPayload(
  eventType: EventType,
  eventPayload: EventPayload,
): TransformResult {
  try {
    const payload = transformEventPayload(eventType, eventPayload);
    return { success: true, payload };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown transformation error",
    };
  }
}

/**
 * Validate that a notification payload has required fields
 *
 * @param payload - The notification payload to validate
 * @returns True if valid, false otherwise
 */
export function validateNotificationPayload(
  payload: NotificationPayload,
): boolean {
  return !!(
    payload &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    typeof payload.body === "string" &&
    payload.body.trim().length > 0
  );
}

/**
 * Get a generic fallback notification payload
 *
 * @param eventType - The event type for context
 * @returns Generic notification payload
 */
export function getFallbackPayload(eventType: EventType): NotificationPayload {
  return {
    title: "BuildOS Notification",
    body: `You have a new notification from BuildOS (${eventType})`,
    action_url: "/",
    icon_url: "/AppImages/android/android-launchericon-192-192.png",
    data: {
      event_type: eventType,
    },
  };
}
