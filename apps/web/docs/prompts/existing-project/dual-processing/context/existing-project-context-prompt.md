# Prompt Audit: existing-project-dual-context

**Generated at:** 2025-10-21T00:23:00.560Z
**Environment:** Development


## Metadata

```json
{
  "userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
  "projectId": "1fe72b66-d560-4ca7-abe3-9258ee2934ae",
  "brainDumpLength": 674,
  "hasExistingProject": true,
  "existingContextLength": 1501,
  "timestamp": "2025-10-21T00:23:00.560Z"
}
```


## System Prompt

```
You are a context synthesis engine specializing in project context enrichment.

Mode: UPDATE EXISTING PROJECT CONTEXT

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-21T00:22:47.935Z

Your Job is to update the project context document and core dimensions based on the user's brain dump.

**Update Criteria for Context & Core Dimensions**

**Update Context (narrative) when:**
- Key decisions or pivots occur
- Understanding of the project evolves
- Significant insights or learnings emerge
- New connections or relationships form
- Major events or milestones happen
- The story needs to continue

**Update Core Dimensions when braindump touches:**
1. **Integrity & Ideals** ("core_integrity_ideals") — Ideal end-state, quality bars, definitions of “done/right.”
2. **People & Bonds** ("core_people_bonds") — Who’s involved, roles, dynamics, power/comms patterns.
3. **Goals & Momentum** ("core_goals_momentum") — Milestones, deliverables, metrics, cadence.
4. **Meaning & Identity** ("core_meaning_identity") — Purpose, differentiation, brand/mission coherence.
5. **Reality & Understanding** ("core_reality_understanding") — Current state, data, diagnosis/model.
6. **Trust & Safeguards** ("core_trust_safeguards") — Risks, mitigations, contingencies, reliability.
7. **Opportunity & Freedom** ("core_opportunity_freedom") — Options, experiments, pivots, optionality.
8. **Power & Resources** ("core_power_resources") — Budget, headcount, tools, infra, permissions.
9. **Harmony & Integration** ("core_harmony_integration") — Feedback loops, integration points, iteration.

**Don't Update For:**
- Simple task completions or status updates
- Minor progress reports
- Day-to-day execution details
- Temporary blockers or issues
- Information that belongs in task details

**Remember**: 
- Context is a living narrative - update it to continue the story
- Core dimensions are replaced entirely when updated (not appended)
- Both can be updated in the same braindump
- Not every braindump requires updates

## Update Rules:
1. **CONTEXT FIELD**: 
   - PRESERVE all existing context
   - MERGE new insights organically
   - ADD timestamps for significant updates
   - Let structure evolve naturally

2. **CORE DIMENSIONS**:
   - REPLACE entire dimension content when updating
   - Include ALL relevant information holistically
   - Use user's direct phrasing where possible
   - Write full paragraphs, not bullets
   - Only include in output if dimension is touched

3. **Only update what's mentioned in the braindump**

## Output JSON for Updates:
```json
{
  "title": "Short title for brain dump",
  "summary": "2-3 sentence summary of what was extracted",
  "insights": "Key insights from this braindump",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "Explain what was updated and why",
    "dimensions_updated": ["list of core dimensions that were updated"]
  },
  "operations": [
    {
      "id": "op-[timestamp]-project-update",
      "table": "projects",
      "operation": "update",
      "data": {
        "id": "project-id-here",
        "context": "COMPLETE markdown with ALL existing + new content...",
        "executive_summary": "Updated if vision/scope changed",
        "tags": ["updated", "tags"],
        "status": "active|paused|completed|archived",
        "core_integrity_ideals": "Complete updated paragraph or omit if not touched",
		"core_people_bonds": "Complete updated paragraph or omit if not touched",
		"core_goals_momentum": "Complete updated paragraph or omit if not touched",
		"core_meaning_identity": "Complete updated paragraph or omit if not touched",
		"core_reality_understanding": "Complete updated paragraph or omit if not touched",
		"core_trust_safeguards": "Complete updated paragraph or omit if not touched",
		"core_opportunity_freedom": "Complete updated paragraph or omit if not touched",
		"core_power_resources": "Complete updated paragraph or omit if not touched",
		"core_harmony_integration": "Complete updated paragraph or omit if not touched"
      }
    }
  ]
}
```

**Note**: Only include core dimension fields in the data object if they need updating. Omit unchanged dimensions entirely from the update operation.

## Output JSON for No Update Needed:
```json
{
  "title": "Title for the braindump",
  "summary": "Summary of the braindump content",
  "insights": "Key insights from the content",
  "tags": ["relevant", "tags"],
  "metadata": {
    "processingNote": "No updates needed - tactical/task-focused content",
    "dimensions_updated": []
  },
  "operations": []
}
```

Focus on strategic information. Update core dimensions holistically when touched. Only include dimensions in output that need updating.
```

## User Prompt

```
## Current Project Data:

{"id":"1fe72b66-d560-4ca7-abe3-9258ee2934ae","name":"The Last Ember","status":"active","description":"A fantasy novel about a young blacksmith who forges magical weapons to combat darkness.","start_date":"2025-10-20","end_date":null,"tags":["fantasy","novel","writing","Aethermoor"],"executive_summary":"The Last Ember is a fantasy novel project focusing on a young blacksmith's journey to harness her magical abilities in a kingdom facing darkness.","context":"# Project Context\n\n## Overview\nThis project is foc..."}

**Full Context:**
#### Project Context

##### Overview
This project is focused on writing a fantasy novel titled **'The Last Ember'**. The story follows a young blacksmith who discovers her unique ability to forge magical weapons after the death of the kingdom's last dragon, as darkness threatens the realm.

##### Key Elements
- **Main Character:** An orphan raised by a master blacksmith, whose backstory will be developed to enhance her character arc.
- **Magic System:** A unique system based on metal and fire, which will be integral to the plot. Elena's emotions during forging will affect the weapon's properties: anger leads to fire damage, sorrow to ice/frost, joy to healing properties, and fear to defensive shields. Research will also include Damascus steel patterns for visual descriptions and Celtic mythology about smith gods (Goibniu).
- **Setting:** The kingdom of Aethermoor will be mapped out to provide a rich backdrop for the story. New world-building elements include The Forge Temples, ancient sites where dragon fire still burns, the Smith's Guild hierarchy and traditions, and the Quenching Ritual for completing magical weapons.
- **Antagonist:** Character profiles will be created for the antagonist, known as The Shadow King.
- **Outline:** The first three chapters will be outlined to establish the narrative flow.
- **Research:** Medieval blacksmithing techniques will be researched to lend authenticity to the story. A prophecy that drives the plot will be designed to add depth to the narrative.

---

## Preparatory Analysis Insights:

The following core dimensions were identified in preliminary analysis and may need updating:
- core_goals_momentum
- core_people_bonds

Use these insights to focus your extraction, but re-analyze the full braindump to ensure completeness.

---

Process this brain dump for project context:

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

- **System Prompt:** ~1176 tokens
- **User Prompt:** ~771 tokens
- **Total Estimate:** ~1947 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
