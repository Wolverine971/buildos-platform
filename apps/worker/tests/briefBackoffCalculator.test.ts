// tests/briefBackoffCalculator.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase before importing the calculator
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { BriefBackoffCalculator } from "../src/lib/briefBackoffCalculator";
import { supabase } from "../src/lib/supabase";

const mockSupabase = supabase as any;

describe("BriefBackoffCalculator", () => {
  let calculator: BriefBackoffCalculator;

  beforeEach(() => {
    vi.clearAllMocks();
    calculator = new BriefBackoffCalculator();
  });

  /**
   * Helper to mock user last visit data
   */
  function mockUserLastVisit(daysAgo: number | null) {
    const lastVisit =
      daysAgo !== null
        ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
        : null;

    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { last_visit: lastVisit },
        error: null,
      }),
    });
  }

  /**
   * Helper to mock last brief sent
   */
  function mockLastBriefSent(daysAgo: number | null) {
    if (daysAgo === null) {
      // No brief found
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" }, // No rows found
        }),
      });
    } else {
      const briefDate = new Date(
        Date.now() - daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString();

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            brief_date: briefDate.split("T")[0],
            generation_completed_at: briefDate,
          },
          error: null,
        }),
      });
    }
  }

  describe("Active users (0-2 days inactive)", () => {
    it("should send normal briefs for users who logged in today", async () => {
      mockUserLastVisit(0);
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("User is active (logged in within 2 days)");
    });

    it("should send normal briefs for users who logged in 1 day ago", async () => {
      mockUserLastVisit(1);
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("User is active (logged in within 2 days)");
    });

    it("should send normal briefs for users who logged in 2 days ago", async () => {
      mockUserLastVisit(2);
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("User is active (logged in within 2 days)");
    });
  });

  describe("Cooling off period (3 days inactive)", () => {
    it("should skip briefs during 3-day cooling off period", async () => {
      mockUserLastVisit(3);
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("Cooling off period (3 days inactive)");
    });
  });

  describe("4-day re-engagement", () => {
    it("should send re-engagement email on day 4 if last brief was 2+ days ago", async () => {
      mockUserLastVisit(4);
      mockLastBriefSent(2);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(true);
      expect(result.daysSinceLastLogin).toBe(4);
      expect(result.reason).toBe("4-day re-engagement email");
    });

    it("should NOT send on day 4 if brief was sent recently (less than 2 days)", async () => {
      mockUserLastVisit(4);
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.isReengagement).toBe(false);
    });
  });

  describe("First backoff period (5-9 days)", () => {
    it("should skip briefs during first backoff (day 5)", async () => {
      mockUserLastVisit(5);
      mockLastBriefSent(3);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("First backoff period (5-9 days)");
    });

    it("should skip briefs during first backoff (day 9)", async () => {
      mockUserLastVisit(9);
      mockLastBriefSent(7);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("First backoff period (5-9 days)");
    });
  });

  describe("10-day re-engagement", () => {
    it("should send re-engagement email on day 10 if last brief was 6+ days ago", async () => {
      mockUserLastVisit(10);
      mockLastBriefSent(6);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(true);
      expect(result.daysSinceLastLogin).toBe(10);
      expect(result.reason).toBe("10-day re-engagement email");
    });

    it("should NOT send on day 10 if brief was sent recently (less than 6 days)", async () => {
      mockUserLastVisit(10);
      mockLastBriefSent(5);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.isReengagement).toBe(false);
    });
  });

  describe("Second backoff period (11-30 days)", () => {
    it("should skip briefs during second backoff (day 15)", async () => {
      mockUserLastVisit(15);
      mockLastBriefSent(10);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("Second backoff period (11-30 days)");
    });

    it("should skip briefs during second backoff (day 30)", async () => {
      mockUserLastVisit(30);
      mockLastBriefSent(20);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("Second backoff period (11-30 days)");
    });
  });

  describe("31+ day re-engagement (recurring)", () => {
    it("should send re-engagement email on day 31+ if last brief was 31+ days ago", async () => {
      mockUserLastVisit(31);
      mockLastBriefSent(31);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(true);
      expect(result.daysSinceLastLogin).toBe(31);
      expect(result.reason).toContain("31+ day re-engagement");
    });

    it("should send re-engagement for very inactive users (60 days) if 31+ days since last brief", async () => {
      mockUserLastVisit(60);
      mockLastBriefSent(31);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(true);
      expect(result.daysSinceLastLogin).toBe(60);
    });

    it("should NOT send if last brief was sent less than 31 days ago", async () => {
      mockUserLastVisit(35);
      mockLastBriefSent(20);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(false);
      expect(result.reason).toContain("Waiting for 31-day interval");
    });
  });

  describe("Edge cases", () => {
    it("should send normal brief for new users with no last_visit", async () => {
      mockUserLastVisit(null);
      mockLastBriefSent(null);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.daysSinceLastLogin).toBe(0);
      expect(result.reason).toBe("No last visit recorded");
    });

    it("should handle users with no briefs ever sent", async () => {
      mockUserLastVisit(5);
      mockLastBriefSent(null);

      const result = await calculator.shouldSendDailyBrief("user-1");

      // Should be in first backoff period based on 5 days inactive
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("First backoff period (5-9 days)");
    });

    it("should handle database errors gracefully (null last_visit)", async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      });
      mockLastBriefSent(1);

      const result = await calculator.shouldSendDailyBrief("user-1");

      // Should treat as new user
      expect(result.shouldSend).toBe(true);
      expect(result.reason).toBe("No last visit recorded");
    });
  });

  describe("Automatic reset on user activity", () => {
    it("should resume normal briefs when inactive user returns (was at day 10, now at day 1)", async () => {
      mockUserLastVisit(1);
      mockLastBriefSent(10);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("User is active (logged in within 2 days)");
    });

    it("should resume normal briefs when long-inactive user returns (was at day 45, now at day 0)", async () => {
      mockUserLastVisit(0);
      mockLastBriefSent(45);

      const result = await calculator.shouldSendDailyBrief("user-1");

      expect(result.shouldSend).toBe(true);
      expect(result.isReengagement).toBe(false);
      expect(result.reason).toBe("User is active (logged in within 2 days)");
    });
  });
});
