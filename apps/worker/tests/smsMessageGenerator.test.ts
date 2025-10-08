// apps/worker/tests/smsMessageGenerator.test.ts
/**
 * Tests for SMS Message Generator
 *
 * These tests verify that the SMS message generator creates
 * valid, concise messages under 160 characters.
 *
 * Note: These tests run without the OPENROUTER_API_KEY, so they
 * test the template fallback mechanism. For LLM integration tests,
 * run with the API key set.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SMSMessageGenerator,
  type EventContext,
} from "../src/lib/services/smsMessageGenerator";

// Mock SmartLLMService to test template fallback without API key
vi.mock("../src/lib/services/smart-llm-service", () => {
  return {
    SmartLLMService: vi.fn().mockImplementation(() => {
      return {
        generateText: vi.fn().mockRejectedValue(new Error("LLM mock error")),
      };
    }),
  };
});

describe("SMSMessageGenerator", () => {
  let generator: SMSMessageGenerator;

  beforeEach(() => {
    generator = new SMSMessageGenerator();
  });

  describe("generateEventReminder (template fallback)", () => {
    it("should generate template message under 160 characters for simple meeting", async () => {
      const event: EventContext = {
        eventId: "test-123",
        title: "Team Standup",
        startTime: new Date(Date.now() + 15 * 60000), // 15 mins from now
        endTime: new Date(Date.now() + 30 * 60000), // 30 mins from now
        isAllDay: false,
        userTimezone: "America/Los_Angeles",
      };

      const result = await generator.generateEventReminder(
        event,
        15,
        "test-user-123",
      );

      expect(result.content.length).toBeLessThanOrEqual(160);
      expect(result.content).toBeTruthy();
      expect(result.generatedVia).toBe("template"); // Should use template when LLM fails
      console.log(
        `[Test] Generated message (${result.content.length} chars, ${result.generatedVia}): "${result.content}"`,
      );
    });

    it("should include event title in the message", async () => {
      const event: EventContext = {
        eventId: "test-456",
        title: "Project Review",
        startTime: new Date(Date.now() + 30 * 60000),
        endTime: new Date(Date.now() + 60 * 60000),
        isAllDay: false,
        userTimezone: "UTC",
      };

      const result = await generator.generateEventReminder(
        event,
        30,
        "test-user-456",
      );

      expect(result.content).toContain("Project Review");
      expect(result.content.length).toBeLessThanOrEqual(160);
    });

    it("should handle meetings with links", async () => {
      const event: EventContext = {
        eventId: "test-789",
        title: "Client Call",
        startTime: new Date(Date.now() + 10 * 60000),
        endTime: new Date(Date.now() + 40 * 60000),
        link: "https://meet.google.com/abc-xyz",
        isAllDay: false,
        userTimezone: "America/New_York",
      };

      const result = await generator.generateEventReminder(
        event,
        10,
        "test-user-789",
      );

      expect(result.content.length).toBeLessThanOrEqual(160);
      expect(result.content).toBeTruthy();
      console.log(
        `[Test] Message with link (${result.content.length} chars): "${result.content}"`,
      );
    });

    it("should handle long event titles gracefully", async () => {
      const event: EventContext = {
        eventId: "test-long",
        title:
          "Quarterly Business Review and Strategic Planning Session for Q4 2025 with Executive Team",
        startTime: new Date(Date.now() + 60 * 60000),
        endTime: new Date(Date.now() + 120 * 60000),
        isAllDay: false,
        userTimezone: "UTC",
      };

      const result = await generator.generateEventReminder(
        event,
        60,
        "test-user-long",
      );

      expect(result.content.length).toBeLessThanOrEqual(160);
      expect(result.content).toBeTruthy();
      console.log(
        `[Test] Long title truncated (${result.content.length} chars): "${result.content}"`,
      );
    });

    it("should not contain markdown or emojis", async () => {
      const event: EventContext = {
        eventId: "test-clean",
        title: "Team Meeting",
        startTime: new Date(Date.now() + 15 * 60000),
        endTime: new Date(Date.now() + 45 * 60000),
        isAllDay: false,
        userTimezone: "UTC",
      };

      const result = await generator.generateEventReminder(
        event,
        15,
        "test-user-clean",
      );

      // Should not contain markdown characters
      expect(result.content).not.toMatch(/[*_~`#]/);

      // Should not contain emojis
      expect(result.content).not.toMatch(/[\u{1F600}-\u{1F64F}]/u);
      expect(result.content).not.toMatch(/[\u{1F300}-\u{1F5FF}]/u);
    });

    it("should handle events with location", async () => {
      const event: EventContext = {
        eventId: "test-location",
        title: "Offsite Meeting",
        startTime: new Date(Date.now() + 30 * 60000),
        endTime: new Date(Date.now() + 120 * 60000),
        location: "Conference Room A",
        isAllDay: false,
        userTimezone: "America/Los_Angeles",
      };

      const result = await generator.generateEventReminder(
        event,
        30,
        "test-user-location",
      );

      expect(result.content.length).toBeLessThanOrEqual(160);
      console.log(
        `[Test] Message with location (${result.content.length} chars): "${result.content}"`,
      );
    });

    it("should always fall back to template on LLM error", async () => {
      // This test verifies the fallback mechanism works
      // Even if LLM fails, we should get a template-generated message
      const event: EventContext = {
        eventId: "test-fallback",
        title: "Emergency Meeting",
        startTime: new Date(Date.now() + 5 * 60000),
        endTime: new Date(Date.now() + 20 * 60000),
        isAllDay: false,
        userTimezone: "UTC",
      };

      const result = await generator.generateEventReminder(
        event,
        5,
        "test-user-fallback",
      );

      // Should always return a valid message, even if LLM fails
      expect(result.content).toBeTruthy();
      expect(result.content.length).toBeLessThanOrEqual(160);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.generatedVia).toBe("template"); // Should fall back to template
    });
  });
});
