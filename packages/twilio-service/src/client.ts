// packages/twilio-service/src/client.ts
import twilio from "twilio";
import type { Twilio } from "twilio";
import type { MessageInstance } from "twilio/lib/rest/api/v2010/account/message";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  verifyServiceSid?: string;
  statusCallbackUrl?: string;
}

export class TwilioClient {
  private client: Twilio;
  private config: TwilioConfig;

  constructor(config: TwilioConfig) {
    this.config = config;
    this.client = twilio(config.accountSid, config.authToken);
  }

  async sendSMS(params: {
    to: string;
    body: string;
    scheduledAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<MessageInstance> {
    const messageParams: any = {
      messagingServiceSid: this.config.messagingServiceSid,
      to: this.formatPhoneNumber(params.to),
      body: params.body,
    };

    // Handle scheduling (Twilio supports up to 7 days)
    if (params.scheduledAt) {
      const now = new Date();
      const diffHours =
        (params.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (diffHours > 0 && diffHours <= 168) {
        // Within 7 days
        messageParams.sendAt = params.scheduledAt.toISOString();
        messageParams.scheduleType = "fixed";
      }
    }

    // Add status callback for delivery tracking
    if (this.config.statusCallbackUrl) {
      messageParams.statusCallback = this.config.statusCallbackUrl;

      // Pass metadata through status callback
      if (params.metadata) {
        const callbackUrl = new URL(this.config.statusCallbackUrl);
        Object.entries(params.metadata).forEach(([key, value]) => {
          callbackUrl.searchParams.append(key, String(value));
        });
        messageParams.statusCallback = callbackUrl.toString();
      }
    }

    try {
      return await this.client.messages.create(messageParams);
    } catch (error: any) {
      // Handle Twilio-specific errors
      if (error.code === 21211) {
        throw new Error(`Invalid phone number: ${params.to}`);
      } else if (error.code === 21610) {
        throw new Error("Message body exceeds maximum length");
      } else if (error.code === 21614) {
        throw new Error("Phone number is not SMS capable");
      }
      throw error;
    }
  }

  async verifyPhoneNumber(
    phoneNumber: string,
  ): Promise<{ verificationSid: string }> {
    if (!this.config.verifyServiceSid) {
      throw new Error("Verify service SID not configured");
    }

    const verification = await this.client.verify.v2
      .services(this.config.verifyServiceSid)
      .verifications.create({
        to: this.formatPhoneNumber(phoneNumber),
        channel: "sms",
      });

    return { verificationSid: verification.sid };
  }

  async checkVerification(phoneNumber: string, code: string): Promise<boolean> {
    if (!this.config.verifyServiceSid) {
      throw new Error("Verify service SID not configured");
    }

    try {
      const verificationCheck = await this.client.verify.v2
        .services(this.config.verifyServiceSid)
        .verificationChecks.create({
          to: this.formatPhoneNumber(phoneNumber),
          code,
        });

      return verificationCheck.status === "approved";
    } catch (error) {
      return false;
    }
  }

  async getMessageStatus(messageSid: string): Promise<string> {
    const message = await this.client.messages(messageSid).fetch();
    return message.status;
  }

  async cancelScheduledMessage(messageSid: string): Promise<void> {
    await this.client.messages(messageSid).update({ status: "canceled" });
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, "");

    // Add US country code if not present
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith("+")) {
      return phone;
    }

    return `+${cleaned}`;
  }
}
