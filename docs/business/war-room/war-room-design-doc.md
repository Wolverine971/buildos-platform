# Project War Room - Design Document

## Executive Summary

The Project War Room is an interactive scenario planning and stress-testing feature for Build OS that leverages AI's predictive capabilities to help users anticipate challenges, identify vulnerabilities, and prepare contingency plans for their projects. Through guided scenario exploration and interactive decision-making, users can battle-test their projects before critical moments.

---

## Core Concept

### Vision

Transform project planning from reactive to proactive by creating a dedicated space where users can:

- Stress-test project assumptions
- Explore "what-if" scenarios with AI-powered forecasting
- Identify hidden risks and opportunities
- Build resilience through contingency planning
- Make better-informed strategic decisions

### Key Principles

1. **Interactive Exploration**: Scenarios unfold through user choices, not static reports
2. **Contextual Intelligence**: Leverages existing project context for relevant scenarios
3. **Actionable Insights**: Every scenario produces concrete preparation strategies
4. **Progressive Disclosure**: Start simple, dive deep as needed
5. **Learning Through Play**: Gamified exploration reduces planning anxiety

---

## User Flow Architecture

### 1. Entry Point & Project Selection

**UI Location**: `/war-room` or accessible via project dropdown menu

**Initial State**:

- Grid/list view of all active projects
- Visual indicators showing war room readiness status:
  - ✅ Green: Ready for war room
  - 🟡 Yellow: Partially ready (can proceed with limitations)
  - ❌ Red: Not ready (needs more context)

### 2. Readiness Assessment

When a project is selected, the system evaluates readiness across multiple dimensions:

#### Required Criteria (Must Have)

- **Clear Goals**: Defined objectives in project context
- **Scope Definition**: Boundaries of what's included/excluded
- **Timeline**: Start date and target end date
- **Context Depth**: Minimum 500 words of rich context

#### Recommended Criteria (Should Have)

- **Success Metrics**: Quantifiable outcomes defined
- **Resource Allocation**: Team, budget, tools identified
- **Risk Awareness**: At least 3 known risks documented
- **Stakeholder Map**: Key people/groups identified
- **Dependencies**: Critical dependencies mapped
- **Current Progress**: >10% completion (not just ideation)
- **Decision Points**: Key upcoming decisions identified

#### Readiness Score Calculation

```typescript
interface ReadinessScore {
  overall: number; // 0-100
  required: {
    goals: boolean;
    scope: boolean;
    timeline: boolean;
    context: boolean;
  };
  recommended: {
    metrics: boolean;
    resources: boolean;
    risks: boolean;
    stakeholders: boolean;
    dependencies: boolean;
    progress: boolean;
    decisions: boolean;
  };
  missingElements: string[];
  recommendations: string[];
}
```

### 3. Readiness Remediation Flow

**If Not Ready**: Interactive wizard to gather missing information

```markdown
## Quick Setup Wizard

We need a bit more information to run effective scenarios:

### 1. Project Goals (Required)

"What does success look like for this project?"
[Text area with examples]

### 2. Timeline (Required)

"When do you plan to complete this?"
[Date picker]

### 3. Key Risks (Recommended)

"What keeps you up at night about this project?"
[+ Add Risk buttons]

[Skip remaining] [Complete Setup]
```

### 4. Scenario Generation Mode Selection

**Two Primary Modes**:

#### A. Custom Scenario Testing

```markdown
## Test Your Scenario

Describe a specific situation you want to explore:
[Large text area]

Example: "What if our main competitor launches a similar product
two months before our planned release?"

### Customization Options:

- Variation Count: [1-5 slider]
  "How many different ways could this play out?"
- Time Horizon: [Dropdown: 1 month, 3 months, 6 months, 1 year]
  "How far into the future should we project?"
- Focus Areas: [Multi-select checkboxes]
  □ Team Impact
  □ Timeline Effects  
  □ Budget Implications
  □ Technical Challenges
  □ Market Dynamics
  □ Stakeholder Reactions

[Generate Scenarios]
```

#### B. AI-Generated Scenarios

```markdown
## Discover Potential Scenarios

Let AI identify critical scenarios to explore:

### Scenario Categories:

□ Black Swan Events (low probability, high impact)
□ Resource Challenges (team, budget, time)
□ Competitive Dynamics
□ Technical Hurdles
□ Market Shifts
□ Opportunity Windows
□ Regulatory Changes

### Scenario Intensity:

○ Mild (everyday challenges)
● Moderate (significant but manageable)
○ Severe (crisis-level events)

[Generate 5 Scenarios]
```

### 5. Scenario Presentation Format

Each generated scenario follows this structure:

```markdown
## Scenario: [Title]

### What Happened

[1-2 sentences describing the triggering event]

### What This Affected

[2-3 bullet points on immediate impacts]

### Possible Outcomes

1. **Best Case** (20% probability)
   [Brief description]
2. **Likely Case** (60% probability)
   [Brief description]
3. **Worst Case** (20% probability)
   [Brief description]

[Explore This Scenario] [Try Different Scenario] [Adjust Parameters]
```

### 6. Interactive Scenario Exploration

**Stage-Based Navigation System**:

```markdown
## Current Stage: 2B - Market Response

[Stage Progress Bar: ○──●──○──○──○]

### Navigation Controls

[← Back to Stage 2A] [Stage Overview ▼] [Restart Scenario]

### Stage Narrative

_After accelerating your timeline (Stage 1 decision), your competitor responds
by announcing a major partnership with Enterprise Corp..._

**Current Metrics:**

- Success Probability: 62% (↓8% from Stage 1)
- Risk Level: High
- Opportunity Score: 7/10

**What's Happening:**

- Competitor gains enterprise credibility
- Your investor calls emergency meeting
- Team suggests pivoting to SMB market

**Decision Point: How do you respond to the partnership news?**

A) Double down on enterprise features [See probable outcome →]
B) Pivot to underserved SMB market [See probable outcome →]
C) Seek your own strategic partnership [See probable outcome →]
D) Focus on product differentiation [See probable outcome →]

[💡 View AI Suggestions] [📝 Update Project] [💾 Save & Exit]
```

**Stage Tree Visualization**:

```
Stage 1 (Root)
├── Stage 2A (Choice A selected)
│   ├── Stage 3A.A
│   ├── Stage 3A.B
│   └── Stage 3A.C
├── Stage 2B (Choice B - Current)
│   ├── Stage 3B.A (Unexplored)
│   └── Stage 3B.B (Unexplored)
└── Stage 2C (Unexplored)
```

### 7. Project Update Integration

**Update Project Button Flow**:

When user clicks "📝 Update Project" at any stage:

```markdown
## Update Project Based on Scenario Insights

This scenario has revealed important insights. Select what you'd like to update:

### Update Options:

☑ **Project Context**
Add strategic insights about competitive positioning

☑ **Tasks**
Create action items for identified vulnerabilities

☐ **Phases**
Adjust project timeline and milestones

☑ **Use AI Suggestions**
Let AI recommend specific updates based on this scenario

[Preview Updates →]
```

**Update Preview & Approval**:

````markdown
## Proposed Updates

### Project Context Updates

**Adding to ## Competitive Analysis section:**

```diff
+ Partnership risk identified: Competitors may leverage enterprise
+ partnerships for credibility. Mitigation: Build 3 enterprise
+ proof-of-concepts before launch.
```
````

### New Tasks (5)

1. **Research enterprise partnership opportunities**
   - Priority: High
   - Duration: 2 hours
   - Due: Next 7 days

2. **Create competitive differentiation matrix**
   - Priority: High
   - Duration: 90 min
   - Due: Next 3 days

[... 3 more tasks]

### Impact Analysis

- **Success Probability**: Would increase from 62% to 71%
- **Timeline Impact**: Adds ~2 weeks of prep work
- **Resource Needs**: Requires business development support

[✅ Apply Updates] [✏️ Modify] [❌ Cancel]

○ Recalculate scenario with these updates

````

### 8. AI Suggestions Panel

**Collapsible Suggestions Interface**:

```markdown
💡 AI Suggestions [Expand ▼]
├── Vulnerabilities Detected (3)
├── Opportunities Available (2)
├── Recommended Actions (4)
└── Strategic Insights (2)
````

**Expanded View**:

```markdown
💡 AI Suggestions

### 🔴 Vulnerabilities Detected

1. **No enterprise proof points**
   Your project lacks enterprise credibility markers
   [Create Mitigation Task →]

2. **Single point of failure on timeline**
   Accelerating without buffer creates cascading risk
   [Add Buffer Phase →]

### 🟢 Opportunities Available

1. **SMB market underserved**
   Competitor focusing up-market leaves gap
   [Explore Pivot Scenario →]

### ⚡ Recommended Actions

1. Build partnership pipeline now (before needed)
2. Create "Why us vs them" positioning doc
3. Identify 3 enterprise beta customers
4. Develop partnership evaluation criteria

### 🎯 Strategic Insights

- Speed without differentiation amplifies competition risk
- Enterprise partnerships take 3-6 months to materialize

[Convert All to Tasks] [Add to Project Notes] [Dismiss]
```

---

## Data Models

### War Room Sessions Table

```sql
CREATE TABLE war_room_sessions (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    collaborators UUID[], -- Array of user IDs for collaboration
    session_type TEXT CHECK (session_type IN ('custom', 'generated', 'collaborative')),
    session_status TEXT CHECK (session_status IN ('active', 'paused', 'completed', 'archived')),
    readiness_score JSONB,
    initial_scenario TEXT,
    scenario_parameters JSONB,
    current_stage_id UUID, -- Points to current position in exploration
    project_snapshot JSONB, -- Project state at session start for comparison
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

### Scenario Stages Table (Tree Structure)

```sql
CREATE TABLE scenario_stages (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES war_room_sessions(id) ON DELETE CASCADE,
    parent_stage_id UUID REFERENCES scenario_stages(id), -- NULL for root
    stage_number INTEGER, -- 1, 2, 3, etc.
    branch_path TEXT, -- e.g., "1.A.2.B" for navigation

    -- Stage Content
    stage_title TEXT,
    narrative_content TEXT,
    situation_description TEXT,

    -- Decisions & Choices
    decision_point TEXT, -- The question posed to user
    available_choices JSONB[], -- Array of possible decisions
    selected_choice JSONB, -- What the user chose

    -- Metrics & Analysis
    success_probability INTEGER, -- 0-100 at this stage
    risk_score INTEGER, -- 0-100
    opportunity_score INTEGER, -- 0-100
    resilience_rating TEXT CHECK (resilience_rating IN ('fragile', 'vulnerable', 'stable', 'robust', 'antifragile')),

    -- AI Analysis
    vulnerabilities_identified JSONB[],
    opportunities_identified JSONB[],
    immediate_impacts JSONB,
    cascading_effects JSONB,

    -- Suggestions & Recommendations
    ai_suggestions JSONB, -- Structured suggestions for this stage
    user_notes TEXT,

    -- Metadata
    explored_at TIMESTAMP,
    created_by UUID REFERENCES users(id), -- For collaborative sessions
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient tree traversal
CREATE INDEX idx_scenario_stages_tree ON scenario_stages(session_id, parent_stage_id);
CREATE INDEX idx_scenario_stages_path ON scenario_stages(session_id, branch_path);
```

### Project Updates from Scenarios Table

```sql
CREATE TABLE scenario_project_updates (
    id UUID PRIMARY KEY,
    stage_id UUID REFERENCES scenario_stages(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    update_type TEXT[] CHECK (update_type <@ ARRAY['context', 'tasks', 'phases', 'notes']),

    -- Proposed Changes
    proposed_changes JSONB, -- Detailed breakdown of what will change
    ai_rationale TEXT, -- Why these changes are suggested

    -- User Review
    user_approved BOOLEAN,
    user_modifications JSONB, -- Any tweaks user made
    applied_at TIMESTAMP,

    -- Impact Analysis
    scenario_recalculation_needed BOOLEAN DEFAULT FALSE,
    impact_on_success_probability INTEGER, -- Delta in percentage

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### War Room Insights Table

```sql
CREATE TABLE war_room_insights (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    stage_id UUID REFERENCES scenario_stages(id),
    insight_type TEXT CHECK (insight_type IN ('vulnerability', 'opportunity', 'preparation', 'dependency', 'assumption')),
    insight_content TEXT,
    priority TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    source_session_id UUID REFERENCES war_room_sessions(id),
    converted_to_task BOOLEAN DEFAULT FALSE,
    task_id UUID REFERENCES tasks(id), -- If converted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Collaboration Activity Table

```sql
CREATE TABLE war_room_collaboration (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES war_room_sessions(id),
    user_id UUID REFERENCES users(id),
    stage_id UUID REFERENCES scenario_stages(id),
    activity_type TEXT CHECK (activity_type IN ('comment', 'vote', 'suggest_choice', 'alternative_scenario')),
    activity_content JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## AI Processing Pipeline

### 1. Readiness Assessment Algorithm

```typescript
async function assessReadiness(project: Project): ReadinessScore {
  // Analyze project context depth and quality
  // Check for required elements
  // Calculate recommendation score
  // Generate specific improvement suggestions
}
```

### 2. Scenario Generation Prompt Framework

```typescript
const scenarioPrompt = `
Given this project context: ${project.context}

Generate ${count} realistic scenarios that could impact this project.

Consider:
- Current project phase: ${project.phase}
- Known risks: ${project.risks}
- Dependencies: ${project.dependencies}
- Industry context: ${derivedContext}
- Time horizon: ${parameters.timeHorizon}

Each scenario should:
1. Be plausible but challenging
2. Test different aspects of the project
3. Reveal hidden assumptions
4. Lead to actionable insights

Format: [Specified structure]
`;
```

### 3. Interactive Narrative Engine

```typescript
const narrativeEngine = {
  generateChapter: (scenario, previousDecisions, projectContext) => {
    // Create narrative beat
    // Generate 3-4 meaningful choices
    // Predict realistic consequences
    // Maintain narrative coherence
  },

  calculateOutcomes: (decisions, scenario, projectContext) => {
    // Assess decision quality
    // Generate success probability
    // Identify key learnings
    // Create actionable recommendations
  },
};
```

---

## UI/UX Components

### Visual Design Language

- **Military/Strategic Theme**: Subtle hints without being overwhelming
- **Color Coding**:
  - Green: Opportunities, strengths
  - Yellow: Caution points, decisions needed
  - Red: Vulnerabilities, critical risks
  - Blue: Informational, neutral
- **Interactive Elements**:
  - Scenario cards with hover states
  - Decision buttons with consequence previews
  - Animated probability gauges
  - Timeline visualizations for decision paths

### Mobile Considerations

- Bottom sheet pattern for scenario selection
- Swipeable scenario cards
- Touch-friendly decision buttons (min 44px)
- Horizontal scroll for outcome variations
- Collapsed/expanded states for deep dives

### Component Library

```typescript
// Core Components
<ScenarioCard />
<ReadinessGauge />
<DecisionPoint />
<OutcomeVariation />
<ProbabilityMeter />
<TimelineVisualizer />
<RecommendationCard />
<VulnerabilityAlert />

// Layouts
<WarRoomDashboard />
<ScenarioExplorer />
<DeepDiveNarrative />
<AnalysisReport />
```

## Collaboration Design

### Collaboration Models

#### 1. **Asynchronous Commentary** (Simplest)

Team members can:

- View any war room session for their shared projects
- Add comments at specific stages
- Suggest alternative choices with rationale
- Vote on decisions before they're made
- See what paths others explored

**UI Example**:

```markdown
Stage 2B | 3 team comments

@sarah: "We should consider the SMB pivot - enterprise
sales cycles are too long for our runway"

@mike: "Disagree - our tech advantage is in enterprise scale"

[View full discussion →]
```

#### 2. **Turn-Based Exploration** (Moderate Complexity)

- Session owner invites collaborators
- Each person takes turns making decisions
- Others can suggest/vote but one person decides
- Automatic notification when it's your turn
- "Pass" option if someone is unavailable

#### 3. **Parallel Universes** (Most Insightful)

- Each team member explores same scenario independently
- System shows divergence points and different outcomes
- Heat map visualization of decision consensus
- AI synthesizes learnings across all paths

**Comparison View**:

```markdown
## Team Exploration Summary: Competitor Launch Scenario

### Decision Consensus

Stage 1: 3/4 chose "Accelerate timeline"
Stage 2: Split decision (2 pivot, 2 partnership)
Stage 3: Converged on "Differentiate features"

### Outcome Variance

Sarah's path: 72% success
Mike's path: 58% success  
Alex's path: 81% success
Team average: 70% success

### Key Insights

- Partnership strategy divisive but high-impact
- All paths identified timeline as critical risk
- Alex's differentiation approach most successful

[Compare Paths] [Synthesize Learnings]
```

#### 4. **War Council Mode** (Real-time)

- Scheduled synchronous session (like a meeting)
- Screen sharing of scenario exploration
- Real-time voting on decisions
- Discussion thread per stage
- Facilitator role rotates or assigned
- Session recording for absent members

### Recommended Approach: Phased Rollout

**Phase 1**: Asynchronous commentary only

- Low complexity, high value
- Tests collaboration infrastructure
- Gathering feedback on needs

**Phase 2**: Add parallel universes

- Most unique value proposition
- Differentiates from simple planning tools
- Rich insights from divergent thinking

**Phase 3**: Full collaboration suite

- Turn-based for detailed planning
- War Council for critical decisions
- Based on user demand

### Scenario Templates by Project Type

- **Software Projects**: Launch delays, technical debt, scaling issues
- **Creative Projects**: Inspiration blocks, audience reception, platform changes
- **Business Ventures**: Funding gaps, competitor moves, market shifts
- **Personal Goals**: Life changes, motivation cycles, external pressures

### Multiplayer Scenarios (Future)

- Team members take different roles
- Collaborative decision-making
- Perspective switching (CEO, Developer, Customer)
- Consensus building mechanics

### Historical Learning

- System learns from past scenarios across all users
- Pattern recognition for common failure modes
- Industry-specific scenario libraries
- Success pattern identification

### Integration Points

- **Task Generation**: Create tasks from recommendations
- **Calendar Blocking**: Reserve time for contingency planning
- **Note Capture**: Save insights as project notes
- **Context Updates**: Enrich project context with learnings
- **Phase Adjustments**: Modify project phases based on scenarios

---

## Implementation Priorities

### Phase 1: MVP (Week 1-2)

1. **Data Models & Infrastructure**
   - Create stage tree tables with parent-child relationships
   - Build session management system
   - Implement stage navigation logic

2. **Readiness Assessment**
   - Basic readiness scoring algorithm
   - Simple remediation wizard
   - Project snapshot capability

3. **Basic Scenario Generation**
   - AI-generated scenarios only (no custom yet)
   - 3-stage depth limit initially
   - Simple success metrics

4. **Core Navigation**
   - Forward progression through stages
   - Basic back navigation
   - Stage tree visualization (text-based)

### Phase 2: Interactivity (Week 3-4)

1. **Project Update System**
   - Checkbox selection interface
   - AI proposal generation
   - Update preview with diffs
   - Apply updates to project

2. **Enhanced Navigation**
   - Visual tree explorer
   - Branch comparison
   - Stage jumping

3. **Custom Scenarios**
   - User scenario input
   - Parameter customization
   - Variation generation

4. **Suggestions Panel**
   - Collapsible AI insights
   - Vulnerability/opportunity detection
   - One-click task creation

### Phase 3: Polish (Week 5-6)

1. **Session Management**
   - Save and continue
   - Session history dashboard
   - Progress tracking
   - Export capabilities

2. **Advanced Metrics**
   - Probability calculations at each stage
   - Risk/opportunity scoring
   - Success path optimization
   - Impact analysis

3. **Mobile Optimization**
   - Bottom sheet modals
   - Touch gestures
   - Responsive tree view
   - Offline caching

4. **Performance**
   - Implement caching strategy
   - Optimize tree operations
   - Stream scenario generation
   - Background saves

### Phase 4: Collaboration (Future)

1. **Asynchronous Comments**
   - Stage-level discussions
   - Vote on decisions
   - Alternative suggestions

2. **Parallel Universe Mode**
   - Multiple user paths
   - Comparison visualizations
   - Synthesis reports

3. **Advanced Features**
   - War Council mode
   - Turn-based exploration
   - Team analytics
   - Scenario templates by industry

---

## Success Metrics

### User Engagement

- Sessions per project
- Scenario completion rate
- Decisions per session
- Return usage rate

### Value Metrics

- Tasks created from recommendations
- Projects with improved success probability
- Caught risks before they materialized
- Time saved through preparation

### Quality Metrics

- Scenario relevance rating
- Recommendation usefulness score
- Prediction accuracy (long-term)
- User confidence increase

---

## Open Questions & Considerations

1. **Scenario Persistence**: How long to retain scenario history?
2. **Sharing Mechanism**: Should users share scenarios with team/public?
3. **Scenario Confidence**: How to communicate AI uncertainty?
4. **Gamification Balance**: How much game mechanics vs serious planning?
5. **Custom Scenario Library**: Should users save/reuse scenarios?
6. **Feedback Loop**: How to validate if predictions were accurate?

---

## Technical Implementation Notes

### Stage Navigation System

```typescript
interface ScenarioStage {
  id: string;
  sessionId: string;
  parentStageId: string | null;
  stageNumber: number;
  branchPath: string; // "1.A.2.B.3.C"

  // Navigation helpers
  children: ScenarioStage[];
  parent: ScenarioStage | null;
  siblings: ScenarioStage[];

  // Content
  narrative: StageNarrative;
  metrics: StageMetrics;
  suggestions: AISuggestion[];

  // State
  explored: boolean;
  selectedChoice: Choice | null;
  projectUpdates: ProjectUpdate[];
}

class ScenarioTreeNavigator {
  currentStage: ScenarioStage;
  stageHistory: ScenarioStage[];

  // Navigation methods
  goToStage(stageId: string): void;
  goBack(): void;
  exploreChoice(choice: Choice): ScenarioStage;

  // Tree operations
  getUnexploredBranches(): ScenarioStage[];
  getAlternativePaths(): ScenarioPath[];
  compareOutcomes(stageIds: string[]): Comparison;

  // Expansion
  extendCurrentBranch(): Promise<ScenarioStage>;
  createVariation(stage: ScenarioStage): Promise<ScenarioStage>;

  // Persistence
  saveProgress(): Promise<void>;
  loadSession(sessionId: string): Promise<void>;
}
```

### Project Update Flow

```typescript
interface ProjectUpdateRequest {
  stageId: string;
  updateTypes: ("context" | "tasks" | "phases" | "notes")[];
  useAISuggestions: boolean;
}

interface ProjectUpdateProposal {
  contextUpdates: {
    section: string;
    operation: "append" | "replace" | "prepend";
    content: string;
    diff: string; // Visual diff for user review
  }[];

  newTasks: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    estimatedDuration: number;
    suggestedDate: Date;
    rationale: string;
  }[];

  phaseAdjustments: {
    phaseId: string;
    changes: string[];
    newDates?: { start: Date; end: Date };
  }[];

  notes: {
    content: string;
    category: "insight" | "risk" | "opportunity";
  }[];

  impactAnalysis: {
    successProbabilityDelta: number;
    timelineImpact: string;
    resourceRequirements: string[];
  };
}

async function processProjectUpdate(
  request: ProjectUpdateRequest,
): Promise<ProjectUpdateProposal> {
  const stage = await getStage(request.stageId);
  const project = await getProject(stage.projectId);

  // Generate AI proposals based on stage insights
  const proposal = await generateUpdateProposal(stage, project, request);

  return proposal;
}
```

### API Endpoints

```typescript
// Session Management
POST   /api/war-room/sessions/create
GET    /api/war-room/sessions/:projectId
GET    /api/war-room/session/:sessionId
PUT    /api/war-room/session/:sessionId/continue
DELETE /api/war-room/session/:sessionId

// Readiness & Setup
POST   /api/war-room/assess-readiness
POST   /api/war-room/remediate-readiness
GET    /api/war-room/readiness-criteria

// Scenario Generation
POST   /api/war-room/generate-scenarios
POST   /api/war-room/generate-custom-scenario

// Stage Navigation
GET    /api/war-room/stage/:stageId
POST   /api/war-room/stage/:stageId/explore-choice
POST   /api/war-room/stage/:stageId/extend
POST   /api/war-room/stage/:stageId/create-variation
GET    /api/war-room/stage/:stageId/tree
GET    /api/war-room/stage/:stageId/suggestions

// Project Updates
POST   /api/war-room/stage/:stageId/propose-updates
POST   /api/war-room/stage/:stageId/apply-updates
POST   /api/war-room/stage/:stageId/recalculate

// Collaboration
GET    /api/war-room/session/:sessionId/collaborators
POST   /api/war-room/session/:sessionId/invite
POST   /api/war-room/stage/:stageId/comment
POST   /api/war-room/stage/:stageId/vote
GET    /api/war-room/session/:sessionId/parallel-paths

// Analytics
GET    /api/war-room/project/:projectId/insights
GET    /api/war-room/project/:projectId/vulnerability-coverage
GET    /api/war-room/session/:sessionId/analytics
```

### State Management

```typescript
interface WarRoomState {
  // Session State
  currentSession: WarRoomSession | null;
  sessionHistory: WarRoomSession[];

  // Navigation State
  currentStage: ScenarioStage | null;
  stageTree: Map<string, ScenarioStage>;
  navigationHistory: string[]; // Stage IDs
  expandedNodes: Set<string>; // For tree UI

  // Project State
  selectedProject: Project | null;
  readinessScore: ReadinessScore | null;
  projectSnapshot: Project | null; // Original state

  // Scenario State
  availableScenarios: Scenario[];
  customScenarioDraft: string;

  // Update State
  proposedUpdates: ProjectUpdateProposal | null;
  updateHistory: ProjectUpdate[];

  // Collaboration State
  collaborators: User[];
  comments: Map<string, Comment[]>;
  parallelPaths: Map<string, ScenarioPath>;

  // UI State
  suggestionsExpanded: boolean;
  treeViewMode: "compact" | "detailed";
  compareMode: boolean;
  selectedStagesForComparison: string[];
}

// Svelte Store Structure
export const warRoomStore = writable<WarRoomState>(initialState);

// Derived Stores
export const currentStageMetrics = derived(
  warRoomStore,
  ($store) => $store.currentStage?.metrics,
);

export const unexploredBranches = derived(warRoomStore, ($store) => {
  if (!$store.stageTree) return [];
  return Array.from($store.stageTree.values()).filter(
    (stage) => !stage.explored,
  );
});

export const vulnerabilityCount = derived(warRoomStore, ($store) => {
  if (!$store.currentStage) return 0;
  return $store.currentStage.suggestions.filter(
    (s) => s.type === "vulnerability",
  ).length;
});
```

### Performance Considerations

- **Lazy Loading**: Load stage content only when navigating to it
- **Tree Virtualization**: For large scenario trees, virtualize the tree view
- **Streaming Generation**: Stream scenario narrative for better perceived performance
- **Diff Caching**: Cache project update diffs for quick preview
- **Optimistic Updates**: Apply UI changes before server confirmation
- **Background Persistence**: Save progress periodically without blocking UI
- **Prefetch Next Stages**: Anticipate likely navigation and prefetch
- **Compression**: Compress stage tree for efficient storage/transfer

### Mobile Optimizations

- **Touch Gestures**: Swipe to navigate between stages
- **Collapsible Panels**: All suggestion/update panels collapse on mobile
- **Bottom Sheet Modals**: Update proposals in bottom sheets
- **Horizontal Scroll**: Tree view scrolls horizontally on mobile
- **Progressive Disclosure**: Show essential info first, details on tap
- **Offline Support**: Cache current session for offline viewing
