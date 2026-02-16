<!-- docs/specs/ONBOARDING_BEHAVIORAL_SEED_SPEC.md -->

# Onboarding as Behavioral Profile Seed

> **Status:** Phase 2 Implemented (V3 Flow)
> **Author:** DJ + Claude
> **Date:** 2026-02-12
> **Companion to:** `USER_BEHAVIORAL_PROFILE_SPEC.md`
> **Goal:** Redesign onboarding to serve two purposes: (1) teach the user how to use BuildOS, and (2) seed the behavioral profile with the right starting data — without asking questions the user will answer wrong.

---

## 1. Analysis of Current Onboarding Flows

### 1.1 V1 (Legacy): 4 Steps, All Free-Text

| Step                | Question                                  | Data Quality                                                    |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| 1. Current projects | "Tell me about your current projects..."  | **Good** — reveals scope, ambition, domain                      |
| 2. Work style       | "Describe your work habits..."            | **Questionable** — self-reported, often aspirational not actual |
| 3. Challenges       | "What challenges are you facing..."       | **Good** — reveals pain points, sets expectations               |
| 4. Focus areas      | "What do you want BuildOS to focus on..." | **Moderate** — useful for initial framing but vague             |

**Verdict:** V1 asks for too much text too early. The free-form inputs are rich but most users will either write very little or write aspirational descriptions of who they wish they were, not how they actually work.

### 1.2 V2 (Current): 8 Steps, Mixed

| Step                | Component           | Collects Data? | Value Assessment                                                                                         |
| ------------------- | ------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| 0. Welcome          | WelcomeStep         | No             | **Low** — nice but delays getting to value                                                               |
| 1. Capabilities     | CapabilitiesStep    | No             | **Low** — lecture format, users skim or skip                                                             |
| 2. Projects capture | ProjectsCaptureStep | **Yes**        | **High** — creates real projects via brain dump                                                          |
| 3. Notifications    | NotificationsStep   | **Yes**        | **Medium** — SMS/email prefs, useful but not behavioral                                                  |
| 4. Flexibility      | FlexibilityStep     | No             | **Low** — feature showcase, users don't absorb this yet                                                  |
| 5. Preferences      | PreferencesStep     | **Yes**        | **Questionable** — self-reported communication style is exactly what the behavioral profile should infer |
| 6. Profile          | CombinedProfileStep | **Yes**        | **Mixed** — archetype is useful, challenges are useful, but both are self-reported                       |
| 7. Admin tour       | AdminTourStep       | No             | **Low** — optional tour, most will skip                                                                  |
| 8. Summary          | SummaryStep         | No             | **Low** — review screen                                                                                  |

**Verdict:** V2 has 8 steps but only 4 collect data. Half the onboarding is education that the user hasn't earned context for yet — they don't know what BuildOS does, so explaining "flexible scheduling" means nothing. The brain dump step (Step 2) is by far the most valuable because it creates _real artifacts_ the system can work with.

### 1.3 The Core Problems

**Problem 1: Too much education, not enough doing.**
Steps 0, 1, 4, and 7 are lectures. Users learn by doing, not by reading feature lists. A user who has never used BuildOS cannot meaningfully process "flexible scheduling with Google Calendar" — they need to experience it.

**Problem 2: Self-reported preferences are unreliable.**
Step 5 asks for communication*style (direct/supportive/socratic) and proactivity_level (minimal/moderate/high). These are \_exactly* the things the behavioral profile system (§11 of the companion spec) is designed to infer from actual behavior. Asking users to self-report these:

- Creates expectations that may not match reality ("I said direct, why is it being so terse?")
- Gives the system false confidence in preferences that haven't been validated
- Wastes a precious onboarding question on something we'll learn ourselves within 10 sessions

**Problem 3: No stakes/context signal.**
Neither V1 nor V2 asks the question that matters most for the behavioral profile: _What's at stake?_ Is this person using BuildOS for fun side projects or for income-generating client work? This single factor changes everything about how the agent should behave (see §3.3 of companion spec).

**Problem 4: The brain dump step is perfect but buried.**
Step 2 (brain dump) is the single most valuable onboarding action because it creates real data. But it's after a welcome screen and a capabilities lecture. By the time users reach it, some have already mentally checked out.

---

## 2. Design Principles for Onboarding-as-Seed

### Principle 1: Ask Questions That Behavior Can't Reveal

The behavioral profile system will eventually learn how users actually interact. Onboarding should only ask questions that _behavior alone can't answer_:

| Can behavior reveal this?         | Question type                             | Onboarding should...                                   |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| **No** — Context about their life | What are you working on? What's at stake? | **Ask this**                                           |
| **No** — Why they came to BuildOS | What problem brought you here?            | **Ask this**                                           |
| **Eventually, yes** — but slowly  | How do they prefer to communicate?        | **Don't ask** — seed with neutral defaults, learn fast |
| **Yes** — within 3-5 sessions     | Do they prefer short or long responses?   | **Don't ask** — the profile will figure this out       |
| **No** — Internal motivation      | Is this tied to their income?             | **Ask this** (carefully)                               |

### Principle 2: Create Real Data, Not Preferences

The most valuable onboarding action is the brain dump — it creates actual projects, tasks, and goals. Every minute spent on preference-setting is a minute _not_ spent creating the data that makes BuildOS useful. Optimize for getting the user to their first real project as fast as possible.

### Principle 3: Teach by Doing, Not by Telling

Instead of explaining features, let the user encounter them naturally. "Flexible scheduling" means nothing until you've created a project and tried to schedule a task. Front-load the doing, back-load the education.

### Principle 4: The Onboarding IS the First Behavioral Data

Everything the user does during onboarding is already behavioral data:

- How long did they spend on each step?
- Did they use voice or text for the brain dump?
- How much detail did they provide?
- Did they skip optional steps?
- How quickly did they move through the flow?

This data should be captured as the user's first session analytics, seeding the behavioral profile before they ever open the chat.

---

## 3. Proposed Onboarding Flow (V3)

### Flow Overview: 4 Meaningful Steps

Strip the flow to only steps that either create value or gather irreplaceable context. Everything else gets cut or moved to progressive discovery.

```
Step 1: What Brings You Here?          (Context seed — 30 seconds)
Step 2: Brain Dump                      (Value creation — 2-5 minutes)
Step 3: Notifications                   (Practical setup — 30 seconds)
Step 4: You're Ready                    (Launch — 10 seconds)
```

Total time: **3-6 minutes** (down from 8-15 minutes in V2).

### Step 1: What Brings You Here?

**Purpose:** Seed the behavioral profile with context that behavior alone can't reveal. This replaces V2's Steps 5 (Preferences) and 6 (Profile) with fewer, better questions.

**What we ask (2 questions):**

#### Question A: "What brings you to BuildOS?"

Single-select archetype, rephrased as intent:

| Option | Label                                              | What It Seeds                                                                                                      |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1      | **"I have projects I need to get organized"**      | `intent: organize`, likely has existing work, wants structure. Seed: action_orientation high, session_style bursty |
| 2      | **"I have goals but I'm not sure where to start"** | `intent: plan`, needs guidance, exploring. Seed: intent_clarity exploratory, information_appetite medium-high      |
| 3      | **"I'm overwhelmed and need to get unstuck"**      | `intent: unstuck`, high anxiety, needs simplification. Seed: overwhelm_threshold low, engagement_momentum low      |
| 4      | **"I just want to try it out"**                    | `intent: explore`, no commitment, browsing. Seed: all defaults, lifecycle_stage firmly onboarding                  |

This question does triple duty:

1. **Frames the brain dump** (Step 2) — we can tailor the prompt: "Tell us about the projects you need organized" vs "Describe what's on your plate that feels overwhelming"
2. **Seeds the behavioral profile** — each intent maps to different default dimensions
3. **Sets user expectations** — "I'm overwhelmed" users get a gentler, simpler experience from the start

#### Question B: "How important is this to you?"

This is the stakes question, asked simply:

| Option | Label                                                 | What It Seeds                                                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| 1      | **"This is for work or clients — it matters a lot"**  | `stakes_level: high`. Agent: precise, careful, proactive about deadlines |
| 2      | **"It's important to me personally"**                 | `stakes_level: medium`. Agent: supportive, encouraging                   |
| 3      | **"It's casual — side projects, hobbies, exploring"** | `stakes_level: low`. Agent: relaxed, low pressure                        |

**Why these questions and not the V2 questions:**

| V2 asked                                         | Why we're dropping it                                                                                 | How we get this info instead                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Communication style (direct/supportive/socratic) | Users choose aspirationally. Someone who picks "direct" might actually need supportive.               | Behavioral profile infers from engagement patterns within 10 sessions                               |
| Proactivity level (minimal/moderate/high)        | Same problem. Also, proactivity should vary by context (high for income-tied, low for hobby).         | Profile infers from tool confirmation rate + follow-through patterns                                |
| Primary role                                     | Useful but not urgent. Can be asked later or inferred from project types.                             | Ask in settings, or infer from brain dump content                                                   |
| Domain context                                   | Same — useful but not worth an onboarding question.                                                   | Infer from project `type_key` realm after brain dump processing                                     |
| Productivity challenges (7 options)              | Self-reported challenges are often wrong or incomplete. Users don't always know what's blocking them. | Detect from session failure patterns (§4.3 of companion spec). Much more accurate than self-report. |

**What we keep from V2:**

- The usage archetype concept (renamed as "intent") — but simplified from 3 abstract options to 4 concrete situations
- The stakes concept — new, addresses a gap in V2

### Step 2: Brain Dump (Keep, Improve)

This is V2's Step 2, which is already excellent. Changes:

1. **Tailor the prompt based on Step 1 answer:**
    - "organize" → "Tell us about the projects you're working on. What needs to get organized?"
    - "plan" → "What are you trying to accomplish? Describe your goals, even if they're vague."
    - "unstuck" → "What's on your plate right now? Just dump everything — we'll help sort it out."
    - "explore" → "Got anything you're working on? If not, no worries — you can always brain dump later."

2. **Make it skippable for "explore" users** — don't force data creation for someone who's just browsing.

3. **Track onboarding brain dump metadata:**
    - Time spent composing
    - Used voice or text
    - Word count
    - Number of projects/tasks extracted

    This becomes the first entry in `chat_session_events` with `event_type: 'onboarding_braindump'`.

### Step 3: Notifications (Keep, Simplify)

V2's Step 3, simplified:

- Single screen: "Want daily check-ins?" with email and SMS toggles
- Phone verification if SMS selected
- Skip button prominent
- No separate brief timing configuration (default to 9am, let them change later)

### Step 4: You're Ready

Replace V2's Summary (Step 8) + Welcome (Step 0) + Tour (Step 7) with a single screen:

```
You're set up! Here's what we created:

[3 projects] [12 tasks] [2 goals]

What to do next:
→ Open a project to see your tasks
→ Chat with BuildOS to update anything
→ Check your daily brief tomorrow morning

[Go to Dashboard]
```

No feature tour. No philosophy lecture. The user will discover features by using them. If they need help, the chat agent (informed by their behavioral profile) will guide them.

### What Happens to the Cut Steps

| V2 Step              | What Happens to It                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Step 0: Welcome      | **Cut.** The welcome IS the first question. No need for a separate landing page.                                               |
| Step 1: Capabilities | **Cut.** Move to progressive disclosure — show tooltips/hints as users encounter features naturally.                           |
| Step 4: Flexibility  | **Cut.** Move to progressive disclosure. The chat agent can explain features when relevant.                                    |
| Step 5: Preferences  | **Replaced** by Question B (stakes) in Step 1. Communication style and proactivity will be inferred by the behavioral profile. |
| Step 6: Profile      | **Replaced** by Question A (intent) in Step 1. Challenges will be detected from actual behavior.                               |
| Step 7: Admin Tour   | **Cut.** Move to an optional "Tour BuildOS" button in settings or a help menu item.                                            |
| Step 8: Summary      | **Merged** into Step 4 (You're Ready) as a lightweight summary.                                                                |

---

## 4. How Onboarding Seeds the Behavioral Profile

### 4.1 Profile Initialization from Onboarding

When the user completes onboarding, we create their initial `user_behavioral_profiles` record. The clean slate (§11 of companion spec) gets adjusted based on onboarding signals:

```typescript
function seedProfileFromOnboarding(onboardingData: {
	intent: 'organize' | 'plan' | 'unstuck' | 'explore';
	stakes: 'high' | 'medium' | 'low';
	braindumpCompleted: boolean;
	braindumpWordCount: number;
	braindumpUsedVoice: boolean;
	projectsCreated: number;
	tasksCreated: number;
	timeSpentSeconds: number;
	stepsSkipped: string[];
	notificationsEnabled: boolean;
}): Partial<UserBehavioralProfile> {
	// Start from clean slate
	const profile = { ...CLEAN_SLATE_PROFILE };

	// --- Seed from intent ---
	switch (onboardingData.intent) {
		case 'organize':
			// Has existing work, wants structure — likely action-oriented
			profile.dimensions.action_orientation = 0.6;
			profile.dimensions.intent_clarity = 'explicit';
			profile.dimensions.session_style = 'bursty';
			break;

		case 'plan':
			// Needs guidance — higher information appetite
			profile.dimensions.information_appetite = 0.6;
			profile.dimensions.intent_clarity = 'exploratory';
			profile.dimensions.preferred_interaction_depth = 'moderate';
			break;

		case 'unstuck':
			// Overwhelmed — lower threshold, need simplification
			profile.dimensions.overwhelm_threshold = 'low';
			profile.dimensions.engagement_momentum = 0.3;
			profile.dimensions.preferred_interaction_depth = 'shallow';
			// Agent should be extra careful not to overload
			break;

		case 'explore':
			// Just browsing — all defaults, no strong signals
			break;
	}

	// --- Seed from stakes ---
	profile.context.stakes_level = onboardingData.stakes;

	if (onboardingData.stakes === 'high') {
		// Income-tied: conservative autonomy (confirm before acting)
		profile.dimensions.autonomy_comfort = 0.2;
	} else if (onboardingData.stakes === 'low') {
		// Casual: higher autonomy is fine
		profile.dimensions.autonomy_comfort = 0.5;
	}

	// --- Seed from brain dump behavior ---
	if (onboardingData.braindumpCompleted) {
		if (onboardingData.braindumpWordCount > 200) {
			// Verbose brain dump = higher information appetite
			profile.dimensions.information_appetite = Math.max(
				profile.dimensions.information_appetite,
				0.6
			);
		} else if (onboardingData.braindumpWordCount < 50) {
			// Terse brain dump = prefers brevity
			profile.dimensions.information_appetite = Math.min(
				profile.dimensions.information_appetite,
				0.3
			);
		}
	}

	// --- Seed from onboarding behavior (meta-signals) ---
	if (onboardingData.timeSpentSeconds < 120) {
		// Rushed through onboarding — likely wants efficiency
		profile.dimensions.action_orientation = Math.max(
			profile.dimensions.action_orientation,
			0.6
		);
		profile.dimensions.session_style = 'bursty';
	} else if (onboardingData.timeSpentSeconds > 600) {
		// Took their time — likely deliberate
		profile.dimensions.session_style = 'deep';
	}

	if (onboardingData.stepsSkipped.length > 0) {
		// Skipped steps = lower patience for non-essential content
		profile.dimensions.overwhelm_threshold =
			profile.dimensions.overwhelm_threshold === 'medium'
				? 'low'
				: profile.dimensions.overwhelm_threshold;
	}

	// --- Seed project complexity ---
	if (onboardingData.projectsCreated > 0) {
		// Has real projects — lifecycle stage can advance faster
		profile.context.active_project_count = onboardingData.projectsCreated;
	}

	// Set confidence — we have some signal but it's all from onboarding
	profile.confidence = 0.1;

	return profile;
}
```

### 4.2 Onboarding Events as First Session Data

The onboarding flow itself should be tracked as the user's "Session 0" in the analytics system:

```typescript
// Events emitted during onboarding (→ chat_session_events)
const onboardingEvents = [
	{ event_type: 'session_start', payload: { source: 'onboarding' } },
	{ event_type: 'onboarding_step_completed', payload: { step: 'intent', answer: 'organize' } },
	{ event_type: 'onboarding_step_completed', payload: { step: 'stakes', answer: 'high' } },
	{
		event_type: 'onboarding_braindump',
		payload: {
			word_count: 156,
			used_voice: false,
			time_seconds: 180,
			projects_created: 3,
			tasks_created: 8
		}
	},
	{ event_type: 'onboarding_step_skipped', payload: { step: 'notifications' } },
	{ event_type: 'session_end', payload: { source: 'onboarding', duration_seconds: 240 } }
];
```

This means the behavioral profile system already has data before the user's first chat session.

### 4.3 First Chat Session: The Profile in Action

When the user opens the chat for the first time after onboarding, the agent gets their seeded profile. The agent instructions will look something like:

**For an "organize" + "high stakes" user:**

```
## User Profile: New User (Just Onboarded)

This user came to BuildOS to organize existing work. This is tied to their
income/career — treat it with care.

They created 3 projects during onboarding with 8 tasks total, suggesting
they're action-oriented and have concrete work to manage.

Guidelines:
- They're new to BuildOS — be helpful but don't over-explain.
- Start by asking which project they want to focus on.
- Be precise and confirm before making changes — the stakes are high.
- Keep responses concise until we learn their preferred depth.
- This is their first chat — make it productive so they come back.

Note: This profile is based on onboarding signals only (confidence: 0.1).
It will be refined after 10 sessions.
```

**For an "unstuck" + "medium stakes" user:**

```
## User Profile: New User (Just Onboarded)

This user is feeling overwhelmed and came to BuildOS to get unstuck.

They wrote a short brain dump (47 words) which suggests they may be
struggling to articulate what they need. That's okay — meet them where
they are.

Guidelines:
- Keep it simple. One thing at a time.
- Don't present multi-step plans — offer single actions.
- Ask "What's the most important thing on your plate right now?"
- Be encouraging. Small wins matter.
- If they go quiet, simplify further. Don't add more information.
- Avoid overwhelming with options — make recommendations.

Note: This profile has low overwhelm_threshold set from onboarding.
Will be validated and refined over the next 10 sessions.
```

---

## 5. Progressive Discovery (Replaces Cut Steps)

The educational content from V2's cut steps doesn't disappear — it moves to contextual moments where it's actually useful.

### 5.1 Feature Introduction Triggers

| Feature                 | When to Introduce                              | How                                                                                                                   |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Flexible scheduling** | First time user creates a task with a due date | Chat tooltip: "You can also schedule this on your calendar. Want me to show you?"                                     |
| **Calendar sync**       | First time user mentions a meeting or deadline | Agent: "I noticed you mentioned a deadline. Want to connect your Google Calendar so I can help manage your schedule?" |
| **Daily briefs**        | After 3rd session (if not already enabled)     | In-app notification: "You've been using BuildOS for a few days. Want a morning summary of what's ahead?"              |
| **Brain dump updates**  | First time user returns to an existing project | Agent: "You can update this project with a quick brain dump anytime. Just tell me what's changed."                    |
| **Project phases**      | When a project hits 8+ tasks                   | Agent: "This project is growing! Want me to organize these tasks into phases?"                                        |
| **Voice input**         | If user types 3+ long messages in a row        | Agent: "Heads up — you can also speak your brain dumps. Sometimes it's easier to talk it out."                        |

### 5.2 Onboarding Checklist (Ambient)

Instead of a tour, show a subtle checklist in the sidebar that tracks first-time actions:

```
Getting Started (3/6)
✅ Created your first project
✅ Completed a brain dump
✅ Had your first chat
○ Connected Google Calendar
○ Enabled daily briefs
○ Completed a task
```

This gives the user a sense of progress without forcing them through a tutorial. Items appear as they become relevant and disappear once complete.

---

## 6. Handling the Say/Do Gap

The core insight: **what users say they want and what actually helps them are often different.** The onboarding must be designed with this gap in mind.

### 6.1 What We Don't Ask (and Why)

| Question NOT asked                                  | Why not                                                                                                            | How we learn it instead                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "Do you prefer direct or supportive communication?" | Users pick what sounds good, not what works. Someone who picks "direct" may feel hurt by terse responses.          | Observe: do they engage more with concise or detailed messages? Track follow-through by agent response style.                                |
| "How proactive should the AI be?"                   | Users say "high" but then ignore proactive suggestions. Or say "minimal" but feel abandoned.                       | Observe: do they act on unsolicited insights? Do they ask follow-up questions?                                                               |
| "What are your productivity challenges?"            | Users report surface symptoms, not root causes. "Time management" could mean 10 different things.                  | Detect: session failure patterns reveal actual challenges. Abandon patterns, idle gaps, and drift triggers are more honest than self-report. |
| "How do you prefer to work?"                        | Aspirational answers. "I'm a morning person who does deep work" from someone who exclusively uses BuildOS at 11pm. | Observe: time pattern analysis reveals actual work patterns within 2 weeks.                                                                  |

### 6.2 What We DO Ask (and Why It's Different)

The two onboarding questions are deliberately chosen because they capture context that behavior _cannot_ reveal:

| Question                                 | Why behavior can't reveal this                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What brings you to BuildOS?" (intent)   | A user's _reason for being here_ is internal motivation. We can observe what they do, but not why they came. This answer frames everything.                                                                                                     |
| "How important is this to you?" (stakes) | Stakes are about the user's external reality — are they risking income, reputation, personal goals? We can infer some stakes from project types, but a "personal" project could be a life-changing goal or a casual hobby. Only the user knows. |

### 6.3 The Validation Loop

Even these two questions will sometimes be answered inaccurately. The behavioral profile should validate and adjust:

| Onboarding answer                                   | Contradictory behavior                                 | Profile adjustment                                                     |
| --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| "I need to get organized" (action-oriented)         | First 5 sessions are all exploratory, no tasks created | Lower action_orientation, shift intent_clarity to "exploratory"        |
| "This is for work — it matters a lot" (high stakes) | No projects with deadlines, casual usage pattern       | Gradually lower stakes_level to "medium" after 20 sessions             |
| "I'm overwhelmed" (low overwhelm threshold)         | User handles complex multi-step plans easily           | Raise overwhelm_threshold to "medium"                                  |
| "Just trying it out" (explorer)                     | Immediately creates 5 projects with detailed tasks     | Reclassify as action-oriented, accelerate to "ramping" lifecycle stage |

This is why the companion spec's confidence-based blending (§11.4) starts at 0.1 — we barely trust the onboarding signals and let observed behavior take over quickly.

---

## 7. Migration Path

### 7.1 Existing Users (Already Onboarded)

Users who completed V1 or V2 onboarding already have data we can use:

| Existing Data                  | How to Use for Profile Seed                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| V1 `input_projects`            | Run through LLM to extract project count, complexity, stakes signals                                |
| V1 `input_challenges`          | Map to intent (organize/plan/unstuck/explore)                                                       |
| V2 `usage_archetype`           | Map: "Second Brain" → plan, "AI Task Manager" → organize, "Project To-Do List" → organize           |
| V2 `productivity_challenges`   | Use as initial failure_patterns hints (not as ground truth)                                         |
| V2 `communication_style`       | Keep as static preference (existing system). Let behavioral profile override with confidence >= 0.4 |
| V2 `proactivity_level`         | Same — keep as static preference, let profile override                                              |
| Existing `onto_projects`       | Compute project complexity, stakes, active count — seed profile context                             |
| Existing `agent_chat_sessions` | If user has chat history, compute initial session analytics retroactively                           |

### 7.2 Retroactive Profile Seeding

For active users who have significant chat history, we can bootstrap their behavioral profile immediately:

```typescript
async function retroactiveSeed(userId: string): Promise<void> {
	// 1. Check existing session count
	const sessionCount = await countChatSessions(userId);

	if (sessionCount >= 10) {
		// Enough data for a real analysis — queue it
		await queue.add('analyze_user_behavior', userId, {
			userId,
			triggerType: 'manual',
			triggerDetails: { reason: 'retroactive_seed' },
			analysisDepth: sessionCount >= 50 ? 'deep' : 'medium'
		});
	} else if (sessionCount > 0) {
		// Some data but not enough for full analysis
		// Seed from onboarding data + what we have
		const onboardingData = await loadOnboardingData(userId);
		const profile = seedProfileFromOnboarding(onboardingData);

		// Enhance with any available session signals
		const sessions = await loadBasicSessionMetrics(userId);
		if (sessions.length > 0) {
			profile.confidence = Math.min(sessions.length / 10, 0.3);
		}

		await saveProfile(userId, profile);
	}
	// sessionCount === 0: wait for first interaction
}
```

---

## 8. Data Model Additions

### 8.1 Onboarding Seed Data

The `user_behavioral_profiles` table (defined in companion spec §8.1) gains an `onboarding_seed` field:

```sql
ALTER TABLE user_behavioral_profiles
  ADD COLUMN onboarding_seed JSONB DEFAULT NULL;
```

This stores the raw onboarding signals that seeded the profile, so future analyses can reference what the user originally said:

```typescript
interface OnboardingSeed {
	intent: 'organize' | 'plan' | 'unstuck' | 'explore';
	stakes: 'high' | 'medium' | 'low';
	braindump_word_count: number;
	braindump_used_voice: boolean;
	projects_created: number;
	tasks_created: number;
	time_spent_seconds: number;
	steps_skipped: string[];
	notifications_enabled: boolean;
	completed_at: string; // ISO timestamp
	onboarding_version: 'v1' | 'v2' | 'v3';
}
```

### 8.2 Users Table Updates

```sql
-- New columns for V3 onboarding
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_intent TEXT
    CHECK (onboarding_intent IN ('organize', 'plan', 'unstuck', 'explore')),
  ADD COLUMN IF NOT EXISTS onboarding_stakes TEXT
    CHECK (onboarding_stakes IN ('high', 'medium', 'low'));
```

These are simple, permanent fields that the behavioral profile and agent context can always reference, even after the profile has been recomputed many times.

---

## 9. Implementation

### Phase 1: Profile Seeding (Can Ship Before V3 Onboarding)

This can be built on top of the _existing_ V2 onboarding without changing the flow:

- [x] Add `onboarding_seed` column to `user_behavioral_profiles`
- [x] Build `seedProfileFromOnboarding()` function
- [x] Call it when onboarding completes (via `completeOnboardingV3()` in server service)
- [ ] Capture onboarding timing + skip behavior as session events
- [ ] Map existing V2 data (archetype, challenges) to profile seeds
- [ ] Retroactive seeding for existing users with chat history

### Phase 2: V3 Onboarding Flow

- [x] Build new Step 1: "What Brings You Here?" (intent + stakes) — `IntentStakesStep.svelte`
- [x] Modify Step 2: Tailor brain dump prompt based on intent — `ProjectsCaptureStep.svelte` with `intent` prop
- [x] Simplify Step 3: Single-screen notifications — `NotificationsStepV3.svelte`
- [x] Build Step 4: "You're Ready" with project summary — `ReadyStep.svelte`
- [x] Remove Steps 0, 1, 4, 5, 6, 7 from flow — deleted 9 V2 components
- [x] Rewrite onboarding page: 835 lines → 147 lines, pure V3 4-step flow
- [x] Database migration: `onboarding_intent`, `onboarding_stakes` on users, `onboarding_seed` on profiles
- [x] Profile seeding on completion: dimensions from intent/stakes, agent instructions generated
- [ ] Move educational content to progressive discovery system
- [ ] Build ambient onboarding checklist component
- [ ] Feature introduction triggers (§5.1)

### Phase 3: Validation & Iteration

- [ ] Track onboarding-to-first-chat conversion rate
- [ ] Track onboarding completion rate (V3 vs V2)
- [ ] Track time-to-first-value (onboarding start → first project interaction)
- [ ] Measure say/do gap: compare onboarding answers to 30-day behavioral profile
- [ ] Iterate on questions based on which onboarding signals best predict actual behavior

---

## 10. Success Metrics

| Metric                          | Target                                                    | How Measured                                                   |
| ------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| **Onboarding completion rate**  | +20% vs V2 (fewer steps = less drop-off)                  | Users completing all steps / users starting onboarding         |
| **Time to completion**          | < 5 minutes (down from 8-15 min V2)                       | Timestamp: start → complete                                    |
| **First chat within 24h**       | +30% vs V2                                                | Users who open chat within 24h of onboarding                   |
| **Brain dump completion**       | +15% vs V2 (better framing from intent question)          | Users who actually write a brain dump                          |
| **Profile seed accuracy**       | Onboarding seed correlates with 30-day profile at r > 0.5 | Compare seeded dimensions to computed dimensions at session 30 |
| **Onboarding intent stability** | >60% of users still match their initial intent at day 30  | Compare onboarding_intent to dominant session intent_type      |

---

## 11. Open Questions

1. **Should we A/B test the intent question wording?** The exact phrasing matters a lot. "What brings you here?" vs "What are you trying to accomplish?" may yield different answers. Need to test.

2. **Is two questions the right number?** Could be one (just intent, infer stakes from brain dump content). Could be three (add "Are you managing this alone or with a team?"). Need to find the minimum viable signal.

3. **Should "explore" users skip the brain dump entirely?** Or should we offer a lightweight alternative ("Want to try with a sample project?")?

4. **How do we handle users who completed V1/V2 and are now active?** Do we ask them the two new questions retroactively? Or just seed from existing data and let the behavioral profile catch up?

5. **Should the onboarding seed ever be updated?** If a user's life circumstances change (casual → income-tied), should we provide a way to re-answer the stakes question? Or just let the behavioral profile detect it?
