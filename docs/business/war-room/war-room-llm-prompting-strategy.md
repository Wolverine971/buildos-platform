# Project War Room - LLM Prompting Strategy

## Core Principles

1. **Context Window Management**: Keep cumulative context under 100,000 tokens
2. **Scenario Coherence**: Maintain narrative consistency across 10 stages
3. **Project Specificity**: Ground all scenarios in actual project context
4. **Decision Impact**: Each choice must meaningfully affect outcomes
5. **Actionable Insights**: Generate concrete, implementable recommendations

---

## Prompt Templates

### 1. Readiness Assessment Prompt

```typescript
const READINESS_ASSESSMENT_PROMPT = `
Analyze this project for war room scenario planning readiness.

Project Context:
${project.context}

Project Details:
- Name: ${project.name}
- Start Date: ${project.start_date}
- End Date: ${project.end_date}
- Current Phase: ${currentPhase}
- Completion: ${completionPercentage}%
- Tasks: ${taskCount} total, ${completedTasks} done

Evaluate readiness across these dimensions:

REQUIRED (must have all):
1. Clear Goals - Are success criteria defined?
2. Scope Definition - Are boundaries clear?
3. Timeline - Are dates realistic?
4. Context Depth - Is there >500 words of meaningful context?

RECOMMENDED (score each 0-10):
1. Success Metrics - Quantifiable outcomes?
2. Resource Allocation - Team/budget defined?
3. Risk Awareness - Known risks documented?
4. Stakeholder Map - Key people identified?
5. Dependencies - Critical dependencies clear?
6. Current Progress - Beyond just ideation?
7. Decision Points - Upcoming decisions identified?

Output as JSON:
{
  "readiness_score": 0-100,
  "can_proceed": boolean,
  "missing_required": [],
  "recommended_scores": {},
  "specific_gaps": [],
  "remediation_prompts": []
}
`;
```

### 2. Scenario Generation Prompt

```typescript
const SCENARIO_GENERATION_PROMPT = `
Generate ${count} realistic scenario starting points for this project.

Project Context:
${truncateContext(project.context, 2000)} // Keep context focused

Project Status:
- Current Phase: ${currentPhase}
- Completion: ${completionPercentage}%
- Timeline: ${daysRemaining} days remaining
- Team Size: ${teamSize}
- Key Risks: ${topRisks.join(", ")}

Scenario Parameters:
- Intensity: ${intensity} // mild, moderate, severe
- Focus Areas: ${focusAreas} // competition, resources, technical, market
- Time Horizon: ${timeHorizon} // 1-12 months

Generate scenarios that:
1. Are plausible given project context
2. Test different vulnerability types
3. Create meaningful decision points
4. Lead to 3-5 branching paths each

For each scenario output:
{
  "title": "Brief descriptive title",
  "category": "competition|resource|technical|market|black_swan",
  "trigger_event": "What happens to start the scenario",
  "immediate_impacts": ["impact1", "impact2", "impact3"],
  "initial_choices": [
    {
      "id": "A",
      "label": "Action description",
      "preview": "Likely outcome preview"
    }
  ],
  "severity": 1-10,
  "relevance": 1-10
}
`;
```

### 3. Stage Generation Prompt (Context-Efficient)

```typescript
const STAGE_GENERATION_PROMPT = `
Generate the next stage in this scenario.

Scenario: ${scenario.title}
Current Stage: ${currentStage.number}
Previous Decision: ${previousChoice.label}

Recent Context (last 3 stages only):
${recentStagesummary} // Compress older stages

Project Snapshot:
- Goals: ${project.goals}
- Constraints: ${project.constraints}
- Resources: ${project.resources}

Generate a realistic consequence of the previous decision that:
1. Follows logically from the choice made
2. Introduces new complications or opportunities  
3. Requires another strategic decision
4. Maintains narrative coherence

Output:
{
  "narrative": "2-3 paragraphs describing new situation",
  "metrics_delta": {
    "success_probability": -10 to +10,
    "risk_level": "low|medium|high|critical",
    "opportunity_score": 1-10
  },
  "new_factors": ["what's changed"],
  "decision_point": "The strategic question",
  "choices": [
    {
      "id": "A",
      "label": "Choice description",
      "probable_outcome": "Brief preview",
      "risk_reward": "low_risk_low_reward|high_risk_high_reward|etc"
    }
  ],
  "hidden_insights": ["Non-obvious implications"]
}
`;
```

### 4. Vulnerability Detection Prompt

```typescript
const VULNERABILITY_DETECTION_PROMPT = `
Analyze this scenario stage for project vulnerabilities.

Current Situation:
${stage.narrative}

Project Context (relevant sections):
${extractRelevantContext(project.context, stage.keywords)}

Identify:
1. Single points of failure exposed
2. Unvalidated assumptions revealed
3. Resource constraints highlighted
4. Timeline risks uncovered
5. Dependency vulnerabilities
6. Team/skill gaps
7. Market blind spots

For each vulnerability:
{
  "type": "category",
  "severity": "critical|high|medium|low",
  "description": "Specific vulnerability",
  "evidence": "What in the scenario reveals this",
  "mitigation": "Concrete action to address",
  "task_suggestion": {
    "title": "Task title",
    "duration_minutes": 30-240,
    "priority": "high|medium|low"
  }
}
`;
```

### 5. Project Update Generation Prompt

```typescript
const PROJECT_UPDATE_PROMPT = `
Generate project updates based on scenario discoveries.

Scenario Insights:
${stage.vulnerabilities}
${stage.opportunities}
${stage.strategic_insights}

Current Project Context:
${truncateContext(project.context, 3000)}

User Requested Updates:
- Update Context: ${updateContext}
- Create Tasks: ${createTasks}
- Adjust Phases: ${adjustPhases}
- Use AI Suggestions: ${useAISuggestions}

Generate updates that:
1. Address discovered vulnerabilities
2. Capture strategic learnings
3. Don't duplicate existing content
4. Are specific and actionable

Output:
{
  "context_updates": [
    {
      "section": "## Section Name",
      "operation": "append|prepend|replace",
      "content": "New markdown content",
      "rationale": "Why this update matters"
    }
  ],
  "new_tasks": [
    {
      "title": "Specific task",
      "description": "Details",
      "duration_minutes": 60,
      "priority": "high",
      "project_id": "${project.id}",
      "due_date_suggestion": "next_7_days|next_14_days|next_month"
    }
  ],
  "impact_summary": "How these updates improve success probability"
}
`;
```

### 6. Success Probability Calculation Prompt

```typescript
const SUCCESS_CALCULATION_PROMPT = `
Calculate success probability for this project state.

Original Project State:
- Timeline confidence: ${timelineConfidence}%
- Resource adequacy: ${resourceScore}/10
- Risk mitigation: ${mitigationLevel}%
- Team capability: ${teamScore}/10

Scenario Path Taken:
${decisions.map((d) => `Stage ${d.stage}: ${d.choice}`).join("\n")}

Vulnerabilities Discovered: ${vulnerabilityCount}
Mitigations Applied: ${mitigationCount}
Opportunities Seized: ${opportunityCount}

Calculate success probability considering:
1. Quality of decisions made
2. Proactive vs reactive choices
3. Resource allocation efficiency
4. Risk/reward balance
5. Timeline feasibility

Output:
{
  "success_probability": 0-100,
  "confidence_level": "high|medium|low",
  "key_factors": ["Main influences on score"],
  "improvement_potential": "What could increase success"
}
`;
```

---

## Context Window Management Strategy

### Token Budget Allocation (100k limit)

```typescript
const TOKEN_BUDGET = {
  project_context: 10000, // Core project information
  scenario_history: 30000, // All previous stages (compressed)
  current_stage: 5000, // Current stage detail
  ai_analysis: 10000, // Suggestions and insights
  generation_prompt: 5000, // The actual prompt
  response_buffer: 10000, // Expected response size
  safety_margin: 30000, // Buffer for unexpected length
};
```

### Progressive Context Compression

```typescript
function compressStageContext(stage: Stage, ageInStages: number): string {
  if (ageInStages <= 2) {
    // Recent stages: full detail
    return stage.fullContent;
  } else if (ageInStages <= 5) {
    // Mid-age stages: summary + decisions
    return `Stage ${stage.number}: ${stage.decision} → ${stage.outcome}`;
  } else {
    // Old stages: just the decision
    return `S${stage.number}: ${stage.decision}`;
  }
}
```

### Rolling Context Window

```typescript
class ScenarioContextManager {
  maxTokens = 100000;

  buildContext(currentStage: number): string {
    const context = [];

    // Always include
    context.push(this.projectSummary()); // 2k tokens
    context.push(this.scenarioSetup()); // 1k tokens

    // Include last 5 stages in detail
    for (let i = Math.max(0, currentStage - 5); i < currentStage; i++) {
      context.push(this.getStageDetail(i));
    }

    // Include decision summary for all earlier stages
    if (currentStage > 5) {
      context.push(this.getDecisionChain(0, currentStage - 5));
    }

    return context.join("\n\n");
  }
}
```

---

## Prompt Optimization Techniques

### 1. Focused Context Extraction

```typescript
// Instead of sending full project context, extract relevant sections
function extractRelevantContext(
  fullContext: string,
  keywords: string[],
): string {
  const sections = parseMarkdownSections(fullContext);
  const relevantSections = sections.filter((section) =>
    keywords.some((keyword) =>
      section.toLowerCase().includes(keyword.toLowerCase()),
    ),
  );
  return relevantSections.join("\n\n");
}
```

### 2. Structured Output Enforcement

```typescript
// Append to all prompts
const OUTPUT_STRUCTURE = `
Respond with valid JSON only. No markdown, no explanation outside JSON.
Ensure all required fields are present.
Use null for optional empty fields, not undefined.
`;
```

### 3. Example-Based Guidance

```typescript
// Include examples for complex generations
const EXAMPLE_SCENARIO = `
Example of good scenario:
{
  "title": "Key Developer Leaves Mid-Sprint",
  "trigger_event": "Your lead developer accepts another offer with 2 weeks notice",
  "immediate_impacts": [
    "Sprint goals at risk",
    "Knowledge transfer needed",
    "Team morale affected"
  ]
}
`;
```

---

## Error Handling & Fallbacks

### Generation Failures

```typescript
const FALLBACK_SCENARIOS = [
  {
    title: "Competitive Pressure",
    template: "A competitor announces a similar product",
    variables: ["timeline", "features", "pricing"],
  },
  {
    title: "Resource Constraint",
    template: "Your budget gets cut by X%",
    variables: ["percentage", "timeline", "scope"],
  },
];

// Use if generation fails
function getFallbackScenario(projectType: string): Scenario {
  const fallback = FALLBACK_SCENARIOS.find((s) =>
    s.appliesTo.includes(projectType),
  );
  return customizeFallback(fallback, project);
}
```

### Context Overflow Protection

```typescript
async function generateWithinLimit(prompt: string): Promise<any> {
  const tokens = await countTokens(prompt);

  if (tokens > 80000) {
    // Compress aggressively
    prompt = await compressPrompt(prompt, 60000);
  }

  if (tokens > 95000) {
    // Emergency compression - summaries only
    prompt = await emergencyCompress(prompt, 40000);
  }

  return await callLLM(prompt);
}
```

---

## Performance Optimizations

### Caching Strategy

```typescript
const CACHE_KEYS = {
  readiness: (projectId) => `readiness_${projectId}_${projectHash}`,
  scenarios: (projectId, params) => `scenarios_${projectId}_${paramHash}`,
  vulnerability: (stageId) => `vuln_${stageId}`,
};

// Cache readiness for 24 hours (project unlikely to change much)
// Cache scenarios for 1 hour (still relevant but allows updates)
// Cache vulnerabilities permanently (tied to specific stage)
```

### Parallel Generation

```typescript
async function generateScenarioOptions(project: Project): Promise<Scenario[]> {
  // Generate different scenario types in parallel
  const promises = [
    generateCompetitiveScenario(project),
    generateResourceScenario(project),
    generateTechnicalScenario(project),
    generateMarketScenario(project),
  ];

  const results = await Promise.allSettled(promises);
  return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
}
```
