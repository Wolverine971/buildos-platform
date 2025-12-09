---
date: 2025-09-26T21:14:50Z
researcher: Claude
git_commit: 332906fe5bbb9688f7273ea9eefa878fadd72a2d
branch: main
repository: daily-brief-worker
topic: 'Email Sending Failure in Railway Production - SMTP Connection Timeout'
tags: [research, email, railway, smtp, production-issue, nodemailer, gmail]
status: complete
last_updated: 2025-09-26
last_updated_by: Claude
path: apps/worker/thoughts/shared/research/2025-09-26_21-14-50_email_sending_railway_production_issue.md
---

# Research: Email Sending Failure in Railway Production - SMTP Connection Timeout

**Date**: 2025-09-26T21:14:50Z  
**Researcher**: Claude  
**Git Commit**: 332906fe5bbb9688f7273ea9eefa878fadd72a2d  
**Branch**: main  
**Repository**: daily-brief-worker

## Research Question

Emails are not being sent in production on Railway. Manual brief generation succeeds but fails to send emails with a connection timeout error (`ETIMEDOUT` on `CONN` command). The Gmail transporter initializes successfully but cannot establish SMTP connection.

## Summary

**Root Cause**: Railway blocks outbound SMTP ports (587, 465) on Free, Trial, and Hobby plans as of 2025. This is a platform-level restriction that prevents Gmail SMTP connections via nodemailer.

**Impact**: All email sending fails with connection timeout, though brief generation completes successfully due to graceful error handling.

**Solution**: Either upgrade to Railway Pro plan ($5-10/month) or implement HTTP-based email service (AWS SES, SendGrid, Resend, etc.).

## Detailed Findings

### Railway Platform SMTP Restrictions

**Critical Discovery**: Railway implemented SMTP port blocking on lower-tier plans (Free, Trial, Hobby) in early 2025 for security and anti-spam reasons.

- **Blocked Ports**: 587 (TLS), 465 (SSL) - standard SMTP ports
- **Affected Plans**: Free, Trial, Hobby tiers
- **Working Plans**: Pro plan and above ($5-10/month)
- **Implementation Date**: Within last few weeks (as of 2025-09-26)
- **Error Symptom**: `ETIMEDOUT` with command `CONN` when connecting to `smtp.gmail.com`

This explains why the same code works locally but fails on Railway deployment.

### Current Email Implementation

#### Gmail SMTP Configuration

- **Transport**: nodemailer v7.0.6 with Gmail service
- **Configuration**: `/Users/annawayne/daily-brief-worker/src/lib/services/gmail-transporter.ts:26-34`
- **Required Env Variables**:
    - `GMAIL_USER`: Gmail account email
    - `GMAIL_APP_PASSWORD`: 16-character app-specific password
- **Optional Variables**:
    - `GMAIL_ALIAS` or `EMAIL_FROM`: Custom sender address
    - `EMAIL_FROM_NAME`: Display name (default: "BuildOS")

#### Email Service Architecture

- **Main Service**: `/Users/annawayne/daily-brief-worker/src/lib/services/email-service.ts:26`
- **Email Sender**: `/Users/annawayne/daily-brief-worker/src/lib/services/email-sender.ts:22`
- **Brief Worker Integration**: `/Users/annawayne/daily-brief-worker/src/workers/brief/briefWorker.ts:61-76`

#### Error Handling Strategy

- **Graceful Degradation**: Email failures don't fail the entire job
- **Database Tracking**: Failed emails logged to `email_logs` table with error details
- **Status Updates**: `emails` and `email_recipients` tables updated with failure status
- **User Notification**: Brief completion notification still sent via Supabase Realtime

### Log Analysis

From production logs:

```
✉️ Gmail transporter initialized  // Transporter created successfully
🎉 Daily brief generated successfully for user 255735ad-a34b-4ca9-942c-397ed8cc1435
❌ Error sending email: Error: Connection timeout
    at SMTPConnection._formatError (nodemailer/lib/smtp-connection/index.js:809:19)
    code: 'ETIMEDOUT',
    command: 'CONN'  // Failed at connection establishment
📢 Sent notification to user 255735ad-a34b-4ca9-942c-397ed8cc1435: brief_completed
✅ Completed brief generation  // Job succeeds despite email failure
```

## Code References

### Key Implementation Files

- `src/lib/services/gmail-transporter.ts:26-34` - Gmail transporter creation
- `src/lib/services/email-service.ts:37` - "Gmail transporter initialized" log
- `src/lib/services/email-service.ts:134-162` - Email error handling
- `src/lib/services/email-sender.ts:167-297` - sendDailyBriefEmail implementation
- `src/workers/brief/briefWorker.ts:72-75` - Email failure catch block
- `railway.json` - Railway deployment configuration

### Database Tables for Email Tracking

- `emails` - Main email records with status tracking
- `email_recipients` - Per-recipient tracking
- `email_tracking_events` - Event logging (sent, opened, failed)
- `email_logs` - Detailed send attempt logs with error messages

## Architecture Insights

### Current Design Patterns

1. **Separation of Concerns**: Email sending isolated from core brief generation
2. **Graceful Degradation**: System continues functioning when email fails
3. **Comprehensive Tracking**: All email attempts logged for debugging
4. **Opt-in Compliance**: Checks user preferences before sending

### Limitations Discovered

1. **No Email Retries**: Failed emails not automatically retried
2. **No Dead Letter Queue**: No mechanism for persistent failures
3. **No Circuit Breaker**: No protection against cascading failures
4. **SMTP-Only**: Currently hardcoded to Gmail SMTP, no provider abstraction

## Solutions and Recommendations

### Immediate Solutions (Ranked by Feasibility)

#### 1. **Implement AWS SES (Recommended)**

- **Advantages**:
    - SDK already installed (`@aws-sdk/client-sesv2@3.883.0`)
    - HTTP-based (bypasses SMTP restrictions)
    - 200 free emails/day, 62,000/month from EC2
    - Production-ready with high deliverability
- **Implementation Path**:
    ```typescript
    // Add to email-service.ts alongside Gmail
    import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
    ```

#### 2. **Add SendGrid Integration**

- **Advantages**:
    - 100 free emails/day forever
    - Excellent deliverability and analytics
    - Simple HTTP API
- **Implementation**: Add `@sendgrid/mail` package and API key

#### 3. **Use Resend (Modern Alternative)**

- **Advantages**:
    - Developer-friendly API
    - 100 free emails/day
    - Built for modern applications
- **Implementation**: Add `resend` package and API key

#### 4. **Upgrade to Railway Pro Plan**

- **Cost**: $5-10/month
- **Advantages**: No code changes needed
- **Disadvantages**: Ongoing cost, still dependent on SMTP

### Long-term Architecture Improvements

1. **Provider Abstraction Layer**:

    ```typescript
    interface EmailProvider {
      send(data: EmailData): Promise<void>;
      validateConfig(): boolean;
    }

    class GmailProvider implements EmailProvider { ... }
    class SESProvider implements EmailProvider { ... }
    class SendGridProvider implements EmailProvider { ... }
    ```

2. **Email Retry Queue**:
    - Add `retry_email` job type
    - Implement exponential backoff
    - Track retry attempts in database

3. **Circuit Breaker Pattern**:
    - Prevent cascading failures
    - Auto-recovery after cooldown
    - Failover to backup provider

## Related Research

- Railway documentation on network restrictions
- Nodemailer SMTP troubleshooting guide
- AWS SES vs SendGrid comparison for transactional emails

## Open Questions

1. What is the expected email volume? This affects provider choice.
2. Are there compliance requirements (GDPR, CAN-SPAM) to consider?
3. Should we implement email provider failover for high availability?
4. Is email analytics/tracking a requirement for the business?

## Conclusion

The production email failure is caused by Railway's platform-level SMTP port blocking on lower-tier plans, not a code issue. The immediate solution is to implement an HTTP-based email service (AWS SES recommended due to existing SDK). This will resolve the connection timeout issue and provide better scalability than SMTP.
