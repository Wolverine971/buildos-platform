# Prompt Audit: existing-project-dual-context

**Generated at:** 2025-10-20T20:28:53.188Z
**Environment:** Development


## Metadata

```json
{
  "userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
  "projectId": "b7140785-6e02-4649-9c61-4ef42383b733",
  "brainDumpLength": 791,
  "hasExistingProject": true,
  "existingContextLength": 5321,
  "timestamp": "2025-10-20T20:28:53.188Z"
}
```


## System Prompt

```
You are a context synthesis engine specializing in project context enrichment.

Mode: UPDATE EXISTING PROJECT CONTEXT

**IMPORTANT CONTEXT:**
Current date and time: 2025-10-20T20:28:35.555Z

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

{"id":"b7140785-6e02-4649-9c61-4ef42383b733","name":"The Last Ember","status":"active","description":"A fantasy novel about a young blacksmith who discovers her magical abilities after the death of the kingdom's last dragon.","start_date":"2025-10-17","end_date":null,"tags":["fantasy","novel","writing","magic system","world-building"],"executive_summary":"The Last Ember is a fantasy novel that follows a young blacksmith as she uncovers her magical abilities and confronts the darkness threatening her kingdom. The project emphasizes character development, a unique magic system influenced by emotions, and a richly detailed world.","context":"## 1. Situation & Environment\n- **Current State**:..."}

**Full Context:**
##### 1. Situation & Environment
- **Current State**: The project is in the initial stages of development, focusing on character and world-building. The magic system is evolving with emotional influences on weapon properties. Recent work has centered on character relationships and backstories, particularly for the protagonist Elena and her mentor Master Thorne.
- **Pain Points**: Need to establish a compelling backstory and a unique magic system.
- **Historical Context**: The story begins with the death of the last dragon, setting off a chain of events that threaten the realm.
- **External Factors**: The fantasy genre's competition and reader expectations for rich world-building and character depth.
- **Stakeholder Landscape**: Primarily the author, with potential feedback from beta readers and writing groups.

##### 2. Purpose & Vision & Framing
- **Vision**: To create an engaging fantasy narrative that explores themes of identity, power, and resilience.
- **Framing**: "A young blacksmith discovers her destiny as a weapon for good in a world overshadowed by darkness."
- **Core Purpose**: To tell a story of self-discovery and the fight against evil through the lens of a unique protagonist.
- **Success Criteria**: Completion of the manuscript, positive feedback from beta readers, and eventual publication.
- **Desired Future State**: A published novel that resonates with readers and contributes to the fantasy genre.
- **Strategic Alignment**: Aligns with the author's goal of establishing a career in writing fantasy literature.

##### 3. Scope & Boundaries
- **Deliverables**: Completed character backstories, magic system, kingdom map, character profiles, chapter outlines, and research documentation.
- **Exclusions**: No illustrations or marketing materials at this stage.
- **Constraints**: Limited by the author's current knowledge of medieval blacksmithing and fantasy tropes.
- **Assumptions**: The audience will appreciate a blend of traditional fantasy elements with innovative twists.
- **Key Risks**: Potential for writer's block or loss of direction in the plot development.

##### 4. Approach & Execution
- **Strategy**: Focus on iterative development of characters and world-building, followed by outlining the plot.
- **Methodology**: Use of brainstorming sessions and writing sprints to generate content.
- **Workstreams**: Parallel efforts on character development, magic system creation, and chapter outlining.
- **Milestones**: Completion of character profiles, magic system, and first draft of the first three chapters.
- **Resource Plan**: Utilize writing software, research materials, and feedback from writing groups.

##### 5. Coordination & Control
- **Governance**: The author will make all creative decisions, with input from trusted peers.
- **Decision Rights**: The author retains full control over plot and character development.
- **Communication Flow**: Regular updates to beta readers and writing groups for feedback.
- **Risk/Issue Management**: Establish a routine for addressing creative blocks and seeking external feedback.

##### 6. Knowledge & Learning
- **Lessons Applied**: Previous writing experiences and feedback will inform character and plot development.
- **Documentation Practices**: Maintain a writing journal to capture ideas and progress.
- **Continuous Improvement**: Regularly review and revise based on feedback and self-assessment.

##### 7. Magic System
- **Emotional Influence**: The magic system will incorporate emotional influences on weapon properties, inspired by Japanese sword-making traditions. For example, anger will produce fire damage, sorrow will create ice or frost effects, joy will yield healing properties, and fear will generate defensive shields.
- **Research Elements**: Incorporating Damascus steel patterns for visual descriptions, Celtic mythology about smith gods like Goibniu, and exploring various types of medieval weapons beyond swords.

##### 8. World-Building Additions
- **The Forge Temples**: Ancient sites where dragon fire still burns, integral to the magic system.
- **Smith's Guild**: A hierarchy and traditions that govern the craft of blacksmithing in the realm.
- **The Quenching Ritual**: A ceremonial process for completing magical weapons, adding depth to the crafting process.
- **Regional Techniques**: Highlighting differences in forging techniques across Aethermoor.

##### Character Relationships and Backstories
- **Elena (protagonist)**: Lost parents in a dragon attack at age 5, raised by Master Thorne who found her in ruins. She has recurring nightmares about fire and a secret: she's actually descended from the original Dragon Smiths.
- **Master Thorne**: Former royal blacksmith, exiled for refusing to make weapons for an unjust war. He knows Elena's true heritage but keeps it secret, and is dying from lung disease from years at the forge.
- **The Shadow King**: Was once a hero who saved the kingdom 500 years ago but was corrupted by the very magic he used to save everyone. He seeks Elena because only Dragon Smith weapons can free him from his curse.
- **Supporting cast**: Kai, Elena's childhood friend and now city guard, who is a potential love interest; Lady Morgana, the court wizard who suspects Elena's powers; and The Herald, the Shadow King's servant, who is formerly Elena's thought-dead mother.

---

## Preparatory Analysis Insights:

The following core dimensions were identified in preliminary analysis and may need updating:
- core_goals_momentum
- core_power_resources
- core_meaning_identity

Use these insights to focus your extraction, but re-analyze the full braindump to ensure completeness.

---

Process this brain dump for project context:

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

- **System Prompt:** ~1176 tokens
- **User Prompt:** ~1812 tokens
- **Total Estimate:** ~2988 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
