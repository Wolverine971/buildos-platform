// apps/worker/src/lib/briefBackoffCalculator.ts
import { supabase } from "./supabase";

export interface BackoffDecision {
  shouldSend: boolean;
  isReengagement: boolean;
  daysSinceLastLogin: number;
  reason: string;
}

interface UserLastVisit {
  last_visit: string | null;
}

interface LastBriefSent {
  brief_date: string;
  generation_completed_at: string | null;
}

/**
 * BriefBackoffCalculator - Pure function calculator for determining
 * whether to send daily briefs based on user engagement.
 *
 * Uses existing database tables (users.last_visit, daily_briefs) with
 * no additional state storage required.
 */
export class BriefBackoffCalculator {
  private readonly BACKOFF_SCHEDULE = {
    COOLING_OFF_DAYS: 2,
    FIRST_REENGAGEMENT: 4,
    SECOND_REENGAGEMENT: 10,
    THIRD_REENGAGEMENT: 31,
    RECURRING_INTERVAL: 31,
  };

  /**
   * Determines if a daily brief should be sent to a user based on their
   * last login and last brief sent.
   */
  public async shouldSendDailyBrief(userId: string): Promise<BackoffDecision> {
    // Fetch user's last visit and last brief sent in parallel
    const [userData, lastBrief] = await Promise.all([
      this.getUserLastVisit(userId),
      this.getLastBriefSent(userId),
    ]);

    if (!userData?.last_visit) {
      // New user or never logged in - send normal brief
      return {
        shouldSend: true,
        isReengagement: false,
        daysSinceLastLogin: 0,
        reason: "No last visit recorded",
      };
    }

    const daysSinceLastLogin = this.calculateDaysSince(userData.last_visit);
    const daysSinceLastBrief = lastBrief
      ? this.calculateDaysSince(
          lastBrief.generation_completed_at || lastBrief.brief_date,
        )
      : 999; // If no brief ever sent, treat as very old

    // Apply backoff logic
    return this.calculateBackoffDecision(
      daysSinceLastLogin,
      daysSinceLastBrief,
    );
  }

  /**
   * Fetch user's last visit timestamp
   */
  private async getUserLastVisit(
    userId: string,
  ): Promise<UserLastVisit | null> {
    const { data, error } = await supabase
      .from("users")
      .select("last_visit")
      .eq("id", userId)
      .single();

    if (error) {
      console.error(
        `Error fetching last visit for user ${userId}:`,
        error.message,
      );
      return null;
    }

    return data;
  }

  /**
   * Fetch the most recent daily brief for a user
   */
  private async getLastBriefSent(
    userId: string,
  ): Promise<LastBriefSent | null> {
    const { data, error } = await supabase
      .from("daily_briefs")
      .select("brief_date, generation_completed_at")
      .eq("user_id", userId)
      .order("brief_date", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No briefs found is not an error, just means first brief
      if (error.code === "PGRST116") {
        return null;
      }
      console.error(
        `Error fetching last brief for user ${userId}:`,
        error.message,
      );
      return null;
    }

    return data;
  }

  /**
   * Calculate the number of days since a given date
   */
  private calculateDaysSince(dateString: string): number {
    return Math.floor(
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  /**
   * Apply backoff logic to determine if brief should be sent
   */
  private calculateBackoffDecision(
    daysSinceLastLogin: number,
    daysSinceLastBrief: number,
  ): BackoffDecision {
    // Days 0-2: Send normal briefs
    if (daysSinceLastLogin <= 2) {
      return {
        shouldSend: true,
        isReengagement: false,
        daysSinceLastLogin,
        reason: "User is active (logged in within 2 days)",
      };
    }

    // Days 2-4: Cooling off period (no emails)
    if (daysSinceLastLogin > 2 && daysSinceLastLogin < 4) {
      return {
        shouldSend: false,
        isReengagement: false,
        daysSinceLastLogin,
        reason: "Cooling off period (3 days inactive)",
      };
    }

    // Day 4: First re-engagement (if we haven't sent recently)
    if (daysSinceLastLogin === 4 && daysSinceLastBrief >= 2) {
      return {
        shouldSend: true,
        isReengagement: true,
        daysSinceLastLogin,
        reason: "4-day re-engagement email",
      };
    }

    // Days 4-10: First backoff
    if (daysSinceLastLogin > 4 && daysSinceLastLogin < 10) {
      return {
        shouldSend: false,
        isReengagement: false,
        daysSinceLastLogin,
        reason: "First backoff period (5-9 days)",
      };
    }

    // Day 10: Second re-engagement (if we haven't sent recently)
    if (daysSinceLastLogin === 10 && daysSinceLastBrief >= 6) {
      return {
        shouldSend: true,
        isReengagement: true,
        daysSinceLastLogin,
        reason: "10-day re-engagement email",
      };
    }

    // Days 10-31: Second backoff
    if (daysSinceLastLogin > 10 && daysSinceLastLogin < 31) {
      return {
        shouldSend: false,
        isReengagement: false,
        daysSinceLastLogin,
        reason: "Second backoff period (11-30 days)",
      };
    }

    // Day 31+: Send every 31 days if we haven't sent recently
    if (daysSinceLastLogin >= 31) {
      // Only send if it's been at least 31 days since last brief
      if (daysSinceLastBrief >= 31) {
        return {
          shouldSend: true,
          isReengagement: true,
          daysSinceLastLogin,
          reason: `31+ day re-engagement (${daysSinceLastLogin} days inactive)`,
        };
      }
      return {
        shouldSend: false,
        isReengagement: false,
        daysSinceLastLogin,
        reason: `Waiting for 31-day interval (last brief ${daysSinceLastBrief} days ago)`,
      };
    }

    // Fallback (shouldn't reach here)
    return {
      shouldSend: false,
      isReengagement: false,
      daysSinceLastLogin,
      reason: "Default: no email",
    };
  }
}
