<!-- apps/worker/docs/features/EMAIL_SYSTEM_OVERVIEW.md -->

# Email System Overview

This document explains how BuildOS persists and tracks outgoing email, the tables involved, and the service layer APIs you should use.

## LLM Model Configuration for Email Generation

### Cost-Optimized Model Selection

The email system now uses **DeepSeek Chat V3** as the primary LLM for generating email content, replacing Anthropic models for significant cost savings:

- **Previous**: Claude 3.5 Sonnet ($3.00/$15.00 per 1M tokens input/output)
- **Current**: DeepSeek Chat V3 ($0.14/$0.28 per 1M tokens input/output)
- **Cost Reduction**: ~95% reduction in LLM costs

### Configuration Details

- The `SmartLLMService` (`src/lib/services/smart-llm-service.ts`) has been configured to prioritize DeepSeek across all quality profiles
- Daily brief generation uses `profile: 'quality'` which now routes to DeepSeek instead of Claude
- Fallback models: Qwen 2.5 72B, Google Gemini Flash 1.5
- DeepSeek provides excellent structured content generation and instruction following, ideal for email briefs

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

## Debugging Tips

- Use Supabase console to inspect recent rows in `email_logs` and `emails` to confirm tracking IDs.
- If opens are not being recorded, verify the rendered HTML contains the `<img>` pixel and the `tracking_id` exists in `emails`.
- Track API logs for `/api/email-tracking/[tracking_id]`; it logs lookups and any update errors, which helps diagnose missing recipient rows or RLS issues.
