---
date: 2025-10-07T02:45:00-07:00
researcher: Claude
git_commit: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
branch: main
repository: buildos-platform
topic: "Notification Test-Bed Page Redesign Specification"
tags: [research, notifications, admin, ui-spec, test-bed]
status: complete
last_updated: 2025-10-07
last_updated_by: Claude
---

# Research: Notification Test-Bed Page Redesign Specification

**Date**: 2025-10-07T02:45:00-07:00
**Researcher**: Claude
**Git Commit**: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should the `/admin/notifications/test-bed` page be redesigned to model the email flow pattern from `/admin/users` (EmailComposerModal) to enable admins to pull up user data at will and send different types of notifications?

## Summary

The current notification test-bed page uses a linear 4-step flow that's functional but doesn't provide the rich user context and flexibility found in the email composer. By modeling it after the EmailComposerModal pattern, we can create a more powerful tool that:

1. Loads comprehensive user context when a user is selected
2. Displays user activity, preferences, and notification subscription status
3. Provides intelligent defaults based on user state
4. Allows testing different notification types with real user data
5. Maintains a clear workflow: User Selection → Notification Configuration → Preview → Send

## Current Implementation Analysis

### Current Test-Bed Flow (apps/web/src/routes/admin/notifications/test-bed/+page.svelte)

**Structure:**
- **Step 1:** Select Event Type (dropdown with 3 predefined events)
- **Step 2:** Configure Payload (text inputs for payload fields)
- **Step 3:** Select Recipients (search with debounced lookup)
- **Step 4:** Select Channels (checkboxes for push, email, sms, in_app)

**Strengths:**
- Simple, linear flow
- Clear step-by-step process
- Good recipient search with debouncing
- Shows channel availability per user (push subscriptions, phone numbers)

**Limitations:**
- No user context beyond basic info (email, name)
- Limited event types (only 3 hardcoded)
- Payload configuration is generic text inputs
- No preview of what will be sent
- No history or tracking of tests within the page
- Can't easily test multiple notification types for same user

### Email Composer Pattern (apps/web/src/lib/components/admin/EmailComposerModal.svelte)

**Key Features:**
- **User Context Loading** (line 119-149): Fetches rich user data when modal opens
- **Context Panel** (line 372): Collapsible panel with user info, beta status, activity
- **Template Selection** (line 377-397): Predefined templates with smart defaults
- **Tone Options** (line 400-425): Professional, friendly, casual
- **Dual Editor Mode** (line 334-362): Manual, AI-generated, or split view
- **System Prompt Customization** (line 456-508): Advanced users can modify AI prompts
- **Preview & Copy** (line 218-232): Copy to clipboard before sending
- **Send Confirmation** (line 234-274): Confirm before sending with clear recipient

**Pattern Strengths:**
- Rich user context helps personalize communications
- Multiple modes (manual, AI, split) accommodate different workflows
- Clear preview of what will be sent
- Template system provides quick starting points
- Expandable/collapsible sections keep UI manageable

## Proposed Redesign Specification

### Architecture

**Main Components:**
1. **User Search & Selection** (inspired by admin/users table)
2. **User Context Panel** (inspired by EmailComposerModal)
3. **Notification Type Selector**
4. **Payload Configuration**
5. **Channel Selection & Preview**
6. **Send/Test Controls**

### Detailed Specification

#### 1. User Search & Selection

**Layout:** Top section, similar to admin/users search bar

**Features:**
- Search input with debounced lookup (reuse existing `notificationTestService.searchRecipients`)
- Search by email, name, or user ID
- Display search results in a dropdown or inline list
- Show key user info in results:
  - Avatar/initials
  - Name and email
  - Admin badge if applicable
  - Channel availability indicators (📱 Push, 📧 Email, 📞 SMS)
  - Last activity indicator

**Behavior:**
- When user is selected, load full context immediately
- Support multi-select mode (optional, for bulk testing)
- "Clear selection" button to start over

**API Endpoints:**
- Existing: `GET /api/admin/notifications/recipients/search?q={query}`
- New: `GET /api/admin/users/{userId}/context` (already exists for email composer)

#### 2. User Context Panel

**Location:** Collapsible panel below user selection

**Content Sections:**

**A. Basic Info**
- Name, email, member since
- Subscription status (free, trial, paid)
- Last active date
- Admin status

**B. Notification Preferences** (NEW - key differentiator from email)
- Table showing event types and channel preferences
- Format:
  ```
  Event Type              | Push | Email | SMS | In-App | Subscribed
  -------------------------|------|-------|-----|--------|------------
  brief.completed          | ✓    | ✓     | ✗   | ✓      | Yes
  brief.failed             | ✓    | ✓     | ✗   | ✓      | Yes
  task.due_soon            | ✗    | ✓     | ✗   | ✓      | No
  ```
- Show quiet hours if configured
- Show rate limits if configured

**C. Activity Summary**
- Projects: count (with link to view)
- Brain dumps: count
- Tasks created/completed
- Briefs generated: count
- Phase generation status

**D. Channel Capabilities** (NEW)
- **Push Subscriptions:** Count of active subscriptions, devices
- **Email:** Verified status, bounce history
- **SMS:** Phone number (if available), opt-in status
- **In-App:** Always available

**E. Recent Notifications** (NEW - valuable context)
- Last 5 notifications sent to this user
- Format: `[Event Type] via [Channel] - [Status] - [Date]`
- Click to view details

**Implementation:**
- Reuse `UserContextPanel` component from email composer
- Extend with new `NotificationContextSection` component
- API: Create new endpoint `GET /api/admin/users/{userId}/notification-context`

#### 3. Notification Type Selector

**Layout:** Dropdown or radio group

**Available Event Types (from shared-types/src/notification.types.ts):**

**Admin Events:**
- `user.signup` - New user signup notification
- `user.trial_expired` - Trial expiration notice
- `payment.failed` - Payment failure alert
- `error.critical` - Critical error notification

**User Events:**
- `brief.completed` - Daily brief ready notification
- `brief.failed` - Daily brief generation failed
- `brain_dump.processed` - Brain dump processing complete
- `task.due_soon` - Task due reminder
- `project.phase_scheduled` - Phase scheduling notification
- `calendar.sync_failed` - Calendar sync failure alert

**Features:**
- Each event type has description tooltip
- Show if event is admin-only
- Show if user is subscribed to this event type
- Warning if user has disabled this notification type
- Sample payload preview for each type

**Behavior:**
- When event type selected, auto-populate payload with intelligent defaults
- Load payload template based on selected user's actual data where possible
- Example: For `brief.completed`, use real brief count and recent project names

#### 4. Payload Configuration

**Layout:** Two modes (toggle between them)

**A. Form Mode (Default):**
- Dynamic form fields based on selected event type
- Use typed payload interfaces from `notification.types.ts`:
  - `UserSignupEventPayload`
  - `BriefCompletedEventPayload`
  - `BriefFailedEventPayload`
  - `BrainDumpProcessedEventPayload`
  - `TaskDueSoonEventPayload`
  - `ProjectPhaseScheduledEventPayload`
  - `CalendarSyncFailedEventPayload`
- Smart field types:
  - Text inputs for strings
  - Number inputs for counts
  - Date pickers for dates
  - Selects for enums
- Validation based on types
- "Use Real Data" button - populates from user's actual records

**B. JSON Mode (Advanced):**
- Raw JSON editor with syntax highlighting
- JSON validation
- "Format JSON" button
- Toggle between form and JSON mode
- Useful for testing edge cases or custom payloads

**Features:**
- "Load Sample Data" button (current behavior)
- "Load Real User Data" button (NEW - powerful!)
  - Example: For `task.due_soon`, load a real upcoming task
  - Example: For `brief.completed`, load today's brief data
- Field descriptions/tooltips
- Inline validation errors

#### 5. Channel Selection & Preview

**Layout:** Two-column layout

**Left Column: Channel Selection**

Improved checkboxes with detailed status:

```
☐ Browser Push
  └─ ✓ User has 2 active push subscriptions
  └─ ✓ User prefers push for this event type
  └─ ⚠️ Last push sent 2 hours ago (rate limit: 10/day, 6 remaining)

☐ Email
  └─ ✓ Email verified: user@example.com
  └─ ⚠️ User has disabled email for this event type
  └─ ℹ️ Last email sent: 1 day ago

☐ SMS
  └─ ✗ User has no phone number
  └─ ℹ️ SMS not available

☐ In-App
  └─ ✓ Always available
  └─ ✓ User prefers in-app for this event type
```

**Features:**
- Disable checkboxes for unavailable channels
- Show warnings for channels user has disabled
- Display rate limit status
- Show delivery cost estimate (for SMS)

**Right Column: Live Preview (NEW - Major Feature!)**

Preview what the notification will look like in each channel:

**Push Preview:**
```
┌─────────────────────────────────────┐
│ 🔔 BuildOS                          │
├─────────────────────────────────────┤
│ Daily Brief Ready                   │
│ Your brief for today is ready with  │
│ 5 tasks across 2 projects           │
│                                     │
│ [View Brief]                        │
└─────────────────────────────────────┘
```

**Email Preview:**
- Subject line
- Plain text body
- Formatted HTML preview (if applicable)
- Show personalization tokens replaced with real values

**SMS Preview:**
```
BuildOS: Your daily brief is ready!
5 tasks across 2 projects. View at:
https://app.buildos.com/briefs/today

Sent 2:45 PM
160 characters (1 SMS)
```

**In-App Preview:**
- Notification bell icon format
- Title, body, action button
- Icon and timestamp

**Implementation:**
- Create `NotificationPreview` component
- Use channel-specific preview templates
- Support for rich preview (HTML email, etc.)

#### 6. Send/Test Controls

**Layout:** Bottom action bar (sticky footer)

**Controls:**

**Primary Actions:**
- **"Send Test Notification"** button (primary CTA)
  - Confirm dialog: "Send [event_type] to [user_email] via [channels]?"
  - Shows count of notifications (1 event × N channels)
  - Validates all required fields
- **"Copy Configuration"** button
  - Copies payload as JSON to clipboard
  - Useful for debugging or documentation

**Secondary Actions:**
- **"Save as Template"** (NEW)
  - Save current configuration for later use
  - Name the template
  - Templates stored per admin user
- **"Load Template"** dropdown
  - Quick access to saved configurations

**After Sending:**
- Success toast: "Test notification sent! Event ID: {id}"
- **"View Event Details"** link → Goes to logs page filtered to this event
- **"Send Another"** button - clears form but keeps user selected
- **"Test Different Channels"** - keeps everything but changes channels

**History Section (NEW - Collapsible):**
- Show last 10 tests sent from this page
- Format: `[Time] [Event Type] → [User Email] via [Channels] - [Status]`
- Click to reload that configuration
- "View All History" link → notification logs page

#### 7. Additional Features

**A. Bulk Testing Mode (Optional Enhancement)**
- Toggle: "Test with multiple users"
- Multi-select in user search
- Send same notification to multiple users
- Preview shows "Will send to N users"
- Confirmation shows list of all recipients

**B. Compare Mode (Optional Enhancement)**
- Side-by-side comparison of how notification looks to different users
- Useful for testing personalization
- Example: Compare what admin sees vs regular user

**C. Scheduling (Future)**
- "Schedule for later" option
- Choose delivery time
- Useful for testing time-based behavior (quiet hours, etc.)

**D. A/B Testing Support (Future)**
- Test different payload variations
- Compare delivery rates and engagement
- Track which version performs better

### UI/UX Improvements

#### Visual Design

**Color Coding:**
- Green: Available/enabled channels
- Yellow: Warnings (disabled by user, rate limits)
- Red: Unavailable channels or errors
- Blue: Information and tips

**Icons:**
- 📱 Push notifications
- 📧 Email
- 📞 SMS
- 🔔 In-app
- ✓ Enabled/available
- ✗ Disabled/unavailable
- ⚠️ Warning
- ℹ️ Information

**Layout:**
- Sticky header with user selection
- Collapsible sections to reduce overwhelm
- Two-column layout where appropriate
- Sticky footer with actions
- Responsive design (mobile-friendly)

#### Progressive Disclosure

- Start with simple mode (select user, event type, send)
- Advanced options behind "Advanced" toggle:
  - JSON editor mode
  - Custom payload fields
  - Rate limit override (admin only)
- Context panel expandable/collapsible
- History section collapsed by default

#### Accessibility

- Proper ARIA labels
- Keyboard navigation support
- Screen reader friendly
- Color not the only indicator (use icons + text)
- Focus management when modal/panels open

### Technical Implementation

#### New Components

1. **`NotificationTestBed.svelte`** (main page, refactored)
2. **`UserNotificationContext.svelte`** (user context panel extension)
3. **`NotificationTypeSelector.svelte`** (event type picker with descriptions)
4. **`NotificationPayloadEditor.svelte`** (form mode + JSON mode)
5. **`ChannelSelector.svelte`** (enhanced channel selection with status)
6. **`NotificationPreview.svelte`** (multi-channel preview)
7. **`NotificationTestHistory.svelte`** (recent tests list)

#### New Services

1. **`notification-context.service.ts`**
   - `getUserNotificationContext(userId)` - Get full notification context
   - `getUserSubscriptions(userId)` - Get user's event subscriptions
   - `getUserChannelCapabilities(userId)` - Check push/sms availability
   - `getRecentNotifications(userId, limit)` - Last N notifications

2. **`notification-preview.service.ts`**
   - `generatePreview(eventType, payload, channel)` - Generate preview
   - `formatNotificationForChannel(event, channel)` - Format for specific channel

3. **`notification-template.service.ts`** (optional)
   - `saveTemplate(template)` - Save configuration
   - `loadTemplate(templateId)` - Load saved configuration
   - `listTemplates()` - Get all templates

#### API Endpoints

**New:**
- `GET /api/admin/users/:userId/notification-context` - Rich user context
- `POST /api/admin/notifications/preview` - Generate preview without sending
- `GET /api/admin/notifications/templates` - List saved templates
- `POST /api/admin/notifications/templates` - Save template
- `DELETE /api/admin/notifications/templates/:id` - Delete template

**Enhanced:**
- `POST /api/admin/notifications/test` - Add preview support
- `GET /api/admin/notifications/test/history` - Add filtering, pagination

#### Data Flow

1. **User Selection:**
   ```
   User types in search → Debounce 300ms → API call
   → Display results → User clicks
   → Load full context (parallel API calls):
     - Basic user info
     - Notification preferences
     - Channel capabilities
     - Recent notifications
   ```

2. **Event Type Selection:**
   ```
   User selects event type
   → Load payload template
   → Check user's subscription status
   → Update channel selection defaults
   → Generate preview
   ```

3. **Configuration:**
   ```
   User edits payload
   → Validate payload
   → Update preview (real-time or on blur)
   ```

4. **Sending:**
   ```
   User clicks send
   → Validate all fields
   → Show confirmation dialog
   → Send API request
   → Show loading state
   → Success: Show success message + event ID
   → Error: Show error message with retry option
   → Update history
   ```

### Migration Plan

#### Phase 1: Core Refactor (Week 1)
- [ ] Create new component structure
- [ ] Implement user search with context loading
- [ ] Build enhanced user context panel
- [ ] Migrate existing event types to new selector

#### Phase 2: Enhanced Configuration (Week 2)
- [ ] Implement form-based payload editor
- [ ] Add JSON mode toggle
- [ ] Create "Use Real Data" functionality
- [ ] Build channel selector with status

#### Phase 3: Preview & Polish (Week 3)
- [ ] Implement multi-channel preview
- [ ] Add preview generation service
- [ ] Build test history component
- [ ] Add copy and template features

#### Phase 4: Advanced Features (Future)
- [ ] Bulk testing mode
- [ ] Template management
- [ ] Compare mode
- [ ] A/B testing support

### Testing Plan

#### Unit Tests
- `NotificationPayloadEditor.test.ts` - Form validation, JSON mode
- `ChannelSelector.test.ts` - Availability logic, warnings
- `NotificationPreview.test.ts` - Preview generation for each channel
- `notification-context.service.test.ts` - API integration

#### Integration Tests
- End-to-end flow: Search → Select → Configure → Preview → Send
- Multi-user selection flow
- Template save/load flow
- History tracking

#### Manual Testing Checklist
- [ ] Test with user who has all channels available
- [ ] Test with user who has disabled email notifications
- [ ] Test with user with no phone number
- [ ] Test with user with no push subscriptions
- [ ] Test all event types
- [ ] Test payload validation
- [ ] Test preview accuracy for each channel
- [ ] Test rate limit warnings
- [ ] Test error handling

## Code References

### Key Files Analyzed

**Current Implementation:**
- `apps/web/src/routes/admin/notifications/test-bed/+page.svelte` - Current test-bed
- `apps/web/src/lib/services/notification-test.service.ts` - Test service

**Email Composer Pattern:**
- `apps/web/src/routes/admin/users/+page.svelte` - User list with email action
- `apps/web/src/lib/components/admin/EmailComposerModal.svelte` - Modal pattern

**Notification System:**
- `packages/shared-types/src/notification.types.ts` - Type definitions
- `apps/web/src/lib/services/notification-preferences.service.ts` - User preferences
- `apps/web/src/lib/services/notification-analytics.service.ts` - Analytics

**Related Components:**
- `apps/web/src/lib/components/admin/UserContextPanel.svelte` - User context display

## Architecture Insights

### Pattern Recognition

The EmailComposerModal demonstrates a superior UX pattern for admin tools:
1. **Context-First**: Load all relevant user data upfront
2. **Progressive Disclosure**: Start simple, reveal complexity as needed
3. **Preview Before Action**: Always show what will happen
4. **Multiple Modes**: Support different workflows (manual/AI, form/JSON)
5. **Undo/Retry**: Easy to recover from mistakes

These patterns should be applied to the notification test-bed.

### Key Differences: Email vs Notifications

**Email (Simpler):**
- Single channel (email)
- Freeform content
- AI generation helpful for personalization
- No subscription management

**Notifications (More Complex):**
- Multiple channels (push, email, sms, in-app)
- Structured payloads (typed)
- User preferences per event type per channel
- Rate limits and quiet hours
- Subscription management
- Real-time preview for multiple formats

**Implication:** Notification test-bed needs more structured UI but can learn from email's context-rich approach.

## Related Documentation

### BuildOS Documentation
- `/apps/web/docs/features/notifications/README.md` - Notification system docs
- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - System architecture
- `/apps/web/CLAUDE.md` - Web app development guide

### Existing Research
- `thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md` - Notification tracking
- `thoughts/shared/research/2025-10-07_00-15-00_phase4-in-app-notification-tracking-spec.md` - In-app notifications

## Open Questions

1. **Template Management:**
   - Should templates be user-specific or global?
   - Should admins be able to share templates?

2. **Real Data Loading:**
   - How to handle when user has no relevant data (e.g., no briefs)?
   - Should we create dummy data or just show validation error?

3. **Rate Limiting:**
   - Should admins be able to override rate limits in test mode?
   - Should test notifications count against rate limits?

4. **Preview Accuracy:**
   - Should preview use actual notification worker logic?
   - How to handle dynamic content (e.g., LLM-generated text)?

5. **Multi-Channel Sending:**
   - Should we send to all selected channels simultaneously or sequentially?
   - How to handle partial failures (e.g., email succeeds, SMS fails)?

6. **History & Tracking:**
   - Should test notifications be marked differently in logs?
   - Should there be a separate test history vs production history?

## Success Metrics

### Usability
- Time to send first test notification (target: < 30 seconds)
- Number of clicks required (target: < 5)
- User satisfaction score from admin users

### Functionality
- Support for all 11 event types
- Support for all 4 channels
- Accurate previews (validated against actual deliveries)
- 95%+ uptime for context loading

### Developer Experience
- Component reusability (target: 60%+ shared with email composer)
- Test coverage (target: 80%+)
- Type safety (TypeScript strict mode)

## Conclusion

By modeling the notification test-bed after the EmailComposerModal pattern, we can create a powerful admin tool that:

1. **Provides Rich Context**: Admins see full user state, notification preferences, channel availability, and history before sending
2. **Supports All Event Types**: Easy to test any of the 11 notification event types with realistic data
3. **Multi-Channel Preview**: See exactly what will be sent across push, email, SMS, and in-app
4. **Intelligent Defaults**: Auto-populate with user's real data where possible
5. **Flexible Configuration**: Support both simple (form) and advanced (JSON) modes
6. **Tracks History**: See what tests have been sent and quickly retry configurations

The redesign transforms the test-bed from a basic testing tool into a comprehensive notification management interface that helps admins understand user experience, debug delivery issues, and validate notification content before production rollout.

### Next Steps

1. Review this spec with team
2. Clarify open questions
3. Create tickets for Phase 1 implementation
4. Design mockups/wireframes for new UI
5. Begin implementation with core refactor
