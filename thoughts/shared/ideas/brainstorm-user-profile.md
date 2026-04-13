<!-- thoughts/shared/ideas/brainstorm-user-profile.md -->

# User Profile: Living Knowledge Base

## Vision

A therapist-style, organic user profile that grows over time through brain dumps and conversations. Unlike a static form, this is a **living document tree** — a knowledge base about _the person_ — that agents can query when working on projects, generating briefs, or brainstorming ideas.

The profile doesn't ask "fill out your bio." It listens, learns, and organizes what it learns into navigable chapters. If you talk about your job a lot, that chapter gets deep. If you mention a hobby once, it's a thin stub waiting to be expanded. The shape of the profile reflects what matters to the user.

---

## Core Concept: "Chapters"

The profile is structured as a **doc tree** (same pattern as project `doc_structure`) but rooted on the user, not a project. Each chapter is an `onto_document` (or a new `profile_documents` table) organized into a hierarchy.

### Example Tree (organic, grown over time)

```
Me
├── Career
│   ├── Current Role — VP of Product at Acme Corp
│   │   ├── Team & Reports
│   │   └── Key Responsibilities
│   ├── Previous: Lead PM at StartupX (2019-2022)
│   └── Early Career — Started in consulting
├── Relationships
│   ├── Family
│   │   ├── Partner — Sarah, teacher, supportive of side projects
│   │   └── Kids — Two, ages 4 and 7
│   └── Professional Network
│       └── Mentor — James, former CTO
├── Interests & Hobbies
│   ├── Running — Training for first marathon
│   ├── Woodworking — Beginner, started 2024
│   └── Reading — Heavy non-fiction, systems thinking
├── Background
│   ├── Education — MBA from State U, CS undergrad
│   └── Where I Grew Up — Small town Ohio
├── Skills & Expertise
│   ├── Product Management
│   ├── Go-to-Market Strategy
│   └── Data Analysis (SQL, Python basics)
├── Values & Motivations
│   └── Autonomy, building things, teaching
└── Health & Wellbeing
    └── Dealing with burnout after StartupX
```

Key properties:

- **Chapters emerge from conversation**, not from a template
- **Depth varies** — some chapters are a sentence, others are multi-page
- **The tree is navigable** by both the user and agents
- **Each document has content** (markdown), just like project docs

---

## How Content Gets Into the Profile

The primary way users interact with BuildOS is through the **agentic chat** (`AgentChatModal.svelte`). Brain dumps are part of that chat flow, not a separate feature. This means the chat session close pipeline is the main integration point for profile extraction.

### Source 1: Chat Session Close (Primary — Ambient Extraction)

When a chat session closes, the existing pipeline does:

1. Client calls `POST /api/chat/sessions/{id}/close`
2. Server enqueues a `classify_chat_session` job (priority 8, deduped)
3. Worker runs `chatSessionClassifier.ts`:
    - LLM generates `auto_title`, `chat_topics[]`, `summary`
    - `processSessionActivityAndNextSteps()` logs mutations + generates project next steps

**We add a new step after classification:**

4. **`processProfileSignals()`** — A new worker function that:
    - Takes the same message history (up to 50 messages, already loaded)
    - Takes the classification output (topics, summary) as additional signal
    - Sends to LLM with the user's existing **safe** profile summary + policy context
    - LLM extracts personal signals: facts about the person, updates to known facts, new topics
    - Each signal becomes a `profile_fragments` row with `source_type: 'chat'`, `source_id: sessionId`

**Why this works well:**

- Zero friction — when enabled, extraction happens in the background after every chat
- The user already had the conversation; we're just mining it for personal context
- The classification job already loads the messages, so we piggyback on that
- Deterministic fragment idempotency keys prevent double-processing

**The LLM prompt for signal extraction would look like:**

```
You are analyzing a chat conversation for personal details about the user.

Current profile summary:
{user_profile_summary}

Conversation messages:
{messages}

Extract any personal facts, updates, or signals about the user. For each signal:
- content: The specific fact or detail (1-2 sentences)
- category: One of [career, relationships, interests, skills, values, background,
  health, schedule, goals_personal, challenges, decision_style, finances, learning,
  personality, general]
- confidence: 0.0-1.0 (how clearly stated vs. inferred)
- is_update: true if this contradicts or updates something in the current profile

Only extract signals that are genuinely about the person, not about their projects.
Return an empty array if no personal signals are present.
```

### Source 2: Dedicated Profile Chat (Active)

A chat context (`context_type: 'profile'`) where the agent is in "learn about you" mode — like a therapy intake session.

> "Tell me about your career path. How did you end up where you are now?"

> "What's going on in your personal life that affects how you work?"

> "What are you good at? What do you wish you were better at?"

The agent listens, then organizes what it hears into chapters. In this mode, profile extraction happens **live during the conversation** (via tool calls), not just at close time.

Entry points:

- Explicit: User navigates to their profile and starts a chat
- Onboarding: Replace or supplement the current 4-field onboarding with an initial profile conversation
- Periodic: "It's been a while since we caught up about you. Anything new?"

### Source 3: Direct Editing

The user can navigate to their profile, open a chapter, and write or edit directly — same as editing a project doc.

---

## Data Model Options

### Option A: Reuse Ontology Tables Directly

Profile documents live in `onto_documents` with a special project — a "meta-project" representing the user's profile.

```
onto_projects (type_key: 'profile.personal')
  ├── doc_structure: { version: 1, root: [...chapters] }
  └── onto_documents (one per chapter)
```

**Pros:** Zero new tables. Full doc tree, versioning, search vectors, edges work out of the box. Agents already know how to query `onto_documents`.

**Cons:** Conceptually odd — a "project" that isn't a project. Could confuse project-scoped queries (would need to filter out profile projects). The `created_by` actor model works, but `project_members` doesn't make sense for a personal profile.

### Option B: New `user_profile` + `profile_documents` Tables

Dedicated tables that mirror the ontology doc pattern but are user-scoped.

```sql
-- The profile root
create table user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) unique not null,
  actor_id uuid references onto_actors(id),
  extraction_enabled boolean default false, -- explicit opt-in gate for ambient extraction
  doc_structure jsonb default '{"version":1,"root":[]}',
  summary text,                    -- AI-generated executive summary
  safe_summary text,               -- prompt-safe summary (excludes restricted/sensitive details)
  summary_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual chapters/documents
create table profile_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references user_profiles(id) not null,
  title text not null,
  type_key text default 'chapter.general',
  content text,                    -- markdown body
  summary text,                    -- AI-generated summary of this chapter
  sensitivity text default 'standard', -- 'standard' | 'sensitive'
  usage_scope text default 'all_agents', -- 'all_agents' | 'profile_only' | 'never_prompt'
  props jsonb default '{}',
  search_vector tsvector,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Version history for chapters
create table profile_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references profile_documents(id) not null,
  number integer not null,
  content text,
  created_by uuid references onto_actors(id),
  merge_run_id uuid,               -- links to merge run that produced this version
  change_type text,                -- 'manual_edit' | 'accepted_fragment' | 'merge_apply'
  created_at timestamptz default now()
);

-- Embeddings stored with model metadata (v1 uses shared ontology model key)
create table profile_document_embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references profile_documents(id) not null,
  model_key text not null,
  embedding_dim integer not null,
  embedding vector(1536) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (document_id, model_key)
);

-- Fragments: unprocessed personal signals from brain dumps/chats
create table profile_fragments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references user_profiles(id) not null,
  source_type text not null,       -- 'braindump' | 'chat' | 'manual'
  source_id uuid,                  -- FK to onto_braindumps or chat_sessions
  content text not null,           -- the extracted personal signal
  category text not null default 'general',
  sensitivity text default 'standard',
  extracted_from_message_ids jsonb,
  fingerprint_hash text not null,  -- semantic dedup + idempotency input
  idempotency_key text not null,   -- deterministic key: profile_id + source + fingerprint
  suggested_chapter_id uuid,       -- which chapter this might belong to
  suggested_chapter_title text,    -- or a new chapter name
  confidence float default 0.5,
  status text default 'pending',   -- 'pending' | 'accepted' | 'dismissed' | 'needs_review'
  created_at timestamptz default now()
);

create unique index profile_fragments_unique_idempotency
  on profile_fragments (profile_id, idempotency_key);

-- Provenance: exactly which sources changed which version
create table profile_document_sources (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid references profile_document_versions(id) not null,
  fragment_id uuid references profile_fragments(id),
  source_type text not null,
  source_id uuid,
  created_at timestamptz default now()
);

-- Read/search audit for personal context usage
create table profile_access_audit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references user_profiles(id) not null,
  actor_id uuid references onto_actors(id),
  access_type text not null,       -- 'prompt_injection' | 'search' | 'doc_read' | 'doc_write'
  context_type text,               -- chat context that triggered the access
  document_ids jsonb,
  reason text,
  created_at timestamptz default now()
);
```

**Pros:** Clean separation. Profile is a first-class concept. No risk of polluting project queries. Can add profile-specific features (fragments, confidence scoring) without overloading ontology tables.

**Cons:** New tables to maintain. Need to build doc tree management again (though most code can be shared). Need new API routes.

### Option C: Hybrid — Ontology Edges + Dedicated Profile Root

A `user_profiles` root table, but chapters are `onto_documents` linked via `onto_edges`.

```
user_profiles
  └── onto_edges (rel: 'has_chapter', src: profile, dst: onto_documents)
       ├── onto_documents (Career)
       ├── onto_documents (Relationships)
       └── ...
```

**Pros:** Documents get full ontology treatment (versioning, search, edges to projects). Profile root is cleanly separated.

**Cons:** Hybrid complexity. Documents would have `project_id` as null or pointing at a sentinel, which could break assumptions.

### Recommendation: Option B

Option B keeps the profile as a distinct, first-class system while reusing the proven doc tree patterns. The `profile_fragments` table is important — it's the staging area where ambient signals wait to be organized, which is central to the organic growth model.

---

## Non-Negotiable Constraints (V1)

These are hard requirements, not open questions.

1. **Consent before ambient extraction**
    - `user_profiles.extraction_enabled` must be explicitly enabled by the user.
    - Default for existing and new users is `false` until they opt in.
    - Manual profile edits and explicit profile-chat updates remain available regardless of this toggle.

2. **Strict data-use boundaries**
    - Every chapter has `sensitivity` and `usage_scope`.
    - `usage_scope = 'never_prompt'` is never injected into prompts or retrieved by project-context tools.
    - `usage_scope = 'profile_only'` can be used in `/me` and profile-context chats, but not project execution chats.
    - Sensitive categories (`chapter.health`, `chapter.finances`, family relationship details) default to `usage_scope = 'profile_only'`.

3. **RLS + actor scoping**
    - All profile tables are protected by RLS keyed to `auth.uid() = user_profiles.user_id`.
    - Service-role/background workers can bypass RLS only for jobs owned by that same user.
    - No cross-user profile reads in V1, including team contexts.

4. **Auditability**
    - All profile prompt injections, profile searches, and chapter writes are logged to `profile_access_audit`.
    - Audit records include actor, context type, document ids, and reason string.

5. **Retention and deletion**
    - Users can delete any chapter or fragment immediately from UI.
    - Deleting a profile triggers cascade delete of chapters/versions/fragments/audit records.
    - Pending fragments older than 90 days are auto-pruned by a scheduled cleanup job.

---

## Canonical Data Invariants

1. **Single tree source of truth**
    - `user_profiles.doc_structure` is canonical.
    - `profile_documents` must not store independent parent/children trees that can diverge.

2. **Versioned writes only**
    - Any chapter content mutation must create a `profile_document_versions` row first, then update `profile_documents.content`.
    - Direct in-place content updates without version rows are invalid.

3. **Provenance is required**
    - Any AI-initiated chapter update must link to one or more sources in `profile_document_sources`.
    - UI "Sources" panel is backed by this table, not string parsing of content.

4. **Idempotent ingestion**
    - Every extracted signal uses deterministic `idempotency_key`.
    - Reprocessing the same chat session must be a no-op at fragment level.

5. **Policy-filtered retrieval**
    - Retrieval APIs enforce `usage_scope` and `sensitivity` before ranking or prompt assembly.
    - "Can this be used here?" is evaluated before "is this relevant?".

6. **Embedding model consistency**
    - V1 profile retrieval uses the same embedding model family as ontology docs.
    - `model_key` is stored alongside vectors so future migrations can dual-write and backfill safely.

---

## Querying: How Agents Use the Profile

This is the key value prop. When an agent is working on a project, it should be able to pull relevant profile context.

### Retrieval Strategy

**Step 1: Policy-filtered summary injection.** The system injects `user_profiles.safe_summary` (not raw summary) into prompts that are allowed to use profile data. If context is restricted, no profile block is injected.

**Step 2: Semantic search for deep dives.** When the agent needs specific context (e.g., "Does the user have marketing experience?"), it queries `profile_documents` by embedding similarity _after_ access-policy filtering.

```
Query: "marketing experience background"
→ Returns: "Career > Previous: Lead PM at StartupX" (mentions GTM strategy)
→ Returns: "Skills & Expertise > Go-to-Market Strategy"
```

**Step 3: Structured chapter lookup.** Some queries map to known chapter types:

- "What's the user's work schedule?" → look for chapters with `type_key: 'chapter.schedule'` or `'chapter.work_style'`
- "Who does the user work with?" → `'chapter.relationships.professional'`

### Integration Points

| System                                                 | How Profile Is Used                                                                                                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat session close** (`chatSessionClassifier.ts`)    | **Primary input.** If `extraction_enabled = true`, `processProfileSignals()` extracts personal signals into `profile_fragments` (idempotent) and queues merge evaluation. Runs on all context types but obeys policy filters. |
| **V2 Chat master prompt** (`master-prompt-builder.ts`) | **Primary output.** Inject policy-filtered `safe_summary` into `<user_profile>`. Every injection is logged to `profile_access_audit`.                                                                                         |
| **V2 Chat tools**                                      | Agent gets `profile.search` with enforced scope/sensitivity filters, plus `profile.update` for profile-context chats. All tool reads/writes are audited.                                                                      |
| **Daily brief** (`OntologyBriefDataLoader`)            | Include relevant profile context. If a project relates to a skill the user is developing, call it out. If user is in burnout recovery, adjust tone.                                                                           |
| **Onboarding**                                         | Seed initial profile chapters from current onboarding answers (`user_context.input_*`). Future: replace with a profile conversation.                                                                                          |

### Example: Agent Using Profile During Project Work

User is chatting about their project "Launch Marketing Site for SaaS Product":

```
User: "I need to figure out positioning for the landing page."

Agent thinking:
  1. Load project context (as today)
  2. Query profile: "marketing positioning experience"
  3. Finds: Career > Lead PM at StartupX → "Led GTM for B2B SaaS,
     positioned product against 3 incumbents by focusing on speed"
  4. Finds: Skills > Go-to-Market Strategy → detail on frameworks used

Agent response:
  "Based on your GTM experience at StartupX, you've positioned B2B SaaS
  before — specifically against incumbents by emphasizing speed. Want to
  use a similar competitive positioning framework here, or try a different
  angle given this is a different market?"
```

---

## Interaction Design

### The Profile Page

A dedicated page at `/profile/me` (or `/me`) with two panels:

**Left panel: Chapter tree** (same DocTreeView component pattern as projects)

- Chapters listed hierarchically
- Can drag/drop to reorganize
- "Add chapter" button
- Unlinked fragments shown as a notification badge

**Right panel: Chapter content**

- Markdown viewer/editor (same as project doc editor)
- "Last updated" timestamp
- "Sources" — which brain dumps or chats contributed to this chapter
- AI-generated summary at the top of each chapter

### The Profile Chat

A chat context (`context_type: 'profile'`) where the agent is specifically in "learn about you" mode.

**Agent behavior in profile chat:**

- Asks open-ended questions
- Follows threads ("You mentioned your partner is a teacher — does that affect your schedule?")
- Periodically organizes what it's learned into chapters
- Shows a "profile updated" indicator when it creates/updates chapters
- Can reference existing chapters ("I see you mentioned woodworking earlier — has that changed?")

**Entry points:**

- Explicit: User clicks "Tell me about yourself" or navigates to profile chat
- Prompted: After onboarding, the agent suggests a profile conversation
- Periodic: "It's been a while since we caught up about you. Anything new?"

### Fragment Review

When profile fragments accumulate from brain dumps or chats:

- **Notification**: "I noticed 5 things about you from recent brain dumps. Want to review?"
- **Review UI**: Card-based, swipeable. Each fragment shows the extracted signal, the source (which brain dump), and a suggested chapter. User can accept (→ update chapter), dismiss, or edit.
- **Batch processing**: "Accept all" for low-friction users

---

## What to Track: Dimensions of a Person

Beyond the obvious (job, education, hobbies), there are deeper dimensions that a therapist-style profile should capture — things that make agent advice genuinely personalized rather than generic.

### Tier 1: Foundational Context (High Priority)

These are the basics that come up constantly in project work:

| Dimension                           | Why It Matters                                | Example Agent Use                                                                                                |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Career history**                  | Past roles reveal transferable skills         | "You managed a team of 12 at StartupX — apply that org design experience here"                                   |
| **Current role & responsibilities** | Grounds advice in day-to-day reality          | "Given you're managing 3 direct reports, this project needs to fit around your management load"                  |
| **Skills & expertise**              | Knows what the user can do vs. needs to learn | "You know SQL well enough to build this dashboard yourself vs. hiring someone"                                   |
| **Relationships & network**         | People are resources and constraints          | "Your mentor James has SaaS experience — worth a conversation before you commit to this pricing model"           |
| **Time & schedule constraints**     | How much bandwidth exists                     | "You said you only have evenings and weekends — this plan needs to be scoped to 5 hrs/week"                      |
| **Active commitments**              | What's competing for attention                | "You're already stretched between the day job and the kids' school activities — adding a third project is risky" |

### Tier 2: Inner Landscape (Medium Priority)

These shape _how_ the agent should work with the user:

| Dimension                          | Why It Matters                                      | Example Agent Use                                                                      |
| ---------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Decision-making style**          | Analysis paralysis vs. gut instinct, risk tolerance | "You tend to over-research before acting — I'll give you a deadline: decide by Friday" |
| **Energy & productivity patterns** | When they're sharp vs. drained                      | "You're a morning person — schedule the hard creative work before noon"                |
| **Values & motivations**           | What actually drives them                           | "This project aligns with your autonomy value — you'd own the whole thing end to end"  |
| **Fears & anxieties**              | What holds them back                                | "You've mentioned fear of public launches before — let's plan a soft launch first"     |
| **Learning style**                 | How they absorb new information                     | "You learn by doing, so skip the tutorial and just build a prototype"                  |
| **Communication preferences**      | How they like to interact                           | "You prefer blunt feedback — here's what's wrong with this plan"                       |
| **Overwhelm threshold**            | How much complexity they can handle at once         | "Let's break this into 3 smaller milestones instead of one big push"                   |

### Tier 3: Life Context (Lower Priority, But Rich)

These create the "whole person" picture that makes cross-domain connections possible:

| Dimension                        | Why It Matters                              | Example Agent Use                                                                            |
| -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Background & upbringing**      | Shapes worldview, provides story material   | "Growing up in a small town gives you an authentic voice for this rural market"              |
| **Education**                    | Formal training, frameworks learned         | "Your MBA capstone was on pricing strategy — revisit that framework"                         |
| **Financial context**            | Budget reality, income goals, pressure      | "You need this to generate revenue within 6 months — that changes the MVP scope"             |
| **Health & wellbeing**           | Energy, limitations, recovery needs         | "You mentioned burnout recovery — let's keep this project low-intensity"                     |
| **Personal goals & aspirations** | Long-term direction                         | "You want to transition to consulting — this project builds your portfolio for that"         |
| **Past failures & lessons**      | What went wrong before                      | "Last time you tried a launch without an audience, it flopped — build the audience first"    |
| **Influences & inspirations**    | People, books, ideas that shaped them       | "You admire how Basecamp runs — apply their 6-week cycle approach here"                      |
| **Personality tendencies**       | Introvert/extrovert, detail vs. big-picture | "You're a big-picture thinker — you'll need someone detail-oriented to execute the ops plan" |
| **Cultural context**             | Norms, languages, community ties            | Relevant for marketing, communication style, audience understanding                          |
| **Support systems**              | Who helps, what resources exist             | "Your partner handles the kids on Saturdays — that's your deep work day"                     |

### Tier 4: Observed Patterns (Agent-Inferred)

These aren't things the user tells us directly — the agent notices them over time:

| Pattern                      | How It's Detected                                 | Example Agent Use                                                                                 |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Procrastination triggers** | Tasks that keep getting deferred                  | "You've pushed this marketing task 3 times — what's the real blocker?"                            |
| **Topic avoidance**          | Things the user never talks about                 | "You have 5 projects but never discuss finances — should we talk about revenue?"                  |
| **Recurring themes**         | Topics that keep coming up across chats           | "Autonomy keeps coming up — it's clearly a core value for you"                                    |
| **Completion patterns**      | What kinds of projects finish vs. stall           | "You finish technical projects but creative ones stall at 60% — let's structure this differently" |
| **Contradiction signals**    | When new info conflicts with old                  | "You said you love marketing, but you've avoided every marketing task for 2 months"               |
| **Growth trajectory**        | Skills/interests developing over time             | "Your woodworking went from hobby to selling on Etsy in 6 months — it's becoming a business"      |
| **Stress indicators**        | Language patterns, shorter messages, more venting | "Your messages have been shorter and more frustrated this week — how are you doing?"              |

---

## Chapter Type Taxonomy

A starting taxonomy for `type_key` on profile documents. Note: not every dimension above needs its own top-level chapter. The tree grows organically — a "Career" chapter might naturally contain decision-making context about career choices, financial goals related to income, etc.

```
# Foundational
chapter.career                    — Employment history, roles
chapter.career.current            — Current job, responsibilities, team
chapter.career.previous           — Past roles, what was learned
chapter.education                 — Degrees, courses, certifications, self-study
chapter.skills                    — Abilities and expertise (technical and soft)
chapter.relationships             — People in the user's life
chapter.relationships.family      — Family, partner, dependents
chapter.relationships.professional — Colleagues, mentors, collaborators, network
chapter.schedule                  — How they work, when, routines, bandwidth

# Inner Landscape
chapter.values                    — What motivates them, what they care about
chapter.personality               — How they operate, preferences, tendencies
chapter.decision_style            — How they make decisions, risk tolerance
chapter.learning                  — How they learn, preferred formats, curiosity areas
chapter.communication             — How they like to interact, feedback preferences
chapter.challenges                — Current struggles, fears, anxieties, blockers

# Life Context
chapter.background                — Where they're from, upbringing, formative experiences
chapter.interests                 — Hobbies, passions, side pursuits
chapter.goals_personal            — Life goals, aspirations, long-term vision
chapter.finances                  — Budget reality, income goals, financial context
chapter.health                    — Physical and mental wellbeing
chapter.influences                — People, books, podcasts, ideas that shaped them
chapter.support                   — Support systems, resources, safety nets

# Meta / Observed
chapter.patterns                  — Agent-observed patterns (auto-generated)
chapter.general                   — Uncategorized
```

This taxonomy helps agents do structured lookups ("find career chapters") while still allowing freeform content within each chapter.

---

## Chat Close Integration: Technical Detail

The cleanest integration point is adding a `processProfileSignals()` step to the existing `chatSessionClassifier.ts` worker.

### Where it fits in the existing pipeline

```
Worker picks up 'classify_chat_session' job
    │
    ├── Load session + messages (up to 50)          ← already done
    ├── LLM classification (title, topics, summary) ← already done
    ├── processSessionActivityAndNextSteps()         ← already done (project sessions)
    │
    └── processProfileSignals()                      ← NEW STEP
            │
            ├── Gate: skip if extraction not enabled
            ├── Load profile policy + safe summary (lightweight, cached)
            ├── LLM extraction call (fast profile, temp 0.3, timeout budgeted)
            │     Input: messages + safe summary + taxonomy
            │     Output: candidate signals (fact_key, category, confidence, sensitivity)
            ├── For each candidate signal:
            │     ├── Compute deterministic idempotency key
            │     ├── Dedup against recent fragments/facts
            │     └── Insert into profile_fragments (pending)
            ├── Queue `profile_merge_run` job (debounced per user)
            └── Mark profile summary stale only if merge applies changes
```

### Key design choices for this step

1. **Runs on all context types, policy-gated** — any chat can carry personal context, but extraction runs only when the user has opted in.
2. **Two-stage processing** — extraction only creates/updates fragments; chapter writes happen in a separate merge job.
3. **Structured merge instead of blind append** — merge job updates chapter facts/sections using conflict checks and creates versioned diffs.
4. **Conflict-aware updates** — contradictory signals (e.g., job/title changes) are marked `status = 'needs_review'`, never auto-applied.
5. **Provenance-first writes** — every AI-applied change links back to source fragments/sessions for explainability and rollback.

### Merge Strategy (Replaces auto-append)

`profile_merge_run` processes pending fragments in batches:

1. Group fragments by `suggested_chapter_id` or inferred chapter type.
2. Build a proposed patch per chapter (insert/update/remove statements, not freeform append-only text).
3. Run deterministic guards:
    - policy check (`usage_scope`, `sensitivity`)
    - contradiction check against current chapter + recent fragments
    - confidence check by category (`career.current` higher bar than `interests`)
4. Apply safe patches automatically; route risky patches to fragment review queue.
5. Write `profile_document_versions` + `profile_document_sources` links for all applied changes.

### SLO and Cost Guardrails

1. **Per-session budget**: `processProfileSignals()` has a hard timeout budget (for example 2.5s wall time). On timeout, skip extraction and continue classification success path.
2. **Debounced merge runs**: max one pending `profile_merge_run` per user in a 5-minute window.
3. **Queue backpressure**: if profile queue depth exceeds threshold, extraction switches to "fragments only, no merge" mode until healthy.
4. **Token/cost cap**: extraction prompt truncates to latest N user-authored messages and enforces max token budget.
5. **Failure semantics**: profile pipeline failures do not fail chat close classification; failures are logged/retried independently.

---

## What We Need to Build

### Phase 1: Foundation

1. **Database tables**: `user_profiles`, `profile_documents`, `profile_document_versions`, `profile_document_embeddings`, `profile_fragments`, `profile_document_sources`, `profile_access_audit`
2. **Policy layer + RLS**: `extraction_enabled`, `usage_scope`, `sensitivity`, row-level policies, and server-side policy checks
3. **Audit plumbing**: `profile_access_audit` writes for prompt injection/search/read/write
4. **Profile service** (`profile.service.ts`): CRUD for profile, chapters, fragments. Doc tree management (fork from `doc-structure.service.ts`) with invariants enforced
5. **API routes**: `/api/profile/me`, `/api/profile/chapters/[id]`, `/api/profile/fragments`
6. **Profile page**: `/me` route with chapter tree + editor
7. **Seed from existing data**: Migrate `user_context.input_*` fields and `user_behavioral_profiles` into initial profile chapters

### Phase 2: Chat Close Integration (The Core Loop)

8. **`processProfileSignals()`** in chat classifier — extraction to fragments only, idempotent, policy-gated
9. **Fragment dedup** — deterministic fingerprint + semantic similarity guard
10. **`profile_merge_run` worker** — structured patch synthesis, contradiction checks, safe auto-apply
11. **Provenance writes** — `profile_document_sources` on every AI-applied chapter mutation
12. **Profile summary pipeline** — regenerate `summary` + `safe_summary` when merge applies changes
13. **Embedding pipeline** — generate/update `profile_document_embeddings` for semantic search
14. **Guardrails** — timeout budgets, queue caps, debounced merges, retries/fallbacks

### Phase 3: Agent Integration

15. **Master prompt injection**: Add policy-filtered `<user_profile>` block to V2 chat `buildMasterPrompt()` with `safe_summary`
16. **Semantic retrieval tool**: Agent tool that searches profile docs by relevance, enforcing scope/sensitivity filters
17. **Profile chat context**: New `context_type: 'profile'` in V2 chat. Agent persona tuned for profile building.
18. **Daily brief integration**: Pull relevant, allowed profile context into brief generation prompts

### Phase 4: Polish

19. **Fragment review UI**: Card-based review for low-confidence and conflict-flagged fragments
20. **Periodic check-in**: Agent occasionally asks profile-deepening questions in regular chats
21. **Pattern detection**: Agent-generated `chapter.patterns` docs from observed behavior over time
22. **Profile insights dashboard card**: "Here's what I know about you" summary on the main dashboard
23. **Data lifecycle jobs**: stale-fragment pruning + account deletion backfill safety checks

---

## Open Questions

1. **Multi-user / shared profiles (future teams)**: If BuildOS adds team features, what exact subset (if any) of profile context is shareable, and under what consent UX?

2. **Onboarding migration path**: Should current 4-field onboarding be immediately replaced by profile chat, or run both for one release to collect quality data?

3. **Merge thresholds by category**: What confidence and contradiction thresholds should be used per chapter type (`career.current` vs `interests`)?

4. **Summary freshness policy**: Event-driven only (on merge apply), or also periodic regeneration for consistency?

5. **Cross-project insight surfacing**: Should profile-derived connections appear in daily brief, in-chat suggestions, project insights feed, or all three?
