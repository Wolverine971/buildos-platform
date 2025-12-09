<!-- apps/web/docs/features/onboarding-v2/calendar-connection-cta-spec.md -->

# Onboarding V2: Calendar Connection & Analysis CTA - Design Spec

**Date**: 2025-10-07
**Author**: Claude (AI Assistant)
**Status**: Draft - Ready for Review
**Git Commit**: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
**Branch**: main

---

## 🎯 Executive Summary

This spec addresses a critical UX gap in the Onboarding V2 ProjectsCaptureStep where users are encouraged to analyze their calendar, but the flow doesn't properly handle the case where their calendar isn't connected yet.

**Current Problem**: Users see a "Analyze My Calendar" button, but if clicked without a connected calendar, they get an error toast telling them to go to their Profile page.

**Proposed Solution**: Create a clear two-phase flow that:

1. **Detects** calendar connection status upfront
2. **Guides** users to connect calendar first with clear value proposition
3. **Enables** calendar analysis after connection
4. **Optimizes** the flow for onboarding context (inline, fast, clear)

---

## 📋 Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [User Flows](#user-flows)
3. [Technical Implementation](#technical-implementation)
4. [UI/UX Specification](#uiux-specification)
5. [API Requirements](#api-requirements)
6. [Testing Strategy](#testing-strategy)
7. [Success Metrics](#success-metrics)
8. [Future Enhancements](#future-enhancements)

---

## 1️⃣ Current State Analysis

### Existing Implementation

**File**: `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`

**Current Behavior** (Lines 27-44):

```typescript
// Check if user has Google Calendar connected
async function checkCalendarConnection(): Promise<boolean> {
	try {
		const response = await fetch('/api/calendar/status'); // ⚠️ BUG: Wrong endpoint
		const result = await response.json();
		return result.success && result.data?.connected;
	} catch (error) {
		console.error('Failed to check calendar connection:', error);
		return false;
	}
}

// Initialize calendar status
$effect(() => {
	checkCalendarConnection().then((connected) => {
		hasCalendarConnected = connected;
	});
});
```

**Issues Identified**:

1. **Wrong API Endpoint** (Line 30)
    - Currently calls: `/api/calendar/status` (doesn't exist)
    - Should call: `/api/calendar` (GET method)
    - Response format: `{ success: true, connected: boolean, userId: string }`

2. **Poor Error Handling** (Line 46-52)
    - If calendar not connected, shows error toast: "Please connect your Google Calendar first from the Profile page."
    - Forces user to navigate away from onboarding flow
    - Breaks onboarding momentum

3. **Unclear Value Proposition** (Line 234-236)
    - Generic text: "Want BuildOS to analyze your Google Calendar?"
    - Doesn't emphasize the benefit: "We'll automatically create projects based on your meetings"
    - Lacks urgency/compelling reason

4. **No Inline Connection Option**
    - Users must leave onboarding to connect calendar
    - No way to connect calendar within the flow

### Current Calendar Analysis Service

**File**: `/apps/web/src/lib/services/calendar-analysis.service.ts`

**Key Methods**:

- `analyzeUserCalendar(userId, options)` - Main analysis function
- Returns: `{ analysisId, suggestions, eventsAnalyzed }`
- Fetches 30 days back, 60 days forward (configurable)
- Uses AI to detect project patterns from calendar events
- Creates project suggestions with tasks

**Current Integration** (Line 46-74):

- Uses `startCalendarAnalysis()` from `calendar-analysis-notification.bridge.ts`
- Starts analysis via notification stack
- Shows progress in notification panel (bottom-right)
- Works well when calendar IS connected

---

## 2️⃣ User Flows

### Flow A: Calendar Not Connected (Primary Case)

```
User arrives at ProjectsCaptureStep
         ↓
[System checks calendar connection status]
         ↓
    NOT CONNECTED
         ↓
┌─────────────────────────────────────────┐
│ 🎯 VALUE PROPOSITION CARD               │
│                                         │
│ "Let BuildOS analyze your calendar      │
│  and automatically create projects      │
│  based on your meetings and events"     │
│                                         │
│ ✓ Automatic project detection           │
│ ✓ Pre-filled tasks from meetings        │
│ ✓ Smart scheduling around commitments   │
│                                         │
│ [Connect Google Calendar] ← PRIMARY CTA │
│ [Skip for now]            ← Secondary   │
└─────────────────────────────────────────┘
         ↓
User clicks "Connect Google Calendar"
         ↓
┌─────────────────────────────────────────┐
│ OAUTH FLOW (Google Consent Screen)     │
│ - Requests calendar read permissions    │
│ - Handled by existing OAuth service     │
└─────────────────────────────────────────┘
         ↓
    CONNECTION SUCCESS
         ↓
┌─────────────────────────────────────────┐
│ ✓ Calendar Connected!                   │
│                                         │
│ [Analyze My Calendar Now] ← Auto-focus  │
│ [Continue without analysis]             │
└─────────────────────────────────────────┘
         ↓
User clicks "Analyze My Calendar Now"
         ↓
[Triggers calendar analysis]
         ↓
    (Flow C: Analysis Running)
```

### Flow B: Calendar Already Connected

```
User arrives at ProjectsCaptureStep
         ↓
[System checks calendar connection status]
         ↓
    ✓ CONNECTED
         ↓
┌─────────────────────────────────────────┐
│ 📊 CALENDAR ANALYSIS CARD               │
│                                         │
│ ✓ Google Calendar connected             │
│                                         │
│ "We can automatically suggest projects  │
│  based on your meetings and events"     │
│                                         │
│ [Analyze My Calendar] ← PRIMARY CTA     │
│                                         │
│ 📝 Or describe your projects manually   │
│ [text input below]                      │
└─────────────────────────────────────────┘
         ↓
User clicks "Analyze My Calendar"
         ↓
    (Flow C: Analysis Running)
```

### Flow C: Calendar Analysis Running

```
[Analysis Started]
         ↓
┌─────────────────────────────────────────┐
│ 🔄 Analyzing your calendar...           │
│                                         │
│ [Progress indicator]                    │
│                                         │
│ ℹ️ Check notification panel (bottom-   │
│    right) for progress and results      │
│                                         │
│ Meanwhile, you can:                     │
│ • Describe projects manually below      │
│ • Or continue to next step              │
│                                         │
│ [Continue to Next Step]                 │
└─────────────────────────────────────────┘
         ↓
User can either:
  A. Describe projects manually (brain dump)
  B. Continue to next step
  C. Wait for analysis to complete
```

### Flow D: User Skips Calendar Analysis

```
User clicks "Skip for now" or "I'll add projects later"
         ↓
[Save skip state to user preferences]
         ↓
[Continue to next onboarding step]
```

---

## 3️⃣ Technical Implementation

### 3.1 Component Changes

**File**: `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`

#### State Variables (Add/Modify)

```typescript
// Calendar connection state
let hasCalendarConnected = $state(false);
let isCheckingConnection = $state(true);
let connectionError = $state<string | null>(null);

// Calendar analysis state
let calendarAnalysisStarted = $state(false);
let isConnectingCalendar = $state(false);

// UI state
let showConnectionSuccess = $state(false);
```

#### Function: Fix Calendar Connection Check

```typescript
/**
 * Check if user has Google Calendar connected
 * FIXED: Use correct API endpoint
 */
async function checkCalendarConnection(): Promise<boolean> {
	try {
		isCheckingConnection = true;
		connectionError = null;

		// FIXED: Correct endpoint is /api/calendar (GET)
		const response = await fetch('/api/calendar');

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const result = await response.json();

		// Response format: { success: boolean, connected: boolean, userId: string }
		return result.success && result.connected === true;
	} catch (error) {
		console.error('Failed to check calendar connection:', error);
		connectionError = error instanceof Error ? error.message : 'Connection check failed';
		return false;
	} finally {
		isCheckingConnection = false;
	}
}
```

#### Function: Handle Calendar Connection

```typescript
/**
 * Initiate Google Calendar OAuth connection
 * Opens OAuth flow in popup window
 */
async function handleConnectCalendar() {
	try {
		isConnectingCalendar = true;

		// Use existing Google OAuth service
		// Redirect to OAuth flow
		const authUrl = '/auth/google/calendar';
		const width = 600;
		const height = 700;
		const left = window.screenX + (window.outerWidth - width) / 2;
		const top = window.screenY + (window.outerHeight - height) / 2;

		const popup = window.open(
			authUrl,
			'Google Calendar Authorization',
			`width=${width},height=${height},left=${left},top=${top}`
		);

		if (!popup) {
			throw new Error('Popup blocked. Please allow popups for this site.');
		}

		// Poll for completion
		const checkInterval = setInterval(async () => {
			if (popup.closed) {
				clearInterval(checkInterval);

				// Check if connection was successful
				const connected = await checkCalendarConnection();

				if (connected) {
					hasCalendarConnected = true;
					showConnectionSuccess = true;
					toastService.success('Google Calendar connected successfully! 🎉');

					// Auto-hide success message after 3 seconds
					setTimeout(() => {
						showConnectionSuccess = false;
					}, 3000);
				} else {
					toastService.error('Calendar connection was cancelled or failed.');
				}

				isConnectingCalendar = false;
			}
		}, 500);
	} catch (error) {
		console.error('Calendar connection error:', error);
		toastService.error(error instanceof Error ? error.message : 'Failed to connect calendar');
		isConnectingCalendar = false;
	}
}
```

#### Function: Enhanced Calendar Analysis

```typescript
/**
 * Start calendar analysis
 * Only callable when calendar is connected
 */
async function handleStartCalendarAnalysis() {
	try {
		// Double-check connection before analysis
		const connected = await checkCalendarConnection();

		if (!connected) {
			toastService.error('Please connect your Google Calendar first.');
			hasCalendarConnected = false;
			return;
		}

		// Start calendar analysis via notification stack
		const { notificationId } = await startCalendarAnalysis({
			daysBack: 7,
			daysForward: 60,
			expandOnStart: false, // Keep minimized
			expandOnComplete: true // Auto-expand when complete
		});

		calendarAnalysisStarted = true;

		toastService.success(
			'Calendar analysis started! Check the notification in the bottom-right corner.'
		);
	} catch (error) {
		console.error('Calendar analysis error:', error);
		toastService.error(
			error instanceof Error ? error.message : 'Failed to start calendar analysis'
		);
	}
}
```

#### Lifecycle: Initialize on Mount

```typescript
// Initialize calendar status on component mount
$effect(() => {
	checkCalendarConnection().then((connected) => {
		hasCalendarConnected = connected;
	});
});
```

### 3.2 API Requirements

#### Existing Endpoint (Use As-Is)

**GET** `/api/calendar`

**Response**:

```typescript
{
	success: boolean;
	connected: boolean;  // true if user has valid Google OAuth token
	userId: string;
	error?: string;
}
```

**Usage**: Check calendar connection status

#### OAuth Flow (Existing)

**GET** `/auth/google/calendar`

- Initiates Google OAuth flow
- Requests calendar read permissions
- Redirects back to onboarding after authorization
- Handled by existing GoogleOAuthService

**Implementation File**: `/apps/web/src/lib/services/google-oauth-service.ts`

**Required Scopes**:

- `https://www.googleapis.com/auth/calendar.readonly` (minimum)
- `https://www.googleapis.com/auth/calendar.events` (for task scheduling)

---

## 4️⃣ UI/UX Specification

### 4.1 Visual Design

#### State 1: Calendar Not Connected

```svelte
<!-- Calendar Connection CTA Card -->
<div
	class="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800 shadow-sm"
>
	<!-- Header -->
	<div class="flex items-start gap-4 mb-4">
		<div
			class="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0"
		>
			<Calendar class="w-6 h-6 text-white" />
		</div>
		<div class="flex-1">
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
				Let us analyze your calendar
			</h3>
			<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
				Connect your Google Calendar and we'll automatically create projects based on your
				meetings and events. No manual entry needed!
			</p>
		</div>
	</div>

	<!-- Benefits -->
	<div class="mb-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
		<div class="flex items-center gap-2">
			<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400" />
			<span>Automatic project detection from recurring meetings</span>
		</div>
		<div class="flex items-center gap-2">
			<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400" />
			<span>Pre-filled tasks with meeting details and dates</span>
		</div>
		<div class="flex items-center gap-2">
			<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400" />
			<span>Smart scheduling around your existing commitments</span>
		</div>
	</div>

	<!-- Demo Preview (Optional) -->
	{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
		<div
			class="mb-4 bg-white dark:bg-gray-900 rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700"
		>
			<p class="text-gray-400 text-xs mb-1">
				🎥 [15-second demo: Calendar → Projects transformation]
			</p>
		</div>
	{/if}

	<!-- Primary CTA -->
	<Button
		variant="primary"
		size="lg"
		onclick={handleConnectCalendar}
		disabled={isConnectingCalendar}
		loading={isConnectingCalendar}
		class="w-full mb-3"
	>
		{#if isConnectingCalendar}
			<Loader2 class="w-5 h-5 mr-2 animate-spin" />
			Connecting...
		{:else}
			<Calendar class="w-5 h-5 mr-2" />
			Connect Google Calendar
		{/if}
	</Button>

	<!-- Secondary Action -->
	<button
		class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full text-center"
		onclick={skipCalendarConnection}
	>
		Skip for now — I'll connect later
	</button>
</div>
```

#### State 2: Connection Success (Transient)

```svelte
<!-- Connection Success Animation -->
{#if showConnectionSuccess}
	<div
		class="mb-6 p-5 bg-green-50 dark:bg-green-900/20 rounded-xl border-2 border-green-200 dark:border-green-800 shadow-sm"
		in:scale={{ duration: 400, start: 0.9 }}
		out:fade={{ duration: 300 }}
	>
		<div class="flex items-center gap-3 mb-4">
			<div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
				<CheckCircle class="w-6 h-6 text-white" />
			</div>
			<div>
				<h4 class="font-semibold text-green-900 dark:text-green-100">
					Calendar Connected! 🎉
				</h4>
				<p class="text-sm text-green-700 dark:text-green-300">
					Ready to analyze your schedule
				</p>
			</div>
		</div>

		<Button variant="primary" size="lg" onclick={handleStartCalendarAnalysis} class="w-full">
			<Sparkles class="w-5 h-5 mr-2" />
			Analyze My Calendar Now
		</Button>
	</div>
{/if}
```

#### State 3: Calendar Connected (Persistent)

```svelte
<!-- Calendar Analysis Available -->
<div
	class="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
>
	<div class="flex items-start gap-4 mb-4">
		<div
			class="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0"
		>
			<CheckCircle class="w-5 h-5 text-white" />
		</div>
		<div class="flex-1">
			<h4 class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
				Google Calendar Connected
				<span
					class="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full"
				>
					Ready
				</span>
			</h4>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				We can analyze your calendar and automatically suggest projects based on your
				meetings and events.
			</p>
		</div>
	</div>

	<Button
		variant="secondary"
		onclick={handleStartCalendarAnalysis}
		disabled={calendarAnalysisStarted}
		class="w-full sm:w-auto"
	>
		<Calendar class="w-4 h-4 mr-2" />
		{calendarAnalysisStarted ? 'Analysis Running...' : 'Analyze My Calendar'}
	</Button>

	{#if calendarAnalysisStarted}
		<p class="text-xs text-blue-600 dark:text-blue-400 mt-3 flex items-center gap-2">
			<Loader2 class="w-3 h-3 animate-spin" />
			Analysis in progress — Check notification panel (bottom-right corner)
		</p>
	{/if}
</div>

<!-- Divider -->
<div class="mb-6 flex items-center gap-3">
	<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
	<span class="text-sm text-gray-500 dark:text-gray-400 font-medium">OR</span>
	<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
</div>

<!-- Manual Brain Dump Section -->
<div class="mb-6">
	<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
		Describe your projects manually
	</h4>
	<Textarea
		bind:value={projectInput}
		placeholder="Don't worry about structure — just brain dump..."
		rows={8}
		disabled={isProcessing}
		class="w-full"
	/>
</div>
```

### 4.2 Copy & Messaging

#### Headlines by State

| State              | Headline                           | Subtext                                                                                                   |
| ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Not Connected      | "Let us analyze your calendar"     | "Connect your Google Calendar and we'll automatically create projects based on your meetings and events." |
| Connecting         | "Connecting to Google Calendar..." | "This will open a new window for authorization"                                                           |
| Connection Success | "Calendar Connected! 🎉"           | "Ready to analyze your schedule"                                                                          |
| Connected          | "Google Calendar Connected"        | "We can analyze your calendar and automatically suggest projects"                                         |
| Analysis Running   | "Analyzing your calendar..."       | "Check notification panel for progress and results"                                                       |

#### Button Labels

| Action             | Primary Button            | Secondary Button                    |
| ------------------ | ------------------------- | ----------------------------------- |
| Not Connected      | "Connect Google Calendar" | "Skip for now — I'll connect later" |
| Connection Success | "Analyze My Calendar Now" | —                                   |
| Connected          | "Analyze My Calendar"     | —                                   |
| Analysis Running   | — (disabled)              | "Continue to Next Step"             |

### 4.3 Accessibility

- **Keyboard Navigation**: All buttons accessible via Tab key
- **Screen Readers**: Use ARIA labels for state changes
- **Loading States**: Clear visual and text indicators
- **Error Messages**: Specific, actionable error text
- **Color Contrast**: WCAG AA compliant (4.5:1 minimum)

```svelte
<!-- Accessibility attributes -->
<Button
	variant="primary"
	onclick={handleConnectCalendar}
	disabled={isConnectingCalendar}
	aria-label="Connect Google Calendar to enable automatic project detection"
	aria-busy={isConnectingCalendar}
>
	Connect Google Calendar
</Button>
```

---

## 5️⃣ API Requirements

### 5.1 Calendar Connection Check

**Endpoint**: `GET /api/calendar`

**Request**: None (uses session auth)

**Response**:

```typescript
{
	success: true,
	connected: true,
	userId: "user-uuid-here"
}
```

**Error Response**:

```typescript
{
	success: false,
	connected: false,
	error: "User not authenticated"
}
```

**Implementation Status**: ✅ Already exists (see `/apps/web/src/routes/api/calendar/+server.ts` lines 122-145)

### 5.2 Google OAuth Flow

**Endpoint**: `GET /auth/google/calendar`

**Behavior**:

1. Initiates Google OAuth consent screen
2. Requests calendar permissions
3. Stores OAuth token in database
4. Redirects back to onboarding or provided callback URL

**Required Environment Variables**:

```env
PUBLIC_GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

**Implementation Status**: ✅ Already exists (handled by GoogleOAuthService)

### 5.3 Calendar Analysis Trigger

**Service**: `CalendarAnalysisService.analyzeUserCalendar()`

**Bridge**: `startCalendarAnalysis()` from `calendar-analysis-notification.bridge.ts`

**Parameters**:

```typescript
{
	daysBack: 7,        // Analyze past 7 days for context
	daysForward: 60,    // Analyze next 60 days for tasks
	expandOnStart: false,
	expandOnComplete: true
}
```

**Implementation Status**: ✅ Already exists (see lines 46-74 in ProjectsCaptureStep.svelte)

---

## 6️⃣ Testing Strategy

### 6.1 Manual Testing Scenarios

#### Test Case 1: New User, No Calendar

**Setup**: New user account, no Google Calendar connected

**Steps**:

1. Navigate to `/onboarding?v2=true`
2. Complete welcome step
3. Arrive at ProjectsCaptureStep
4. Observe calendar CTA state
5. Click "Connect Google Calendar"
6. Complete OAuth flow in popup
7. Return to onboarding
8. Observe connection success state
9. Click "Analyze My Calendar Now"
10. Verify analysis starts in notification panel
11. Continue to next step

**Expected Results**:

- ✅ Shows "Calendar Not Connected" state
- ✅ OAuth popup opens correctly
- ✅ Success message appears after connection
- ✅ Analysis button becomes available
- ✅ Analysis starts successfully
- ✅ Can continue to next step

#### Test Case 2: Existing User, Calendar Already Connected

**Setup**: User with Google Calendar already connected

**Steps**:

1. Navigate to `/onboarding?v2=true`
2. Complete welcome step
3. Arrive at ProjectsCaptureStep
4. Observe calendar CTA state

**Expected Results**:

- ✅ Shows "Calendar Connected" state immediately
- ✅ Shows "Analyze My Calendar" button
- ✅ No connection CTA visible

#### Test Case 3: User Skips Calendar Connection

**Setup**: New user, no calendar connected

**Steps**:

1. Navigate to `/onboarding?v2=true`
2. Arrive at ProjectsCaptureStep
3. Click "Skip for now"
4. Continue to next step
5. Return to ProjectsCaptureStep (via browser back)
6. Observe state

**Expected Results**:

- ✅ User can skip without errors
- ✅ State persists across navigation
- ✅ Can still connect later

#### Test Case 4: OAuth Popup Blocked

**Setup**: Browser blocks popup windows

**Steps**:

1. Block popups in browser settings
2. Navigate to ProjectsCaptureStep
3. Click "Connect Google Calendar"
4. Observe error handling

**Expected Results**:

- ✅ Shows clear error message
- ✅ Suggests allowing popups
- ✅ Provides alternative connection method

#### Test Case 5: OAuth Flow Cancelled

**Setup**: User cancels OAuth consent screen

**Steps**:

1. Navigate to ProjectsCaptureStep
2. Click "Connect Google Calendar"
3. Cancel OAuth consent screen
4. Return to onboarding

**Expected Results**:

- ✅ Shows "Connection cancelled" message
- ✅ Returns to "Not Connected" state
- ✅ Can retry connection

#### Test Case 6: Network Error During Connection Check

**Setup**: Simulate network failure

**Steps**:

1. Block network requests to `/api/calendar`
2. Navigate to ProjectsCaptureStep
3. Observe error handling

**Expected Results**:

- ✅ Shows graceful error state
- ✅ Offers retry option
- ✅ Doesn't break page

### 6.2 Automated Tests

**Test File**: `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ProjectsCaptureStep from './ProjectsCaptureStep.svelte';

describe('ProjectsCaptureStep - Calendar Connection', () => {
	beforeEach(() => {
		// Mock fetch
		global.fetch = vi.fn();
	});

	it('shows "Not Connected" state when calendar is not connected', async () => {
		// Mock API response: not connected
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true, connected: false })
		});

		render(ProjectsCaptureStep, {
			props: {
				userContext: {},
				onNext: vi.fn(),
				onProjectsCreated: vi.fn()
			}
		});

		await waitFor(() => {
			expect(screen.getByText(/Connect Google Calendar/i)).toBeInTheDocument();
		});
	});

	it('shows "Connected" state when calendar is connected', async () => {
		// Mock API response: connected
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true, connected: true })
		});

		render(ProjectsCaptureStep, {
			props: {
				userContext: {},
				onNext: vi.fn(),
				onProjectsCreated: vi.fn()
			}
		});

		await waitFor(() => {
			expect(screen.getByText(/Analyze My Calendar/i)).toBeInTheDocument();
		});
	});

	it('shows success message after connection', async () => {
		// Initial state: not connected
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true, connected: false })
		});

		const { rerender } = render(ProjectsCaptureStep, {
			props: {
				userContext: {},
				onNext: vi.fn(),
				onProjectsCreated: vi.fn()
			}
		});

		// Simulate connection
		// ... (test OAuth flow)

		// After connection: connected
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true, connected: true })
		});

		await waitFor(() => {
			expect(screen.getByText(/Calendar Connected/i)).toBeInTheDocument();
		});
	});
});
```

### 6.3 Edge Cases

| Edge Case                                              | Handling                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| User already has calendar connected but analysis fails | Show error, allow retry                                     |
| OAuth token expired                                    | Detect during analysis, prompt reconnection                 |
| Multiple calendar accounts                             | Use primary calendar (future: allow selection)              |
| User disconnects calendar during onboarding            | Detect on next interaction, show reconnect CTA              |
| Slow network connection                                | Show loading states, implement timeout (30s)                |
| User has no calendar events                            | Analysis completes with 0 suggestions, show helpful message |

---

## 7️⃣ Success Metrics

### Primary KPIs

| Metric                             | Target                     | Measurement                                  |
| ---------------------------------- | -------------------------- | -------------------------------------------- |
| **Calendar Connection Rate**       | 40%+ of users              | Track connections during onboarding          |
| **Analysis Completion Rate**       | 80%+ of connected users    | Track analysis starts vs completions         |
| **Project Creation from Calendar** | 30%+ of analyses           | Track accepted suggestions                   |
| **Time to Connect**                | <60 seconds                | Measure from CTA click to connection success |
| **Drop-off Reduction**             | -20% drop-off at this step | Compare before/after implementation          |

### Secondary Metrics

- Average number of project suggestions per analysis
- User satisfaction with calendar-generated projects
- Number of calendar connection retries
- OAuth success rate
- Time spent on ProjectsCaptureStep

### Analytics Events to Track

```typescript
// Track calendar connection attempts
analytics.track('Onboarding: Calendar Connection Started', {
	step: 'projects_capture',
	trigger: 'user_click'
});

// Track connection success
analytics.track('Onboarding: Calendar Connection Success', {
	step: 'projects_capture',
	duration_seconds: 45
});

// Track connection failure
analytics.track('Onboarding: Calendar Connection Failed', {
	step: 'projects_capture',
	error: 'popup_blocked'
});

// Track analysis starts
analytics.track('Onboarding: Calendar Analysis Started', {
	step: 'projects_capture',
	days_back: 7,
	days_forward: 60
});

// Track skip actions
analytics.track('Onboarding: Calendar Skip', {
	step: 'projects_capture',
	reason: 'user_skip'
});
```

---

## 8️⃣ Future Enhancements

### Phase 2 (Post-MVP)

#### 1. Inline OAuth (No Popup)

**Problem**: Popup blockers interfere with OAuth flow

**Solution**:

- Embed OAuth flow in iframe or full-page redirect
- Use `postMessage` for communication
- Fallback to current popup method

**Effort**: Medium (2-3 days)

#### 2. Calendar Selection

**Problem**: Users with multiple calendars want to choose which to analyze

**Solution**:

- Show dropdown of available calendars after connection
- Allow multi-calendar selection
- Store preferences for future analyses

**Effort**: Medium (3-4 days)

#### 3. Analysis Preview

**Problem**: Users want to see what will be analyzed before starting

**Solution**:

- Show event count preview by time range
- Display sample event titles
- Allow date range adjustment

**Effort**: Low (1-2 days)

#### 4. Progressive Analysis

**Problem**: Analyzing 90 days of events takes time

**Solution**:

- Start with recent 30 days (fast)
- Show initial results
- Offer "Analyze More" option for extended range

**Effort**: Medium (3-4 days)

#### 5. Calendar-First Onboarding Path

**Problem**: Some users want to start with calendar analysis

**Solution**:

- Add option in WelcomeStep: "Start with Calendar Analysis"
- Reorder steps dynamically
- Skip brain dump if calendar analysis succeeds

**Effort**: High (5-7 days)

### Phase 3 (Advanced)

#### 6. Smart Calendar Recommendations

**Problem**: Not all users benefit equally from calendar analysis

**Solution**:

- Use heuristics to determine if calendar analysis is valuable
- Show different CTAs based on user type
- Example: "Looks like you have recurring meetings" vs "No meetings found"

**Effort**: High (5-7 days)

#### 7. Offline Analysis Results

**Problem**: Analysis completes after user leaves onboarding

**Solution**:

- Email results to user
- Show banner on return: "Your calendar analysis is ready!"
- Persist results across sessions

**Effort**: Medium (3-4 days)

#### 8. Calendar Sync Settings

**Problem**: Users want control over sync frequency and scope

**Solution**:

- Add settings panel for calendar sync
- Options: sync frequency, event types, privacy filters
- Save preferences for ongoing sync

**Effort**: High (7-10 days)

---

## 9️⃣ Implementation Checklist

### Development Tasks

- [ ] **Fix API endpoint** in `checkCalendarConnection()` function
    - Change `/api/calendar/status` → `/api/calendar`
    - Update response handling

- [ ] **Add `handleConnectCalendar()` function**
    - Implement OAuth popup flow
    - Add popup blocker detection
    - Add success/failure handling

- [ ] **Update UI states** in ProjectsCaptureStep.svelte
    - Add "Not Connected" state with value proposition
    - Add "Connection Success" transient state
    - Add "Connected" state with analysis CTA
    - Add loading states for all async operations

- [ ] **Add error handling**
    - Network errors
    - OAuth errors
    - Popup blocked errors
    - Connection check failures

- [ ] **Add analytics tracking**
    - Connection attempts
    - Connection success/failure
    - Analysis starts
    - Skip events

- [ ] **Write unit tests**
    - Test all connection states
    - Test OAuth flow
    - Test error handling
    - Test skip functionality

- [ ] **Manual testing**
    - Test all user flows
    - Test edge cases
    - Test on multiple browsers
    - Test with popup blockers

- [ ] **Update documentation**
    - Update ProjectsCaptureStep component docs
    - Update onboarding flow diagram
    - Update API documentation

### Design Tasks

- [ ] **Create high-fidelity mockups**
    - Not Connected state
    - Connection Success state
    - Connected state
    - Error states

- [ ] **Design demo video/animation** (optional)
    - 15-second calendar → projects transformation
    - Show value proposition visually

- [ ] **Design loading states**
    - Connection in progress
    - Analysis in progress
    - Success animations

### QA Tasks

- [ ] **Functional testing**
    - All user flows work end-to-end
    - OAuth flow completes successfully
    - Analysis starts correctly
    - Skip functionality works

- [ ] **Cross-browser testing**
    - Chrome, Firefox, Safari, Edge
    - Test popup behavior
    - Test OAuth flow

- [ ] **Mobile testing**
    - Responsive design works
    - OAuth flow works on mobile
    - Touch interactions work

- [ ] **Accessibility testing**
    - Keyboard navigation works
    - Screen reader compatible
    - Color contrast meets WCAG AA
    - Focus states visible

### Deployment Tasks

- [ ] **Staging deployment**
    - Deploy to staging environment
    - Test with real Google OAuth
    - Verify analytics events

- [ ] **Production deployment**
    - Deploy to production
    - Monitor error rates
    - Monitor connection success rates

- [ ] **Post-launch monitoring**
    - Track KPIs
    - Gather user feedback
    - Monitor error logs
    - Optimize based on data

---

## 🔟 Appendix

### A. Related Documentation

- **Onboarding V2 Overview**: `/apps/web/docs/features/onboarding-v2/README.md`
- **Calendar Integration**: `/apps/web/docs/features/calendar-integration/README.md`
- **Calendar Analysis Service**: `/apps/web/src/lib/services/calendar-analysis.service.ts`
- **Google OAuth Service**: `/apps/web/src/lib/services/google-oauth-service.ts`
- **Onboarding Config**: `/apps/web/src/lib/config/onboarding.config.ts`

### B. API Reference

**Calendar Connection Check**:

```typescript
GET /api/calendar
Response: { success: boolean, connected: boolean, userId: string }
```

**Google OAuth Flow**:

```typescript
GET /auth/google/calendar
Redirects to Google OAuth consent screen
```

**Calendar Analysis**:

```typescript
POST /api/calendar/analyze
Body: { daysBack: number, daysForward: number }
Response: { analysisId: string, suggestions: ProjectSuggestion[] }
```

### C. Component Props

```typescript
interface Props {
	userContext?: any; // From previous onboarding inputs
	onNext: () => void; // Navigate to next step
	onProjectsCreated: (ids: string[]) => void; // Track created projects
}
```

### D. State Machine Diagram

```
┌─────────────────────┐
│   Initial Load      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Check Connection    │
│   (API Call)        │
└──────┬───────┬──────┘
       │       │
  NOT  │       │  CONNECTED
       │       │
       ▼       ▼
┌──────────┐ ┌──────────┐
│ Show CTA │ │  Show    │
│ Connect  │ │ Analysis │
└────┬─────┘ └────┬─────┘
     │            │
     │ Click      │ Click
     │ Connect    │ Analyze
     │            │
     ▼            ▼
┌──────────┐ ┌──────────┐
│  OAuth   │ │ Analysis │
│  Flow    │ │ Running  │
└────┬─────┘ └────┬─────┘
     │            │
     │ Success    │ Complete
     │            │
     ▼            ▼
┌──────────┐ ┌──────────┐
│ Success  │ │ Projects │
│ Message  │ │ Created  │
└────┬─────┘ └────┬─────┘
     │            │
     └────────┬───┘
              ▼
        ┌──────────┐
        │   Next   │
        │   Step   │
        └──────────┘
```

---

## 📝 Changelog

| Date       | Author | Changes               |
| ---------- | ------ | --------------------- |
| 2025-10-07 | Claude | Initial draft created |

---

## ✅ Approval Sign-offs

- [ ] **Product**: Approved UX flows and value proposition
- [ ] **Engineering**: Approved technical approach and API usage
- [ ] **Design**: Approved visual design and copy
- [ ] **QA**: Test plan reviewed and approved

---

**End of Specification**
