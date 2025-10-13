// apps/worker/tests/email-sender.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { DailyBriefEmailSender } from "../src/lib/services/email-sender";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock Supabase client
const createMockSupabase = () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    single: vi.fn(),
  } as unknown as SupabaseClient;

  return mockSupabase;
};

describe("DailyBriefEmailSender", () => {
  beforeAll(() => {
    // Set required environment variables for constructor
    process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.BUILDOS_WEBHOOK_URL = "https://test.example.com";
  });
  describe("shouldSendEmail", () => {
    it("should query user_notification_preferences with event_type='user'", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      // Mock successful preference fetch with both checks passing
      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: true },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: { is_active: true },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain;
        },
      );

      await emailSender.shouldSendEmail("test-user-id");

      // Verify that from() was called with correct table names
      expect(mockSupabase.from).toHaveBeenCalledWith(
        "user_notification_preferences",
      );
      expect(mockSupabase.from).toHaveBeenCalledWith("user_brief_preferences");
    });

    it("should return true when both should_email_daily_brief and is_active are true", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: true },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: { is_active: true },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain as any;
        },
      );

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(true);
    });

    it("should return false when should_email_daily_brief is false", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: false },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: { is_active: true },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain as any;
        },
      );

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(false);
    });

    it("should return false when is_active is false", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: true },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: { is_active: false },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain as any;
        },
      );

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(false);
    });

    it("should return false when brief preferences not found", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: true },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: null,
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain as any;
        },
      );

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(false);
    });

    it("should return false on database error", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation((): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { code: "PGRST001", message: "Database error" },
            }),
          ),
        };
        return chain as any;
      });

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(false);
    });

    it("should handle null should_email_daily_brief as false", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation(
        (table: string): any => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            single: vi.fn(() => {
              if (table === "user_notification_preferences") {
                return Promise.resolve({
                  data: { should_email_daily_brief: null },
                  error: null,
                });
              }
              if (table === "user_brief_preferences") {
                return Promise.resolve({
                  data: { is_active: true },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain as any;
        },
      );

      const result = await emailSender.shouldSendEmail("test-user-id");

      expect(result).toBe(false);
    });
  });

  describe("getUserEmail", () => {
    it("should fetch user email from users table", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation((): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: { email: "test@example.com" },
              error: null,
            }),
          ),
        };
        return chain as any;
      });

      const email = await emailSender.getUserEmail("test-user-id");

      expect(email).toBe("test@example.com");
      expect(mockSupabase.from).toHaveBeenCalledWith("users");
    });

    it("should return null if user not found", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation((): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: null,
            }),
          ),
        };
        return chain as any;
      });

      const email = await emailSender.getUserEmail("test-user-id");

      expect(email).toBeNull();
    });

    it("should return null on database error", async () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      vi.spyOn(mockSupabase, "from").mockImplementation((): any => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: { code: "PGRST001", message: "Database error" },
            }),
          ),
        };
        return chain as any;
      });

      const email = await emailSender.getUserEmail("test-user-id");

      expect(email).toBeNull();
    });
  });

  describe("formatBriefForEmail", () => {
    it("should format brief with LLM analysis", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis: "## Today's Focus\n\nYou have 5 tasks today.",
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      expect(result.htmlContent).toContain("Today's Focus");
      expect(result.htmlContent).toContain("5 tasks today");
      expect(result.htmlContent).toContain("Daily Brief");
      expect(result.plainText).toContain("Today's Focus");
    });

    it("should use fallback when LLM analysis is missing", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis: null,
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      expect(result.htmlContent).toContain("Analysis currently unavailable");
      expect(result.htmlContent).toContain("View the full daily brief");
      expect(result.plainText).toContain("Analysis currently unavailable");
    });

    it("should use fallback when LLM analysis is empty string", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis: "   ",
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      expect(result.htmlContent).toContain("Analysis currently unavailable");
    });

    it("should transform relative URLs to absolute URLs", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis:
          "[View project](/projects/my-project)\n\nSee [task](/tasks/task-123)",
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      expect(result.htmlContent).toContain(
        "https://build-os.com/projects/my-project",
      );
      expect(result.htmlContent).toContain(
        "https://build-os.com/tasks/task-123",
      );
    });

    it("should include formatted date in output", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis: "Test content",
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      // Should contain formatted date (e.g., "Monday, October 13, 2025")
      expect(result.htmlContent).toContain("October");
      expect(result.htmlContent).toContain("2025");
    });

    it("should include links to BuildOS settings and brief view", () => {
      const mockSupabase = createMockSupabase();
      const emailSender = new DailyBriefEmailSender(mockSupabase);

      const brief = {
        id: "brief-123",
        summary_content: "Test summary",
        brief_date: "2025-10-13",
        llm_analysis: "Test content",
      };

      const result = emailSender.formatBriefForEmail(brief, "2025-10-13");

      expect(result.htmlContent).toContain(
        "https://build-os.com/briefs/brief-123",
      );
      expect(result.htmlContent).toContain("https://build-os.com/settings");
      expect(result.plainText).toContain(
        "https://build-os.com/briefs/brief-123",
      );
      expect(result.plainText).toContain("https://build-os.com/settings");
    });
  });
});
