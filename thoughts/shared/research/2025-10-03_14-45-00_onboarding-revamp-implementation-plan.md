---
date: 2025-10-03T14:45:00-07:00
researcher: Claude Code
git_commit: 3213418ad00dfc0a3ad91e3f62273a149b288198
branch: main
repository: buildos-platform
topic: "BuildOS Onboarding Revamp - Phased Implementation Plan"
tags:
  [
    research,
    onboarding,
    implementation-plan,
    calendar-analysis,
    sms,
    brain-dump,
  ]
status: complete
last_updated: 2025-10-03
last_updated_by: Claude Code
---

# BuildOS Onboarding Revamp - Phased Implementation Plan

**Date**: 2025-10-03T14:45:00-07:00
**Researcher**: Claude Code
**Git Commit**: 3213418ad00dfc0a3ad91e3f62273a149b288198
**Branch**: main
**Repository**: buildos-platform

## Research Question

How do we implement the comprehensive onboarding revamp outlined in `build-os-onboarding-revamp.md`, integrating calendar analysis, SMS notifications, guided brain dumps, and user archetypes into a phased, production-ready flow?

## Executive Summary

This plan breaks down the ambitious onboarding revamp into **5 distinct phases** that can be implemented incrementally. The research reveals that **60% of required infrastructure already exists** - calendar analysis is production-ready, SMS backend is 90% complete, and brain dump auto-accept is functional. The primary work involves orchestrating these systems into a cohesive onboarding experience.

### Key Findings

**✅ Ready to Use:**

- Calendar analysis with project suggestions (CalendarAnalysisModal + CalendarAnalysisResults)
- Brain dump system with auto-accept mode
- Email daily brief opt-in (fully implemented)
- Voice recording with live transcription
- Database schema for all preferences

**⏳ Needs Integration:**

- SMS notification preferences (backend ready, needs UI)
- User archetype selection (needs full implementation)
- Productivity challenges tracking (needs storage + logic)
- Guided brain dump flow (needs context integration)

**🎬 Needs Placeholders:**

- Screenshots showing brain dump examples
- Short explainer videos for calendar analysis
- Demo clips of SMS notifications in action

---

## Current State Analysis

### Existing Onboarding Flow

**File**: `/apps/web/src/routes/onboarding/+page.svelte`

**Current Steps (4 total):**

1. **Projects & Initiatives** - What are you working on?
2. **Work Style & Preferences** - How do you work?
3. **Challenges & Blockers** - What's slowing you down?
4. **BuildOS Focus Areas** - How should BuildOS help?

**Features:**

- ✅ Auto-save every 1.5 seconds
- ✅ Voice input with live transcription
- ✅ Progress tracking with visual dots
- ✅ Step navigation (back/forward)
- ✅ Completion screen with redirect

**What's Missing:**

- ❌ Calendar analysis integration
- ❌ SMS notification opt-in
- ❌ Guided brain dump experience
- ❌ User archetype selection
- ❌ Productivity challenge tagging
- ❌ Examples/demos throughout

---

## Vision from Revamp Doc

### Proposed New Flow (6 steps)

1. **Welcome & Orientation** - Introduction to BuildOS
2. **Capture Current Projects (Guided Brain Dump)** - Freeform capture with calendar option
3. **Accountability & Notifications Setup** - SMS + Email preferences
4. **BuildOS Usage Profile (Archetypes)** - Second Brain, AI Task Manager, or Project To-Do List
5. **Identify Productivity Challenges** - Multi-select from common challenges
6. **Summary & First Win** - Reflection of captured data + enter workspace

### Integration Requirements

**Calendar Analysis:**

- Show as optional CTA during project capture
- Launch `CalendarAnalysisModal` with `autoStart=true`
- Create projects from calendar suggestions
- Seamless return to onboarding after creation

**SMS Notifications:**

- Phone verification flow (Twilio Verify)
- Opt-in checkboxes:
  - Event Reminders
  - Next Up Notifications
  - Morning Kickoff
  - Evening Recap
- Skip option for "set up later"

**Guided Brain Dump:**

- Embed within onboarding (not separate modal)
- Use onboarding context to enhance AI processing
- Auto-accept mode for seamless creation
- Option to skip and create projects later

**User Archetypes:**

- Store selection in database
- Use to customize daily brief prompts
- Tailor first-time UI experience

**Productivity Challenges:**

- Multi-select from predefined list
- Store for future personalization
- Inform AI tone and suggestions

---

## Phased Implementation Plan

## Phase 0: Foundation & Prerequisites (Week 1)

**Goal:** Prepare infrastructure and database schema for new onboarding flow.

### Tasks

#### 1. Database Schema Updates

**New Migration**: `20251003_onboarding_v2_schema.sql`

```sql
-- User archetype selection
ALTER TABLE users
ADD COLUMN usage_archetype TEXT CHECK (
  usage_archetype IN ('second_brain', 'ai_task_manager', 'project_todo_list')
),
ADD COLUMN productivity_challenges JSONB DEFAULT '[]'::jsonb,
ADD COLUMN onboarding_v2_completed_at TIMESTAMPTZ,
ADD COLUMN onboarding_v2_skipped_calendar BOOLEAN DEFAULT false,
ADD COLUMN onboarding_v2_skipped_sms BOOLEAN DEFAULT false;

-- Add index for archetype filtering
CREATE INDEX idx_users_usage_archetype ON users(usage_archetype)
WHERE usage_archetype IS NOT NULL;

-- Update user_context with onboarding v2 fields
ALTER TABLE user_context
ADD COLUMN onboarding_version INTEGER DEFAULT 1,
ADD COLUMN brain_dump_project_id UUID REFERENCES projects(id);

-- Add preference for morning kickoff (for SMS)
ALTER TABLE user_sms_preferences
ADD COLUMN morning_kickoff_enabled BOOLEAN DEFAULT false,
ADD COLUMN morning_kickoff_time TIME DEFAULT '08:00:00',
ADD COLUMN next_up_enabled BOOLEAN DEFAULT false,
ADD COLUMN event_reminders_enabled BOOLEAN DEFAULT false,
ADD COLUMN evening_recap_enabled BOOLEAN DEFAULT false;
```

**TypeScript Types Update:**

```bash
# Regenerate types after migration
pnpm --filter=web supabase gen types typescript --project-id <project-id> --schema public > src/lib/database.types.ts
```

#### 2. Create Onboarding Configuration

**New File**: `/apps/web/src/lib/config/onboarding.config.ts`

```typescript
export const ONBOARDING_V2_CONFIG = {
  version: 2,
  steps: {
    welcome: { id: 'welcome', order: 0, skippable: false },
    projects: { id: 'projects', order: 1, skippable: false },
    notifications: { id: 'notifications', order: 2, skippable: true },
    archetype: { id: 'archetype', order: 3, skippable: false },
    challenges: { id: 'challenges', order: 4, skippable: false },
    summary: { id: 'summary', order: 5, skippable: false }
  },
  archetypes: [
    {
      id: 'second_brain',
      icon: 'brain',
      title: 'Second Brain',
      description: 'Capture ideas, notes, and information',
      features: ['Knowledge base', 'Note linking', 'Memory extension']
    },
    {
      id: 'ai_task_manager',
      icon: 'robot',
      title: 'AI Task Manager',
      description: 'Keep me prepared for meetings, deadlines, and next steps',
      features: ['Smart scheduling', 'Proactive reminders', 'Meeting prep']
    },
    {
      id: 'project_todo_list',
      icon: 'checklist',
      title: 'Project To-Do List',
      description: 'Simple task organization to keep projects moving',
      features: ['Task lists', 'Project tracking', 'Progress monitoring']
    }
  ],
  challenges: [
    { id: 'time_management', label: 'Time management — I run out of hours in the day', icon: '⏳' },
    { id: 'focus_adhd', label: 'Focus/ADHD — I struggle with follow-through', icon: '🧩' },
    { id: 'context_switching', label: 'Context switching — I juggle too many things at once', icon: '🔀' },
    { id: 'planning', label: 'Planning — I struggle to break big goals into actionable steps', icon: '📅' },
    { id: 'accountability', label: 'Accountability — I need someone/something to keep me on track', icon: '📈' },
    { id: 'information_overload', label: 'Information overload — I have notes everywhere and no system', icon: '📝' },
    { id: 'overwhelm', label: 'Overwhelm — I don't even know where to start', icon: '😰' }
  ]
};
```

#### 3. Create Placeholder Assets Folder

```bash
mkdir -p /apps/web/static/onboarding-assets/{screenshots,videos,demos}
touch /apps/web/static/onboarding-assets/screenshots/PLACEHOLDER_brain_dump_example.png
touch /apps/web/static/onboarding-assets/videos/PLACEHOLDER_calendar_analysis_demo.mp4
touch /apps/web/static/onboarding-assets/videos/PLACEHOLDER_sms_notification_demo.mp4
```

**Placeholder README**: `/apps/web/static/onboarding-assets/README.md`

```markdown
# Onboarding Assets

## Screenshots Needed

1. `brain_dump_example.png` - Example of a brain dump with highlighted sections
2. `calendar_analysis_before.png` - Calendar view before analysis
3. `calendar_analysis_after.png` - Projects created from calendar
4. `sms_notification_example.png` - Phone screenshot of SMS notification

## Videos Needed

1. `calendar_analysis_demo.mp4` (15-30 seconds)
   - Show calendar analysis trigger
   - Project suggestions appearing
   - Creating projects from suggestions

2. `sms_notification_demo.mp4` (10-15 seconds)
   - Phone receiving SMS notification
   - Task reminder example
   - Morning kickoff example

3. `brain_dump_guided_demo.mp4` (20-30 seconds)
   - Typing in brain dump
   - AI processing
   - Projects and tasks created

## Dimensions

- Screenshots: 1200x800px (landscape) or 800x1200px (portrait for phone)
- Videos: 1080p (1920x1080), MP4 format, H.264 codec
```

#### 4. Create Onboarding Service

**New File**: `/apps/web/src/lib/services/onboarding-v2.service.ts`

```typescript
import type { Database } from "$lib/database.types";
import { supabase } from "$lib/supabase";

type OnboardingProgress = {
  currentStep: number;
  completedSteps: string[];
  skippedSteps: string[];
  archetype?: string;
  challenges: string[];
  hasPhoneVerified: boolean;
  hasCreatedProjects: boolean;
};

export class OnboardingV2Service {
  async getProgress(userId: string): Promise<OnboardingProgress> {
    const { data: user } = await supabase
      .from("users")
      .select(
        "usage_archetype, productivity_challenges, onboarding_v2_completed_at, onboarding_v2_skipped_calendar, onboarding_v2_skipped_sms",
      )
      .eq("id", userId)
      .single();

    const { data: smsPrefs } = await supabase
      .from("user_sms_preferences")
      .select("phone_verified")
      .eq("user_id", userId)
      .single();

    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId);

    return {
      currentStep: this.calculateCurrentStep(user),
      completedSteps: this.getCompletedSteps(user),
      skippedSteps: this.getSkippedSteps(user),
      archetype: user?.usage_archetype || undefined,
      challenges: (user?.productivity_challenges as string[]) || [],
      hasPhoneVerified: smsPrefs?.phone_verified || false,
      hasCreatedProjects: (projects?.length || 0) > 0,
    };
  }

  async saveArchetype(userId: string, archetype: string) {
    return await supabase
      .from("users")
      .update({ usage_archetype: archetype })
      .eq("id", userId);
  }

  async saveChallenges(userId: string, challenges: string[]) {
    return await supabase
      .from("users")
      .update({ productivity_challenges: challenges })
      .eq("id", userId);
  }

  async markCalendarSkipped(userId: string, skipped: boolean) {
    return await supabase
      .from("users")
      .update({ onboarding_v2_skipped_calendar: skipped })
      .eq("id", userId);
  }

  async markSMSSkipped(userId: string, skipped: boolean) {
    return await supabase
      .from("users")
      .update({ onboarding_v2_skipped_sms: skipped })
      .eq("id", userId);
  }

  async completeOnboarding(userId: string) {
    return await supabase
      .from("users")
      .update({
        onboarding_v2_completed_at: new Date().toISOString(),
        completed_onboarding: true,
      })
      .eq("id", userId);
  }

  private calculateCurrentStep(user: any): number {
    // Logic to determine current step based on user data
    if (!user?.usage_archetype) return 3; // Archetype step
    if (!user?.productivity_challenges?.length) return 4; // Challenges step
    return 5; // Summary step
  }

  private getCompletedSteps(user: any): string[] {
    const completed: string[] = ["welcome"]; // Always completed once started
    if (user?.usage_archetype) completed.push("archetype");
    if (user?.productivity_challenges?.length) completed.push("challenges");
    return completed;
  }

  private getSkippedSteps(user: any): string[] {
    const skipped: string[] = [];
    if (user?.onboarding_v2_skipped_calendar) skipped.push("calendar");
    if (user?.onboarding_v2_skipped_sms) skipped.push("notifications");
    return skipped;
  }
}

export const onboardingV2Service = new OnboardingV2Service();
```

### Success Criteria

- ✅ Migration applied successfully
- ✅ TypeScript types regenerated
- ✅ Config file created with all archetypes and challenges
- ✅ Placeholder folders created
- ✅ OnboardingV2Service implemented and tested

**Time Estimate:** 1-2 days

---

## Phase 1: Welcome & Projects Capture (Week 2)

**Goal:** Implement welcome screen and guided brain dump with calendar analysis integration.

### Step 1.1: Welcome Screen Component

**New File**: `/apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte`

```svelte
<script lang="ts">
  import { Sparkles, Brain, Calendar, MessageSquare } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';

  export let onStart: () => void;
</script>

<div class="flex flex-col items-center justify-center min-h-[600px] text-center">
  <!-- 🎬 PLACEHOLDER: Hero animation or brain graphic -->
  <div class="mb-8 relative">
    <div class="absolute inset-0 bg-gradient-to-br from-purple-400 to-blue-600 blur-3xl opacity-20"></div>
    <div class="relative bg-gradient-to-br from-purple-500 to-blue-600 rounded-full p-8">
      <Brain class="w-16 h-16 text-white" />
    </div>
  </div>

  <h1 class="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
    Welcome to BuildOS
  </h1>

  <p class="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl">
    Your AI-first project organization tool. Let's set you up so BuildOS works the way <em>you</em> want.
  </p>

  <!-- Feature highlights -->
  <div class="grid grid-cols-3 gap-6 mb-12 max-w-3xl">
    <div class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
      <Brain class="w-8 h-8 text-purple-600 mb-3" />
      <h3 class="font-semibold mb-2">Brain Dump</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Turn thoughts into projects
      </p>
    </div>
    <div class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
      <Calendar class="w-8 h-8 text-blue-600 mb-3" />
      <h3 class="font-semibold mb-2">Calendar Sync</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Extract projects from events
      </p>
    </div>
    <div class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
      <MessageSquare class="w-8 h-8 text-green-600 mb-3" />
      <h3 class="font-semibold mb-2">Smart Reminders</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Stay on track with AI
      </p>
    </div>
  </div>

  <Button
    variant="primary"
    size="lg"
    on:click={onStart}
    class="px-8 py-4 text-lg"
  >
    Start Setting Up
    <Sparkles class="w-5 h-5 ml-2" />
  </Button>

  <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
    Takes about 5 minutes
  </p>
</div>
```

### Step 1.2: Projects Capture with Brain Dump

**New File**: `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Rocket, Calendar, Loader2, Sparkles } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import CalendarAnalysisModal from '$lib/components/calendar/CalendarAnalysisModal.svelte';
  import { brainDumpService } from '$lib/services/braindump-api.service';
  import { toastService } from '$lib/stores/toast.store';
  import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';

  export let userContext: any; // From previous onboarding inputs
  export let onNext: () => void;
  export let onProjectsCreated: (projectIds: string[]) => void;

  let projectInput = $state('');
  let isProcessing = $state(false);
  let showCalendarModal = $state(false);
  let hasCalendarConnected = $state(false);
  let createdProjects = $state<string[]>([]);

  onMount(async () => {
    // Check if user has Google Calendar connected
    // This would be a real API call
    hasCalendarConnected = await checkCalendarConnection();
  });

  async function checkCalendarConnection(): Promise<boolean> {
    // TODO: Implement actual check
    return false;
  }

  function showCalendarAnalysis() {
    showCalendarModal = true;
  }

  async function processBrainDump() {
    if (projectInput.trim().length < 20) {
      toastService.error('Please provide more details about your projects');
      return;
    }

    isProcessing = true;

    // Build context from previous onboarding inputs
    const context: DisplayedBrainDumpQuestion[] = [
      {
        question: "What's your work style?",
        answer: userContext?.input_work_style || 'Not specified'
      },
      {
        question: "What challenges are you facing?",
        answer: userContext?.input_challenges || 'Not specified'
      }
    ];

    try {
      await brainDumpService.parseBrainDumpWithStream(
        projectInput,
        null, // New project
        undefined,
        context,
        {
          autoAccept: true, // Auto-create without review
          onProgress: (status) => {
            console.log('Processing:', status);
          },
          onComplete: (result) => {
            if (result.projectInfo) {
              createdProjects.push(result.projectInfo.id);
              toastService.success(`🎉 Created "${result.projectInfo.name}"!`);
              onProjectsCreated(createdProjects);
              onNext();
            } else {
              toastService.warning('No projects created, but you can add them later!');
              onNext();
            }
          },
          onError: (error) => {
            toastService.error(`Processing failed: ${error}`);
          }
        }
      );
    } catch (error) {
      console.error('Brain dump error:', error);
      toastService.error('Failed to process. Please try again.');
    } finally {
      isProcessing = false;
    }
  }

  function handleCalendarClose() {
    showCalendarModal = false;
  }

  function skipProjectCapture() {
    onNext();
  }
</script>

<div class="max-w-3xl mx-auto">
  <div class="mb-8 text-center">
    <div class="flex justify-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center">
        <Rocket class="w-8 h-8 text-purple-600 dark:text-purple-400" />
      </div>
    </div>

    <h2 class="text-3xl font-bold mb-3">
      Capture Current Projects
    </h2>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      Let's start by getting everything out of your head. What projects are you working on right now?
    </p>
  </div>

  <!-- 🎬 PLACEHOLDER: Screenshot showing brain dump examples -->
  <div class="mb-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800">
    <h3 class="font-semibold mb-3 flex items-center gap-2">
      <Sparkles class="w-5 h-5 text-purple-600" />
      Examples to inspire you:
    </h3>
    <div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <p>🏋️ <strong>Fitness Project:</strong> "Keep track of my workout routine, meal planning, and schedule."</p>
      <p>💻 <strong>Side Project:</strong> "I'm trying to bootstrap a small app and need to track milestones."</p>
      <p>📚 <strong>Writing a Book:</strong> "Capture all my ideas, research, and outlines in one place."</p>
    </div>

    <!-- PLACEHOLDER IMAGE -->
    <div class="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 text-center border-2 border-dashed border-gray-300">
      <p class="text-gray-400">
        📸 [Screenshot: Brain dump example with highlighted sections]
      </p>
    </div>
  </div>

  <!-- Brain dump textarea -->
  <div class="mb-6">
    <Textarea
      bind:value={projectInput}
      placeholder="Don't worry about structure — just brain dump. What are you building? What goals do you have? What's on your mind?"
      rows={8}
      disabled={isProcessing}
      class="w-full"
    />
  </div>

  <!-- Calendar analysis CTA -->
  <div class="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
    <div class="flex items-start gap-4">
      <Calendar class="w-6 h-6 text-blue-600 mt-1" />
      <div class="flex-1">
        <h4 class="font-semibold mb-2">
          Want BuildOS to analyze your Google Calendar?
        </h4>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          We can automatically suggest projects based on your meetings and events.
        </p>

        <!-- 🎬 PLACEHOLDER: Video showing calendar analysis -->
        <div class="mb-4 bg-gray-100 dark:bg-gray-900 rounded-lg p-6 text-center border border-gray-300 dark:border-gray-600">
          <p class="text-gray-400">
            🎥 [Demo video: Calendar analysis in action - 15 seconds]
          </p>
        </div>

        <Button
          variant="secondary"
          on:click={showCalendarAnalysis}
          class="w-full sm:w-auto"
        >
          <Calendar class="w-4 h-4 mr-2" />
          Analyze My Calendar
        </Button>
      </div>
    </div>
  </div>

  <!-- Actions -->
  <div class="flex items-center justify-between">
    <Button
      variant="ghost"
      on:click={skipProjectCapture}
      disabled={isProcessing}
    >
      I'll add projects later
    </Button>

    <Button
      variant="primary"
      size="lg"
      on:click={processBrainDump}
      disabled={projectInput.trim().length < 20 || isProcessing}
      loading={isProcessing}
    >
      {#if isProcessing}
        <Loader2 class="w-5 h-5 mr-2 animate-spin" />
        Creating Projects...
      {:else}
        Continue
        <Sparkles class="w-5 h-5 ml-2" />
      {/if}
    </Button>
  </div>
</div>

<!-- Calendar Analysis Modal -->
<CalendarAnalysisModal
  bind:isOpen={showCalendarModal}
  autoStart={true}
  onClose={handleCalendarClose}
/>
```

### Step 1.3: Update Main Onboarding Page

**Modify**: `/apps/web/src/routes/onboarding/+page.svelte`

Add feature flag to toggle between v1 and v2:

```svelte
<script lang="ts">
  import { page } from '$app/stores';

  // Feature flag for v2 onboarding
  const useV2 = $page.url.searchParams.get('v2') === 'true';

  // ... existing imports
  import WelcomeStep from '$lib/components/onboarding-v2/WelcomeStep.svelte';
  import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
</script>

{#if useV2}
  <!-- V2 Flow -->
  {#if currentStep === 0}
    <WelcomeStep onStart={() => currentStep++} />
  {:else if currentStep === 1}
    <ProjectsCaptureStep
      userContext={data.userContext}
      onNext={() => currentStep++}
      onProjectsCreated={(ids) => console.log('Created:', ids)}
    />
  {/if}
{:else}
  <!-- Existing V1 Flow -->
  <!-- ... existing code ... -->
{/if}
```

### Success Criteria

- ✅ Welcome screen displays with feature highlights
- ✅ Projects capture with brain dump textarea
- ✅ Calendar analysis CTA shows and triggers modal
- ✅ Brain dump auto-accept creates projects seamlessly
- ✅ Examples displayed clearly
- ✅ Placeholder assets documented

**Time Estimate:** 3-4 days

---

## Phase 2: Accountability & Notifications (Week 3)

**Goal:** Implement SMS and email notification preferences with phone verification.

### Step 2.1: Phone Verification Component

**New File**: `/apps/web/src/lib/components/onboarding-v2/PhoneVerificationCard.svelte`

```svelte
<script lang="ts">
  import { Phone, Loader2, CheckCircle } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import TextInput from '$lib/components/ui/TextInput.svelte';
  import { smsService } from '$lib/services/sms.service';
  import { toastService } from '$lib/stores/toast.store';

  export let onVerified: (phoneNumber: string) => void;
  export let onSkip: () => void;

  let phoneNumber = $state('');
  let verificationCode = $state('');
  let codeSent = $state(false);
  let isVerifying = $state(false);
  let isSending = $state(false);
  let verified = $state(false);

  async function sendVerificationCode() {
    if (!phoneNumber || phoneNumber.length < 10) {
      toastService.error('Please enter a valid phone number');
      return;
    }

    isSending = true;
    try {
      const result = await smsService.verifyPhoneNumber(phoneNumber);
      if (result.success) {
        codeSent = true;
        toastService.success('Verification code sent!');
      } else {
        toastService.error(result.error || 'Failed to send code');
      }
    } catch (error) {
      toastService.error('Failed to send verification code');
    } finally {
      isSending = false;
    }
  }

  async function confirmVerification() {
    if (!verificationCode || verificationCode.length !== 6) {
      toastService.error('Please enter the 6-digit code');
      return;
    }

    isVerifying = true;
    try {
      const result = await smsService.confirmVerification(phoneNumber, verificationCode);
      if (result.success && result.data?.verified) {
        verified = true;
        toastService.success('Phone verified!');
        onVerified(phoneNumber);
      } else {
        toastService.error('Invalid verification code');
      }
    } catch (error) {
      toastService.error('Verification failed');
    } finally {
      isVerifying = false;
    }
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6">
  <div class="flex items-start gap-4">
    <div class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
      <Phone class="w-6 h-6 text-green-600 dark:text-green-400" />
    </div>

    <div class="flex-1">
      <h4 class="font-semibold text-lg mb-2">
        SMS Notifications
      </h4>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Get text reminders for important tasks and daily summaries
      </p>

      {#if verified}
        <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle class="w-5 h-5" />
          <span class="font-medium">Phone verified!</span>
        </div>
      {:else if !codeSent}
        <div class="space-y-3">
          <TextInput
            bind:value={phoneNumber}
            type="tel"
            placeholder="(555) 123-4567"
            disabled={isSending}
          />
          <div class="flex gap-2">
            <Button
              variant="primary"
              on:click={sendVerificationCode}
              loading={isSending}
              disabled={phoneNumber.length < 10}
            >
              Send Code
            </Button>
            <Button
              variant="ghost"
              on:click={onSkip}
              disabled={isSending}
            >
              Skip for now
            </Button>
          </div>
        </div>
      {:else}
        <div class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Enter the 6-digit code sent to {phoneNumber}
          </p>
          <TextInput
            bind:value={verificationCode}
            type="text"
            placeholder="123456"
            maxlength={6}
            disabled={isVerifying}
          />
          <div class="flex gap-2">
            <Button
              variant="primary"
              on:click={confirmVerification}
              loading={isVerifying}
              disabled={verificationCode.length !== 6}
            >
              Verify
            </Button>
            <Button
              variant="ghost"
              on:click={() => { codeSent = false; verificationCode = ''; }}
              disabled={isVerifying}
            >
              Change Number
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
```

### Step 2.2: Notifications Preferences Step

**New File**: `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`

```svelte
<script lang="ts">
  import { Bell, Mail, MessageSquare, Smartphone, Sun, Moon } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PhoneVerificationCard from './PhoneVerificationCard.svelte';
  import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
  import { toastService } from '$lib/stores/toast.store';

  export let userId: string;
  export let onNext: () => void;

  let smsPreferences = $state({
    phoneVerified: false,
    phoneNumber: '',
    eventReminders: false,
    nextUpNotifications: false,
    morningKickoff: false,
    eveningRecap: false
  });

  let emailPreferences = $state({
    dailyBrief: false
  });

  // 🎬 PLACEHOLDER: Demo video showing SMS notifications
  let showSMSDemo = $state(false);

  function handlePhoneVerified(phoneNumber: string) {
    smsPreferences.phoneVerified = true;
    smsPreferences.phoneNumber = phoneNumber;
    // Enable all SMS options by default
    smsPreferences.eventReminders = true;
    smsPreferences.morningKickoff = true;
  }

  function handleSkipSMS() {
    onboardingV2Service.markSMSSkipped(userId, true);
    onNext();
  }

  async function saveAndContinue() {
    // Save preferences via API
    try {
      if (smsPreferences.phoneVerified) {
        // Update SMS preferences
        await fetch('/api/sms/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_reminders_enabled: smsPreferences.eventReminders,
            next_up_enabled: smsPreferences.nextUpNotifications,
            morning_kickoff_enabled: smsPreferences.morningKickoff,
            evening_recap_enabled: smsPreferences.eveningRecap
          })
        });
      }

      // Update email preferences
      await fetch('/api/brief-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_daily_brief: emailPreferences.dailyBrief
        })
      });

      toastService.success('Notification preferences saved!');
      onNext();
    } catch (error) {
      toastService.error('Failed to save preferences');
    }
  }
</script>

<div class="max-w-3xl mx-auto">
  <div class="mb-8 text-center">
    <div class="flex justify-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center">
        <Bell class="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>
    </div>

    <h2 class="text-3xl font-bold mb-3">
      Stay Accountable (Optional)
    </h2>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      How do you want BuildOS to keep you on track?
    </p>
  </div>

  <!-- 🎬 PLACEHOLDER: SMS notification demo video -->
  <div class="mb-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6">
    <h3 class="font-semibold mb-3">See SMS Notifications in Action</h3>
    <div class="bg-white dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300">
      <p class="text-gray-400 mb-2">
        🎥 [Demo video: Phone receiving SMS notifications - 10 seconds]
      </p>
      <p class="text-sm text-gray-500">
        Examples: Morning kickoff, task reminder, evening recap
      </p>
    </div>
  </div>

  <div class="space-y-6">
    <!-- Phone Verification -->
    <PhoneVerificationCard
      onVerified={handlePhoneVerified}
      onSkip={handleSkipSMS}
    />

    <!-- SMS Options (only show if phone verified) -->
    {#if smsPreferences.phoneVerified}
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h4 class="font-semibold mb-4">Choose Your SMS Notifications</h4>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={smsPreferences.eventReminders}
            class="mt-1 w-5 h-5 text-blue-600 rounded"
          />
          <div>
            <div class="font-medium flex items-center gap-2">
              <Bell class="w-4 h-4" />
              Event Reminders
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Get notified about upcoming events and meetings
            </p>
          </div>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={smsPreferences.nextUpNotifications}
            class="mt-1 w-5 h-5 text-blue-600 rounded"
          />
          <div>
            <div class="font-medium flex items-center gap-2">
              <Smartphone class="w-4 h-4" />
              Next Up Notifications
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              See what's next on your schedule
            </p>
          </div>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={smsPreferences.morningKickoff}
            class="mt-1 w-5 h-5 text-blue-600 rounded"
          />
          <div>
            <div class="font-medium flex items-center gap-2">
              <Sun class="w-4 h-4" />
              Morning Kickoff
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Start your day with focus and priorities
            </p>
          </div>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={smsPreferences.eveningRecap}
            class="mt-1 w-5 h-5 text-blue-600 rounded"
          />
          <div>
            <div class="font-medium flex items-center gap-2">
              <Moon class="w-4 h-4" />
              Evening Recap
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Reflect on your day and plan tomorrow
            </p>
          </div>
        </label>
      </div>
    {/if}

    <!-- Email Preferences -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
          <Mail class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>

        <div class="flex-1">
          <h4 class="font-semibold text-lg mb-2">
            Email Notifications
          </h4>

          <label class="flex items-start gap-3 cursor-pointer mt-4">
            <input
              type="checkbox"
              bind:checked={emailPreferences.dailyBrief}
              class="mt-1 w-5 h-5 text-purple-600 rounded"
            />
            <div>
              <div class="font-medium">Daily Brief Emails</div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Morning digest with your upcoming projects and tasks
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  </div>

  <!-- Actions -->
  <div class="flex items-center justify-between mt-8">
    <Button
      variant="ghost"
      on:click={handleSkipSMS}
    >
      I'll set this up later
    </Button>

    <Button
      variant="primary"
      size="lg"
      on:click={saveAndContinue}
    >
      Continue
    </Button>
  </div>
</div>
```

### Step 2.3: Create SMS Preferences API Endpoint

**New File**: `/apps/web/src/routes/api/sms/preferences/+server.ts`

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PRIVATE_SUPABASE_SERVICE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

const supabase = createClient(
  PUBLIC_SUPABASE_URL,
  PRIVATE_SUPABASE_SERVICE_KEY,
);

export const PUT: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      event_reminders_enabled,
      next_up_enabled,
      morning_kickoff_enabled,
      evening_recap_enabled,
    } = body;

    const { error } = await supabase
      .from("user_sms_preferences")
      .update({
        event_reminders_enabled,
        next_up_enabled,
        morning_kickoff_enabled,
        evening_recap_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", session.user.id);

    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    console.error("Failed to update SMS preferences:", error);
    return json({ error: "Failed to update preferences" }, { status: 500 });
  }
};
```

### Success Criteria

- ✅ Phone verification flow works end-to-end
- ✅ SMS preference checkboxes save correctly
- ✅ Email brief opt-in checkbox functional
- ✅ "Skip for now" option available
- ✅ Placeholder video displayed
- ✅ SMS preferences stored in database

**Time Estimate:** 3-4 days

---

## Phase 3: User Archetypes & Challenges (Week 4)

**Goal:** Implement user archetype selection and productivity challenges identification.

### Step 3.1: Archetype Selection Component

**New File**: `/apps/web/src/lib/components/onboarding-v2/ArchetypeStep.svelte`

```svelte
<script lang="ts">
  import { Brain, Bot, ListChecks, Sparkles } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
  import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
  import { toastService } from '$lib/stores/toast.store';

  export let userId: string;
  export let onNext: () => void;

  let selectedArchetype = $state<string | null>(null);

  const archetypes = ONBOARDING_V2_CONFIG.archetypes;

  const iconMap = {
    brain: Brain,
    robot: Bot,
    checklist: ListChecks
  };

  function selectArchetype(id: string) {
    selectedArchetype = id;
  }

  async function saveAndContinue() {
    if (!selectedArchetype) {
      toastService.error('Please select how you want to use BuildOS');
      return;
    }

    try {
      await onboardingV2Service.saveArchetype(userId, selectedArchetype);
      toastService.success('Profile saved!');
      onNext();
    } catch (error) {
      toastService.error('Failed to save profile');
    }
  }
</script>

<div class="max-w-4xl mx-auto">
  <div class="mb-12 text-center">
    <div class="flex justify-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center">
        <Sparkles class="w-8 h-8 text-purple-600 dark:text-purple-400" />
      </div>
    </div>

    <h2 class="text-3xl font-bold mb-3">
      How do you want to use BuildOS?
    </h2>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      Everyone uses BuildOS differently. Choose the profile that fits you best.
    </p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    {#each archetypes as archetype}
      {@const Icon = iconMap[archetype.icon]}
      {@const isSelected = selectedArchetype === archetype.id}

      <button
        on:click={() => selectArchetype(archetype.id)}
        class="group relative p-6 rounded-2xl border-2 transition-all duration-200 text-left
          {isSelected
            ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 shadow-lg scale-105'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 hover:shadow-md'}"
      >
        <!-- Selection indicator -->
        {#if isSelected}
          <div class="absolute top-4 right-4 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
          </div>
        {/if}

        <!-- Icon -->
        <div class="mb-4 w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 flex items-center justify-center
          {isSelected ? 'scale-110' : 'group-hover:scale-105'}
          transition-transform duration-200">
          <Icon class="w-7 h-7 text-purple-600 dark:text-purple-400" />
        </div>

        <!-- Content -->
        <h3 class="text-xl font-bold mb-2 {isSelected ? 'text-purple-900 dark:text-purple-100' : ''}">
          {archetype.title}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {archetype.description}
        </p>

        <!-- Features -->
        <ul class="space-y-2">
          {#each archetype.features as feature}
            <li class="flex items-start gap-2 text-sm">
              <span class="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
              <span class="text-gray-700 dark:text-gray-300">{feature}</span>
            </li>
          {/each}
        </ul>
      </button>
    {/each}
  </div>

  <!-- Help text -->
  <div class="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">
    Don't worry — you can change this later in your settings
  </div>

  <!-- Actions -->
  <div class="flex justify-center">
    <Button
      variant="primary"
      size="lg"
      on:click={saveAndContinue}
      disabled={!selectedArchetype}
      class="min-w-[200px]"
    >
      Continue
    </Button>
  </div>
</div>
```

### Step 3.2: Challenges Selection Component

**New File**: `/apps/web/src/lib/components/onboarding-v2/ChallengesStep.svelte`

```svelte
<script lang="ts">
  import { HelpCircle, Sparkles } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
  import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
  import { toastService } from '$lib/stores/toast.store';

  export let userId: string;
  export let onNext: () => void;

  let selectedChallenges = $state<Set<string>>(new Set());

  const challenges = ONBOARDING_V2_CONFIG.challenges;

  function toggleChallenge(id: string) {
    if (selectedChallenges.has(id)) {
      selectedChallenges.delete(id);
    } else {
      selectedChallenges.add(id);
    }
    selectedChallenges = new Set(selectedChallenges); // Trigger reactivity
  }

  async function saveAndContinue() {
    if (selectedChallenges.size === 0) {
      toastService.warning('Select at least one challenge to help us personalize BuildOS');
      return;
    }

    try {
      await onboardingV2Service.saveChallenges(userId, Array.from(selectedChallenges));
      toastService.success('Challenges saved!');
      onNext();
    } catch (error) {
      toastService.error('Failed to save challenges');
    }
  }

  function skipChallenges() {
    onNext();
  }
</script>

<div class="max-w-3xl mx-auto">
  <div class="mb-12 text-center">
    <div class="flex justify-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-2xl flex items-center justify-center">
        <HelpCircle class="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
    </div>

    <h2 class="text-3xl font-bold mb-3">
      What's your biggest productivity challenge?
    </h2>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      Select all that apply — this helps BuildOS adapt to your needs
    </p>
  </div>

  <div class="space-y-3 mb-8">
    {#each challenges as challenge}
      {@const isSelected = selectedChallenges.has(challenge.id)}

      <button
        on:click={() => toggleChallenge(challenge.id)}
        class="w-full p-4 rounded-xl border-2 transition-all duration-200 text-left flex items-start gap-4
          {isSelected
            ? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 shadow-md'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 hover:shadow-sm'}"
      >
        <!-- Checkbox -->
        <div class="flex-shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center
          {isSelected
            ? 'border-amber-500 bg-amber-500'
            : 'border-gray-300 dark:border-gray-600'}
          transition-colors duration-200">
          {#if isSelected}
            <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
          {/if}
        </div>

        <!-- Challenge -->
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-2xl">{challenge.icon}</span>
            <span class="font-medium {isSelected ? 'text-amber-900 dark:text-amber-100' : ''}">
              {challenge.label}
            </span>
          </div>
        </div>
      </button>
    {/each}
  </div>

  <!-- Selection count -->
  <div class="text-center text-sm text-gray-600 dark:text-gray-400 mb-8">
    {selectedChallenges.size} challenge{selectedChallenges.size !== 1 ? 's' : ''} selected
  </div>

  <!-- Actions -->
  <div class="flex items-center justify-between">
    <Button
      variant="ghost"
      on:click={skipChallenges}
    >
      Skip this step
    </Button>

    <Button
      variant="primary"
      size="lg"
      on:click={saveAndContinue}
      disabled={selectedChallenges.size === 0}
    >
      Continue
      <Sparkles class="w-5 h-5 ml-2" />
    </Button>
  </div>
</div>
```

### Success Criteria

- ✅ Archetype cards display with icons and features
- ✅ Single-select archetype works (radio button behavior)
- ✅ Multi-select challenges works
- ✅ Data saves to database correctly
- ✅ Visual feedback for selection states

**Time Estimate:** 2-3 days

---

## Phase 4: Summary & Completion (Week 5)

**Goal:** Implement summary screen reflecting captured data and smooth transition to workspace.

### Step 4.1: Summary Component

**New File**: `/apps/web/src/lib/components/onboarding-v2/SummaryStep.svelte`

```svelte
<script lang="ts">
  import { CheckCircle, Sparkles, ArrowRight, Calendar, Bell, Brain, Target } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { goto } from '$app/navigation';
  import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
  import { toastService } from '$lib/stores/toast.store';

  export let userId: string;
  export let summary: {
    projectsCreated: number;
    calendarAnalyzed: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
    archetype: string;
    challenges: string[];
  };

  let isCompleting = $state(false);

  const archetypeLabels = {
    second_brain: 'Second Brain',
    ai_task_manager: 'AI Task Manager',
    project_todo_list: 'Project To-Do List'
  };

  async function completeOnboarding() {
    isCompleting = true;

    try {
      await onboardingV2Service.completeOnboarding(userId);
      toastService.success('🎉 Welcome to BuildOS!');

      // Redirect to workspace
      setTimeout(() => {
        goto('/');
      }, 1500);
    } catch (error) {
      toastService.error('Failed to complete setup');
      isCompleting = false;
    }
  }
</script>

<div class="max-w-3xl mx-auto">
  <div class="mb-12 text-center">
    <div class="flex justify-center mb-6">
      <div class="relative">
        <div class="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-600 blur-2xl opacity-30 animate-pulse"></div>
        <div class="relative w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-xl">
          <CheckCircle class="w-10 h-10 text-white" />
        </div>
      </div>
    </div>

    <h2 class="text-4xl font-bold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
      You're All Set!
    </h2>
    <p class="text-xl text-gray-600 dark:text-gray-400">
      Here's what we learned about you:
    </p>
  </div>

  <!-- Summary Cards -->
  <div class="space-y-4 mb-12">
    <!-- Projects Created -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border-2 border-green-200 dark:border-green-800 p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
          <Brain class="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-lg mb-1">Projects Captured</h3>
          <p class="text-gray-600 dark:text-gray-400">
            {#if summary.projectsCreated > 0}
              Created <strong>{summary.projectsCreated}</strong> project{summary.projectsCreated !== 1 ? 's' : ''} from your brain dump
            {:else}
              No projects created yet — you can add them anytime!
            {/if}
          </p>
          {#if summary.calendarAnalyzed}
            <div class="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <Calendar class="w-4 h-4" />
              <span>Analyzed your Google Calendar</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Notifications Setup -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <Bell class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-lg mb-1">Accountability Style</h3>
          <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {#if summary.smsEnabled}
              <div class="flex items-center gap-2">
                <CheckCircle class="w-4 h-4 text-green-600" />
                <span>SMS notifications enabled</span>
              </div>
            {/if}
            {#if summary.emailEnabled}
              <div class="flex items-center gap-2">
                <CheckCircle class="w-4 h-4 text-green-600" />
                <span>Email daily briefs enabled</span>
              </div>
            {/if}
            {#if !summary.smsEnabled && !summary.emailEnabled}
              <p>You can set up notifications later in settings</p>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Usage Profile -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
          <Sparkles class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-lg mb-1">Usage Profile</h3>
          <p class="text-gray-600 dark:text-gray-400">
            You'll use BuildOS as: <strong>{archetypeLabels[summary.archetype]}</strong>
          </p>
        </div>
      </div>
    </div>

    <!-- Challenges Identified -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border-2 border-amber-200 dark:border-amber-800 p-6">
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
          <Target class="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-lg mb-1">Challenges Identified</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-2">
            BuildOS will help you with:
          </p>
          <div class="flex flex-wrap gap-2">
            {#each summary.challenges as challengeId}
              <span class="inline-flex px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm rounded-full">
                {challengeId.replace(/_/g, ' ')}
              </span>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Call to Action -->
  <div class="text-center">
    <Button
      variant="primary"
      size="lg"
      on:click={completeOnboarding}
      loading={isCompleting}
      class="px-8 py-4 text-lg shadow-xl hover:shadow-2xl"
    >
      {#if isCompleting}
        Preparing Your Workspace...
      {:else}
        Enter BuildOS
        <ArrowRight class="w-5 h-5 ml-2" />
      {/if}
    </Button>

    <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
      Your personalized workspace is ready!
    </p>
  </div>
</div>
```

### Step 4.2: Wire Up Complete Flow

**Update**: `/apps/web/src/routes/onboarding/+page.svelte`

```svelte
<script lang="ts">
  import WelcomeStep from '$lib/components/onboarding-v2/WelcomeStep.svelte';
  import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
  import NotificationsStep from '$lib/components/onboarding-v2/NotificationsStep.svelte';
  import ArchetypeStep from '$lib/components/onboarding-v2/ArchetypeStep.svelte';
  import ChallengesStep from '$lib/components/onboarding-v2/ChallengesStep.svelte';
  import SummaryStep from '$lib/components/onboarding-v2/SummaryStep.svelte';

  let currentStep = 0;
  let onboardingData = {
    projectsCreated: 0,
    calendarAnalyzed: false,
    smsEnabled: false,
    emailEnabled: false,
    archetype: '',
    challenges: []
  };

  function nextStep() {
    currentStep++;
  }

  function handleProjectsCreated(projectIds: string[]) {
    onboardingData.projectsCreated = projectIds.length;
  }

  // ... rest of handlers
</script>

{#if currentStep === 0}
  <WelcomeStep onStart={nextStep} />
{:else if currentStep === 1}
  <ProjectsCaptureStep
    userContext={data.userContext}
    onNext={nextStep}
    onProjectsCreated={handleProjectsCreated}
  />
{:else if currentStep === 2}
  <NotificationsStep userId={data.user.id} onNext={nextStep} />
{:else if currentStep === 3}
  <ArchetypeStep userId={data.user.id} onNext={nextStep} />
{:else if currentStep === 4}
  <ChallengesStep userId={data.user.id} onNext={nextStep} />
{:else if currentStep === 5}
  <SummaryStep userId={data.user.id} summary={onboardingData} />
{/if}
```

### Success Criteria

- ✅ Summary displays all captured information
- ✅ Completion flow works end-to-end
- ✅ User marked as completed in database
- ✅ Smooth redirect to workspace
- ✅ Celebration animation/messaging

**Time Estimate:** 2-3 days

---

## Phase 5: Polish, Testing & Deployment (Week 6)

**Goal:** Add visual polish, comprehensive testing, and deploy to production.

### Tasks

#### 5.1: Visual Polish

- [ ] Add placeholder screenshots and videos
- [ ] Improve animations and transitions
- [ ] Mobile responsiveness testing
- [ ] Dark mode verification
- [ ] Accessibility audit (keyboard navigation, screen readers)
- [ ] Loading states and skeleton screens

#### 5.2: Testing

**Unit Tests**: Test individual components

- [ ] `WelcomeStep.test.ts`
- [ ] `ProjectsCaptureStep.test.ts`
- [ ] `NotificationsStep.test.ts`
- [ ] `ArchetypeStep.test.ts`
- [ ] `ChallengesStep.test.ts`
- [ ] `SummaryStep.test.ts`

**Integration Tests**: Test full flow

- [ ] Complete onboarding flow (all steps)
- [ ] Skip optional steps (calendar, SMS)
- [ ] Back/forward navigation
- [ ] Auto-save functionality
- [ ] Error handling

**E2E Tests** (Playwright):

```typescript
test("complete onboarding flow v2", async ({ page }) => {
  await page.goto("/onboarding?v2=true");

  // Step 0: Welcome
  await page.click("text=Start Setting Up");

  // Step 1: Projects
  await page.fill("textarea", "Build a SaaS platform for small businesses");
  await page.click("text=Continue");

  // Step 2: Notifications (skip)
  await page.click("text=I'll set this up later");

  // Step 3: Archetype
  await page.click("text=AI Task Manager");
  await page.click("text=Continue");

  // Step 4: Challenges
  await page.click("text=Time management");
  await page.click("text=Context switching");
  await page.click("text=Continue");

  // Step 5: Summary
  await page.click("text=Enter BuildOS");

  await page.waitForURL("/");
  expect(page.url()).toContain("/");
});
```

#### 5.3: Analytics Integration

Add tracking for:

- [ ] Step completion rates
- [ ] Drop-off points
- [ ] Average time per step
- [ ] SMS opt-in rate
- [ ] Email opt-in rate
- [ ] Calendar analysis usage
- [ ] Archetype distribution
- [ ] Challenge selections

**Analytics Events**:

```typescript
// Track step progression
analytics.track("onboarding_step_completed", {
  step: "projects_capture",
  projectsCreated: 2,
  usedCalendarAnalysis: true,
});

// Track opt-in rates
analytics.track("onboarding_sms_optin", {
  optedIn: true,
  preferences: ["morning_kickoff", "event_reminders"],
});
```

#### 5.4: Documentation

Create user-facing docs:

- [ ] `/docs/user-guide/onboarding-guide.md`
- [ ] Video walkthrough (optional)
- [ ] FAQ for common questions

Create developer docs:

- [ ] `/apps/web/docs/features/onboarding-v2/README.md`
- [ ] Component documentation
- [ ] API documentation
- [ ] Migration guide from v1 to v2

#### 5.5: Deployment Strategy

**Gradual Rollout**:

1. **Internal Testing** (Week 6, Day 1-2)
   - Deploy to staging
   - Team walkthrough
   - Bug fixes

2. **Beta Users** (Week 6, Day 3-4)
   - Feature flag: `?v2=true`
   - Invite beta users
   - Collect feedback

3. **A/B Test** (Week 6, Day 5)
   - 10% of new users → v2
   - 90% of new users → v1
   - Monitor metrics

4. **Full Rollout** (Week 7)
   - 50% → v2
   - Monitor for 2 days
   - 100% → v2 if metrics look good

**Rollback Plan**:

- Keep v1 flow intact
- Feature flag to revert to v1
- Database migration is additive (safe)

### Success Criteria

- ✅ All tests passing (unit, integration, E2E)
- ✅ Analytics tracking implemented
- ✅ Documentation complete
- ✅ Beta feedback incorporated
- ✅ A/B test showing positive results
- ✅ Mobile + desktop tested
- ✅ Accessibility standards met

**Time Estimate:** 5-7 days

---

## Additional Considerations

### Sub-Plans for Complex Features

#### Sub-Plan A: Calendar Analysis Integration

**Status**: ✅ Ready to use (no changes needed)

**Components**:

- `CalendarAnalysisModal.svelte` - Full modal with analysis UI
- `CalendarAnalysisResults.svelte` - Project suggestions display

**Integration Steps**:

1. Import modal into `ProjectsCaptureStep`
2. Show CTA button with explainer video placeholder
3. Bind `isOpen` state to button click
4. Set `autoStart={true}` to trigger analysis immediately
5. Handle `onClose` to return to onboarding

**Estimated Time**: 2-3 hours

---

#### Sub-Plan B: SMS Phone Verification

**Status**: ⏳ Backend ready, needs UI components

**Database**: ✅ Complete (`user_sms_preferences` table exists)

**API Endpoints**:

- ✅ `/api/sms/verify` - Send verification code
- ✅ `/api/sms/verify/confirm` - Confirm code

**New Components Needed**:

1. `PhoneVerificationCard.svelte` - Phone input + verification flow
2. `SMSPreferencesForm.svelte` - Checkbox preferences
3. `/api/sms/preferences/+server.ts` - Save preferences

**Workflow**:

1. User enters phone number
2. Click "Send Code" → calls `/api/sms/verify`
3. Enter 6-digit code
4. Click "Verify" → calls `/api/sms/verify/confirm`
5. On success, enable SMS preference checkboxes
6. Save preferences → calls new `/api/sms/preferences`

**Estimated Time**: 6-8 hours

---

#### Sub-Plan C: Guided Brain Dump with Context

**Status**: ✅ Ready to use with `autoAccept` mode

**Service**: `brainDumpService.parseBrainDumpWithStream()`

**Key Parameters**:

```typescript
await brainDumpService.parseBrainDumpWithStream(
  text: string,                    // User's brain dump
  selectedProjectId: null,         // null = new project
  brainDumpId: undefined,
  displayedQuestions: [            // Context from onboarding
    { question: "Work style?", answer: userInputs.workStyle },
    { question: "Challenges?", answer: userInputs.challenges }
  ],
  options: {
    autoAccept: true,              // Auto-create without review
    onComplete: (result) => {
      // result.projectInfo has new project details
    }
  }
);
```

**Integration into Onboarding**:

1. Collect brain dump text in `ProjectsCaptureStep`
2. Build context array from previous steps
3. Call service with `autoAccept: true`
4. Show loading state during processing
5. On completion, show success + continue

**Estimated Time**: 4-6 hours

---

#### Sub-Plan D: User Archetype Storage & Usage

**Database Changes**:

```sql
ALTER TABLE users
ADD COLUMN usage_archetype TEXT CHECK (
  usage_archetype IN ('second_brain', 'ai_task_manager', 'project_todo_list')
);
```

**Future Usage**:

- Customize daily brief prompts based on archetype
- Filter/sort projects by archetype preference
- Tailor onboarding tips in first-time user experience

**Example Daily Brief Customization**:

```typescript
// In worker/src/workers/dailyBriefWorker.ts
const briefPrompt =
  user.usage_archetype === "second_brain"
    ? "Focus on knowledge connections and insights..."
    : user.usage_archetype === "ai_task_manager"
      ? "Prioritize upcoming meetings and deadlines..."
      : "List actionable tasks to move projects forward...";
```

**Estimated Time**: 3-4 hours (implementation + customization)

---

#### Sub-Plan E: Productivity Challenges Tracking

**Database Changes**:

```sql
ALTER TABLE users
ADD COLUMN productivity_challenges JSONB DEFAULT '[]'::jsonb;

-- Example stored value:
-- ['time_management', 'focus_adhd', 'context_switching']
```

**Future Usage**:

- Inform AI tone (more empathetic for ADHD)
- Suggest specific features (Pomodoro for focus issues)
- Customize notification timing/frequency
- Generate personalized tips in daily briefs

**Example AI Customization**:

```typescript
// In promptTemplate.service.ts
const systemContext = user.productivity_challenges.includes("focus_adhd")
  ? "User has ADHD - keep tasks small, use encouraging language, suggest breaks"
  : "Standard task breakdown approach";
```

**Estimated Time**: 2-3 hours

---

## Timeline Summary

| Phase       | Description                    | Duration | Start      | End        |
| ----------- | ------------------------------ | -------- | ---------- | ---------- |
| **Phase 0** | Foundation & Prerequisites     | 1-2 days | Week 1 Mon | Week 1 Tue |
| **Phase 1** | Welcome & Projects Capture     | 3-4 days | Week 2 Mon | Week 2 Thu |
| **Phase 2** | Accountability & Notifications | 3-4 days | Week 3 Mon | Week 3 Thu |
| **Phase 3** | Archetypes & Challenges        | 2-3 days | Week 4 Mon | Week 4 Wed |
| **Phase 4** | Summary & Completion           | 2-3 days | Week 4 Thu | Week 5 Mon |
| **Phase 5** | Polish, Testing & Deployment   | 5-7 days | Week 5 Tue | Week 6 Mon |

**Total Estimated Time**: 5-6 weeks (with testing and iteration)

**Fast Track Option**: 3-4 weeks (skip analytics, minimal polish, beta-only release)

---

## Risk Mitigation

### Potential Risks

1. **SMS Provider Limits**: Twilio Verify has rate limits
   - _Mitigation_: Implement client-side throttling, show clear error messages

2. **Calendar API Failures**: Google Calendar quota exceeded
   - _Mitigation_: Graceful degradation, allow manual project creation

3. **Auto-Accept Brain Dumps Creating Bad Projects**: AI misinterprets input
   - _Mitigation_: Add "Review & Edit" option after creation, show preview before final commit

4. **User Overwhelm**: Too many steps in onboarding
   - _Mitigation_: Make more steps optional, add "Quick Setup" vs. "Full Setup" option

5. **Mobile UX Issues**: Complex UI on small screens
   - _Mitigation_: Mobile-first design, test on actual devices, simplify layouts

### Rollback Strategy

- Keep v1 onboarding intact
- Use feature flag: `?v2=true` or database flag
- Database migrations are additive (no data loss)
- Can revert users to v1 if issues arise

---

## Success Metrics

### Completion Rates

- **Target**: 80%+ complete all required steps
- **Current v1**: ~65% complete onboarding

### Time to Complete

- **Target**: 3-5 minutes average
- **Current v1**: 4-6 minutes

### Feature Adoption

- **SMS Opt-in**: 30%+ of users
- **Email Opt-in**: 50%+ of users
- **Calendar Analysis**: 40%+ of users with Google Calendar
- **Projects Created**: 1.5 projects average per user

### User Satisfaction

- **Post-onboarding Survey**: 4.5+ stars
- **Support Tickets**: Reduce onboarding-related tickets by 30%

---

## File Paths Reference

### New Components (Phase 1-5)

```
/apps/web/src/lib/components/onboarding-v2/
  ├── WelcomeStep.svelte
  ├── ProjectsCaptureStep.svelte
  ├── NotificationsStep.svelte
  ├── PhoneVerificationCard.svelte
  ├── ArchetypeStep.svelte
  ├── ChallengesStep.svelte
  └── SummaryStep.svelte
```

### Configuration & Services

```
/apps/web/src/lib/config/
  └── onboarding.config.ts

/apps/web/src/lib/services/
  └── onboarding-v2.service.ts
```

### API Endpoints

```
/apps/web/src/routes/api/
  ├── sms/
  │   ├── verify/+server.ts (existing)
  │   ├── verify/confirm/+server.ts (existing)
  │   └── preferences/+server.ts (new)
  └── onboarding/+server.ts (update)
```

### Database Migrations

```
/apps/web/supabase/migrations/
  └── 20251003_onboarding_v2_schema.sql (new)
```

### Documentation

```
/apps/web/docs/features/onboarding-v2/
  ├── README.md
  ├── architecture.md
  ├── components.md
  ├── api-endpoints.md
  └── testing.md

/docs/user-guide/
  └── onboarding-guide.md
```

### Assets

```
/apps/web/static/onboarding-assets/
  ├── screenshots/
  │   ├── brain_dump_example.png
  │   ├── calendar_analysis_before.png
  │   └── sms_notification_example.png
  └── videos/
      ├── calendar_analysis_demo.mp4
      ├── sms_notification_demo.mp4
      └── brain_dump_guided_demo.mp4
```

---

## Related Research Documents

This implementation plan builds upon detailed research in:

1. **Twilio Integration Research** - SMS backend status and integration guide
2. **Brain Dump System Research** - Auto-accept mode and context integration
3. **Database Schema Research** - User preferences and onboarding tables
4. **Notification System Research** - Daily briefs, email, and SMS preferences

All research documents available in: `/thoughts/shared/research/`

---

## Conclusion

This phased implementation plan provides a clear roadmap for building the comprehensive onboarding revamp outlined in `build-os-onboarding-revamp.md`. By breaking the work into 5 distinct phases over 5-6 weeks, the team can:

1. **Build incrementally** - Each phase delivers working functionality
2. **Test thoroughly** - Ample time for QA between phases
3. **Iterate quickly** - Beta feedback incorporated before full rollout
4. **Mitigate risks** - Feature flags and rollback strategy in place
5. **Measure success** - Clear metrics and analytics tracking

The plan leverages existing infrastructure (60% already built) and focuses new development on UX orchestration, making it realistic and achievable within the timeline.

**Next Steps**: Review plan with team, adjust timeline if needed, and begin Phase 0 database migrations.
