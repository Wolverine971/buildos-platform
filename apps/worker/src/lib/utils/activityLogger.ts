// apps/worker/src/lib/utils/activityLogger.ts
import type { Database } from "@buildos/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityType =
  | "login"
  | "logout"
  | "brief_generated"
  | "template_created"
  | "template_updated"
  | "project_created"
  | "project_updated"
  | "project_deleted"
  | "goal_created"
  | "goal_updated"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_completed"
  | "brain_dump_processed"
  | "brain_dump_saved"
  | "brain_dump_processing_started"
  | "brain_dump_processing_completed"
  | "brain_dump_processing_failed"
  | "brain_dump_new_project_completed"
  | "brain_dump_existing_project_completed"
  | "brain_dump_dual_processing_started"
  | "brain_dump_dual_processing_completed"
  | "brain_dump_dual_processing_retry"
  | "brain_dump_execution_started"
  | "brain_dump_execution_completed"
  | "brain_dump_operation"
  | "brain_dump_stream_completed"
  | "brain_dump_process_retry"
  | "onboarding_questions_generated"
  | "note_created"
  | "note_updated"
  | "note_deleted"
  | "admin_action"
  | "project_context_enhancement_failed"
  | "markdown_heading_normalized"
  | string; // Allow custom activity types

interface ActivityData {
  [key: string]: any;
}

export class ActivityLogger {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Log user activity
   */
  async logActivity(
    userId: string,
    activityType: ActivityType,
    activityData?: ActivityData,
    request?: Request,
  ): Promise<void> {
    try {
      const logEntry = {
        user_id: userId,
        activity_type: activityType,
        activity_data: activityData || {},
        ip_address: this.getClientIP(request),
        user_agent: request?.headers.get("user-agent") || null,
      };

      const { error } = await this.supabase
        .from("user_activity_logs")
        .insert(logEntry);

      if (error) {
        console.error("Error logging activity:", error);
      }
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }

  /**
   * Log system metrics
   */
  async logSystemMetric(
    metricName: string,
    metricValue: number,
    metricUnit?: string,
    metricDescription?: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from("system_metrics").upsert(
        {
          metric_name: metricName,
          metric_value: metricValue,
          metric_unit: metricUnit,
          metric_description: metricDescription,
        },
        {
          onConflict: "metric_name", // Specify the column to check for conflicts
        },
      );

      if (error) {
        console.error("Error logging system metric:", error);
      }
    } catch (error) {
      console.error("Failed to log system metric:", error);
    }
  }

  /**
   * Batch log multiple activities (for performance)
   */
  async logActivitiesBatch(
    activities: Array<{
      userId: string;
      activityType: ActivityType;
      activityData?: ActivityData;
      request?: Request;
    }>,
  ): Promise<void> {
    try {
      const logEntries = activities.map((activity) => ({
        user_id: activity.userId,
        activity_type: activity.activityType,
        activity_data: activity.activityData || {},
        ip_address: this.getClientIP(activity.request),
        user_agent: activity.request?.headers.get("user-agent") || null,
      }));

      const { error } = await this.supabase
        .from("user_activity_logs")
        .insert(logEntries);

      if (error) {
        console.error("Error batch logging activities:", error);
      }
    } catch (error) {
      console.error("Failed to batch log activities:", error);
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(
    userId: string,
    days: number = 30,
  ): Promise<{
    total_activities: number;
    activity_breakdown: Record<ActivityType, number>;
    most_active_day: string | null;
    last_activity: string | null;
  }> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { data, error } = await this.supabase
        .from("user_activity_logs")
        .select("activity_type, created_at")
        .eq("user_id", userId)
        .gte("created_at", startDate.toISOString());

      if (error) throw error;

      const activities = data || [];
      const activityBreakdown: Record<string, number> = {};
      const dailyActivity: Record<string, number> = {};

      let lastActivity: string | null = null;

      activities.forEach((activity) => {
        // Count by type
        activityBreakdown[activity.activity_type] =
          (activityBreakdown[activity.activity_type] || 0) + 1;

        // Count by day
        const day = new Date(activity.created_at).toISOString().split("T")[0];
        dailyActivity[day] = (dailyActivity[day] || 0) + 1;

        // Track most recent
        if (!lastActivity || activity.created_at > lastActivity) {
          lastActivity = activity.created_at;
        }
      });

      // Find most active day
      const mostActiveDay =
        Object.entries(dailyActivity).sort(([, a], [, b]) => b - a)[0]?.[0] ||
        null;

      return {
        total_activities: activities.length,
        activity_breakdown: activityBreakdown as Record<ActivityType, number>,
        most_active_day: mostActiveDay,
        last_activity: lastActivity,
      };
    } catch (error) {
      console.error("Error getting user activity summary:", error);
      return {
        total_activities: 0,
        activity_breakdown: {} as Record<ActivityType, number>,
        most_active_day: null,
        last_activity: null,
      };
    }
  }

  /**
   * Update daily analytics aggregations
   */
  async updateDailyAnalytics(
    date: string = new Date().toISOString().split("T")[0],
  ): Promise<void> {
    try {
      // Get daily metrics
      const [activeUsers, totalBriefs, totalLogins] = await Promise.all([
        this.supabase
          .from("user_activity_logs")
          .select("user_id", { count: "exact" })
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59`),

        this.supabase
          .from("daily_briefs")
          .select("*", { count: "exact" })
          .eq("brief_date", date),

        this.supabase
          .from("user_activity_logs")
          .select("*", { count: "exact" })
          .eq("activity_type", "login")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${date}T23:59:59`),
      ]);

      const metrics = [
        {
          date,
          metric_name: "daily_active_users",
          metric_value: new Set(activeUsers.data?.map((log) => log.user_id))
            .size,
          metadata: { source: "activity_logs" },
        },
        {
          date,
          metric_name: "daily_briefs_generated",
          metric_value: totalBriefs.count || 0,
          metadata: { source: "daily_briefs" },
        },
        {
          date,
          metric_name: "daily_logins",
          metric_value: totalLogins.count || 0,
          metadata: { source: "activity_logs" },
        },
      ];

      // Upsert daily analytics
      for (const metric of metrics) {
        await this.supabase
          .from("admin_analytics")
          .upsert(metric, { onConflict: "date,metric_name" });
      }
    } catch (error) {
      console.error("Error updating daily analytics:", error);
    }
  }

  private getClientIP(request?: Request): string | null {
    if (!request) return null;

    // Try various headers for IP address
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }

    const realIP = request.headers.get("x-real-ip");
    if (realIP) return realIP;

    const cfConnectingIP = request.headers.get("cf-connecting-ip");
    if (cfConnectingIP) return cfConnectingIP;

    return null;
  }
}
