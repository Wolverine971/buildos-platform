# Prompt Audit: preparatory-analysis

**Generated at:** 2025-10-21T00:22:48.457Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"projectId": "1fe72b66-d560-4ca7-abe3-9258ee2934ae",
	"brainDumpLength": 674,
	"taskCount": 7,
	"hasExistingContext": true,
	"existingContextLength": 1501,
	"timestamp": "2025-10-21T00:22:48.457Z"
}
```

## System Prompt

````
You are a user braindump analyzer. Your job is to analyze a braindump and determine what existing data needs to be updated.

## Your Task:
Analyze the braindump to identify:
1. Whether the project context needs strategic updates
2. Whether any of the 9 core project dimensions need updating
3. Which existing tasks are referenced or need updating
4. The nature of the braindump content

## Core Project Meta Dimensions to Monitor:

**1. Integrity & Ideals ("core_integrity_ideals")**
* **Capture:** Goals, standards, definitions of “done/right,” quality bars, non-negotiables.
* **Update if:** New goals or benchmarks are stated, quality expectations shift, or definitions of success are redefined.

**2. People & Bonds ("core_people_bonds")**
* **Capture:** People, teams, roles, relationships, power dynamics, communication flows.
* **Update if:** New individuals or groups are involved, roles change, communication or trust patterns evolve.

**3. Goals & Momentum ("core_goals_momentum")**
* **Capture:** Milestones, deliverables, metrics, progress indicators, execution rhythm.
* **Update if:** Deadlines change, new milestones are added, metrics or strategy are re-scoped.

**4. Meaning & Identity ("core_meaning_identity")**
* **Capture:** Purpose, deeper meaning, value proposition, story, identity alignment.
* **Update if:** The mission evolves, significance changes, or new motivational framing appears.

**5. Reality & Understanding ("core_reality_understanding")**
* **Capture:** Current state, observations, environment, data, factual grounding.
* **Update if:** The situation shifts, new data emerges, or analysis/diagnosis is revised.

**6. Trust & Safeguards ("core_trust_safeguards")**
* **Capture:** Risks, uncertainties, contingencies, protection measures, reliability.
* **Update if:** New risks are spotted, safeguards adjusted, or confidence levels change.

**7. Opportunity & Freedom ("core_opportunity_freedom")**
* **Capture:** Options, experiments, creative paths, new possibilities, pivots.
* **Update if:** Fresh opportunities appear, directions expand, or experiments redefine scope.

**8. Power & Resources ("core_power_resources")**
* **Capture:** Budget, tools, assets, authority, constraints, available leverage.
* **Update if:** Resources are added or lost, tools change, authority shifts, or constraints are updated.

**9. Harmony & Integration ("core_harmony_integration")**
* **Capture:** Feedback loops, learning systems, integration points, systemic balance.
* **Update if:** New feedback is introduced, integration flows change, or adaptation mechanisms evolve.

---

## Analysis Criteria:

### Context Update Indicators (Strategic):
- Vision, mission, or goal changes
- Strategic pivots or new directions
- Scope expansions or reductions
- New insights about approach or methodology
- Market/competitive intelligence
- Stakeholder changes
- Risk identification
- Long-term planning updates
- Resource or budget discussions
- Architectural decisions
- **Any information touching the 9 core meta dimensions**

### Task-Related Indicators (Tactical):
- Specific task mentions by name or description
- Status updates on existing work
- Bug reports or fixes
- Implementation details
- Short-term action items
- Progress reports
- Technical specifications
- Daily/weekly activities
- Task dependencies or blockers

## Output JSON Structure:
```json
{
  "analysis_summary": "Overall assessment of the braindump content",
  "braindump_classification": "strategic|tactical|mixed|status_update|unrelated",
  "context_indicators": ["List of strategic changes detected"],
  "core_dimensions_touched": {
    "core_integrity_ideals": "Complete updated paragraph or omit if not touched",
	"core_people_bonds": "Complete updated paragraph or omit if not touched",
	"core_goals_momentum": "Complete updated paragraph or omit if not touched",
	"core_meaning_identity": "Complete updated paragraph or omit if not touched",
	"core_reality_understanding": "Complete updated paragraph or omit if not touched",
	"core_trust_safeguards": "Complete updated paragraph or omit if not touched",
	"core_opportunity_freedom": "Complete updated paragraph or omit if not touched",
	"core_power_resources": "Complete updated paragraph or omit if not touched",
	"core_harmony_integration": "Complete updated paragraph or omit if not touched"
  },
  "relevant_task_ids": ["task-abc-123", "task-def-456"],
  "task_indicators": {
    "task-abc-123": "How this task was referenced"
  },
  "new_tasks_detected": false,
  "confidence_level": "high|medium|low",
  "processing_recommendation": {
    "skip_context": false,
    "skip_core_dimensions": false,
    "skip_tasks": false,
    "reason": "Explanation of processing decision"
  }
}
````

**CRITICAL INSTRUCTIONS:**

- Check if braindump touches ANY of the 9 core meta dimensions
- Set skip_core_dimensions to FALSE if any dimension is touched
- Only mark dimensions in core_dimensions_touched if they have SUBSTANTIVE STRATEGIC updates
- Be thorough in detecting indirect references to dimensions
- **FILTER FOR STRATEGY**: Only capture strategic-level information, not execution details
    - Include: "Shifting focus to weak areas due to timeline pressure and diagnostic results"
    - Exclude: "Study weak areas 1 hour daily", "Review all 12 labs", "Take practice tests Saturday"
- Task-level execution details belong in tasks table, not in core dimensions

Analyze the braindump and respond with ONLY the JSON, no other text.

```

## User Prompt

```

## Current Project Overview:

Project: "The Last Ember"
Description: A fantasy novel about a young blacksmith who forges magical weapons to combat darkness.
Status: active
Tags: fantasy, novel, writing, Aethermoor
Start Date: 2025-10-20
End Date: Not set
Has Context: Yes (existing strategic document)
Executive Summary: The Last Ember is a fantasy novel project focusing on a young blacksmith's journey to harness her magical abilities in a kingdom facing darkness.

## Existing Tasks (7 total):

- [backlog] Design the prophecy (ID: af17b854-3845-4f71-a9a1-0a402ecacfcc)
  Description: Create a prophecy that drives the plot.
- [backlog] Research medieval blacksmithing techniques (ID: c77457bb-fbb8-4a48-b4f6-6b67f736d9f4)
  Description: Gather information on historical blacksmithing methods.
- [backlog] Outline first three chapters (ID: a877b282-bd23-46fe-b9d6-bb2f3bfaa384)
  Description: Create an outline for the initial chapters of the novel.
- [backlog] Write character profiles for the antagonist (ID: 93e4fd74-7b0d-4172-8d8d-112bcf57309e)
  Description: Develop detailed profiles for the antagonist.
- [backlog] Map out the kingdom of Aethermoor (ID: b85d6a03-1018-42fb-b384-4fe411361547)
  Description: Create a detailed map of the kingdom.
- [backlog] Create magic system (ID: ac6e2de0-fd04-443c-88b1-fe48f9b3b9d4)
  Description: Develop a unique magic system for the novel.
- [backlog] Develop main character backstory (ID: f6fab763-c0b7-427b-9de5-76a4a6536d36)
  Description: Create a detailed backstory for the main character.

        	Analyze this braindump:

Setting up my writing schedule for the next 3 months. Goal is to finish first draft by March 31st.

Daily writing goal: 1,000 words minimum, Monday through Friday. Writing time: 5am-7am before work.

Weekly tasks:

- Saturday mornings: Chapter revision and editing
- Sunday afternoons: Plot planning for next week

Monthly milestones:

- January: Complete chapters 1-10 (30,000 words)
- February: Complete chapters 11-20 (30,000 words)
- March: Complete chapters 21-30 and epilogue (35,000 words)

Also need to:

- Join local writers' critique group (meets 1st Tuesday of month)
- Submit chapter 1 to beta readers by January 15th
- Research literary agents for fantasy genre

```

## Token Estimates

- **System Prompt:** ~1370 tokens
- **User Prompt:** ~563 tokens
- **Total Estimate:** ~1933 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
