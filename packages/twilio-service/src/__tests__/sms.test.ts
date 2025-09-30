// packages/twilio-service/src/__tests__/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SMSService } from "../services/sms.service";
import { TwilioClient } from "../client";

vi.mock("../client");

describe("SMS Service", () => {
  let smsService: SMSService;
  let mockTwilioClient: any;
  let mockSupabase: any;

  beforeEach(() => {
    mockTwilioClient = {
      sendSMS: vi.fn().mockResolvedValue({ sid: "test-sid" }),
    };

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "template-id",
          message_template: "Test {{name}}",
          usage_count: 0,
        },
      }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    // Mock the select().single() chain for insert
    mockSupabase.select = vi.fn().mockReturnThis();
    mockSupabase.single = vi.fn().mockResolvedValue({
      data: {
        id: "message-id",
        user_id: "user-123",
        phone_number: "+15551234567",
      },
    });

    smsService = new SMSService(mockTwilioClient, mockSupabase);
  });

  it("should send task reminder SMS", async () => {
    const params = {
      userId: "user-123",
      phoneNumber: "+15551234567",
      taskName: "Complete report",
      dueDate: new Date(Date.now() + 3600000), // 1 hour from now
    };

    // Mock user preferences check
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        phone_verified: true,
        task_reminders: true,
        opted_out: false,
        quiet_hours_start: "21:00",
        quiet_hours_end: "08:00",
        daily_sms_limit: 10,
        daily_sms_count: 0,
      },
    });

    const result = await smsService.sendTaskReminder(params);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("message-id");
    expect(mockTwilioClient.sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551234567",
        body: expect.stringContaining("Complete report"),
      }),
    );
  });

  it("should not send SMS if user has opted out", async () => {
    const params = {
      userId: "user-123",
      phoneNumber: "+15551234567",
      taskName: "Complete report",
      dueDate: new Date(Date.now() + 3600000),
    };

    // Mock user preferences with opted_out = true
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        phone_verified: true,
        task_reminders: true,
        opted_out: true,
      },
    });

    await expect(smsService.sendTaskReminder(params)).rejects.toThrow(
      "User has disabled task reminder SMS",
    );
  });

  it("should format relative time correctly", async () => {
    const params = {
      userId: "user-123",
      phoneNumber: "+15551234567",
      taskName: "Test task",
      dueDate: new Date(Date.now() + 30 * 60000), // 30 minutes from now
    };

    // Mock user preferences
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        phone_verified: true,
        task_reminders: true,
        opted_out: false,
        quiet_hours_start: "21:00",
        quiet_hours_end: "08:00",
        daily_sms_limit: 10,
        daily_sms_count: 0,
      },
    });

    await smsService.sendTaskReminder(params);

    expect(mockTwilioClient.sendSMS).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("in 30 minutes"),
      }),
    );
  });

  it("should calculate priority correctly", async () => {
    const testCases = [
      { hours: 0.5, expected: "urgent" }, // 30 minutes
      { hours: 12, expected: "high" }, // 12 hours
      { hours: 48, expected: "normal" }, // 2 days
      { hours: 96, expected: "low" }, // 4 days
    ];

    for (const testCase of testCases) {
      beforeEach(); // Reset mocks

      const params = {
        userId: "user-123",
        phoneNumber: "+15551234567",
        taskName: "Test task",
        dueDate: new Date(Date.now() + testCase.hours * 3600000),
      };

      // Mock user preferences
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          phone_verified: true,
          task_reminders: true,
          opted_out: false,
          quiet_hours_start: "21:00",
          quiet_hours_end: "08:00",
          daily_sms_limit: 10,
          daily_sms_count: 0,
        },
      });

      await smsService.sendTaskReminder(params);

      // Check that the insert was called with the correct priority
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: testCase.expected,
        }),
      );
    }
  });
});

describe("TwilioClient", () => {
  it("should format phone numbers correctly", () => {
    const client = new TwilioClient({
      accountSid: "test",
      authToken: "test",
      messagingServiceSid: "test",
    });

    // Test various phone number formats
    const testCases = [
      { input: "5551234567", expected: "+15551234567" },
      { input: "15551234567", expected: "+15551234567" },
      { input: "+15551234567", expected: "+15551234567" },
      { input: "(555) 123-4567", expected: "+15551234567" },
      { input: "555-123-4567", expected: "+15551234567" },
    ];

    testCases.forEach(({ input, expected }) => {
      // Access the private method through prototype
      const formatted = (client as any).formatPhoneNumber(input);
      expect(formatted).toBe(expected);
    });
  });
});
