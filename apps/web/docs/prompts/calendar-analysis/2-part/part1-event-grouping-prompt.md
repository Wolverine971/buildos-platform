<!-- apps/web/docs/prompts/calendar-analysis/2-part/part1-event-grouping-prompt.md -->

# Prompt Audit: calendar-analysis-part1-event-grouping

**Generated at:** 2026-05-11T19:17:18.968Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 1 of 2
**Purpose:** Event pattern recognition and grouping

## Metadata

```json
{
	"userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
	"eventCount": 28,
	"timestamp": "2026-05-11T19:17:18.968Z"
}
```

## System Prompt

```
You are an expert at analyzing calendar patterns to identify potential projects. Always respond with valid JSON following the specified schema.
```

## User Prompt

```
You are analyzing calendar events to identify patterns and group related events that might represent projects.

**Today's date**: 2026-05-11

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

## Calendar Events (28 total)

[
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260504T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-04T15:00:00-04:00",
    "end": "2026-05-04T17:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "vjbm3hmcpmpv0fajksk48cf1q0",
    "title": "DJ Wayne and Rocio Hernandez",
    "description_snippet": "Event Name\nTop AI Lab Interview\n\nLocation: This is a Google Meet web conference.\nYou can join this meeting from your computer, tablet, or smartphone.\nhttps://calendly.com/events/2cba5631-3f4c-4072-9f0",
    "start": "2026-05-06T09:30:00-04:00",
    "end": "2026-05-06T09:45:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "Google Meet (instructions in description)"
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260506T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-06T12:00:00-04:00",
    "end": "2026-05-06T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "2pcgc6u95poooh4bo7g3ii5d9o",
    "title": "9:45AM Walter eye PG COUNTY",
    "start": "2026-05-07T09:45:00-04:00",
    "end": "2026-05-07T10:45:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260507T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-07T12:00:00-04:00",
    "end": "2026-05-07T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260508T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-08T12:00:00-04:00",
    "end": "2026-05-08T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "sn7mmhh76h9moetl81e5ca0um8",
    "title": "6pm book club",
    "start": "2026-05-09T18:00:00-04:00",
    "end": "2026-05-09T21:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "ebs5i61hisqsir87ujt333got8_20260510T010000Z",
    "title": "Tina Bday",
    "start": "2026-05-09T21:00:00-04:00",
    "end": "2026-05-09T22:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 3,
    "is_organizer": true
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260511T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-11T15:00:00-04:00",
    "end": "2026-05-11T17:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "_60q30c1g60o30e1i60o4ac1g60rj8gpl88rj2c1h84s34h9g60s30c1g60o30c1g750kadq36koj6c238h348gpg64o30c1g60o30c1g60o30c1g60o32c1g60o30c1g89146chg6gq3ad1h84r48e1k61136dpi8oo3gg9h84o36dhk68qg",
    "title": "Rod Chamberlin / DJ Wayne - 30-minute Zoom meeting",
    "description_snippet": "Location details\nWhen it's time, use this link to join the meeting:\nhttps://us02web.zoom.us/j/9498889440#success\n\nAttendees\nRod Chamberlin (Host)\nDJ Wayne, djwayne35@gmail.com\n+1 410 980 0852\n\nNeed to",
    "start": "2026-05-12T11:30:00-04:00",
    "end": "2026-05-12T12:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "https://us02web.zoom.us/j/9498889440#success"
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260513T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-13T12:00:00-04:00",
    "end": "2026-05-13T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260514T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-14T12:00:00-04:00",
    "end": "2026-05-14T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260515T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-15T12:00:00-04:00",
    "end": "2026-05-15T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "k90gil7pefc8i711co4qc41dik",
    "title": "helping parent",
    "start": "2026-05-15T12:00:00-04:00",
    "end": "2026-05-15T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260518T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-18T15:00:00-04:00",
    "end": "2026-05-18T17:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "g106a9m80l2fdkgq5spica9f5s",
    "title": "Acton Acadamy open house",
    "start": "2026-05-19T18:00:00-04:00",
    "end": "2026-05-19T19:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "461 College Pkwy, Arnold, MD 21012"
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260520T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-20T12:00:00-04:00",
    "end": "2026-05-20T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260521T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-21T12:00:00-04:00",
    "end": "2026-05-21T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260522T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-22T12:00:00-04:00",
    "end": "2026-05-22T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260525T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-25T15:00:00-04:00",
    "end": "2026-05-25T17:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260527T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-27T12:00:00-04:00",
    "end": "2026-05-27T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260528T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-28T12:00:00-04:00",
    "end": "2026-05-28T15:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "nt0hvjt6ugkgfm72iatl96pn60",
    "title": "Hot Wheels Monster Trucks Live Glow-N-Fire",
    "start": "2026-05-30T12:00:00-04:00",
    "end": "2026-05-30T15:00:00-04:00",
    "is_recurring": false,
    "attendee_count": 2,
    "is_organizer": false,
    "location": "CFG Bank Arena, Baltimore, Maryland"
  },
  {
    "id": "a9cqbm18afr35lkcdq2brn0aj4",
    "title": "Flight to Las Vegas (WN 1167)",
    "description_snippet": "To see detailed information for automatically created events like this one, use the official Google Calendar app. https://g.co/calendar\n\nThis event was created from an email you received in Gmail. htt",
    "start": "2026-05-31T06:05:00-04:00",
    "end": "2026-05-31T11:20:00-04:00",
    "is_recurring": false,
    "attendee_count": 1,
    "is_organizer": true,
    "location": "Baltimore BWI"
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260601T190000Z",
    "title": "Fun in the forest",
    "start": "2026-06-01T15:00:00-04:00",
    "end": "2026-06-01T17:00:00-04:00",
    "is_recurring": true,
    "attendee_count": 2,
    "is_organizer": false
  },
  {
    "id": "qha8vvrk3b37os226ldbhtobms",
    "title": "Flight to Houston (WN 2243)",
    "description_snippet": "To see detailed information for automatically created events like this one, use the official Google Calendar app. https://g.co/calendar\n\nThis event was created from an email you received in Gmail. htt",
    "start": "2026-06-06T17:25:00-04:00",
    "end": "2026-06-06T20:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 1,
    "is_organizer": true,
    "location": "Las Vegas LAS"
  },
  {
    "id": "ggcl360d4cj4l1atda4c4j25pc",
    "title": "Flight to Baltimore (WN 1961)",
    "description_snippet": "To see detailed information for automatically created events like this one, use the official Google Calendar app. https://g.co/calendar\n\nThis event was created from an email you received in Gmail. htt",
    "start": "2026-06-06T21:30:00-04:00",
    "end": "2026-06-07T00:30:00-04:00",
    "is_recurring": false,
    "attendee_count": 1,
    "is_organizer": true,
    "location": "Houston HOU"
  },
  {
    "id": "2u0bgasjr7uegkogs28j47cma8",
    "title": "Lily CAC Camp",
    "description_snippet": "Instructor: Lorena Solano",
    "start": "2026-06-29T09:30:00-04:00",
    "end": "2026-07-02T00:30:00-04:00",
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
- **User Prompt:** ~2979 tokens
- **Total Estimate:** ~3015 tokens

## Flow Notes

This is Part 1 of a 2-part flow. The output (event groups) will be passed to Part 2.
Part 1 uses a lightweight event format to reduce token usage and focus on pattern recognition.

---

_This file is automatically generated in development mode for prompt auditing purposes._
