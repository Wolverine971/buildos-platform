<!-- apps/web/src/lib/tests/test-braindump-prompts-student.md -->

# Agentic Chat Prompt Tests - High School Student Persona

These prompts exercise the current BuildOS ontology and agentic chat behavior for school planning. They replace the old expectations for legacy `projects`, `tasks`, `notes`, "phases", and string priorities.

## Current Model Expectations

- New student efforts should use `create_onto_project({ project, entities, relationships, context_document? })`.
- Use `project.type_key` values such as `project.education.semester`, `project.education.exam_prep`, `project.education.college_applications`, or `project.education.science_fair`.
- Store course load, extracurriculars, targets, and constraints in `project.props` and/or a `document.context.project`.
- Use `onto_tasks` for future student work and exact-ID `update_onto_task` for changes to existing tasks.
- Use `onto_documents` for schedules, study plans, member lists, research notes, and project documentation.
- Use `onto_goals` for outcomes such as GPA, SAT score, varsity soccer, college applications, or project delivery.
- Use `onto_milestones` for major dated checkpoints when the milestone tool is available in the active tool surface.
- Use `create_calendar_event` only for concrete timed events. Recurrence details not supported by the exposed schema should be stored in task or document `props`.
- Priorities are numeric `1` to `5`.
- Dates in this file are future-dated for deterministic testing from the current repository context. Use the `America/New_York` timezone unless the app test harness provides another timezone.
- Agentic chat pass criteria include: no `Unknown tool` errors, no empty write calls, no unsupported recurrence fields, no raw schema leakage, and no tool-round safety-limit failure.

## Test Prompt 1: Semester Planning

**Scenario**: Student starts a semester planning project.

### Brain Dump

"New semester starting January 12, 2027! Taking AP Calc, AP Bio, English Lit, US History, Spanish 3, and Physics.

Extracurriculars:

- Debate team (tournaments every other Saturday)
- Student council (VP, meetings Wednesdays)
- Soccer (practice M/W/F after school)
- Math tutoring volunteer (Thursday evenings)

Big things coming up:

- SAT on March 13, 2027
- AP exams in May 2027
- Soccer playoffs in April 2027
- Science fair project due February 26, 2027
- College apps next fall (need to start thinking about this)

Goals for this semester:

- Keep GPA above 3.8
- Score 1500+ on SAT
- Win at least one debate tournament
- Make varsity soccer"

### Expected Agentic Chat Behavior

- Use project creation, not legacy task-only extraction.
- Create a context document capturing courses, extracurriculars, dates, and goals.
- Create goals for the major outcomes and only starter tasks that require action now.
- Store recurring activity patterns in task/document props unless a recurrence-capable write tool is available.

### Expected Results

- **Tool Path**:
    - `skill_load({ skill: "project_creation" })` when needed
    - optional `tool_schema({ op: "onto.project.create" })`
    - `create_onto_project`
- **onto_projects**:
    - `name`: `Spring Semester 2027`
    - `type_key`: `project.education.semester`
    - `state_key`: `planning`
    - `start_at`: `2027-01-12`
    - `props.courses`: AP Calc, AP Bio, English Lit, US History, Spanish 3, Physics
    - `props.extracurriculars`: debate, student council, soccer, math tutoring
    - `props.facets.context`: `personal`
    - `props.facets.stage`: `planning`
- **onto_goals**:
    - `Keep GPA above 3.8`, `type_key: "goal.metric"`
    - `Score 1500+ on SAT`, `type_key: "goal.metric"`
    - `Win at least one debate tournament`, `type_key: "goal.outcome.project"`
    - `Make varsity soccer`, `type_key: "goal.outcome.project"`
- **onto_tasks**:
    - `Create study schedule for AP classes`, priority `5`
    - `Register for March 13 SAT`, due `2027-02-01`, priority `5`
    - `Choose science fair project topic`, due `2027-01-30`, priority `5`
    - `Start college application planning checklist`, priority `3`
    - Activity tracking tasks for soccer, student council, math tutoring, and debate should include recurrence details in `props.schedule`, not unsupported top-level fields.
- **onto_documents**:
    - `Spring Semester 2027 Context`
    - `type_key`: `document.context.project`
    - includes course load, activities, goals, and major dates
- **onto_edges**:
    - goals connected to starter tasks where relevant

---

## Test Prompt 2: Weekly Homework Management

**Scenario**: Student organizes a busy school week inside an existing semester project.

### Brain Dump

"Crazy week ahead!

Monday, January 18, 2027:

- Calc quiz on derivatives (need to review chain rule)
- English essay draft due (3 pages on Hamlet)
- Soccer practice 3:30-5:30

Tuesday, January 19, 2027:

- Bio lab report due (photosynthesis experiment)
- Spanish oral presentation (2 minutes on my family)

Wednesday, January 20, 2027:

- Student council meeting - planning prom fundraiser
- History reading chapters 12-14

Thursday, January 21, 2027:

- Physics problem set due (kinematics)
- Math tutoring 6-8pm
- Start studying for Friday's history test

Friday, January 22, 2027:

- US History test (Civil War unit)
- Debate prep after school for Saturday tournament

Saturday, January 23, 2027:

- Debate tournament all day (leave at 6am!)

Also this week: Need to finish college essay first draft and get teacher recommendations"

### Expected Agentic Chat Behavior

- Stay in the existing semester project.
- Create task records for assignments and prep work.
- Create calendar events for timed commitments when the calendar tool is available.
- Create one weekly schedule document for context.
- Do not create a new semester project.

### Expected Results

- **Tool Path**:
    - `create_onto_document`
    - `create_onto_task` for assignments and prep work
    - optional `create_calendar_event` for soccer practice, tutoring, debate tournament, meetings
- **onto_tasks Created**:
    - `Study for Calculus derivatives quiz`, due `2027-01-18`, priority `5`
    - `Finish Hamlet essay draft`, due `2027-01-18`, priority `5`
    - `Complete Bio photosynthesis lab report`, due `2027-01-19`, priority `5`
    - `Prepare Spanish oral presentation`, due `2027-01-19`, priority `4`
    - `Complete History reading chapters 12-14`, due `2027-01-20`, priority `3`
    - `Complete Physics kinematics problem set`, due `2027-01-21`, priority `4`
    - `Study for US History Civil War test`, due `2027-01-22`, priority `5`
    - `Prepare for debate tournament`, due `2027-01-22`, priority `4`
    - `Finish college essay first draft`, due `2027-01-24`, priority `3`
    - `Request teacher recommendations`, due `2027-01-24`, priority `3`
- **onto_documents**:
    - `Weekly Schedule - January 18-23, 2027`
    - includes all commitments and due dates
- **onto_events**:
    - Soccer practice, student council meeting, math tutoring, debate tournament when calendar writes are enabled
- **Must Not Happen**:
    - Assignments stored only in a narrative note with no tasks
    - Calendar recurrence fields sent to `create_calendar_event`

---

## Test Prompt 3: Exam Preparation Strategy

**Scenario**: Student plans AP and SAT prep with weak areas and routines.

### Brain Dump

"AP exams are coming up in 6 weeks! Need to get serious about studying.

AP Calc BC:

- Weak areas: Series convergence tests, polar coordinates
- Strong areas: Derivatives, basic integrals
- Plan: 1 hour daily practice, focus on FRQs
- Get Princeton Review book

AP Bio:

- Need to memorize: Krebs cycle, photosynthesis steps, DNA replication
- Lab practicals are tough - review all 12 required labs
- Study group with Jake and Sarah on Sundays
- Make flashcards for vocabulary

SAT Prep:

- Current practice score: 1420 (720 Math, 700 Reading)
- Target: 1500+
- Math is good, need to improve reading speed
- Take practice test every Saturday morning
- Khan Academy 30 min daily

Study Schedule:

- Morning: 30 min SAT review before school
- After school: Alternate between AP Calc and Bio
- Weekends: Full practice tests and review

Also need to maintain regular homework - can't let grades slip while prepping for tests!"

### Expected Agentic Chat Behavior

- Use a plan under the existing semester project or create a focused exam prep project only if the user is not already in a semester project.
- Capture weak areas and strategy in a document.
- Use goals for SAT target and AP exam readiness.
- Use tasks with `props.schedule` for recurring routines.

### Expected Results

- **Tool Path**:
    - optional `create_onto_plan`
    - `create_onto_document`
    - `create_onto_task`
    - optional `create_calendar_event` for first concrete study group or practice test occurrence
- **onto_plans**:
    - `Spring 2027 Exam Preparation`
    - `type_key`: `plan.phase.project` or `plan.process.study`
- **onto_goals**:
    - `Score 1500+ on SAT`
    - `Be ready for AP Calc BC exam`
    - `Be ready for AP Bio exam`
- **onto_tasks**:
    - `Buy Princeton Review AP Calc BC book`, priority `4`
    - `Create AP Bio vocabulary flashcards`, priority `5`
    - `Review all 12 AP Bio labs`, priority `4`
    - `Daily AP Calc FRQ practice`, `props.schedule.frequency: "daily"`, `props.duration_minutes: 60`
    - `Sunday AP Bio study group with Jake and Sarah`, `props.schedule.frequency: "weekly"`
    - `Saturday SAT practice test`, `props.schedule.frequency: "weekly"`
    - `Daily Khan Academy SAT reading practice`, `props.duration_minutes: 30`
- **onto_documents**:
    - `Exam Prep Strategy`
    - includes weak areas, current SAT score, target score, schedule, and grade-risk note
- **Must Not Happen**:
    - Creating a task for "maintain homework" without any concrete action
    - Ignoring the SAT current score and target

---

## Test Prompt 4: Balancing Academics and Sports

**Scenario**: Student athlete manages an intensified sports schedule and academic eligibility.

### Brain Dump

"Soccer season is getting intense and it's affecting my study time.

New practice schedule:

- Regular practice: M/W/F 3:30-6pm (was 3:30-5:30)
- Added Tuesday morning conditioning 6-7am
- Games: Tuesday evenings (home) and Thursday evenings (50% away)
- Weekend tournaments once a month

This week's games:

- Tuesday, February 2, 2027 vs. Lincoln High (home) 7pm
- Thursday, February 4, 2027 at Jefferson (away, 1 hour bus ride) 6pm

Missing classes for away games:

- Thursday leaving at 4pm (missing last period Physics)
- Need to get assignments in advance

Study time adjustments:

- Can't study M/W/F evenings anymore (too tired after practice)
- Move heavy studying to Tuesday/Thursday mornings
- Weekend mornings for major projects
- Study on bus for away games

Also coach wants me to:

- Track daily nutrition and hydration
- Do extra shooting practice 30 min daily
- Ice bath recovery twice a week

Still need to maintain grades for athletic eligibility - minimum 2.5 GPA but aiming for 3.8+"

### Expected Agentic Chat Behavior

- Update the project context with the new sports constraint.
- Create tasks for academic mitigation and coach requirements.
- Use calendar events for concrete games when available.
- Represent eligibility risk as a risk entity only when risk write tools are available; otherwise capture it in the schedule document and task descriptions.

### Expected Results

- **Tool Path**:
    - `create_onto_document`
    - `create_onto_task`
    - optional `create_calendar_event`
    - optional `create_onto_risk` or project/document update for eligibility risk
- **onto_documents**:
    - `Soccer Season Study Adjustment Plan`
    - includes schedule changes, study adjustments, class conflict, coach requirements, GPA constraint
- **onto_tasks**:
    - `Get Physics assignments in advance for Jefferson away game`, due `2027-02-03`, priority `5`
    - `Block Tuesday and Thursday morning heavy study sessions`, priority `4`, `props.schedule.days: ["Tuesday", "Thursday"]`
    - `Use away-game bus rides for study review`, priority `3`
    - `Track daily nutrition and hydration`, priority `3`, `props.schedule.frequency: "daily"`
    - `Daily extra shooting practice`, priority `3`, `props.duration_minutes: 30`
    - `Ice bath recovery twice weekly`, priority `2`, `props.schedule.frequency: "twice_weekly"`
- **onto_events**:
    - `Soccer game vs. Lincoln High`, start `2027-02-02T19:00:00`, project scoped
    - `Soccer game at Jefferson`, start `2027-02-04T18:00:00`, project scoped, description includes 4pm departure
- **Risk or Context**:
    - `Athletic eligibility risk if GPA drops below 2.5`, impact `high`, or equivalent risk section in document
- **Must Not Happen**:
    - Losing the academic eligibility constraint
    - Creating duplicate recurring tasks for every future game without dates

---

## Test Prompt 5: College Application Planning

**Scenario**: Junior year student starts college application planning.

### Brain Dump

"Junior year is almost over, need to start college stuff seriously.

College list so far:

- Reach: MIT, Stanford (engineering programs)
- Target: State University, Tech Institute
- Safety: Local State, Community College transfer program

Summer plans:

- SAT prep intensive course (June 2027)
- Visit 5 colleges in July 2027
- Start Common App essays in August 2027
- Engineering summer camp at State U (2 weeks in July 2027)

Application requirements to track:

- SAT scores (retake in August if needed)
- 3 teacher recommendations (ask by end of this year!)
- Counselor recommendation
- Transcripts
- Common App essay (650 words)
- Supplemental essays (MIT has 5, Stanford has 3)
- Activity list (need to document all extracurriculars)
- Financial aid forms (FAFSA in October 2027)

Things to do before summer:

- Ask Mr. Johnson (AP Calc) for recommendation
- Ask Ms. Smith (AP Bio) for recommendation
- Ask Mrs. Davis (English) for recommendation
- Update resume with junior year activities
- Register for August SAT (backup date)
- Research scholarship opportunities"

### Expected Agentic Chat Behavior

- Create a new college application project if not already in one, or create a college applications plan inside the semester project if already scoped there.
- Use documents for school list and requirements.
- Use tasks and milestones for deadlines.

### Expected Results

- **Tool Path**:
    - `create_onto_project` if starting from global/project_create
    - or `create_onto_plan`, `create_onto_document`, and `create_onto_task` if already in semester project
- **onto_projects or onto_plans**:
    - `College Applications 2027`
    - `type_key`: `project.education.college_applications` for a new project
- **onto_documents**:
    - `College List and Requirements`
    - includes reach/target/safety list, essays, recommendations, transcripts, activity list, FAFSA
- **onto_tasks**:
    - `Ask Mr. Johnson for recommendation`, due `2027-05-30`, priority `5`
    - `Ask Ms. Smith for recommendation`, due `2027-05-30`, priority `5`
    - `Ask Mrs. Davis for recommendation`, due `2027-05-30`, priority `5`
    - `Update activity resume with junior year activities`, due `2027-06-01`, priority `5`
    - `Register for August SAT backup date`, due `2027-06-15`, priority `3`
    - `Research scholarship opportunities`, priority `3`
    - `Draft Common App essay`, start `2027-08-01`, priority `5`
    - `Write MIT supplemental essays`, priority `4`, `props.essay_count: 5`
    - `Write Stanford supplemental essays`, priority `4`, `props.essay_count: 3`
- **onto_milestones**:
    - `SAT prep intensive course`, target `2027-06`
    - `College visits`, target `2027-07`
    - `Engineering summer camp`, target `2027-07`
    - `FAFSA opens`, target `2027-10`
- **Must Not Happen**:
    - Flattening MIT and Stanford supplemental essays into one vague task with no essay counts

---

## Test Prompt 6: Science Fair Project Management

**Scenario**: Student starts a science fair project with experiment phases, materials, data, and deliverables.

### Brain Dump

"Science fair project on effect of different light wavelengths on plant growth.

Timeline (project due February 28, 2027):

- Week 1-2 (January 20-31, 2027): Set up experiment, plant seeds
- Week 3-4 (February 1-14, 2027): Daily measurements and observations
- Week 5 (February 15-21, 2027): Data analysis and graphs
- Week 6 (February 22-28, 2027): Create display board and practice presentation

Materials needed:

- LED grow lights (red, blue, white) - $120
- 30 bean plants seeds - $10
- Potting soil and containers - $25
- Light meter - borrow from physics lab
- Camera for daily photos

Daily tasks during experiment:

- Measure plant height (7am before school)
- Water plants (consistent 50ml per plant)
- Take photos from same angle
- Record observations in lab notebook
- Check soil moisture and temperature

Data to track:

- Plant height (mm)
- Number of leaves
- Leaf color (color chart comparison)
- Stem thickness
- Root development (end only)

Deliverables:

- Research paper (8-10 pages)
- Display board (trifold)
- Lab notebook (complete documentation)
- 5-minute presentation
- Abstract (250 words)

Need help from:

- Dad for building light fixtures
- Bio teacher for reviewing methodology
- Stats teacher for data analysis help"

### Expected Agentic Chat Behavior

- Create a focused science fair project from global/project_create context.
- Use plans for phases, tasks for actions, document for protocol/materials, milestones for due dates.
- Store daily measurement recurrence in `props.schedule` unless a recurrence tool is exposed.
- Include materials budget and data fields in props/document content.

### Expected Results

- **Tool Path**:
    - `create_onto_project`
- **onto_projects**:
    - `name`: `Science Fair - Plant Light Wavelength Study`
    - `type_key`: `project.education.science_fair`
    - `end_at`: `2027-02-28`
    - `props.material_budget_usd`: `155`
    - `props.data_fields`: plant height, leaf count, leaf color, stem thickness, root development
- **onto_goals**:
    - `Complete science fair project by February 28, 2027`
    - `Run a documented plant growth experiment`
- **onto_plans**:
    - `Setup and Planting`, dates `2027-01-20` to `2027-01-31`
    - `Data Collection`, dates `2027-02-01` to `2027-02-14`
    - `Analysis and Graphs`, dates `2027-02-15` to `2027-02-21`
    - `Presentation Prep`, dates `2027-02-22` to `2027-02-28`
- **onto_tasks**:
    - `Purchase LED lights, seeds, soil, and containers`, due `2027-01-25`, priority `5`
    - `Borrow light meter from physics lab`, due `2027-01-25`, priority `4`
    - `Set up experiment and plant seeds`, due `2027-01-31`, priority `5`
    - `Daily plant measurements and observations`, `props.schedule.start: "2027-02-01"`, `props.schedule.end: "2027-02-14"`, `props.time: "07:00"`
    - `Analyze data and create graphs`, due `2027-02-21`, priority `5`
    - `Write research paper`, due `2027-02-20`, priority `5`
    - `Create display board`, due `2027-02-25`, priority `5`
    - `Practice 5-minute presentation`, due `2027-02-27`, priority `3`
- **onto_documents**:
    - `Science Fair Experiment Protocol`
    - includes hypothesis, materials, measurement procedure, data fields, deliverables, and helper roles
- **onto_edges**:
    - tasks linked under the matching phase plans

---

## Test Prompt 7: Study Group Coordination

**Scenario**: Student organizes recurring study groups and responsibilities.

### Brain Dump

"Setting up study groups for finals prep.

AP Calc study group:

- Members: Me, Alex, Jordan, Sam
- Meet Mondays and Thursdays 7-9pm at library
- Focus topics by week:
    - Week 1: Integration techniques
    - Week 2: Series and sequences
    - Week 3: Polar and parametric
    - Week 4: Practice AP exam questions

Bio study group:

- Members: Me, Jake, Sarah, Emma
- Sunday afternoons 2-5pm at Jake's house
- Each person presents one unit
- I'm responsible for Unit 4: Cell Communication

Spanish conversation practice:

- Partner with Maria (native speaker)
- Tuesday and Thursday lunch periods
- 30 minutes speaking only Spanish
- She helps with pronunciation, I help with her English essays

History project group:

- Group presentation on Civil War battles
- Meet every Wednesday after school
- I'm researching Gettysburg
- Presentation date: March 15, 2027

Virtual SAT prep group:

- Online Discord server with 10 students
- Saturday mornings 9-11am
- Rotate who brings practice problems
- Share strategies and resources"

### Expected Agentic Chat Behavior

- Create one coordination document with member lists and locations.
- Create tasks for the student's responsibilities.
- Use calendar events only for concrete first occurrences or when recurrence support exists.
- Do not create separate projects for every study group.

### Expected Results

- **Tool Path**:
    - `create_onto_document`
    - `create_onto_task`
    - optional `create_calendar_event` for first events
- **onto_documents**:
    - `Finals Study Group Coordination`
    - includes member lists, meeting locations, topic schedule, and responsibilities
- **onto_tasks**:
    - `Prepare Bio Unit 4 Cell Communication presentation`, priority `5`
    - `Research Gettysburg for Civil War presentation`, due `2027-03-10`, priority `5`
    - `Create integration techniques summary for AP Calc group`, priority `3`
    - `Prepare practice problems for SAT prep group when assigned`, priority `3`
- **Schedule Metadata**:
    - AP Calc: Monday and Thursday, 7-9pm, library
    - Bio: Sunday, 2-5pm, Jake's house
    - Spanish: Tuesday and Thursday lunch, 30 minutes
    - History: Wednesday after school
    - SAT: Saturday, 9-11am, Discord
- **Must Not Happen**:
    - Creating contacts or actors for named students without permission
    - Creating dozens of event instances without explicit recurrence support

---

## Agentic Chat Behavior Probes

Use these prompts after the main student tests to cover agentic behaviors the legacy brain-dump tests did not check.

### Probe 1: Schedule Conflict Triage

**Prompt**: "Debate tournament is the same day as the SAT. Help me decide, but don't create anything yet."

**Expected**:

- No write tools.
- Agent reasons through tradeoffs and asks for missing decision criteria if needed.
- It may offer to create a decision task afterward.

### Probe 2: Urgent Grade Recovery

**Prompt**: "I failed the calc test. Grade dropped to C-. Coach says if GPA drops below 2.5 I'm off the team. Track a recovery plan."

**Expected**:

- Create concrete tasks for teacher meeting, tutoring, extra credit, and study plan.
- Create or update a risk if the risk tool is available; otherwise capture the eligibility risk in a document.
- Use priority `5` for urgent recovery steps.

### Probe 3: Ambiguous Update Requires Resolution

**Prompt**: "Mark the essay done."

**Expected**:

- If a single obvious essay task is in context, update it.
- If multiple essay tasks exist, ask which one or list candidates.
- Must not update a random task.

### Probe 4: Cross-Project Scope

**Prompt**: "For semester planning, add a task for AP Bio flashcards. For college apps, add MIT supplement research."

**Expected**:

- In a semester project context, create only the AP Bio flashcards task unless cross-project writes are explicitly supported and scoped.
- Ask whether to switch to or create the college applications project for the MIT task.

### Probe 5: Overwhelm and Chat-Only Support

**Prompt**: "I have 3 tests, 2 papers, science fair, and soccer championships next week. I don't know how I'll manage."

**Expected**:

- Agent may ask whether to make a plan or can first triage in chat.
- If the user did not request tracking, no write tools are required.
- If it does create tasks, it should create a small prioritized set, not one task per phrase.

### Probe 6: Tool Discovery Without Mutation

**Prompt**: "What tool would you use to create a calendar event for tutoring, but don't schedule it yet?"

**Expected**:

- `tool_search` or `tool_schema` is allowed.
- No `create_calendar_event`.
- Final answer names `create_calendar_event` / `cal.event.create` and required fields.

### Probe 7: Attendance Limit Constraint

**Prompt**: "Already missed 8 days this semester and the limit is 10. I have 3 college visits and 2 debate tournaments left. Help me track the attendance risk."

**Expected**:

- Create a planning task or document if the user wants tracking.
- Capture current misses `8`, limit `10`, and remaining events `5`.
- If risk tooling is available, create `Attendance limit risk` with high impact.
