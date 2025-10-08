/**
 * Integration Test Setup for SMS Event Scheduling
 *
 * Provides test database, fixtures, and utilities for integration testing
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";

export interface TestUser {
  id: string;
  email: string;
  timezone: string;
  smsPreferences: {
    phone_number: string;
    phone_verified: boolean;
    event_reminders_enabled: boolean;
    reminder_lead_time_minutes: number;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
    daily_sms_limit: number;
  };
}

export interface TestCalendarEvent {
  id: string;
  calendar_event_id: string;
  user_id: string;
  event_title: string;
  event_start: string;
  event_end: string;
  sync_status: string;
}

export class TestSetup {
  private supabase: SupabaseClient;
  private createdUsers: string[] = [];
  private createdEvents: string[] = [];
  private createdMessages: string[] = [];

  constructor() {
    // Use test database (configure in .env.test)
    this.supabase = createClient(
      process.env.TEST_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL!,
      process.env.TEST_SUPABASE_SERVICE_KEY ||
        process.env.PRIVATE_SUPABASE_SERVICE_KEY!,
    );
  }

  /**
   * Create a test user with SMS preferences
   */
  async createTestUser(
    options: {
      email?: string;
      timezone?: string;
      phoneVerified?: boolean;
      remindersEnabled?: boolean;
      leadTime?: number;
      quietHours?: { start: string; end: string };
      dailyLimit?: number;
    } = {},
  ): Promise<TestUser> {
    const email = options.email || `test-${Date.now()}@example.com`;
    const timezone = options.timezone || "America/Los_Angeles";

    // Create auth user
    const { data: authData, error: authError } =
      await this.supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { timezone },
      });

    if (authError || !authData.user) {
      throw new Error(`Failed to create test user: ${authError?.message}`);
    }

    const userId = authData.user.id;
    this.createdUsers.push(userId);

    // Create SMS preferences
    const smsPrefs = {
      user_id: userId,
      phone_number: options.phoneVerified !== false ? "+15555551234" : null,
      phone_verified: options.phoneVerified !== false,
      event_reminders_enabled: options.remindersEnabled !== false,
      reminder_lead_time_minutes: options.leadTime || 15,
      quiet_hours_start: options.quietHours?.start || null,
      quiet_hours_end: options.quietHours?.end || null,
      daily_sms_limit: options.dailyLimit || 10,
      daily_sms_count: 0,
      opted_out: false,
      timezone,
    };

    const { error: prefsError } = await this.supabase
      .from("user_sms_preferences")
      .insert(smsPrefs);

    if (prefsError) {
      throw new Error(
        `Failed to create SMS preferences: ${prefsError.message}`,
      );
    }

    return {
      id: userId,
      email,
      timezone,
      smsPreferences: smsPrefs,
    };
  }

  /**
   * Create a test calendar event
   */
  async createCalendarEvent(
    userId: string,
    options: {
      title?: string;
      startTime?: Date;
      durationMinutes?: number;
      calendarEventId?: string;
    } = {},
  ): Promise<TestCalendarEvent> {
    const title = options.title || "Test Meeting";
    const startTime = options.startTime || addDays(new Date(), 1);
    const durationMinutes = options.durationMinutes || 30;
    const calendarEventId =
      options.calendarEventId || `test-event-${Date.now()}`;

    const eventStart = startTime.toISOString();
    const eventEnd = new Date(
      startTime.getTime() + durationMinutes * 60000,
    ).toISOString();

    const event = {
      user_id: userId,
      calendar_event_id: calendarEventId,
      event_title: title,
      event_start: eventStart,
      event_end: eventEnd,
      sync_status: "synced" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from("task_calendar_events")
      .insert(event)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create calendar event: ${error?.message}`);
    }

    this.createdEvents.push(data.id);

    return {
      id: data.id,
      calendar_event_id: calendarEventId,
      user_id: userId,
      event_title: title,
      event_start: eventStart,
      event_end: eventEnd,
      sync_status: "synced",
    };
  }

  /**
   * Get scheduled SMS messages for a user
   */
  async getScheduledMessages(userId: string) {
    const { data, error } = await this.supabase
      .from("scheduled_sms_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch scheduled messages: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get SMS messages for a user
   */
  async getSMSMessages(userId: string) {
    const { data, error } = await this.supabase
      .from("sms_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch SMS messages: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Trigger the daily SMS scheduler for a specific user
   */
  async triggerDailyScheduler(userId: string, date?: string) {
    const user = await this.getUser(userId);
    const targetDate = date || format(addDays(new Date(), 1), "yyyy-MM-dd");

    // Queue the daily SMS job
    const { error } = await this.supabase.rpc("add_queue_job", {
      p_user_id: userId,
      p_job_type: "schedule_daily_sms",
      p_metadata: {
        userId,
        date: targetDate,
        timezone: user.user_metadata.timezone || "America/Los_Angeles",
        leadTimeMinutes: 15,
      },
      p_priority: 5,
    });

    if (error) {
      throw new Error(`Failed to queue daily SMS job: ${error.message}`);
    }
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    // Delete scheduled messages
    if (this.createdUsers.length > 0) {
      await this.supabase
        .from("scheduled_sms_messages")
        .delete()
        .in("user_id", this.createdUsers);

      await this.supabase
        .from("sms_messages")
        .delete()
        .in("user_id", this.createdUsers);
    }

    // Delete calendar events
    if (this.createdEvents.length > 0) {
      await this.supabase
        .from("task_calendar_events")
        .delete()
        .in("id", this.createdEvents);
    }

    // Delete SMS preferences
    if (this.createdUsers.length > 0) {
      await this.supabase
        .from("user_sms_preferences")
        .delete()
        .in("user_id", this.createdUsers);
    }

    // Delete auth users
    for (const userId of this.createdUsers) {
      await this.supabase.auth.admin.deleteUser(userId);
    }

    // Reset tracking arrays
    this.createdUsers = [];
    this.createdEvents = [];
    this.createdMessages = [];
  }

  /**
   * Helper: Get user data
   */
  private async getUser(userId: string) {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new Error(`User not found: ${userId}`);
    }
    return data.user;
  }

  /**
   * Helper: Get Supabase client for assertions
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }
}

/**
 * Shared test setup for all integration tests
 */
export function setupIntegrationTest() {
  const testSetup = new TestSetup();

  // Clean up after each test
  afterEach(async () => {
    await testSetup.cleanup();
  });

  return testSetup;
}
