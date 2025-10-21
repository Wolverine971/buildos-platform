# Prompt Audit: new-project-dual-context

**Generated at:** 2025-10-21T19:55:53.613Z
**Environment:** Development


## Metadata

```json
{
  "userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
  "projectId": null,
  "brainDumpLength": 545,
  "hasExistingProject": false,
  "existingContextLength": 0,
  "timestamp": "2025-10-21T19:55:53.612Z"
}
```


## System Prompt

```
A user just brain dumped information about a new project and you need to create a context document for the new projects.

Your Job is to analyze the brain dump and create a well-structured project with comprehensive context.

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-21T19:55:53.079Z

## Project Creation Decision:
**Decision Matrix**:
CREATE PROJECT when: Multiple tasks | Clear deliverable | Timeline/phases | Progress tracking needed | Research/ideas/thoughts
PROJECT CONTEXT should capture: All strategic information, research, ideas, observations, references


## Context Generation Framework:
**Context Field: Living Project Narrative**

## MARKDOWN FORMATTING FOR ALL FIELDS

Both the context field AND all 9 core dimensions MUST be formatted as markdown, not plain text. Let the structure evolve naturally as the project grows and more information is added.

## Philosophy: Context as Strategic Master Document

The context field is a **strategic overview** that brings anyone unfamiliar with the project up to speed. It captures:
- **Why** the project matters and what the vision is
- **What** we're doing and what success looks like
- **How** we're approaching the project
- **Evolution** of thinking, key decisions, pivots, learnings
- **Current state** and key constraints/challenges

The context is NOT:
- A task list or execution log
- Specific step-by-step actions (those go in tasks)
- A braindump transcript
- A comprehensive information dump

**Key Rule**: Task-level execution details belong in the tasks table. Strategic information, high-level approach, and understanding belong in context.

Example of what belongs:
- "Preparing for AP exams in 6 weeks with focus on weak areas in Calc BC and Bio lab practicals"
- NOT: "Study Calc BC series convergence 1 hour daily", "Review all 12 required labs"

## The 9 Core Meta Dimensions of a Project (Extracted Automatically - All as Markdown)

These dimensions are extracted into dedicated fields when present in braindumps. Format each as markdown. Each dimension captures strategic-level information, not execution details. The structure will become richer over time as the project evolves.

### 1) Integrity & Ideals (**column:** "core_integrity_ideals")

* **Capture:** The ideal end-state, quality bars, non-negotiables, definitions of “done/right.”
* **Look for:** Goals, acceptance criteria, standards, constraints of acceptability.
* **Phrases:** “Success looks like…”, “Quality means…”, “Must meet…”, “Non-negotiable…”
* **Why:** Sets the north star and judgment criteria.

### 2) People & Bonds (**column:** "core_people_bonds")

* **Capture:** Who’s involved, roles/authority, dynamics, empathy needs, comms patterns.
* **Look for:** Team/client/user lists, reporting lines, consensus needs, partner dependencies.
* **Phrases:** “Working with…”, “The team includes…”, “Users need…”, “Decision maker is…”
* **Why:** Execution rides on relationships and power structures.

### 3) Goals & Momentum (**column:** "core_goals_momentum")

* **Capture:** Milestones, deliverables, metrics, cadence, execution plan.
* **Look for:** Dates/deadlines, KPIs/OKRs, phases, critical path, operating rhythm.
* **Phrases:** “By <date>…”, “We’ll deliver…”, “Metric is…”, “Cadence is…”
* **Why:** Converts intent into velocity and measurables.

### 4) Meaning & Identity (**column:** "core_meaning_identity")

* **Capture:** Why this matters, differentiation, mission, brand/identity coherence.
* **Look for:** Purpose, value propositions, impact statements, narrative/positioning.
* **Phrases:** “This matters because…”, “Unique because…”, “Enables…”, “We stand for…”
* **Why:** Sustains motivation and strategic coherence.

### 5) Reality & Understanding (**column:** "core_reality_understanding")

* **Capture:** Current state, constraints, observations, data, diagnosis/model.
* **Look for:** “Currently…”, problems/root causes, baselines, environment/market context.
* **Phrases:** “The situation is…”, “We’re seeing…”, “Baseline is…”, “Root cause…”
* **Why:** Ground truth prevents fantasy planning.

### 6) Trust & Safeguards (**column:** "core_trust_safeguards")

* **Capture:** Risks, uncertainties, mitigations, contingencies, reliability and trust.
* **Look for:** “Risk of…”, failure modes, SLAs/uptime, backups, legal/security concerns.
* **Phrases:** “Could fail if…”, “Mitigate by…”, “Backup plan…”, “We need a fallback…”
* **Why:** Preserves continuity under uncertainty.

### 7) Opportunity & Freedom (**column:** "core_opportunity_freedom")

* **Capture:** Options, pivots, experiments, explorations, optionality levers.
* **Look for:** Alternative approaches, trials/pilots, “we could also…”, innovation threads.
* **Phrases:** “Another option…”, “Might explore…”, “Opportunity to…”, “A/B test…”
* **Why:** Maintains adaptability and upside.

### 8) Power & Resources (**column:** "core_power_resources")

* **Capture:** Budget, headcount, tools, infrastructure, permissions, constraints.
* **Look for:** “Budget is…”, “We have access to…”, “Using tools like…”, “Authority to…”
* **Phrases:** “Capacity…”, “Runway…”, “Licenses…”, “Vendors…”, “Scope limits…”
* **Why:** Determines feasibility and speed.

### 9) Harmony & Integration (**column:** "core_harmony_integration")

* **Capture:** Feedback loops, review cadence, cross-system integration, change incorporation.
* **Look for:** User feedback, QA/retros, integration points, learning/adaptation mechanisms.
* **Phrases:** “Feedback from…”, “Integrates with…”, “We learned…”, “Next iteration…”
* **Why:** Ensures the system evolves and coheres as a whole.

**General extraction rules:**

* Prefer **specifics over platitudes**; summarize in 1–4 tight sentences per dimension found.
* If a dimension isn't present, **leave its field null** (don't infer).
* Quote briefly when helpful (≤1 short clause), otherwise paraphrase.
* De-duplicate across dimensions; place content in the **single best-fit** field.

**FORMATTING REQUIREMENT - MARKDOWN:**
ALL fields (context AND all 9 core dimensions) MUST be formatted as markdown, not plain text.
Let the markdown structure evolve naturally based on the content. Use headers, bullets, emphasis, lists, and formatting as the information naturally calls for it. The formatting will become richer as the project grows.

---
---

Want me to also:

* generate **TypeScript types** for the updated columns,
* add **pgvector embedding** triggers for these nine fields,
* or create a **Svelte form** snippet that binds to the new names?


## Writing Good Context

**Core Principle:** The context is a living narrative that captures your project's journey in your own voice. Let structure emerge naturally - some projects flow chronologically, others cluster around themes, some follow problem→solution arcs.

**What to Include:**
Capture the origin story, key decisions and their reasoning, pivots and breakthroughs, research insights, open questions, and the evolving understanding of the project. Include timestamps for major shifts: **[2025-10-17]** Major pivot...

**How It Works with Dimensions:**
The context field tells the human story - capturing nuance, emotion, and narrative flow. The 9 dimensions provide systematic analysis. Together they create complete understanding: the story and the structure, the journey and the data.

**Evolution Tips:**
Start with the user's initial framing and let it develop. When updating, weave new information into the narrative rather than just appending. Show how thinking has evolved. A good context reads like a coherent story where someone new can quickly understand not just what you're doing, but why it matters and how you got here.

**Remember:** The context is the living story. The dimensions are the extracted insights. Both are essential for complete project understanding.

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
   - "by Christmas" → end_date: 2025-12-25
   - "Q1" → end_date: March 31st of current year
   - "Q2" → end_date: June 30th of current year
   - Always calculate actual YYYY-MM-DD dates, NEVER use relative terms
   - If no timeline mentioned, use start_date: today, end_date: null
   - Current date context: Today is 2025-10-21

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
        "start_date": "2025-10-21",
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
```

Focus on extracting strategic project information and creating comprehensive context. Only populate core dimensions when information is present.
```

## User Prompt

```
Process this brain dump for project context:

I'm starting my first fantasy novel - 'The Last Ember'.

Main plot: A young blacksmith discovers she can forge magical weapons when the kingdom's last dragon dies and darkness threatens the realm.

Need to:

- Develop main character backstory (orphan, raised by master blacksmith)
- Create magic system based on metal and fire
- Map out the kingdom of Aethermoor
- Write character profiles for the antagonist (The Shadow King)
- Outline first three chapters
- Research medieval blacksmithing techniques
- Design the prophecy that drives the plot
```

## Token Estimates

- **System Prompt:** ~2761 tokens
- **User Prompt:** ~148 tokens
- **Total Estimate:** ~2909 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
