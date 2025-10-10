# Prompt Audit: calendar-analysis-part1-event-grouping

**Generated at:** 2025-10-10T04:34:23.745Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 1 of 2
**Purpose:** Event pattern recognition and grouping

## Metadata

```json
{
	"userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
	"eventCount": 169,
	"timestamp": "2025-10-10T04:34:23.743Z"
}
```

## System Prompt

```
You are an expert at analyzing calendar patterns to identify potential projects. Always respond with valid JSON following the specified schema.
```

## User Prompt

```
You are analyzing calendar events to identify patterns and group related events that might represent projects.

**Today's date**: 2025-10-10

## Your Task

Group related calendar events and identify project themes. Focus on:
1. Recurring meetings with similar titles/attendees
2. Clusters of events around similar topics
3. Project-indicating keywords (sprint, launch, milestone, review, planning, kickoff, deadline, sync, standup, retrospective, design, implementation)
4. Series of events building toward a goal

## Calendar Events (169 total)

[
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251003T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-03T08:00:00-04:00",
    "end": "2025-10-03T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251003T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-03T12:00:00-04:00",
    "end": "2025-10-03T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "9rb2391g73hjrgm8v5l8ea5iqc",
    "title": "Bumpus oct 4 discount",
    "start": "2025-10-03T16:00:00-04:00",
    "end": "2025-10-03T17:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "853h1pj4a02kj65kbtkd9gcaq4",
    "title": "8pm girls night at Kaitlyn’s",
    "start": "2025-10-04T20:00:00-04:00",
    "end": "2025-10-04T21:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251006T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-06T08:00:00-04:00",
    "end": "2025-10-06T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "87rp3a99hupj0coes0flc839n4",
    "title": "Jenny and Kaitlyn morning",
    "start": "2025-10-06T09:00:00-04:00",
    "end": "2025-10-06T10:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "c16agu2hpdsc98pltr5vvmards",
    "title": "The Perfect Problem Statement",
    "description_snippet": "Day 4 training session\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/fc7ed49a-cf97-4283-82a0-c657220ff7b9\n[BuildOS Task #fc7ed49a-cf97-4283-82a0-c657220ff7b9]",
    "start": "2025-10-06T10:00:00-04:00",
    "end": "2025-10-06T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "3kn38vhiq6jf9c1nv1kbqvrr9c",
    "title": "TAM/SAM/SOM Calculation + BuildOS Market Sizing Exercise",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 1 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprin",
    "start": "2025-10-06T12:00:00-04:00",
    "end": "2025-10-06T13:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "0g6juqs3b1tsf638n2agcfu21s",
    "title": "Unit Economics Mastery",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 2 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprin",
    "start": "2025-10-06T13:00:00-04:00",
    "end": "2025-10-06T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251006T172500Z",
    "title": "Therapy 1:25",
    "start": "2025-10-06T13:25:00-04:00",
    "end": "2025-10-06T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "dutv7lm03ruma9mo4dulh6ko78",
    "title": "Street Smarts – Say It Strong",
    "description_snippet": "Project: Mini Course for Kids: Street Smart\n\nGame: “Say It Strong” – Practice using strong voices with superhero poses: • “STOP!” • “NO!” • “GO AWAY!” 🎯 *Builds confident communication and self-prote",
    "start": "2025-10-06T17:30:00-04:00",
    "end": "2025-10-06T18:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251007T000000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-06T20:00:00-04:00",
    "end": "2025-10-06T21:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251007T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-06T21:00:00-04:00",
    "end": "2025-10-06T22:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251007T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-07T08:00:00-04:00",
    "end": "2025-10-07T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "28tqj7eokijl1jfvhq3bf3gb50",
    "title": "Competitive Analysis - Notion/Monday/Asana Teardown",
    "description_snippet": "Day 9 training session\n\n📋 View Task: https://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c/tasks/1fe3ddc4-6f89-4a89-a49b-9f8dfbacd07e\n[BuildOS Task #1fe3ddc4-6f89-4a89-a49b-9f8dfbacd07e]",
    "start": "2025-10-07T10:00:00-04:00",
    "end": "2025-10-07T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "vlc14rjmhj7lc8p2gjfrl3smps",
    "title": "VC Pattern Matching - Study 20 Productivity Investments",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 8 training session\n\nPhase: Foundation & Market Analysis\nProject: BuildOS CEO Training Sprin",
    "start": "2025-10-07T10:00:00-04:00",
    "end": "2025-10-07T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "41vo8b0bmvta48mvit6iqndq6k",
    "title": "Siena and Matt hang out",
    "start": "2025-10-07T21:00:00-04:00",
    "end": "2025-10-07T22:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251008T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-08T08:00:00-04:00",
    "end": "2025-10-08T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251008T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-08T12:00:00-04:00",
    "end": "2025-10-08T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "977a5spgrm9ceshq8aesien5mg",
    "title": "1pm Dr appointment for Levi",
    "start": "2025-10-08T13:00:00-04:00",
    "end": "2025-10-08T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251009T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-09T08:00:00-04:00",
    "end": "2025-10-09T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251009T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-09T12:00:00-04:00",
    "end": "2025-10-09T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "lpgf6ppv4t3jt3jiprju64otgg",
    "title": "Street Smarts – Which Way?",
    "description_snippet": "Project: Mini Course for Kids: Street Smart\n\nGame: “Which Way?” – Ask: “If we needed to get home fast, which way would we go?” 🎯 *Builds directional awareness and decision making.*\n\nPhase: Interactiv",
    "start": "2025-10-09T15:30:00-04:00",
    "end": "2025-10-09T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251010T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-10T08:00:00-04:00",
    "end": "2025-10-10T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2lobpej6c857o9u1vhg9kttjv4",
    "title": "10AM Levi cardio",
    "start": "2025-10-10T10:00:00-04:00",
    "end": "2025-10-10T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251010T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-10T12:00:00-04:00",
    "end": "2025-10-10T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "kngprlp6odhie7eusqo0lpq4o4",
    "title": "Street Smarts – Story Reflection",
    "description_snippet": "Project: Mini Course for Kids: Street Smart\n\nStory: – Tell a story about a child making a smart, safe choice. – Ask: “What would you do if that happened to you?”\n\nPhase: Interactive Role Play & Skill ",
    "start": "2025-10-10T15:30:00-04:00",
    "end": "2025-10-10T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "900amubm2rd97khav8oasqa0dc",
    "title": "Create Depression Patterns by Enneagram Type",
    "description_snippet": "Project: 9takes\n\nDevelop a guide on depression patterns for each Enneagram type.\n\nPhase: Content Creation & Promotion\nProject: 9takes\n\n[Build OS Task #821ae984-5fbb-4eeb-a9d5-45b8675d713e]",
    "start": "2025-10-10T16:00:00-04:00",
    "end": "2025-10-10T20:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "c8ns8m7im1v96s5u64dri98qak",
    "title": "Building Your Moat - Context Accumulation Defense",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 10 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-12T10:00:00-04:00",
    "end": "2025-10-12T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "bj17jqj7cggd9u8lq4gujl2ln4",
    "title": "Financial Modeling - Build 3 Scenarios",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 3 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training S",
    "start": "2025-10-12T11:30:00-04:00",
    "end": "2025-10-12T12:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "k8n3h08s5s0m1gft3b3l0k03js",
    "title": "PR & Storytelling - Your Founder Narrative",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 24 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-12T13:00:00-04:00",
    "end": "2025-10-12T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "jjvmpad5p3l52nrvtdl7a4c8rg",
    "title": "Solution Positioning - 'Why BuildOS Wins' Thesis",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 5 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training S",
    "start": "2025-10-12T14:30:00-04:00",
    "end": "2025-10-12T15:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "4vvatarrqfbcv8fu6dm323k7sc",
    "title": "Term Sheet Basics - Valuation, Dilution, Control",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 26 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-12T16:00:00-04:00",
    "end": "2025-10-12T17:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251013T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-13T08:00:00-04:00",
    "end": "2025-10-13T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "e4098er15s2mk4840dbgplhf2k",
    "title": "Create Social Media Post for 9takes",
    "description_snippet": "Project: 9takes\nhttps://build-os.com/projects/073d3d81-a1c5-47cb-8fc3-5a0b7d2fb1d0\n\nPrepare and publish a social media post for the 9takes project, aligning with the project's emotional intelligence t",
    "start": "2025-10-13T10:00:00-04:00",
    "end": "2025-10-13T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "leq2at4hfmvech4dqk87mplo9c",
    "title": "Street Smarts – Find the Safe Spot",
    "description_snippet": "Project: Mini Course for Kids: Street Smart\n\nGame: “Find the Safe Spot” – At home or out, ask: “If we got separated, where should we meet?” 🎯 *Builds location awareness and safety routines.*\n\nPhase: ",
    "start": "2025-10-13T14:30:00-04:00",
    "end": "2025-10-13T15:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "lmpsq4l4ib1itf1e08a55t3clg",
    "title": "Traction Story - Turn Your Beta Users into Proof Points",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 6 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training S",
    "start": "2025-10-13T15:30:00-04:00",
    "end": "2025-10-13T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "rvbe7gl8793ve5v78bh88hvstg",
    "title": "MOP MAGOTHY",
    "start": "2025-10-13T16:00:00-04:00",
    "end": "2025-10-13T17:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "1svbfkkdh4ccsp61bbastpsbro",
    "title": "Building Your Target List - 100 Investors Ranked",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 27 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-13T17:00:00-04:00",
    "end": "2025-10-13T18:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "oa3qts2ai86pr53ho31ocasvio",
    "title": "Walter 5pm Dentist",
    "start": "2025-10-13T17:00:00-04:00",
    "end": "2025-10-13T18:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251014T000000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-13T20:00:00-04:00",
    "end": "2025-10-13T21:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251014T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-13T21:00:00-04:00",
    "end": "2025-10-13T22:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2cntnv4suj4an207d0kt4855c3",
    "title": "Lily 2hr Early Dismissal!",
    "start": "2025-10-14",
    "end": "2025-10-15",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251014T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-14T08:00:00-04:00",
    "end": "2025-10-14T12:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "o1fq36l6r1jrl1uic50on440ns",
    "title": "9:10AM walter eye appointment",
    "start": "2025-10-14T09:10:00-04:00",
    "end": "2025-10-14T10:10:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251015T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-15T08:00:00-04:00",
    "end": "2025-10-15T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "bohdjh7lh93rssma84ian2deik",
    "title": "Content Marketing Plan - SEO + Thought Leadership",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 16 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-15T10:00:00-04:00",
    "end": "2025-10-15T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "7bu6nkmfphq5vir5rtdva16a80",
    "title": "Growth Loops Design - Viral Mechanics for BuildOS",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 11 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-15T11:30:00-04:00",
    "end": "2025-10-15T12:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251015T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-15T12:00:00-04:00",
    "end": "2025-10-15T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "22n904479kg2k8cjna45qsl62c",
    "title": "Platform Vision - BuildOS as Infrastructure Play",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 23 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-15T13:00:00-04:00",
    "end": "2025-10-15T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "ktb7b9t28jo44cu7euosf51974",
    "title": "NY AI Engineers: Oct Tech Talk w/ OpenRouter Presenting",
    "description_snippet": "To see detailed information for automatically created events like this one, use the official Google Calendar app. https://g.co/calendar\n\nThis event was created from an email you received in Gmail. htt",
    "start": "2025-10-15T18:30:00-04:00",
    "end": "2025-10-15T20:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 1,
    "is_organizer": true,
    "location": "Mindspace, 25 Kent Ave, 4th Floor (North Building Lobby), New York, NY, 11249, us"
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251016T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-16T08:00:00-04:00",
    "end": "2025-10-16T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251016T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-16T12:00:00-04:00",
    "end": "2025-10-16T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "h5ik0k3152pve2q32j8f66tqn8",
    "title": "Metrics Dashboard Build - Screenshot-Ready Analytics",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 12 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-16T14:00:00-04:00",
    "end": "2025-10-16T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "gqon7sg7d1iacifogffssrrcag",
    "title": "Advanced Metrics - Cohorts, Retention, Engagement",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 22 training session\n\nPhase: Financial Modeling & Positioning\nProject: BuildOS CEO Training ",
    "start": "2025-10-16T15:30:00-04:00",
    "end": "2025-10-16T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251017T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-17T08:00:00-04:00",
    "end": "2025-10-17T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251017T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-17T12:00:00-04:00",
    "end": "2025-10-17T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2fuqul50nda01lm4bp9311n5b0",
    "title": "4pm Brittany Layla Mom housewarming",
    "description_snippet": "Park on grass",
    "start": "2025-10-18T16:00:00-04:00",
    "end": "2025-10-18T17:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "7881 Elizabeth Rd, Pasadena, MD 21122, USA"
  },
  {
    "id": "b88q004q76ggm4hju8f0da16mc",
    "title": "Mock Pitch #1 with Recorded Feedback",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 14 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-19T10:00:00-04:00",
    "end": "2025-10-19T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "uikpg0n6marqeb3er2sdcqmu94",
    "title": "Distribution Strategy - Own One Channel First",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 15 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-19T11:30:00-04:00",
    "end": "2025-10-19T12:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "q7q5d2cnd2eeaf92q9tac59clg",
    "title": "Mock Pitch #2 with Partner Meeting Simulation",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 21 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-19T13:00:00-04:00",
    "end": "2025-10-19T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "rhm3915sm4dvvhjjn8dgar58gs",
    "title": "Christine’s birthday",
    "start": "2025-10-19T13:30:00-04:00",
    "end": "2025-10-19T14:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "Reynolds Tavern and 1747 Pub, 7 Church Cir, Annapolis, MD 21401, USA"
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251020T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-20T08:00:00-04:00",
    "end": "2025-10-20T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "ke0b947hn561bnh779d8nplh38",
    "title": "Meet at magothy at 8:30AM fire truck thing",
    "start": "2025-10-20T08:30:00-04:00",
    "end": "2025-10-20T09:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "ibmc5vsh1me094h8iktd9ljt9k",
    "title": "Customer Success Stories - 5 Case Studies",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 17 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-20T10:00:00-04:00",
    "end": "2025-10-20T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "j37obo1bdumi9k9jsc7osfh8j0",
    "title": "Product Roadmap Presentation - 12-Month Vision",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 18 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-20T11:30:00-04:00",
    "end": "2025-10-20T12:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251020T172500Z",
    "title": "Therapy 1:25",
    "start": "2025-10-20T13:25:00-04:00",
    "end": "2025-10-20T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "j8k0rjjbfstpsiegj032uc84m4",
    "title": "2-Minute Pitch Recording + Self-Review Session",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 7 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Sprin",
    "start": "2025-10-20T14:00:00-04:00",
    "end": "2025-10-20T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "18dnpfqmrnf2u6n5ojhohsp9vo",
    "title": "Build Automated Blog Creation System",
    "description_snippet": "Project: 9takes\n\nDevelop a system that automatically generates blogs for tics using Claude code.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #4a2c8443-a979-4462-9e12-b6865e6b94e3",
    "start": "2025-10-20T14:30:00-04:00",
    "end": "2025-10-20T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "jjejv74va0l2sgbkvv4egfqd6s",
    "title": "Objection Handling - 20 Tough Questions + Answers",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 13 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-20T15:30:00-04:00",
    "end": "2025-10-20T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "te36tc2qb04uq9dkv7pa7mq6bs",
    "title": "The Ask - Funding Amount, Use of Funds, Milestones",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 20 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-20T17:00:00-04:00",
    "end": "2025-10-20T18:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251021T000000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-20T20:00:00-04:00",
    "end": "2025-10-20T21:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251021T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-20T21:00:00-04:00",
    "end": "2025-10-20T22:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251021T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-21T08:00:00-04:00",
    "end": "2025-10-21T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "446006l530siam7jteqfav7rac",
    "title": "Develop a user feedback system",
    "description_snippet": "Project: 9takes\n\nCreate a system for collecting, analyzing, and acting upon user feedback. This system should prioritize anonymity and ease of use to encourage honest and helpful feedback. \n\nShould lo",
    "start": "2025-10-21T14:30:00-04:00",
    "end": "2025-10-21T15:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "7l4ftgkr5kogf0qn3msih55o28",
    "title": "Scrape Reddit for Comments",
    "description_snippet": "Project: 9takes\n\nGather comments from Reddit that relate to the questions for the 9takes project.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #6c6ac317-f26a-495a-9bb5-885193ab115",
    "start": "2025-10-21T18:00:00-04:00",
    "end": "2025-10-21T19:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251022T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-22T08:00:00-04:00",
    "end": "2025-10-22T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "4l9qka5pumqk8ctpkb6m6j54uo",
    "title": "Mock Pitch #3 - Full Partner Meeting Format",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 28 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-22T10:00:00-04:00",
    "end": "2025-10-22T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251022T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-22T12:00:00-04:00",
    "end": "2025-10-22T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "3qh4qa70n3q57fm64vipcgsqj8",
    "title": "Walter Eye Appointment",
    "start": "2025-10-22T15:15:00-04:00",
    "end": "2025-10-22T16:15:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251023T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-23T08:00:00-04:00",
    "end": "2025-10-23T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251023T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-23T12:00:00-04:00",
    "end": "2025-10-23T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "tpied90n8to4l77ir7bo7sutv0",
    "title": "Investor Update Template + First Monthly Update",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 25 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-23T13:00:00-04:00",
    "end": "2025-10-23T14:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "r3o0l63rco050rrr90r80gp080",
    "title": "Team Slide Perfection - Why You'll Win",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 19 training session\n\nPhase: Pitch Development & Feedback\nProject: BuildOS CEO Training Spri",
    "start": "2025-10-23T14:30:00-04:00",
    "end": "2025-10-23T15:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251024T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-24T08:00:00-04:00",
    "end": "2025-10-24T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251024T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-24T12:00:00-04:00",
    "end": "2025-10-24T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "o5sep1ghucnuh2os95c4c4ppj4",
    "title": "Draft Email 4 - The Urgency",
    "description_snippet": "Project: 9takes\n\nCreate urgency and drive action with a clear call to action, highlighting exclusivity and offering an incentive.\n\nPhase: User Feedback & Iteration\nProject: 9takes\n\n[Build OS Task #2af",
    "start": "2025-10-24T15:30:00-04:00",
    "end": "2025-10-24T16:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "700rg7aqc9i0kflg0ofi49pgsu",
    "title": "Lily 2hr Early Dismissal! ",
    "start": "2025-10-27",
    "end": "2025-10-29",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251027T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-27T08:00:00-04:00",
    "end": "2025-10-27T12:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "upkjkvq8f35mgh6mvkic8u5spo",
    "title": "Final Pitch Recording + Outreach Strategy Launch",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 30 training session\n\nPhase: Final Preparations & Outreach\nProject: BuildOS CEO Training Spr",
    "start": "2025-10-27T10:00:00-04:00",
    "end": "2025-10-27T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "s5jtomnibf6um0nv7aiv2581rc",
    "title": "Data Room Completion + Due Diligence Prep",
    "description_snippet": "Project: BuildOS CEO Training Sprint\nhttps://build-os.com/projects/aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c\n\nDay 29 training session\n\nPhase: Final Preparations & Outreach\nProject: BuildOS CEO Training Spr",
    "start": "2025-10-27T11:30:00-04:00",
    "end": "2025-10-27T12:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251028T000000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-10-27T20:00:00-04:00",
    "end": "2025-10-27T21:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251028T010000Z",
    "title": "Trash to the curb",
    "start": "2025-10-27T21:00:00-04:00",
    "end": "2025-10-27T22:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251028T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-28T08:00:00-04:00",
    "end": "2025-10-28T12:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251029T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-29T08:00:00-04:00",
    "end": "2025-10-29T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251029T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-29T12:00:00-04:00",
    "end": "2025-10-29T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251030T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-30T08:00:00-04:00",
    "end": "2025-10-30T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "e7hop1bs4ajn0mlts70vaa86j8",
    "title": "Walter CoOp Day",
    "start": "2025-10-30T12:00:00-04:00",
    "end": "2025-10-30T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251030T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-30T12:00:00-04:00",
    "end": "2025-10-30T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251031T120000Z",
    "title": "Lily Kindergarten",
    "start": "2025-10-31T08:00:00-04:00",
    "end": "2025-10-31T14:25:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251031T160000Z",
    "title": "Finned Friends",
    "start": "2025-10-31T12:00:00-04:00",
    "end": "2025-10-31T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251103T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-03T08:00:00-05:00",
    "end": "2025-11-03T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251103T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-11-03T13:25:00-05:00",
    "end": "2025-11-03T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251104T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-03T20:00:00-05:00",
    "end": "2025-11-03T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251104T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-03T21:00:00-05:00",
    "end": "2025-11-03T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251104T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-04T08:00:00-05:00",
    "end": "2025-11-04T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251105T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-05T08:00:00-05:00",
    "end": "2025-11-05T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251105T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-05T12:00:00-05:00",
    "end": "2025-11-05T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251106T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-06T08:00:00-05:00",
    "end": "2025-11-06T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251106T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-06T12:00:00-05:00",
    "end": "2025-11-06T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "qf14n3vfaflfij93eigfuakl8s",
    "title": "Launch Twitter Week 1",
    "description_snippet": "Project: 9takes\n\nPost question hook at 5-6 PM EST or prepare for tomorrow morning.\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n[Build OS Task #9484054c-d022-4281-b615-e94312e2591a]",
    "start": "2025-11-06T15:30:00-05:00",
    "end": "2025-11-06T16:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251107T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-07T08:00:00-05:00",
    "end": "2025-11-07T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251107T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-07T12:00:00-05:00",
    "end": "2025-11-07T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "8tivdimv3ula3p32u9skuaf60g",
    "title": "2pm Parker’s birthday",
    "start": "2025-11-09T14:00:00-05:00",
    "end": "2025-11-09T15:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251110T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-10T08:00:00-05:00",
    "end": "2025-11-10T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251111T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-10T20:00:00-05:00",
    "end": "2025-11-10T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251111T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-10T21:00:00-05:00",
    "end": "2025-11-10T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251111T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-11T08:00:00-05:00",
    "end": "2025-11-11T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "3a395sklrb1pctb46c0lt8s9nq",
    "title": "Lily School Closed",
    "start": "2025-11-12",
    "end": "2025-11-13",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251112T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-12T12:00:00-05:00",
    "end": "2025-11-12T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "ukkrpkl8rphg0qfqsl90sokflg",
    "title": "Magothy Meeting",
    "start": "2025-11-12T19:00:00-05:00",
    "end": "2025-11-12T20:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251113T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-13T08:00:00-05:00",
    "end": "2025-11-13T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251113T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-13T12:00:00-05:00",
    "end": "2025-11-13T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251114T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-14T08:00:00-05:00",
    "end": "2025-11-14T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251114T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-14T12:00:00-05:00",
    "end": "2025-11-14T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "5qe6k29a8v12o3rkjrp4ep30eg",
    "title": "3pm Lily Heart Appointment",
    "start": "2025-11-14T15:00:00-05:00",
    "end": "2025-11-14T16:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "grg5i97ofaevhleddjcgsinsqc",
    "title": "Reach out to enneagram people",
    "description_snippet": "Project: 9takes\n\n\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n[Build OS Task #3f6fa916-f5bd-442e-a2c0-6f15ccfbcfd4]",
    "start": "2025-11-14T15:30:00-05:00",
    "end": "2025-11-14T16:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251117T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-17T08:00:00-05:00",
    "end": "2025-11-17T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251117T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-11-17T13:25:00-05:00",
    "end": "2025-11-17T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "br782tfgi747troc6fl9pv7eos",
    "title": "3:30 and 4pm dental appointments",
    "start": "2025-11-17T15:30:00-05:00",
    "end": "2025-11-17T16:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "lt85v38m8rud7csq7q3vmvgqq8",
    "title": "MOP MAGOTHY",
    "start": "2025-11-17T16:00:00-05:00",
    "end": "2025-11-17T17:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251118T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-17T20:00:00-05:00",
    "end": "2025-11-17T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251118T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-17T21:00:00-05:00",
    "end": "2025-11-17T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251118T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-18T08:00:00-05:00",
    "end": "2025-11-18T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "4n46dlsqbl6cuvu273d6b8oe9o",
    "title": "Draft Email 3 - The Value",
    "description_snippet": "Project: 9takes\n\nFocus on how the product addresses specific user pain points and highlight benefits, including a testimonial or case study.\n\nPhase: Final Review & Launch Preparation\nProject: 9takes\n\n",
    "start": "2025-11-18T16:30:00-05:00",
    "end": "2025-11-18T17:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251119T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-19T08:00:00-05:00",
    "end": "2025-11-19T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251119T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-19T12:00:00-05:00",
    "end": "2025-11-19T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251120T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-20T08:00:00-05:00",
    "end": "2025-11-20T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251120T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-20T12:00:00-05:00",
    "end": "2025-11-20T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251121T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-11-21T08:00:00-05:00",
    "end": "2025-11-21T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251121T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-21T12:00:00-05:00",
    "end": "2025-11-21T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "hpldlut4bt04unnvt2ssfa4o80",
    "title": "Finned friend helper",
    "start": "2025-11-21T12:00:00-05:00",
    "end": "2025-11-21T15:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "0e78nvqmnprn1dju2o8jpudrdg",
    "title": "School Closed",
    "start": "2025-11-24",
    "end": "2025-11-29",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "g8a5q319kn7ubrhbojqr5becus",
    "title": "9:30 dentist",
    "start": "2025-11-24T09:30:00-05:00",
    "end": "2025-11-24T10:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "o527l54g76607l0nascu57smeg_20251124T170000Z",
    "title": "Walter’s Birthday",
    "start": "2025-11-24T12:00:00-05:00",
    "end": "2025-11-24T13:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "dp4e2nu8d4d6e9nedj22be6pd4_20251125T000000Z",
    "title": "Buggy’s birthday",
    "start": "2025-11-24T19:00:00-05:00",
    "end": "2025-11-24T20:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251125T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-11-24T20:00:00-05:00",
    "end": "2025-11-24T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251125T020000Z",
    "title": "Trash to the curb",
    "start": "2025-11-24T21:00:00-05:00",
    "end": "2025-11-24T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "tsdde36s4gl149lds2gg9csf3g",
    "title": "David and sosa visit",
    "start": "2025-11-25",
    "end": "2025-12-04",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251126T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-26T12:00:00-05:00",
    "end": "2025-11-26T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251127T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-27T12:00:00-05:00",
    "end": "2025-11-27T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251128T170000Z",
    "title": "Finned Friends",
    "start": "2025-11-28T12:00:00-05:00",
    "end": "2025-11-28T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251201T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-01T08:00:00-05:00",
    "end": "2025-12-01T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "qesq7hrh2ph0gslmh568mig2oa_20251201T182500Z",
    "title": "Therapy 1:25",
    "start": "2025-12-01T13:25:00-05:00",
    "end": "2025-12-01T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251202T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-12-01T20:00:00-05:00",
    "end": "2025-12-01T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251202T020000Z",
    "title": "Trash to the curb",
    "start": "2025-12-01T21:00:00-05:00",
    "end": "2025-12-01T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251202T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-02T08:00:00-05:00",
    "end": "2025-12-02T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251203T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-03T08:00:00-05:00",
    "end": "2025-12-03T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20251203T170000Z",
    "title": "Finned Friends",
    "start": "2025-12-03T12:00:00-05:00",
    "end": "2025-12-03T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251204T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-04T08:00:00-05:00",
    "end": "2025-12-04T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20251204T170000Z",
    "title": "Finned Friends",
    "start": "2025-12-04T12:00:00-05:00",
    "end": "2025-12-04T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251205T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-05T08:00:00-05:00",
    "end": "2025-12-05T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20251205T170000Z",
    "title": "Finned Friends",
    "start": "2025-12-05T12:00:00-05:00",
    "end": "2025-12-05T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sqops9ocnqek2e2vdjhnod1mlo_20251208T130000Z",
    "title": "Lily Kindergarten",
    "start": "2025-12-08T08:00:00-05:00",
    "end": "2025-12-08T14:25:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "hvb8028htf6r0bpoai0gpqj0ps",
    "title": "10am Pelvic floor",
    "start": "2025-12-08T10:00:00-05:00",
    "end": "2025-12-08T11:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "fntegrcjndks5vilhgq1v17ogg",
    "title": "1pm 4month appt Levi",
    "start": "2025-12-08T13:00:00-05:00",
    "end": "2025-12-08T14:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "l2a9usgb1a9tiqt7sd71slqq3s_20251209T010000Z",
    "title": "Create Educational Content Schedule",
    "description_snippet": "Project: The Cadre\n\n\n\nTask: Create Educational Content Schedule\n\n\n[Build OS Task #28678ee0-f885-4787-840a-6aad9b55e55d]",
    "start": "2025-12-08T20:00:00-05:00",
    "end": "2025-12-08T21:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "sdocppvmlgiot9v1qd3tib5arc_20251209T020000Z",
    "title": "Trash to the curb",
    "start": "2025-12-08T21:00:00-05:00",
    "end": "2025-12-08T22:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2lru2ctedasfc8n68g01qk60ec",
    "title": "Lily 2hr Early Dismissal!",
    "start": "2025-12-09",
    "end": "2025-12-10",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  }
]

## Output Format

Return JSON with this structure:

{
  "groups": [
    {
      "group_id": "group-1",
      "project_theme": "High-level theme description",
      "suggested_project_name": "Specific project name",
      "confidence": 0.8,
      "event_ids": ["event-1", "event-2"],
      "event_count": 5,
      "keywords": ["keyword1", "keyword2"],
      "recurring_pattern": "weekly" or null,
      "meeting_series": true or false,
      "reasoning": "Why these events were grouped together",
      "key_participants": ["email1@example.com", "email2@example.com"],
      "time_range": {
        "earliest_event": "YYYY-MM-DD",
        "latest_event": "YYYY-MM-DD"
      },
      "estimated_start_date": "YYYY-MM-DD",
      "estimated_end_date": "YYYY-MM-DD" or null,
      "suggested_tags": ["tag1", "tag2"]
    }
  ],
  "ungrouped_event_ids": ["event-x", "event-y"]
}

## Guidelines

- Only group events that are clearly related
- Confidence >= 0.5 for grouping (be selective)
- One event can only belong to one group
- Ungrouped events go in ungrouped_event_ids
- Be specific with project names (not just "Team Sync")
- Include ALL relevant events in time_range calculation
- Ensure all event IDs in groups exist in the input events
- Extract dates carefully from event start/end fields
```

## Token Estimates

- **System Prompt:** ~36 tokens
- **User Prompt:** ~14418 tokens
- **Total Estimate:** ~14454 tokens

## Flow Notes

This is Part 1 of a 2-part flow. The output (event groups) will be passed to Part 2.
Part 1 uses a lightweight event format to reduce token usage and focus on pattern recognition.

---

_This file is automatically generated in development mode for prompt auditing purposes._
