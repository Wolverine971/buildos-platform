# Email Tracking Implementation

## Overview

The daily brief emails now include comprehensive tracking capabilities to monitor email delivery and open rates. This helps understand user engagement with automated daily briefs.

## Features

### 1. **Tracking Pixel**
- 1x1 transparent PNG pixel embedded in email HTML
- Loads from `/api/email-tracking/:trackingId` endpoint
- Fires when email is opened in clients that load images

### 2. **Database Records**
- **emails table**: Main email record with tracking ID
- **email_recipients table**: Recipient-specific tracking
- **email_tracking_events table**: Detailed event logging

### 3. **Tracking Data Collected**
- First open timestamp
- Total open count
- Last opened timestamp
- User agent information
- IP address (for analytics)

## Implementation Details

### Email Sending Flow

1. **Generate Tracking ID**: 32-character hex string using crypto.randomBytes
2. **Create Email Record**: Insert into `emails` table with:
   - `tracking_id`: Unique identifier
   - `tracking_enabled`: Boolean flag
   - `status`: 'pending' -> 'sent'
   - `category`: 'daily_brief'

3. **Create Recipient Record**: Insert into `email_recipients` table:
   - Links to email record
   - Stores recipient email
   - Tracks delivery and open metrics

4. **Embed Tracking Pixel**: Add to email HTML:
   ```html
   <img src="https://build-os.com/api/email-tracking/{trackingId}" 
        width="1" height="1" style="display:none;" alt="" />
   ```

5. **Send Email**: Via Gmail SMTP with tracking metadata

### Tracking Endpoint

The `/api/email-tracking/:trackingId` endpoint:

1. Returns a 1x1 transparent PNG (always, for privacy)
2. Looks up email by tracking ID
3. Updates recipient open metrics
4. Logs tracking event with metadata
5. Handles errors gracefully

### Database Schema

#### emails table
```sql
- id: UUID
- tracking_id: String (unique)
- tracking_enabled: Boolean
- status: String ('pending', 'sent', 'failed')
- subject, content, from_email, from_name
- created_by: User ID
- sent_at: Timestamp
```

#### email_recipients table
```sql
- id: UUID
- email_id: Foreign key to emails
- recipient_email: String
- recipient_type: String ('to', 'cc', 'bcc')
- delivered_at: Timestamp
- opened_at: First open timestamp
- open_count: Integer
- last_opened_at: Most recent open
```

#### email_tracking_events table
```sql
- id: UUID
- email_id: Foreign key to emails
- recipient_id: Foreign key to email_recipients
- event_type: String ('opened', 'clicked', etc.)
- event_data: JSONB (additional metadata)
- user_agent: String
- ip_address: String
- created_at: Timestamp
```

## Privacy Considerations

- Tracking is transparent - users are informed in email footer
- Users can disable tracking via preferences
- Pixel always returns even if tracking fails (no user detection)
- IP addresses are stored for analytics only
- All data respects user privacy settings

## Testing

Run the tracking tests:
```bash
pnpm tsx tests/test-email-tracking.ts
```

This verifies:
- Tracking ID generation
- Pixel embedding
- URL transformation compatibility
- Database record creation

## Configuration

Tracking can be controlled via:
- User preferences: `email_daily_brief` in `user_brief_preferences`
- Per-email basis: `tracking_enabled` flag
- Environment: Can be disabled globally if needed

## Monitoring

Track email performance via:
- Email open rates by querying `email_recipients`
- Delivery success via `emails.status`
- Event timeline in `email_tracking_events`
- Failed deliveries in `email_logs`

## API Endpoints

### Email Tracking Pixel
```
GET /api/email-tracking/:trackingId
```
Returns: 1x1 transparent PNG
Side effects: Updates tracking metrics

### Queue Stats (includes email metrics)
```
GET /queue/stats
```
Returns: Queue statistics including email job counts

## Future Enhancements

- [ ] Click tracking for links
- [ ] Unsubscribe link tracking
- [ ] Email client detection
- [ ] Geographic analytics
- [ ] A/B testing support
- [ ] Bounce handling
- [ ] Engagement scoring