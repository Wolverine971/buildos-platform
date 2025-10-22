# Email Setup Guide for Daily Brief Worker

This guide explains how to configure email sending for the Daily Brief Worker using Gmail with an optional custom sender alias.

## Overview

The Daily Brief Worker can automatically send formatted HTML emails to users when their daily briefs are generated. The system uses Gmail with app-specific passwords for security and supports custom sender aliases like `noreply@build-os.com`.

## Prerequisites

1. A Gmail account for sending emails
2. Two-factor authentication enabled on the Gmail account
3. (Optional) A custom domain with email forwarding for aliases

## Setup Steps

### 1. Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click on "2-Step Verification"
3. Follow the setup process if not already enabled

### 2. Generate an App Password

1. In your Google Account settings, go to Security
2. Under "2-Step Verification", click on "App passwords"
3. Select "Mail" from the app dropdown
4. Select "Other" from the device dropdown
5. Enter "BuildOS Worker" as the name
6. Click "Generate"
7. **Save the 16-character password** - you'll need this for configuration

### 3. Configure Environment Variables

Add these to your `.env` file:

```bash
# Required Gmail Configuration
GMAIL_USER=your-gmail-account@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # The 16-character app password

# Optional Sender Configuration
GMAIL_ALIAS=noreply@build-os.com        # Custom sender address (must be verified)
EMAIL_FROM_NAME=BuildOS                # Display name in emails
```

### 4. (Optional) Set Up a Custom Sender Alias

To send emails from a custom address like `noreply@build-os.com`:

#### Option A: Using Gmail's "Send mail as" Feature

1. **In Gmail Settings:**
    - Go to Settings → Accounts → "Send mail as"
    - Click "Add another email address"
    - Enter your alias (e.g., `noreply@build-os.com`)
    - Uncheck "Treat as an alias" if you want replies to go to the alias
    - Click "Next Step"

2. **Verify the Address:**
    - Gmail will attempt to send a verification email
    - You'll need access to receive emails at this address
    - Enter the verification code or click the link in the email

3. **Configure SMTP (if required):**
    - SMTP Server: `smtp.gmail.com`
    - Port: `587` (TLS) or `465` (SSL)
    - Username: Your Gmail address
    - Password: Your app password

#### Option B: Using Google Workspace

If you have Google Workspace for your domain:

1. Create a user or group alias for `noreply@build-os.com`
2. Add it as a sending alias in Gmail
3. No additional verification needed

#### Option C: Email Forwarding Service

If you can't receive emails at the alias:

1. Set up email forwarding from `noreply@build-os.com` to your Gmail
2. Use a service like Cloudflare Email Routing or your domain registrar's forwarding
3. Once forwarding works, follow Option A to add and verify the alias

## Testing Your Configuration

### 1. Test Configuration

Run the test script to verify your setup:

```bash
# Check configuration
pnpm tsx tests/test-email.ts

# Send a test email
pnpm tsx tests/test-email.ts your-email@example.com
```

### 2. Test with Worker

To test email sending with actual brief generation:

```bash
# Start the worker
pnpm dev

# In another terminal, trigger a brief generation
curl -X POST http://localhost:3001/queue/brief \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-id"}'
```

## How It Works

1. **User Opt-in**: Users must have `email_daily_brief = true` in the `user_brief_preferences` table
2. **Brief Generation**: When a brief is successfully generated, the worker checks for email opt-in
3. **Email Formatting**: The markdown brief content is converted to styled HTML
4. **Sending**: Email is sent via Gmail SMTP with proper authentication
5. **Logging**: All email attempts are logged in the `email_logs` table

## Email Template

The daily brief emails include:

- Styled HTML formatting with responsive design
- Your daily brief content with tasks, notes, and priorities
- Links to view the brief in the BuildOS app
- Link to manage email preferences
- Professional branding and layout

## Troubleshooting

### "Invalid login" Error

- Ensure you're using an app password, not your regular Gmail password
- Check that 2-factor authentication is enabled
- Verify the app password is entered correctly (no spaces)

### "Invalid sender" Error

- The alias must be verified in Gmail settings
- Check Gmail → Settings → Accounts → "Send mail as"
- Ensure the alias email address actually exists and can receive mail

### Emails Not Sending

1. Check environment variables are set correctly
2. Verify user has `email_daily_brief = true` in preferences
3. Check `email_logs` table for error messages
4. Review worker logs for detailed error information

### Gmail Limits

- Gmail has sending limits: 500 emails/day for regular accounts
- Consider using Google Workspace or a dedicated email service for higher volumes

## Security Notes

1. **Never commit credentials**: Keep `.env` file in `.gitignore`
2. **Use app passwords**: Never use your main Gmail password
3. **Rotate passwords**: Periodically generate new app passwords
4. **Monitor logs**: Check `email_logs` table for suspicious activity
5. **Rate limiting**: Implement rate limiting for production use

## Alternative Email Services

If Gmail doesn't meet your needs, the email service can be adapted for:

- SendGrid
- AWS SES
- Postmark
- Resend
- Mailgun

Simply modify `src/lib/services/email-service.ts` to use your preferred provider's SDK.

## Database Schema

The system uses these tables for email functionality:

```sql
-- User preferences
user_brief_preferences (
  email_daily_brief: boolean  -- Opt-in flag for email notifications
)

-- Email logging
email_logs (
  to_email: string
  subject: string
  body: string
  status: string  -- 'sent', 'failed', 'simulated'
  error_message: string?
  metadata: json
  sent_at: timestamp
)
```
