<!-- apps/web/docs/technical/api/endpoints/authentication.md -->

# Authentication & Account API

**Base Paths:** `/api/auth`, `/api/account`

The Authentication & Account API handles user authentication, session management, profile management, and account settings.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Session Management](#session-management)
3. [Account Management](#account-management)
4. [User Profile](#user-profile)
5. [OAuth Integration](#oauth-integration)
6. [Security](#security)

---

## Authentication

### 1. `POST /auth/signup` - User Registration

**Purpose:** Create a new user account.

**File:** `src/routes/auth/signup/+server.ts`

**Authentication:** None (public)

#### Request Body

```typescript
{
  email: string;       // Required, valid email format
  password: string;    // Required, min 8 chars
  name?: string;       // Optional display name
  timezone?: string;   // Optional timezone (default: UTC)
}
```

#### Response: `ApiResponse<{ user: User, session: Session }>`

```typescript
{
  success: true,
  data: {
    user: {
      id: "uuid",
      email: "user@example.com",
      name: "John Doe",
      email_confirmed: false,
      trial_ends_at: "2025-01-29T00:00:00Z",  // 14 days from signup
      created_at: "2025-01-15T10:00:00Z"
    },
    session: {
      access_token: "jwt-token",
      refresh_token: "refresh-token",
      expires_at: "2025-01-16T10:00:00Z"
    }
  },
  message: "Account created successfully. Please check your email to confirm your account."
}
```

#### Side Effects

- Creates user record in database
- Sends email confirmation link
- Starts 14-day free trial
- Creates default user preferences
- Logs signup event for analytics

#### Validation

- **Email**: Must be valid email format, not already registered
- **Password**: Minimum 8 characters, must contain letter and number
- **Name**: Max 100 characters if provided

---

### 2. `POST /auth/login` - User Login

**Purpose:** Authenticate user and create session.

**File:** `src/routes/auth/login/+server.ts`

**Authentication:** None (public)

#### Request Body

```typescript
{
  email: string;
  password: string;
  remember_me?: boolean;  // Extends session duration
}
```

#### Response: `ApiResponse<{ user: User, session: Session }>`

```typescript
{
  success: true,
  data: {
    user: {
      id: "uuid",
      email: "user@example.com",
      name: "John Doe",
      email_confirmed: true,
      subscription_status: "paid",
      last_login_at: "2025-01-15T10:00:00Z"
    },
    session: {
      access_token: "jwt-token",
      refresh_token: "refresh-token",
      expires_at: "2025-01-16T10:00:00Z"
    }
  }
}
```

#### Side Effects

- Updates `last_login_at` timestamp
- Creates new session in database
- Logs login event
- Invalidates old sessions if max session limit reached

#### Error Handling

- `401 Unauthorized`: Invalid email or password
- `403 Forbidden`: Account banned or suspended
- `429 Too Many Requests`: Too many failed login attempts

---

### 3. `POST /auth/logout` - User Logout

**Purpose:** End current session.

**File:** `src/routes/auth/logout/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ logged_out: true }>`

```typescript
{
  success: true,
  data: { logged_out: true },
  message: "Logged out successfully"
}
```

#### Side Effects

- Invalidates current session
- Clears session cookie
- Logs logout event

---

### 4. `POST /auth/refresh` - Refresh Session

**Purpose:** Refresh access token using refresh token.

**File:** `src/routes/auth/refresh/+server.ts`

**Authentication:** Requires valid refresh token

#### Request Body

```typescript
{
	refresh_token: string;
}
```

#### Response: `ApiResponse<{ session: Session }>`

```typescript
{
  success: true,
  data: {
    session: {
      access_token: "new-jwt-token",
      refresh_token: "new-refresh-token",
      expires_at: "2025-01-16T10:00:00Z"
    }
  }
}
```

---

### 5. `POST /auth/forgot-password` - Request Password Reset

**Purpose:** Initiate password reset flow.

**File:** `src/routes/auth/forgot-password/+server.ts`

**Authentication:** None (public)

#### Request Body

```typescript
{
	email: string;
}
```

#### Response: `ApiResponse<{ sent: true }>`

```typescript
{
  success: true,
  data: { sent: true },
  message: "If an account exists with that email, you will receive password reset instructions."
}
```

#### Side Effects

- Generates password reset token
- Sends password reset email
- Token expires after 1 hour
- Rate limited to prevent abuse

---

### 6. `POST /auth/reset-password` - Reset Password

**Purpose:** Complete password reset with token.

**File:** `src/routes/auth/reset-password/+server.ts`

**Authentication:** Requires valid reset token

#### Request Body

```typescript
{
	token: string; // Reset token from email
	password: string; // New password
}
```

#### Response: `ApiResponse<{ reset: true }>`

```typescript
{
  success: true,
  data: { reset: true },
  message: "Password reset successfully. You can now log in with your new password."
}
```

#### Side Effects

- Updates user password
- Invalidates reset token
- Invalidates all existing sessions
- Sends confirmation email

---

## Session Management

### 7. `GET /api/auth/session` - Get Current Session

**Purpose:** Retrieve current session and user information.

**File:** `src/routes/api/auth/session/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ session: SessionInfo }>`

```typescript
{
  success: true,
  data: {
    session: {
      user: {
        id: "uuid",
        email: "user@example.com",
        name: "John Doe",
        email_confirmed: true,
        subscription_status: "paid",
        trial_ends_at: null,
        is_admin: false
      },
      expires_at: "2025-01-16T10:00:00Z",
      created_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

---

### 8. `GET /api/auth/sessions` - List Active Sessions

**Purpose:** Retrieve all active sessions for current user.

**File:** `src/routes/api/auth/sessions/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ sessions: Session[] }>`

```typescript
{
  success: true,
  data: {
    sessions: [
      {
        id: "session-uuid",
        created_at: "2025-01-15T10:00:00Z",
        expires_at: "2025-01-16T10:00:00Z",
        last_active: "2025-01-15T14:30:00Z",
        device: "Chrome on macOS",
        ip_address: "192.168.1.1",
        is_current: true
      },
      {
        id: "session-uuid-2",
        created_at: "2025-01-14T08:00:00Z",
        expires_at: "2025-01-15T08:00:00Z",
        last_active: "2025-01-15T12:00:00Z",
        device: "Safari on iOS",
        ip_address: "192.168.1.2",
        is_current: false
      }
    ]
  }
}
```

---

### 9. `DELETE /api/auth/sessions/[id]` - Revoke Session

**Purpose:** Invalidate a specific session.

**File:** `src/routes/api/auth/sessions/[id]/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ revoked: true }>`

```typescript
{
  success: true,
  data: { revoked: true },
  message: "Session revoked successfully"
}
```

---

## Account Management

### 10. `GET /api/account` - Get Account Details

**Purpose:** Retrieve complete account information.

**File:** `src/routes/api/account/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ account: Account }>`

```typescript
{
  success: true,
  data: {
    account: {
      id: "uuid",
      email: "user@example.com",
      email_confirmed: true,
      name: "John Doe",
      timezone: "America/New_York",

      // Subscription info
      subscription: {
        status: "paid",
        plan: "pro",
        current_period_end: "2025-02-15T00:00:00Z",
        cancel_at_period_end: false
      },

      // Trial info (if applicable)
      trial: {
        is_trial: false,
        trial_ends_at: null,
        days_remaining: 0
      },

      // Usage statistics
      usage: {
        projects: 5,
        tasks: 45,
        brain_dumps_this_month: 12,
        storage_used_mb: 1.5
      },

      // Account settings
      preferences: {
        daily_brief_enabled: true,
        email_notifications: true,
        theme: "dark",
        language: "en"
      },

      // Metadata
      created_at: "2025-01-01T00:00:00Z",
      last_login_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

---

### 11. `PATCH /api/account` - Update Account

**Purpose:** Update account details.

**File:** `src/routes/api/account/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (All Optional)

```typescript
{
  name?: string;
  timezone?: string;
  language?: string;
}
```

#### Response: `ApiResponse<{ account: Account }>`

---

### 12. `DELETE /api/account` - Delete Account

**Purpose:** Permanently delete user account.

**File:** `src/routes/api/account/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  password: string;      // Current password for confirmation
  confirm: boolean;      // Must be true
  reason?: string;       // Optional deletion reason
}
```

#### Response: `ApiResponse<{ deleted: true }>`

```typescript
{
  success: true,
  data: { deleted: true },
  message: "Your account has been permanently deleted."
}
```

#### Side Effects

- Permanently deletes user record
- Cascades to all projects, tasks, brain dumps
- Cancels active subscription
- Removes all calendar integrations
- Sends confirmation email
- **Cannot be undone**

---

### 13. `POST /api/account/change-password` - Change Password

**Purpose:** Update user password.

**File:** `src/routes/api/account/change-password/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
	current_password: string;
	new_password: string;
}
```

#### Response: `ApiResponse<{ changed: true }>`

```typescript
{
  success: true,
  data: { changed: true },
  message: "Password changed successfully"
}
```

#### Side Effects

- Updates password hash
- Invalidates all sessions except current
- Sends confirmation email
- Logs password change event

---

### 14. `POST /api/account/change-email` - Change Email

**Purpose:** Update email address.

**File:** `src/routes/api/account/change-email/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
	new_email: string;
	password: string; // Current password for confirmation
}
```

#### Response: `ApiResponse<{ pending: true }>`

```typescript
{
  success: true,
  data: { pending: true },
  message: "Verification email sent to new address. Please confirm to complete email change."
}
```

#### Side Effects

- Sends verification email to new address
- Email change pending until confirmed
- Old email remains active until confirmation
- Confirmation expires after 24 hours

---

## User Profile

### 15. `GET /api/account/profile` - Get Profile

**Purpose:** Retrieve user profile information.

**File:** `src/routes/api/account/profile/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ profile: UserProfile }>`

```typescript
{
  success: true,
  data: {
    profile: {
      id: "uuid",
      name: "John Doe",
      email: "user@example.com",
      avatar_url: "https://...",
      bio: "Product manager focused on productivity",
      timezone: "America/New_York",
      language: "en",

      // Social links
      links: {
        twitter: "@johndoe",
        linkedin: "linkedin.com/in/johndoe",
        website: "johndoe.com"
      },

      // Preferences
      preferences: {
        theme: "dark",
        notifications: {
          email: true,
          push: true,
          daily_brief: true,
          task_reminders: true
        },
        working_hours: {
          start: "09:00",
          end: "17:00",
          timezone: "America/New_York"
        }
      }
    }
  }
}
```

---

### 16. `PATCH /api/account/profile` - Update Profile

**Purpose:** Update profile information.

**File:** `src/routes/api/account/profile/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (All Optional)

```typescript
{
  name?: string;
  bio?: string;
  avatar_url?: string;
  timezone?: string;
  language?: string;
  links?: {
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
}
```

#### Response: `ApiResponse<{ profile: UserProfile }>`

---

### 17. `POST /api/account/avatar` - Upload Avatar

**Purpose:** Upload profile avatar image.

**File:** `src/routes/api/account/avatar/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (multipart/form-data)

```typescript
{
	file: File; // Image file (max 5MB)
}
```

#### Response: `ApiResponse<{ avatar_url: string }>`

```typescript
{
  success: true,
  data: {
    avatar_url: "https://storage.example.com/avatars/uuid.jpg"
  },
  message: "Avatar uploaded successfully"
}
```

#### Validation

- File must be image (JPEG, PNG, GIF, WebP)
- Max file size: 5MB
- Auto-resized to 400x400px
- Old avatar deleted from storage

---

## OAuth Integration

### 18. `GET /auth/google` - Google OAuth Initiate

**Purpose:** Start Google OAuth flow.

**File:** `src/routes/auth/google/+server.ts`

**Authentication:** None (public)

#### Query Parameters

| Parameter     | Type     | Required | Description             |
| ------------- | -------- | -------- | ----------------------- |
| `redirect_to` | `string` | No       | Post-login redirect URL |

#### Response: Redirect

Redirects to Google OAuth consent screen.

---

### 19. `GET /auth/google/callback` - Google OAuth Callback

**Purpose:** Handle Google OAuth callback.

**File:** `src/routes/auth/google/callback/+server.ts`

**Authentication:** None (public - OAuth flow)

#### Query Parameters (Provided by Google)

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| `code`    | `string` | Yes      | OAuth authorization code |
| `state`   | `string` | Yes      | CSRF protection state    |

#### Response: Redirect

Redirects to app with session cookie set.

#### Side Effects

- Exchanges code for Google access token
- Creates or updates user account
- Links Google Calendar access
- Creates session
- Redirects to dashboard or `redirect_to` URL

---

### 20. `POST /api/account/oauth/disconnect` - Disconnect OAuth

**Purpose:** Disconnect OAuth provider.

**File:** `src/routes/api/account/oauth/disconnect/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
	provider: 'google';
}
```

#### Response: `ApiResponse<{ disconnected: true }>`

```typescript
{
  success: true,
  data: { disconnected: true },
  message: "Google account disconnected successfully"
}
```

#### Side Effects

- Removes OAuth access tokens
- Revokes calendar access
- Does not delete user account
- User can still login with password

---

## Security

### 21. `GET /api/account/security` - Security Settings

**Purpose:** Get account security information.

**File:** `src/routes/api/account/security/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ security: SecurityInfo }>`

```typescript
{
  success: true,
  data: {
    security: {
      // Password info
      password_last_changed: "2025-01-01T00:00:00Z",
      password_strength: "strong",

      // 2FA status
      two_factor_enabled: false,

      // Active sessions
      active_sessions_count: 2,

      // Security events
      recent_events: [
        {
          type: "login",
          timestamp: "2025-01-15T10:00:00Z",
          ip_address: "192.168.1.1",
          location: "New York, US",
          device: "Chrome on macOS"
        },
        {
          type: "password_changed",
          timestamp: "2025-01-01T00:00:00Z",
          ip_address: "192.168.1.1"
        }
      ],

      // Connected services
      connected_oauth: ["google"],

      // API tokens
      api_tokens_count: 0
    }
  }
}
```

---

### 22. `POST /api/account/verify-email/resend` - Resend Verification Email

**Purpose:** Resend email verification link.

**File:** `src/routes/api/account/verify-email/resend/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ sent: true }>`

```typescript
{
  success: true,
  data: { sent: true },
  message: "Verification email sent. Please check your inbox."
}
```

#### Rate Limiting

- Max 3 requests per hour per user
- Returns 429 if limit exceeded

---

### 23. `GET /api/account/verify-email/[token]` - Verify Email

**Purpose:** Confirm email address with token.

**File:** `src/routes/api/account/verify-email/[token]/+server.ts`

**Authentication:** None (public - uses token)

#### URL Parameters

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| `token`   | `string` | Yes      | Verification token from email |

#### Response: `ApiResponse<{ verified: true }>`

```typescript
{
  success: true,
  data: { verified: true },
  message: "Email verified successfully!"
}
```

#### Side Effects

- Sets `email_confirmed = true`
- Invalidates verification token
- Logs verification event

---

## Common Patterns

### Session Authentication

```typescript
const { session } = await safeGetSession(event);
if (!session?.user) {
	return ApiResponse.unauthorized('Authentication required');
}
const userId = session.user.id;
```

### Password Validation

```typescript
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
if (!passwordRegex.test(password)) {
	return ApiResponse.badRequest(
		'Password must be at least 8 characters and contain letters and numbers'
	);
}
```

### Email Validation

```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
	return ApiResponse.badRequest('Invalid email format');
}
```

---

## Security Considerations

### Password Security

- Passwords hashed using bcrypt (cost factor 12)
- Minimum 8 characters, must contain letter and number
- Password change invalidates all sessions
- Failed login attempts rate limited

### Session Security

- JWT tokens with 24-hour expiration
- Refresh tokens stored in database
- HTTPS-only session cookies
- CSRF protection on all mutations

### OAuth Security

- State parameter for CSRF protection
- Access tokens encrypted at rest
- Refresh tokens securely stored
- OAuth scopes minimized

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0
