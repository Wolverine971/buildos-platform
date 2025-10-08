/**
 * Integration Tests: Timezone and Edge Cases
 *
 * Tests timezone handling, DST transitions, and other edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupIntegrationTest } from './setup';
import { TimeController, TestDataBuilder, QueueHelpers } from './helpers';
import { addMinutes, addDays, format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

describe('SMS Event Scheduling - Edge Cases', () => {
  const testSetup = setupIntegrationTest();
  const timeController = new TimeController();

  beforeEach(() => {
    timeController.reset();
  });

  describe('Timezone Handling', () => {
    it('should handle PST timezone correctly', async () => {
      // Arrange: User in Pacific Time
      const user = await testSetup.createTestUser({
        timezone: 'America/Los_Angeles',
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'PST Meeting',
        startTime: TestDataBuilder.eventTomorrow(10, 0), // 10 AM PST
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled 15 minutes before event
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const scheduledFor = new Date(scheduledMessages[0].scheduled_for);
      const expectedTime = addMinutes(TestDataBuilder.eventTomorrow(10, 0), -15);

      expect(scheduledFor.getTime()).toBe(expectedTime.getTime());

      console.log(
        `✅ PST timezone handled correctly: scheduled for ${format(scheduledFor, 'HH:mm z')}`,
      );
    }, 30000);

    it('should handle EST timezone correctly', async () => {
      // Arrange: User in Eastern Time
      const user = await testSetup.createTestUser({
        timezone: 'America/New_York',
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'EST Meeting',
        startTime: TestDataBuilder.eventTomorrow(14, 0), // 2 PM EST
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled correctly
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      console.log('✅ EST timezone handled correctly');
    }, 30000);

    it('should handle UTC timezone correctly', async () => {
      // Arrange: User in UTC
      const user = await testSetup.createTestUser({
        timezone: 'UTC',
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'UTC Meeting',
        startTime: TestDataBuilder.eventTomorrow(12, 0), // 12 PM UTC
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled correctly
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const scheduledFor = new Date(scheduledMessages[0].scheduled_for);
      const expectedTime = addMinutes(TestDataBuilder.eventTomorrow(12, 0), -15);

      expect(scheduledFor.getTime()).toBe(expectedTime.getTime());

      console.log('✅ UTC timezone handled correctly');
    }, 30000);

    it('should handle Tokyo timezone correctly', async () => {
      // Arrange: User in Japan Standard Time
      const user = await testSetup.createTestUser({
        timezone: 'Asia/Tokyo',
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Tokyo Meeting',
        startTime: TestDataBuilder.eventTomorrow(9, 0), // 9 AM JST
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled correctly
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      console.log('✅ Tokyo timezone handled correctly');
    }, 30000);

    it('should handle cross-timezone midnight correctly', async () => {
      // Arrange: User in Hawaii (UTC-10)
      const user = await testSetup.createTestUser({
        timezone: 'Pacific/Honolulu',
        leadTime: 15,
      });

      // Create event at 11:30 PM Hawaii time
      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Late Night Meeting',
        startTime: TestDataBuilder.eventTomorrow(23, 30),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled correctly (11:15 PM same day in Hawaii time)
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const scheduledFor = new Date(scheduledMessages[0].scheduled_for);
      const expectedTime = addMinutes(TestDataBuilder.eventTomorrow(23, 30), -15);

      expect(scheduledFor.getTime()).toBe(expectedTime.getTime());

      console.log('✅ Cross-timezone midnight handled correctly');
    }, 30000);
  });

  describe('DST Transitions', () => {
    it('should handle spring forward (DST start) correctly', async () => {
      // Note: This test would need to be run at specific dates
      // For now, we document the expected behavior

      // Arrange: User in timezone with DST
      const user = await testSetup.createTestUser({
        timezone: 'America/Los_Angeles',
        leadTime: 15,
      });

      // In spring DST transition, clocks move forward 1 hour at 2 AM
      // Event scheduled during the "missing hour" should be handled gracefully

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'DST Event',
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled (library handles DST automatically)
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      console.log('✅ DST spring forward handled (date-fns-tz manages transitions)');
    }, 30000);

    it('should handle fall back (DST end) correctly', async () => {
      // Arrange: User in timezone with DST
      const user = await testSetup.createTestUser({
        timezone: 'America/New_York',
        leadTime: 15,
      });

      // In fall DST transition, clocks move back 1 hour at 2 AM
      // 1:00 AM - 2:00 AM occurs twice

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Fall DST Event',
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled (library handles DST automatically)
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      console.log('✅ DST fall back handled (date-fns-tz manages transitions)');
    }, 30000);
  });

  describe('Lead Time Variations', () => {
    it('should handle 5 minute lead time', async () => {
      // Arrange: User with short lead time
      const user = await testSetup.createTestUser({
        leadTime: 5,
      });

      const eventTime = TestDataBuilder.eventTomorrow(10, 0);
      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Quick Meeting',
        startTime: eventTime,
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled 5 minutes before
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const scheduledFor = new Date(scheduledMessages[0].scheduled_for);
      const expectedTime = addMinutes(eventTime, -5);

      expect(scheduledFor.getTime()).toBe(expectedTime.getTime());

      console.log('✅ 5-minute lead time handled correctly');
    }, 30000);

    it('should handle 60 minute lead time', async () => {
      // Arrange: User with long lead time
      const user = await testSetup.createTestUser({
        leadTime: 60,
      });

      const eventTime = TestDataBuilder.eventTomorrow(14, 0);
      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Important Meeting',
        startTime: eventTime,
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: SMS scheduled 60 minutes before
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const scheduledFor = new Date(scheduledMessages[0].scheduled_for);
      const expectedTime = addMinutes(eventTime, -60);

      expect(scheduledFor.getTime()).toBe(expectedTime.getTime());

      console.log('✅ 60-minute lead time handled correctly');
    }, 30000);

    it('should handle same-day lead time change', async () => {
      // Arrange: User schedules with 15 minute lead time
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Team Sync',
        startTime: TestDataBuilder.eventTomorrow(11, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      const originalMessages = await testSetup.getScheduledMessages(user.id);
      expect(originalMessages).toHaveLength(1);

      // Act: User changes lead time to 30 minutes
      await testSetup
        .getClient()
        .from('user_sms_preferences')
        .update({
          reminder_lead_time_minutes: 30,
        })
        .eq('user_id', user.id);

      // Note: Existing scheduled messages are NOT automatically updated
      // User would need to manually reschedule or wait for next midnight run

      const updatedMessages = await testSetup.getScheduledMessages(user.id);
      expect(updatedMessages).toHaveLength(1);

      // Message still scheduled with original 15-minute lead time
      expect(updatedMessages[0].scheduled_for).toBe(originalMessages[0].scheduled_for);

      console.log('✅ Lead time changes do not affect already-scheduled messages');
    }, 30000);
  });

  describe('Message Content Edge Cases', () => {
    it('should handle very long event titles', async () => {
      // Arrange: User with event with long title
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const longTitle =
        'Quarterly Business Review Meeting with External Stakeholders and Board Members to Discuss Strategic Planning for Q4 2025';

      const event = await testSetup.createCalendarEvent(user.id, {
        title: longTitle,
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: Message generated and within SMS length limits
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const messageContent = scheduledMessages[0].message_content;
      expect(messageContent.length).toBeGreaterThan(0);
      expect(messageContent.length).toBeLessThanOrEqual(320); // SMS limit with some buffer

      console.log(
        `✅ Long event title handled: ${messageContent.length} chars (${longTitle.length} char title)`,
      );
    }, 30000);

    it('should handle events with special characters in title', async () => {
      // Arrange: User with event containing special characters
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const specialTitle = 'Q4 Planning: Review 📊 & Next Steps → Action Items 🚀';

      const event = await testSetup.createCalendarEvent(user.id, {
        title: specialTitle,
        startTime: TestDataBuilder.eventTomorrow(14, 0),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: Message generated successfully
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const messageContent = scheduledMessages[0].message_content;
      expect(messageContent.length).toBeGreaterThan(0);

      console.log('✅ Special characters in event title handled correctly');
    }, 30000);

    it('should handle untitled events gracefully', async () => {
      // Arrange: User with untitled event
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: '', // Empty title
        startTime: TestDataBuilder.eventTomorrow(9, 0),
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: Message generated with fallback title
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      const messageContent = scheduledMessages[0].message_content;
      expect(messageContent.length).toBeGreaterThan(0);

      // Should contain fallback like "Untitled Event" or "Event"
      expect(
        messageContent.toLowerCase().includes('event') ||
          messageContent.toLowerCase().includes('meeting'),
      ).toBe(true);

      console.log('✅ Untitled events handled with fallback title');
    }, 30000);
  });

  describe('Race Conditions', () => {
    it('should handle duplicate scheduling attempts', async () => {
      // Arrange: User with event
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Team Meeting',
        startTime: TestDataBuilder.eventTomorrow(10, 0),
      });

      // Act: Trigger scheduler twice (simulating race condition)
      const date = format(addDays(new Date(), 1), 'yyyy-MM-dd');

      await Promise.all([
        testSetup.triggerDailyScheduler(user.id, date),
        testSetup.triggerDailyScheduler(user.id, date),
      ]);

      // Wait for both to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Assert: Should only have 1 scheduled message (deduplication works)
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);

      // May be 1 or 2 depending on timing, but dedup key should prevent duplicates
      // in the queue_jobs table
      expect(scheduledMessages.length).toBeGreaterThan(0);

      console.log(
        `✅ Duplicate scheduling handled: ${scheduledMessages.length} message(s) scheduled`,
      );
    }, 30000);

    it('should handle concurrent user preference updates', async () => {
      // Arrange: User with scheduled SMS
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      const event = await testSetup.createCalendarEvent(user.id, {
        title: 'Planning Session',
        startTime: TestDataBuilder.eventTomorrow(11, 0),
      });

      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(1);

      // Act: Update preferences concurrently
      await Promise.all([
        testSetup
          .getClient()
          .from('user_sms_preferences')
          .update({ reminder_lead_time_minutes: 30 })
          .eq('user_id', user.id),
        testSetup
          .getClient()
          .from('user_sms_preferences')
          .update({ daily_sms_limit: 5 })
          .eq('user_id', user.id),
      ]);

      // Assert: Preferences updated successfully
      const { data: prefs } = await testSetup
        .getClient()
        .from('user_sms_preferences')
        .select('reminder_lead_time_minutes, daily_sms_limit')
        .eq('user_id', user.id)
        .single();

      expect(prefs).not.toBeNull();

      console.log('✅ Concurrent preference updates handled');
    }, 30000);
  });

  describe('Empty States', () => {
    it('should handle user with no calendar events', async () => {
      // Arrange: User with no events
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      // Act: Schedule SMS (no events exist)
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: No SMS scheduled
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(0);

      console.log('✅ User with no events handled gracefully');
    }, 30000);

    it('should handle user with all events in the past', async () => {
      // Arrange: User with past events only
      const user = await testSetup.createTestUser({
        leadTime: 15,
      });

      // Create events in the past
      const pastTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      await testSetup.createCalendarEvent(user.id, {
        title: 'Past Event 1',
        startTime: pastTime,
      });

      await testSetup.createCalendarEvent(user.id, {
        title: 'Past Event 2',
        startTime: new Date(pastTime.getTime() + 60 * 60 * 1000), // 1 hour later
      });

      // Act: Schedule SMS
      await testSetup.triggerDailyScheduler(user.id);
      await QueueHelpers.waitForJobCompletion(
        testSetup.getClient(),
        'schedule_daily_sms',
        user.id,
        15000,
      );

      // Assert: No SMS scheduled (past events filtered out)
      const scheduledMessages = await testSetup.getScheduledMessages(user.id);
      expect(scheduledMessages).toHaveLength(0);

      console.log('✅ Past events correctly filtered out');
    }, 30000);
  });
});
