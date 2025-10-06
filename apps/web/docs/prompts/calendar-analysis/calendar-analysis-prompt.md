# Prompt Audit: calendar-analysis

**Generated at:** 2025-10-06T04:25:38.687Z
**Environment:** Development

## Metadata

```json
{
	"userId": "255735ad-a34b-4ca9-942c-397ed8cc1435",
	"eventCount": 178,
	"pastEventCount": 22,
	"upcomingEventCount": 156,
	"minConfidence": 0.4,
	"existingProjectCount": 0,
	"timestamp": "2025-10-06T04:25:38.687Z"
}
```

## System Prompt

```
You are an expert in analyzing calendar events to identify potential projects. Always respond with valid JSON following the specified schema.
```

## User Prompt

```

A user has asked you to analyze their google calendar and suggest projects based off the events.

Your role is to act like a project organizer and look at the google calendar events and suggest projects with associated tasks.

**IMPORTANT CONTEXT**: Today's date is 2025-10-06. You have access to both past and upcoming calendar events.

You will be returning a JSON response of detailed "suggestions" array. See **Output Requirements** for correct JSON schema formatting.

## User's Existing Projects

No existing projects.

---

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: The user already has the projects listed above. When analyzing calendar events:

1. **Check for matches** against existing projects:
   - Compare by project name, description, tags, and context
   - Look for semantic similarity (e.g., "Marketing Campaign" matches "Q4 Marketing Push")
   - Consider if calendar events relate to existing project scope

2. **If a match is found** (confidence >= 70%):
   - Set "add_to_existing": true
   - Set "existing_project_id": "<matching_project_id>"
   - Set "deduplication_reasoning": "Explanation of why this matches existing project"
   - Still generate suggested_tasks to add to the existing project

3. **Only suggest NEW projects if**:
   - Calendar events represent meaningfully different work
   - No semantic match with existing projects
   - Events indicate a distinct initiative or goal

4. **When uncertain** (50-70% match):
   - Err on the side of adding to existing projects
   - Provide clear reasoning for the decision

## Project Detection Criteria

Identify projects based on:
- Recurring meetings with similar titles/attendees (likely ongoing projects)
- Clusters of related events (project milestones, reviews, planning sessions)
- Events with project-indicating keywords (sprint, launch, milestone, review, kickoff, deadline, sync, standup, retrospective, planning, design, implementation)
- Series of events building toward a goal
- Events with multiple attendees working on the same topic
- Any pattern suggesting coordinated work effort

Ignore:
- One-off personal events (lunch, coffee, dentist, doctor, vacation)
- Company all-hands or general meetings without specific project focus
- Events marked as declined or tentative
- Generic focus/work blocks without specific context
- Social events without work context

## Data Models

### Project Model (REQUIRED structure):
projects: {
  name: string (required, max 255),
  slug: string (REQUIRED - generate from name: lowercase, replace spaces/special chars with hyphens),
  description: string,
  context: string (required, rich markdown),
  executive_summary: string (<500 chars),
  status: "active"|"paused"|"completed"|"archived",
  start_date: "YYYY-MM-DD" (REQUIRED - parse from braindump or use today),
  end_date?: "YYYY-MM-DD" (parse timeline from braindump or leave null),
  tags: string[]
}

### Task Model (REQUIRED structure):
tasks: {
  title: string (required, max 255),
  description: string,
  details: string (specifics mentioned in braindump),
  status: "backlog"|"in_progress"|"done"|"blocked",
  priority: "low"|"medium"|"high",
  task_type: "one_off"|"recurring",
  duration_minutes?: number,
  start_date?: "YYYY-MM-DDTHH:MM:SS" (timestamptz - parse dates AND times, intelligently order tasks throughout the day e.g. "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm, REQUIRED if task_type is "recurring"),
  recurrence_pattern?: "daily"|"weekdays"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly" (REQUIRED if task_type is "recurring"),
  recurrence_ends?: "YYYY-MM-DD" (date only - parse from braindump or defaults to project end date if not specified),
  dependencies?: string[],
  parent_task_id?: string
}

**Context Generation (for projects)**:
Create comprehensive markdown that brings anyone up to speed. The following framework provides organizational guidance that should be adapted to best serve each project's unique needs:

**[Note: This is a flexible guide, not a rigid template. Adapt sections, combine categories, or add new dimensions as appropriate for the project]**

1. **Situation & Environment** – Current state, pain points, relevant history, external factors, stakeholder landscape
2. **Purpose & Vision & Framing** – The vision is the most important part. The framing should draw from the words of the user
Core purpose, success criteria, desired future state, strategic alignment
3. **Scope & Boundaries** – Deliverables, exclusions, constraints, assumptions, key risks
4. **Approach & Execution** – Strategy, methodology, workstreams, milestones, resource plan
5. **Coordination & Control** – Governance, decision rights, communication flow, risk/issue management
6. **Knowledge & Learning** – Lessons applied, documentation practices, continuous improvement approach

**Remember:** This framework is a guide to help organize thoughts. Prioritize clear communication and project-specific organization over rigid adherence to this structure. Add, combine, or reorganize sections as needed.

**Rule:** Include in context only if the update affects these dimensions. Progress updates or short-term tasks go in `tasks` or status fields instead.

## Calendar Events to Analyze

### Past Events (22 events)
**Use these events ONLY for project context and understanding. DO NOT create tasks from past events.**
[
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20250929T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-09-29T08:00:00-04:00",
    "end": "2025-09-29T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "d1i1mtjng24b62lai4gqoohpqc",
    "title": "Reach out to enneagram people",
    "description": "Project: 9takes\n\n\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #3f6fa916-f5bd-442e-a2c0-6f15ccfbcfd4]",
    "start": "2025-09-29T14:30:00-04:00",
    "end": "2025-09-29T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "m0fnjop1ehk5ghp2hbnk9dvbik",
    "title": "Create Social Media Post for 9takes",
    "description": "Project: 9takes\n\nPrepare and publish a social media post for the 9takes project, aligning with the project's emotional intelligence theme.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #8a8931f0-aea2-4628-9122-2c49a8953972]",
    "start": "2025-09-29T18:00:00-04:00",
    "end": "2025-09-29T19:00:00-04:00",
    "recurring": false
  },
  {
    "id": "kndk4hef283idbsi3msu8kbegs",
    "title": "Draft Email 1 - Welcome and Teaser for Waitlist",
    "description": "Project: 9takes\n\nCreate an introductory email to acknowledge the waitlist, thank users for their patience, and tease upcoming features. This email sets the tone for the email campaign sequence.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #275bf202-6b90-4d42-a32c-782eb848dde0]",
    "start": "2025-09-29T18:30:00-04:00",
    "end": "2025-09-29T19:30:00-04:00",
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20250930T000000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-09-29T20:00:00-04:00",
    "end": "2025-09-29T21:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20250930T010000Z",
    "title": "Trash to the curb",
    "start": "2025-09-29T21:00:00-04:00",
    "end": "2025-09-29T22:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20250930T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-09-30T08:00:00-04:00",
    "end": "2025-09-30T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "91rjui0c74ejbjhjoaq6373n0g",
    "title": "11AM Pelvic Floor",
    "start": "2025-09-30T11:00:00-04:00",
    "end": "2025-09-30T12:00:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jq1it8j94gca216lmc64i7ih2s",
    "title": "Street Smarts – Safe or Unsafe Role Play",
    "description": "Project: Mini Course for Kids: Street Smart\n\nGame: “Safe or Unsafe?” – Act out scenarios: • Someone offers candy. • Someone asks them to come along. – Ask: “What do you do?” 🎯 *Teaches intuition, boundaries, and finding safe helpers.*\n\nPhase: Reflection & Awareness Activities\nProject: Mini Course for Kids: Street Smart\n\n[Build OS Task #563e8a80-afa3-4663-ae86-1b39f630af22]",
    "start": "2025-09-30T14:30:00-04:00",
    "end": "2025-09-30T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "ipmls4n6aoinok1cvq5jcae1sk",
    "title": "Cross-Link Instagram Blogs",
    "description": "Project: 9takes\n\nGo through and cross-link all Instagram-related blogs to enhance connectivity and user engagement.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #ce2b7dbc-a744-452b-8564-7eb208639329]",
    "start": "2025-09-30T17:00:00-04:00",
    "end": "2025-09-30T18:00:00-04:00",
    "recurring": false
  },
  {
    "id": "p8q8srr59sur70b4eeelff0hj0",
    "title": "Draft Email 5 - The Last Chance",
    "description": "Project: 9takes\n\nFinal push for conversions, reiterating urgency and recapping key benefits.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #77cf4eb9-7f84-411a-a268-26c6cb962a8f]",
    "start": "2025-09-30T18:30:00-04:00",
    "end": "2025-09-30T19:30:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251001T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-01T08:00:00-04:00",
    "end": "2025-10-01T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251001T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-01T12:00:00-04:00",
    "end": "2025-10-01T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "3dm4cp6919cpf3bn5em5921ttc",
    "title": "Walter needs plain t shirt for class",
    "start": "2025-10-01T13:00:00-04:00",
    "end": "2025-10-01T14:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "_60q30c1g60o30e1i60o4ac1g60rj8gpl88rj2c1h84s34h9g60s30c1g60o30c1g6ko38e1o7533ge1m6cok8gpg64o30c1g60o30c1g60o30c1g60o32c1g60o30c1g6d2k6ha46or34gi56h0kcc9k6os3gcpk650kagi28oo46d9k8h1g",
    "title": "Avi <<>>DJ Claude /agents Training",
    "description": "Avi Samudrala is inviting you to a scheduled Zoom meeting.\nJoin Zoom Meeting\nhttps://us02web.zoom.us/j/83925314649?pwd=TkTkdvPO5JKPxkbawb6MVAEHVsGrxs.1\n\nView meeting insights with Zoom AI Companion\nhttps://us02web.zoom.us/launch/edl?muid=84c42dee-b595-4334-9a34-9bd7db2b6df1\n\nMeeting ID: 839 2531 4649\nPasscode: 680488\n\n---\n\nOne tap mobile\n+16469313860,,83925314649#,,,,*680488# US\n+16465588656,,83925314649#,,,,*680488# US (New York)\n\nJoin instructions\nhttps://us02web.zoom.us/meetings/83925314649/i",
    "start": "2025-10-01T13:30:00-04:00",
    "end": "2025-10-01T14:30:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "ags@standarddigital.co"
    ],
    "recurring": false,
    "location": "https://us02web.zoom.us/j/83925314649?pwd=TkTkdvPO5JKPxkbawb6MVAEHVsGrxs.1"
  },
  {
    "id": "1cs2edhkofcir7b8il2c8sjsfq",
    "title": "SCHOOL CLOSED",
    "start": "2025-10-02",
    "end": "2025-10-03",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251002T160000Z",
    "title": "No finned friends",
    "start": "2025-10-02T12:00:00-04:00",
    "end": "2025-10-02T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "rs8d50ntvr7t0m2l4gc7tqs6ns",
    "title": "William race",
    "start": "2025-10-02T16:00:00-04:00",
    "end": "2025-10-02T17:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251003T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-03T08:00:00-04:00",
    "end": "2025-10-03T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251003T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-03T12:00:00-04:00",
    "end": "2025-10-03T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "9rb2391g73hjrgm8v5l8ea5iqc",
    "title": "Bumpus oct 4 discount",
    "start": "2025-10-03T16:00:00-04:00",
    "end": "2025-10-03T17:00:00-04:00",
    "recurring": false
  },
  {
    "id": "853h1pj4a02kj65kbtkd9gcaq4",
    "title": "8pm girls night at Kaitlyn’s",
    "start": "2025-10-04T20:00:00-04:00",
    "end": "2025-10-04T21:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  }
]

### Upcoming Events (156 events)
**Use these events for BOTH project context AND task generation.**
[
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251006T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-06T08:00:00-04:00",
    "end": "2025-10-06T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "87rp3a99hupj0coes0flc839n4",
    "title": "Jenny and Kaitlyn morning",
    "start": "2025-10-06T09:00:00-04:00",
    "end": "2025-10-06T10:00:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "c16agu2hpdsc98pltr5vvmards",
    "title": "The Perfect Problem Statement",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 4 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/fc7ed49a-cf97-4283-82a0-c657220ff7b9\n[BuildOS Task #fc7ed49a-cf97-4283-82a0-c657220ff7b9]",
    "start": "2025-10-06T10:00:00-04:00",
    "end": "2025-10-06T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "3kn38vhiq6jf9c1nv1kbqvrr9c",
    "title": "TAM/SAM/SOM Calculation + BuildOS Market Sizing Exercise",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 1 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/fe371b74-0e25-4d4f-946a-1d671c70464b\n[BuildOS Task #fe371b74-0e25-4d4f-946a-1d671c70464b]",
    "start": "2025-10-06T12:00:00-04:00",
    "end": "2025-10-06T13:00:00-04:00",
    "recurring": false
  },
  {
    "id": "0g6juqs3b1tsf638n2agcfu21s",
    "title": "Unit Economics Mastery",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 2 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/f8ecc5a4-c59e-48dc-a7d9-8605492d69f7\n[BuildOS Task #f8ecc5a4-c59e-48dc-a7d9-8605492d69f7]",
    "start": "2025-10-06T13:00:00-04:00",
    "end": "2025-10-06T14:00:00-04:00",
    "recurring": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251006T172500Z",
    "title": "Therapy 1:25",
    "start": "2025-10-06T13:25:00-04:00",
    "end": "2025-10-06T14:25:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "dutv7lm03ruma9mo4dulh6ko78",
    "title": "Street Smarts – Say It Strong",
    "description": "Project: Mini Course for Kids: Street Smart\n\nGame: “Say It Strong” – Practice using strong voices with superhero poses: • “STOP!” • “NO!” • “GO AWAY!” 🎯 *Builds confident communication and self-protection.*\n\nPhase: Interactive Role Play & Skill Integration\nProject: Mini Course for Kids: Street Smart\n\n[Build OS Task #3aa3fd65-d536-4144-8b7d-9c4b6bb33f12]",
    "start": "2025-10-06T17:30:00-04:00",
    "end": "2025-10-06T18:30:00-04:00",
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251007T000000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-06T20:00:00-04:00",
    "end": "2025-10-06T21:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251007T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-06T21:00:00-04:00",
    "end": "2025-10-06T22:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251007T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-07T08:00:00-04:00",
    "end": "2025-10-07T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "28tqj7eokijl1jfvhq3bf3gb50",
    "title": "Competitive Analysis - Notion/Monday/Asana Teardown",
    "description": "Phase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprint\nDay 9 training session\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/1fe3ddc4-6f89-4a89-a49b-9f8dfbacd07e\n[BuildOS Task #1fe3ddc4-6f89-4a89-a49b-9f8dfbacd07e]",
    "start": "2025-10-07T10:00:00-04:00",
    "end": "2025-10-07T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "vlc14rjmhj7lc8p2gjfrl3smps",
    "title": "VC Pattern Matching - Study 20 Productivity Investments",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 8 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/ee9563ec-85ec-4291-8fc8-2cf54f69c3b2\n[BuildOS Task #ee9563ec-85ec-4291-8fc8-2cf54f69c3b2]",
    "start": "2025-10-07T10:00:00-04:00",
    "end": "2025-10-07T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "41vo8b0bmvta48mvit6iqndq6k",
    "title": "Siena and Matt hang out",
    "start": "2025-10-07T21:00:00-04:00",
    "end": "2025-10-07T22:00:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251008T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-08T08:00:00-04:00",
    "end": "2025-10-08T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251008T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-08T12:00:00-04:00",
    "end": "2025-10-08T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "977a5spgrm9ceshq8aesien5mg",
    "title": "1pm Dr appointment for Levi",
    "start": "2025-10-08T13:00:00-04:00",
    "end": "2025-10-08T14:00:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251009T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-09T08:00:00-04:00",
    "end": "2025-10-09T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251009T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-09T12:00:00-04:00",
    "end": "2025-10-09T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "lpgf6ppv4t3jt3jiprju64otgg",
    "title": "Street Smarts – Which Way?",
    "description": "Project: Mini Course for Kids: Street Smart\n\nGame: “Which Way?” – Ask: “If we needed to get home fast, which way would we go?” 🎯 *Builds directional awareness and decision making.*\n\nPhase: Interactive Role Play & Skill Integration\nProject: Mini Course for Kids: Street Smart\n\n[Build OS Task #a333650f-fdf9-46d3-b6cd-df53c9c95168]",
    "start": "2025-10-09T15:30:00-04:00",
    "end": "2025-10-09T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251010T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-10T08:00:00-04:00",
    "end": "2025-10-10T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "2lobpej6c857o9u1vhg9kttjv4",
    "title": "10AM Levi cardio",
    "start": "2025-10-10T10:00:00-04:00",
    "end": "2025-10-10T11:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251010T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-10T12:00:00-04:00",
    "end": "2025-10-10T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "kngprlp6odhie7eusqo0lpq4o4",
    "title": "Street Smarts – Story Reflection",
    "description": "Project: Mini Course for Kids: Street Smart\n\nStory: – Tell a story about a child making a smart, safe choice. – Ask: “What would you do if that happened to you?”\n\nPhase: Interactive Role Play & Skill Integration\nProject: Mini Course for Kids: Street Smart\n\n[Build OS Task #afb4e0ec-83a9-4e68-a250-67b91d617ede]",
    "start": "2025-10-10T15:30:00-04:00",
    "end": "2025-10-10T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "900amubm2rd97khav8oasqa0dc",
    "title": "Create Depression Patterns by Enneagram Type",
    "description": "Project: 9takes\n\nDevelop a guide on depression patterns for each Enneagram type.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #821ae984-5fbb-4eeb-a9d5-45b8675d713e]",
    "start": "2025-10-10T16:00:00-04:00",
    "end": "2025-10-10T20:00:00-04:00",
    "recurring": false
  },
  {
    "id": "c8ns8m7im1v96s5u64dri98qak",
    "title": "Building Your Moat - Context Accumulation Defense",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 10 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/b468ba81-7eff-4369-85eb-8719fae683a1\n[BuildOS Task #b468ba81-7eff-4369-85eb-8719fae683a1]",
    "start": "2025-10-12T10:00:00-04:00",
    "end": "2025-10-12T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "bj17jqj7cggd9u8lq4gujl2ln4",
    "title": "Financial Modeling - Build 3 Scenarios",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 3 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/c929ec3d-6766-47ce-a661-d880bcb884fc\n[BuildOS Task #c929ec3d-6766-47ce-a661-d880bcb884fc]",
    "start": "2025-10-12T11:30:00-04:00",
    "end": "2025-10-12T12:30:00-04:00",
    "recurring": false
  },
  {
    "id": "k8n3h08s5s0m1gft3b3l0k03js",
    "title": "PR & Storytelling - Your Founder Narrative",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 24 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/644af23a-5131-4fcc-88b6-ca157396d7a1\n[BuildOS Task #644af23a-5131-4fcc-88b6-ca157396d7a1]",
    "start": "2025-10-12T13:00:00-04:00",
    "end": "2025-10-12T14:00:00-04:00",
    "recurring": false
  },
  {
    "id": "jjvmpad5p3l52nrvtdl7a4c8rg",
    "title": "Solution Positioning - 'Why BuildOS Wins' Thesis",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 5 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/02efe185-d2ac-48b5-9a56-e37db4035aa9\n[BuildOS Task #02efe185-d2ac-48b5-9a56-e37db4035aa9]",
    "start": "2025-10-12T14:30:00-04:00",
    "end": "2025-10-12T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "4vvatarrqfbcv8fu6dm323k7sc",
    "title": "Term Sheet Basics - Valuation, Dilution, Control",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 26 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/fda4414c-bc63-49f8-b9e9-078168b9c436\n[BuildOS Task #fda4414c-bc63-49f8-b9e9-078168b9c436]",
    "start": "2025-10-12T16:00:00-04:00",
    "end": "2025-10-12T17:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251013T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-13T08:00:00-04:00",
    "end": "2025-10-13T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "e4098er15s2mk4840dbgplhf2k",
    "title": "Create Social Media Post for 9takes",
    "description": "Project: 9takes\nhttps://build-os.com/projects/073d3d81-a1c5-47cb-8fc3-5a0b7d2fb1d0\n\nPrepare and publish a social media post for the 9takes project, aligning with the project's emotional intelligence theme.\n\nTask: Create Social Media Post for 9takes\nProject: 9takes\n\n📋 View Task: https://build-os.com/projects/073d3d81-a1c5-47cb-8fc3-5a0b7d2fb1d0/tasks/8a8931f0-aea2-4628-9122-2c49a8953972\n[BuildOS Task #8a8931f0-aea2-4628-9122-2c49a8953972]",
    "start": "2025-10-13T10:00:00-04:00",
    "end": "2025-10-13T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "leq2at4hfmvech4dqk87mplo9c",
    "title": "Street Smarts – Find the Safe Spot",
    "description": "Project: Mini Course for Kids: Street Smart\n\nGame: “Find the Safe Spot” – At home or out, ask: “If we got separated, where should we meet?” 🎯 *Builds location awareness and safety routines.*\n\nPhase: Interactive Role Play & Skill Integration\nProject: Mini Course for Kids: Street Smart\n\n[Build OS Task #3b51b722-5527-4acd-9dfd-fe72b712ca54]",
    "start": "2025-10-13T14:30:00-04:00",
    "end": "2025-10-13T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "lmpsq4l4ib1itf1e08a55t3clg",
    "title": "Traction Story - Turn Your Beta Users into Proof Points",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 6 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/19aa988a-05e3-4816-ad2b-16be99d59b12\n[BuildOS Task #19aa988a-05e3-4816-ad2b-16be99d59b12]",
    "start": "2025-10-13T15:30:00-04:00",
    "end": "2025-10-13T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "rvbe7gl8793ve5v78bh88hvstg",
    "title": "MOP MAGOTHY",
    "start": "2025-10-13T16:00:00-04:00",
    "end": "2025-10-13T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "1svbfkkdh4ccsp61bbastpsbro",
    "title": "Building Your Target List - 100 Investors Ranked",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 27 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/32bebebe-53dd-4f0d-b5be-211e0b555aa2\n[BuildOS Task #32bebebe-53dd-4f0d-b5be-211e0b555aa2]",
    "start": "2025-10-13T17:00:00-04:00",
    "end": "2025-10-13T18:00:00-04:00",
    "recurring": false
  },
  {
    "id": "oa3qts2ai86pr53ho31ocasvio",
    "title": "Walter 5pm Dentist",
    "start": "2025-10-13T17:00:00-04:00",
    "end": "2025-10-13T18:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251014T000000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-13T20:00:00-04:00",
    "end": "2025-10-13T21:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251014T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-13T21:00:00-04:00",
    "end": "2025-10-13T22:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "2cntnv4suj4an207d0kt4855c3",
    "title": "Lily 2hr Early Dismissal!",
    "start": "2025-10-14",
    "end": "2025-10-15",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251014T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-14T08:00:00-04:00",
    "end": "2025-10-14T12:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "o1fq36l6r1jrl1uic50on440ns",
    "title": "9:10AM walter eye appointment",
    "start": "2025-10-14T09:10:00-04:00",
    "end": "2025-10-14T10:10:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251015T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-15T08:00:00-04:00",
    "end": "2025-10-15T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "bohdjh7lh93rssma84ian2deik",
    "title": "Content Marketing Plan - SEO + Thought Leadership",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 16 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/71396253-a512-486f-a132-ff62ead5cb63\n[BuildOS Task #71396253-a512-486f-a132-ff62ead5cb63]",
    "start": "2025-10-15T10:00:00-04:00",
    "end": "2025-10-15T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "7bu6nkmfphq5vir5rtdva16a80",
    "title": "Growth Loops Design - Viral Mechanics for BuildOS",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 11 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/65690eb7-5459-412f-9298-01f6bed9549c\n[BuildOS Task #65690eb7-5459-412f-9298-01f6bed9549c]",
    "start": "2025-10-15T11:30:00-04:00",
    "end": "2025-10-15T12:30:00-04:00",
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251015T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-15T12:00:00-04:00",
    "end": "2025-10-15T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "22n904479kg2k8cjna45qsl62c",
    "title": "Platform Vision - BuildOS as Infrastructure Play",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 23 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/6f995433-d4b3-40fc-bde2-781cc4ee987f\n[BuildOS Task #6f995433-d4b3-40fc-bde2-781cc4ee987f]",
    "start": "2025-10-15T13:00:00-04:00",
    "end": "2025-10-15T14:00:00-04:00",
    "recurring": false
  },
  {
    "id": "ktb7b9t28jo44cu7euosf51974",
    "title": "NY AI Engineers: Oct Tech Talk w/ OpenRouter Presenting",
    "description": "To see detailed information for automatically created events like this one, use the official Google Calendar app. https://g.co/calendar\n\nThis event was created from an email you received in Gmail. https://mail.google.com/mail?extsrc=cal&plid=ACUX6DMD-ZI4fzGtjLx0QmV5IZg0d67X9cUujaU\n",
    "start": "2025-10-15T18:30:00-04:00",
    "end": "2025-10-15T20:30:00-04:00",
    "attendees": [
      "djwayne35@gmail.com"
    ],
    "recurring": false,
    "location": "Mindspace, 25 Kent Ave, 4th Floor (North Building Lobby), New York, NY, 11249, us"
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251016T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-16T08:00:00-04:00",
    "end": "2025-10-16T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251016T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-16T12:00:00-04:00",
    "end": "2025-10-16T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "h5ik0k3152pve2q32j8f66tqn8",
    "title": "Metrics Dashboard Build - Screenshot-Ready Analytics",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 12 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/75dbfb51-c478-46db-a168-468b5d3f597d\n[BuildOS Task #75dbfb51-c478-46db-a168-468b5d3f597d]",
    "start": "2025-10-16T14:00:00-04:00",
    "end": "2025-10-16T15:00:00-04:00",
    "recurring": false
  },
  {
    "id": "gqon7sg7d1iacifogffssrrcag",
    "title": "Advanced Metrics - Cohorts, Retention, Engagement",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 22 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/7dd9847f-48a0-4032-bf04-919bb2113a4e\n[BuildOS Task #7dd9847f-48a0-4032-bf04-919bb2113a4e]",
    "start": "2025-10-16T15:30:00-04:00",
    "end": "2025-10-16T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251017T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-17T08:00:00-04:00",
    "end": "2025-10-17T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251017T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-17T12:00:00-04:00",
    "end": "2025-10-17T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "2fuqul50nda01lm4bp9311n5b0",
    "title": "4pm Brittany Layla Mom housewarming",
    "description": "Park on grass",
    "start": "2025-10-18T16:00:00-04:00",
    "end": "2025-10-18T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false,
    "location": "7881 Elizabeth Rd, Pasadena, MD 21122, USA"
  },
  {
    "id": "b88q004q76ggm4hju8f0da16mc",
    "title": "Mock Pitch #1 with Recorded Feedback",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 14 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/a7a967b2-bccb-4e56-87ba-898c567dd2f1\n[BuildOS Task #a7a967b2-bccb-4e56-87ba-898c567dd2f1]",
    "start": "2025-10-19T10:00:00-04:00",
    "end": "2025-10-19T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "uikpg0n6marqeb3er2sdcqmu94",
    "title": "Distribution Strategy - Own One Channel First",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 15 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/3e40728a-5d2c-4136-bf67-682870c8bf50\n[BuildOS Task #3e40728a-5d2c-4136-bf67-682870c8bf50]",
    "start": "2025-10-19T11:30:00-04:00",
    "end": "2025-10-19T12:30:00-04:00",
    "recurring": false
  },
  {
    "id": "q7q5d2cnd2eeaf92q9tac59clg",
    "title": "Mock Pitch #2 with Partner Meeting Simulation",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 21 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/0099077d-5dd9-468b-9b70-081f8744189f\n[BuildOS Task #0099077d-5dd9-468b-9b70-081f8744189f]",
    "start": "2025-10-19T13:00:00-04:00",
    "end": "2025-10-19T14:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251020T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-20T08:00:00-04:00",
    "end": "2025-10-20T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "ke0b947hn561bnh779d8nplh38",
    "title": "Meet at magothy at 8:30AM fire truck thing",
    "start": "2025-10-20T08:30:00-04:00",
    "end": "2025-10-20T09:30:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "ibmc5vsh1me094h8iktd9ljt9k",
    "title": "Customer Success Stories - 5 Case Studies",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 17 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/ac21daa8-cd32-44dc-9569-28c6faa31ff4\n[BuildOS Task #ac21daa8-cd32-44dc-9569-28c6faa31ff4]",
    "start": "2025-10-20T10:00:00-04:00",
    "end": "2025-10-20T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "j37obo1bdumi9k9jsc7osfh8j0",
    "title": "Product Roadmap Presentation - 12-Month Vision",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 18 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/42d38a88-ff0e-47cd-9487-b144961c635f\n[BuildOS Task #42d38a88-ff0e-47cd-9487-b144961c635f]",
    "start": "2025-10-20T11:30:00-04:00",
    "end": "2025-10-20T12:30:00-04:00",
    "recurring": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251020T172500Z",
    "title": "Therapy 1:25",
    "start": "2025-10-20T13:25:00-04:00",
    "end": "2025-10-20T14:25:00-04:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "j8k0rjjbfstpsiegj032uc84m4",
    "title": "2-Minute Pitch Recording + Self-Review Session",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 7 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/d12c15ba-b103-4499-aecb-52503cf235c9\n[BuildOS Task #d12c15ba-b103-4499-aecb-52503cf235c9]",
    "start": "2025-10-20T14:00:00-04:00",
    "end": "2025-10-20T15:00:00-04:00",
    "recurring": false
  },
  {
    "id": "18dnpfqmrnf2u6n5ojhohsp9vo",
    "title": "Build Automated Blog Creation System",
    "description": "Project: 9takes\n\nDevelop a system that automatically generates blogs for tics using Claude code.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #4a2c8443-a979-4462-9e12-b6865e6b94e3]",
    "start": "2025-10-20T14:30:00-04:00",
    "end": "2025-10-20T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "jjejv74va0l2sgbkvv4egfqd6s",
    "title": "Objection Handling - 20 Tough Questions + Answers",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 13 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/a2a45c49-aacc-44a8-a4be-a227aaf4797e\n[BuildOS Task #a2a45c49-aacc-44a8-a4be-a227aaf4797e]",
    "start": "2025-10-20T15:30:00-04:00",
    "end": "2025-10-20T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "te36tc2qb04uq9dkv7pa7mq6bs",
    "title": "The Ask - Funding Amount, Use of Funds, Milestones",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 20 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/6c4066ea-ed90-49fb-92fc-238db00a085f\n[BuildOS Task #6c4066ea-ed90-49fb-92fc-238db00a085f]",
    "start": "2025-10-20T17:00:00-04:00",
    "end": "2025-10-20T18:00:00-04:00",
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251021T000000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-20T20:00:00-04:00",
    "end": "2025-10-20T21:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251021T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-20T21:00:00-04:00",
    "end": "2025-10-20T22:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251021T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-21T08:00:00-04:00",
    "end": "2025-10-21T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "446006l530siam7jteqfav7rac",
    "title": "Develop a user feedback system",
    "description": "Project: 9takes\n\nCreate a system for collecting, analyzing, and acting upon user feedback. This system should prioritize anonymity and ease of use to encourage honest and helpful feedback. \n\nShould look at reddit responses.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #bdada560-a247-4944-ab64-102ccecf284b]",
    "start": "2025-10-21T14:30:00-04:00",
    "end": "2025-10-21T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "7l4ftgkr5kogf0qn3msih55o28",
    "title": "Scrape Reddit for Comments",
    "description": "Project: 9takes\n\nGather comments from Reddit that relate to the questions for the 9takes project.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #6c6ac317-f26a-495a-9bb5-885193ab1156]",
    "start": "2025-10-21T18:00:00-04:00",
    "end": "2025-10-21T19:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251022T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-22T08:00:00-04:00",
    "end": "2025-10-22T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "4l9qka5pumqk8ctpkb6m6j54uo",
    "title": "Mock Pitch #3 - Full Partner Meeting Format",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 28 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/a0568531-49b1-4cb5-be92-1c523aff9770\n[BuildOS Task #a0568531-49b1-4cb5-be92-1c523aff9770]",
    "start": "2025-10-22T10:00:00-04:00",
    "end": "2025-10-22T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251022T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-22T12:00:00-04:00",
    "end": "2025-10-22T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "3qh4qa70n3q57fm64vipcgsqj8",
    "title": "Walter Eye Appointment",
    "start": "2025-10-22T15:15:00-04:00",
    "end": "2025-10-22T16:15:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251023T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-23T08:00:00-04:00",
    "end": "2025-10-23T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251023T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-23T12:00:00-04:00",
    "end": "2025-10-23T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "tpied90n8to4l77ir7bo7sutv0",
    "title": "Investor Update Template + First Monthly Update",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 25 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/a0815bf8-7db5-4d78-8e8d-792e895d1002\n[BuildOS Task #a0815bf8-7db5-4d78-8e8d-792e895d1002]",
    "start": "2025-10-23T13:00:00-04:00",
    "end": "2025-10-23T14:00:00-04:00",
    "recurring": false
  },
  {
    "id": "r3o0l63rco050rrr90r80gp080",
    "title": "Team Slide Perfection - Why You'll Win",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 19 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/dbd9aac1-44b6-4ac2-b735-2c0fd372b1ba\n[BuildOS Task #dbd9aac1-44b6-4ac2-b735-2c0fd372b1ba]",
    "start": "2025-10-23T14:30:00-04:00",
    "end": "2025-10-23T15:30:00-04:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251024T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-24T08:00:00-04:00",
    "end": "2025-10-24T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251024T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-24T12:00:00-04:00",
    "end": "2025-10-24T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "o5sep1ghucnuh2os95c4c4ppj4",
    "title": "Draft Email 4 - The Urgency",
    "description": "Project: 9takes\n\nCreate urgency and drive action with a clear call to action, highlighting exclusivity and offering an incentive.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #2afd120a-f8fc-462b-9260-00dbb1900428]",
    "start": "2025-10-24T15:30:00-04:00",
    "end": "2025-10-24T16:30:00-04:00",
    "recurring": false
  },
  {
    "id": "700rg7aqc9i0kflg0ofi49pgsu",
    "title": "Lily 2hr Early Dismissal! ",
    "start": "2025-10-27",
    "end": "2025-10-29",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251027T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-27T08:00:00-04:00",
    "end": "2025-10-27T12:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "upkjkvq8f35mgh6mvkic8u5spo",
    "title": "Final Pitch Recording + Outreach Strategy Launch",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 30 training session\n\nPhase: Final Preparations & Outreach\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/92794ff1-b190-4872-b5de-beac98945e4e\n[BuildOS Task #92794ff1-b190-4872-b5de-beac98945e4e]",
    "start": "2025-10-27T10:00:00-04:00",
    "end": "2025-10-27T11:00:00-04:00",
    "recurring": false
  },
  {
    "id": "s5jtomnibf6um0nv7aiv2581rc",
    "title": "Data Room Completion + Due Diligence Prep",
    "description": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 29 training session\n\nPhase: Final Preparations & Outreach\nProject: BuildOS CEO Training Sprint\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/e9e31376-753d-4f9a-a249-e0f81e3468a7\n[BuildOS Task #e9e31376-753d-4f9a-a249-e0f81e3468a7]",
    "start": "2025-10-27T11:30:00-04:00",
    "end": "2025-10-27T12:30:00-04:00",
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251028T000000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-27T20:00:00-04:00",
    "end": "2025-10-27T21:00:00-04:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251028T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-27T21:00:00-04:00",
    "end": "2025-10-27T22:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251028T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-28T08:00:00-04:00",
    "end": "2025-10-28T12:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251029T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-29T08:00:00-04:00",
    "end": "2025-10-29T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251029T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-29T12:00:00-04:00",
    "end": "2025-10-29T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251030T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-30T08:00:00-04:00",
    "end": "2025-10-30T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "e7hop1bs4ajn0mlts70vaa86j8",
    "title": "Walter CoOp Day",
    "start": "2025-10-30T12:00:00-04:00",
    "end": "2025-10-30T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251030T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-30T12:00:00-04:00",
    "end": "2025-10-30T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251031T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-31T08:00:00-04:00",
    "end": "2025-10-31T14:25:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251031T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-31T12:00:00-04:00",
    "end": "2025-10-31T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251103T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-03T08:00:00-05:00",
    "end": "2025-11-03T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251103T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-11-03T13:25:00-05:00",
    "end": "2025-11-03T14:25:00-05:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251104T010000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-03T20:00:00-05:00",
    "end": "2025-11-03T21:00:00-05:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251104T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-03T21:00:00-05:00",
    "end": "2025-11-03T22:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251104T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-04T08:00:00-05:00",
    "end": "2025-11-04T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251105T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-05T08:00:00-05:00",
    "end": "2025-11-05T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251105T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-05T12:00:00-05:00",
    "end": "2025-11-05T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251106T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-06T08:00:00-05:00",
    "end": "2025-11-06T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251106T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-06T12:00:00-05:00",
    "end": "2025-11-06T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "qf14n3vfaflfij93eigfuakl8s",
    "title": "Launch Twitter Week 1",
    "description": "Project: 9takes\n\nPost question hook at 5-6 PM EST or prepare for tomorrow morning.\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n[Build OS Task #9484054c-d022-4281-b615-e94312e2591a]",
    "start": "2025-11-06T15:30:00-05:00",
    "end": "2025-11-06T16:30:00-05:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251107T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-07T08:00:00-05:00",
    "end": "2025-11-07T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251107T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-07T12:00:00-05:00",
    "end": "2025-11-07T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "8tivdimv3ula3p32u9skuaf60g",
    "title": "2pm Parker’s birthday",
    "start": "2025-11-09T14:00:00-05:00",
    "end": "2025-11-09T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251110T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-10T08:00:00-05:00",
    "end": "2025-11-10T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251111T010000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-10T20:00:00-05:00",
    "end": "2025-11-10T21:00:00-05:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251111T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-10T21:00:00-05:00",
    "end": "2025-11-10T22:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251111T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-11T08:00:00-05:00",
    "end": "2025-11-11T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "3a395sklrb1pctb46c0lt8s9nq",
    "title": "Lily School Closed",
    "start": "2025-11-12",
    "end": "2025-11-13",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251112T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-12T12:00:00-05:00",
    "end": "2025-11-12T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "ukkrpkl8rphg0qfqsl90sokflg",
    "title": "Magothy Meeting",
    "start": "2025-11-12T19:00:00-05:00",
    "end": "2025-11-12T20:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251113T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-13T08:00:00-05:00",
    "end": "2025-11-13T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251113T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-13T12:00:00-05:00",
    "end": "2025-11-13T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251114T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-14T08:00:00-05:00",
    "end": "2025-11-14T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251114T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-14T12:00:00-05:00",
    "end": "2025-11-14T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "5qe6k29a8v12o3rkjrp4ep30eg",
    "title": "3pm Lily Heart Appointment",
    "start": "2025-11-14T15:00:00-05:00",
    "end": "2025-11-14T16:00:00-05:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "grg5i97ofaevhleddjcgsinsqc",
    "title": "Reach out to enneagram people",
    "description": "Project: 9takes\n\n\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n[Build OS Task #3f6fa916-f5bd-442e-a2c0-6f15ccfbcfd4]",
    "start": "2025-11-14T15:30:00-05:00",
    "end": "2025-11-14T16:30:00-05:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251117T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-17T08:00:00-05:00",
    "end": "2025-11-17T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251117T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-11-17T13:25:00-05:00",
    "end": "2025-11-17T14:25:00-05:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "br782tfgi747troc6fl9pv7eos",
    "title": "3:30 and 4pm dental appointments",
    "start": "2025-11-17T15:30:00-05:00",
    "end": "2025-11-17T16:30:00-05:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "lt85v38m8rud7csq7q3vmvgqq8",
    "title": "MOP MAGOTHY",
    "start": "2025-11-17T16:00:00-05:00",
    "end": "2025-11-17T17:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251118T010000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-17T20:00:00-05:00",
    "end": "2025-11-17T21:00:00-05:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251118T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-17T21:00:00-05:00",
    "end": "2025-11-17T22:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251118T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-18T08:00:00-05:00",
    "end": "2025-11-18T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "4n46dlsqbl6cuvu273d6b8oe9o",
    "title": "Draft Email 3 - The Value",
    "description": "Project: 9takes\n\nFocus on how the product addresses specific user pain points and highlight benefits, including a testimonial or case study.\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n[Build OS Task #2021433b-5cbb-4379-83ed-30e40408e8f4]",
    "start": "2025-11-18T16:30:00-05:00",
    "end": "2025-11-18T17:30:00-05:00",
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251119T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-19T08:00:00-05:00",
    "end": "2025-11-19T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251119T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-19T12:00:00-05:00",
    "end": "2025-11-19T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251120T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-20T08:00:00-05:00",
    "end": "2025-11-20T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251120T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-20T12:00:00-05:00",
    "end": "2025-11-20T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251121T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-21T08:00:00-05:00",
    "end": "2025-11-21T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251121T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-21T12:00:00-05:00",
    "end": "2025-11-21T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "hpldlut4bt04unnvt2ssfa4o80",
    "title": "Finned friend helper",
    "start": "2025-11-21T12:00:00-05:00",
    "end": "2025-11-21T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "0e78nvqmnprn1dju2o8jpudrdg",
    "title": "School Closed",
    "start": "2025-11-24",
    "end": "2025-11-29",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "g8a5q319kn7ubrhbojqr5becus",
    "title": "9:30 dentist",
    "start": "2025-11-24T09:30:00-05:00",
    "end": "2025-11-24T10:30:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "o527l54g76607l0nascu57smeg_20251124T170000Z",
    "title": "Walter’s Birthday",
    "start": "2025-11-24T12:00:00-05:00",
    "end": "2025-11-24T13:00:00-05:00",
    "recurring": false
  },
  {
    "id": "dp4e2nu8d4d6e9nedj22be6pd4_20251125T000000Z",
    "title": "Buggy’s birthday",
    "start": "2025-11-24T19:00:00-05:00",
    "end": "2025-11-24T20:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251125T010000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-24T20:00:00-05:00",
    "end": "2025-11-24T21:00:00-05:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251125T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-24T21:00:00-05:00",
    "end": "2025-11-24T22:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "tsdde36s4gl149lds2gg9csf3g",
    "title": "David and sosa visit",
    "start": "2025-11-25",
    "end": "2025-12-04",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251126T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-26T12:00:00-05:00",
    "end": "2025-11-26T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251127T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-27T12:00:00-05:00",
    "end": "2025-11-27T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251128T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-28T12:00:00-05:00",
    "end": "2025-11-28T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251201T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-01T08:00:00-05:00",
    "end": "2025-12-01T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251201T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-12-01T13:25:00-05:00",
    "end": "2025-12-01T14:25:00-05:00",
    "attendees": [
      "djwayne35@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251202T010000Z",
    "title": "Create Educational Content Schedule",
    "description": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-12-01T20:00:00-05:00",
    "end": "2025-12-01T21:00:00-05:00",
    "recurring": false
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251202T020000Z",
    "title": "Trash to the curb",
    "start": "2025-12-01T21:00:00-05:00",
    "end": "2025-12-01T22:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251202T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-02T08:00:00-05:00",
    "end": "2025-12-02T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251203T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-03T08:00:00-05:00",
    "end": "2025-12-03T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251203T170000Z",
    "title": "Finned Friends",
    "start": "2025-12-03T12:00:00-05:00",
    "end": "2025-12-03T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251204T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-04T08:00:00-05:00",
    "end": "2025-12-04T14:25:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251204T170000Z",
    "title": "Finned Friends",
    "start": "2025-12-04T12:00:00-05:00",
    "end": "2025-12-04T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "recurring": false
  }
]

## CRITICAL TASK GENERATION RULES


For each project, create tasks using ONE or BOTH of these approaches:

### Approach 1: Tasks from Upcoming Calendar Events
- Convert upcoming calendar events into actionable tasks
- Use the event's date/time as the task's start_date
- If event is recurring, set task_type to "recurring" with appropriate recurrence_pattern

### Approach 2: Inferred Next Steps
- Based on the project context and goals, infer logical next steps
- Schedule these tasks starting from 2025-10-06 or later
- Space tasks intelligently (e.g., planning tasks this week, execution tasks next week)

**TASK DATE REQUIREMENTS**:
- ALL tasks MUST have start_date >= 2025-10-06 (today or future)
- NEVER create tasks with dates in the past
- Use past events to understand the project, but create tasks for future work
- If an upcoming event exists, you can create a task for it
- If no upcoming events exist, infer 2-3 logical next steps and schedule them starting 2025-10-06

**Examples**:

Example 1 - Project with upcoming events:
- Past events: "Sprint Planning" (weekly, last 8 weeks)
- Upcoming events: "Sprint Planning" on 2025-10-13
- Tasks to create:
  1. "Attend Sprint Planning" - from upcoming event
  2. "Review sprint backlog" - inferred preparation task (2 days before)
  3. "Update team on progress" - recurring task (weekly)

Example 2 - Project with only past events:
- Past events: "Product Review" (monthly, last 3 months)
- No upcoming events
- Tasks to create:
  1. "Schedule next product review" - starting 2025-10-06
  2. "Gather product metrics" - starting 2025-10-08
  3. "Prepare review presentation" - starting 2025-10-11

## Output Requirements - JSON schema

Return a JSON object with a "suggestions" array. Each suggestion must follow this EXACT structure:

{
  "suggestions": [
    {
      // Project fields (all required unless noted)
      "name": "Clear, action-oriented project name",
      "slug": "generated-from-name-lowercase-hyphens",
      "description": "2-3 sentence description of what this project is about",
      "context": "Comprehensive markdown following the BuildOS context framework. Include all relevant information about the project's purpose, vision, scope, approach, stakeholders, timelines, and any other relevant context extracted from the calendar events. Use BOTH past and upcoming events to build complete context.",
      "executive_summary": "Brief executive summary under 500 characters",
      "status": "active", // Default to active for new projects
      "start_date": "YYYY-MM-DD", // Earliest relevant event date or today
      "end_date": "YYYY-MM-DD or null", // Latest relevant event date or null if ongoing
      "tags": ["relevant", "tags", "from", "events"],

      // Calendar analysis metadata (all required)
      "event_ids": ["array", "of", "ALL", "event", "ids", "both", "past", "and", "upcoming"],
      "confidence": 0.7, // 0-1 score, must be >= 0.4
      "reasoning": "Clear explanation of why these events suggest a project",
      "keywords": ["detected", "keywords", "that", "indicated", "project"],

      // Deduplication fields (REQUIRED - check against existing projects)
      "add_to_existing": false, // Set to true if this matches an existing project
      "existing_project_id": null, // Set to existing project ID if add_to_existing is true
      "deduplication_reasoning": "Explanation of deduplication decision (why new project or why adding to existing)",

      "suggested_tasks": [
        {
          "title": "Specific task title (max 255 chars)",
          "description": "Brief task description",
          "details": "Comprehensive details including:
- Event description
- Meeting attendees (if from calendar event)
- Location (if applicable)
- Meeting link (if available)
- Additional context or next steps",
          "status": "backlog",
          "priority": "medium", // low|medium|high based on urgency/importance
          "task_type": "one_off", // or "recurring" for repeating events
          "duration_minutes": 60, // Estimate based on event duration or task complexity
          "start_date": "YYYY-MM-DDTHH:MM:SS", // MUST be >= 2025-10-06T00:00:00, schedule intelligently
          "recurrence_pattern": "weekly", // Only if task_type is "recurring"
          "recurrence_ends": "YYYY-MM-DD", // Only if recurring
          "event_id": "linked-calendar-event-id", // Only if task is from an upcoming event
          "tags": ["optional", "task", "tags"]
        }
      ]
    }
  ]
}

**VALIDATION CHECKLIST** (verify before returning):
- [ ] Checked all calendar events against existing projects for duplicates
- [ ] Each suggestion has deduplication fields (add_to_existing, existing_project_id, deduplication_reasoning)
- [ ] ALL task start_date values are >= 2025-10-06
- [ ] NO tasks have dates in the past
- [ ] Task details include event metadata (attendees, location, links) when available
- [ ] Tasks either correspond to upcoming events OR are inferred next steps
- [ ] Project context incorporates insights from BOTH past and upcoming events
- [ ] All required fields are present
- [ ] Valid JSON that can be parsed

IMPORTANT:
- **Deduplication is CRITICAL** - always check against existing projects first
- Only suggest NEW projects if meaningfully different from existing ones
- Generate meaningful, actionable project names (not just event titles)
- Create rich, comprehensive context using the BuildOS framework
- **Enrich task details** with meeting metadata (attendees, location, links)
- **ALL tasks must have future dates (>= 2025-10-06)**
- Use proper date formats (YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM:SS for timestamps)
- Ensure all required fields are present
- The response must be valid JSON that can be parsed

```

## Token Estimates

- **System Prompt:** ~35 tokens
- **User Prompt:** ~19628 tokens
- **Total Estimate:** ~19663 tokens

---

_This file is automatically generated in development mode for prompt auditing purposes._
