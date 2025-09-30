// apps/worker/src/lib/services/gmail-transporter.ts
import type { Transporter } from "nodemailer";
import * as nodemailer from "nodemailer";

export interface GmailConfig {
  email: string;
  password: string; // App-specific password
  alias?: string; // Optional alias like noreply@build-os.com
  displayName?: string; // Display name for the sender
}

/**
 * Creates a Gmail transporter using OAuth2 or App Password
 *
 * IMPORTANT: Using Gmail with aliases requires:
 * 1. The alias must be configured in Gmail Settings > Accounts > "Send mail as"
 * 2. The alias must be verified (Gmail will send a verification email)
 * 3. Use an App Password, not your regular Gmail password
 *
 * To set up an App Password:
 * 1. Go to https://myaccount.google.com/security
 * 2. Enable 2-factor authentication if not already enabled
 * 3. Go to "2-Step Verification" > "App passwords"
 * 4. Generate a new app password for "Mail"
 */
export function createGmailTransporter(config: GmailConfig): Transporter {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.email,
      pass: config.password,
    },
  });
}

/**
 * Get the sender configuration from environment variables
 */
export function getGmailConfig(): GmailConfig | null {
  const email = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  const alias = process.env.GMAIL_ALIAS || process.env.EMAIL_FROM;
  const displayName = process.env.EMAIL_FROM_NAME || "BuildOS";

  if (!email || !password) {
    console.warn("Gmail configuration not found in environment variables");
    return null;
  }

  return {
    email,
    password,
    alias,
    displayName,
  };
}

/**
 * Format the "from" field for an email
 * If an alias is configured and verified in Gmail, it will be used
 * Otherwise, falls back to the authenticated Gmail account
 */
export function formatSender(config: GmailConfig): string {
  const senderEmail = config.alias || config.email;
  const senderName = config.displayName || "BuildOS";

  return `"${senderName}" <${senderEmail}>`;
}
