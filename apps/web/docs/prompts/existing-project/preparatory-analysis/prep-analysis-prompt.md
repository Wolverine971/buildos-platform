# Prompt Audit: preparatory-analysis

**Generated at:** 2025-10-20T20:28:36.447Z
**Environment:** Development


## Metadata

```json
{
  "userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
  "projectId": "b7140785-6e02-4649-9c61-4ef42383b733",
  "brainDumpLength": 791,
  "taskCount": 16,
  "hasExistingContext": true,
  "existingContextLength": 5321,
  "timestamp": "2025-10-20T20:28:36.441Z"
}
```


## System Prompt

```
You are a user braindump analyzer. Your job is to analyze a braindump and determine what existing data needs to be updated.

## Your Task:
Analyze the braindump to identify:
1. Whether the project context needs strategic updates
2. Whether any of the 9 core project dimensions need updating
3. Which existing tasks are referenced or need updating
4. The nature of the braindump content

## Core Project Dimensions to Monitor:

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
- **Any information touching the 9 core dimensions**

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
```

**CRITICAL INSTRUCTIONS:**
- Check if braindump touches ANY of the 9 core dimensions
- Set skip_core_dimensions to FALSE if any dimension is touched
- Only mark dimensions in core_dimensions_touched if they have substantive updates
- Be thorough in detecting indirect references to dimensions

Analyze the braindump and respond with ONLY the JSON, no other text.
```

## User Prompt

```


## Current Project Overview:
Project: "The Last Ember"
Description: A fantasy novel about a young blacksmith who discovers her magical abilities after the death of the kingdom's last dragon.
Status: active
Tags: fantasy, novel, writing, magic system, world-building
Start Date: 2025-10-17
End Date: Not set
Has Context: Yes (existing strategic document)
Executive Summary: The Last Ember is a fantasy novel that follows a young blacksmith as she uncovers her magical abilities and confronts the darkness threatening her kingdom. The project emphasizes character development, a unique magic system influenced by emotions, and a richly detailed world.

## Existing Tasks (16 total):
- [backlog] Design the prophecy (ID: 8fae9a40-2fdc-49eb-9544-035e996c047f)
  Description: Create a prophecy that drives the plot and connects the main character to the kingdom's fate.
- [backlog] Complete chapters 11-20 (ID: fdcfea4f-330f-4427-ac1e-d1bc005023dc) - 2025-10-21T00:00:00+00:00
  Description: Finish writing chapters 11-20 by the end of February.
- [backlog] Complete chapters 1-10 (ID: 4ea14eb2-7fda-4d1d-9abb-c9439bbe1d09) - 2025-10-21T00:00:00+00:00
  Description: Finish writing chapters 1-10 by the end of January.
- [backlog] Complete chapters 21-30 and epilogue (ID: 0619395e-ba6e-409e-8abd-e8796d156dc6) - 2025-10-21T00:00:00+00:00
  Description: Finish writing chapters 21-30 and the epilogue by the end of March.
- [backlog] Research literary agents for fantasy genre (ID: 9bfb198e-f7d1-44cc-95c3-fb80f7cf2495) - 2025-10-21T00:00:00+00:00
  Description: Conduct research on literary agents who specialize in the fantasy genre.
- [backlog] Submit chapter 1 to beta readers (ID: 618cc763-cdfa-4354-bf64-693d42ee9f29) - 2025-10-20T00:00:00+00:00
  Description: Send chapter 1 to beta readers by January 15th.
- [backlog] Join local writers' critique group (ID: 358c0534-3e2e-47e0-88e4-324a847367fa) - 2025-11-07T00:00:00+00:00
  Description: Participate in a local writers' critique group that meets the 1st Tuesday of each month.
- [backlog] Weekly plot planning (ID: 62880073-c31f-444e-b103-a5302bf5d549) - 2025-10-22T00:00:00+00:00
  Description: Plan the plot for the upcoming week on Sunday afternoons.
- [backlog] Weekly chapter revision and editing (ID: a6d4baab-1a45-4ff9-8461-032d4c8f783a) - 2025-10-21T00:00:00+00:00
  Description: Revise and edit chapters on Saturday mornings.
- [backlog] Daily writing goal (ID: dc45fd3b-19e1-4d0a-9e3c-6c5a5dfc421d) - 2025-10-21T00:00:00+00:00
  Description: Set a daily writing goal of 1,000 words minimum, Monday through Friday.
- [backlog] Research medieval blacksmithing techniques (ID: f462c2dd-a6d4-443f-b378-14ecb68b2e68)
  Description: Conduct research on historical blacksmithing techniques to inform the character's skills and the mag
- [backlog] Outline first three chapters (ID: ef936de1-d520-418f-a3a0-1e226b74c116)
  Description: Create an outline for the first three chapters of the novel, establishing the main character, settin
- [backlog] Write character profiles for the antagonist (ID: 91f0e8e0-92f0-4ea2-b47f-c03a9961eea0)
  Description: Develop detailed profiles for the antagonist, The Shadow King, including motivations, backstory, and
- [backlog] Map out the kingdom of Aethermoor (ID: 24d7b87d-42ea-430b-aae1-fd7297f8c4d6)
  Description: Create a detailed map of the kingdom, including key locations and their significance to the plot.
- [backlog] Create magic system (ID: e7eeddfd-c50b-4a0e-b590-05dd1238c561)
  Description: Develop a magic system based on metal and fire that integrates with the plot and character abilities
- [backlog] Develop main character backstory (ID: f9370403-aee9-4914-8bac-943125f8cd41)
  Description: Create a detailed backstory for the main character, focusing on her upbringing as an orphan and her 

			
			Analyze this braindump:

Starting to think about publication options for The Last Ember.

Traditional publishing route:

- Need to write query letter
- Create 1-page synopsis
- Research fantasy literary agents (looking at agents who rep Brandon Sanderson, Robin Hobb)
- Prepare first 3 chapters as sample

Self-publishing considerations:

- Budget $3000 for professional editing
- Find cover artist specializing in fantasy
- Plan pre-launch marketing campaign
- Set up author website and newsletter

Timeline:

- Finish first draft: March 31
- Self-edit: April
- Beta readers: May
- Professional edit: June-July
- Query agents or launch self-pub: August

Also want to:

- Start building author platform on social media
- Write short stories in same universe for magazines
- Create series bible if this becomes Book 1
```

## Token Estimates

- **System Prompt:** ~1274 tokens
- **User Prompt:** ~1158 tokens
- **Total Estimate:** ~2432 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
