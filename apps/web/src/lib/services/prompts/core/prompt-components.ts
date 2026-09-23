// apps/web/src/lib/services/prompts/core/prompt-components.ts
/**
 * Prompt building blocks still used by live prompts. The brain-dump era
 * components (data models, operation ids, type-key guidance, preprocessing
 * steps) were removed with their last callers.
 */

/**
 * Generates project context framework
 */
export function generateProjectContextFramework(mode: 'full' | 'condensed' = 'condensed'): string {
	if (mode === 'condensed') {
		return `**Project Context Doc (Vision + Strategy Narrative):**

Write a markdown document that orients any human or agent to the project's vision, stakes, and strategic plan.

**Purpose**
- Explain why the project exists and what must be true for success
- Capture the strategic approach, major bets, and how the story is evolving
- Provide enough context for decision-making without digging into task lists

**Include**
- Mission/vision and the promise being made (who benefits, why now)
- Definition of success and non-negotiables (metrics, deadlines, quality bars)
- Strategy and approach (phases, leverage points, sequencing of big rocks)
- Scope and boundaries (what is in/out, constraints, assumptions, guardrails)
- Operating context (timeline, resources, dependencies, stakeholders)
- Decisions, insights, pivots, and the reasoning behind them
- Risks, open questions, and signals being monitored
- Next strategic moves or hypotheses (not granular tasks)

**Avoid**
- Task lists, status checklists, or implementation minutiae
- Raw transcripts or disconnected bullet soup
- Step-by-step directives that belong inside the task model

**Formatting**
- Always use markdown headings, bullets, emphasis, tables when helpful
- Integrate updates into the narrative and add timestamps like **[2025-10-17]** for major shifts
- Maintain the user's voice so the doc reads like a coherent story, not a log`;
	}

	// Full version
	return `**Project Context Doc: Vision + Strategy Narrative**

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

The context doc should feel like the definitive strategic brief: vision, approach, constraints, people, and next moves captured cleanly in markdown.`;
}
