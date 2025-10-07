# Email System Overview

This document explains how BuildOS persists and tracks outgoing email, the tables involved, and the service layer APIs you should use.

**Last Updated**: 2025-10-06

## Quick Links

- **Email Tracking Flow**: See [Notification Tracking Integration](#notification-tracking-integration)
- **Click Tracking**: See [Email Click Tracking](#email-click-tracking)
- **Research Docs**: [`thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md`](/thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md)

## Data Model

### `emails`

- Represents a composed email message.
- Key columns: `id`, `subject`, `content` (HTML body), `from_email`, `from_name`, `tracking_enabled`, `tracking_id`, `status`, `sent_at`, `created_by`, `template_data`.
- When `tracking_enabled` is true, `tracking_id` stores the UUID used by `/api/email-tracking/[tracking_id]` to log opens.
- `template_data` is a JSON payload for templating metadata (LLM prompts, campaign tags, etc.).

### `email_recipients`

- Child table linking messages to each recipient.
- Key columns: `id`, `email_id`, `recipient_email`, `recipient_id` (nullable user FK), `recipient_type`, `status`, `sent_at`, `opened_at`, `last_opened_at`, `open_count`, `error_message`.
- Populated when a message is sent so we can track delivery/open status per recipient.

### `email_logs`

- Audit log of every attempt (success or failure) to send an email.
- Key columns: `id`, `user_id` (nullable), `to_email`, `subject`, `body`, `status`, `sent_at`, `error_message`, `metadata`.
- `metadata` includes service specific context (e.g. `message_id`, `sender_type`, `tracking_id`, campaign identifiers).
- `user_id` enables rate limiting and user scoped queries.

### `email_tracking_events`

- Append-only table recording `sent`, `failed`, or `opened` events.
- Key columns: `id`, `email_id`, `recipient_id`, `event_type`, `event_data`, `user_agent`, `ip_address`, `created_at`.
- Populated by `/api/email-tracking/[tracking_id]` when the tracking pixel is requested and by sender flows for `sent`/`failed` events.

## Sending Flow

1. **Compose and send** via `EmailService.sendEmail`.
    - Accepts `EmailData` containing plain text and optional HTML. If HTML is omitted, the service renders a styled template and injects the tracking pixel when `trackingEnabled` is true (default).
    - Callers should supply `userId` (if known) and any contextual metadata.
2. **SMTP dispatch** happens through a Gmail transporter chosen by `SenderType` or sender email.
3. **Persistence**:
    - `emails` stores the rendered HTML, sender info, tracking settings, and metadata.
    - `email_recipients` creates/updates a row per recipient with status `sent` or `failed`.
    - `email_logs` records the attempt, including the external `message_id` and `tracking_id`.
4. **Tracking pixel** (`<img src="/api/email-tracking/<tracking_id>" ...>`): when the recipient opens the email, `email_recipients` timestamps/bumps counts via the tracking API and a matching `email_tracking_events` row is inserted.

## Service Usage

### Core sender

```ts
const emailService = new EmailService(supabase);
await emailService.sendEmail({
	to: user.email,
	subject: 'Welcome to BuildOS',
	body: plainTextBody,
	html: renderedHtml,
	userId: user.id,
	metadata: {
		campaign: 'welcome-series',
		generated_by_llm: false
	}
});
```

### LLM generated messages

- `EmailGenerationService.logGeneratedEmail` writes a draft record into `email_logs` with `metadata.generated_by_llm = true` and `user_id` set for rate limiting.
- When promoted to an actual send, call `EmailService.sendEmail` so the final message routes through the same tracking pipeline.

### Scheduled/Admin sends

- Admin UI saves content into `emails` first, then calls `/api/admin/emails/[id]/send` which loops through recipients, dispatches via Gmail, emits `email_tracking_events`, and relies on the shared HTML renderer to append the pixel.

## Best Practices

- Always include `userId` when the recipient is a registered user. This keeps rate limits (`EmailGenerationService.checkRateLimit`) accurate and enables user scoped history queries.
- Prefer sending HTML through `EmailService`. It ensures consistent styling plus automatic tracking pixel injection.
- Store campaign or experiment context inside `metadata` (camelCase keys) so analytics can filter by `email_logs.metadata`.
- For multi-recipient blasts, deduplicate recipient emails before sending to avoid redundant records in `email_recipients`.
- When creating new flows, do not call Gmail directly—route everything through `EmailService` so the tracking tables stay in sync.

## Notification Tracking Integration

**Status**: ✅ Implemented (2025-10-06)

Email tracking is now integrated with the notification delivery system to provide unified analytics across all notification channels (email, SMS, push, in-app).

### Architecture

```
Email Opened/Clicked
  ↓
/api/email-tracking/[tracking_id]
/api/email-tracking/[tracking_id]/click
  ↓
Updates TWO systems:
├─ email_recipients (email-specific tracking)
└─ notification_deliveries (unified notification tracking)
  ↓
Analytics Dashboard (/admin/notifications)
```

### How It Works

**Open Tracking** (`/api/email-tracking/[tracking_id]/+server.ts`):

1. Email client loads tracking pixel
2. Endpoint finds email by `tracking_id`
3. Updates `email_recipients.opened_at` (existing behavior)
4. **NEW**: Also updates `notification_deliveries.opened_at` via `emails.template_data.delivery_id`
5. Sets `notification_deliveries.status = 'opened'`
6. Returns 1x1 transparent PNG

**Click Tracking** (`/api/email-tracking/[tracking_id]/click/+server.ts`):

1. User clicks rewritten link in email
2. Endpoint receives `?url=destination` parameter
3. Updates `email_recipients.clicked_at`
4. Logs to `email_tracking_events` with event_type='clicked'
5. **NEW**: Updates `notification_deliveries.clicked_at` and `opened_at` (click implies open)
6. Sets `notification_deliveries.status = 'clicked'`
7. Redirects to destination URL (302)

### Link Rewriting

All links in emails are automatically rewritten to go through click tracking:

**Original HTML**:

```html
<a href="https://build-os.com/app/briefs">View Your Brief</a>
```

**Rewritten HTML**:

```html
<a
	href="https://build-os.com/api/email-tracking/abc123/click?url=https%3A%2F%2Fbuild-os.com%2Fapp%2Fbriefs"
	>View Your Brief</a
>
```

**Implementation**:

- `email-service.ts` (web app) - `rewriteLinksForTracking()` method
- `emailAdapter.ts` (worker) - `rewriteLinksForTracking()` function
- Skips already-tracked links and anchor links (`#` links)

### Linking Email to Notifications

The connection is established via `emails.template_data`:

```typescript
// When emailAdapter creates email for notification
template_data: {
  delivery_id: delivery.id,  // Links to notification_deliveries.id
  event_id: delivery.event_id,
  event_type: delivery.payload.event_type,
}
```

Tracking endpoints use `template_data.delivery_id` to find and update the corresponding `notification_deliveries` record.

## Email Click Tracking

**Status**: ✅ Implemented (2025-10-06)

### Flow

```
User clicks link in email
  ↓
GET /api/email-tracking/{tracking_id}/click?url={destination}
  ↓
1. Find email by tracking_id
2. Update email_recipients.clicked_at
3. Log to email_tracking_events
4. Update notification_deliveries (if linked)
5. HTTP 302 redirect to destination URL
  ↓
User lands on destination page
```

### Implementation Files

- **Endpoint**: `/api/email-tracking/[tracking_id]/click/+server.ts`
- **Web Link Rewriting**: `email-service.ts:183-202` (`rewriteLinksForTracking()`)
- **Worker Link Rewriting**: `emailAdapter.ts:21-40` (`rewriteLinksForTracking()`)

### Click Implies Open

When a click is tracked and `notification_deliveries.opened_at` is NULL, the endpoint automatically sets it to the click timestamp. This ensures accurate analytics since clicking a link necessarily means the email was opened.

```typescript
const updates: { clicked_at?: string; opened_at?: string; status?: string } = {};
if (!delivery.clicked_at) updates.clicked_at = now;
if (!delivery.opened_at) updates.opened_at = now; // Click implies open
updates.status = 'clicked';
```

## Debugging Tips

- Use Supabase console to inspect recent rows in `email_logs` and `emails` to confirm tracking IDs.
- If opens are not being recorded, verify the rendered HTML contains the `<img>` pixel and the `tracking_id` exists in `emails`.
- Track API logs for `/api/email-tracking/[tracking_id]`; it logs lookups and any update errors, which helps diagnose missing recipient rows or RLS issues.
- **For notification tracking**: Check `notification_deliveries.opened_at` and `clicked_at` are being updated via `emails.template_data.delivery_id` link.
- **For click tracking**: Verify links in email HTML are rewritten to include `/click?url=` parameter. Check network tab to see redirect flow.
- **Test queries**:
    ```sql
    -- Check email and notification tracking sync
    SELECT
      e.id as email_id,
      e.tracking_id,
      er.opened_at as email_opened,
      er.clicked_at as email_clicked,
      nd.opened_at as notif_opened,
      nd.clicked_at as notif_clicked,
      nd.status as notif_status
    FROM emails e
    LEFT JOIN email_recipients er ON er.email_id = e.id
    LEFT JOIN notification_deliveries nd ON (e.template_data->>'delivery_id')::uuid = nd.id
    WHERE e.tracking_enabled = true
    ORDER BY e.created_at DESC
    LIMIT 10;
    ```
