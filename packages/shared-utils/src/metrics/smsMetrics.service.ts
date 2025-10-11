// packages/sms-metrics/src/smsMetrics.service.ts
/**
 * SMS Metrics Service
 *
 * Tracks operational metrics, performance, quality, and costs for SMS event scheduling.
 * Provides methods to record metrics and query aggregated data for monitoring.
 *
 * Usage:
 *   const metricsService = new SMSMetricsService();
 *   await metricsService.recordScheduled(userId, 5);
 *   await metricsService.recordLLMGeneration(userId, 'llm', 0.0001, 1250);
 *
 * Phase: 6.2 (Monitoring & Metrics)
 */

import { createServiceClient } from "@buildos/supabase-client";
import { format } from "date-fns";

export interface SMSMetrics {
  // Operational metrics
  scheduled_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  cancelled_count: number;

  // Performance metrics
  avg_delivery_time_ms: number;
  avg_generation_time_ms: number;

  // Quality metrics
  llm_success_count: number;
  template_fallback_count: number;
  delivery_success_rate: number;
  llm_success_rate: number;

  // Cost metrics
  llm_cost_usd: number;
  sms_cost_usd: number;

  // User engagement
  opt_out_count: number;
  quiet_hours_skip_count: number;
  daily_limit_hit_count: number;
}

export interface DailyMetricsSummary extends SMSMetrics {
  metric_date: string;
  delivery_rate_percent: number;
  llm_success_rate_percent: number;
  active_users: number;
}

export interface UserMetrics {
  metric_date: string;
  scheduled_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  llm_cost_usd: number;
  delivery_rate: number;
}

export class SMSMetricsService {
  private supabase = createServiceClient();

  /**
   * Record SMS scheduled count for a user
   */
  async recordScheduled(userId: string, count: number = 1): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "scheduled_count",
        p_metric_value: count,
        p_metadata: {},
      });

      console.log(
        `[SMSMetrics] Recorded ${count} scheduled SMS for user ${userId}`,
      );
    } catch (error) {
      console.error("[SMSMetrics] Error recording scheduled count:", error);
      // Non-critical - don't throw
    }
  }

  /**
   * Record SMS sent
   */
  async recordSent(
    userId: string,
    smsMessageId: string,
    twilioSid?: string,
  ): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "sent_count",
        p_metric_value: 1,
        p_metadata: {
          sms_message_id: smsMessageId,
          twilio_sid: twilioSid,
        },
      });

      console.log(`[SMSMetrics] Recorded sent SMS for user ${userId}`);
    } catch (error) {
      console.error("[SMSMetrics] Error recording sent count:", error);
    }
  }

  /**
   * Record SMS delivered with delivery time
   */
  async recordDelivered(
    userId: string,
    smsMessageId: string,
    deliveryTimeMs: number,
  ): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // Record delivered count
      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "delivered_count",
        p_metric_value: 1,
        p_metadata: {
          sms_message_id: smsMessageId,
          delivery_time_ms: deliveryTimeMs,
        },
      });

      // Record average delivery time (will be averaged in materialized view)
      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "avg_delivery_time_ms",
        p_metric_value: deliveryTimeMs,
        p_metadata: {},
      });

      console.log(
        `[SMSMetrics] Recorded delivery for user ${userId} (${deliveryTimeMs}ms)`,
      );
    } catch (error) {
      console.error("[SMSMetrics] Error recording delivery:", error);
    }
  }

  /**
   * Record SMS failed
   */
  async recordFailed(
    userId: string,
    smsMessageId: string,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "failed_count",
        p_metric_value: 1,
        p_metadata: {
          sms_message_id: smsMessageId,
          error_message: errorMessage,
        },
      });

      console.log(`[SMSMetrics] Recorded failed SMS for user ${userId}`);
    } catch (error) {
      console.error("[SMSMetrics] Error recording failed count:", error);
    }
  }

  /**
   * Record SMS cancelled
   */
  async recordCancelled(
    userId: string,
    smsMessageId: string,
    reason?: string,
  ): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "cancelled_count",
        p_metric_value: 1,
        p_metadata: {
          sms_message_id: smsMessageId,
          reason,
        },
      });

      console.log(`[SMSMetrics] Recorded cancelled SMS for user ${userId}`);
    } catch (error) {
      console.error("[SMSMetrics] Error recording cancelled count:", error);
    }
  }

  /**
   * Record LLM message generation
   */
  async recordLLMGeneration(
    userId: string,
    generatedVia: "llm" | "template",
    costUsd?: number,
    generationTimeMs?: number,
  ): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // Record generation method
      const metricType =
        generatedVia === "llm"
          ? "llm_success_count"
          : "template_fallback_count";

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: metricType,
        p_metric_value: 1,
        p_metadata: {},
      });

      // Record LLM cost if available
      if (generatedVia === "llm" && costUsd !== undefined) {
        await (this.supabase.rpc as any)("record_sms_metric", {
          p_metric_date: today,
          p_metric_hour: null,
          p_user_id: userId,
          p_metric_type: "llm_cost_usd",
          p_metric_value: costUsd,
          p_metadata: {},
        });
      }

      // Record generation time if available
      if (generationTimeMs !== undefined) {
        await (this.supabase.rpc as any)("record_sms_metric", {
          p_metric_date: today,
          p_metric_hour: null,
          p_user_id: userId,
          p_metric_type: "avg_generation_time_ms",
          p_metric_value: generationTimeMs,
          p_metadata: {},
        });
      }

      console.log(
        `[SMSMetrics] Recorded ${generatedVia} generation for user ${userId}`,
      );
    } catch (error) {
      console.error("[SMSMetrics] Error recording LLM generation:", error);
    }
  }

  /**
   * Record user opt-out event
   */
  async recordOptOut(userId: string): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "opt_out_count",
        p_metric_value: 1,
        p_metadata: {},
      });

      console.log(`[SMSMetrics] Recorded opt-out for user ${userId}`);
    } catch (error) {
      console.error("[SMSMetrics] Error recording opt-out:", error);
    }
  }

  /**
   * Record quiet hours skip
   */
  async recordQuietHoursSkip(userId: string, count: number = 1): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "quiet_hours_skip_count",
        p_metric_value: count,
        p_metadata: {},
      });

      console.log(
        `[SMSMetrics] Recorded ${count} quiet hours skips for user ${userId}`,
      );
    } catch (error) {
      console.error("[SMSMetrics] Error recording quiet hours skip:", error);
    }
  }

  /**
   * Record daily limit hit
   */
  async recordDailyLimitHit(userId: string): Promise<void> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await (this.supabase.rpc as any)("record_sms_metric", {
        p_metric_date: today,
        p_metric_hour: null,
        p_user_id: userId,
        p_metric_type: "daily_limit_hit_count",
        p_metric_value: 1,
        p_metadata: {},
      });

      console.log(`[SMSMetrics] Recorded daily limit hit for user ${userId}`);
    } catch (error) {
      console.error("[SMSMetrics] Error recording daily limit hit:", error);
    }
  }

  /**
   * Get daily metrics for a date range
   */
  async getDailyMetrics(
    startDate: string,
    endDate?: string,
  ): Promise<DailyMetricsSummary[]> {
    try {
      const { data, error } = await (this.supabase.rpc as any)(
        "get_sms_daily_metrics",
        {
          p_start_date: startDate,
          p_end_date: endDate || startDate,
        },
      );

      if (error) {
        throw error;
      }

      return (data as DailyMetricsSummary[]) || [];
    } catch (error) {
      console.error("[SMSMetrics] Error fetching daily metrics:", error);
      return [];
    }
  }

  /**
   * Get user-specific metrics for a date range
   */
  async getUserMetrics(
    userId: string,
    days: number = 30,
  ): Promise<UserMetrics[]> {
    try {
      const { data, error } = await (this.supabase.rpc as any)(
        "get_user_sms_metrics",
        {
          p_user_id: userId,
          p_days: days,
        },
      );

      if (error) {
        throw error;
      }

      return (data as UserMetrics[]) || [];
    } catch (error) {
      console.error("[SMSMetrics] Error fetching user metrics:", error);
      return [];
    }
  }

  /**
   * Get today's metrics snapshot
   */
  async getTodayMetrics(): Promise<DailyMetricsSummary | null> {
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const metrics = await this.getDailyMetrics(today);

      return metrics.length > 0 ? metrics[0] : null;
    } catch (error) {
      console.error("[SMSMetrics] Error fetching today metrics:", error);
      return null;
    }
  }

  /**
   * Refresh materialized view (call hourly via cron)
   *
   * @deprecated The SMS metrics materialized view was never created in the database.
   * TODO: Create migration file apps/web/supabase/migrations/20251008_sms_metrics_monitoring.sql
   * to implement the full SMS metrics infrastructure including:
   * - sms_metrics table
   * - sms_metrics_daily materialized view
   * - refresh_sms_metrics_daily() RPC function
   * - sms_alert_thresholds table
   * - sms_alert_history table
   *
   * For now, this method does nothing to avoid calling non-existent database function.
   */
  async refreshMaterializedView(): Promise<void> {
    console.warn(
      "[SMSMetrics] refreshMaterializedView() called but SMS metrics infrastructure not yet implemented. Skipping."
    );
    // Commented out until migration is applied:
    // try {
    //   const { error } = await (this.supabase.rpc as any)(
    //     "refresh_sms_metrics_daily",
    //   );
    //
    //   if (error) {
    //     throw error;
    //   }
    //
    //   console.log("[SMSMetrics] Materialized view refreshed successfully");
    // } catch (error) {
    //   console.error("[SMSMetrics] Error refreshing materialized view:", error);
    // }
  }

  /**
   * Calculate delivery success rate for a user
   */
  async calculateDeliveryRate(
    userId: string,
    days: number = 7,
  ): Promise<number> {
    try {
      const metrics = await this.getUserMetrics(userId, days);

      const totalSent = metrics.reduce(
        (sum, m) => sum + (m.sent_count || 0),
        0,
      );
      const totalDelivered = metrics.reduce(
        (sum, m) => sum + (m.delivered_count || 0),
        0,
      );

      if (totalSent === 0) return 0;

      return (totalDelivered / totalSent) * 100;
    } catch (error) {
      console.error("[SMSMetrics] Error calculating delivery rate:", error);
      return 0;
    }
  }

  /**
   * Calculate LLM success rate for a user
   */
  async calculateLLMSuccessRate(
    userId: string,
    days: number = 7,
  ): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from("sms_metrics" as any)
        .select("metric_type, metric_value")
        .eq("user_id", userId)
        .gte(
          "metric_date",
          format(
            new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            "yyyy-MM-dd",
          ),
        )
        .in("metric_type", ["llm_success_count", "template_fallback_count"]);

      if (error) {
        throw error;
      }

      const metrics = (data || []) as unknown as Array<{
        metric_type: string;
        metric_value: number;
      }>;

      const llmSuccessCount = metrics
        .filter((m) => m.metric_type === "llm_success_count")
        .reduce((sum, m) => sum + Number(m.metric_value), 0);

      const templateFallbackCount = metrics
        .filter((m) => m.metric_type === "template_fallback_count")
        .reduce((sum, m) => sum + Number(m.metric_value), 0);

      const totalGenerations = llmSuccessCount + templateFallbackCount;

      if (totalGenerations === 0) return 0;

      return (llmSuccessCount / totalGenerations) * 100;
    } catch (error) {
      console.error("[SMSMetrics] Error calculating LLM success rate:", error);
      return 0;
    }
  }

  /**
   * Get average LLM cost per user per day
   */
  async getAvgLLMCostPerUser(days: number = 30): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from("sms_metrics" as any)
        .select("user_id, metric_value")
        .eq("metric_type", "llm_cost_usd")
        .gte(
          "metric_date",
          format(
            new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            "yyyy-MM-dd",
          ),
        );

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) return 0;

      const costMetrics = data as unknown as Array<{
        user_id: string;
        metric_value: number;
      }>;

      const totalCost = costMetrics.reduce(
        (sum, m) => sum + Number(m.metric_value),
        0,
      );
      const uniqueUsers = new Set(costMetrics.map((m) => m.user_id)).size;

      if (uniqueUsers === 0) return 0;

      return totalCost / uniqueUsers / days;
    } catch (error) {
      console.error(
        "[SMSMetrics] Error calculating avg LLM cost per user:",
        error,
      );
      return 0;
    }
  }
}

// Lazy singleton instance (created on first access)
let smsMetricsServiceInstance: SMSMetricsService | null = null;

export const smsMetricsService = {
  get instance(): SMSMetricsService {
    if (!smsMetricsServiceInstance) {
      smsMetricsServiceInstance = new SMSMetricsService();
    }
    return smsMetricsServiceInstance;
  },
  // Proxy all methods for backward compatibility
  recordScheduled: (
    ...args: Parameters<SMSMetricsService["recordScheduled"]>
  ) => smsMetricsService.instance.recordScheduled(...args),
  recordSent: (...args: Parameters<SMSMetricsService["recordSent"]>) =>
    smsMetricsService.instance.recordSent(...args),
  recordDelivered: (
    ...args: Parameters<SMSMetricsService["recordDelivered"]>
  ) => smsMetricsService.instance.recordDelivered(...args),
  recordFailed: (...args: Parameters<SMSMetricsService["recordFailed"]>) =>
    smsMetricsService.instance.recordFailed(...args),
  recordCancelled: (
    ...args: Parameters<SMSMetricsService["recordCancelled"]>
  ) => smsMetricsService.instance.recordCancelled(...args),
  recordLLMGeneration: (
    ...args: Parameters<SMSMetricsService["recordLLMGeneration"]>
  ) => smsMetricsService.instance.recordLLMGeneration(...args),
  recordOptOut: (...args: Parameters<SMSMetricsService["recordOptOut"]>) =>
    smsMetricsService.instance.recordOptOut(...args),
  recordQuietHoursSkip: (
    ...args: Parameters<SMSMetricsService["recordQuietHoursSkip"]>
  ) => smsMetricsService.instance.recordQuietHoursSkip(...args),
  recordDailyLimitHit: (
    ...args: Parameters<SMSMetricsService["recordDailyLimitHit"]>
  ) => smsMetricsService.instance.recordDailyLimitHit(...args),
  getDailyMetrics: (
    ...args: Parameters<SMSMetricsService["getDailyMetrics"]>
  ) => smsMetricsService.instance.getDailyMetrics(...args),
  getUserMetrics: (...args: Parameters<SMSMetricsService["getUserMetrics"]>) =>
    smsMetricsService.instance.getUserMetrics(...args),
  getTodayMetrics: (
    ...args: Parameters<SMSMetricsService["getTodayMetrics"]>
  ) => smsMetricsService.instance.getTodayMetrics(...args),
  /**
   * @deprecated SMS metrics infrastructure not yet implemented. See SMSMetricsService.refreshMaterializedView()
   */
  refreshMaterializedView: (
    ...args: Parameters<SMSMetricsService["refreshMaterializedView"]>
  ) => smsMetricsService.instance.refreshMaterializedView(...args),
  calculateDeliveryRate: (
    ...args: Parameters<SMSMetricsService["calculateDeliveryRate"]>
  ) => smsMetricsService.instance.calculateDeliveryRate(...args),
  calculateLLMSuccessRate: (
    ...args: Parameters<SMSMetricsService["calculateLLMSuccessRate"]>
  ) => smsMetricsService.instance.calculateLLMSuccessRate(...args),
  getAvgLLMCostPerUser: (
    ...args: Parameters<SMSMetricsService["getAvgLLMCostPerUser"]>
  ) => smsMetricsService.instance.getAvgLLMCostPerUser(...args),
};
