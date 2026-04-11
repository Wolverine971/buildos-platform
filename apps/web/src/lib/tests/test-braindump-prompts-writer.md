<!-- apps/web/src/lib/tests/test-braindump-prompts-writer.md -->

# Agentic Chat Prompt Tests - Writer/Author Persona

These prompts exercise the current BuildOS ontology and agentic chat tool surface. They replace the old legacy expectations for `projects`, `tasks`, `notes`, and "phases".

## Current Model Expectations

- New projects are created with `create_onto_project({ project, entities, relationships, context_document? })`.
- Project creation should use `project.type_key` values such as `project.creative.book`.
- Project metadata belongs in `project.props`, especially domain details and `props.facets`.
- Narrative context belongs in `onto_documents` as `document.context.project` or a focused project document, not in legacy notes.
- Follow-up work should use `onto_tasks` with `state_key` values `todo`, `in_progress`, `blocked`, or `done`.
- Priorities are numeric `1` to `5`, not string labels. Use `5` for urgent/high, `3` for normal, and `1` for low.
- Plans, milestones, risks, documents, goals, and tasks should be represented as `onto_*` entities and connected with `onto_edges`.
- Existing task updates require an exact `task_id`. If the ID is not already in context, the agent must search or list before calling `update_onto_task`.
- Calendar events should use `create_calendar_event` only for concrete dated or timed events. Recurrence that is not exposed by the current tool schema should be stored in task or document `props`, not sent as unsupported fields.
- Agentic chat pass criteria include: no `Unknown tool` errors, no empty write calls, no raw schema leakage, and no tool-round safety-limit failure.

## Test Prompt 1: Initial Book Project Setup

**Scenario**: Author starts a new fantasy novel from global or `project_create` context.

### Brain Dump

"I'm starting my first fantasy novel - 'The Last Ember'.

Main plot: A young blacksmith discovers she can forge magical weapons when the kingdom's last dragon dies and darkness threatens the realm.

Need to:

- Develop main character backstory (orphan, raised by master blacksmith)
- Create magic system based on metal and fire
- Map out the kingdom of Aethermoor
- Write character profiles for the antagonist (The Shadow King)
- Outline first three chapters
- Research medieval blacksmithing techniques
- Design the prophecy that drives the plot"

### Expected Agentic Chat Behavior

- Load or use the `project_creation` skill.
- Use `create_onto_project`; do not create a legacy project.
- Include `entities` and `relationships` arrays, even if some arrays are short.
- After successful creation, shift context to the created project workspace.
- Do not invent due dates, owners, or extra plans.

### Expected Results

- **Tool Path**:
    - `skill_load({ skill: "project_creation" })` when needed
    - optional `tool_schema({ op: "onto.project.create" })`
    - `create_onto_project`
- **onto_projects**:
    - `name`: `The Last Ember`
    - `type_key`: `project.creative.book`
    - `state_key`: `planning`
    - `description`: captures the blacksmith, dragon death, magical forging, and kingdom threat premise
    - `props.genre`: `fantasy`
    - `props.world_name`: `Aethermoor`
    - `props.protagonist`: young blacksmith, orphan, raised by master blacksmith
    - `props.antagonist`: `The Shadow King`
    - `props.facets.context`: `personal`
    - `props.facets.stage`: `planning`
- **onto_goals**:
    - `Complete first draft of The Last Ember`
- **onto_tasks**:
    - `Develop main character backstory (orphan, raised by master blacksmith)`, priority `4` or `5`
    - `Create magic system based on metal and fire`, priority `4` or `5`
    - `Map out the kingdom of Aethermoor`, priority `3` or `4`
    - `Write character profiles for The Shadow King`, priority `3` or `4`
    - `Outline first three chapters`, priority `3` or `4`
    - `Research medieval blacksmithing techniques`, priority `3`
    - `Design the prophecy that drives the plot`, priority `3` or `4`
- **onto_documents**:
    - Context document titled `Initial Novel Braindump` or `The Last Ember - Project Context`
    - `type_key`: `document.context.project`
    - `content`: includes the original premise and task list
- **onto_edges**:
    - project contains goal, tasks, and context document
    - goal supports or contains the seven starter tasks
- **Context Shift**:
    - `global` or `project_create` -> `project`
    - active `entity_id` is the created project ID

---

## Test Prompt 2: Chapter Progress and Existing Task Updates

**Scenario**: Author reports progress inside an existing `The Last Ember` project.

### Brain Dump

"Finished chapter 2 today - 4,500 words. The scene where Elena discovers the dragon forge went really well.

Issues to address:

- Need to strengthen the dialogue between Elena and Master Thorne
- The pacing in the middle feels slow
- Add more sensory details about the forge

Chapter 3 plans:

- Elena's first attempt at magical forging
- Introduce the Shadow King's herald
- Foreshadow the prophecy

Also need to go back and fix continuity issue - Elena's age mentioned as 16 in chapter 1 but 17 in chapter 2."

### Expected Agentic Chat Behavior

- Stay in the current project context.
- Search/list tasks before updating chapter 2 if the exact task ID is not in context.
- Update an existing chapter 2 task only when a matching task is found.
- Create future user work as tasks.
- Create a document for the chapter progress notes.

### Expected Results

- **Tool Path**:
    - `list_onto_tasks` or `search_onto_tasks` for existing chapter 2 task
    - `update_onto_task` only with an exact `task_id`
    - `create_onto_task` for revision and chapter 3 follow-up work
    - `create_onto_document` for progress notes
- **onto_tasks Updated**:
    - Matching `Write Chapter 2` or `Draft Chapter 2` task -> `state_key: "done"` when found
    - If no exact task exists, do not fake an update. Record completion in the document and create follow-up tasks.
- **onto_tasks Created**:
    - `Revise Chapter 2 dialogue between Elena and Master Thorne`, `type_key: "task.refine"`, priority `4`
    - `Improve pacing in the middle of Chapter 2`, `type_key: "task.refine"`, priority `3`
    - `Add sensory forge details to Chapter 2`, `type_key: "task.refine"`, priority `3`
    - `Fix continuity: Elena age is inconsistent between chapters 1 and 2`, priority `5`
    - `Draft Chapter 3: first magical forging, herald introduction, prophecy foreshadowing`, `type_key: "task.create"`, priority `4`
- **onto_documents**:
    - `Chapter 2 Progress Notes`
    - `type_key`: `document.notes.meeting_notes` or `document.knowledge.brain_dump`
    - `content`: 4,500 words completed, dragon forge scene worked, revision issues, chapter 3 beats
- **Must Not Happen**:
    - `update_onto_task({})`
    - updating a guessed task ID
    - creating duplicate generic `Write Chapter 2` tasks when completion was reported

---

## Test Prompt 3: Research and World-Building Session

**Scenario**: Author adds research findings and expands the magic system.

### Brain Dump

"Research notes for the magic system:

Found interesting parallels with Japanese sword-making traditions - the idea of the smith's spirit entering the blade. Could adapt this: Elena's emotions during forging affect the weapon's properties.

- Anger = fire damage
- Sorrow = ice/frost
- Joy = healing properties
- Fear = defensive shields

Also researching:

- Damascus steel patterns for visual descriptions
- Celtic mythology about smith gods (Goibniu)
- Types of medieval weapons beyond swords

World-building additions:

- The Forge Temples: ancient sites where dragon fire still burns
- Smith's Guild hierarchy and traditions
- The Quenching Ritual: how magical weapons are completed
- Regional differences in forging techniques across Aethermoor"

### Expected Agentic Chat Behavior

- Prefer a research/worldbuilding document for notes.
- Update or append to a matching magic system task only after resolving the exact task.
- Create tasks only for future work that the user still needs to perform.
- Do not turn every research bullet into a separate task.

### Expected Results

- **Tool Path**:
    - `create_onto_document`
    - optional `search_onto_tasks` or `list_onto_tasks`
    - optional `update_onto_task` for the existing magic system task
    - `create_onto_task` for selected future work
- **onto_documents**:
    - `Magic System Research Notes`
    - `type_key`: `document.knowledge.research`
    - `content`: emotion-to-weapon mapping, Japanese sword-making inspiration, Damascus steel, Goibniu, Forge Temples, Smith's Guild, Quenching Ritual, regional techniques
    - `props.topics`: `["magic system", "worldbuilding", "blacksmithing"]`
- **onto_tasks Created or Updated**:
    - Create or update `Document emotion-based forging rules`, priority `4`
    - Create `Research Damascus steel visual patterns`, priority `3`
    - Create `Develop Forge Temple locations and rules`, priority `3`
- **onto_edges**:
    - Research document linked to magic system task and project
- **Must Not Happen**:
    - Replacing the project description with the whole research dump
    - Creating low-value duplicate tasks for every bullet when a document is the better fit

---

## Test Prompt 4: Writing Schedule and Deadlines

**Scenario**: Author plans a writing routine. This is also a tool-round and recurrence stress test.

### Brain Dump

"Setting up my writing schedule for the next 3 months. Goal is to finish first draft by March 31, 2027.

Daily writing goal: 1,000 words minimum, Monday through Friday. Writing time: 5am-7am before work.

Weekly tasks:

- Saturday mornings: Chapter revision and editing
- Sunday afternoons: Plot planning for next week

Monthly milestones:

- January 2027: Complete chapters 1-10 (30,000 words)
- February 2027: Complete chapters 11-20 (30,000 words)
- March 2027: Complete chapters 21-30 and epilogue (35,000 words)

Also need to:

- Join local writers' critique group (meets 1st Tuesday of month)
- Submit chapter 1 to beta readers by January 15, 2027
- Research literary agents for fantasy genre"

### Expected Agentic Chat Behavior

- Keep the current project context.
- Use the smallest successful write set and avoid repair loops.
- Use milestones for dated draft checkpoints if the milestone tool is available in the active tool surface.
- If recurrence is not supported by the current calendar/task write schema, store recurrence metadata in task `props` or a schedule document instead of sending unsupported fields.
- If the request is too large for the current round limit, ask to split before making partial writes.

### Expected Results

- **Tool Path**:
    - `skill_load({ skill: "task_management" })` or `skill_load({ skill: "calendar_management" })` as needed
    - `update_onto_goal` if the draft goal exists and the direct tool is available; otherwise update the project context document
    - `create_onto_milestone` for January, February, and March checkpoints when available
    - `create_onto_task` for beta readers and literary agent research
    - `create_onto_document` for the writing schedule summary
    - optional `create_calendar_event` for concrete first occurrences only
- **onto_goals Updated or Created**:
    - `Complete first draft by March 31, 2027`
    - `props.target_word_count`: `95000`
- **onto_milestones**:
    - `Complete chapters 1-10`, due `2027-01-31`
    - `Complete chapters 11-20`, due `2027-02-28`
    - `Complete chapters 21-30 and epilogue`, due `2027-03-31`
- **onto_tasks**:
    - `Weekday writing block: 1,000 words`, `props.recurrence.frequency: "weekdays"`, `props.time_window: "05:00-07:00"`
    - `Saturday chapter revision and editing`, `props.recurrence.frequency: "weekly"`
    - `Sunday plot planning for next week`, `props.recurrence.frequency: "weekly"`
    - `Join local writers' critique group`, `props.recurrence.note: "1st Tuesday of each month"`
    - `Submit chapter 1 to beta readers`, due `2027-01-15`, priority `5`
    - `Research fantasy literary agents`, priority `3`
- **onto_documents**:
    - `Three-Month Writing Schedule`
    - includes the routine, word targets, monthly checkpoints, and recurrence details
- **Must Not Happen**:
    - Tool-round limit failure
    - `Unknown tool: create_onto_milestone`
    - unsupported recurrence fields passed to `create_calendar_event`
    - partial writes followed by "break this into smaller steps"

---

## Test Prompt 5: Character Development Deep Dive

**Scenario**: Author develops character profiles and relationships.

### Brain Dump

"Working on character relationships and backstories today.

Elena (protagonist):

- Lost parents in dragon attack at age 5
- Raised by Master Thorne who found her in ruins
- Has recurring nightmares about fire
- Secret: She's actually descended from the original Dragon Smiths

Master Thorne:

- Former royal blacksmith, exiled for refusing to make weapons for unjust war
- Knows Elena's true heritage but keeps it secret
- Dying from lung disease from years at the forge

The Shadow King:

- Was once a hero who saved the kingdom 500 years ago
- Corrupted by the very magic he used to save everyone
- Seeks Elena because only Dragon Smith weapons can free him from curse

Supporting cast:

- Kai: Elena's childhood friend, now city guard, potential love interest
- Lady Morgana: Court wizard who suspects Elena's powers
- The Herald: Shadow King's servant, formerly Elena's thought-dead mother"

### Expected Agentic Chat Behavior

- Create or update a character bible document.
- Create tasks for future writing scenes, not for every fact already captured.
- Link the document to relevant character or scene tasks when possible.

### Expected Results

- **Tool Path**:
    - `create_onto_document` or `update_onto_document` if a character bible already exists
    - `create_onto_task` for future scene work
- **onto_documents**:
    - `Character Bible`
    - `type_key`: `document.reference.handbook` or `document.knowledge.research`
    - `content`: Elena, Master Thorne, Shadow King, Kai, Lady Morgana, Herald; secrets and relationships
- **onto_tasks Created**:
    - `Write Elena's recurring fire nightmare sequence`, priority `4`
    - `Develop Master Thorne's exile backstory scene`, priority `3`
    - `Draft Shadow King's hero-to-villain transformation backstory`, priority `4`
    - `Outline reveal that the Herald is Elena's mother`, priority `5`
- **onto_edges**:
    - Character Bible linked to the new scene/backstory tasks
- **Must Not Happen**:
    - Creating separate project records for each character
    - Losing the secret/reveal details from the document

---

## Test Prompt 6: Publishing and Marketing Planning

**Scenario**: Author plans traditional and self-publishing paths.

### Brain Dump

"Starting to think about publication options for The Last Ember.

Traditional publishing route:

- Need to write query letter
- Create 1-page synopsis
- Research fantasy literary agents
- Prepare first 3 chapters as sample

Self-publishing considerations:

- Budget $3000 for professional editing
- Find cover artist specializing in fantasy
- Plan pre-launch marketing campaign
- Set up author website and newsletter

Timeline:

- Finish first draft: March 31, 2027
- Self-edit: April 2027
- Beta readers: May 2027
- Professional edit: June-July 2027
- Query agents or launch self-pub: August 2027

Also want to:

- Start building author platform on social media
- Write short stories in same universe for magazines
- Create series bible if this becomes Book 1"

### Expected Agentic Chat Behavior

- Represent this as a publishing plan plus milestones and tasks.
- Store strategy choices and budget in a document or project props.
- Do not create a new project unless the user asks for a separate publishing project.

### Expected Results

- **Tool Path**:
    - optional `create_onto_plan` for `Publishing Strategy`
    - optional `create_onto_milestone` for dated timeline points
    - `create_onto_task` for concrete future work
    - `create_onto_document` for strategy notes
    - optional `update_onto_project` to merge budget/timeline props
- **onto_plans**:
    - `Publishing Strategy`, `type_key: "plan.roadmap.publishing"` or `plan.phase.project`
- **onto_milestones**:
    - `Finish first draft`, due `2027-03-31`
    - `Self-edit complete`, due `2027-04-30`
    - `Beta reader round complete`, due `2027-05-31`
    - `Professional edit complete`, due `2027-07-31`
    - `Query agents or launch self-pub`, due `2027-08-31`
- **onto_tasks**:
    - `Write query letter`, priority `3`
    - `Create one-page synopsis`, priority `3`
    - `Research fantasy literary agents`, priority `4`
    - `Prepare first three chapters as sample`, priority `4`
    - `Find professional fantasy editor`, priority `4`, `props.budget_usd: 3000`
    - `Find fantasy cover artist`, priority `3`
    - `Set up author website and newsletter`, priority `3`
    - `Create series bible`, priority `2`
- **onto_documents**:
    - `Publishing Options and Marketing Notes`
    - includes traditional route, self-publishing considerations, budget, and timeline

---

## Test Prompt 7: Revision and Editing Process

**Scenario**: Author processes critique group feedback on chapters 1-3.

### Brain Dump

"Got feedback from my critique group on chapters 1-3. Major revision needed.

Chapter 1 issues:

- Opening is too slow - start with action not description
- Elena needs stronger voice from page 1
- Cut the 3 pages of world history - weave it in later

Chapter 2 improvements needed:

- Master Thorne's dialogue too modern - needs more archaic feel
- Add scene showing Elena's daily forge work before the discovery
- The dragon forge discovery happens too easily - add obstacles

Chapter 3 restructure:

- Move the prophecy reveal to chapter 5
- Focus on Elena's emotional journey
- Add more conflict with Kai about her destiny

Also, writing style notes:

- Too many adverbs - search and destroy
- Vary sentence structure more
- Stop using 'suddenly' as a crutch
- Better sensory details in action scenes"

### Expected Agentic Chat Behavior

- Create a critique feedback document.
- Create revision tasks grouped by chapter and global style work.
- Do not mark any chapter draft done unless the user says it is done.

### Expected Results

- **Tool Path**:
    - `create_onto_document`
    - `create_onto_task` for targeted revisions
- **onto_documents**:
    - `Critique Group Feedback - Chapters 1-3`
    - `type_key`: `document.notes.meeting_notes`
    - `content`: all chapter-specific and style feedback
- **onto_tasks Created**:
    - `Revise Chapter 1 opening to start with action`, priority `5`
    - `Strengthen Elena's voice from page 1`, priority `4`
    - `Cut and redistribute Chapter 1 world history exposition`, priority `4`
    - `Revise Master Thorne dialogue for archaic feel`, priority `3`
    - `Add Elena's daily forge work scene before discovery`, priority `3`
    - `Add obstacles to the dragon forge discovery`, priority `4`
    - `Restructure Chapter 3 to move prophecy reveal to Chapter 5`, priority `5`
    - `Add Kai conflict about Elena's destiny`, priority `3`
    - `Global style pass: reduce adverbs and sudden overuse`, priority `3`
    - `Improve sensory details in action scenes`, priority `3`

---

## Agentic Chat Behavior Probes

Use these short prompts after the main writer tests to exercise the chat system in ways the legacy brain-dump tests did not.

### Probe 1: Brainstorm Without Writes

**Prompt**: "I'm stuck on how Elena escapes the shadow realm. Brainstorm options with me, but do not create tasks or documents yet."

**Expected**:

- No write tools.
- The agent brainstorms in chat.
- It may offer to save options afterward.

### Probe 2: Exact-ID Update Required

**Prompt**: "Mark the prophecy task done."

**Expected**:

- If the prophecy task ID is in current context, call `update_onto_task({ task_id, state_key: "done" })`.
- If the ID is not in context, call `search_onto_tasks` or `list_onto_tasks` first.
- Must not update a guessed ID.

### Probe 3: Cross-Project Guardrail

**Prompt**: "For The Last Ember, finish chapter 10. For my short story Dragon's Dawn, polish the ending too."

**Expected**:

- In a `The Last Ember` project context, create only `Finish Chapter 10` unless the user explicitly switches or grants cross-project scope.
- Mention that `Dragon's Dawn` appears to be another project and ask whether to switch or add it separately.

### Probe 4: Tool Discovery Without Mutation

**Prompt**: "Find the right tool for moving the Character Bible under the Research folder, but don't move anything yet."

**Expected**:

- `tool_search` or `tool_schema` is allowed.
- No `move_document_in_tree` call.
- Final answer names the direct tool and required IDs.

### Probe 5: Repair Loop and Unknown Tool Guard

**Prompt**: "Add milestones for draft, beta readers, editor handoff, and publication launch."

**Expected**:

- If `create_onto_milestone` is available, use it with concrete titles and dates only when dates are known.
- If dates are missing, ask one concise clarification or create undated milestones when the tool allows it.
- Must not call an unavailable direct tool repeatedly.
- Must not end with a tool-round safety-limit message after partial writes.
