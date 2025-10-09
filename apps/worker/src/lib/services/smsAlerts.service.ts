// apps/worker/src/lib/services/smsAlerts.service.ts
/**
 * SMS Alerts Service
 *
 * Monitors SMS metrics and triggers alerts when thresholds are exceeded.
 * Sends notifications to Slack, PagerDuty, or email based on severity.
 *
 * Usage:
 *   const alertsService = new SMSAlertsService();
 *   await alertsService.checkAlerts(); // Run hourly via cron
 *
 * Phase: 6.2 (Monitoring & Metrics)
 */

import { supabase } from "../supabase";
import { SMSMetricsService } from "./smsMetrics.service";
import { format } from "date-fns";

export interface AlertThreshold {
  id: string;
  alert_type: string;
  threshold_value: number;
  comparison_operator: "<" | ">" | "<=" | ">=" | "=";
  severity: "critical" | "warning" | "info";
  notification_channel: "pagerduty" | "slack" | "email";
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

export interface Alert {
  alert_type: string;
  severity: string;
  metric_value: number;
  threshold_value: number;
  message: string;
  notification_channel: string;
}

export class SMSAlertsService {
  private metricsService: SMSMetricsService;

  constructor() {
    this.metricsService = new SMSMetricsService();
  }

  /**
   * Check all enabled alerts and trigger notifications if thresholds are exceeded
   */
  async checkAlerts(): Promise<Alert[]> {
    console.log("[SMSAlerts] Starting alert check...");

    try {
      // Get today's metrics
      const todayMetrics = await this.metricsService.getTodayMetrics();

      if (!todayMetrics) {
        console.log("[SMSAlerts] No metrics available for today");
        return [];
      }

      // Get all enabled alert thresholds
      const thresholds = await this.getEnabledThresholds();

      const triggeredAlerts: Alert[] = [];

      for (const threshold of thresholds) {
        // Check if alert is in cooldown
        if (this.isInCooldown(threshold)) {
          console.log(
            `[SMSAlerts] Alert ${threshold.alert_type} is in cooldown, skipping`,
          );
          continue;
        }

        // Check if threshold is exceeded
        const alert = await this.checkThreshold(threshold, todayMetrics);

        if (alert) {
          triggeredAlerts.push(alert);

          // Send notification
          await this.sendNotification(alert);

          // Record alert in history
          await this.recordAlert(alert);

          // Update last_triggered_at
          await this.updateLastTriggered(threshold.id);
        }
      }

      if (triggeredAlerts.length > 0) {
        console.log(`[SMSAlerts] ${triggeredAlerts.length} alert(s) triggered`);
      } else {
        console.log("[SMSAlerts] No alerts triggered");
      }

      return triggeredAlerts;
    } catch (error) {
      console.error("[SMSAlerts] Error checking alerts:", error);
      return [];
    }
  }

  /**
   * Check a specific threshold against current metrics
   */
  private async checkThreshold(
    threshold: AlertThreshold,
    metrics: any,
  ): Promise<Alert | null> {
    let metricValue: number | null = null;
    let message: string = "";

    switch (threshold.alert_type) {
      case "delivery_rate_critical":
        metricValue = metrics.delivery_rate_percent || 0;
        if (
          this.compareValues(
            metricValue,
            threshold.threshold_value,
            threshold.comparison_operator,
          )
        ) {
          message = `SMS delivery rate is ${metricValue.toFixed(1)}% (threshold: ${threshold.threshold_value}%)`;
        }
        break;

      case "llm_failure_critical":
        const llmTotal =
          (metrics.llm_success_count || 0) +
          (metrics.template_fallback_count || 0);
        const llmFailureRate =
          llmTotal > 0
            ? ((metrics.template_fallback_count || 0) / llmTotal) * 100
            : 0;
        metricValue = llmFailureRate;
        if (
          this.compareValues(
            metricValue,
            threshold.threshold_value,
            threshold.comparison_operator,
          )
        ) {
          message = `LLM failure rate is ${metricValue.toFixed(1)}% (threshold: ${threshold.threshold_value}%)`;
        }
        break;

      case "llm_cost_spike_warning":
        const avgCost = await this.metricsService.getAvgLLMCostPerUser(30);
        const todayCost =
          (metrics.llm_cost_usd || 0) / (metrics.active_users || 1);
        const costMultiplier = avgCost > 0 ? todayCost / avgCost : 0;
        metricValue = costMultiplier;
        if (
          this.compareValues(
            metricValue,
            threshold.threshold_value,
            threshold.comparison_operator,
          )
        ) {
          message = `LLM cost is ${costMultiplier.toFixed(2)}x the 30-day average (today: $${todayCost.toFixed(4)}, avg: $${avgCost.toFixed(4)})`;
        }
        break;

      case "opt_out_rate_warning":
        const optOutRate =
          metrics.active_users > 0
            ? ((metrics.opt_out_count || 0) / metrics.active_users) * 100
            : 0;
        metricValue = optOutRate;
        if (
          this.compareValues(
            metricValue,
            threshold.threshold_value,
            threshold.comparison_operator,
          )
        ) {
          message = `Opt-out rate is ${metricValue.toFixed(1)}% (${metrics.opt_out_count} of ${metrics.active_users} users)`;
        }
        break;

      case "daily_limit_hit_warning":
        const limitHitRate =
          metrics.active_users > 0
            ? ((metrics.daily_limit_hit_count || 0) / metrics.active_users) *
              100
            : 0;
        metricValue = limitHitRate;
        if (
          this.compareValues(
            metricValue,
            threshold.threshold_value,
            threshold.comparison_operator,
          )
        ) {
          message = `Daily limit hit rate is ${metricValue.toFixed(1)}% (${metrics.daily_limit_hit_count} of ${metrics.active_users} users)`;
        }
        break;

      default:
        console.warn(`[SMSAlerts] Unknown alert type: ${threshold.alert_type}`);
        return null;
    }

    if (message && metricValue !== null) {
      return {
        alert_type: threshold.alert_type,
        severity: threshold.severity,
        metric_value: metricValue,
        threshold_value: threshold.threshold_value,
        message,
        notification_channel: threshold.notification_channel,
      };
    }

    return null;
  }

  /**
   * Compare metric value against threshold
   */
  private compareValues(
    metricValue: number,
    thresholdValue: number,
    operator: string,
  ): boolean {
    switch (operator) {
      case "<":
        return metricValue < thresholdValue;
      case ">":
        return metricValue > thresholdValue;
      case "<=":
        return metricValue <= thresholdValue;
      case ">=":
        return metricValue >= thresholdValue;
      case "=":
        return metricValue === thresholdValue;
      default:
        return false;
    }
  }

  /**
   * Check if alert is in cooldown period
   */
  private isInCooldown(threshold: AlertThreshold): boolean {
    if (!threshold.last_triggered_at) return false;

    const lastTriggered = new Date(threshold.last_triggered_at);
    const cooldownEnd = new Date(
      lastTriggered.getTime() + threshold.cooldown_minutes * 60 * 1000,
    );

    return new Date() < cooldownEnd;
  }

  /**
   * Get all enabled alert thresholds
   */
  private async getEnabledThresholds(): Promise<AlertThreshold[]> {
    try {
      const { data, error } = await supabase
        .from("sms_alert_thresholds")
        .select("*")
        .eq("enabled", true);

      if (error) {
        throw error;
      }

      return (data as AlertThreshold[]) || [];
    } catch (error) {
      console.error("[SMSAlerts] Error fetching thresholds:", error);
      return [];
    }
  }

  /**
   * Send notification via appropriate channel
   */
  private async sendNotification(alert: Alert): Promise<void> {
    try {
      switch (alert.notification_channel) {
        case "slack":
          await this.sendSlackNotification(alert);
          break;

        case "pagerduty":
          await this.sendPagerDutyNotification(alert);
          break;

        case "email":
          await this.sendEmailNotification(alert);
          break;

        default:
          console.warn(
            `[SMSAlerts] Unknown notification channel: ${alert.notification_channel}`,
          );
      }
    } catch (error) {
      console.error("[SMSAlerts] Error sending notification:", error);
    }
  }

  /**
   * Send Slack notification
   *
   * NOTE: Currently commented out - configure SLACK_WEBHOOK_URL to enable
   */
  private async sendSlackNotification(alert: Alert): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      console.log(
        "[SMSAlerts] SLACK_WEBHOOK_URL not configured, skipping Slack notification",
      );
      console.log("[SMSAlerts] Would have sent Slack alert:", {
        type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
      });
      return;
    }

    // COMMENTED OUT: Slack integration
    // Uncomment when SLACK_WEBHOOK_URL is configured
    /*
    try {
      const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
      const color = alert.severity === 'critical' ? '#ff0000' : '#ffa500';

      const message = {
        text: `${emoji} SMS Alert: ${alert.alert_type}`,
        attachments: [
          {
            color,
            title: alert.message,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true,
              },
              {
                title: 'Metric Value',
                value: alert.metric_value.toFixed(2),
                short: true,
              },
              {
                title: 'Threshold',
                value: alert.threshold_value.toFixed(2),
                short: true,
              },
              {
                title: 'Alert Type',
                value: alert.alert_type,
                short: true,
              },
            ],
            footer: 'BuildOS SMS Monitoring',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}`);
      }

      console.log('[SMSAlerts] Slack notification sent successfully');
    } catch (error) {
      console.error('[SMSAlerts] Error sending Slack notification:', error);
      throw error;
    }
    */

    console.log(
      "[SMSAlerts] Slack notification skipped (integration commented out)",
    );
  }

  /**
   * Send PagerDuty notification
   *
   * NOTE: Currently commented out - configure PAGERDUTY_INTEGRATION_KEY to enable
   */
  private async sendPagerDutyNotification(alert: Alert): Promise<void> {
    const integrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;

    if (!integrationKey) {
      console.log(
        "[SMSAlerts] PAGERDUTY_INTEGRATION_KEY not configured, skipping PagerDuty notification",
      );
      console.log("[SMSAlerts] Would have sent PagerDuty alert:", {
        type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
      });
      return;
    }

    // COMMENTED OUT: PagerDuty integration
    // Uncomment when PAGERDUTY_INTEGRATION_KEY is configured
    /*
    try {
      const payload = {
        routing_key: integrationKey,
        event_action: 'trigger',
        payload: {
          summary: alert.message,
          severity: alert.severity,
          source: 'buildos-sms-monitoring',
          custom_details: {
            alert_type: alert.alert_type,
            metric_value: alert.metric_value,
            threshold_value: alert.threshold_value,
          },
        },
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API returned ${response.status}`);
      }

      console.log('[SMSAlerts] PagerDuty notification sent successfully');
    } catch (error) {
      console.error('[SMSAlerts] Error sending PagerDuty notification:', error);
      throw error;
    }
    */

    console.log(
      "[SMSAlerts] PagerDuty notification skipped (integration commented out)",
    );
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Alert): Promise<void> {
    // TODO: Implement email notification via existing email service
    console.log("[SMSAlerts] Email notification not yet implemented");
  }

  /**
   * Record alert in history
   */
  private async recordAlert(alert: Alert): Promise<void> {
    try {
      const { error } = await supabase.from("sms_alert_history").insert({
        alert_type: alert.alert_type,
        severity: alert.severity,
        metric_value: alert.metric_value,
        threshold_value: alert.threshold_value,
        message: alert.message,
        notification_channel: alert.notification_channel,
        notification_sent: true,
        triggered_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      console.log(`[SMSAlerts] Alert recorded in history: ${alert.alert_type}`);
    } catch (error) {
      console.error("[SMSAlerts] Error recording alert:", error);
    }
  }

  /**
   * Update last_triggered_at timestamp
   */
  private async updateLastTriggered(thresholdId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("sms_alert_thresholds")
        .update({ last_triggered_at: new Date().toISOString() })
        .eq("id", thresholdId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[SMSAlerts] Error updating last_triggered_at:", error);
    }
  }

  /**
   * Resolve an alert (mark as resolved in history)
   */
  async resolveAlert(alertId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("sms_alert_history")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", alertId)
        .is("resolved_at", null);

      if (error) {
        throw error;
      }

      console.log(`[SMSAlerts] Alert ${alertId} resolved`);
    } catch (error) {
      console.error("[SMSAlerts] Error resolving alert:", error);
    }
  }

  /**
   * Get recent unresolved alerts
   */
  async getUnresolvedAlerts(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("sms_alert_history")
        .select("*")
        .is("resolved_at", null)
        .order("triggered_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("[SMSAlerts] Error fetching unresolved alerts:", error);
      return [];
    }
  }

  /**
   * Get alert history for a date range
   */
  async getAlertHistory(
    startDate: string,
    endDate?: string,
    limit: number = 100,
  ): Promise<any[]> {
    try {
      let query = supabase
        .from("sms_alert_history")
        .select("*")
        .gte("triggered_at", startDate);

      if (endDate) {
        query = query.lte("triggered_at", endDate);
      }

      const { data, error } = await query
        .order("triggered_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("[SMSAlerts] Error fetching alert history:", error);
      return [];
    }
  }
}

// Export singleton instance
export const smsAlertsService = new SMSAlertsService();
