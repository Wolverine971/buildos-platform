# Email Flow System Specification

## Overview

A unified email composition system integrated into the admin panel that leverages LLM to generate personalized emails for users and beta users, with full context of their activity and engagement.

## Core Components

### 1. Email Composer Modal

**Location**: Accessible from both `/admin/users` and `/admin/beta` pages

**Modal Structure**:

```
┌─────────────────────────────────────────────┐
│ Send Personalized Email to [User Name]      │
├─────────────────────────────────────────────┤
│ User Information Panel (Collapsible)        │
│ ├─ Basic Info                               │
│ ├─ Beta Status (if applicable)              │
│ └─ Activity Summary                         │
├─────────────────────────────────────────────┤
│ Instructions/Context (Text Area)            │
│ [Preset Templates Dropdown]                 │
├─────────────────────────────────────────────┤
│ [Generate Email] [Clear]                    │
├─────────────────────────────────────────────┤
│ Generated Email (Editable Text Area)        │
├─────────────────────────────────────────────┤
│ [Copy to Clipboard] [Send Email] [Cancel]   │
└─────────────────────────────────────────────┘
```

### 2. User Context Data

**Basic User Info**:

- Name, Email, Account created date
- Subscription status and plan
- Last login/activity
- Admin status

**Beta User Info** (if applicable):

- Beta tier and access level
- Company/Job title
- Why interested/Biggest challenges
- Community access preference
- Total feedback submitted
- Early access features enabled

**Activity Summary** (last 30 days):

- Number of active projects (with titles)
- Tasks created/completed
- Brain dumps submitted
- Daily briefs generated
- Last 3 project updates (title + last modified)

### 3. LLM Integration

**Prompt Structure**:

```typescript
interface EmailGenerationContext {
	userInfo: {
		basic: UserBasicInfo;
		beta?: BetaUserInfo;
		activity: UserActivitySummary;
	};
	instructions: string;
	emailType?: 'welcome' | 'follow-up' | 'feature' | 'feedback' | 'custom';
	tone?: 'professional' | 'friendly' | 'casual';
}
```

**LLM System Prompt**:

```
You are composing a personalized email for a BuildOS user.
Use the provided user context to make the email relevant and engaging.
Reference their specific projects or activity when appropriate.
Keep the tone [specified tone] and focused on [email purpose].
```

### 4. Implementation Files

**New Components**:

- `/src/lib/components/admin/EmailComposerModal.svelte`
- `/src/lib/components/admin/UserContextPanel.svelte`
- `/src/lib/services/email-generation-service.ts`

**API Endpoints**:

- `POST /api/admin/emails/generate` - Generate email with LLM
- `POST /api/admin/emails/send` - Send email via Gmail API
- `GET /api/admin/users/[id]/context` - Get full user context

**Database Updates**:

- Add `email_templates` table for saving common templates
- Extend `email_logs` with `generated_by_llm` flag and `generation_prompt`

### 5. User Flow

1. **Initiation**: Click "Send Email" action button in user/beta table
2. **Context Loading**: Modal opens, loads user data automatically
3. **Instruction Input**:
    - Select template or write custom instructions
    - Specify tone and purpose
4. **Generation**: Click "Generate Email" to call LLM
5. **Review/Edit**: Generated email appears in editable field
6. **Send Options**:
    - Copy to clipboard for external email client
    - Send directly via Gmail integration
7. **Confirmation**: Success toast with email log reference

### 6. Features & Configuration

**Email Templates** (Presets):

- Welcome to BuildOS
- Beta feedback request
- Feature announcement
- Check-in/Follow-up
- Trial ending reminder
- Custom

**Safety Features**:

- Rate limiting: Max 50 emails/hour
- Confirmation dialog for direct sending
- Email preview before sending
- Audit log of all generated/sent emails

**Responsive Design**:

- Mobile-optimized modal layout
- Touch-friendly buttons (min 44px targets)
- Collapsible sections for mobile viewing

### 7. Integration Points

**Admin Users Page**:

- Add "Send Email" action button to each user row
- Bulk email option for selected users

**Admin Beta Page**:

- Add "Send Email" to beta members table
- Quick email on signup approval

**Activity Modal**:

- Add "Email User" button in UserActivityModal header

## Technical Implementation Plan

### Phase 1: Core Infrastructure

1. Create EmailComposerModal component
2. Build UserContextPanel component
3. Create email-generation-service
4. Set up API endpoints

### Phase 2: LLM Integration

1. Implement LLM prompt engineering
2. Add context formatting utilities
3. Create email generation endpoint
4. Add template management

### Phase 3: UI Integration

1. Add action buttons to admin tables
2. Wire up modal triggers
3. Implement email sending via Gmail
4. Add success/error handling

### Phase 4: Polish & Testing

1. Add email templates CRUD
2. Implement rate limiting
3. Add audit logging
4. Mobile responsiveness testing

## Default Configuration

```typescript
const EMAIL_CONFIG = {
	llm: {
		model: 'gpt-4o-mini',
		maxTokens: 500,
		temperature: 0.7
	},
	limits: {
		maxEmailsPerHour: 50,
		maxInstructionLength: 1000,
		maxEmailLength: 2000
	},
	defaults: {
		tone: 'friendly',
		includeActivityDays: 30,
		includeProjectLimit: 3
	}
};
```

## Success Metrics

- Time to compose email: < 2 minutes
- LLM generation time: < 5 seconds
- Email personalization accuracy: 95%+
- User context load time: < 1 second

## Implementation Status

- [ ] Phase 1: Core Infrastructure
- [ ] Phase 2: LLM Integration
- [ ] Phase 3: UI Integration
- [ ] Phase 4: Polish & Testing
