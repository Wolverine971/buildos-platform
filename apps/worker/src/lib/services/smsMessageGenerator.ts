// apps/worker/src/lib/services/smsMessageGenerator.ts
/**
 * SMS Message Generator Service
 *
 * Generates intelligent, context-aware SMS reminders for calendar events
 * using LLM (DeepSeek) with template fallback for reliability.
 */

import { SmartLLMService } from "./smart-llm-service";
import { addMinutes, formatDistance } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import {
  getUserPrompt,
  getSystemPrompt,
  type MessageType,
  type EventPromptContext,
} from "../../workers/sms/prompts";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface EventContext {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
  location?: string;
  attendees?: string[];
  link?: string;
  isAllDay: boolean;
  userTimezone: string;
}

export interface GeneratedSMS {
  content: string;
  generatedVia: "llm" | "template";
  model?: string;
  costUsd?: number;
  metadata?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    generationTimeMs?: number;
  };
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class SMSMessageGenerator {
  private llmService: SmartLLMService;

  constructor() {
    this.llmService = new SmartLLMService({
      httpReferer: "https://build-os.com",
      appName: "BuildOS-Worker",
    });
  }

  /**
   * Generate SMS reminder for a calendar event
   */
  async generateEventReminder(
    event: EventContext,
    leadTimeMinutes: number,
    userId: string,
  ): Promise<GeneratedSMS> {
    try {
      // Calculate time until event from the actual send time (not from now)
      // The message will be sent leadTimeMinutes before the event, so calculate
      // the time remaining from that send time to the event start
      const sendTime = addMinutes(event.startTime, -leadTimeMinutes);
      const sendTimeInUserTz = utcToZonedTime(sendTime, event.userTimezone);
      const startInUserTz = utcToZonedTime(event.startTime, event.userTimezone);
      const timeUntil = formatDistance(startInUserTz, sendTimeInUserTz, {
        addSuffix: false,
      });

      // Determine message type
      const messageType = this.determineMessageType(event);

      // Build context for LLM
      const context = this.buildEventContext(event, timeUntil);

      // Generate with LLM
      const systemPrompt = getSystemPrompt(messageType);
      const userPrompt = getUserPrompt(messageType, context);

      console.log(
        `🤖 [SMSMessageGenerator] Generating ${messageType} reminder for: ${event.title}`,
      );

      const content = await this.llmService.generateText({
        prompt: userPrompt,
        userId,
        profile: "balanced", // Use DeepSeek for cost-effective quality
        systemPrompt,
        temperature: 0.6, // Balanced creativity
        maxTokens: 100, // Short SMS messages
      });

      // Validate and clean the response
      const cleanedContent = this.validateAndTruncate(content);

      console.log(
        `✅ [SMSMessageGenerator] LLM generated (${cleanedContent.length} chars): "${cleanedContent}"`,
      );

      return {
        content: cleanedContent,
        generatedVia: "llm",
        model: "deepseek/deepseek-chat", // Primary model in balanced profile
        metadata: {
          // Note: SmartLLMService doesn't return usage stats directly
          // We could enhance it to return this data if needed
        },
      };
    } catch (error) {
      console.error(
        "[SMSMessageGenerator] LLM generation failed, using template:",
        error,
      );

      // Fallback to template
      return this.generateFromTemplate(event, leadTimeMinutes);
    }
  }

  // ============================================
  // MESSAGE TYPE DETECTION
  // ============================================

  private determineMessageType(event: EventContext): MessageType {
    if (event.isAllDay) return "all_day";

    // Check for deadline keywords
    const deadlineKeywords = ["deadline", "due", "submit", "deliver", "finish"];
    const titleLower = event.title.toLowerCase();
    const descLower = event.description?.toLowerCase() || "";

    if (
      deadlineKeywords.some(
        (kw) => titleLower.includes(kw) || descLower.includes(kw),
      )
    ) {
      return "deadline";
    }

    return "meeting";
  }

  // ============================================
  // CONTEXT BUILDING
  // ============================================

  private buildEventContext(
    event: EventContext,
    timeUntil: string,
  ): EventPromptContext {
    // Extract meeting link if present
    const meetingLink =
      event.link || this.extractMeetingLink(event.description);

    // Format attendees (max 2, then "and X others")
    const formattedAttendees =
      event.attendees && event.attendees.length > 0
        ? this.formatAttendees(event.attendees)
        : undefined;

    // Extract key details from description (first sentence)
    const keyDetails = event.description
      ? this.extractKeyDetails(event.description)
      : undefined;

    return {
      event_title: event.title,
      time_until_event: timeUntil,
      duration: this.formatDuration(event.startTime, event.endTime),
      description: keyDetails,
      location: event.location,
      attendees: formattedAttendees,
      meeting_link: meetingLink,
    };
  }

  // ============================================
  // TEMPLATE FALLBACK
  // ============================================

  private generateFromTemplate(
    event: EventContext,
    leadTimeMinutes: number,
  ): GeneratedSMS {
    const timeText =
      leadTimeMinutes < 60
        ? `in ${leadTimeMinutes} mins`
        : `in ${Math.round(leadTimeMinutes / 60)} hour${leadTimeMinutes >= 120 ? "s" : ""}`;

    let message: string;

    if (event.isAllDay) {
      message = `Today: ${event.title}`;
      if (event.description) {
        const details = this.extractKeyDetails(event.description);
        message += ` - ${details}`;
      }
    } else {
      message = `${event.title} ${timeText}`;

      // Add location if short
      if (event.location && event.location.length < 30) {
        message += ` @ ${event.location}`;
      }

      // Add link if available
      const link = event.link || this.extractMeetingLink(event.description);
      if (link && message.length + link.length < 155) {
        message += `. ${link}`;
      }

      // Add key detail if space allows
      if (event.description && message.length < 120) {
        const details = this.extractKeyDetails(event.description);
        const remaining = 160 - message.length - 3; // -3 for " - "
        if (details.length <= remaining) {
          message += ` - ${details}`;
        }
      }
    }

    const cleanedMessage = this.validateAndTruncate(message);

    console.log(
      `📝 [SMSMessageGenerator] Template generated (${cleanedMessage.length} chars): "${cleanedMessage}"`,
    );

    return {
      content: cleanedMessage,
      generatedVia: "template",
    };
  }

  // ============================================
  // VALIDATION & CLEANING
  // ============================================

  private validateAndTruncate(text: string): string {
    // Remove extra whitespace
    let cleaned = text.trim().replace(/\s+/g, " ");

    // Remove any markdown or emojis that LLM might have added
    cleaned = cleaned.replace(/[*_~`#]/g, "");
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, ""); // Emoticons
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ""); // Symbols & pictographs
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ""); // Transport & map symbols
    cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, ""); // Miscellaneous symbols

    // Remove quotes that LLM might add around the message
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      cleaned = cleaned.slice(1, -1);
    }

    // Truncate to 160 chars if needed
    if (cleaned.length > 160) {
      cleaned = cleaned.substring(0, 157) + "...";
    }

    return cleaned;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private extractKeyDetails(description: string, maxLength = 60): string {
    // Get first sentence or first line
    const firstSentence = description.split(/[.\n]/)[0].trim();
    return firstSentence.length > maxLength
      ? firstSentence.substring(0, maxLength - 3) + "..."
      : firstSentence;
  }

  private extractMeetingLink(description?: string): string | undefined {
    if (!description) return undefined;

    // Google Meet
    const meetRegex = /https:\/\/meet\.google\.com\/[a-z-]+/i;
    const meetMatch = description.match(meetRegex);
    if (meetMatch) return meetMatch[0];

    // Zoom
    const zoomRegex = /https:\/\/[a-z0-9.]*zoom\.us\/j\/\d+/i;
    const zoomMatch = description.match(zoomRegex);
    if (zoomMatch) return zoomMatch[0];

    // Microsoft Teams
    const teamsRegex =
      /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/i;
    const teamsMatch = description.match(teamsRegex);
    if (teamsMatch) return teamsMatch[0];

    return undefined;
  }

  private formatAttendees(attendees: string[]): string {
    if (attendees.length === 0) return "";
    if (attendees.length === 1) return attendees[0];
    if (attendees.length === 2) return `${attendees[0]} and ${attendees[1]}`;
    return `${attendees[0]}, ${attendees[1]}, and ${attendees.length - 2} others`;
  }

  private formatDuration(start: Date, end: Date): string {
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${hours}h ${remainingMins}m`;
  }
}
