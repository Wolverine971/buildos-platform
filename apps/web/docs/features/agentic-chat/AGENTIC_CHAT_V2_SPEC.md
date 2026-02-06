<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_SPEC.md -->

# Agentic Chat V2 - Redesign Spec

**Status:** Draft (Design)
**Owner:** BuildOS
**Date:** 2026-02-05
**Scope:** End-to-end agent-to-chat system redesign with a document-first, fast, and sync-safe architecture.

This spec defines the _next-generation_ agentic chat flow. It is not yet implemented. It intentionally simplifies the current flow and re-centers around:

- Speed and responsiveness (TTFT first, streaming always)
- Document structure as the primary knowledge model
- Clean, typed tool services with predictable side effects
- Front-end and back-end staying in lockstep via event-sourced updates
- Cooperative yielding and backpressure to avoid UI stalls

**Related specs:**

- `apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_PLANNER_SPEC.md`
- `apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_AGENT_STATE_SPEC.md`

---

## 1. Goals

1. **Speed first**: minimize time-to-first-token and reduce total turn latency.
2. **Document-first**: document structure and document content are the primary context and output surface.
3. **Clear context scoping**: global, project, or entity scopes are explicit and drive prompt + tools.
4. **Tight UI sync**: UI reflects the authoritative backend state in near real time.
5. **Simple tool architecture**: CRUD for each ontology entity; edge linking is explicit and consistent.
6. **Streaming and yielding**: long-running tasks never block the event loop.

## 2. Non-Goals

- Rewriting the entire ontology schema.
- Replacing all current endpoints immediately (this is a staged migration).
- Eliminating planner/executor roles (we preserve the separation but simplify coordination).

---

## 3. Core Principles

1. **Context is a product, not a side effect**  
   Build context packs that are concise, structured, and tailored to the selected scope.

2. **LLM outputs are candidates**  
   Treat tool decisions and edits as proposals that can be validated or corrected (lightweight verification loop).

3. **Document structure is the default lens**  
   `onto_projects.doc_structure` is the central knowledge map and must be included in project-scoped contexts.

4. **Streaming is mandatory**  
   Always emit a fast initial response, then continue streaming updates and results.

5. **Yield often, but in batches**  
   Yield in loops and heavy operations using a shared helper; prefer batched yields over per-iteration yields.

---

## 4. Context Types and System Prompt Assembly

### 4.1 Context Scopes (Primary)

```
global   -> multiple projects, lightweight summaries
project  -> a specific project and its doc tree
entity   -> a specific ontology entity within a project
```

### 4.2 Context Pack (Output of Context Assembly)

```ts
type ContextScope = 'global' | 'project' | 'entity';

type ContextPack = {
	scope: ContextScope;
	focus: {
		projectId?: string;
		projectName?: string;
		entityId?: string;
		entityType?: 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk' | 'requirement';
	};
	systemInstructions: string;
	data: {
		docStructure?: DocStructure; // required for project scope
		projectSummary?: string; // short summary, always present in project/entity
		entityDetails?: Record<string, any>; // full entity payload for entity scope
		linkedEntities?: LinkedEntities; // abbreviated by default
		recentActivity?: ActivitySummary; // optional
		userPreferences?: UserPrefs; // optional
		agentState?: AgentState; // structured state snapshot
	};
	retrievalHints: {
		keywords: string[];
		docIds?: string[];
	};
	budgets: {
		maxTokens: number;
		summaryTokens: number;
		recentMessages: number;
	};
};
```

### 4.3 System Prompt Strategy

The system prompt is assembled as:

1. Base system rules (stable)
2. Scope-specific rules (global/project/entity)
3. Document-first guidance (doc structure + doc editing preference)
4. Tool usage constraints (CRUD + edge linking patterns)
5. Optional safety/verification guidance

**Scope-specific guidance**

- **Global**: include lightweight summaries across projects and doc trees; avoid deep entity detail.
- **Project**: include the full `doc_structure`, top doc summaries, and core project metadata.
- **Entity**: include the full entity payload, doc path, linked entities, and related doc context.

### 4.4 Conversation Modes (Clarify vs Act)

The agent should adapt to conversation intent:

- **Clarify**: user is thinking aloud or exploring; keep items in agent state
- **Inform**: user wants knowledge or explanation; avoid creating entities
- **Act**: user issues explicit or strongly implied instructions; proceed with tools

Default to _clarify_ when intent is ambiguous. Be proactive only when the user
signals they want action.

### 4.5 Context Assembly Inputs

Each turn composes the model input from:

1. **System prompt**
2. **User prompt**
3. **Messages** (with rolling summary once over budget)
4. **Tool context** (schemas + selected tool outputs)
5. **Agent state** (structured snapshot described in 8.6)

---

## 5. Rolling Context Window (Performance + Quality)

### 5.1 Context Budget Policy

Always keep:

- Rolling summary (1-2k tokens)
- Last N messages (default 8-12)
- Current turn retrieval only

Never send:

- Full project history on every turn
- Entire doc tree content unless explicitly requested

### 5.2 Compression Strategy

When the conversation exceeds budget:

1. Compress older messages into the rolling summary.
2. Keep the last N messages verbatim.
3. Preserve tool outputs that changed state (as structured facts).

**Compression rules**

- Preserve entity IDs and names.
- Preserve user decisions and approvals.
- Preserve doc edits and key diffs.

### 5.3 Rolling Summary Triggers

Trigger summarization when any condition is met:

- Message count exceeds ~20 turns (configurable)
- Combined chat history exceeds ~5,000 characters (configurable)
- Context token budget is exceeded

**Exception:** If the user pastes a large document and the conversation is about
that document, keep the document content in context and summarize _other_ history
first.

### 5.4 Summarization Execution

Rolling summaries are produced by a **separate summarizer LLM** (not the planner)
to keep the main loop fast and focused. Summaries should:

- preserve factual statements and explicit user intent
- avoid expanding beyond what the user said
- be concise and scoped to the active context

#### Summarizer Interface (Proposed)

**Input:**

- recent message window (to be compressed)
- current rolling summary (if any)
- agent state snapshot (for grounding)
- current agent state snapshot (if any)
- context scope + focus ids

**Output:**

```
{
  summary: string,
  kept_message_ids: string[],
  dropped_message_ids: string[],
  agent_state_item_updates: AgentStateItemUpdate[],
  agent_state_updates: AgentStateUpdate[]
}
```

**Rules:**

- Do not delete or merge agent state items; propose updates only.
- If a large document paste is the focus, keep its content in-context and
  compress surrounding chat instead.

---

## 6. Streaming and Event Model

### 6.1 Mandatory Events

```
session
context_usage
agent_state (thinking / executing / waiting)
text_delta
tool_call
tool_result
operation
entity_patch
error
done
```

### 6.2 Event Delivery Rules

- Emit a fast initial `text_delta` within ~200ms when possible.
- Batch low-priority events; coalesce to keep UI responsive.
- Always end with `done`; send `error` before `done` if needed.

### 6.3 UI Sync Strategy

All state mutations produce **entity_patch** events that represent the backend truth.  
The client applies patches directly to local state and does not "infer" changes from LLM text.

### 6.4 Human-Readable Operation Events

When the agent lists/searches/reads/creates/updates/deletes entities, emit a
human-readable `operation` event with a display name (not raw IDs).

**Required fields:**

```
{
  action: "list" | "search" | "read" | "create" | "update" | "delete",
  entity_type: "document" | "task" | "goal" | "plan" | "project" | "milestone" | "risk" | "requirement",
  entity_name: string,
  status: "start" | "success" | "error",
  entity_id?: string
}
```

If a name is unknown, fetch minimal metadata first (title/name) before emitting
the operation event.

---

## 7. Cooperative Yielding and Backpressure

### 7.1 Yield Helper

Use a shared helper in long loops and streaming:

```ts
await yieldWithAbortCheck({ mode: 'breath', signal });
```

- `breath`: `setTimeout(0)` for UI breathing room
- `fast`: `setImmediate` for hot loops
- `micro`: `Promise.resolve()` only for trivial loops

### 7.2 Yield Placement Rules

Add yields:

- every N iterations in long loops
- after heavy sync work (JSON parsing, sorting, deep clones)
- between emission batches
- on branches that otherwise skip `await`

### 7.3 Backpressure

If the event queue grows:

- coalesce low-priority events
- drop repeated progress updates
- keep tool results and text deltas

---

## 8. Tool Architecture (Clean, Typed, Predictable)

### 8.1 Entity Services (CRUD)

Each ontology entity has a dedicated service:

```
ProjectService
DocumentService
TaskService
GoalService
PlanService
MilestoneService
RiskService
RequirementService
```

Each service exposes:

```
create(entity, projectId)
read(id)
update(id, patch)
delete(id)
```

### 8.2 Edge Linking

Edge creation is **always explicit** and occurs after core CRUD operations:

1. Create or update core entity
2. Link edges via EdgeService

Compound operations (creating multiple entities) must return:

- `entitiesCreated[]`
- `edgesCreated[]`

### 8.3 Search Tools

Provide focused tools instead of overloading one tool:

- Search workspace (global)
- Search project
- List documents
- List tasks
- List goals/plans

Search tools return:

- entity summaries
- IDs for follow-up reads

### 8.4 Document Metadata Lookup (Minimal)

When only names/descriptions/lengths are needed (not content), use a minimal
metadata lookup tool to resolve document IDs from `doc_structure`.

**Proposed tool contract:**

```
get_document_metadata({
  project_id: "<projectId>",
  document_ids: ["doc-1", "doc-2"]
})

// Response
{
  documents: [
    {
      id: "doc-1",
      title: "Competitor Scan",
      description: "Key findings and gaps",
      content_length: 5320,
      updated_at: "2026-02-01T10:22:00Z"
    }
  ]
}
```

Rules:

- Do **not** return full content.
- Support batching to avoid multiple calls.
- Use this before emitting human-readable `operation` events when names are unknown.

### 8.5 Calendar and External Tools

Calendar tools remain separate from ontology CRUD:

- `list_calendar_events`, `create_calendar_event`, etc.

Web tools are separate:

- `web_search`, `web_visit`

Tool selection is gated to reduce unnecessary calls.

### 8.6 Agent State (Scratchpad)

Agent state is the structured, persistent snapshot of what the agent _knows_,
_assumes_, and _expects_ as it reasons. This is the formalized version of the
scratchpad concept.

Agent state should contain:

1. **Current understanding** of relevant entities and dependencies
2. **Assumptions/hypotheses** formed during earlier steps
3. **Expected behaviors/invariants** for actions taken
4. **Tentative/alternative hypotheses** to explore

State rules:

- Do **not** create ontology entities immediately when intent is ambiguous.
- Capture provisional items in a state list (session-scoped).
- Update or discard state items as the user’s intent evolves.
- Promote provisional items to real entities only when the user intent is clear
  (explicit request or strong implied intent).

This supports the “use your best judgment” approach without hard rules, while
keeping the user experience fluid and non-destructive.

#### Agent State Data Shape (Proposed)

```ts
type AgentStateItem = {
	id: string;
	kind: 'task' | 'doc' | 'note' | 'idea' | 'question';
	title: string;
	details?: string;
	status: 'active' | 'resolved' | 'discarded';
	relatedEntityIds?: string[];
	createdAt: string;
	updatedAt: string;
};

type AgentState = {
	sessionId: string;
	current_understanding: {
		entities: Array<{ id: string; kind: string; name?: string }>;
		dependencies: Array<{ from: string; to: string; rel?: string }>;
	};
	assumptions: Array<{
		id: string;
		hypothesis: string;
		confidence: number;
		evidence?: string[];
	}>;
	expectations: Array<{
		action: string;
		expected_outcome: string;
		invariant?: string;
	}>;
	tentative_hypotheses: Array<{
		id: string;
		hypothesis: string;
		reason?: string;
	}>;
	items: AgentStateItem[];
	lastSummarizedAt?: string;
};
```

#### Storage and Lifecycle

- **Storage**: session-scoped (e.g., `chat_sessions.agent_metadata.agent_state`)
- **Retention**: cleared on session close or explicit user request
- **Promotion**: items are promoted to real entities via explicit user intent
  or strong implied intent (planner judgment)

#### Agent State Integration

- Generated/updated **every turn** alongside assistant responses.
- Passed to the LLM as a **separate internal block** (not part of user prompt).
- Updated by the summarizer or planner using structured deltas.

#### Agent State + Summary Coordination

- Agent state stores **specific, granular notes** (names, IDs, commitments)
- Rolling summary stores **compressed narrative** of the conversation
- Summarizer receives agent state as grounding and may propose updates, but
  agent state remains the authoritative list of in-flux items

#### Agent State Update Pipeline (Hybrid, Non-Blocking)

We want **fast streaming** and **high-quality state** without bloating tool calls.
State updates are derived from _existing_ outputs (tool results, patches, and the
final summarizer), not from extra tool calls.

**Sources of truth for state updates:**

1. **Entity patches + tool results (deterministic)**  
   When a tool creates/updates/deletes an entity, we already have structured
   payloads. Use those payloads to update:
    - `current_understanding.entities`
    - `current_understanding.dependencies` (if edges were created)
      These updates require **no extra LLM call** and do not add tool calls.

2. **Planner intent (optional, lightweight)**  
   If the planner already produced a plan or stated an intended action, record
   a minimal expectation entry (e.g., “Creating doc X should produce Y”). This
   can be captured as a structured delta without slowing the stream.

3. **End-of-turn reconciliation (LLM summarizer)**  
   After `done`, a **separate summarizer LLM** reconciles hypotheses, assumptions,
   and tentative alternatives using:
    - recent messages
    - tool results
    - current agent state
      This is the primary mechanism for **assumptions/hypotheses/expectations**.

**Why this avoids tool bloat:**  
We are **not** adding extra tool calls. We reuse existing tool outputs and only
run a small summarizer call after the turn completes.

#### Timing and Streaming Behavior

```
T0: Stream starts → text_delta begins
T1: tool_result / entity_patch emitted → apply deterministic state updates
T2: Stream ends → async summarizer updates hypotheses/expectations
T3: Persist agent state snapshot
```

State updates **never block** streaming. If the summarizer is slow, the user
still receives the response immediately, and the updated state is applied
afterward.

#### Agent State Delta Schema (Proposed)

All state changes are applied as **deltas** to keep updates minimal and safe.

```ts
type AgentStateItemUpdate =
	| { op: 'add'; item: AgentStateItem }
	| { op: 'update'; id: string; patch: Partial<AgentStateItem> }
	| { op: 'remove'; id: string };

type AgentStateUpdate = {
	current_understanding?: {
		entities?: Array<{ id: string; kind: string; name?: string }>;
		dependencies?: Array<{ from: string; to: string; rel?: string }>;
	};
	assumptions?: Array<{
		id: string;
		hypothesis: string;
		confidence: number;
		evidence?: string[];
	}>;
	expectations?: Array<{
		action: string;
		expected_outcome: string;
		invariant?: string;
	}>;
	tentative_hypotheses?: Array<{
		id: string;
		hypothesis: string;
		reason?: string;
	}>;
};
```

**Rules:**

- Apply item updates first, then apply `AgentStateUpdate` patches.
- Never delete assumptions without replacement (mark `confidence: 0`).
- Summarizer emits only deltas, not full state.

#### Orchestration Diagram (State + Stream)

```
User → /api/agent/stream
  → StreamHandler.start()
    → Orchestrator.streamConversation()
      → emit text_delta (TTFT)
      → tool_call → tool_result → entity_patch
      → apply deterministic AgentState deltas (no LLM)
      → continue streaming
    → emit done
    → async Summarizer LLM
       → emit AgentState deltas (hypotheses/expectations)
    → persist AgentState snapshot
```

#### Summarizer Prompt Snippet (Agent State Updates)

Use this prompt with the summarizer LLM after the turn completes:

```
You are updating the agent_state for a BuildOS chat.
Use ONLY the provided messages, tool results, and current agent_state.
Return structured deltas only. Do not invent facts or expand beyond evidence.

Update:
- current_understanding (entities + dependencies)
- assumptions/hypotheses with confidence
- expectations/invariants for actions taken
- tentative/alternative hypotheses (if unresolved)

Output JSON:
{
  "agent_state_item_updates": [...],
  "agent_state_updates": { ... }
}
```

---

## 9. Document-First Behavior

### 9.1 Document Structure Integration

`onto_projects.doc_structure` must be included for project scope and used for:

- navigation and retrieval
- doc organization and creation
- context summarization

**Notes:**

- `doc_structure` stores hierarchy only (no doc content).
- Do **not** load document tree metadata or document content by default.
- Prefer the prewarmed doc_structure cache (titles + description + content_length) for the JSON snippet.
- Every node must include **order**; treat it as canonical sibling ordering.
- Full document content should be fetched _selectively_ on demand.

### 9.2 Doc Structure Purpose (Project Topology)

The doc structure is the **bird’s‑eye map** of project knowledge. It captures the
topology of what’s known (research, decisions, specs, notes) while other ontology
entities remain more **ephemeral** (tasks, goals, plans change frequently).

Key distinctions:

- **Doc structure = durable knowledge map** (where information lives)
- **Tasks/Goals/Plans = peripheral and malleable** (execution and intent shifting)

The agent should treat `doc_structure` as the primary index for:

- locating prior research and decisions
- understanding project knowledge coverage and gaps
- deciding where new information should live

### 9.3 Doc Structure Navigation Behavior

The agent should fluidly traverse the doc tree:

- identify relevant documents by _path_ (even 2–4 levels deep)
- request the minimal doc content needed to answer the question
- resolve names via list/search tools before reading content

**Example:** “Need to check the 3‑level‑deep research doc in the tree” should
result in a targeted document fetch rather than broad retrieval.

### 9.4 Prompt Snippet: Doc Structure Navigation (Simple)

Use this in the system prompt to teach doc tree traversal. Keep it short and
actionable.

```
You have access to the project doc_structure as JSON. Each node includes:
- id (document UUID)
- order (sibling order)
- children (nested nodes)

Goal: Use doc_structure to locate the right document ID, then selectively load
only the document(s) you need.

Doc Structure (example):
{
  "version": 1,
  "root": [
    { "id": "doc-001", "order": 0, "children": [] },
    {
      "id": "doc-009",
      "order": 1,
      "children": [
        { "id": "doc-010", "order": 0, "children": [] }
      ]
    }
  ]
}

If you need names/titles first, call a lightweight list/search:
list_onto_documents({ project_id: "<projectId>", limit: 50 })
search_onto_documents({ query: "keyword", project_id: "<projectId>" })

When you need full details from a specific doc, call:
get_onto_document_details({ document_id: "<docId>" })

When you create new knowledge, place it under the correct parent in the tree by:
create_onto_document({
  project_id: "<projectId>",
  parent_id: "<parentDocId>",
  title: "...",
  description: "...",
  content: "..."
})
```

### 9.5 Document-Centric Responses

If a user asks for structure, plans, or overviews:

- update documents first
- optionally create tasks as secondary

If a user asks for execution:

- tasks or plans are primary, documents are secondary

### 9.6 Project Context Document (Minimal Content)

When creating a project, create a **context document** that captures:

- purpose, vision, and intent in the user’s words
- scope constraints and any explicit goals

Guidelines:

- do not over-interpret or expand beyond what the user said
- keep it concise; add detail only when the user requests it
- treat this document as the “where we left off” anchor

---

## 10. Planning and Verification Loop (Stage-Aware)

Planning is a first-class primitive. The planner can generate a staged plan with
sequenced and parallelized work, then delegate steps to executor agents.

### 10.1 Planner Responsibilities

- Identify which steps must run **in sequence** vs **in parallel**
- Assign each step to a specific **executor agent** (or keep in planner)
- Capture dependencies explicitly so the orchestrator can schedule correctly
- Minimize unnecessary tool calls; gate tool usage

### 10.2 Plan Structure (Stage + DAG)

Plans are expressed as **stages**. A stage can contain one or more steps that may
run in parallel, but stages themselves run in order.

```ts
type PlanStage = {
	id: string;
	name: string;
	mode: 'parallel' | 'sequence';
	steps: PlanStep[];
};

type PlanStep = {
	id: string;
	title: string;
	intent: 'research' | 'analysis' | 'draft' | 'edit' | 'create' | 'update' | 'review';
	executor: 'planner' | 'research' | 'writer' | 'editor' | 'tooling';
	tools?: string[];
	inputs?: string[]; // ids of dependent steps
	outputs?: string[]; // artifacts produced (doc ids, task ids, etc.)
};

type AgentPlan = {
	id: string;
	goal: string;
	stages: PlanStage[];
	constraints?: string[];
};
```

**Rule:** Steps within the same stage can run in parallel unless an explicit
dependency is declared in `inputs`.

### 10.3 Example

Stage 1 (parallel research):

- research market trends
- research competitors
- research user needs

Stage 2 (sequence synthesis):

- summarize research into doc outline
- draft document
- review/edit document

### 10.4 Execution Semantics

- Orchestrator executes stages **in order**
- Within a stage:
    - `mode: parallel` → run steps concurrently with a concurrency cap
    - `mode: sequence` → run steps in order
- Each step can spawn an **executor agent** with a scoped context pack
- All executor results emit **entity_patch** events or structured outputs

### 10.5 Lightweight Verification

For high-impact writes:

- Validate required fields before execution
- Optionally request user confirmation for irreversible actions

---

### 10.6 Minimal Plan Flow

1. **Analyze**: classify scope and decide if tools are needed
2. **Plan**: propose a staged plan with parallel/sequence steps
3. **Execute**: run steps with validation and tool gating
4. **Respond**: stream results + entity patches

## 11. Performance Baselines

Target budgets:

- TTFT < 500ms (best effort)
- Context assembly < 200ms
- First tool call decision < 1s

Key optimizations:

- context pack caching (short TTL)
- single "context bundle" DB query
- parallelize retrieval and routing
- stream immediately before long tool calls

---

## 12. Phased Delivery Plan (with Expected Gains)

### Phase 1 — Context Foundation (Doc-Structure-Only) ✅

**Build:**

- ContextPack wiring (doc_structure only, no doc tree/content)
- Operation events with human-readable names
- Minimal tool gating for list/search/read

**Expected gains (estimate):**

- 30–60% prompt size reduction (no doc content)
- 150–400ms faster TTFT from smaller prompts

### Phase 2 — Selective Loading + Agent State/Summary ✅

**Build:**

- Summarizer LLM integration + agent state sync
- Selective document loading rules
- Updated AgentChatModal event rendering (operation feed)

**Expected gains (estimate):**

- 20–40% reduction in average tool calls
- More stable latency on long chats (lower variance)

### Phase 3 — Planner/Executor Parallelization ✅

**Build:**

- Stage-aware plans with parallel steps
- Executor agent fan-out with concurrency caps
- Yield/backpressure helpers in long loops

**Expected gains (estimate):**

- 25–50% faster completion for multi-step tasks
- Improved UI responsiveness under heavy workloads

### Phase 4 — Caching + Prewarm (In Progress)

**Build:**

- Cache doc_structure and doc metadata (short TTL)
- Prewarm critical context on focus change
- Route doc_structure cache into prompt context (JSON snippet, no doc content)

**Expected gains (estimate):**

- Additional 100–300ms shaved per turn on warm sessions

---

## 13. Open Questions

1. How do we persist and version the rolling summary for auditability?
2. What should be the default retention policy for agent state items?
3. Should the agent state be visible in the UI (explicit panel) or implicit in chat?
