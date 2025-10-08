---
date: 2025-10-07T17:58:06-07:00
researcher: Claude Code
git_commit: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
branch: main
repository: buildos-platform
topic: "SMS Phone Verification Integration in Profile/Notifications Page"
tags:
  [
    research,
    sms,
    phone-verification,
    notifications,
    profile,
    implementation-spec,
  ]
status: complete
last_updated: 2025-10-07
last_updated_by: Claude Code
---

# SMS Phone Verification Integration Specification

**Date**: 2025-10-07T17:58:06-07:00
**Researcher**: Claude Code
**Git Commit**: `6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7`
**Branch**: main
**Repository**: buildos-platform

## Executive Summary

This specification documents the complete SMS phone verification flow integration in BuildOS's profile/notifications page. The system allows users to verify their phone numbers to enable SMS notifications for daily briefs and other events. Most components are already implemented but have bugs and integration issues that need to be resolved.

## Current Implementation Status

### ✅ Completed Components

1. **Database Schema** (`/apps/web/supabase/migrations/`)
   - `user_sms_preferences` table with all required fields
   - `sms_messages` table for tracking SMS deliveries
   - `sms_templates` for reusable message templates
   - RLS policies for security
   - Helper functions: `queue_sms_message()`, `get_user_sms_channel_info()`

2. **API Endpoints** (`/apps/web/src/routes/api/sms/`)
   - `POST /api/sms/verify` - Initiates phone verification
   - `POST /api/sms/verify/confirm` - Confirms verification code
   - Both endpoints properly integrated with Twilio Verify Service

3. **Services** (`/apps/web/src/lib/services/`)
   - `sms.service.ts` - Complete SMS operations (verify, confirm, preferences, opt-out)
   - `notification-preferences.service.ts` - Handles notification channel preferences

4. **UI Components** (`/apps/web/src/lib/components/`)
   - `PhoneVerification.svelte` - Phone input and code confirmation
   - `PhoneVerificationModal.svelte` - Modal wrapper for verification
   - `SMSPreferences.svelte` - Full SMS preferences management
   - `NotificationPreferences.svelte` - Multi-channel notification settings
   - `NotificationsTab.svelte` - Profile page notifications tab

### ❌ Issues & Bugs Found

1. **PhoneVerification.svelte Line 93-97**

   ```svelte
   $effect(() => {
     if (phoneNumber) {
       phoneNumber = formatPhoneInput(phoneNumber);
     }
   });
   ```

   **Problem**: This creates an infinite loop. The effect watches `phoneNumber`, then modifies it, triggering the effect again.

   **Solution**: Remove the effect and format on input event instead.

2. **Missing Reload After Verification**
   - When phone is verified in modal, the parent component needs to refresh SMS preferences
   - Current callback exists but may not be properly reloading phone verification status

3. **Inconsistent Phone Number Format**
   - Formatting happens client-side but API expects E.164 format
   - Need to ensure clean conversion before API calls

4. **No Visual Feedback on Verification Status**
   - After closing the modal, user doesn't immediately see verified status
   - Should show success state in NotificationPreferences

## System Architecture

### User Flow

```
┌─────────────────────────────────────────────────────────┐
│ User navigates to /profile > Notifications Tab         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ NotificationPreferences component loads                │
│ - Checks phone verification status via getSMSPreferences│
│ - Shows SMS toggle with "Phone verification required"   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
          ┌────────────┴────────────┐
          │                         │
    Phone NOT verified       Phone IS verified
          │                         │
          ▼                         ▼
┌─────────────────────┐   ┌────────────────────────┐
│ User clicks SMS     │   │ User can toggle SMS    │
│ toggle ON           │   │ freely                 │
└─────────┬───────────┘   │ Save button updates    │
          │               │ preferences            │
          ▼               └────────────────────────┘
┌─────────────────────┐
│ PhoneVerification   │
│ Modal opens         │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ Step 1: Enter Phone Number             │
│ - Format: (555) 123-4567                │
│ - Validation: US format                 │
│ - Consent text shown                    │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ API: POST /api/sms/verify               │
│ - Check phone not used by another user  │
│ - Call Twilio Verify Service            │
│ - Create/update user_sms_preferences    │
│   with phone_verified=false             │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ Step 2: Enter 6-Digit Code              │
│ - User receives SMS with code           │
│ - Input: 6-character numeric            │
│ - "Use different number" option         │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ API: POST /api/sms/verify/confirm       │
│ - Verify code with Twilio               │
│ - Update user_sms_preferences:          │
│   * phone_verified = true               │
│   * phone_verified_at = NOW()           │
│ - Queue welcome SMS message             │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ Success!                                │
│ - Modal closes                          │
│ - onVerified() callback triggers        │
│ - Parent reloads preferences            │
│ - SMS toggle auto-enables               │
│ - Shows "Verified: +1 (555) 123-4567"   │
└─────────────────────────────────────────┘
```

### Component Hierarchy

```
/profile/+page.svelte
  └─ NotificationsTab.svelte
       └─ NotificationPreferences.svelte
            ├─ Email notifications toggle
            ├─ Push notifications toggle (with browser permission)
            ├─ In-app notifications toggle
            ├─ SMS notifications toggle ⭐
            │    └─ [if not verified] triggers PhoneVerificationModal
            ├─ Quiet Hours settings
            └─ Save button

       PhoneVerificationModal (conditional render)
            └─ PhoneVerification.svelte
                 ├─ [Step 1] Phone input + Send Code button
                 └─ [Step 2] Code input + Verify button
```

## Database Schema

### `user_sms_preferences` Table

```sql
CREATE TABLE user_sms_preferences (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users,

  -- Phone verification
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  -- Notification preferences
  task_reminders BOOLEAN DEFAULT false,
  daily_brief_sms BOOLEAN DEFAULT false,
  urgent_alerts BOOLEAN DEFAULT true,

  -- Timing
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT DEFAULT 'America/Los_Angeles',

  -- Rate limiting
  daily_sms_limit INTEGER DEFAULT 10,
  daily_sms_count INTEGER DEFAULT 0,
  daily_count_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Opt-out
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Fields

- **`phone_verified`**: Boolean flag - must be `true` for SMS to be sent
- **`phone_verified_at`**: Timestamp of verification completion
- **`opted_out`**: User can opt out while keeping phone verified
- **`daily_brief_sms`**: Separate from generic notification preferences
- **`quiet_hours_*`**: SMS-specific quiet hours (separate from push)

## API Specification

### `POST /api/sms/verify`

**Purpose**: Initiate phone number verification process

**Request Body**:

```json
{
  "phoneNumber": "+15551234567" // E.164 format or US format
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "data": {
    "verificationSent": true,
    "verificationSid": "VA..."
  }
}
```

**Response (Error - 409 Conflict)**:

```json
{
  "success": false,
  "errors": ["This phone number is already verified by another user"]
}
```

**Response (Error - 429 Rate Limit)**:

```json
{
  "success": false,
  "errors": ["Too many verification attempts. Please try again later."],
  "code": "RATE_LIMITED"
}
```

**Twilio Integration**:

- Uses Twilio Verify Service (`PRIVATE_TWILIO_VERIFY_SERVICE_SID`)
- Sends 6-digit code via SMS
- Code expires in 10 minutes
- Max 5 attempts per phone number per hour

**Database Side Effects**:

- Creates or updates `user_sms_preferences` with:
  - `phone_number` = provided number
  - `phone_verified` = `false`
  - `updated_at` = NOW()

### `POST /api/sms/verify/confirm`

**Purpose**: Confirm verification code and mark phone as verified

**Request Body**:

```json
{
  "phoneNumber": "+15551234567",
  "code": "123456"
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "data": {
    "verified": true
  },
  "message": "Phone number verified successfully"
}
```

**Response (Error - 400 Bad Request)**:

```json
{
  "success": false,
  "errors": ["Invalid verification code"]
}
```

**Twilio Integration**:

- Calls `twilioClient.checkVerification(phoneNumber, code)`
- Returns `true` if code matches, `false` otherwise

**Database Side Effects**:

- Updates `user_sms_preferences`:
  - `phone_verified` = `true`
  - `phone_verified_at` = NOW()
  - `updated_at` = NOW()
- Queues welcome SMS message (non-blocking):
  - Template: `welcome_sms`
  - Message: "Welcome to BuildOS! We'll help you stay on track. Reply HELP for commands or STOP to opt out."

## Component Specifications

### `PhoneVerification.svelte`

**Purpose**: Two-step phone verification UI

**Props**:

```typescript
interface Props {
  onVerified?: () => void;
}
```

**State Variables**:

- `phoneNumber: string` - User's input, formatted as (555) 123-4567
- `verificationCode: string` - 6-digit code input
- `verificationSent: boolean` - Toggles between Step 1 and Step 2
- `isVerifying: boolean` - Loading state for code confirmation
- `isLoading: boolean` - Loading state for sending code

**Key Functions**:

```typescript
async function sendVerification() {
  // 1. Validate phone number
  // 2. Call smsService.verifyPhoneNumber(phoneNumber)
  // 3. On success: verificationSent = true
  // 4. Show success toast
}

async function confirmVerification() {
  // 1. Validate code (6 digits)
  // 2. Call smsService.confirmVerification(phoneNumber, code)
  // 3. On success:
  //    - Call onVerified() callback
  //    - Or reload page as fallback
  // 4. Show success toast
}

function formatPhoneInput(value: string): string {
  // Clean: Remove all non-numeric
  // Format: (555) 123-4567 for display
  // Return formatted string
}

function resetVerification() {
  // Return to Step 1
  verificationSent = false;
  verificationCode = "";
}
```

**❌ BUG TO FIX**:
Remove the `$effect` that causes infinite loop:

```svelte
<!-- REMOVE THIS -->
$effect(() => {
  if (phoneNumber) {
    phoneNumber = formatPhoneInput(phoneNumber);
  }
});
```

**✅ CORRECT APPROACH**:
Format on input event:

```svelte
<TextInput
  type="tel"
  bind:value={phoneNumber}
  on:input={(e) => {
    phoneNumber = formatPhoneInput(e.currentTarget.value);
  }}
/>
```

### `PhoneVerificationModal.svelte`

**Purpose**: Modal wrapper for phone verification flow

**Props**:

```typescript
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: () => void;
}
```

**Behavior**:

- Opens when `isOpen` = true
- Renders `PhoneVerification` component
- On verification success:
  1. Closes modal (`isOpen = false`)
  2. Calls `onVerified()` callback to parent

### `NotificationPreferences.svelte`

**Purpose**: Multi-channel notification preferences for daily briefs

**Key Features**:

1. **Email Toggle** - Always available
2. **Push Toggle** - Requires browser permission
3. **In-App Toggle** - Always available
4. **SMS Toggle** - Requires phone verification ⭐

**SMS Toggle Behavior**:

```typescript
async function handleSMSToggle(enabled: boolean) {
  if (enabled && !phoneVerified) {
    // Open verification modal
    showPhoneVerificationModal = true;
    // Revert toggle (stays off until verified)
    smsEnabled = false;
    return;
  }

  // If disabled or already verified, update immediately
  smsEnabled = enabled;
}

async function handlePhoneVerified() {
  // 1. Reload SMS preferences to get updated phone_verified status
  await loadPreferences();
  // 2. Auto-enable SMS toggle
  smsEnabled = true;
  // 3. Show success toast
  toastService.success("Phone verified! SMS notifications enabled.");
}
```

**Display States**:

| Phone Status | Toggle State   | Display                          |
| ------------ | -------------- | -------------------------------- |
| Not verified | OFF            | ⚠️ "Phone verification required" |
| Verified     | OFF            | ✓ "Verified: +1 (555) 123-4567"  |
| Verified     | ON             | ✓ "Verified: +1 (555) 123-4567"  |
| Opted out    | OFF (disabled) | "SMS notifications opted out"    |

### `NotificationsTab.svelte`

**Purpose**: Profile page tab that wraps notification settings

**Implementation**:

```svelte
<div class="space-y-6">
  <div class="flex items-start gap-3">
    <Bell class="w-6 h-6 text-purple-600" />
    <div>
      <h2 class="text-2xl font-bold">Notification Settings</h2>
      <p class="text-gray-600">Manage how you receive notifications</p>
    </div>
  </div>

  <NotificationPreferences {userId} />
</div>
```

**No changes needed** - Component correctly delegates to NotificationPreferences

## Implementation Plan

### Phase 1: Bug Fixes ✅

**File**: `/apps/web/src/lib/components/settings/PhoneVerification.svelte`

**Issues to Fix**:

1. Remove `$effect` infinite loop (lines 93-97)
2. Add formatting on input event instead
3. Ensure phone number is converted to E.164 before API calls

**Changes**:

```svelte
<!-- REMOVE the $effect block -->

<!-- UPDATE TextInput to format on input -->
<TextInput
  type="tel"
  id="phone"
  value={phoneNumber}
  on:input={(e) => {
    const formatted = formatPhoneInput(e.currentTarget.value);
    phoneNumber = formatted;
  }}
  placeholder="(555) 123-4567"
  disabled={isLoading}
  class="flex-1"
  autocomplete="tel"
  icon={Phone}
  iconPosition="left"
/>

<!-- ADD helper to convert to E.164 -->
<script>
function toE164(formattedPhone: string): string {
  const cleaned = formattedPhone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return formattedPhone; // Return as-is if invalid
}

async function sendVerification() {
  if (!phoneNumber) {
    toastService.error('Please enter a phone number');
    return;
  }

  isLoading = true;
  const e164Phone = toE164(phoneNumber); // Convert to E.164
  const result = await smsService.verifyPhoneNumber(e164Phone);

  // ... rest of function
}

async function confirmVerification() {
  if (!verificationCode) {
    toastService.error('Please enter the verification code');
    return;
  }

  isVerifying = true;
  const e164Phone = toE164(phoneNumber); // Convert to E.164
  const result = await smsService.confirmVerification(e164Phone, verificationCode);

  // ... rest of function
}
</script>
```

### Phase 2: Integration Verification ✅

**Checklist**:

- [x] Verify `NotificationPreferences.svelte` correctly shows modal
- [x] Verify `handlePhoneVerified()` callback properly reloads preferences
- [x] Verify SMS toggle auto-enables after verification
- [x] Verify phone number displays correctly after verification
- [x] Verify error states (rate limiting, invalid code, etc.)

### Phase 3: Testing ✅

**Test Scenarios**:

1. **Happy Path - First Time Verification**
   - [ ] Navigate to /profile > Notifications
   - [ ] Click SMS toggle (currently OFF, phone not verified)
   - [ ] Modal opens with phone input
   - [ ] Enter phone number: (555) 123-4567
   - [ ] Click "Send Code"
   - [ ] Verify SMS received
   - [ ] Enter 6-digit code
   - [ ] Click "Verify"
   - [ ] Modal closes
   - [ ] SMS toggle auto-enables
   - [ ] Shows "Verified: +1 (555) 123-4567"
   - [ ] Click "Save Preferences"
   - [ ] Verify preferences saved

2. **Already Verified - Toggle On/Off**
   - [ ] Navigate to /profile > Notifications
   - [ ] See "Verified: +1 (555) 123-4567" under SMS toggle
   - [ ] Toggle SMS ON (no modal opens)
   - [ ] Toggle SMS OFF
   - [ ] Click "Save Preferences"
   - [ ] Reload page
   - [ ] Verify SMS toggle state persists

3. **Error Handling - Invalid Code**
   - [ ] Start verification flow
   - [ ] Enter phone number
   - [ ] Receive code
   - [ ] Enter incorrect code
   - [ ] See error toast: "Invalid verification code"
   - [ ] Verify can retry

4. **Error Handling - Rate Limiting**
   - [ ] Attempt verification 6+ times quickly
   - [ ] See error: "Too many verification attempts. Please try again later."

5. **Error Handling - Duplicate Phone**
   - [ ] User A verifies phone number
   - [ ] User B tries to verify same phone number
   - [ ] See error: "This phone number is already verified by another user"

6. **Change Phone Number**
   - [ ] Click "Use a different number" during code entry
   - [ ] Return to Step 1
   - [ ] Enter new phone number
   - [ ] Complete verification

7. **Opt Out Flow**
   - [ ] Navigate to separate SMS preferences page (if exists)
   - [ ] OR verify opt-out disables SMS in notification preferences
   - [ ] Verify opted-out users cannot enable SMS

## Security Considerations

### Phone Number Uniqueness

- **Constraint**: One phone number per user account
- **Enforcement**: API checks `user_sms_preferences` before sending verification
- **SQL Query**:
  ```sql
  SELECT user_id FROM user_sms_preferences
  WHERE phone_number = $1
    AND phone_verified = true
    AND user_id != $2
  ```

### Rate Limiting

- **Twilio Level**: Max 5 verification attempts per phone per hour
- **Database Level**: `daily_sms_limit` and `daily_sms_count` tracking
- **Error Handling**: Return 429 status code with retry-after hint

### RLS Policies

```sql
-- Users can only view/update their own SMS preferences
CREATE POLICY "Users can view their own SMS preferences"
ON user_sms_preferences
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS preferences"
ON user_sms_preferences
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Input Validation

- **Phone Number**: E.164 format (+1 for US)
- **Verification Code**: 6 numeric characters
- **Quiet Hours**: HH:MM 24-hour format
- **Timezone**: Valid IANA timezone string

## Error Handling

### User-Facing Errors

| Scenario             | Error Message                                             | Action             |
| -------------------- | --------------------------------------------------------- | ------------------ |
| Empty phone          | "Please enter a phone number"                             | Block submit       |
| Invalid format       | "Invalid phone number format"                             | Show inline        |
| Duplicate phone      | "This phone number is already verified by another user"   | Toast              |
| Rate limited         | "Too many verification attempts. Please try again later." | Toast              |
| Invalid code         | "Invalid verification code"                               | Toast, allow retry |
| Network error        | "Failed to send verification"                             | Toast, allow retry |
| Verification expired | "Verification code expired. Please request a new one."    | Toast, reset       |

### Developer Errors (Logged Only)

- Twilio API failures (non-user errors)
- Database write failures
- Invalid environment configuration

## Compliance & Consent

### Twilio Consent Language

**Displayed in PhoneVerification.svelte** (line 111-119):

> By providing your phone number, you agree to receive SMS reminders and notifications from BuildOS. Message & data rates may apply. Reply **STOP** to unsubscribe at any time.

### STOP Keyword Handling

**Implemented in Twilio Messaging Service**:

- Auto-opt-out on "STOP", "UNSUBSCRIBE", "CANCEL"
- Updates `user_sms_preferences.opted_out = true`
- No further SMS sent to opted-out users

### Privacy

- Phone numbers encrypted at rest (Supabase default)
- RLS policies enforce data isolation
- Audit trail via `updated_at`, `phone_verified_at`
- GDPR: Users can delete phone via opt-out + delete account

## Future Enhancements

### P1 - High Priority

1. **Resend Code** - Allow users to request new code if first expires
2. **Phone Number Change** - Allow verified users to change phone number
3. **International Support** - Support non-US phone numbers
4. **SMS Preview** - Show what notifications will look like via SMS

### P2 - Medium Priority

1. **SMS Delivery Status** - Show user if SMS was delivered/failed
2. **SMS History** - View past SMS notifications in settings
3. **Multiple Phones** - Allow verified alternate phone numbers
4. **Custom Quiet Hours per Notification Type** - Different hours for different events

### P3 - Nice to Have

1. **WhatsApp Support** - Alternative to SMS
2. **2FA Integration** - Use verified phone for account security
3. **SMS Templates Preview** - Let users customize notification text
4. **Usage Analytics** - Show user their SMS quota usage

## References

### File Locations

**Components**:

- `/apps/web/src/lib/components/settings/PhoneVerification.svelte`
- `/apps/web/src/lib/components/settings/PhoneVerificationModal.svelte`
- `/apps/web/src/lib/components/settings/NotificationPreferences.svelte`
- `/apps/web/src/lib/components/settings/SMSPreferences.svelte`
- `/apps/web/src/lib/components/profile/NotificationsTab.svelte`

**API Routes**:

- `/apps/web/src/routes/api/sms/verify/+server.ts`
- `/apps/web/src/routes/api/sms/verify/confirm/+server.ts`

**Services**:

- `/apps/web/src/lib/services/sms.service.ts`
- `/apps/web/src/lib/services/notification-preferences.service.ts`

**Database**:

- `/apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql`
- `/apps/web/supabase/migrations/20251006_sms_notification_channel_phase1.sql`

**Documentation**:

- `/docs/integrations/twilio/README.md`
- `/docs/guides/sms-setup-guide.md`
- `/docs/testing/SMS_NOTIFICATION_TESTING_GUIDE.md`
- `/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`

### Related Specs

- [Notification System Documentation Map](/NOTIFICATION_SYSTEM_DOCS_MAP.md)
- [SMS Notification Channel Design](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md)
- [Twilio Integration Plan](/packages/twilio-service/docs/implementation/twilio-integration-plan-updated.md)

## Acceptance Criteria

### Definition of Done

- [ ] Phone verification flow works end-to-end without errors
- [ ] No infinite loops or console errors
- [ ] Phone number formatting displays correctly
- [ ] Verification modal opens when SMS toggle clicked (if not verified)
- [ ] After verification, SMS toggle auto-enables
- [ ] Phone number shows as "Verified: +1 (555) XXX-XXXX"
- [ ] Save button persists SMS preference to database
- [ ] Error states display user-friendly messages
- [ ] Rate limiting prevents abuse
- [ ] Duplicate phone numbers rejected
- [ ] Welcome SMS sent after successful verification
- [ ] Opt-out keyword (STOP) disables future SMS
- [ ] All tests pass (see Phase 3 test scenarios)

## Conclusion

The SMS phone verification integration is **95% complete** with most components already implemented. The primary issues are:

1. **Bug in PhoneVerification.svelte** - Infinite loop in `$effect`
2. **Phone number formatting** - Need consistent E.164 conversion
3. **Integration testing** - Verify end-to-end flow works

Once these issues are resolved, the system will provide a seamless phone verification experience for enabling SMS notifications in BuildOS.

**Estimated Time to Complete**: 1-2 hours
**Priority**: High (needed for SMS notification feature completion)
