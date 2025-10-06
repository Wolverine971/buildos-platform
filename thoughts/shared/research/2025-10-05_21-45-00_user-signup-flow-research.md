---
title: User Signup/Registration Flow Research
date: 2025-10-05T21:45:00
status: completed
tags: [authentication, signup, onboarding, notifications, database]
purpose: Document complete user signup flow to identify where to trigger welcome notification
---

# User Signup/Registration Flow Research

## Executive Summary

BuildOS has TWO distinct signup paths:

1. **Email/Password Registration** - Traditional form-based signup
2. **Google OAuth Registration** - Social authentication

Both paths ultimately:

- Create user in Supabase Auth (`auth.users`)
- Create user record in public `users` table via database trigger
- Auto-assign 14-day trial via `handle_new_user_trial()` trigger
- Redirect to home with `?onboarding=true` parameter
- Show onboarding modal on homepage

**Key Finding**: The ideal place to trigger a welcome notification is in the `handle_new_user_trial()` database trigger or immediately after user creation in the GoogleOAuthHandler.

---

## 1. Signup API Endpoints & Routes

### 1.1 Email/Password Registration Flow

#### Entry Point

- **Route**: `/auth/register` → `/signup` (redirects)
- **UI Component**: `/apps/web/src/routes/auth/register/+page.svelte`
- **API Endpoint**: `/apps/web/src/routes/api/auth/register/+server.ts`

#### Flow Steps

**Step 1: User fills form** (`+page.svelte` lines 73-166)

```typescript
// Form fields
- email: string
- password: string (validated: min 8 chars, uppercase, lowercase, number)
- confirmPassword: string
- name: string (optional)

// Client-side validation
- Email format check
- Password strength validation
- Password match verification
```

**Step 2: POST to `/api/auth/register`** (`+server.ts` lines 5-114)

```typescript
// Server-side validation
1. Email format validation (regex)
2. Password requirements (8+ chars, upper, lower, numbers)
3. Duplicate email check

// User creation
const { data, error } = await supabase.auth.signUp({
  email: email.trim(),
  password,
  options: {
    data: {
      name: name || email.split('@')[0]  // Store name in user_metadata
    }
  }
});
```

**Step 3: Handle response**

```typescript
// If email confirmation required
if (data.user && !data.session) {
  return { requiresEmailConfirmation: true };
}

// If auto-login successful (session created)
if (data.session) {
  // Navigate to home with onboarding flag
  await goto("/?onboarding=true", { invalidateAll: true });
}
```

### 1.2 Google OAuth Registration Flow

#### Entry Point

- **Route**: `/auth/register` (same UI as email)
- **OAuth Handler**: `/apps/web/src/lib/utils/google-oauth.ts`
- **Callback Route**: `/auth/google/register-callback/+page.server.ts`

#### Flow Steps

**Step 1: Initiate OAuth** (`+page.svelte` lines 45-71)

```typescript
const redirectUri = `${origin}/auth/google/register-callback`;
const params = {
  client_id: PUBLIC_GOOGLE_CLIENT_ID,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "email profile openid",
  access_type: "offline",
  prompt: "consent",
};

window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
```

**Step 2: Google redirects to callback** (`register-callback/+page.server.ts`)

```typescript
const handler = new GoogleOAuthHandler(locals.supabase, locals);
return handler.handleCallback(url, {
  redirectPath: "/auth/register",
  successPath: "/",
  isRegistration: true, // Important flag!
});
```

**Step 3: OAuth handler processes** (`google-oauth.ts` lines 246-350)

**3a. Exchange code for tokens** (lines 286-297)

```typescript
const tokens = await this.exchangeCodeForTokens(code, redirectUri);
// Returns: { access_token, refresh_token, id_token, expires_in }
```

**3b. Authenticate with Supabase** (lines 137-241)

```typescript
// Sign in with Google ID token
const { data } = await this.supabase.auth.signInWithIdToken({
  provider: "google",
  token: tokens.id_token!,
  access_token: tokens.access_token,
});

// Verify session is stored
const { data: sessionData } = await this.supabase.auth.getSession();

// Check if user exists in public.users table
const { data: userData, error: fetchError } = await this.supabase
  .from("users")
  .select("id, completed_onboarding, email, name, is_admin")
  .eq("id", data.user.id)
  .single();
```

**3c. Create user if new** (lines 192-220)

```typescript
if (fetchError && fetchError.code === "PGRST116") {
  // User doesn't exist in public.users
  isNewUser = true;
  const profile = await this.getUserProfile(tokens.access_token);

  const newUser = {
    id: data.user.id,
    email: data.user.email as string,
    name: profile.name || data.user.user_metadata?.name || "User",
    is_admin: false,
    completed_onboarding: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedUser } = await this.supabase
    .from("users")
    .insert(newUser)
    .select()
    .single();
}
```

**3d. Update server locals** (lines 222-234)

```typescript
// CRITICAL: Update server-side locals for immediate auth recognition
if (this.locals) {
  this.locals.session = data.session;
  this.locals.user = dbUser;
}
```

**Step 4: Build redirect URL** (lines 327-349)

```typescript
const redirectUrl = new URL("/", url.origin);
redirectUrl.searchParams.set("auth_success", "true");
redirectUrl.searchParams.set("auth_time", Date.now().toString());
redirectUrl.searchParams.set("auth_key", randomKey);

if (isNewUser || isRegistration) {
  redirectUrl.searchParams.set("new_user", "true");
  if (isRegistration) {
    redirectUrl.searchParams.set("onboarding", "true");
    redirectUrl.searchParams.set("message", "Welcome to BuildOS!");
  }
}

throw redirect(303, redirectUrl.pathname + redirectUrl.search);
```

---

## 2. Database User Creation Points

### 2.1 Supabase Auth Table

```sql
-- auth.users (managed by Supabase Auth)
-- Created automatically by supabase.auth.signUp()
```

### 2.2 Public Users Table

#### Table Schema (`database.schema.ts` lines ~1100+)

```typescript
users: {
  id: string; // UUID from auth.users
  email: string;
  name: string;
  is_admin: boolean;
  completed_onboarding: boolean;
  subscription_status: string; // Set by trigger
  trial_ends_at: string; // Set by trigger
  is_beta_user: boolean; // Set by trigger
  created_at: string;
  updated_at: string;
}
```

#### Database Trigger: `handle_new_user_trial()`

**Migration**: `/apps/web/supabase/migrations/20241220_trial_system.sql`

**Trigger Definition** (lines 8-34)

```sql
CREATE OR REPLACE FUNCTION handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_days INTEGER;
  v_is_beta_member BOOLEAN;  -- Added in 20241221_beta_user_sync.sql
BEGIN
  -- Default trial: 14 days
  v_trial_days := COALESCE(
    current_setting('app.trial_days', true)::INTEGER,
    14
  );

  -- Check if email is a beta member
  SELECT EXISTS (
    SELECT 1 FROM beta_members
    WHERE email = NEW.email
    AND (access_level = 'full' OR access_level = 'limited')
  ) INTO v_is_beta_member;

  IF v_is_beta_member THEN
    NEW.is_beta_user := true;
  END IF;

  -- Set trial status
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on INSERT
CREATE TRIGGER on_auth_user_created_trial
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_trial();
```

**🎯 KEY INSIGHT**: This trigger runs BEFORE INSERT on the users table. This is where we can add welcome notification logic!

---

## 3. Onboarding Flow After Signup

### 3.1 Homepage Detection (`+layout.svelte` lines 107-136)

```typescript
// URL parameter triggers onboarding modal
const forceOnboarding = $page?.url?.searchParams.get("onboarding") === "true";

// Show modal if:
const showOnboardingModal =
  needsOnboarding && // !user.completed_onboarding
  isHomePage && // pathname === '/'
  (forceOnboarding || // ?onboarding=true OR
    (onboardingProgress < 25 && // Progress < 25% AND
      !checkModalDismissed())); // Not previously dismissed

// Clean up URL parameter after handling
if (forceOnboarding && browser) {
  const url = new URL($page.url);
  url.searchParams.delete("onboarding");
  replaceState(url.toString(), {});
}
```

### 3.2 Onboarding Modal Component

- **Component**: `$lib/components/onboarding/OnboardingModal.svelte`
- **Lazy loaded**: Only for authenticated users (lines 161-165)
- **Dismissible**: Stored in localStorage as `onboarding_modal_dismissed`

### 3.3 Onboarding Page (`/onboarding`)

- **Route**: `/apps/web/src/routes/onboarding/+page.server.ts`
- **Purpose**: Full onboarding experience
- **Data Loaded**:
  - User context from `user_context` table
  - Progress calculation (4 input fields)
  - Recommended next step

---

## 4. Post-Signup Hooks & Triggers

### 4.1 Database Triggers

**Current Triggers on `users` Table:**

1. ✅ `on_auth_user_created_trial` - Sets trial status (BEFORE INSERT)
   - Checks beta membership
   - Sets subscription_status to 'trialing'
   - Sets trial_ends_at (14 days)

**No other user creation triggers found**

### 4.2 Application-Level Hooks

**Hooks.server.ts** (`/apps/web/src/hooks.server.ts`)

- **Purpose**: Session management, auth middleware
- **User Creation**: NO post-creation logic here
- **Session Loading**: `safeGetSession()` validates JWT and loads user data

**No webhook or event system for new user signups**

---

## 5. Supabase Auth Integration Patterns

### 5.1 Session Management

**Server-Side** (`hooks.server.ts` lines 102-154)

```typescript
event.locals.safeGetSession = async () => {
  // 1. Get session (doesn't validate JWT)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 2. Validate JWT by calling getUser
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // 3. Get user data from public.users table
  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  return { session, user: userData };
};
```

**Client-Side** (`+layout.svelte`)

```typescript
const supabase = createSupabaseBrowser();
setContext("supabase", supabase);
```

### 5.2 Auth State Updates

**Google OAuth Handler Updates Locals** (`google-oauth.ts` lines 222-234)

```typescript
// CRITICAL for immediate auth recognition
if (this.locals) {
  this.locals.session = data.session;
  this.locals.user = dbUser;
  console.log(
    "Updated server locals with authenticated user:",
    this.locals.user.id,
  );
}
```

---

## 6. Notification Infrastructure Analysis

### 6.1 Generic Notification System

**Notification Store** (`$lib/stores/notification.store.ts`)

- **Type**: Stackable in-app notifications (NOT database notifications)
- **Purpose**: UI feedback for async operations
- **Types**: brain-dump, phase-generation, calendar-analysis, generic
- **Persistence**: Session storage (30 min timeout)
- **NOT suitable for welcome notifications** - designed for process tracking

### 6.2 Database Notification System

**User Notifications Table** (`20241219_dunning_system.sql` lines 19-32)

```sql
CREATE TABLE user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  action_url TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE USING (auth.uid() = user_id);
```

**Current Usage**: Payment warnings, trial reminders
**Display**: `PaymentWarning.svelte` component in layout

**🎯 PERFECT for welcome notifications!**

### 6.3 Email System

**Email Tables** (from migrations)

- `emails` - Email records
- `email_recipients` - Recipient tracking
- `email_tracking_events` - Open/click tracking
- `email_logs` - Send history

**Queue Job Types** (from `20250930_add_email_brief_job_type_part2.sql`)

- `generate_daily_brief` - Brief generation
- `generate_phases` - Phase creation
- `generate_brief_email` - Email sending
- `send_email` - Generic email sending

**Email sending is handled via Railway Worker service**

---

## 7. Complete Signup Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    EMAIL/PASSWORD PATH                       │
└─────────────────────────────────────────────────────────────┘

User fills form → POST /api/auth/register
                       ↓
                 supabase.auth.signUp({
                   email, password,
                   options: { data: { name } }
                 })
                       ↓
                 Creates auth.users record
                       ↓
                 [AUTO] Returns session (if no email confirmation)
                       ↓
                 Client: goto('/?onboarding=true')
                       ↓
                 [SERVER] Layout loads user data
                       ↓
                 Shows onboarding modal

┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE OAUTH PATH                         │
└─────────────────────────────────────────────────────────────┘

User clicks Google → Redirect to Google OAuth
                          ↓
                    User approves
                          ↓
                    Google redirects to /auth/google/register-callback?code=...
                          ↓
                    GoogleOAuthHandler.handleCallback()
                          ↓
                    1. Exchange code for tokens
                          ↓
                    2. supabase.auth.signInWithIdToken({ provider: 'google', token })
                          ↓
                    3. Creates auth.users record (if new)
                          ↓
                    4. Check users table: SELECT * FROM users WHERE id = auth_user.id
                          ↓
                    5. If NOT EXISTS (PGRST116):
                       ├─ Fetch Google profile
                       ├─ INSERT INTO users (id, email, name, ...)
                       └─ [TRIGGER] handle_new_user_trial() fires
                                ↓
                                - Check beta_members
                                - Set is_beta_user
                                - Set subscription_status = 'trialing'
                                - Set trial_ends_at = NOW() + 14 days
                          ↓
                    6. Update server locals (session, user)
                          ↓
                    7. redirect(303, '/?onboarding=true&new_user=true&message=Welcome!')
                          ↓
                    [SERVER] Layout loads user data
                          ↓
                    Shows onboarding modal + welcome toast

┌─────────────────────────────────────────────────────────────┐
│              COMMON PATH (Both Methods)                      │
└─────────────────────────────────────────────────────────────┘

auth.users created → (Email path may insert users record here)
                          ↓
                    users table INSERT/UPSERT
                          ↓
                    [TRIGGER BEFORE INSERT] handle_new_user_trial()
                          ↓
                          - Sets trial_ends_at
                          - Sets subscription_status
                          - Checks beta membership
                          ↓
                    users record committed
                          ↓
                    🎯 IDEAL NOTIFICATION POINT
                          ↓
                    Redirect to homepage
                          ↓
                    Layout detects ?onboarding=true
                          ↓
                    Shows onboarding modal
```

---

## 8. Where to Trigger Welcome Notification

### 8.1 Option 1: Database Trigger (RECOMMENDED)

**Location**: Modify `handle_new_user_trial()` function

**Pros**:

- ✅ Catches ALL user creation paths (email, Google, future methods)
- ✅ Runs automatically, no code changes in multiple places
- ✅ Transactional - fails if notification fails
- ✅ Single source of truth

**Cons**:

- ❌ Database logic (harder to test)
- ❌ Requires migration

**Implementation**:

```sql
-- In handle_new_user_trial() function
-- After setting trial status:

-- Insert welcome notification
INSERT INTO user_notifications (
  user_id,
  type,
  title,
  message,
  priority,
  action_url
) VALUES (
  NEW.id,
  'welcome',
  'Welcome to BuildOS!',
  'Get started by completing your onboarding to unlock the full power of BuildOS.',
  'high',
  '/onboarding'
);

RETURN NEW;
```

### 8.2 Option 2: GoogleOAuthHandler (Good for OAuth only)

**Location**: `google-oauth.ts` after user creation (line ~220)

**Pros**:

- ✅ Application-level logic (easier to test)
- ✅ Can access more context (tokens, profile)
- ✅ Can handle async operations

**Cons**:

- ❌ Only catches Google OAuth path
- ❌ Email signup path misses notification
- ❌ Requires separate logic for email path

**Implementation**:

```typescript
if (insertError) {
  console.error("Error creating user record:", insertError);
  dbUser = newUser;
} else {
  dbUser = insertedUser;

  // Insert welcome notification
  await this.supabase.from("user_notifications").insert({
    user_id: insertedUser.id,
    type: "welcome",
    title: "Welcome to BuildOS!",
    message: "Get started by completing your onboarding...",
    priority: "high",
    action_url: "/onboarding",
  });
}
```

### 8.3 Option 3: API Endpoint (Email signup only)

**Location**: `/api/auth/register/+server.ts` after signUp (line ~95)

**Pros**:

- ✅ Application-level logic
- ✅ Easy to test
- ✅ Can customize per signup method

**Cons**:

- ❌ Only catches email signup path
- ❌ OAuth path misses notification
- ❌ Duplicate logic needed

### 8.4 Option 4: Worker Queue Job (MOST SCALABLE)

**Location**: Trigger queue job from both paths

**Pros**:

- ✅ Async, non-blocking
- ✅ Retry logic
- ✅ Can send email + in-app notification
- ✅ Centralized welcome logic

**Cons**:

- ❌ More complex setup
- ❌ Slight delay in notification

**Implementation**:

```typescript
// In both GoogleOAuthHandler and /api/auth/register
await supabase.from("queue_jobs").insert({
  job_type: "send_welcome_notification",
  user_id: newUser.id,
  metadata: {
    user_email: newUser.email,
    user_name: newUser.name,
  },
});
```

---

## 9. Recommended Implementation Strategy

### Strategy: Database Trigger + Display Component

**Step 1: Update Database Trigger**

```sql
-- Modify: /apps/web/supabase/migrations/20241221_beta_user_sync.sql
-- Or create new migration: 20251005_add_welcome_notification.sql

CREATE OR REPLACE FUNCTION handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_days INTEGER;
  v_is_beta_member BOOLEAN;
BEGIN
  -- Existing logic...
  v_trial_days := COALESCE(current_setting('app.trial_days', true)::INTEGER, 14);

  SELECT EXISTS (
    SELECT 1 FROM beta_members
    WHERE email = NEW.email
    AND (access_level = 'full' OR access_level = 'limited')
  ) INTO v_is_beta_member;

  IF v_is_beta_member THEN
    NEW.is_beta_user := true;
  END IF;

  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  -- 🎯 NEW: Insert welcome notification
  INSERT INTO user_notifications (
    user_id,
    type,
    title,
    message,
    priority,
    action_url
  ) VALUES (
    NEW.id,
    'welcome',
    'Welcome to BuildOS! 🎉',
    E'We\'re excited to have you here! Complete your onboarding to get the most out of BuildOS and start organizing your projects with AI.',
    'high',
    '/onboarding'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Update Layout to Display Welcome Notification**

Current layout already displays `user_notifications` (lines 452-462):

```typescript
// +layout.server.ts loads notifications
const { data: notifications } = await supabase
  .from("user_notifications")
  .select("*")
  .eq("user_id", user.id)
  .eq("type", "payment_warning") // 🎯 Add 'welcome' type
  .is("read_at", null);
```

**Step 3: Create Welcome Notification Component**

```svelte
<!-- $lib/components/notifications/WelcomeNotification.svelte -->
<script lang="ts">
  export let notification: UserNotification

  function handleDismiss() {
    // Mark as read
  }

  function handleAction() {
    goto(notification.action_url)
  }
</script>

<div class="welcome-notification">
  <h3>{notification.title}</h3>
  <p>{notification.message}</p>
  <button on:click={handleAction}>Get Started</button>
  <button on:click={handleDismiss}>Dismiss</button>
</div>
```

---

## 10. Database Insertion Points Summary

| Point | Method | Table                | When                   | Trigger               | Notification Opportunity |
| ----- | ------ | -------------------- | ---------------------- | --------------------- | ------------------------ |
| 1     | Email  | `auth.users`         | supabase.auth.signUp() | No                    | ❌ Can't access          |
| 2     | Email  | `users`              | After auth creation    | BEFORE INSERT trigger | ✅ BEST (trigger)        |
| 3     | Google | `auth.users`         | signInWithIdToken()    | No                    | ❌ Can't access          |
| 4     | Google | `users`              | Manual INSERT if new   | BEFORE INSERT trigger | ✅ BEST (trigger)        |
| 5     | Both   | `user_notifications` | After user created     | Manual INSERT         | ✅ Display point         |

---

## 11. Auth Callback Handlers Summary

### Email/Password Handler

- **File**: `/apps/web/src/routes/api/auth/register/+server.ts`
- **Method**: POST
- **Creates User**: Via supabase.auth.signUp()
- **Session**: Auto-created if no email confirmation
- **Redirect**: Client-side via goto('/?onboarding=true')

### Google OAuth Handler

- **File**: `/apps/web/src/lib/utils/google-oauth.ts`
- **Class**: GoogleOAuthHandler
- **Method**: handleCallback(url, config)
- **Creates User**:
  1. signInWithIdToken() → auth.users
  2. Manual INSERT → public.users (if not exists)
- **Session**: Set via signInWithIdToken()
- **Redirect**: Server-side via redirect(303, '/?onboarding=true')

---

## 12. Onboarding Initialization

### Homepage Modal (`+layout.svelte`)

```typescript
// Conditions for showing modal
const showOnboardingModal =
  needsOnboarding &&                          // !user.completed_onboarding
  isHomePage &&                               // pathname === '/'
  (forceOnboarding ||                         // ?onboarding=true
   (onboardingProgress < 25 &&                // Progress < 25%
    !checkModalDismissed()))                  // Not dismissed

// Modal props
{
  isOpen: showOnboardingModal,
  onDismiss: handleModalDismiss
}

// Dismissal persistence
localStorage.setItem('onboarding_modal_dismissed', 'true')
```

### Onboarding Page (`/onboarding`)

```typescript
// Loads user context
const { data } = await supabase
  .from("user_context")
  .select("*")
  .eq("user_id", user.id)
  .single();

// Calculates progress
const inputFields = [
  "input_projects",
  "input_work_style",
  "input_challenges",
  "input_help_focus",
];

const progress = (completedFields.length / inputFields.length) * 100;

// Redirects if complete
if (progress === 100 && onboarding_completed_at) {
  throw redirect(303, "/");
}
```

---

## 13. Existing Post-Signup Events/Webhooks

### Current Events

- ❌ No custom Supabase Auth webhooks configured
- ❌ No application-level signup event system
- ❌ No webhook handlers for new user signups

### Database Events

- ✅ `on_auth_user_created_trial` trigger (BEFORE INSERT on users)
  - Sets trial status
  - Checks beta membership
  - **🎯 IDEAL place to add notification**

### Background Jobs

- ✅ Trial reminder cron (`/api/cron/trial-reminders`)
  - Sends reminders at 7, 3, 1 days before trial end
  - Uses `trial_reminders` table to track sent reminders
  - **Could be model for welcome notification**

---

## Conclusion

**Best Implementation Path:**

1. **Database Trigger** (handles all signup paths)
   - Modify `handle_new_user_trial()` in migration
   - Insert welcome notification to `user_notifications` table

2. **Layout Component** (displays notification)
   - Update `+layout.server.ts` to load welcome notifications
   - Create `WelcomeNotification.svelte` component
   - Add to layout with dismiss/action handlers

3. **Optional: Queue Job** (for email welcome)
   - Create `send_welcome_email` job type
   - Trigger from same database trigger
   - Handle via Railway worker

This approach:

- ✅ Catches both email and Google OAuth signup paths
- ✅ Single source of truth (database trigger)
- ✅ Reuses existing notification infrastructure
- ✅ No code duplication
- ✅ Transactional and reliable
- ✅ Easy to test and extend

---

## File References

### Key Files

- `/apps/web/src/routes/auth/register/+page.svelte` - Email signup UI
- `/apps/web/src/routes/api/auth/register/+server.ts` - Email signup API
- `/apps/web/src/lib/utils/google-oauth.ts` - OAuth handler
- `/apps/web/src/routes/auth/google/register-callback/+page.server.ts` - OAuth callback
- `/apps/web/src/routes/+layout.svelte` - Onboarding modal trigger
- `/apps/web/src/routes/onboarding/+page.server.ts` - Onboarding page
- `/apps/web/src/hooks.server.ts` - Session management
- `/apps/web/supabase/migrations/20241220_trial_system.sql` - Trial trigger
- `/apps/web/supabase/migrations/20241221_beta_user_sync.sql` - Beta check
- `/apps/web/supabase/migrations/20241219_dunning_system.sql` - Notifications table

### Database Tables

- `auth.users` - Supabase auth users
- `public.users` - App user records
- `user_notifications` - In-app notifications
- `trial_reminders` - Trial notification tracking
- `beta_members` - Beta program members
- `queue_jobs` - Background job queue
