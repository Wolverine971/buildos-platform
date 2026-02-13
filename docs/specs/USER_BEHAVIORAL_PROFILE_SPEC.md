<!-- docs/specs/USER_BEHAVIORAL_PROFILE_SPEC.md -->

# User Behavioral Profile System

> **Status:** Draft
> **Author:** DJ + Claude
> **Date:** 2026-02-12
> **Goal:** Build an adaptive behavioral profile for each user that instructs the AI agent on how to be maximally helpful — optimizing for action taken, not information delivered.

---

## 1. The Core Problem

The chat agent currently treats every user the same. It has basic static preferences (communication style, response length, proactivity level), but these are:

- **Self-reported** — users don't always know what they need
- **Static** — they don't evolve as the user's behavior reveals patterns
- **Incomplete** — they miss the dimensions that actually predict whether someone will act

The real failure mode isn't "the agent said something wrong." It's **the user opened the chat, tried to do something, got overwhelmed or lost, and left without accomplishing anything.** That's the thing we need to detect and fix.

---

## 2. Design Philosophy

### Optimize for Action, Not Information

The agent's job is not to be smart. It's to help the user **do the thing they came to do.** Every behavioral signal we track should ultimately answer one question:

> "What should the agent do differently next time to increase the probability this user takes action?"

### Observe, Don't Ask

Users are bad at self-reporting. A user who says they want "detailed" responses may actually abandon chats where the agent gives more than 3 sentences. We should **infer** behavioral preferences from actual usage patterns, not surveys.

### The Profile is a Living Instruction Set

The behavioral profile isn't a dashboard for the user to see. It's a **prompt injection** — a structured set of heuristics loaded into the agent's context at conversation start that tells it how to behave with this specific human.

---

## 3. What We Track

### 3.1 Session-Level Signals

These are captured per chat session and aggregated into the profile over time.

| Signal                                          | What It Tells Us                                               | How to Capture                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Session outcome** (success / abandon / drift) | Whether the user accomplished their intent                     | Intent detection + outcome classification (see §4)                                |
| **Time-to-first-action**                        | How quickly the user engages after agent response              | Timestamp delta between agent response and next user message or tool confirmation |
| **Session duration**                            | Whether the user prefers short bursts or deep dives            | `completed_at - created_at` on session                                            |
| **Message count** (user vs agent)               | Conversational density; who's doing the talking                | Count messages by role per session                                                |
| **Avg user message length**                     | How much context the user naturally provides                   | Character/word count on user messages                                             |
| **Avg agent message length at abandon**         | When agent verbosity correlates with drop-off                  | Agent message length in sessions classified as abandoned                          |
| **Idle gaps**                                   | Points where the user hesitated, got confused, or stepped away | Gaps > 60s between agent response and user reply                                  |
| **Tool confirmations vs rejections**            | Whether the user trusts the agent to act                       | Count of plan-step confirmations vs skips/cancels                                 |
| **Context type distribution**                   | What the user actually uses the chat for                       | Aggregate context_type across sessions                                            |
| **Re-engagement after abandon**                 | Whether the user came back to finish                           | Same intent detected in a new session within 24h                                  |

### 3.2 Behavioral Dimensions (Derived)

These are computed from the raw signals and form the actual profile.

| Dimension                       | Range                                | What It Means                                                                                                                   |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **action_orientation**          | 0.0 – 1.0                            | How quickly and frequently the user acts on agent suggestions. High = "just do it" user. Low = needs more deliberation.         |
| **information_appetite**        | 0.0 – 1.0                            | How much context/explanation the user engages with before acting. High = wants reasoning. Low = wants the answer.               |
| **session_style**               | `bursty` / `deep` / `mixed`          | Whether sessions tend to be short task-focused bursts or long exploratory conversations.                                        |
| **autonomy_comfort**            | 0.0 – 1.0                            | How comfortable the user is letting the agent act without confirmation. High = "just handle it." Low = "show me first."         |
| **overwhelm_threshold**         | `low` / `medium` / `high`            | Estimated point at which information volume causes disengagement. Derived from abandon patterns correlated with message length. |
| **engagement_momentum**         | 0.0 – 1.0                            | How the user's engagement changes within a session. High = stays engaged or accelerates. Low = tends to trail off.              |
| **intent_clarity**              | `explicit` / `exploratory` / `vague` | How clearly the user communicates what they want. Affects how much the agent should probe vs infer.                             |
| **follow_through_rate**         | 0.0 – 1.0                            | Ratio of successful sessions to total sessions with detected intent. The north star metric.                                     |
| **preferred_interaction_depth** | `shallow` / `moderate` / `deep`      | Typical conversation depth before the user is satisfied. Based on turn count in successful sessions.                            |
| **time_pattern**                | object                               | When the user is most active and most likely to complete tasks (time of day, day of week).                                      |

### 3.3 Contextual Patterns

These overlay the behavioral dimensions with situational awareness.

| Pattern              | Description                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Topic affinity**   | What the user chats about most (task management, planning, brainstorming, calendar, etc.). Derived from context_type + tool usage.                                                   |
| **Failure patterns** | Recurring situations where sessions fail. E.g., "User abandons when asked clarifying questions about goals" or "User disengages after agent presents multi-step plans."              |
| **Success patterns** | What conditions correlate with successful sessions. E.g., "User completes tasks when agent gives 1 action at a time" or "User engages deeply when agent asks 'what's blocking you?'" |
| **Drift triggers**   | Points in conversation where the user typically goes off-track or loses focus.                                                                                                       |

---

## 4. Session Outcome Classification

This is the hardest and most important piece. We need to classify every session as one of:

### 4.1 Outcome Types

| Outcome         | Definition                                                                  | Detection Heuristic                                                                                      |
| --------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Successful**  | User had an intent, accomplished it, closed chat                            | Intent detected AND (action taken via tool OR user confirms completion OR clean exit after action)       |
| **Abandoned**   | User had an intent, did not accomplish it, stopped engaging                 | Intent detected AND no action taken AND (session idle > 5min OR modal closed during active conversation) |
| **Drifted**     | User started with one intent, ended doing something else entirely           | Intent shift detected mid-session (topic changed significantly without resolution of original intent)    |
| **Exploratory** | User had no specific intent, was browsing/thinking                          | No clear action intent detected; conversation is questions/brainstorming only                            |
| **Blocked**     | User wanted to do something but hit a wall (error, missing data, confusion) | User expresses frustration, asks same question multiple ways, or session ends after error                |

### 4.2 Intent Detection

Intent is inferred from:

1. **First user message** — classify as action-oriented ("create a task for..."), information-seeking ("what's the status of..."), or exploratory ("I'm thinking about...")
2. **Context type selected** — project context implies task-oriented; global implies broader intent
3. **Tool requests** — if the agent calls tools, the user likely wanted something done
4. **Explicit signals** — user says "done", "thanks", "that's what I needed" = success marker

### 4.3 Implementation Approach

**Phase 1 (Heuristic):** Rule-based classification using the signals above. Fast to ship, good enough to start learning.

**Phase 2 (LLM-assisted):** At session end, run a lightweight LLM call that reads the conversation summary and classifies the outcome. More accurate but costs per-session.

**Phase 3 (Predictive):** Use accumulated data to predict mid-session when a user is about to abandon, allowing the agent to intervene (simplify, ask a direct question, offer to just do the thing).

---

## 5. The Behavioral Profile Object

```typescript
interface UserBehavioralProfile {
	user_id: string;

	// Last computed
	computed_at: string; // ISO timestamp
	session_count: number; // Total sessions analyzed

	// Core dimensions (§3.2)
	dimensions: {
		action_orientation: number; // 0-1
		information_appetite: number; // 0-1
		session_style: 'bursty' | 'deep' | 'mixed';
		autonomy_comfort: number; // 0-1
		overwhelm_threshold: 'low' | 'medium' | 'high';
		engagement_momentum: number; // 0-1
		intent_clarity: 'explicit' | 'exploratory' | 'vague';
		follow_through_rate: number; // 0-1
		preferred_interaction_depth: 'shallow' | 'moderate' | 'deep';
		time_pattern: {
			peak_hours: string[]; // e.g., ["09:00-11:00", "14:00-16:00"]
			peak_days: string[]; // e.g., ["monday", "tuesday", "wednesday"]
			timezone: string;
		};
	};

	// Contextual patterns (§3.3)
	patterns: {
		topic_affinity: Record<string, number>; // topic -> frequency score
		failure_patterns: string[]; // Natural language descriptions
		success_patterns: string[];
		drift_triggers: string[];
	};

	// Agent instruction set (§6) — the actual prompt injection
	agent_instructions: string;

	// Confidence & freshness
	confidence: number; // 0-1, increases with more sessions
	staleness_days: number; // Days since last recomputation
}
```

---

## 6. Agent Instruction Generation

The profile is useless if it doesn't change agent behavior. The `agent_instructions` field is a natural-language prompt injection that gets loaded into the planner context alongside existing user preferences.

### 6.1 Instruction Template

```
## Behavioral Profile for This User

Based on observed interaction patterns across {session_count} sessions:

**Communication Style:**
{generated based on information_appetite + overwhelm_threshold + session_style}

**Action Guidance:**
{generated based on action_orientation + autonomy_comfort + follow_through_rate}

**Session Management:**
{generated based on engagement_momentum + preferred_interaction_depth + drift_triggers}

**What Works With This User:**
{success_patterns as bullet points}

**What to Avoid:**
{failure_patterns as bullet points}
```

### 6.2 Example Generated Instructions

**For a high-action, low-information user:**

```
Keep responses under 3 sentences unless asked for more. Lead with the action,
not the reasoning. When presenting a plan, give one step at a time rather than
a full list. This user prefers to say "do it" and move on — don't ask for
confirmation on low-stakes actions. If the conversation goes past 5 exchanges
without an action taken, ask directly: "Want me to just handle this?"
```

**For a deliberate, information-seeking user:**

```
This user appreciates context and reasoning before acting. Explain *why* before
*what*. When presenting options, include trade-offs. Don't rush to action — let
them process. They tend to ask follow-up questions, which is a sign of
engagement, not confusion. Offer detailed plans with rationale. Check in after
presenting complex information: "Does this approach make sense before we proceed?"
```

**For a user who frequently abandons:**

```
This user has a low follow-through rate (0.3). Sessions often end without
resolution. Key intervention strategies:
- After 2 exchanges, summarize their intent back to confirm understanding
- Break any multi-step task into single actions
- If they go quiet for 30+ seconds after a long response, follow up with a
  shorter, more direct version
- Avoid presenting more than 2 options at once
- Proactively offer to simplify: "Would it help if I just [single action]?"
```

---

## 7. Data Model

### 7.1 New Table: `user_behavioral_profiles`

```sql
CREATE TABLE user_behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Core dimensions (JSONB for flexibility as dimensions evolve)
  dimensions JSONB NOT NULL DEFAULT '{}',

  -- Contextual patterns
  patterns JSONB NOT NULL DEFAULT '{}',

  -- Generated agent instructions (cached, regenerated on profile update)
  agent_instructions TEXT NOT NULL DEFAULT '',

  -- Metadata
  session_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.0,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- RLS: Users can only read their own profile
ALTER TABLE user_behavioral_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON user_behavioral_profiles
  FOR SELECT USING (auth.uid() = user_id);
```

### 7.2 New Table: `chat_session_analytics`

Per-session analytics computed at session close or timeout.

```sql
CREATE TABLE chat_session_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL, -- References agent_chat_sessions.id

  -- Outcome classification
  outcome TEXT NOT NULL CHECK (outcome IN (
    'successful', 'abandoned', 'drifted', 'exploratory', 'blocked'
  )),
  outcome_confidence REAL NOT NULL DEFAULT 0.5,

  -- Session signals
  duration_seconds INTEGER,
  message_count_user INTEGER NOT NULL DEFAULT 0,
  message_count_agent INTEGER NOT NULL DEFAULT 0,
  avg_user_message_length INTEGER,  -- characters
  avg_agent_message_length INTEGER,
  max_idle_gap_seconds INTEGER,     -- longest pause
  idle_gaps_over_60s INTEGER NOT NULL DEFAULT 0,

  -- Action signals
  tool_calls_total INTEGER NOT NULL DEFAULT 0,
  tool_confirmations INTEGER NOT NULL DEFAULT 0,
  tool_rejections INTEGER NOT NULL DEFAULT 0,
  plans_created INTEGER NOT NULL DEFAULT 0,
  plans_executed INTEGER NOT NULL DEFAULT 0,
  entities_created INTEGER NOT NULL DEFAULT 0,  -- tasks, projects, etc.
  entities_modified INTEGER NOT NULL DEFAULT 0,

  -- Intent signals
  detected_intent TEXT,          -- Natural language summary of what user wanted
  intent_type TEXT CHECK (intent_type IN (
    'action', 'information', 'exploratory', 'unclear'
  )),
  context_type TEXT,             -- From session

  -- Engagement signals
  time_to_first_action_seconds INTEGER,  -- Time from session start to first tool execution
  engagement_trajectory TEXT CHECK (engagement_trajectory IN (
    'accelerating', 'steady', 'decelerating', 'spike_and_drop'
  )),

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id)
);

CREATE INDEX idx_chat_session_analytics_user ON chat_session_analytics(user_id);
CREATE INDEX idx_chat_session_analytics_outcome ON chat_session_analytics(outcome);
```

### 7.3 New Table: `chat_session_events`

Lightweight event stream for real-time signals during a session.

```sql
CREATE TABLE chat_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_start',
    'session_end',
    'user_message',
    'agent_message',
    'tool_called',
    'tool_confirmed',
    'tool_rejected',
    'plan_created',
    'plan_step_executed',
    'entity_created',
    'entity_modified',
    'idle_detected',       -- Fired when gap > 60s detected
    'modal_closed',        -- User closed chat modal
    'modal_reopened',      -- User reopened within short window
    'context_switched',    -- User changed context mid-session
    'frustration_signal'   -- User repeated question, expressed confusion
  )),

  -- Event-specific payload
  payload JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_session_events_session ON chat_session_events(session_id);
CREATE INDEX idx_chat_session_events_user ON chat_session_events(user_id, created_at);

-- Auto-cleanup: drop events older than 90 days (raw events are aggregated into analytics)
```

---

## 8. Architecture

### 8.1 Data Flow

```
User interacts with chat
        │
        ▼
┌─────────────────────────┐
│  Chat Session Events    │  ← Real-time event capture (lightweight)
│  (chat_session_events)  │     Emitted from: AgentChatModal, stream-handler, tool-executor
└──────────┬──────────────┘
           │
           │  On session close / timeout
           ▼
┌─────────────────────────────┐
│  Session Analytics Compute  │  ← Aggregate events into session-level metrics
│  (chat_session_analytics)   │     Classify outcome (heuristic → LLM-assisted)
└──────────┬──────────────────┘
           │
           │  Periodic recomputation (after every N sessions or daily)
           ▼
┌─────────────────────────────┐
│  Behavioral Profile Engine  │  ← Analyze session analytics across time
│  (user_behavioral_profiles) │     Compute dimensions, patterns, instructions
└──────────┬──────────────────┘
           │
           │  On session start
           ▼
┌─────────────────────────────┐
│  Agent Context Injection    │  ← Profile.agent_instructions loaded into
│  (agent-context-service.ts) │     planner context alongside existing prefs
└─────────────────────────────┘
```

### 8.2 Integration Points

| Component                            | Change                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `AgentChatModal.svelte`              | Emit `modal_closed`, `modal_reopened` events. Track idle time client-side.          |
| `stream-handler.ts`                  | Emit `user_message`, `agent_message` events with metadata (length, timestamp).      |
| `ChatToolExecutor`                   | Emit `tool_called`, `tool_confirmed`, `tool_rejected` events.                       |
| `agent-chat-orchestrator.ts`         | Emit `plan_created`, `plan_step_executed` events.                                   |
| `agent-context-service.ts`           | Load `user_behavioral_profiles.agent_instructions` and inject into planner context. |
| New: `session-analytics.service.ts`  | Compute session analytics on close.                                                 |
| New: `behavioral-profile.service.ts` | Recompute profile from session analytics.                                           |
| New: `session-event.service.ts`      | Thin service for writing events (called from all integration points).               |

---

## 9. Profile Recomputation Strategy

The profile should be recomputed:

1. **After every 5 completed sessions** — enough new data to shift the profile meaningfully
2. **Daily** for active users (>1 session/day) — captures evolving patterns
3. **On demand** if the user changes their static preferences — merge with observed behavior

### 9.1 Computation Approach

**Phase 1 — Statistical:**

- Aggregate session analytics using weighted averages (recent sessions weighted higher)
- Simple thresholds for categorical dimensions (e.g., session_style = 'bursty' if median duration < 3min)
- Pattern detection via frequency analysis

**Phase 2 — LLM-assisted:**

- Feed the last 20 session analytics to an LLM with a structured prompt
- LLM generates the `agent_instructions` text with nuance that pure stats can't capture
- LLM identifies non-obvious patterns ("this user engages deeply on Mondays but is terse on Fridays")

### 9.2 Cold Start

For new users (< 5 sessions):

- Use static preferences as the baseline
- Apply sensible defaults: `overwhelm_threshold: 'medium'`, `session_style: 'bursty'` (assume short attention span until proven otherwise)
- After 3 sessions, begin blending observed behavior with stated preferences
- After 10 sessions, observed behavior dominates

---

## 10. Mid-Session Interventions (Phase 3)

Once we have enough data, we can predict and intervene in real-time:

| Trigger                                                       | Intervention                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| User idle > 60s after long agent message                      | Agent follows up with a shorter, more direct version    |
| User sends 3+ short messages without taking action            | Agent asks: "Want me to just handle [inferred intent]?" |
| Session matches a known failure pattern                       | Agent adjusts behavior preemptively                     |
| User's engagement_momentum drops below their baseline         | Agent simplifies, switches to single-action mode        |
| Session duration exceeds 2x user's average without resolution | Agent summarizes progress and offers to pick up later   |

---

## 11. Privacy & Transparency

- Behavioral profiles are **internal to the system** — not displayed to users as a "personality assessment"
- Users can **see and reset** their profile in settings ("What does BuildOS know about my usage patterns?")
- Raw events are auto-purged after 90 days; only aggregated analytics persist
- Profile data is covered by existing RLS policies
- No data shared externally; used only to improve the user's own chat experience

---

## 12. Success Metrics

| Metric                                           | Target                                                            | How Measured                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| **Follow-through rate**                          | Increase by 20% within 60 days of profile activation              | `successful / (successful + abandoned + blocked)`             |
| **Avg session duration for successful sessions** | Decrease by 15% (users accomplish goals faster)                   | Duration of sessions classified as successful                 |
| **Abandon rate**                                 | Decrease by 25%                                                   | `abandoned / total_sessions`                                  |
| **Re-engagement after abandon**                  | Increase by 30% (users come back when they know the agent adapts) | Same-intent sessions within 24h                               |
| **Agent message length in successful sessions**  | Converge toward user's optimal (not universal shorter)            | Track correlation between message length and outcome per-user |

---

## 13. Implementation Phases

### Phase 1: Event Capture & Session Analytics (2-3 weeks)

- [ ] Create `chat_session_events` table + migration
- [ ] Create `chat_session_analytics` table + migration
- [ ] Build `session-event.service.ts` — thin event emitter
- [ ] Instrument `AgentChatModal`, `stream-handler`, `ChatToolExecutor`, `orchestrator`
- [ ] Build `session-analytics.service.ts` — compute analytics on session close
- [ ] Heuristic session outcome classification

### Phase 2: Behavioral Profile & Agent Injection (2-3 weeks)

- [ ] Create `user_behavioral_profiles` table + migration
- [ ] Build `behavioral-profile.service.ts` — dimension computation
- [ ] Build agent instruction generator (template-based first, LLM later)
- [ ] Integrate into `agent-context-service.ts` — load and inject profile
- [ ] Cold start logic with fallback to static preferences
- [ ] Profile recomputation triggers

### Phase 3: LLM-Assisted Classification & Instructions (1-2 weeks)

- [ ] LLM-based session outcome classification
- [ ] LLM-based agent instruction generation
- [ ] Pattern recognition across sessions (failure/success/drift patterns)

### Phase 4: Mid-Session Interventions (2-3 weeks)

- [ ] Real-time engagement tracking
- [ ] Idle detection with follow-up triggers
- [ ] Overwhelm detection and response simplification
- [ ] A/B testing framework for intervention strategies

---

## 14. Open Questions

1. **Should the user see their profile?** A simplified version ("We noticed you prefer quick, action-oriented conversations") could build trust. Or it could feel creepy. Needs user research.

2. **How do we handle multi-device behavior?** A user might be bursty on mobile and deep on desktop. Should we track device as a dimension?

3. **What's the minimum session count before the profile is "trusted" enough to override static preferences?** Proposed: 10 sessions, but this needs tuning.

4. **Should the profile affect non-chat surfaces?** E.g., should a user with `overwhelm_threshold: low` see simpler project views? This is a larger product question.

5. **How aggressive should mid-session interventions be?** Too subtle = no effect. Too aggressive = feels like the AI is nagging. Need to find the balance.

6. **Should we track cross-session narrative?** E.g., "User has been working on Project X for 3 weeks and is stuck on milestone 2" — this is higher-level than behavioral profile but could be powerful for agent context.
