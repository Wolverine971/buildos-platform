# SMS Setup Guide

This guide walks you through setting up SMS notifications in BuildOS from scratch, including Twilio account setup, configuration, and testing.

## Prerequisites

- BuildOS platform deployed and running
- Admin access to Twilio account
- Access to environment variables
- Database migrations applied

## Step 1: Create Twilio Account

### 1.1 Sign Up for Twilio

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Create a new account
3. Verify your email address
4. Complete phone verification

### 1.2 Get Account Credentials

1. Navigate to Console Dashboard
2. Find your credentials:
   - **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token**: Click to reveal and copy

> ⚠️ **Security Note**: Never commit these credentials to version control

## Step 2: Configure Messaging Service

### 2.1 Create Messaging Service

1. Navigate to **Messaging > Services** in Twilio Console
2. Click **Create Messaging Service**
3. Configure service:
   ```
   Name: BuildOS SMS
   Use case: Notifications
   ```
4. Click **Create**

### 2.2 Add Sender Phone Numbers

1. In your Messaging Service, go to **Sender Pool**
2. Add phone numbers:
   - For testing: Use Twilio trial number
   - For production: Purchase dedicated numbers

#### Purchase Phone Numbers (Production)

```
1. Go to Phone Numbers > Buy a Number
2. Select country (e.g., United States)
3. Choose capabilities: SMS
4. Search for available numbers
5. Purchase number ($1-2/month typically)
6. Add to Messaging Service sender pool
```

### 2.3 Configure Messaging Service Settings

1. **Opt-Out Management**:
   - Enable automatic opt-out handling
   - Keywords: STOP, UNSUBSCRIBE, CANCEL

2. **Compliance**:
   - Enable sticky sender
   - Set validity period: 4 hours

3. **Advanced Features**:
   - Enable delivery receipts
   - Set status callback URL (we'll set this later)

Note your **Messaging Service SID**: `MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 3: Configure Verify Service (Optional)

For phone number verification:

### 3.1 Create Verify Service

1. Navigate to **Verify > Services**
2. Click **Create new Service**
3. Configure:
   ```
   Friendly name: BuildOS Verify
   ```
4. Click **Create**

### 3.2 Configure Verify Settings

1. **Channels**: Enable SMS
2. **Code Length**: 6 digits
3. **Code Validity**: 10 minutes
4. **Custom Messages** (optional):
   ```
   Your BuildOS verification code is: {{code}}
   ```

Note your **Verify Service SID**: `VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 4: Configure BuildOS Environment

### 4.1 Web App Configuration

Add to `apps/web/.env`:

```bash
# Twilio Configuration (Required)
PRIVATE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_AUTH_TOKEN=your_auth_token_here
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Twilio Verify (Optional - for phone verification)
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook URL (Replace with your domain)
PRIVATE_TWILIO_STATUS_CALLBACK_URL=https://your-app.com/api/webhooks/twilio/status

# Rate Limiting (Optional)
PRIVATE_SMS_RATE_LIMIT_PER_MINUTE=10
PRIVATE_SMS_RATE_LIMIT_PER_HOUR=100
```

### 4.2 Worker Configuration

Add to `apps/worker/.env`:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_STATUS_CALLBACK_URL=https://your-app.com/api/webhooks/twilio/status
```

## Step 5: Run Database Migration

### 5.1 Apply Migration

```bash
# From project root
cd apps/web

# Run the migration
pnpm supabase migration up
```

### 5.2 Verify Tables Created

Check in Supabase dashboard or run:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('sms_templates', 'sms_messages', 'user_sms_preferences');

-- Check SMS templates were seeded
SELECT * FROM sms_templates;
```

Expected templates:

- `task_reminder`
- `daily_brief_ready`
- `urgent_task`
- `welcome_sms`

## Step 6: Install Dependencies

```bash
# From project root
pnpm install

# Build the Twilio service package
pnpm build --filter=@buildos/twilio-service
```

## Step 7: Configure Webhook in Twilio

### 7.1 Set Status Callback URL

1. Go to your Messaging Service in Twilio Console
2. Navigate to **Integration**
3. Set **Status callback URL**:
   ```
   https://your-app.com/api/webhooks/twilio/status
   ```
4. Enable webhook for:
   - Message status changes
   - Incoming messages (if needed)

### 7.2 Configure Webhook Security

Twilio will sign webhook requests. Your app validates these automatically.

## Step 8: Test the Integration

### 8.1 Test Phone Verification

1. Log into BuildOS
2. Navigate to **Settings > SMS Preferences**
3. Enter your phone number
4. Click **Send Code**
5. Enter verification code
6. Confirm verification

### 8.2 Test SMS Sending

Using the database function:

```sql
-- Test sending an SMS
SELECT queue_sms_message(
  p_user_id := (SELECT id FROM auth.users WHERE email = 'your@email.com'),
  p_phone_number := '+15551234567', -- Your verified number
  p_message := 'Test message from BuildOS',
  p_priority := 'normal'::sms_priority
);

-- Check message status
SELECT * FROM sms_messages
ORDER BY created_at DESC
LIMIT 1;
```

### 8.3 Test Task Reminder

1. Create a task with due date
2. Enable task reminders in SMS preferences
3. Trigger reminder through UI or API

## Step 9: Configure User Preferences

### 9.1 Default Settings

Users need to:

1. Verify phone number
2. Enable desired notifications:
   - Calendar event reminders (working feature)
   - Daily brief SMS (via notification preferences, not SMS preferences)
   - Morning kickoff (future feature)
   - Evening recap (future feature)
3. Set quiet hours (optional)

**Important**: Daily brief SMS notifications are managed through the unified notification system at `/settings/notifications`, not in SMS preferences.

### 9.2 Admin Setup

For admin users, you might want to:

```sql
-- Pre-configure SMS preferences for admin
INSERT INTO user_sms_preferences (
  user_id,
  phone_number,
  phone_verified,
  event_reminders_enabled,
  morning_kickoff_enabled,
  evening_recap_enabled
) VALUES (
  (SELECT id FROM users WHERE email = 'admin@example.com'),
  '+15551234567',
  false, -- Still needs verification
  true,  -- Calendar event reminders
  false, -- Future feature
  false  -- Future feature
);
```

**Note**: Daily brief SMS is controlled via notification preferences (`user_notification_preferences.should_sms_daily_brief`), not SMS preferences.

## Step 10: Production Deployment

### 10.1 Pre-Launch Checklist

- [ ] Production phone numbers purchased
- [ ] Messaging Service configured
- [ ] Environment variables set in production
- [ ] Database migration applied
- [ ] Worker service deployed and running
- [ ] Webhook URL accessible from internet
- [ ] Rate limits configured appropriately
- [ ] Error monitoring setup

### 10.2 Monitoring Setup

Set up monitoring for:

```sql
-- Daily monitoring query
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivery_rate
FROM sms_messages
WHERE created_at >= CURRENT_DATE
GROUP BY DATE(created_at);
```

### 10.3 Cost Management

Monitor Twilio costs:

- SMS: ~$0.0075 per message (US)
- Phone numbers: $1-2/month
- Verify: ~$0.05 per verification

Set up billing alerts in Twilio Console.

## Troubleshooting

### Common Issues and Solutions

#### Issue: Phone verification not sending

**Check:**

1. Verify Service SID is correct
2. Phone number format (+1 for US)
3. Twilio account has credits
4. No rate limiting active

**Debug:**

```bash
# Check logs
tail -f apps/web/logs/error.log | grep -i twilio

# Test Twilio connection
curl https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN
```

#### Issue: Messages stuck in queue

**Check:**

1. Worker service is running
2. Queue processing is active
3. Database connection is working

**Debug:**

```sql
-- Check queue status
SELECT * FROM queue_jobs
WHERE job_type = 'send_sms'
AND status IN ('pending', 'processing')
ORDER BY created_at DESC;

-- Check for errors
SELECT * FROM sms_messages
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 hour';
```

#### Issue: Webhooks not working

**Check:**

1. URL is publicly accessible
2. HTTPS certificate is valid
3. Signature validation passing
4. No firewall blocking Twilio IPs

**Test webhook:**

```bash
# Simulate Twilio webhook
curl -X POST https://your-app.com/api/webhooks/twilio/status \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&MessageStatus=delivered"
```

### Error Codes Reference

| Code  | Issue                    | Solution                |
| ----- | ------------------------ | ----------------------- |
| 21211 | Invalid phone number     | Check format, use E.164 |
| 21614 | Number can't receive SMS | Use mobile number       |
| 20003 | Authentication failed    | Check credentials       |
| 30003 | Unreachable destination  | Verify number exists    |

## Best Practices

### Security

1. **Never expose credentials** in client-side code
2. **Validate phone numbers** before sending
3. **Implement rate limiting** to prevent abuse
4. **Log all SMS operations** for audit trail

### Compliance

1. **Get explicit consent** before sending
2. **Include opt-out** in messages
3. **Respect quiet hours** settings
4. **Keep messages professional** and relevant

### Cost Optimization

1. **Use templates** to avoid repetitive API calls
2. **Batch messages** when possible
3. **Monitor delivery rates** and investigate failures
4. **Clean up** old message records regularly

### User Experience

1. **Verify phones** before critical notifications
2. **Provide clear opt-out** instructions
3. **Respect user preferences** immediately
4. **Keep messages short** and actionable

## Next Steps

After setup:

1. **Test with small group** before full rollout
2. **Monitor delivery rates** for first week
3. **Collect user feedback** on message timing
4. **Optimize templates** based on engagement
5. **Set up alerting** for delivery failures

## Support Resources

- [Twilio Documentation](https://www.twilio.com/docs/sms)
- [BuildOS SMS Integration Docs](../sms-integration.md)
- [API Reference](../api/sms-api-reference.md)
- [Testing Guide](./sms-testing-guide.md)

For help:

- Check Twilio Console for API errors
- Review BuildOS logs for application errors
- Contact support with message IDs for investigation
