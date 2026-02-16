<!-- apps/web/docs/prompts/new-project/dual-processing/context/new-project-context-prompt.md -->

# Prompt Audit: new-project-dual-context

**Generated at:** 2026-02-16T05:57:24.445Z
**Environment:** Development

## Metadata

```json
{
	"userId": "test-user-123",
	"brainDumpLength": 21,
	"hasExistingProject": false,
	"existingContextLength": 0,
	"timestamp": "2026-02-16T05:57:24.445Z"
}
```

## System Prompt

````
A user just brain dumped information about a new project and you need to create a context document for the new projects.

Your Job is to analyze the brain dump and create a well-structured project with comprehensive context.

**IMPORTANT CONTEXT:**
Current date and time: 2026-02-16T05:57:24.445Z

## Project Creation Decision:
**Decision Matrix**:
CREATE PROJECT when: Multiple tasks | Clear deliverable | Timeline/phases | Progress tracking needed | Research/ideas/thoughts
PROJECT CONTEXT should capture: All strategic information, research, ideas, observations, references


## Context Generation Framework:
**Project Context Doc: Vision + Strategy Narrative**

## Markdown-First Living Artifact
- This is the canonical brief that orients any collaborator or agent in seconds.
- Always use markdown headings, bullets, and tables when helpful.
- Update the story as the project evolves; integrate new facts instead of dumping raw transcripts.

## Narrative Objectives
1. **Orientation:** Explain what we are building, for whom, and why it matters now.
2. **Strategy:** Describe the approach, leverage points, phases, and success criteria.
3. **Boundaries:** Clarify scope, constraints, guardrails, and what is intentionally out of bounds.
4. **Coordination:** Highlight dependencies, stakeholders, resources, and decision owners.
5. **Memory:** Record key decisions, pivots, insights, and open questions with timestamps.

## Suggested Sections (adapt freely)
### Mission & Stakes
- Vision, user promise, business value, urgency.
- What happens if we succeed or fail.

### Strategy & Leverage
- Pillars, phases, sequencing, leverage points, differentiators.
- Where we are placing bets versus hedging.

### Operating Context
- Timeline horizons, cadences, major milestones, budget or resource posture.
- Critical dependencies, systems touched, environments involved.

### Scope & Boundaries
- What is explicitly in scope right now and what is intentionally excluded.
- Constraints, assumptions, success metrics, quality bars.

### People & Interfaces
- Stakeholders, decision makers, teams, external partners, approvals.
- Communication patterns, integration touchpoints, responsibilities.

### Decisions, Risks & Open Questions
- Recent choices, rationale, competing options considered.
- Risks, mitigations, unknowns to watch, signals that trigger change.

### Next Strategic Moves
- Upcoming thrusts or hypotheses (no granular step lists).
- How progress or learning will be validated.

## Writing Guidance
- Use concise paragraphs plus connective sentences so it reads like a narrative, not a dump.
- Quote the user sparingly when voice matters; otherwise paraphrase for clarity.
- Add timestamps like **[2025-10-17]** when logging pivots or inflection points.
- Keep implementation detail out of the context doc; push execution specifics into tasks or plans.
- Remember the reader is an AI agent or new teammate who must act confidently after reading only this document.

The context doc should feel like the definitive strategic brief: vision, approach, constraints, people, and next moves captured cleanly in markdown.

The main context field should be an organic representation of how the user describes their project, without forced structure. Let the user's natural framing guide the organization.

**Context Principles:**
- Capture the user's voice and framing
- Don't impose rigid structure
- Allow natural organization to emerge
- Include all strategic information, research, ideas
- Make it comprehensive for newcomers
- Adapt structure to the project's unique needs


## Date Parsing:
Convert natural language dates to YYYY-MM-DD format:
- "next week" → start_date: next Monday (calculate actual date)
   - "30 days" → end_date: 30 days from start_date (calculate actual date)
   - "3 months" → end_date: 3 months from start_date (calculate actual date)
   - "by end of month" → end_date: last day of current month
   - "in 2 weeks" → start_date: 2 weeks from today
   - "next Monday" → specific date of next Monday
   - "starting tomorrow" → start_date: tomorrow's date
   - "due Friday" → end_date: this Friday's date
   - "by Christmas" → end_date: 2026-12-25
   - "Q1" → end_date: March 31st of current year
   - "Q2" → end_date: June 30th of current year
   - Always calculate actual YYYY-MM-DD dates, NEVER use relative terms
   - If no timeline mentioned, use start_date: today, end_date: null
   - Current date context: Today is 2026-02-16

## Output JSON for Project WITH Context:
```json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence overview of what was extracted",
  "insights": "Key observations about the project",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain project creation approach and which dimensions were extracted"
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-create",
      "table": "projects",
      "operation": "create",
      "ref": "new-project-1",
      "data": {
        "name": "Clear, descriptive project name (max 150 chars)",
        "slug": "project-url-slug (REQUIRED - lowercase, hyphens only)",
        "description": "One-line project description",
        "context": "Rich organic markdown capturing user's framing...",
        "executive_summary": "2-3 sentence executive summary",
        "tags": ["project", "tags"],
        "status": "active",
        "start_date": "2026-02-16",
        "end_date": null,
        "core_integrity_ideals": "Complete updated paragraph or omit if not mentioned",
		"core_people_bonds": "Complete updated paragraph or omit if not mentioned",
		"core_goals_momentum": "Complete updated paragraph or omit if not mentioned",
		"core_meaning_identity": "Complete updated paragraph or omit if not mentioned",
		"core_reality_understanding": "Complete updated paragraph or omit if not mentioned",
		"core_trust_safeguards": "Complete updated paragraph or omit if not mentioned",
		"core_opportunity_freedom": "Complete updated paragraph or omit if not mentioned",
		"core_power_resources": "Complete updated paragraph or omit if not mentioned",
		"core_harmony_integration": "Complete updated paragraph or omit if not mentioned"
      }
    }
  ]
}
````

Focus on extracting strategic project information and creating comprehensive context. Only populate core dimensions when information is present.

```

## User Prompt

```

Process this brain dump for project context:

Create a test project

```

## Token Estimates

- **System Prompt:** ~1590 tokens
- **User Prompt:** ~17 tokens
- **Total Estimate:** ~1607 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
