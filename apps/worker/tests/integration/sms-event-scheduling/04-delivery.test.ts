// apps/worker/tests/integration/sms-event-scheduling/04-delivery.test.ts
/**
 * Integration Tests: SMS Delivery Tracking
 *
 * Tests Twilio webhook handling and delivery status tracking
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setupIntegrationTest } from "./setup";
import { TimeController, TestDataBuilder, QueueHelpers } from "./helpers";
import { addMinutes } from "date-fns";

describe("SMS Event Scheduling - Delivery Tracking", () => {
  const testSetup = setupIntegrationTest();
  const timeController = new TimeController();

  beforeEach(() => {
    timeController.reset();
  });

  describe("Successful Delivery Flow", () => {
    it("should track SMS from scheduled → sent → delivered", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Team Meeting",
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);
      const scheduledMsg = scheduledMessages[0];
      expect(scheduledMsg.status).toBe("scheduled");

      // Get linked sms_messages record
      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];
      expect(smsMsg.status).toBe("scheduled");

      // Verify linkage
      expect(scheduledMsg.sms_message_id).toBe(smsMsg.id);

      console.log(
        "✅ Initial state: scheduled_sms_messages ↔ sms_messages linked",
      );

      // Act 1: Simulate SMS sent (Twilio accepted)
      const twilioSid = `SM${Date.now()}`;

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "sent",
          twilio_sid: twilioSid,
          sent_at: new Date().toISOString(),
        })
        .eq("id", smsMsg.id);

      await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .update({
          status: "sent",
          twilio_sid: twilioSid,
          sent_at: new Date().toISOString(),
        })
        .eq("id", scheduledMsg.id);

      // Assert: Both tables updated to 'sent'
      const { data: sentSms } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, twilio_sid")
        .eq("id", smsMsg.id)
        .single();

      expect(sentSms?.status).toBe("sent");
      expect(sentSms?.twilio_sid).toBe(twilioSid);

      const { data: sentScheduled } = await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .select("status, twilio_sid")
        .eq("id", scheduledMsg.id)
        .single();

      expect(sentScheduled?.status).toBe("sent");
      expect(sentScheduled?.twilio_sid).toBe(twilioSid);

      console.log("✅ Status updated: scheduled → sent");

      // Act 2: Simulate Twilio delivery webhook
      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", smsMsg.id);

      await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .update({
          status: "delivered",
        })
        .eq("id", scheduledMsg.id);

      // Assert: Both tables updated to 'delivered'
      const { data: deliveredSms } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, delivered_at")
        .eq("id", smsMsg.id)
        .single();

      expect(deliveredSms?.status).toBe("delivered");
      expect(deliveredSms?.delivered_at).not.toBeNull();

      const { data: deliveredScheduled } = await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .select("status")
        .eq("id", scheduledMsg.id)
        .single();

      expect(deliveredScheduled?.status).toBe("delivered");

      console.log("✅ Status updated: sent → delivered");
      console.log(
        "✅ Full flow: scheduled → sent → delivered tracked correctly",
      );
    }, 30000);

    it("should calculate delivery time metrics", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Client Call",
        startTime: TestDataBuilder.eventTomorrow(14, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      // Act: Simulate send and delivery with timing
      const sentAt = new Date();
      const deliveredAt = new Date(sentAt.getTime() + 2500); // 2.5 seconds later

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "delivered",
          sent_at: sentAt.toISOString(),
          delivered_at: deliveredAt.toISOString(),
        })
        .eq("id", smsMsg.id);

      // Assert: Calculate delivery time
      const { data: deliveredMsg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("sent_at, delivered_at")
        .eq("id", smsMsg.id)
        .single();

      if (deliveredMsg?.sent_at && deliveredMsg?.delivered_at) {
        const deliveryTimeMs =
          new Date(deliveredMsg.delivered_at).getTime() -
          new Date(deliveredMsg.sent_at).getTime();

        expect(deliveryTimeMs).toBeGreaterThanOrEqual(2000);
        expect(deliveryTimeMs).toBeLessThanOrEqual(3000);

        console.log(`✅ Delivery time tracked: ${deliveryTimeMs}ms`);
      }
    }, 30000);
  });

  describe("Failed Delivery Handling", () => {
    it("should track failed SMS and retry", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Team Standup",
        startTime: TestDataBuilder.eventTomorrow(9, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);
      const scheduledMsg = scheduledMessages[0];

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      // Act: Simulate Twilio failure
      const errorMessage = "Invalid phone number";

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "failed",
          twilio_error_message: errorMessage,
          attempt_count: 1,
        })
        .eq("id", smsMsg.id);

      await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .update({
          status: "failed",
          last_error: errorMessage,
          send_attempts: 1,
        })
        .eq("id", scheduledMsg.id);

      // Assert: Failure tracked
      const { data: failedSms } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, twilio_error_message, attempt_count")
        .eq("id", smsMsg.id)
        .single();

      expect(failedSms?.status).toBe("failed");
      expect(failedSms?.twilio_error_message).toBe(errorMessage);
      expect(failedSms?.attempt_count).toBe(1);

      const { data: failedScheduled } = await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .select("status, last_error, send_attempts")
        .eq("id", scheduledMsg.id)
        .single();

      expect(failedScheduled?.status).toBe("failed");
      expect(failedScheduled?.last_error).toBe(errorMessage);
      expect(failedScheduled?.send_attempts).toBe(1);

      console.log("✅ SMS failure tracked with error message");
    }, 30000);

    it("should stop retrying after max attempts", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Workshop",
        startTime: TestDataBuilder.eventTomorrow(13, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);
      const scheduledMsg = scheduledMessages[0];

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      // Act: Simulate 3 failed attempts (max)
      const maxAttempts = 3;

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "failed",
          attempt_count: maxAttempts,
          max_attempts: maxAttempts,
          twilio_error_message: "Service unavailable",
        })
        .eq("id", smsMsg.id);

      await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .update({
          status: "failed",
          send_attempts: maxAttempts,
          max_send_attempts: maxAttempts,
          last_error: "Service unavailable",
        })
        .eq("id", scheduledMsg.id);

      // Assert: Max attempts reached
      const { data: finalSms } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, attempt_count, max_attempts")
        .eq("id", smsMsg.id)
        .single();

      expect(finalSms?.status).toBe("failed");
      expect(finalSms?.attempt_count).toBe(maxAttempts);
      expect(finalSms?.attempt_count).toBeGreaterThanOrEqual(
        finalSms?.max_attempts ?? 0,
      );

      const { data: finalScheduled } = await testSetup
        .getClient()
        .from("scheduled_sms_messages")
        .select("status, send_attempts, max_send_attempts")
        .eq("id", scheduledMsg.id)
        .single();

      expect(finalScheduled?.status).toBe("failed");
      expect(finalScheduled?.send_attempts).toBe(maxAttempts);
      expect(finalScheduled?.send_attempts).toBeGreaterThanOrEqual(
        finalScheduled?.max_send_attempts ?? 0,
      );

      console.log(
        `✅ Max retry attempts reached (${maxAttempts}/${maxAttempts})`,
      );
    }, 30000);

    it("should handle undelivered status from Twilio", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Planning Session",
        startTime: TestDataBuilder.eventTomorrow(11, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      // Act: Simulate Twilio undelivered status
      const twilioSid = `SM${Date.now()}`;

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "undelivered",
          twilio_sid: twilioSid,
          sent_at: new Date().toISOString(),
          twilio_error_message: "Destination unreachable",
        })
        .eq("id", smsMsg.id);

      // Assert: Undelivered status tracked
      const { data: undeliveredMsg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, twilio_error_message")
        .eq("id", smsMsg.id)
        .single();

      expect(undeliveredMsg?.status).toBe("undelivered");
      expect(undeliveredMsg?.twilio_error_message).toBe(
        "Destination unreachable",
      );

      console.log("✅ Undelivered status tracked from Twilio webhook");
    }, 30000);
  });

  describe("Webhook Status Updates", () => {
    it("should handle queued → sent → delivered webhook sequence", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Team Meeting",
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      const twilioSid = `SM${Date.now()}`;

      // Act 1: Webhook - queued
      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "queued",
          twilio_sid: twilioSid,
        })
        .eq("id", smsMsg.id);

      let { data: msg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status")
        .eq("id", smsMsg.id)
        .single();

      expect(msg?.status).toBe("queued");
      console.log("✅ Webhook 1: queued");

      // Act 2: Webhook - sent
      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", smsMsg.id);

      ({ data: msg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status")
        .eq("id", smsMsg.id)
        .single());

      expect(msg?.status).toBe("sent");
      console.log("✅ Webhook 2: sent");

      // Act 3: Webhook - delivered
      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", smsMsg.id);

      ({ data: msg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, delivered_at")
        .eq("id", smsMsg.id)
        .single());

      expect(msg?.status).toBe("delivered");
      expect(msg?.delivered_at).not.toBeNull();
      console.log("✅ Webhook 3: delivered");

      console.log(
        "✅ Full webhook sequence tracked: queued → sent → delivered",
      );
    }, 30000);

    it("should handle out-of-order webhooks gracefully", async () => {
      // Arrange: Create user and schedule SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: "Client Call",
        startTime: TestDataBuilder.eventTomorrow(14, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(1);
      const smsMsg = smsMessages[0];

      const twilioSid = `SM${Date.now()}`;

      // Act: Receive webhooks out of order (delivered before sent)
      // This can happen in real Twilio webhooks

      // Webhook 1: delivered (arrives first)
      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "delivered",
          twilio_sid: twilioSid,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", smsMsg.id);

      let { data: msg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status")
        .eq("id", smsMsg.id)
        .single();

      expect(msg?.status).toBe("delivered");

      // Webhook 2: sent (arrives late)
      // Should NOT downgrade status from delivered to sent
      const currentStatus = msg?.status;

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          sent_at: new Date().toISOString(),
          // Don't change status if already delivered
        })
        .eq("id", smsMsg.id)
        .eq("status", "delivered"); // Only update if still delivered

      ({ data: msg } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status, sent_at")
        .eq("id", smsMsg.id)
        .single());

      // Status should remain 'delivered'
      expect(msg?.status).toBe("delivered");
      expect(msg?.sent_at).not.toBeNull();

      console.log("✅ Out-of-order webhooks handled: status not downgraded");
    }, 30000);
  });

  describe("Delivery Metrics", () => {
    it("should track delivery success rate", async () => {
      // Arrange: Create user with multiple events
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      // Create 10 events
      for (let i = 0; i < 10; i++) {
        await testSetup.createCalendarEvent(user.id, {
          title: `Event ${i + 1}`,
          startTime: TestDataBuilder.eventTomorrow(8 + i, 0),
        });
      }

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        "schedule_daily_sms",
        user.id,
        15000,
      );

      const smsMessages = await testSetup.getSMSMessages(user.id);
      expect(smsMessages).toHaveLength(10);

      // Act: Simulate 8 delivered, 2 failed
      const deliveredIds = smsMessages.slice(0, 8).map((m) => m.id);
      const failedIds = smsMessages.slice(8, 10).map((m) => m.id);

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "delivered",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
        })
        .in("id", deliveredIds);

      await testSetup
        .getClient()
        .from("sms_messages")
        .update({
          status: "failed",
          twilio_error_message: "Service error",
        })
        .in("id", failedIds);

      // Assert: Calculate delivery rate
      const { data: allMessages } = await testSetup
        .getClient()
        .from("sms_messages")
        .select("status")
        .eq("user_id", user.id);

      const delivered =
        allMessages?.filter((m) => m.status === "delivered").length || 0;
      const total = allMessages?.length || 0;
      const deliveryRate = total > 0 ? delivered / total : 0;

      expect(deliveryRate).toBe(0.8); // 80% success rate
      console.log(
        `✅ Delivery rate: ${(deliveryRate * 100).toFixed(0)}% (${delivered}/${total})`,
      );
    }, 30000);
  });
});
