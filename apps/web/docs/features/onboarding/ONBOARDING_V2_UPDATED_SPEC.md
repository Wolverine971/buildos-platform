# Onboarding V2 Updated Flow - Comprehensive Specification

**Date:** 2025-10-21
**Status:** Draft
**Author:** Anna Wayne
**Last Updated:** 2025-10-21

---

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed New Flow](#proposed-new-flow)
4. [Step-by-Step Specifications](#step-by-step-specifications)
5. [Implementation Plan](#implementation-plan)
6. [UI/UX Considerations](#uiux-considerations)
7. [Technical Considerations](#technical-considerations)
8. [Assets Required](#assets-required)

---

## Overview

### Goals

The updated onboarding v2 flow aims to:

1. **Simplify the narrative** - Reduce from 6 steps to 5 steps with clearer structure
2. **Showcase flexibility** - Add dedicated step highlighting BuildOS's adaptability
3. **Show system capabilities** - Add admin/features tour step
4. **Combine related concepts** - Merge usage profile + productivity challenges into one cohesive step
5. **Maintain core philosophy** - Keep "Clarity → Focus → Flexibility" framework

### Key Changes from Current V2

| Current V2               | New V2                   | Change Type                              |
| ------------------------ | ------------------------ | ---------------------------------------- |
| Step 0: Welcome          | Step 0: Welcome          | **Modified** - Update philosophy section |
| Step 1: Projects Capture | Step 1: Clarity          | **Renamed** - Same content               |
| Step 2: Notifications    | Step 2: Focus            | **Renamed** - Same content               |
| _N/A_                    | Step 3: Flexibility      | **NEW** - Showcase flexible features     |
| Step 3: Archetype        | _Merged into Step 4_     | **Removed**                              |
| Step 4: Challenges       | Step 4: Combined Profile | **Modified** - Merged with archetype     |
| _N/A_                    | Step 5: Admin Tour       | **NEW** - Optional feature tour          |
| Step 5: Summary          | Step 6: Summary          | **Moved** - Final step                   |

---

## Current State Analysis

### Current Onboarding V2 Structure

**Location:** `/apps/web/src/routes/onboarding/+page.svelte`

**Current Steps:**

1. **Welcome** (step 0) - WelcomeStep.svelte
2. **Projects** (step 1) - ProjectsCaptureStep.svelte
3. **Notifications** (step 2) - NotificationsStep.svelte
4. **Archetype** (step 3) - ArchetypeStep.svelte
5. **Challenges** (step 4) - ChallengesStep.svelte
6. **Summary** (step 5) - SummaryStep.svelte

**Config File:** `/apps/web/src/lib/config/onboarding.config.ts`

### Components to Reuse

- ✅ `WelcomeStep.svelte` - Modify philosophy section
- ✅ `ProjectsCaptureStep.svelte` - Keep as-is
- ✅ `NotificationsStep.svelte` - Keep as-is
- ✅ `ArchetypeStep.svelte` - Merge into new combined step
- ✅ `ChallengesStep.svelte` - Merge into new combined step
- ✅ `SummaryStep.svelte` - Update to reflect new steps
- ✅ `ProgressIndicator.svelte` - Update step count

### Components to Create

- 🆕 `FlexibilityStep.svelte` - New flexibility showcase
- 🆕 `AdminTourStep.svelte` - New features tour (optional)
- 🆕 `CombinedProfileStep.svelte` - Merged archetype + challenges

---

## Proposed New Flow

### Step Sequence

```
0. Welcome              → Introduces BuildOS philosophy
1. Clarity              → Projects & brain dumping
2. Focus                → Notifications & calendar
3. Flexibility          → Showcases flexible features ⭐ NEW
4. Your Profile         → Combined archetype + challenges
5. Admin Tour           → Features overview (skippable) ⭐ NEW
6. Summary              → Review & complete
```

### Philosophy: "Clarity → Focus → Flexibility"

The new flow aligns with a three-pillar philosophy:

1. **Clarity** - Get organized by offloading thoughts
2. **Focus** - Stay on track with reminders and calendar
3. **Flexibility** - Adapt to your changing needs

---

## Step-by-Step Specifications

### Step 0: Welcome

**Component:** `WelcomeStep.svelte` (MODIFIED)

**Changes Required:**

- Update "The BuildOS Way" section to show 3 pillars instead of current structure
- Update step 1: "First, Get Clarity" (keep existing)
- Update step 2: "Then, Stay Focused" (keep existing)
- **NEW** step 3: "Finally, Stay Flexible" - Add new section

**New Section Content:**

```markdown
### Step 3: Finally, Stay Flexible

Life changes. Priorities shift. BuildOS adapts with you. Whether you need to
reschedule tasks, regenerate plans, or reorganize your projects—BuildOS makes
it effortless to pivot without losing momentum.
```

**File Location:** `/apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte`

**Lines to Modify:** Lines 122-141 (add new step after "Stay Focused")

---

### Step 1: Clarity

**Component:** `ProjectsCaptureStep.svelte` (RENAMED, NO CHANGES)

**Current Title:** "Step 1: Get Clarity Through Brain Dumping"

**New Title:** "Step 1: Clarity - Projects & Brain Dumping"

**Changes Required:**

- Update header text to match new naming
- Keep all existing functionality (brain dump, calendar connection, voice input)

**File Location:** `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`

**Lines to Modify:** Lines 479-490 (title and subtitle)

---

### Step 2: Focus

**Component:** `NotificationsStep.svelte` (RENAMED, NO CHANGES)

**Current Title:** "Step 2: Maintain Focus With Smart Reminders"

**New Title:** "Step 2: Focus - Reminders & Calendar Integration"

**Changes Required:**

- Update header text to match new naming
- Keep all existing functionality (SMS, email, daily brief)

**File Location:** `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`

**Lines to Modify:** Lines 148-158 (title and subtitle)

---

### Step 3: Flexibility ⭐ NEW

**Component:** `FlexibilityStep.svelte` (NEW COMPONENT)

**Purpose:** Showcase BuildOS's flexibility through interactive demonstrations

**File Location:** `/apps/web/src/lib/components/onboarding-v2/FlexibilityStep.svelte`

#### **Section 1: Braindump Flexibility**

**Title:** "Braindumps Adapt to Your Needs"

**Features to Show:**

1. **Update Tasks via Braindump**
    - **Screenshot/Demo:** Show braindump modal with text like "The API integration task is now complete"
    - **Explanation:** "Braindumps aren't just for creating—use them to update existing tasks, mark progress, or add context"
    - **Example Text:**
        ```
        "The API integration is complete, but we need to add error handling.
        Also, let's reschedule the design review to next Friday."
        ```

2. **Reschedule Tasks via Braindump**
    - **Screenshot/Demo:** Show braindump processing rescheduling tasks
    - **Explanation:** "Need to reschedule? Just mention it in a braindump and BuildOS will automatically adjust your calendar"
    - **Example Text:**
        ```
        "This week got busy—let's push all Q1 planning tasks to next week
        and move the design review to next Friday afternoon."
        ```

**Research Reference:** Based on findings from `/apps/web/src/lib/utils/braindump-processor.ts` (Lines 1286-1421 for task updates, Lines 924-984 for rescheduling)

#### **Section 2: Flexible Organization with Project Phases**

**Title:** "Phases That Evolve With You"

**Features to Show:**

1. **Create Phases**
    - **Screenshot/Demo:** Show phase generation modal with options
    - **Explanation:** "Organize tasks into logical phases—BuildOS can generate phases automatically based on your project timeline"
    - **Interactive Element:** Show the 3 phase generation strategies:
        - "Put tasks into phases" (phases_only)
        - "Schedule tasks in phases" (schedule_in_phases)
        - "Schedule all to calendar" (calendar_optimized)

2. **Regenerate Phases**
    - **Screenshot/Demo:** Show regeneration process preserving completed work
    - **Explanation:** "Projects evolve. Regenerate phases anytime—BuildOS preserves your completed work and reorganizes the rest"
    - **Visual:** Before/After view showing phase regeneration

3. **Schedule All Tasks in a Phase**
    - **Screenshot/Demo:** Show phase scheduling with AI-suggested times
    - **Explanation:** "Let AI find the perfect time for every task in a phase, considering your calendar and work hours"
    - **Visual:** Calendar view with scheduled phase tasks

**Research Reference:** Based on findings from:

- Phase generation: `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`
- Phase scheduling: `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`
- UI components: `/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte`

#### **Section 3: Flexible Scheduling with Google Calendar**

**Title:** "Your Calendar, Your Way"

**Features to Show:**

1. **Schedule & Unschedule Tasks**
    - **Screenshot/Demo:** Show drag-and-drop task scheduling (or task detail with schedule/unschedule buttons)
    - **Explanation:** "Schedule tasks to your calendar with one click—or unschedule them just as easily"
    - **Visual:** Task card showing "Schedule" and "Unschedule" actions

2. **Timeblocks (Time Play)**
    - **Screenshot/Demo:** Show timeblock creation modal
    - **Explanation:** "Block off time on your calendar to work on specific projects—BuildOS even suggests what to work on during each block"
    - **Visual:** Calendar with colored timeblocks and AI task suggestions
    - **Interactive Element:** Show example timeblock with suggestions:

        ```
        🕐 10:00 AM - 12:00 PM: Marketing Campaign

        AI Suggestions for this block:
        ✓ Finalize social media calendar
        ✓ Draft email sequence #3
        ✓ Review landing page copy
        ```

**Research Reference:** Based on findings from:

- Task scheduling: `/apps/web/src/lib/services/calendar-service.ts` (Lines 631-779)
- Timeblocks: `/apps/web/src/routes/api/time-blocks/create/+server.ts`
- Timeblock UI: `/apps/web/src/lib/components/time-blocks/TimeBlockCreateModal.svelte`

#### **Component Structure**

```typescript
<script lang="ts">
  import { Sparkles, Calendar, RefreshCw, Layout } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    onNext: () => void;
  }

  let { onNext }: Props = $props();

  // State for showing/hiding different sections or demos
  let activeSection = $state<'braindump' | 'phases' | 'calendar'>('braindump');
</script>

<div class="max-w-4xl mx-auto px-4">
  <!-- Header -->
  <div class="mb-8 text-center">
    <h2>Step 3: Flexibility - BuildOS Adapts to You</h2>
    <p>Life changes. BuildOS keeps up. Here's how.</p>
  </div>

  <!-- Section Tabs -->
  <div class="flex gap-4 mb-8">
    <button on:click={() => activeSection = 'braindump'}>
      Braindump Flexibility
    </button>
    <button on:click={() => activeSection = 'phases'}>
      Flexible Phases
    </button>
    <button on:click={() => activeSection = 'calendar'}>
      Calendar Flexibility
    </button>
  </div>

  <!-- Dynamic Content Based on Active Section -->
  {#if activeSection === 'braindump'}
    <!-- Braindump flexibility demos -->
  {:else if activeSection === 'phases'}
    <!-- Phase flexibility demos -->
  {:else if activeSection === 'calendar'}
    <!-- Calendar flexibility demos -->
  {/if}

  <!-- Navigation -->
  <div class="flex justify-end mt-8">
    <Button variant="primary" size="lg" on:click={onNext}>
      Continue
    </Button>
  </div>
</div>
```

---

### Step 4: Your Profile (Combined)

**Component:** `CombinedProfileStep.svelte` (NEW COMPONENT)

**Purpose:** Combine archetype selection and productivity challenges into one cohesive experience

**File Location:** `/apps/web/src/lib/components/onboarding-v2/CombinedProfileStep.svelte`

#### **Design Approach: Two Sections in One View**

**Section 1: How You Work (Archetype)**

**Title:** "How do you want to use BuildOS?"

**Content:**

- Reuse archetype cards from `ArchetypeStep.svelte`
- 3 options: Second Brain, AI Task Manager, Project To-Do List
- Visual: Cards with icons and features

**Section 2: What Challenges You Face**

**Title:** "What challenges are you tackling?"

**Content:**

- Reuse challenge selection from `ChallengesStep.svelte`
- Multi-select checkboxes
- 7 challenge options (time management, focus/ADHD, context switching, planning, accountability, information overload, overwhelm)

#### **Layout Strategy**

```
┌─────────────────────────────────────────────────────────┐
│  Step 4: Tell Us About Your Workflow                   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ How do you want to use BuildOS?                │   │
│  │                                                 │   │
│  │  [Card 1]    [Card 2]    [Card 3]             │   │
│  │  Second      AI Task      Project              │   │
│  │  Brain       Manager      To-Do List           │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ What challenges are you tackling?              │   │
│  │                                                 │   │
│  │  ☐ Time management                             │   │
│  │  ☐ Focus/ADHD                                  │   │
│  │  ☐ Context switching                           │   │
│  │  ☐ Planning                                    │   │
│  │  ☐ Accountability                              │   │
│  │  ☐ Information overload                        │   │
│  │  ☐ Overwhelm                                   │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│                              [Continue]                 │
└─────────────────────────────────────────────────────────┘
```

#### **Validation Logic**

```typescript
// Must select archetype (required)
let selectedArchetype = $state<string | null>(null);

// Challenges are optional but recommended (at least 1)
let selectedChallenges = $state<Set<string>>(new Set());

// Validate before continuing
const canContinue = $derived(selectedArchetype !== null);
```

#### **Component Structure**

```typescript
<script lang="ts">
  import { Brain, Bot, ListChecks, Sparkles } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
  import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
  import { toastService } from '$lib/stores/toast.store';

  interface Props {
    userId: string;
    onNext: () => void;
    onArchetypeSelected?: (archetype: string) => void;
    onChallengesSelected?: (challenges: string[]) => void;
  }

  let { userId, onNext, onArchetypeSelected, onChallengesSelected }: Props = $props();

  // State
  let selectedArchetype = $state<string | null>(null);
  let selectedChallenges = $state<Set<string>>(new Set());
  let isSaving = $state(false);

  const archetypes = ONBOARDING_V2_CONFIG.archetypes;
  const challenges = ONBOARDING_V2_CONFIG.challenges;

  // Validation
  const canContinue = $derived(selectedArchetype !== null);

  async function saveAndContinue() {
    if (!selectedArchetype) {
      toastService.error('Please select how you want to use BuildOS');
      return;
    }

    isSaving = true;

    try {
      // Save archetype
      await onboardingV2Service.saveArchetype(userId, selectedArchetype);

      // Save challenges if any selected
      if (selectedChallenges.size > 0) {
        const challengesArray = Array.from(selectedChallenges);
        await onboardingV2Service.saveChallenges(userId, challengesArray);

        if (onChallengesSelected) {
          onChallengesSelected(challengesArray);
        }
      }

      // Notify parent
      if (onArchetypeSelected) {
        onArchetypeSelected(selectedArchetype);
      }

      toastService.success('Profile saved!');
      onNext();
    } catch (error) {
      console.error('Failed to save profile:', error);
      toastService.error('Failed to save. Please try again.');
    } finally {
      isSaving = false;
    }
  }
</script>

<!-- Component markup here -->
```

---

### Step 5: Admin Tour ⭐ NEW

**Component:** `AdminTourStep.svelte` (NEW COMPONENT)

**Purpose:** Optional tour of other BuildOS features

**File Location:** `/apps/web/src/lib/components/onboarding-v2/AdminTourStep.svelte`

#### **Header**

```markdown
# Explore More (Optional)

Feel free to skip this—you can explore these features anytime. Here's a quick
tour of what else BuildOS offers.
```

**Prominent "Skip" button at the top**

#### **Section 1: Profile Page**

**Title:** "Your Profile & Settings"

**Content:**

- **Screenshot:** Profile page with tabs visible
- **Tab Overview:**
    - Work Profile - Your onboarding responses
    - Brief Settings - Daily brief timing and preferences
    - Calendar - Google Calendar connection and preferences
    - Notifications - Email/SMS notification settings
    - Account - Account management
    - Billing - Subscription (if applicable)
- **CTA:** "Explore Profile →" (link to `/profile`)

**Research Reference:** Based on findings from `/apps/web/src/routes/profile/+page.svelte`

#### **Section 2: History Page**

**Title:** "Track Your Journey"

**Content:**

- **Screenshot:** History page with contribution chart
- **Features:**
    - GitHub-style contribution chart showing braindump activity
    - View all past braindumps
    - See project history and changes over time
    - Search and filter your past work
- **CTA:** "View History →" (link to `/history`)

**Research Reference:** Based on findings from `/apps/web/src/routes/history/+page.svelte`

#### **Section 3: Project History**

**Title:** "See How Projects Evolve"

**Content:**

- **Screenshot:** Project history modal showing version comparison
- **Features:**
    - Version-by-version project changes
    - See what braindumps triggered updates
    - Track decision history
    - Review past project states
- **CTA:** "Learn More →" (link to docs or help)

**Research Reference:** Based on findings from `/apps/web/src/lib/components/project/ProjectHistoryModal.svelte`

#### **Layout Strategy**

```
┌─────────────────────────────────────────────────────────┐
│  Explore More Features (Feel Free to Skip)             │
│                                    [Skip Tour →]        │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ 1. Your Profile & Settings                     │   │
│  │                                                 │   │
│  │ [Screenshot of profile page]                   │   │
│  │                                                 │   │
│  │ • Work Profile                                 │   │
│  │ • Brief Settings                               │   │
│  │ • Calendar                                     │   │
│  │ • Notifications                                │   │
│  │                                                 │   │
│  │              [Explore Profile →]               │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ 2. History Page                                │   │
│  │                                                 │   │
│  │ [Screenshot of history page]                   │   │
│  │                                                 │   │
│  │ • Contribution chart                           │   │
│  │ • All past braindumps                          │   │
│  │ • Search and filter                            │   │
│  │                                                 │   │
│  │              [View History →]                  │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ 3. Project History                             │   │
│  │                                                 │   │
│  │ [Screenshot of project history modal]          │   │
│  │                                                 │   │
│  │ • Track project evolution                      │   │
│  │ • Version comparisons                          │   │
│  │ • Decision history                             │   │
│  │                                                 │   │
│  │              [Learn More →]                    │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  [Skip Tour]                    [Continue to Summary]  │
└─────────────────────────────────────────────────────────┘
```

#### **Component Structure**

```typescript
<script lang="ts">
  import { User, History, GitBranch, Info } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    onNext: () => void;
    onSkip?: () => void;
  }

  let { onNext, onSkip }: Props = $props();

  function handleSkip() {
    if (onSkip) {
      onSkip();
    } else {
      onNext();
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4">
  <!-- Header with prominent skip -->
  <div class="mb-8 text-center">
    <div class="flex justify-between items-start mb-4">
      <div class="flex-1"></div>
      <Button variant="ghost" on:click={handleSkip}>
        Skip Tour →
      </Button>
    </div>

    <div class="flex justify-center mb-6">
      <div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
        <Info class="w-8 h-8 text-gray-600 dark:text-gray-400" />
      </div>
    </div>

    <h2 class="text-3xl sm:text-4xl font-bold mb-3">
      Explore More (Optional)
    </h2>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      Feel free to skip this—you can explore these features anytime.
    </p>
  </div>

  <!-- Feature sections here -->

  <!-- Navigation -->
  <div class="flex justify-between mt-8">
    <Button variant="ghost" on:click={handleSkip}>
      Skip Tour
    </Button>
    <Button variant="primary" size="lg" on:click={onNext}>
      Continue to Summary
    </Button>
  </div>
</div>
```

---

### Step 6: Summary

**Component:** `SummaryStep.svelte` (MODIFIED)

**Changes Required:**

- Update summary cards to reflect new step structure
- Keep existing summary logic

**File Location:** `/apps/web/src/lib/components/onboarding-v2/SummaryStep.svelte`

**No major structural changes** - Just ensure the summary reflects data from all 6 steps

---

## Implementation Plan

### Phase 1: Config & Foundation (Day 1)

**Tasks:**

1. ✅ Update `onboarding.config.ts` with new step structure
2. ✅ Update step order constants
3. ✅ Add new step definitions
4. ✅ Update `ProgressIndicator.svelte` for 7 steps

**Files to Modify:**

- `/apps/web/src/lib/config/onboarding.config.ts`
- `/apps/web/src/lib/components/onboarding-v2/ProgressIndicator.svelte`

### Phase 2: Modify Existing Components (Day 2)

**Tasks:**

1. ✅ Update `WelcomeStep.svelte` - Add flexibility pillar
2. ✅ Update `ProjectsCaptureStep.svelte` - Rename to "Clarity"
3. ✅ Update `NotificationsStep.svelte` - Rename to "Focus"
4. ✅ Update `SummaryStep.svelte` - Reflect new steps

**Files to Modify:**

- `/apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte`
- `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`
- `/apps/web/src/lib/components/onboarding-v2/SummaryStep.svelte`

### Phase 3: Create New Components (Days 3-5)

**Day 3: FlexibilityStep**

1. ✅ Create `FlexibilityStep.svelte`
2. ✅ Implement section tabs
3. ✅ Add braindump flexibility section
4. ✅ Add phase flexibility section
5. ✅ Add calendar flexibility section
6. ✅ Add screenshots/placeholders

**Day 4: CombinedProfileStep**

1. ✅ Create `CombinedProfileStep.svelte`
2. ✅ Merge archetype selection UI
3. ✅ Merge challenges selection UI
4. ✅ Implement combined save logic
5. ✅ Add validation

**Day 5: AdminTourStep**

1. ✅ Create `AdminTourStep.svelte`
2. ✅ Add profile section
3. ✅ Add history section
4. ✅ Add project history section
5. ✅ Add skip functionality
6. ✅ Add screenshots/placeholders

**Files to Create:**

- `/apps/web/src/lib/components/onboarding-v2/FlexibilityStep.svelte`
- `/apps/web/src/lib/components/onboarding-v2/CombinedProfileStep.svelte`
- `/apps/web/src/lib/components/onboarding-v2/AdminTourStep.svelte`

### Phase 4: Integration & Testing (Day 6)

**Tasks:**

1. ✅ Update route handler in `/routes/onboarding/+page.svelte`
2. ✅ Wire up all new components
3. ✅ Update step navigation logic
4. ✅ Test complete flow
5. ✅ Update onboarding service if needed

**Files to Modify:**

- `/apps/web/src/routes/onboarding/+page.svelte`
- `/apps/web/src/lib/services/onboarding-v2.service.ts` (if needed)

### Phase 5: Assets & Polish (Day 7)

**Tasks:**

1. ✅ Add screenshots for flexibility step
2. ✅ Add screenshots for admin tour
3. ✅ Polish transitions and animations
4. ✅ Test on mobile
5. ✅ Final QA

---

## UI/UX Considerations

### Visual Consistency

**Colors:**

- Clarity (Step 1): Purple gradient (keep existing)
- Focus (Step 2): Green/Blue gradient (keep existing)
- Flexibility (Step 3): Orange/Amber gradient ⭐ NEW
- Profile (Step 4): Purple/Pink gradient (from existing archetype)
- Admin Tour (Step 5): Gray gradient (neutral) ⭐ NEW
- Summary (Step 6): Green gradient (keep existing)

### Icons

- Clarity: Rocket (existing)
- Focus: CheckCircle2 (existing)
- Flexibility: RefreshCw or Sparkles ⭐ NEW
- Profile: Brain + Target (combined)
- Admin Tour: Info or Settings ⭐ NEW
- Summary: CheckCircle (existing)

### Transitions

- Use `fade` and `scale` transitions between steps
- Use `slide` for section changes within FlexibilityStep
- Keep existing animation patterns

### Mobile Responsiveness

- Ensure flexibility step tabs work on mobile (stack vertically)
- Admin tour sections should be scrollable on mobile
- Combined profile step should stack archetype and challenges vertically on mobile

---

## Technical Considerations

### State Management

**Onboarding Data State:**

```typescript
let v2OnboardingData = $state({
	projectsCreated: 0,
	calendarAnalyzed: false,
	smsEnabled: false,
	emailEnabled: false,
	archetype: '',
	challenges: [] as string[]
	// No new fields needed - existing structure works
});
```

### Service Layer

**OnboardingV2Service Methods:**

- ✅ `saveArchetype(userId, archetype)` - Existing
- ✅ `saveChallenges(userId, challenges)` - Existing
- ✅ `completeOnboarding(userId)` - Existing

**No new service methods required** - Flexibility and Admin Tour steps are informational only

### Configuration Updates

**onboarding.config.ts:**

```typescript
export const ONBOARDING_V2_CONFIG = {
	version: 2,

	// Updated step configuration
	steps: {
		welcome: {
			id: 'welcome',
			order: 0,
			skippable: false,
			title: 'Welcome'
		},
		clarity: {
			id: 'clarity',
			order: 1,
			skippable: false,
			title: 'Clarity'
		},
		focus: {
			id: 'focus',
			order: 2,
			skippable: true,
			title: 'Focus'
		},
		flexibility: {
			// NEW
			id: 'flexibility',
			order: 3,
			skippable: true,
			title: 'Flexibility'
		},
		profile: {
			// RENAMED from 'archetype'
			id: 'profile',
			order: 4,
			skippable: false,
			title: 'Your Profile'
		},
		admin_tour: {
			// NEW
			id: 'admin_tour',
			order: 5,
			skippable: true,
			title: 'Explore More'
		},
		summary: {
			id: 'summary',
			order: 6,
			skippable: false,
			title: 'Summary'
		}
	}

	// Keep existing archetypes, challenges, etc.
	// ...
};
```

### Route Handler Updates

**File:** `/apps/web/src/routes/onboarding/+page.svelte`

**Changes Required:**

```typescript
// Update step rendering (lines 485-525)
{#if v2CurrentStep === 0}
  <WelcomeStep onStart={handleV2Next} />
{:else if v2CurrentStep === 1}
  <ProjectsCaptureStep  // Now "Clarity"
    userContext={data.userContext}
    onNext={handleV2Next}
    onProjectsCreated={handleV2ProjectsCreated}
  />
{:else if v2CurrentStep === 2}
  <NotificationsStep  // Now "Focus"
    userId={data.user.id}
    onNext={handleV2Next}
    onSMSEnabled={handleV2SMSEnabled}
    onEmailEnabled={handleV2EmailEnabled}
  />
{:else if v2CurrentStep === 3}
  <FlexibilityStep  // NEW
    onNext={handleV2Next}
  />
{:else if v2CurrentStep === 4}
  <CombinedProfileStep  // NEW (merged archetype + challenges)
    userId={data.user.id}
    onNext={handleV2Next}
    onArchetypeSelected={handleV2ArchetypeSelected}
    onChallengesSelected={handleV2ChallengesSelected}
  />
{:else if v2CurrentStep === 5}
  <AdminTourStep  // NEW
    onNext={handleV2Next}
    onSkip={handleV2Next}
  />
{:else if v2CurrentStep === 6}
  <SummaryStep
    userId={data.user.id}
    summary={v2OnboardingData}
  />
{/if}
```

**Progress Indicator Update:**

```typescript
<!-- Progress Indicator (show for steps 1-5, not welcome or summary) -->
{#if v2CurrentStep > 0 && v2CurrentStep < 6}
  <ProgressIndicator currentStep={v2CurrentStep} onStepClick={handleV2StepClick} />
{/if}
```

---

## Assets Required

### Screenshots Needed

#### For FlexibilityStep:

1. **Braindump Flexibility**
    - `braindump-update-task.png` - Screenshot showing braindump updating a task
    - `braindump-reschedule.png` - Screenshot showing braindump rescheduling tasks

2. **Phase Flexibility**
    - `phase-generation-modal.png` - Phase generation confirmation modal
    - `phase-regeneration-before-after.png` - Before/after view of regeneration
    - `phase-scheduling.png` - Phase scheduling with AI suggestions

3. **Calendar Flexibility**
    - `task-schedule-unschedule.png` - Task detail showing schedule/unschedule
    - `timeblock-creation.png` - Timeblock creation modal
    - `timeblock-with-suggestions.png` - Calendar view with timeblock and AI suggestions

#### For AdminTourStep:

1. **Profile Section**
    - `profile-page-overview.png` - Profile page showing all tabs

2. **History Section**
    - `history-page-contribution-chart.png` - History page with contribution chart

3. **Project History Section**
    - `project-history-modal.png` - Project history modal showing version comparison

### Placeholder Strategy

Until real screenshots are available:

1. Use colored placeholder boxes with descriptive text
2. Use Lucide icons to represent features
3. Use the existing `ONBOARDING_V2_CONFIG.features.showPlaceholderAssets` flag

**Example Placeholder:**

```svelte
{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
	<div
		class="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
	>
		<RefreshCw class="w-12 h-12 text-gray-400 mx-auto mb-4" />
		<p class="text-gray-500 text-sm">[Screenshot: Phase regeneration before/after]</p>
	</div>
{:else}
	<img
		src="/onboarding-assets/screenshots/phase-regeneration-before-after.png"
		alt="Phase regeneration"
		class="rounded-lg shadow-lg"
	/>
{/if}
```

---

## Migration Notes

### For Existing Users

Users who have already completed onboarding v2 should:

- **Not** see the new onboarding flow again
- Have their archetype and challenges data preserved
- Be able to explore new features through the app

### Data Migration

**No database migrations required** - New steps don't introduce new data fields

### Backwards Compatibility

The new flow is backwards compatible with existing onboarding data:

- Archetype and challenges are still stored the same way
- Summary step can handle missing data gracefully
- Flexibility and Admin Tour steps are informational only

---

## Success Metrics

### Completion Rates

- Track completion rate for each step
- Monitor skip rate for optional steps (Focus, Flexibility, Admin Tour)
- Compare overall completion rate vs current v2

### Time to Complete

- Target: Under 10 minutes for full flow
- Target: Under 5 minutes for fast path (skipping optional steps)

### Feature Discovery

- Track how many users click CTAs in Admin Tour step
- Track how many users revisit Profile/History after onboarding

### User Feedback

- Add optional feedback at end of onboarding
- Track NPS or satisfaction score

---

## Open Questions

1. **FlexibilityStep Interactivity:**
    - Should we allow users to try creating a phase or timeblock during onboarding?
    - Or keep it purely informational with screenshots/demos?
    - **Recommendation:** Start with informational, add interactivity in v2.1

2. **AdminTourStep Optional:**
    - Should we make this step completely optional (show "Skip" button prominently)?
    - **Recommendation:** Yes, show prominent "Skip Tour" button at top and bottom

3. **Combined Profile Order:**
    - Should archetype come before or after challenges?
    - **Recommendation:** Archetype first (how you work), then challenges (what you struggle with)

4. **Asset Priority:**
    - Which screenshots are highest priority?
    - **Recommendation:**
        1. Phase generation modal (most important for flexibility step)
        2. Timeblock with suggestions
        3. Profile page overview
        4. Rest can use placeholders initially

---

## Implementation Checklist

### Configuration

- [ ] Update `onboarding.config.ts` with new steps
- [ ] Add new step colors and icons

### Existing Components

- [ ] Modify `WelcomeStep.svelte` - Add flexibility pillar
- [ ] Rename `ProjectsCaptureStep` to "Clarity"
- [ ] Rename `NotificationsStep` to "Focus"
- [ ] Update `SummaryStep.svelte` for new structure
- [ ] Update `ProgressIndicator.svelte` for 7 steps

### New Components

- [ ] Create `FlexibilityStep.svelte`
    - [ ] Braindump flexibility section
    - [ ] Phase flexibility section
    - [ ] Calendar flexibility section
    - [ ] Section tabs/navigation
- [ ] Create `CombinedProfileStep.svelte`
    - [ ] Merge archetype UI
    - [ ] Merge challenges UI
    - [ ] Combined save logic
- [ ] Create `AdminTourStep.svelte`
    - [ ] Profile section
    - [ ] History section
    - [ ] Project history section
    - [ ] Skip functionality

### Route Integration

- [ ] Update `/routes/onboarding/+page.svelte`
    - [ ] Add new step rendering
    - [ ] Update progress indicator logic
    - [ ] Test navigation flow

### Assets

- [ ] Add screenshots or placeholders for FlexibilityStep
- [ ] Add screenshots or placeholders for AdminTourStep
- [ ] Update asset paths in config

### Testing

- [ ] Test complete flow on desktop
- [ ] Test complete flow on mobile
- [ ] Test skip functionality
- [ ] Test data persistence
- [ ] Test backwards compatibility

### Documentation

- [ ] Update onboarding documentation
- [ ] Update component README if exists
- [ ] Add migration notes

---

## Appendix: Research References

This specification was built using comprehensive research of the BuildOS codebase. Key research findings:

### Phase Management

- **Phase generation:** `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`
- **Phase scheduling:** `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`
- **Phase orchestrator:** `/apps/web/src/lib/services/phase-generation/orchestrator.ts`
- **UI components:** `/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte`

### Calendar Integration

- **Task scheduling:** `/apps/web/src/lib/services/calendar-service.ts` (Lines 631-779)
- **Timeblocks:** `/apps/web/src/routes/api/time-blocks/create/+server.ts`
- **Timeblock UI:** `/apps/web/src/lib/components/time-blocks/TimeBlockCreateModal.svelte`
- **Calendar analysis:** `/apps/web/src/lib/services/calendar-analysis.service.ts`

### Profile & History

- **Profile page:** `/apps/web/src/routes/profile/+page.svelte`
- **History page:** `/apps/web/src/routes/history/+page.svelte`
- **Project history:** `/apps/web/src/lib/components/project/ProjectHistoryModal.svelte`

### Braindump Flexibility

- **Task updates:** `/apps/web/src/lib/utils/braindump-processor.ts` (Lines 1286-1421)
- **Task rescheduling:** `/apps/web/src/lib/utils/braindump-processor.ts` (Lines 924-984)
- **Existing project processing:** `/apps/web/src/lib/utils/braindump-processor.ts` (Lines 1423-1631)

---

**END OF SPECIFICATION**
