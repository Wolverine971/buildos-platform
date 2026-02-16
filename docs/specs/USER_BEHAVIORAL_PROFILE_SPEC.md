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

## 3. Normalization Framework

Raw metrics are meaningless without context. A 0.3 follow-through rate means very different things depending on who the user is, what they're working on, and how they're using BuildOS. Every behavioral dimension must be normalized against these factors.

### 3.1 User Context Normalization

These factors describe _who_ the user is and adjust our expectations accordingly.

| Factor                              | Why It Matters                                                                                                                                                                                             | How to Derive                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lifecycle stage**                 | A brand-new user exploring BuildOS behaves completely differently than a power user. New users _should_ have lower follow-through — they're learning.                                                      | `days_since_signup`, `total_sessions`, `total_projects_created`. Stages: `onboarding` (<7d or <5 sessions), `ramping` (7-30d, 5-20 sessions), `established` (30d+, 20+ sessions), `power` (90d+, 50+ sessions) |
| **Active project count**            | Someone juggling 8 projects has fundamentally different attention patterns than someone focused on 1. Context-switching is not a personal failing — it's a load problem.                                   | Count of `onto_projects` where `state_key` NOT IN ('archived', 'completed', 'retired', 'closed')                                                                                                               |
| **Projects being actively updated** | Having 8 projects doesn't mean you're working on 8. What matters is how many the user is _touching_ in the last 14 days.                                                                                   | Count of projects with chat sessions or entity modifications in last 14 days                                                                                                                                   |
| **Stakes level**                    | A freelancer managing client projects tied to their income needs different agent behavior than someone tracking a hobby. Higher stakes = more anxiety, more need for precision, less tolerance for errors. | Derived from project `type_key` realm + `props` signals (see §3.2)                                                                                                                                             |
| **Platform engagement depth**       | Some users only use chat. Others use chat + calendar + daily briefs + braindump. Deeper engagement means more data and higher expectations.                                                                | Feature usage flags: chat, calendar_sync, daily_briefs, braindump, ontology_tools                                                                                                                              |

#### Lifecycle Stage Definitions

```typescript
type LifecycleStage = 'onboarding' | 'ramping' | 'established' | 'power';

function computeLifecycleStage(user: {
	days_since_signup: number;
	total_sessions: number;
	total_projects: number;
}): LifecycleStage {
	const { days_since_signup, total_sessions, total_projects } = user;

	// Power user: long tenure + high activity
	if (days_since_signup >= 90 && total_sessions >= 50) return 'power';

	// Established: settled into patterns
	if (days_since_signup >= 30 && total_sessions >= 20) return 'established';

	// Ramping: past initial exploration, building habits
	if (days_since_signup >= 7 && total_sessions >= 5) return 'ramping';

	// Onboarding: still figuring things out
	return 'onboarding';
}
```

**How lifecycle stage adjusts the profile:**

| Stage         | Follow-through expectation | Agent behavior adjustment                                             |
| ------------- | -------------------------- | --------------------------------------------------------------------- |
| `onboarding`  | Low (0.2-0.4 is normal)    | More guidance, explain what BuildOS can do, don't assume familiarity  |
| `ramping`     | Medium (0.3-0.5 is normal) | Help form habits, suggest features they haven't tried, be encouraging |
| `established` | Baseline (0.5+ expected)   | Use full profile, match their patterns, minimal hand-holding          |
| `power`       | High (0.6+ expected)       | Get out of the way, be terse, respect their workflow                  |

### 3.2 Project Complexity Scoring

Not all projects are equal. A "plan my birthday party" project and a "launch my SaaS product" project should have completely different follow-through expectations.

#### Complexity Signals

Complexity is computed per-project and then aggregated into a user-level weighted average.

| Signal                   | Weight | Source                                                         | Rationale                                               |
| ------------------------ | ------ | -------------------------------------------------------------- | ------------------------------------------------------- |
| **Task count**           | 0.20   | `COUNT(onto_tasks) WHERE project_id = ?`                       | More tasks = more moving parts                          |
| **Plan/phase count**     | 0.10   | `COUNT(onto_plans) WHERE project_id = ?`                       | Multiple phases indicate multi-stage work               |
| **Goal count**           | 0.10   | `COUNT(onto_goals) WHERE project_id = ?`                       | Multiple goals indicate ambition/complexity             |
| **Document depth**       | 0.10   | `COUNT(onto_documents) WHERE project_id = ?`                   | Heavy documentation = complex domain                    |
| **Entity relationships** | 0.10   | `COUNT(onto_edges) WHERE source or target in project entities` | Interconnected entities = system complexity             |
| **Facet scale**          | 0.15   | `onto_projects.facet_scale`                                    | `individual` < `team` < `organization` < `enterprise`   |
| **Realm type**           | 0.15   | `onto_projects.type_key` realm component                       | Technical/business realms tend toward higher complexity |
| **Timeline span**        | 0.10   | `MAX(due_at) - MIN(created_at)` across tasks                   | Longer timelines = more complexity and coordination     |

#### Complexity Score Computation

```typescript
type ProjectComplexity = 'simple' | 'moderate' | 'complex' | 'ambitious';

interface ProjectComplexityScore {
	score: number; // 0-1
	level: ProjectComplexity;
	factors: string[]; // Human-readable factors that drove the score
}

function computeProjectComplexity(project: {
	task_count: number;
	plan_count: number;
	goal_count: number;
	document_count: number;
	edge_count: number;
	facet_scale: string | null;
	type_key: string;
	timeline_days: number | null;
}): ProjectComplexityScore {
	let score = 0;
	const factors: string[] = [];

	// Task count: 1-5 = low, 6-15 = medium, 16+ = high
	const taskScore = Math.min(project.task_count / 20, 1.0);
	score += taskScore * 0.2;
	if (project.task_count > 15) factors.push(`${project.task_count} tasks`);

	// Plans: 0-1 = low, 2-3 = medium, 4+ = high
	const planScore = Math.min(project.plan_count / 5, 1.0);
	score += planScore * 0.1;

	// Goals
	const goalScore = Math.min(project.goal_count / 4, 1.0);
	score += goalScore * 0.1;

	// Documents
	const docScore = Math.min(project.document_count / 10, 1.0);
	score += docScore * 0.1;

	// Relationships
	const edgeScore = Math.min(project.edge_count / 20, 1.0);
	score += edgeScore * 0.1;

	// Scale facet
	const scaleMap: Record<string, number> = {
		individual: 0.1,
		team: 0.4,
		organization: 0.7,
		enterprise: 1.0
	};
	const scaleScore = scaleMap[project.facet_scale ?? 'individual'] ?? 0.1;
	score += scaleScore * 0.15;
	if (scaleScore > 0.3) factors.push(`${project.facet_scale} scale`);

	// Realm complexity
	const realmComplexity: Record<string, number> = {
		personal: 0.2,
		creative: 0.4,
		education: 0.4,
		service: 0.5,
		business: 0.7,
		technical: 0.8
	};
	const realm = project.type_key.split('.')[1] ?? 'personal';
	const realmScore = realmComplexity[realm] ?? 0.3;
	score += realmScore * 0.15;

	// Timeline
	if (project.timeline_days) {
		const timeScore = Math.min(project.timeline_days / 180, 1.0);
		score += timeScore * 0.1;
		if (project.timeline_days > 60) factors.push(`${project.timeline_days}-day timeline`);
	}

	const level: ProjectComplexity =
		score < 0.25 ? 'simple' : score < 0.5 ? 'moderate' : score < 0.75 ? 'complex' : 'ambitious';

	return { score, level, factors };
}
```

#### How Complexity Normalizes Follow-Through

| Complexity  | Expected follow-through baseline | Explanation                                                                   |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `simple`    | 0.7+                             | Small scope, clear actions — most sessions should succeed                     |
| `moderate`  | 0.5+                             | Some ambiguity, but user should be completing most intents                    |
| `complex`   | 0.35+                            | Multi-step work, context-switching, some abandons are natural                 |
| `ambitious` | 0.25+                            | Large scope projects — many sessions are exploratory or incremental by nature |

A user with a 0.3 follow-through across 5 ambitious projects is performing _well_. The same rate across 5 simple projects signals a problem.

### 3.3 Stakes Detection

Stakes affect urgency, anxiety, and how the agent should calibrate its tone and precision.

| Stakes Level            | Signals                                                                                                                                                     | Agent Behavior Adjustment                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Income-tied**         | `type_key` realm is `business` or `service`; `props` contains revenue/client/deadline markers; user has `primary_role` set as freelancer/founder/consultant | Higher precision. Confirm before mutating. Surface deadlines proactively. Never lose data. Be direct about risks. |
| **Career/professional** | `type_key` realm is `technical` or `business`; `facet_context` is `professional` or `work`                                                                  | Balance efficiency with thoroughness. Surface blockers early. Be organized.                                       |
| **Personal growth**     | `type_key` realm is `education` or `personal`; `facet_context` is `personal` or `learning`                                                                  | More encouraging tone. Celebrate progress. Lower pressure on timelines.                                           |
| **Hobby/exploratory**   | `type_key` realm is `creative` or `personal`; low task count; no deadlines                                                                                  | Relaxed. Let the user explore. Don't push for completion. Enjoy the process.                                      |

Stakes are inferred per-project from existing ontology data and aggregated:

- If **any** active project is income-tied → user's overall stakes_level is `high`
- If mix of professional + personal → `medium`
- If all personal/hobby → `low`

### 3.4 Time Pattern Analysis

Time patterns are tracked in the user's timezone and reveal important behavioral signals.

```typescript
interface TimePattern {
	// When they use BuildOS
	peak_hours: string[]; // e.g., ["09:00-11:00", "21:00-23:00"]
	peak_days: string[]; // e.g., ["monday", "tuesday", "wednesday"]
	timezone: string;

	// Behavioral patterns by time
	work_hours_style: 'focused' | 'scattered' | 'unknown'; // During 9-5
	evening_style: 'deep_work' | 'quick_check' | 'absent'; // After 6pm
	weekend_style: 'active' | 'light' | 'absent';

	// Session performance by time
	best_follow_through_window: string; // e.g., "09:00-11:00" — when they accomplish the most
	worst_follow_through_window: string; // e.g., "22:00-00:00" — when they tend to abandon

	// Recency
	days_since_last_session: number;
	avg_days_between_sessions: number; // Cadence
}
```

**Why time patterns matter for the agent:**

- A user chatting at 11pm has different energy than at 9am — the agent should adjust verbosity
- If we know their best follow-through window is mornings, we can be more ambitious with multi-step plans during that time
- If sessions during their "worst" window tend to be abandoned, the agent should default to simpler interactions

### 3.5 Layering: Global vs Project Profiles

Behavior must be modeled at two levels:

| Layer                     | Purpose                                                                                        | Scope          |
| ------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| **Global profile**        | Stable cross-project defaults (verbosity tolerance, autonomy comfort, intent clarity patterns) | User           |
| **Project profile**       | Project-local deltas (how this user behaves in _this_ project context)                         | User + Project |
| **Effective instruction** | Runtime merge of global + project layers                                                       | Session        |

#### Deterministic Merge Contract

At request time, we compute:

```typescript
effective_instruction = merge(global_instruction, project_instruction, project_confidence);
```

Rules:

1. No project layer available → use global only.
2. Project layer confidence >= 0.55 → project guidance is primary; global remains baseline.
3. Project layer confidence < 0.55 → global guidance stays primary; project guidance is soft signal.
4. Merge is text-stable and deterministic (no runtime LLM call in request path).

---

## 4. What We Track

### 4.1 Session-Level Signals

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

### 4.2 Behavioral Dimensions (Derived)

These are computed from the raw signals and form the actual profile. All numeric dimensions are **normalized** against the user's lifecycle stage, project complexity, and stakes level (see §3).

| Dimension                       | Range                                | What It Means                                                                                                                   | Normalized Against                   |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **action_orientation**          | 0.0 – 1.0                            | How quickly and frequently the user acts on agent suggestions. High = "just do it" user. Low = needs more deliberation.         | Project complexity                   |
| **information_appetite**        | 0.0 – 1.0                            | How much context/explanation the user engages with before acting. High = wants reasoning. Low = wants the answer.               | Stakes level                         |
| **session_style**               | `bursty` / `deep` / `mixed`          | Whether sessions tend to be short task-focused bursts or long exploratory conversations.                                        | Active project count                 |
| **autonomy_comfort**            | 0.0 – 1.0                            | How comfortable the user is letting the agent act without confirmation. High = "just handle it." Low = "show me first."         | Stakes level                         |
| **overwhelm_threshold**         | `low` / `medium` / `high`            | Estimated point at which information volume causes disengagement. Derived from abandon patterns correlated with message length. | Lifecycle stage                      |
| **engagement_momentum**         | 0.0 – 1.0                            | How the user's engagement changes within a session. High = stays engaged or accelerates. Low = tends to trail off.              | Time of day                          |
| **intent_clarity**              | `explicit` / `exploratory` / `vague` | How clearly the user communicates what they want. Affects how much the agent should probe vs infer.                             | Lifecycle stage                      |
| **follow_through_rate**         | 0.0 – 1.0                            | Ratio of successful sessions to total sessions with detected intent. The north star metric.                                     | Project complexity + lifecycle stage |
| **preferred_interaction_depth** | `shallow` / `moderate` / `deep`      | Typical conversation depth before the user is satisfied. Based on turn count in successful sessions.                            | Project complexity                   |
| **time_pattern**                | object                               | When the user is most active and most likely to complete tasks. See §3.4 for full structure.                                    | Timezone-adjusted                    |

#### Normalization Example: Follow-Through Rate

Raw follow-through of 0.3 means different things:

```
User A: 0.3 raw × onboarding_adjustment(1.5) × ambitious_project_adjustment(1.4) = 0.63 normalized
→ "This new user is actually doing great on hard projects"

User B: 0.3 raw × power_user_adjustment(0.8) × simple_project_adjustment(0.7) = 0.17 normalized
→ "This experienced user is struggling with easy stuff — something's wrong"
```

The normalization adjustments are multipliers that shift the raw score relative to what we'd _expect_ for someone in that situation.

### 4.3 Contextual Patterns

These overlay the behavioral dimensions with situational awareness.

| Pattern              | Description                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Topic affinity**   | What the user chats about most (task management, planning, brainstorming, calendar, etc.). Derived from context_type + tool usage.                                                   |
| **Failure patterns** | Recurring situations where sessions fail. E.g., "User abandons when asked clarifying questions about goals" or "User disengages after agent presents multi-step plans."              |
| **Success patterns** | What conditions correlate with successful sessions. E.g., "User completes tasks when agent gives 1 action at a time" or "User engages deeply when agent asks 'what's blocking you?'" |
| **Drift triggers**   | Points in conversation where the user typically goes off-track or loses focus.                                                                                                       |

---

## 5. Session Outcome Classification

This is the hardest and most important piece. We need to classify every session as one of:

### 5.1 Outcome Types

| Outcome         | Definition                                                                  | Detection Heuristic                                                                                      |
| --------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Successful**  | User had an intent, accomplished it, closed chat                            | Intent detected AND (action taken via tool OR user confirms completion OR clean exit after action)       |
| **Abandoned**   | User had an intent, did not accomplish it, stopped engaging                 | Intent detected AND no action taken AND (session idle > 5min OR modal closed during active conversation) |
| **Drifted**     | User started with one intent, ended doing something else entirely           | Intent shift detected mid-session (topic changed significantly without resolution of original intent)    |
| **Exploratory** | User had no specific intent, was browsing/thinking                          | No clear action intent detected; conversation is questions/brainstorming only                            |
| **Blocked**     | User wanted to do something but hit a wall (error, missing data, confusion) | User expresses frustration, asks same question multiple ways, or session ends after error                |

### 5.2 Intent Detection

Intent is inferred from:

1. **First user message** — classify as action-oriented ("create a task for..."), information-seeking ("what's the status of..."), or exploratory ("I'm thinking about...")
2. **Context type selected** — project context implies task-oriented; global implies broader intent
3. **Tool requests** — if the agent calls tools, the user likely wanted something done
4. **Explicit signals** — user says "done", "thanks", "that's what I needed" = success marker

### 5.3 Implementation Approach

**Phase 1 (Heuristic):** Rule-based classification using the signals above. Fast to ship, good enough to start learning.

**Phase 2 (LLM-assisted):** At session end, run a lightweight LLM call that reads the conversation summary and classifies the outcome. More accurate but costs per-session.

**Phase 3 (Predictive):** Use accumulated data to predict mid-session when a user is about to abandon, allowing the agent to intervene (simplify, ask a direct question, offer to just do the thing).

---

## 6. The Behavioral Profile Object

```typescript
interface UserBehavioralProfile {
	user_id: string;

	// Last computed
	computed_at: string; // ISO timestamp
	session_count: number; // Total sessions analyzed
	analysis_version: number; // Increments with each recomputation

	// User context (§3.1) — normalization inputs
	context: {
		lifecycle_stage: 'onboarding' | 'ramping' | 'established' | 'power';
		days_since_signup: number;
		active_project_count: number;
		projects_updated_last_14d: number;
		stakes_level: 'low' | 'medium' | 'high';
		platform_features_used: string[]; // e.g., ['chat', 'calendar', 'braindump']
	};

	// Project complexity summary (§3.2)
	project_summary: {
		avg_complexity: number; // 0-1 weighted average across active projects
		complexity_distribution: {
			simple: number; // Count of projects at each level
			moderate: number;
			complex: number;
			ambitious: number;
		};
		income_tied_project_count: number;
		total_tasks_across_projects: number;
	};

	// Core dimensions (§4.2) — all normalized
	dimensions: {
		action_orientation: number;
		information_appetite: number;
		session_style: 'bursty' | 'deep' | 'mixed';
		autonomy_comfort: number;
		overwhelm_threshold: 'low' | 'medium' | 'high';
		engagement_momentum: number;
		intent_clarity: 'explicit' | 'exploratory' | 'vague';
		follow_through_rate: number; // Normalized
		follow_through_rate_raw: number; // Raw for comparison
		preferred_interaction_depth: 'shallow' | 'moderate' | 'deep';
		time_pattern: TimePattern; // Full structure from §3.4
	};

	// Contextual patterns (§4.3)
	patterns: {
		topic_affinity: Record<string, number>;
		failure_patterns: string[];
		success_patterns: string[];
		drift_triggers: string[];
	};

	// Layering metadata (§3.5)
	layers: {
		global_instruction: string;
		project_instruction?: string | null; // Only on project-scoped sessions
		project_confidence?: number; // 0-1
		merge_strategy:
			| 'global_only'
			| 'project_priority'
			| 'global_priority_low_project_confidence';
	};

	// Agent instruction set (§7) — the actual prompt injection
	agent_instructions: string;

	// Analysis metadata
	confidence: number; // 0-1, increases with more sessions
	staleness_days: number;
	next_analysis_trigger: AnalysisTrigger; // When to recompute (§9)
}
```

---

## 7. Agent Instruction Generation

The profile is useless if it doesn't change agent behavior. The `agent_instructions` field is a natural-language prompt injection that gets loaded into the planner context alongside existing user preferences.

### 7.1 Instruction Template

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

### 7.2 Example Generated Instructions

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

## 8. Data Model

### 8.1 New Table: `user_behavioral_profiles`

```sql
CREATE TABLE user_behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- User context (normalization inputs)
  user_context JSONB NOT NULL DEFAULT '{}',

  -- Project complexity summary
  project_summary JSONB NOT NULL DEFAULT '{}',

  -- Core dimensions (JSONB for flexibility as dimensions evolve)
  dimensions JSONB NOT NULL DEFAULT '{}',

  -- Contextual patterns
  patterns JSONB NOT NULL DEFAULT '{}',

  -- Generated agent instructions (cached, regenerated on profile update)
  agent_instructions TEXT NOT NULL DEFAULT '',

  -- Metadata
  session_count INTEGER NOT NULL DEFAULT 0,
  analysis_version INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.0,

  -- Analysis trigger tracking
  next_analysis_trigger JSONB NOT NULL DEFAULT '{}',

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

### 8.1b New Table: `user_project_behavioral_profiles`

Project-scoped behavioral deltas layered on top of global profile.

```sql
CREATE TABLE user_project_behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,

  dimensions JSONB NOT NULL DEFAULT '{}',
  patterns JSONB NOT NULL DEFAULT '{}',
  agent_instructions TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.0,
  session_count INTEGER NOT NULL DEFAULT 0,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, project_id)
);

CREATE INDEX idx_user_project_behavioral_profiles_user
  ON user_project_behavioral_profiles(user_id, updated_at DESC);

CREATE INDEX idx_user_project_behavioral_profiles_project
  ON user_project_behavioral_profiles(project_id, updated_at DESC);

ALTER TABLE user_project_behavioral_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own project behavioral profile" ON user_project_behavioral_profiles
  FOR SELECT USING (auth.uid() = user_id);
```

### 8.2 New Table: `chat_session_analytics`

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

  -- Project context (for normalization)
  project_id UUID,                       -- If session was project-scoped
  project_complexity_score REAL,          -- 0-1, computed at session time
  project_complexity_level TEXT CHECK (project_complexity_level IN (
    'simple', 'moderate', 'complex', 'ambitious'
  )),
  project_stakes TEXT CHECK (project_stakes IN (
    'hobby', 'personal', 'professional', 'income_tied'
  )),

  -- Engagement signals
  time_to_first_action_seconds INTEGER,  -- Time from session start to first tool execution
  engagement_trajectory TEXT CHECK (engagement_trajectory IN (
    'accelerating', 'steady', 'decelerating', 'spike_and_drop'
  )),

  -- Time context (for time pattern analysis)
  session_hour_local INTEGER,            -- 0-23, in user's timezone
  session_day_of_week INTEGER,           -- 0-6, Sunday=0
  user_timezone TEXT,

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id)
);

CREATE INDEX idx_chat_session_analytics_user ON chat_session_analytics(user_id);
CREATE INDEX idx_chat_session_analytics_outcome ON chat_session_analytics(outcome);
CREATE INDEX idx_chat_session_analytics_time ON chat_session_analytics(user_id, session_hour_local);
```

### 8.3 New Table: `chat_session_events`

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

### 8.4 New Table: `behavioral_analysis_log`

Tracks every analysis run for auditability and cadence management.

```sql
CREATE TABLE behavioral_analysis_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What triggered this analysis
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'milestone',           -- Session count milestone (10, 30, 50, etc.)
    'project_milestone',   -- Project count milestone
    'cadence',             -- Scheduled periodic analysis
    'anomaly',             -- Something changed significantly
    'manual',              -- Admin or user requested
    'preference_change'    -- User changed their static preferences
  )),
  trigger_details JSONB DEFAULT '{}',

  -- Analysis inputs
  sessions_analyzed INTEGER NOT NULL,
  projects_analyzed INTEGER NOT NULL,
  analysis_window_days INTEGER NOT NULL,   -- How far back we looked

  -- Analysis outputs
  dimensions_before JSONB,                 -- Snapshot before update
  dimensions_after JSONB NOT NULL,         -- New dimensions
  agent_instructions TEXT NOT NULL,        -- Generated instructions
  significant_changes JSONB DEFAULT '[]',  -- What changed meaningfully

  -- Cost tracking (for LLM-assisted analysis)
  llm_model_used TEXT,
  llm_tokens_used INTEGER,
  computation_time_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_behavioral_analysis_log_user ON behavioral_analysis_log(user_id, created_at);
```

---

## 9. Adaptive Analysis Trigger System

The profile must evolve with the user. Rather than a fixed schedule, we use an **adaptive trigger system** that fires analyses based on usage milestones, anomaly detection, and dynamic cadence — all processed as worker queue jobs.

### 9.1 Trigger Types

```typescript
interface AnalysisTrigger {
	// The condition that will fire the next analysis
	type: 'milestone' | 'cadence' | 'anomaly';

	// Milestone triggers
	next_session_milestone?: number; // e.g., 10, 30, 50, 100
	next_project_milestone?: number; // e.g., 3, 5, 10

	// Cadence trigger
	next_scheduled_at?: string; // ISO timestamp
	cadence_days?: number; // Current cadence interval

	// Anomaly triggers (checked per-session)
	anomaly_thresholds?: {
		abandon_streak: number; // Consecutive abandons before triggering
		follow_through_drop: number; // % drop from baseline before triggering
		engagement_shift: number; // Significant engagement pattern change
	};
}
```

### 9.2 Milestone Triggers

These fire at specific usage thresholds. Earlier milestones are closer together because the profile is still forming.

| Milestone              | Trigger                     | Analysis Depth                 | Rationale                                                                   |
| ---------------------- | --------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| **First profile**      | 10 sessions                 | Shallow (heuristic only)       | Enough data for basic patterns. Establish baseline.                         |
| **Profile refinement** | 30 sessions + 3 projects    | Medium (heuristic + light LLM) | Behavioral patterns solidifying. Can detect project-type preferences.       |
| **Deep analysis**      | 50 sessions + 5 projects    | Deep (full LLM analysis)       | Rich dataset. Identify nuanced patterns, failure modes, success conditions. |
| **Maturity check**     | 100 sessions                | Deep + comparative             | Compare against earlier profiles. Has the user's behavior evolved?          |
| **Ongoing**            | Every 50 sessions after 100 | Deep                           | Continued refinement at lower frequency                                     |

**Project milestones** (independent of session milestones):

| Milestone       | Trigger                      | What It Adds                                                           |
| --------------- | ---------------------------- | ---------------------------------------------------------------------- |
| **3 projects**  | `active_project_count >= 3`  | Multi-project normalization kicks in                                   |
| **5 projects**  | `active_project_count >= 5`  | Cross-project pattern detection (which project types succeed?)         |
| **10 projects** | `active_project_count >= 10` | Portfolio-level analysis (load management, context-switching patterns) |

### 9.3 Dynamic Cadence

Between milestones, analyses run on a cadence that adapts to the user's activity level and profile stability.

```typescript
function computeNextCadence(profile: UserBehavioralProfile): number {
	const { lifecycle_stage } = profile.context;
	const { confidence } = profile;
	const recentAnomalies = profile.patterns.recent_anomaly_count ?? 0;

	// Base cadence by lifecycle stage
	const baseCadence: Record<string, number> = {
		onboarding: 3, // Every 3 days — profile is forming rapidly
		ramping: 7, // Weekly — still evolving
		established: 14, // Biweekly — patterns are stable
		power: 30 // Monthly — well-understood user
	};

	let cadence = baseCadence[lifecycle_stage] ?? 14;

	// Shorten cadence if confidence is low (profile is uncertain)
	if (confidence < 0.4) {
		cadence = Math.max(cadence * 0.5, 2); // At least every 2 days
	}

	// Shorten cadence if recent anomalies detected
	if (recentAnomalies > 0) {
		cadence = Math.max(cadence * 0.5, 1); // Immediate reanalysis
	}

	// Lengthen cadence if profile is very stable
	if (confidence > 0.8 && recentAnomalies === 0) {
		cadence = Math.min(cadence * 1.5, 45); // Cap at 45 days
	}

	return Math.round(cadence);
}
```

### 9.4 Anomaly Triggers

These fire _between_ scheduled analyses when something changes significantly. Checked after every session analytics computation.

| Anomaly                      | Detection                                                               | Response                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Abandon streak**           | 3+ consecutive sessions classified as `abandoned`                       | Immediate reanalysis. Something changed — new project? Life event? Agent misbehaving?                |
| **Follow-through cliff**     | Follow-through drops >30% vs 14-day rolling average                     | Urgent reanalysis. Check if new project complexity, overwhelm threshold breach, or agent regression. |
| **Engagement pattern shift** | Session style changes (bursty→deep or deep→bursty) for 5+ sessions      | Reanalyze. User's workflow may have changed.                                                         |
| **New high-stakes project**  | User creates project with `business`/`service` realm + deadline markers | Recalculate stakes_level. May need to shift agent from casual to precise.                            |
| **Long absence return**      | User returns after 14+ days of no sessions                              | Recalculate everything. User context may have shifted dramatically.                                  |
| **Sustained success**        | 10+ consecutive successful sessions                                     | Positive trigger. Lock in what's working. Increase confidence. Lengthen cadence.                     |

### 9.5 Worker Job Integration

All analysis runs are **queued as worker jobs** via the existing Supabase queue system. This keeps analysis off the hot path and lets it run with appropriate resources.

#### New Job Type: `analyze_user_behavior`

```typescript
// Enqueued from the web app when a trigger fires
// Processed by the worker service

interface AnalyzeUserBehaviorJobData {
	userId: string;
	triggerType: 'milestone' | 'cadence' | 'anomaly' | 'manual' | 'preference_change';
	triggerDetails: {
		milestone?: string; // e.g., "sessions_30"
		anomaly?: string; // e.g., "abandon_streak_3"
		cadence_days?: number;
	};
	analysisDepth: 'shallow' | 'medium' | 'deep';
}
```

#### Trigger Check Flow

```
Session closes
      │
      ▼
session-analytics.service.ts
  computes session analytics
      │
      ▼
analysis-trigger.service.ts
  checks: has any trigger fired?
      │
      ├─ Milestone hit? ──────────┐
      ├─ Cadence due? ────────────┤
      ├─ Anomaly detected? ───────┤
      │                            ▼
      │              Enqueue `analyze_user_behavior` job
      │              via POST /api/behavioral-analysis/trigger
      │              (which calls queue.add() on the web side)
      │              OR via direct Supabase insert into queue_jobs
      │
      └─ No trigger ──→ Done
```

#### Worker Processor

```typescript
// In apps/worker/src/workers/behavioralAnalysisWorker.ts

queue.process('analyze_user_behavior', async (job: ProcessingJob<AnalyzeUserBehaviorJobData>) => {
	const { userId, triggerType, triggerDetails, analysisDepth } = job.data;

	await job.log(`Starting ${analysisDepth} behavioral analysis for user ${userId}`);
	await job.updateProgress({ current: 0, total: 5, message: 'Loading session history' });

	// 1. Load session analytics (last N sessions based on depth)
	const sessionWindow = analysisDepth === 'shallow' ? 20 : analysisDepth === 'medium' ? 50 : 100;
	const sessions = await loadSessionAnalytics(userId, sessionWindow);
	await job.updateProgress({ current: 1, total: 5, message: 'Computing user context' });

	// 2. Compute user context (lifecycle, project complexity, stakes)
	const userContext = await computeUserContext(userId);
	await job.updateProgress({ current: 2, total: 5, message: 'Computing behavioral dimensions' });

	// 3. Compute dimensions with normalization
	const dimensions = computeNormalizedDimensions(sessions, userContext);
	await job.updateProgress({ current: 3, total: 5, message: 'Detecting patterns' });

	// 4. Detect patterns (failure, success, drift)
	let patterns;
	if (analysisDepth === 'deep') {
		// LLM-assisted pattern detection
		patterns = await detectPatternsWithLLM(sessions, dimensions, userContext);
	} else {
		// Heuristic pattern detection
		patterns = detectPatternsHeuristic(sessions, dimensions);
	}
	await job.updateProgress({ current: 4, total: 5, message: 'Generating agent instructions' });

	// 5. Generate agent instructions
	let agentInstructions;
	if (analysisDepth === 'deep' || analysisDepth === 'medium') {
		agentInstructions = await generateInstructionsWithLLM(dimensions, patterns, userContext);
	} else {
		agentInstructions = generateInstructionsFromTemplate(dimensions, patterns, userContext);
	}

	// 6. Compute next trigger
	const nextTrigger = computeNextTrigger(dimensions, userContext, sessions.length);

	// 7. Save profile + log
	await saveProfile(userId, {
		userContext,
		dimensions,
		patterns,
		agentInstructions,
		nextTrigger
	});
	await logAnalysis(userId, triggerType, triggerDetails, dimensions, agentInstructions);

	await job.updateProgress({ current: 5, total: 5, message: 'Analysis complete' });
	await job.log(
		`Analysis complete. Confidence: ${dimensions.confidence}. Next cadence: ${nextTrigger.cadence_days}d`
	);

	return { success: true, analysisVersion: dimensions.analysis_version };
});
```

### 9.6 Trigger Registration in Scheduler

Add a cron job to the worker scheduler that checks for cadence-based triggers:

```typescript
// In apps/worker/src/scheduler.ts

// Check for behavioral analysis cadence triggers every 6 hours
cron.schedule('0 */6 * * *', async () => {
	console.log('🧠 Checking behavioral analysis cadence triggers...');
	await checkBehavioralAnalysisCadence();
});

async function checkBehavioralAnalysisCadence() {
	// Find profiles where next_scheduled_at has passed
	const { data: dueProfiles } = await supabase
		.from('user_behavioral_profiles')
		.select('user_id, next_analysis_trigger')
		.lte('next_analysis_trigger->>next_scheduled_at', new Date().toISOString())
		.not('next_analysis_trigger->>next_scheduled_at', 'is', null);

	if (!dueProfiles?.length) {
		console.log('✅ No behavioral analyses due');
		return;
	}

	console.log(`🧠 ${dueProfiles.length} user(s) due for behavioral analysis`);

	for (const profile of dueProfiles) {
		const trigger = profile.next_analysis_trigger as any;
		await queue.add(
			'analyze_user_behavior',
			profile.user_id,
			{
				userId: profile.user_id,
				triggerType: 'cadence',
				triggerDetails: { cadence_days: trigger.cadence_days },
				analysisDepth: trigger.cadence_days <= 7 ? 'medium' : 'shallow'
			},
			{
				priority: 15, // Lower priority than briefs
				dedupKey: `behavioral-analysis-${profile.user_id}-${new Date().toISOString().split('T')[0]}`
			}
		);
	}
}
```

---

## 10. Architecture

### 10.1 Data Flow

```
User interacts with chat
        │
        ▼
┌─────────────────────────────┐
│  Chat Session Events        │  ← Real-time event capture (lightweight)
│  (chat_session_events)      │     Emitted from: AgentChatModal, stream-handler, tool-executor
└──────────┬──────────────────┘
           │
           │  On session close / timeout
           ▼
┌─────────────────────────────┐
│  Session Analytics Compute  │  ← Aggregate events into session-level metrics
│  (chat_session_analytics)   │     Classify outcome + attach project complexity + time context
└──────────┬──────────────────┘
           │
           │  Check: has any trigger fired? (milestone, anomaly)
           ▼
┌─────────────────────────────┐
│  Analysis Trigger Check     │  ← Runs inline after session analytics
│  (analysis-trigger.service) │     Checks milestones, anomalies, cadence
└──────────┬──────────────────┘
           │
           │  If trigger fired → enqueue worker job
           ▼
┌─────────────────────────────┐
│  Worker: analyze_user_      │  ← Async job on worker service (Supabase queue)
│  behavior                   │     Loads history, computes context + normalization,
│  (behavioralAnalysis        │     runs dimensions, detects patterns (optionally LLM),
│   Worker.ts)                │     generates agent_instructions, sets next trigger
└──────────┬──────────────────┘
           │
           │  Writes to user_behavioral_profiles + behavioral_analysis_log
           ▼
┌─────────────────────────────┐
│  Agent Context Injection    │  ← Profile.agent_instructions loaded into
│  (agent-context-service.ts) │     planner context on next session start
└─────────────────────────────┘

Also running:
┌─────────────────────────────┐
│  Scheduler Cron (6h)        │  ← Checks cadence triggers for all users
│  (scheduler.ts)             │     Enqueues analysis jobs for due profiles
└─────────────────────────────┘
```

### 10.2 Integration Points

| Component                                   | Change                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentChatModal.svelte`                     | Emit `modal_closed`, `modal_reopened` events. Track idle time client-side.                                                                    |
| `stream-handler.ts`                         | Emit `user_message`, `agent_message` events with metadata (length, timestamp).                                                                |
| `ChatToolExecutor`                          | Emit `tool_called`, `tool_confirmed`, `tool_rejected` events.                                                                                 |
| `agent-chat-orchestrator.ts`                | Emit `plan_created`, `plan_step_executed` events.                                                                                             |
| `agent-context-service.ts`                  | Load global + project behavioral layers, merge deterministically, and apply via `off`/`shadow`/`inject` mode with strict timeout + fail-open. |
| New: `session-event.service.ts`             | Thin service for writing events (called from all integration points).                                                                         |
| New: `session-analytics.service.ts`         | Compute session analytics on close. Includes project complexity + time context.                                                               |
| New: `analysis-trigger.service.ts`          | Check if triggers have fired after session analytics. Enqueue worker job if so.                                                               |
| New: `project-complexity.service.ts`        | Compute project complexity scores. Called during session analytics + profile analysis.                                                        |
| New: `behavioral-profile.service.ts`        | Read/write behavioral profiles. Used by web for injection, by worker for computation.                                                         |
| New (worker): `behavioralAnalysisWorker.ts` | Worker job processor for `analyze_user_behavior`.                                                                                             |
| Updated (worker): `scheduler.ts`            | Add cron for cadence-based trigger checks.                                                                                                    |
| Updated (shared-types): `QueueJobType`      | Add `'analyze_user_behavior'` to job type union.                                                                                              |

### 10.3 Chat Latency Guardrails (Hard Requirement)

Behavioral profiling must not slow down chat request handling.

**Request-path constraints (planner context assembly):**

- No writes to analytics/profile tables during chat response generation.
- No runtime LLM calls for profile merge.
- Behavioral profile lookup runs with strict timeout (target: 25ms, hard cap: 40ms).
- If lookup times out or errors, chat continues with default context (fail-open).
- Use short TTL cache (recommended 30s) for profile lookups.

**Rollout modes:**

- `off`: no lookup, no injection (default for safety)
- `shadow`: lookup + merge + metrics only; do not inject into prompt
- `inject`: inject effective behavioral instruction into planner context

Recommended runtime switches:

- `AGENTIC_CHAT_BEHAVIORAL_PROFILE_MODE=off|shadow|inject`
- `AGENTIC_CHAT_BEHAVIORAL_PROFILE_TIMEOUT_MS=25`

**Operational targets:**

- p95 added context-build latency from behavioral layer <= 10ms in `inject`
- timeout rate <= 1% (above that auto-downgrade to `shadow`)
- zero user-visible errors from behavioral subsystem failures

---

## 11. Cold Start: The Clean Slate

Every user starts with a **clean slate** — neutral defaults that don't assume anything about who they are. The profile then gets incrementally refined with each analysis trigger. The key principle: **the baseline is generous and non-judgmental.** We start by assuming the best and adjust as we learn.

### 11.1 Default Profile (Pre-Analysis)

Before the first analysis runs (< 10 sessions), the user gets this baseline:

```typescript
const CLEAN_SLATE_PROFILE: Partial<UserBehavioralProfile> = {
	context: {
		lifecycle_stage: 'onboarding',
		stakes_level: 'medium' // Assume their work matters
		// Everything else computed from real data
	},
	dimensions: {
		action_orientation: 0.5, // Neutral — don't assume fast or slow
		information_appetite: 0.5, // Give moderate detail
		session_style: 'mixed', // No pattern yet
		autonomy_comfort: 0.3, // Conservative — confirm before acting
		overwhelm_threshold: 'medium', // Don't overload, don't patronize
		engagement_momentum: 0.5, // Neutral
		intent_clarity: 'exploratory', // Assume they're figuring things out
		follow_through_rate: 0.5, // No judgement yet
		follow_through_rate_raw: 0.5,
		preferred_interaction_depth: 'moderate'
	},
	patterns: {
		topic_affinity: {}, // No patterns yet
		failure_patterns: [],
		success_patterns: [],
		drift_triggers: []
	},
	confidence: 0.0 // We know nothing
};
```

### 11.2 Clean Slate Agent Instructions

Before any analysis has run, the agent gets these default instructions:

```
## User Profile: New User (Exploring BuildOS)

This user is new or hasn't been profiled yet. Apply these defaults:

- Be welcoming but not overwhelming. Keep initial responses concise (2-3 sentences).
- Explain what you can do when relevant, but don't lecture.
- Confirm before taking actions — this user hasn't built trust with the system yet.
- If they seem stuck, offer a simple next step rather than a full plan.
- Pay attention to how they respond: do they want more detail, or less?
  Your observations now will shape how we help them going forward.
```

### 11.3 Progressive Refinement

The clean slate gets tweaked incrementally. Each analysis doesn't start from scratch — it adjusts the existing profile.

| Sessions  | What Happens                                                         | What Changes                                                                                 |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **0**     | Clean slate installed                                                | Default profile, no behavioral data                                                          |
| **1-9**   | Session analytics recorded but no analysis triggered                 | Static preferences (if set) merged with clean slate                                          |
| **10**    | First milestone trigger → `shallow` analysis                         | Basic patterns emerge: session_style, overwhelm_threshold, time_pattern. Confidence ~0.2     |
| **10-29** | Cadence triggers every ~3 days (onboarding pace)                     | Incremental adjustments. Dimensions shift toward observed behavior.                          |
| **30**    | Second milestone trigger → `medium` analysis + project normalization | Cross-project patterns. Stakes detection. Complexity normalization kicks in. Confidence ~0.5 |
| **30-49** | Cadence triggers every ~7 days (ramping pace)                        | Profile stabilizing. Success/failure patterns emerging.                                      |
| **50**    | Deep milestone → full LLM analysis                                   | Nuanced patterns detected. Rich agent instructions. Confidence ~0.7                          |
| **50+**   | Cadence triggers adapt to stability                                  | Power user cadence (14-30 days) unless anomalies detected                                    |

### 11.4 Blending Static Preferences with Observed Behavior

Users may set explicit preferences (communication_style, response_length, etc.) in settings. These should never be thrown away, but observed behavior should increasingly inform the profile.

```typescript
function blendPreferences(
	staticPref: string | undefined, // User's explicit setting
	observedValue: string | number, // What behavior shows
	confidence: number // 0-1, how much data we have
): string | number {
	// If user explicitly set a preference and confidence is low, respect it
	if (staticPref && confidence < 0.4) return staticPref;

	// If user explicitly set a preference and confidence is high but
	// observed behavior contradicts it, observed behavior wins —
	// but log the divergence for the agent instructions
	if (staticPref && confidence >= 0.4) return observedValue;

	// No static preference set — use observed behavior
	return observedValue;
}
```

When there's a divergence (user says "detailed" but behavior shows "concise"), the agent instructions should note it:

```
Note: User's stated preference is "detailed responses" but their engagement
patterns show higher follow-through with concise responses (2-3 sentences).
Default to concise, but offer "Want me to go deeper on that?" to let them
opt-in to detail when they actually want it.
```

### 11.5 Lifecycle Stage as a Core Heuristic

The user's lifecycle stage (defined in §3.1) is the most important normalization factor because it affects _everything_:

| What It Affects                     | How                                                                   |
| ----------------------------------- | --------------------------------------------------------------------- |
| **Analysis frequency**              | Onboarding: every 3 days. Power: every 30 days.                       |
| **Analysis depth**                  | Onboarding: heuristic only. Power: full LLM.                          |
| **Follow-through expectations**     | Onboarding: 0.2 is fine. Power: 0.6+ expected.                        |
| **Agent tone**                      | Onboarding: guiding. Power: peer-like.                                |
| **Feature suggestions**             | Onboarding: show what's possible. Power: assume they know.            |
| **Error tolerance**                 | Onboarding: be patient with unclear intents. Power: be efficient.     |
| **Complexity normalization weight** | Onboarding: heavy (everything is hard when you're new). Power: light. |

---

## 12. Mid-Session Interventions (Phase 3)

Once we have enough data, we can predict and intervene in real-time:

| Trigger                                                       | Intervention                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| User idle > 60s after long agent message                      | Agent follows up with a shorter, more direct version                                    |
| User sends 3+ short messages without taking action            | Agent asks: "Want me to just handle [inferred intent]?"                                 |
| Session matches a known failure pattern                       | Agent adjusts behavior preemptively                                                     |
| User's engagement_momentum drops below their baseline         | Agent simplifies, switches to single-action mode                                        |
| Session duration exceeds 2x user's average without resolution | Agent summarizes progress and offers to pick up later                                   |
| New user (onboarding) goes quiet after first message          | Agent offers a simpler starting point: "Want me to walk you through this step by step?" |
| Power user gets a verbose response                            | Agent self-corrects: "Short version: [action]. Want details?"                           |

---

## 13. Privacy & Transparency

- Behavioral profiles are **internal to the system** — not displayed to users as a "personality assessment"
- **V1 policy:** no user-facing profile dashboard or controls. Reset/rebuild is internal tooling only.
- Raw events are auto-purged after 90 days; only aggregated analytics persist
- Profile data is covered by existing RLS policies
- No data shared externally; used only to improve the user's own chat experience
- Analysis logs are retained for auditing and to prevent regressions

---

## 14. Success Metrics

All metrics are **normalized by lifecycle stage and project complexity** (see §3). Raw metrics are tracked alongside normalized metrics for calibration.

| Metric                                          | Target                                    | How Measured                                      | Normalized By                        |
| ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| **Follow-through rate**                         | +20% within 60 days of profile activation | `successful / (successful + abandoned + blocked)` | Project complexity + lifecycle stage |
| **Avg session duration (successful)**           | -15% (users accomplish goals faster)      | Duration of sessions classified as successful     | Project complexity                   |
| **Abandon rate**                                | -25%                                      | `abandoned / total_sessions`                      | Lifecycle stage                      |
| **Re-engagement after abandon**                 | +30%                                      | Same-intent sessions within 24h                   | Lifecycle stage                      |
| **Agent message length in successful sessions** | Converge toward user's per-user optimal   | Correlation between message length and outcome    | Per-user baseline                    |
| **Onboarding-to-ramping conversion**            | +15% (new users stick around)             | Users reaching `ramping` stage within 14 days     | N/A (absolute)                       |
| **Profile confidence trajectory**               | Confidence reaches 0.5 by session 30      | `confidence` field over time                      | Session count                        |
| **Added planner-context latency**               | p95 <= 10ms (behavioral layer)            | Context build timing delta with layer enabled     | N/A (absolute)                       |

---

## 15. Implementation Phases

### Phase 1: Event Capture & Session Analytics

- [ ] Create `chat_session_events` table + migration
- [ ] Create `chat_session_analytics` table + migration
- [ ] Build `session-event.service.ts` — thin event emitter
- [ ] Instrument `AgentChatModal`, `stream-handler`, `ChatToolExecutor`, `orchestrator`
- [ ] Build `session-analytics.service.ts` — compute analytics on session close
- [ ] Build `project-complexity.service.ts` — project complexity scoring
- [ ] Heuristic session outcome classification
- [ ] Attach project complexity + time context to session analytics

### Phase 2: Behavioral Profile, Triggers & Agent Injection

- [ ] Create `user_behavioral_profiles` table + migration
- [ ] Create `user_project_behavioral_profiles` table + migration
- [ ] Create `behavioral_analysis_log` table + migration
- [ ] Build `behavioral-profile.service.ts` — profile read/write
- [ ] Implement clean slate defaults
- [ ] Build `analysis-trigger.service.ts` — milestone + anomaly detection
- [ ] Add `analyze_user_behavior` job type to shared-types
- [ ] Build `behavioralAnalysisWorker.ts` on worker service
- [ ] Implement `shallow` analysis (heuristic dimensions, template-based instructions)
- [ ] Build agent instruction generator (template-based)
- [ ] Integrate into `agent-context-service.ts` with deterministic global+project merge
- [ ] Add request-path guardrails: timeout + fail-open + short TTL cache
- [ ] Add rollout modes: `off` -> `shadow` -> `inject`
- [ ] Add cadence trigger check to worker scheduler (6h cron)
- [ ] Lifecycle stage computation
- [ ] Static preference blending with confidence-based weighting

### Phase 3: Normalization & LLM-Assisted Analysis

- [ ] Implement project complexity normalization for all dimensions
- [ ] Stakes detection from ontology data
- [ ] Time pattern analysis (timezone-aware)
- [ ] `medium` analysis depth (heuristic + light LLM for instructions)
- [ ] `deep` analysis depth (full LLM pattern detection + instruction generation)
- [ ] LLM-based session outcome classification
- [ ] Anomaly trigger implementation (abandon streaks, follow-through cliff, etc.)

### Phase 4: Mid-Session Interventions

- [ ] Real-time engagement tracking
- [ ] Idle detection with follow-up triggers
- [ ] Overwhelm detection and response simplification
- [ ] Lifecycle-aware intervention strategies
- [ ] A/B testing framework for intervention strategies

---

## 16. Open Questions

1. **When (if ever) should we expose profile transparency UX?** V1 is intentionally internal-only. Revisit once outcomes are stable and trust model is designed.

2. **How do we handle multi-device behavior?** A user might be bursty on mobile and deep on desktop. Should we track device as a dimension?

3. **Should the profile affect non-chat surfaces?** E.g., should a user with `overwhelm_threshold: low` see simpler project views? This is a larger product question.

4. **How aggressive should mid-session interventions be?** Too subtle = no effect. Too aggressive = feels like the AI is nagging. Need to find the balance.

5. **Should we track cross-session narrative?** E.g., "User has been working on Project X for 3 weeks and is stuck on milestone 2" — this is higher-level than behavioral profile but could be powerful for agent context.

6. **How should the analysis prompt evolve?** The LLM prompt used to generate agent instructions should itself improve over time as we learn what instructions actually correlate with better outcomes. Should we track instruction→outcome correlations and feed them back into the analysis prompt?
