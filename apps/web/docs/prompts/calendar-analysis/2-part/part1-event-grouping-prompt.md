<!-- apps/web/docs/prompts/calendar-analysis/2-part/part1-event-grouping-prompt.md -->

# Prompt Audit: calendar-analysis-part1-event-grouping

**Generated at:** 2026-02-27T05:33:29.148Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 1 of 2
**Purpose:** Event pattern recognition and grouping

## Metadata

```json
{
	"userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
	"eventCount": 42,
	"timestamp": "2026-02-27T05:33:29.148Z"
}
```

## System Prompt

```
You are an expert at analyzing calendar patterns to identify potential projects. Always respond with valid JSON following the specified schema.
```

## User Prompt

```
You are analyzing calendar events to identify patterns and group related events that might represent projects.

**Today's date**: 2026-02-27

## Your Task

Group related calendar events and identify project themes. Focus on:
1. Recurring meetings with similar titles/attendees
2. Clusters of events around similar topics
3. Project-indicating keywords (sprint, launch, milestone, review, planning, kickoff, deadline, sync, standup, retrospective, design, implementation)
4. Series of events building toward a goal

## Events to EXCLUDE from Grouping

**DO NOT** group these types of events (they are personal, not work projects):
- Personal appointments (dentist, doctor, therapy, medical, checkup)
- Family events (birthday, kindergarten, school, daycare, dismissal)
- Household tasks (trash, maintenance, mop, errands)
- Social events without work context (couples night, housewarming, visit)
- One-off personal commitments (pick up, drop off, bring to school)

## Events to INCLUDE in Grouping

- Work meetings with project keywords
- Recurring meetings with multiple attendees
- Events suggesting coordinated work effort
- Focus time blocks for specific projects
- Team sync meetings and standups

## Calendar Events (42 total)

[
  {
    "id": "187stvtin15i2pnp62theevu3g_20260220T170000Z",
    "title": "No Finned Friends",
    "start": "2026-02-20T12:00:00-05:00",
    "end": "2026-02-20T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "82cg0bva0q254vcpr6q9pd1usg",
    "title": "Meet with Solo",
    "start": "2026-02-21T20:30:00-05:00",
    "end": "2026-02-21T21:30:00-05:00",
    "is_recurring": false,
    "attendee_count": 0,
    "is_organizer": true
  },
  {
    "id": "khnictki0nkdk8tmmsfkrlri6o",
    "title": "Lily iCode 2:30-3:45",
    "start": "2026-02-23T14:30:00-05:00",
    "end": "2026-02-23T15:45:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260225T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-25T12:00:00-05:00",
    "end": "2026-02-25T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "oojqklo5fuc7ghrjso3cd8p3ac",
    "title": "Helping grown up",
    "start": "2026-02-25T12:00:00-05:00",
    "end": "2026-02-25T15:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260226T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-26T12:00:00-05:00",
    "end": "2026-02-26T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260227T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-27T12:00:00-05:00",
    "end": "2026-02-27T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "j035l17eirk4ca2mo7143ispag",
    "title": "12:45 dr Levi",
    "start": "2026-02-27T12:45:00-05:00",
    "end": "2026-02-27T13:45:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "npgl7qn0bh5ifc1ph8355nhls4",
    "title": "Lily iCode 2:30-3:45",
    "start": "2026-03-02T14:30:00-05:00",
    "end": "2026-03-02T15:45:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260304T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-04T12:00:00-05:00",
    "end": "2026-03-04T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260305T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-05T12:00:00-05:00",
    "end": "2026-03-05T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260306T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-06T12:00:00-05:00",
    "end": "2026-03-06T15:00:00-05:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "9bifcjmgtc2d8c1v7v5pa710dk",
    "title": "Vintage shopping with Kaitlyn",
    "start": "2026-03-07T11:00:00-05:00",
    "end": "2026-03-07T12:00:00-05:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "730 Bestgate Rd, Annapolis, MD 21401, USA"
  },
  {
    "id": "t8i94mphqbeqlm41affcm7uop4",
    "title": "10Am booster flu shot Levi",
    "start": "2026-03-09T10:00:00-04:00",
    "end": "2026-03-09T11:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2ckma5g2dfqdrgm658bgc3b7q8",
    "title": "Lily iCode 2:30-3:45",
    "start": "2026-03-09T14:30:00-04:00",
    "end": "2026-03-09T15:45:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260311T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-11T12:00:00-04:00",
    "end": "2026-03-11T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260312T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-12T12:00:00-04:00",
    "end": "2026-03-12T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260313T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-13T12:00:00-04:00",
    "end": "2026-03-13T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "6f9mheugl5tkb6uf4k7ei08ahg_20260314T020000Z",
    "title": "National nap day",
    "description_snippet": "Let’s all take a nap",
    "start": "2026-03-13T22:00:00-04:00",
    "end": "2026-03-13T23:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 11,
    "is_organizer": true
  },
  {
    "id": "9okfdbufsbha6kt3b0a2j7dk6s",
    "title": "Lily iCode 2:30-5PM",
    "description_snippet": "Extended time for makeup day pick up at 5pm!",
    "start": "2026-03-16T14:30:00-04:00",
    "end": "2026-03-16T17:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260318T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-18T12:00:00-04:00",
    "end": "2026-03-18T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260319T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-19T12:00:00-04:00",
    "end": "2026-03-19T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260320T160000Z",
    "title": "NO Finned Friends",
    "start": "2026-03-20T12:00:00-04:00",
    "end": "2026-03-20T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "hs0714dejol6b1msopr40iii6g",
    "title": "Magothy Meeting",
    "start": "2026-03-24T19:00:00-04:00",
    "end": "2026-03-24T20:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260325T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-25T12:00:00-04:00",
    "end": "2026-03-25T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260326T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-26T12:00:00-04:00",
    "end": "2026-03-26T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260327T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-27T12:00:00-04:00",
    "end": "2026-03-27T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "66v30balf2ndpmnnd2sn0g5o90",
    "title": "Spring Break!",
    "start": "2026-03-30",
    "end": "2026-04-07",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260401T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-01T12:00:00-04:00",
    "end": "2026-04-01T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260402T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-02T12:00:00-04:00",
    "end": "2026-04-02T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260403T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-03T12:00:00-04:00",
    "end": "2026-04-03T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260408T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-08T12:00:00-04:00",
    "end": "2026-04-08T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "430r1qj9dbf72002ao7i890jf8",
    "title": "Helping parent",
    "start": "2026-04-08T12:00:00-04:00",
    "end": "2026-04-08T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260409T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-09T12:00:00-04:00",
    "end": "2026-04-09T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260410T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-10T12:00:00-04:00",
    "end": "2026-04-10T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260415T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-15T12:00:00-04:00",
    "end": "2026-04-15T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260416T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-16T12:00:00-04:00",
    "end": "2026-04-16T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260417T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-17T12:00:00-04:00",
    "end": "2026-04-17T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "8c996r1q1slmphgeuisq00nl68",
    "title": "Magothy cleaning day",
    "start": "2026-04-21T18:00:00-04:00",
    "end": "2026-04-21T19:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260422T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-22T12:00:00-04:00",
    "end": "2026-04-22T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260423T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-23T12:00:00-04:00",
    "end": "2026-04-23T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260424T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-24T12:00:00-04:00",
    "end": "2026-04-24T15:00:00-04:00",
    "is_recurring": true,
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
- **Confidence >= 0.7 for grouping (be highly selective)**
- One event can only belong to one group
- Ungrouped events go in ungrouped_event_ids
- Be specific with project names (not just "Team Sync")
- Include ALL relevant events in time_range calculation
- Ensure all event IDs in groups exist in the input events
- Extract dates carefully from event start/end fields

## Examples

**GOOD Grouping** (High confidence 0.85+):
- "Sprint Planning", "Sprint Review", "Sprint Retro" → "Agile Development Sprint Cycle" (clear series)
- "Q4 Marketing Launch Prep", "Launch Review", "Launch Debrief" → "Q4 Marketing Campaign Launch" (thematic unity)

**BAD Grouping** (Don't do this):
- "Team Lunch", "All Hands", "1:1 with Manager" → Too generic, unrelated
- "Lily Kindergarten", "Walter School Drop-off" → Personal/family events
- "Therapy 1:10pm", "Dentist Appointment" → Personal appointments
```

## Token Estimates

- **System Prompt:** ~36 tokens
- **User Prompt:** ~3456 tokens
- **Total Estimate:** ~3492 tokens

## Flow Notes

This is Part 1 of a 2-part flow. The output (event groups) will be passed to Part 2.
Part 1 uses a lightweight event format to reduce token usage and focus on pattern recognition.

---

_This file is automatically generated in development mode for prompt auditing purposes._
