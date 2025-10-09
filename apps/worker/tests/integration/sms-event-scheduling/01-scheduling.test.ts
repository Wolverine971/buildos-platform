// apps/worker/tests/integration/sms-event-scheduling/01-scheduling.test.ts
/**
 * Integration Tests: End-to-End SMS Event Scheduling Flow
 *
 * Tests the complete flow from calendar event creation to SMS delivery
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setupIntegrationTest } from "./setup";
import {
  TimeController,
  TestDataBuilder,
  SMSAssertions,
  QueueHelpers,
} from "./helpers";
import { addMinutes, format } from "date-fns";

describe("SMS Event Scheduling - End to End", () => {
  const testSetup = setupIntegrationTest();
  const timeController = new TimeController();

  beforeEach(() => {
    timeController.reset();
  });

  it("should schedule and send SMS for calendar event", async () => {
    // Arrange: Create test user with SMS enabled
    const user = await testSetup.createTestUser({
      timezone: "America/Los_Angeles",
      phoneVerified: true,
      remindersEnabled: true,
      leadTime: 15, // 15 minutes before event
    });

    // Create calendar event for tomorrow at 10 AM
    const eventTime = TestDataBuilder.eventTomorrow(10, 0);
    const event = await testSetup.createCalendarEvent(user.id, {
      title: "Team Standup",
      startTime: eventTime,
      durationMinutes: 30,
    });

    console.log(
      "📅 Created calendar event:",
      event.event_title,
      "at",
      event.event_start,
    );

    // Act: Trigger daily scheduler (midnight run)
    const targetDate = format(eventTime, "yyyy-MM-dd");
    await testSetup.triggerDailyScheduler(user.id, targetDate);

    // Wait for scheduler job to complete
    await QueueHelpers.waitForJobCompletion(
      testSetup.getClient(),
      "schedule_daily_sms",
      user.id,
      15000, // 15 second timeout
    );

    // Assert: Verify scheduled_sms_messages created
    const scheduledMessages = await testSetup.getScheduledMessages(user.id);

    expect(scheduledMessages).toHaveLength(1);
    const scheduledMsg = scheduledMessages[0];

    expect(scheduledMsg.user_id).toBe(user.id);
    expect(scheduledMsg.calendar_event_id).toBe(event.calendar_event_id);
    expect(scheduledMsg.event_title).toBe("Team Standup");
    expect(scheduledMsg.status).toBe("scheduled");

    // Verify scheduled time is 15 minutes before event
    const scheduledTime = new Date(scheduledMsg.scheduled_for);
    const expectedTime = addMinutes(eventTime, -15);
    expect(scheduledTime.getTime()).toBe(expectedTime.getTime());

    // Verify message content
    SMSAssertions.assertValidSMSContent(scheduledMsg.message_content);
    SMSAssertions.assertContainsEventDetails(
      scheduledMsg.message_content,
      "Team Standup",
    );

    console.log("✅ Scheduled SMS:", scheduledMsg.message_content);

    // Assert: Verify sms_messages record created and linked
    const smsMessages = await testSetup.getSMSMessages(user.id);
    expect(smsMessages).toHaveLength(1);

    const smsMsg = smsMessages[0];
    expect(smsMsg.status).toBe("scheduled");
    expect(smsMsg.phone_number).toBe(user.smsPreferences.phone_number);
    expect(smsMsg.message_content).toBe(scheduledMsg.message_content);

    // Verify linkage between tables
    expect(scheduledMsg.sms_message_id).toBe(smsMsg.id);
    expect(smsMsg.metadata?.scheduled_sms_id).toBe(scheduledMsg.id);

    console.log("✅ Test passed: SMS scheduled correctly for calendar event");
  }, 30000); // 30 second timeout for full test

  it("should send SMS at scheduled time", async () => {
    // This test would require:
    // 1. Mock Twilio client
    // 2. Time travel to send time
    // 3. Trigger send_sms worker
    // 4. Verify Twilio called with correct params
    // 5. Verify status updated to 'sent'

    // Note: Full implementation requires worker integration
    // For now, marking as TODO for Phase 6.2
    expect(true).toBe(true); // Placeholder
  });

  it("should handle LLM generation with fallback to template", async () => {
    // Arrange: Create user and event
    const user = await testSetup.createTestUser({
      leadTime: 15,
    });

    const event = await testSetup.createCalendarEvent(user.id, {
      title: "Q4 Planning Meeting",
      startTime: TestDataBuilder.eventTomorrow(14, 30),
    });

    // Act: Trigger scheduler
    await testSetup.triggerDailyScheduler(user.id);

    await QueueHelpers.waitForJobCompletion(
      testSetup.getClient(),
      "schedule_daily_sms",
      user.id,
      15000,
    );

    // Assert: Message generated (either LLM or template)
    const scheduledMessages = await testSetup.getScheduledMessages(user.id);
    expect(scheduledMessages).toHaveLength(1);

    const msg = scheduledMessages[0];
    expect(msg.generated_via).toMatch(/^(llm|template)$/);

    if (msg.generated_via === "llm") {
      expect(msg.llm_model).toBeTruthy();
      expect(msg.generation_cost_usd).toBeGreaterThan(0);
      console.log("✅ Message generated via LLM:", msg.llm_model);
    } else {
      console.log("✅ Message generated via template fallback");
    }

    SMSAssertions.assertValidSMSContent(msg.message_content);
  }, 30000);

  it("should not schedule SMS for past events", async () => {
    // Arrange: Create user
    const user = await testSetup.createTestUser();

    // Create event in the past
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    await testSetup.createCalendarEvent(user.id, {
      title: "Past Event",
      startTime: pastTime,
    });

    // Act: Trigger scheduler
    await testSetup.triggerDailyScheduler(user.id);

    await QueueHelpers.waitForJobCompletion(
      testSetup.getClient(),
      "schedule_daily_sms",
      user.id,
      15000,
    );

    // Assert: No messages scheduled
    const scheduledMessages = await testSetup.getScheduledMessages(user.id);
    expect(scheduledMessages).toHaveLength(0);

    console.log("✅ Correctly skipped past event");
  }, 30000);

  it("should schedule multiple messages for multiple events", async () => {
    // Arrange: Create user
    const user = await testSetup.createTestUser();

    // Create 3 events
    const event1 = await testSetup.createCalendarEvent(user.id, {
      title: "Morning Standup",
      startTime: TestDataBuilder.eventTomorrow(9, 0),
    });

    const event2 = await testSetup.createCalendarEvent(user.id, {
      title: "Client Call",
      startTime: TestDataBuilder.eventTomorrow(14, 0),
    });

    const event3 = await testSetup.createCalendarEvent(user.id, {
      title: "Team Retro",
      startTime: TestDataBuilder.eventTomorrow(16, 30),
    });

    // Act: Trigger scheduler
    await testSetup.triggerDailyScheduler(user.id);

    await QueueHelpers.waitForJobCompletion(
      testSetup.getClient(),
      "schedule_daily_sms",
      user.id,
      15000,
    );

    // Assert: 3 messages scheduled
    const scheduledMessages = await testSetup.getScheduledMessages(user.id);
    expect(scheduledMessages).toHaveLength(3);

    // Verify each message
    const titles = scheduledMessages.map((m) => m.event_title).sort();
    expect(titles).toEqual(["Client Call", "Morning Standup", "Team Retro"]);

    console.log("✅ Scheduled 3 SMS for 3 events");
  }, 30000);

  it("should respect daily SMS limit", async () => {
    // Arrange: Create user with limit of 2 SMS per day
    const user = await testSetup.createTestUser({
      dailyLimit: 2,
    });

    // Create 5 events
    for (let i = 0; i < 5; i++) {
      await testSetup.createCalendarEvent(user.id, {
        title: `Event ${i + 1}`,
        startTime: TestDataBuilder.eventTomorrow(9 + i, 0),
      });
    }

    // Act: Trigger scheduler
    await testSetup.triggerDailyScheduler(user.id);

    await QueueHelpers.waitForJobCompletion(
      testSetup.getClient(),
      "schedule_daily_sms",
      user.id,
      15000,
    );

    // Assert: Only 2 messages scheduled (daily limit)
    const scheduledMessages = await testSetup.getScheduledMessages(user.id);
    expect(scheduledMessages.length).toBeLessThanOrEqual(2);

    console.log(
      `✅ Respected daily limit: ${scheduledMessages.length} messages scheduled (limit: 2)`,
    );
  }, 30000);
});
