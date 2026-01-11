<!-- apps/web/docs/features/onboarding-v2/README.md -->

# Onboarding V2 Documentation

Comprehensive onboarding flow that captures user preferences, projects, and personalization data.

## 🎯 Overview

Onboarding V2 is a 6-step guided flow that helps new users:

- Capture current projects via brain dump or calendar analysis
- Set up notification preferences (SMS & email)
- Choose their usage archetype (how they want to use BuildOS)
- Identify productivity challenges
- Review and complete setup

## 📋 Flow Steps

### Step 0: Welcome

**Component:** `WelcomeStep.svelte`

- Hero introduction to BuildOS
- Feature highlights (Brain Dump, Calendar Sync, Smart Reminders)
- "Start Setting Up" CTA

### Step 1: Projects Capture

**Component:** `ProjectsCaptureStep.svelte`

- **Brain Dump Textarea** - Freeform project input with examples
- **Calendar Analysis** - Optional Google Calendar integration
- **Auto-Accept Mode** - Projects created automatically without review
- **Voice Notes** - Audio segments are saved and attached to the braindump draft
- Skip option available

**Integration:**

- Uses `brainDumpService.parseBrainDumpWithStream()` with `autoAccept: true`
- Calendar analysis via `CalendarAnalysisModal` component

### Step 2: Notifications

**Component:** `NotificationsStep.svelte`  
**Sub-component:** `PhoneVerificationCard.svelte`

**SMS Notifications:**

- Phone verification via Twilio Verify
- Notification types:
    - 📅 Event Reminders
    - 🌅 Morning Kickoff (8 AM)
    - 🌙 Evening Recap (8 PM)

**Email Notifications:**

- Daily brief opt-in toggle

**Skip:** Entire step is optional

### Step 3: Archetype Selection

**Component:** `ArchetypeStep.svelte`

**Archetypes:**

- 🧠 **Second Brain** - Capture ideas, notes, and information
- 🤖 **AI Task Manager** - Meeting prep, deadlines, next steps
- ✅ **Project To-Do List** - Simple task organization

**Storage:** Saved to `users.usage_archetype`  
**Usage:** Customizes daily brief prompts and UI experience

### Step 4: Challenges Selection

**Component:** `ChallengesStep.svelte`

**Challenges (multi-select):**

- ⏳ Time management
- 🧩 Focus/ADHD
- 🔀 Context switching
- 📅 Planning
- 📈 Accountability
- 📝 Information overload
- 😰 Overwhelm

**Storage:** Saved to `users.productivity_challenges` (JSONB array)  
**Usage:** Informs AI tone and feature suggestions

### Step 5: Summary

**Component:** `SummaryStep.svelte`

Displays summary of all captured data:

- Projects created count
- Notification preferences
- Usage archetype
- Selected challenges

**Completion:**

- Calls `onboardingV2Service.completeOnboarding()`
- Sets `users.onboarding_v2_completed_at`
- Redirects to main workspace

## 🔧 Technical Architecture

### Configuration

**File:** `/src/lib/config/onboarding.config.ts`

Central configuration for:

- Step definitions
- Archetype metadata
- Challenge definitions
- SMS notification types
- Asset paths

### Services

**File:** `/src/lib/services/onboarding-v2.service.ts`

**Methods:**

- `getProgress(userId)` - Get current onboarding state
- `saveArchetype(userId, archetype)` - Save user archetype
- `saveChallenges(userId, challenges[])` - Save productivity challenges
- `markCalendarSkipped(userId, boolean)` - Track calendar skip
- `markSMSSkipped(userId, boolean)` - Track SMS skip
- `completeOnboarding(userId)` - Mark onboarding complete

### Database Schema

**New columns in `users` table:**

```sql
usage_archetype TEXT CHECK (usage_archetype IN ('second_brain', 'ai_task_manager', 'project_todo_list'))
productivity_challenges JSONB DEFAULT '[]'::jsonb
onboarding_v2_completed_at TIMESTAMPTZ
onboarding_v2_skipped_calendar BOOLEAN DEFAULT false
onboarding_v2_skipped_sms BOOLEAN DEFAULT false
```

**SMS preferences table:**

```sql
user_sms_preferences:
  - morning_kickoff_enabled BOOLEAN
  - morning_kickoff_time TIME
  - event_reminders_enabled BOOLEAN
  - evening_recap_enabled BOOLEAN
```

## 🚀 Usage

### Accessing V2 Onboarding

Navigate to `/onboarding?v2=true` to use new flow.

### Feature Flag

V1 onboarding remains active by default. V2 is enabled via URL parameter for gradual rollout.

### State Management

```typescript
v2OnboardingData = {
  projectsCreated: number,
  calendarAnalyzed: boolean,
  smsEnabled: boolean,
  emailEnabled: boolean,
  archetype: string,
  challenges: string[]
}
```

## 🧪 Testing

### Manual Testing

1. Clear onboarding state: `UPDATE users SET completed_onboarding = false WHERE id = 'user-id'`
2. Navigate to `/onboarding?v2=true`
3. Complete all steps

### Integration Tests

Located in: `/src/lib/components/onboarding-v2/*.test.ts`

Test coverage:

- Component rendering
- User interactions
- Data saving
- Error handling

## 📊 Analytics

**Key Metrics to Track:**

- Step completion rates
- Drop-off points (which step users abandon)
- SMS opt-in rate
- Email opt-in rate
- Calendar analysis usage
- Archetype distribution
- Challenge selections
- Time to complete

**Implementation:** Analytics hooks to be added in Phase 5

## 🎨 Visual Assets

Assets stored in `/static/onboarding-assets/`

**Required:**

- Screenshots for brain dump examples
- SMS notification demos
- Calendar analysis video
- See `/static/onboarding-assets/README.md` for full specs

## 🔄 Migration from V1

V1 onboarding data in `user_context` table can be migrated:

- `input_projects` → brain dump content
- `input_work_style` → contextual data for AI
- `input_challenges` → productivity_challenges

No automated migration implemented - V2 starts fresh.

## 🐛 Troubleshooting

**Onboarding not showing:**

- Check `completed_onboarding` flag in users table
- Verify user is authenticated
- Check URL has `?v2=true` parameter

**SMS verification failing:**

- Verify Twilio credentials in environment
- Check phone number format (E.164)
- Review Twilio Verify service configuration

**Calendar analysis not working:**

- Confirm Google OAuth scopes include calendar access
- Check calendar service credentials
- Verify user has connected Google account

## 🚧 Future Enhancements

**Phase 5 (In Progress):**

- Visual polish and animations
- Comprehensive test suite
- Analytics integration
- Production asset creation

**Post-Launch:**

- A/B testing different flows
- Personalized onboarding based on referral source
- Skip to specific steps
- Save and resume later
- Mobile optimization

## 📖 Related Documentation

- Original Spec: `/docs/features/onboarding/build-os-onboarding-revamp.md`
- Implementation Plan: `/thoughts/shared/research/2025-10-03_14-45-00_onboarding-revamp-implementation-plan.md`
- Brain Dump System: `/docs/features/brain-dump/`
- Calendar Integration: `/docs/features/calendar-integration/`
- Notification System: `/docs/features/notifications/`

## 🤝 Contributing

**Adding a new step:**

1. Create component in `/src/lib/components/onboarding-v2/`
2. Add step definition to `onboarding.config.ts`
3. Wire up in `/src/routes/onboarding/+page.svelte`
4. Add database columns if needed
5. Update tests and documentation

**Modifying existing step:**

1. Update component
2. Update config if needed
3. Test flow end-to-end
4. Update this documentation

---

**Questions?** See implementation plan or open an issue.
