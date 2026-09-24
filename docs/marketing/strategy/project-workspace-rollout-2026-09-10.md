<!-- docs/marketing/strategy/project-workspace-rollout-2026-09-10.md -->

# BuildOS: a project workspace you can talk to

Date: September 10, 2026. Owner: DJ Wayne.

The founder selected **“A project workspace you can talk to.”** as the public description.
This replaces “AI-first project organization app” and “thinking environment” in first-contact copy.
The product name and visual identity stay BuildOS. The author audience and return-to-work benefit
are working hypotheses, not newly established customer findings.

## Copy to use

| Surface                                   | Copy                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product description / headline            | A project workspace you can talk to.                                                                                                                                                 |
| Spoken introduction                       | BuildOS is a project workspace you can talk to. Tell it what you’re working on, and it organizes your notes, tasks, and next steps. Come back, tell it what changed, and keep going. |
| Homepage supporting copy                  | Paste your rough notes or tell BuildOS what you’re working on. It organizes the pieces into tasks, documents, and next steps. Tell it what changes as you go.                        |
| Primary CTA                               | Start with one project                                                                                                                                                               |
| First project prompt                      | I’m working on \_\_\_\_. Here’s what I have so far. Here’s where I’m stuck.                                                                                                          |
| Return prompt                             | Tell BuildOS one thing that changed: something you finished, a new idea, or a deadline that moved.                                                                                   |
| Benefit to test                           | Pick up your project without piecing it back together.                                                                                                                               |
| Agent explanation, after the core product | Connect a supported AI tool to read and update the same project you use.                                                                                                             |

“Talk to” includes typed conversation. Show typing in the primary demo. Voice can be demonstrated
when the actual recording/transcription path works on the device being shown.

The promise is demonstrated by an observable sequence: say something → inspect the project →
request a change → inspect the changed item → return to the same work later.

## Rollout and acceptance

| Work                      | Deliverable                                                                                                                  | Acceptance / remaining action                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Consistent public wording | Shared brand constants, homepage and preview metadata, navigation, footer, About introduction, signup, marketing-assets copy | Local implementation reviewed at desktop and mobile widths; deploy through the normal release flow.                             |
| Proof on the page         | Existing real creation and task-change screenshots, followed by a return-to-project explanation before agent details         | Screenshots are labeled as an example book project. No invented weeks/months of customer progress.                              |
| First use                 | Singular project prompts, inspect-and-adjust receipt copy, next-visit guidance                                               | Existing project creation and recovery logic stays in place.                                                                    |
| Welcome sequence          | Shortened first three emails; existing-project Email 2 points back to that project                                           | Preserve scheduling, unsubscribe, eligibility, and optional integration controls. No messages sent as part of this work.        |
| Brand consistency         | Updated strategy, brand guide, architecture, and index entry points                                                          | Historical pitch docs are marked as superseded for first-contact copy.                                                          |
| Channel rollout           | Paste-ready copy below                                                                                                       | Founder publishes/updates profiles after reviewing the local change.                                                            |
| Demo production           | Recording plan and asset inventory below                                                                                     | A fresh recording with a genuine later-session return is still needed. Existing screenshots are not a new longitudinal receipt. |
| Customer learning         | Five-person comprehension and return-use protocol below                                                                      | Recruit participants and collect actual answers; no results are claimed here.                                                   |

Validation: 14 existing targeted tests pass across the welcome copy, welcome branching, project
capture, and ready screen. Browser checks cover the public homepage, walkthrough link, and
registration destination. The 390px layout has no horizontal page overflow. The first full Svelte
check found two missing icon imports in the homepage; both were restored. Two subsequent runs
did not finish and were stopped after prolonged runs without new diagnostics. A completed
`pnpm --filter @buildos/web check` remains a release prerequisite. The final run log is
`/tmp/buildos-positioning-check-final.log` on the development machine.

The existing raster social cards retain their older campaign artwork. Replace those images in a
separate visual pass before treating the external rollout as complete; their current image alt
text continues to describe the actual artwork.

## Homepage story

1. Name the product: a project workspace you can talk to.
2. Show one rough message becoming tasks and documents in a real example project.
3. Show a conversational change and the changed task side by side.
4. Explain the next session: open, update, continue.
5. Explain optional connected agents using that same project.
6. Offer one project as the next action.

Keep the author example specific without suggesting that only authors can use BuildOS.
Keep the broader product architecture behind the first useful demonstration.

## Demo recording sheet

Deliverable: one approximately 60–90 second recording of actual BuildOS use, plus a short excerpt
of the task-change moment. Timing is an editing budget, not a claim about application speed.
No synthetic product shots, simulated success, customer impersonation, or invented elapsed time.

Use the existing **Fading Crown** example book project in a dedicated demo account. This is a
fictional book used to demonstrate the real product, not a customer success story. Existing images
live under `apps/web/static/home/`. Keep the same project identifiable across each shot.

| Shot       | Show / action                                                                         | Suggested spoken line                                                                  | Verification                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 · 0–6s   | Founder or actual project screen                                                      | “BuildOS is a project workspace you can talk to.”                                      | Show the current UI.                                                                            |
| 2 · 6–22s  | Enter the rough project description in the actual creation flow                       | “I start with the rough version of what I’m working on.”                               | Show the submitted message and actual creation result.                                          |
| 3 · 22–38s | Open one generated task and document                                                  | “The conversation becomes tasks and documents I can open and edit.”                    | Show real saved contents, not just the chat’s success message.                                  |
| 4 · 38–57s | In project chat, request a specific change to an existing task; open that task        | “When the plan changes, I tell BuildOS. Here’s the updated task.”                      | Read the original due date first, pick an explicit new future date, and verify the saved value. |
| 5 · 57–77s | Return in a genuinely later session; open the same project and review unfinished work | “When I come back, the project is here. I review what’s left and choose my next step.” | Capture a later session. Only say “the next day” if it really is.                               |
| 6 · 77–90s | Finish on the actual project or homepage CTA                                          | “Start with one project. Bring the rough notes you already have.”                      | Link to registration.                                                                           |

Input for a fresh demo project, if required: “Create a project called Fading Crown demo. I’m
revising a fantasy novel about a queen losing her magic. I have a rough outline and notes about
Maya’s character arc. I need to revise chapter 12 and arrange a beta-reader pass. Keep the open
questions in a document and create tasks for the next steps.” Use a new demo project only if
recording the existing one would misrepresent its history. Never overwrite a real author’s work.

For the update, use the actual task name and a date chosen at recording time. If the operation
fails, resolve the issue before recording a success claim. Show necessary confirmations; if waits
are shortened in the edit, label the edit. Do not imply the excerpt is an uncut speed benchmark.

Existing reusable stills:

- `hero-say-light.jpg` / `hero-say-dark.jpg`: typed rough input.
- `hero-work-light.jpg` / `hero-work-dark.jpg`: project creation receipts.
- `hero-real-light.jpg` / `hero-real-dark.jpg`: actual example project surface.
- `case-update-chat-light.jpg` / `case-update-chat-dark.jpg`: request to change a task.
- `case-board-light.jpg` / `case-board-dark.jpg`: resulting task board.

These support creation and change. They do not prove a later-session return. The homepage return
section is instructional copy, clearly separate from the screenshot evidence.

## Copy for other channels

Company bio:

> A project workspace you can talk to. Turn rough notes into tasks, documents, and next steps. Start with one project.

Founder bio line:

> Building BuildOS — a project workspace you can talk to.

Company About / product listing:

> BuildOS is a project workspace you can talk to. Describe what you’re working on or paste your rough notes. BuildOS organizes the pieces into tasks, documents, and next steps you can inspect and edit. As plans change, update the same project through conversation. Start with one project and keep building on it.

Author example:

> Keep your chapter notes, revision tasks, and beta-reader deadlines in one project. Tell BuildOS what changed, then see what needs attention next.

Video creator example:

> Keep the research, outline, and production tasks for your next video together. Tell BuildOS what changed as the video takes shape.

Short founder post, ready to pair with a verified task-change recording:

> The clearest way I’ve found to explain BuildOS: a project workspace you can talk to.
>
> Give it the rough version of what you’re working on. Open the tasks and documents it creates. When something changes, tell it in chat and check the updated project.
>
> This clip shows that loop on an example book project.
>
> Start with one project: https://build-os.com/

Demo caption for an existing screenshot sequence:

> One example book project in BuildOS: the rough message, the project it created, and a task updated through chat. A project workspace you can talk to.

Use the recording version only once that recording exists. Do not frame a screenshot sequence as
a live clip. Do not add customer names, savings figures, or first-person origin anecdotes without
verified source material. Email recipients, lists, and eligibility are outside this copy package.

## Five-person learning protocol

Working first group: independent writers/creators with one substantial current project. Include
people unfamiliar with BuildOS, not only supportive friends or existing enthusiasts. Five sessions
are a small diagnostic exercise, not statistical proof of positioning or conversion lift.

Recruitment message, ready to send once participants are selected:

> I’m testing a new way to explain BuildOS. Could I borrow 20 minutes to show you a page and watch you try it with a project you’re already working on? I’m looking for the confusing parts, and there’s no need to prepare anything. If it’s useful, we can check back after your next work session.

Send this without the new tagline so participants arrive without being coached on the wording.

1. Show the headline and subtitle briefly, then hide them. Ask: “What does this product do?”
2. Ask: “What would you put into it first?” and “What would you expect to see afterward?”
3. Ask what “talk to” means to them before demonstrating typed chat. Record voice-only confusion.
4. Show the creation/change walkthrough. Ask what changed in their understanding.
5. Let them use one real project voluntarily. Observe input, inspection of saved work, and one
   requested update. Record where they need coaching; do not count a coached result as independent.
6. Agree a later follow-up. Ask what they remember without showing the copy. Observe whether they
   return to the same project and make a useful update. A login alone is not the success event.
7. Ask what they would otherwise have used and what, if anything, was easier here.

Record the exact customer language with permission. Keep sensitive project content out of the
marketing notes. Use participant IDs; permission to take research notes is not permission to publish
a testimonial. Repeated confusion or requests identify the next edit.

| Participant | Prior familiarity | Their description | Expected first result | Meaning of “talk” | Inspected saved item unaided | Updated same project later | Alternative / friction | Quote permission |
| ----------- | ----------------- | ----------------- | --------------------- | ----------------- | ---------------------------- | -------------------------- | ---------------------- | ---------------- |
| P1          | Pending           |                   |                       |                   |                              |                            |                        |                  |
| P2          | Pending           |                   |                       |                   |                              |                            |                        |                  |
| P3          | Pending           |                   |                       |                   |                              |                            |                        |                  |
| P4          | Pending           |                   |                       |                   |                              |                            |                        |                  |
| P5          | Pending           |                   |                       |                   |                              |                            |                        |                  |

Use these as editing triggers for this first small round:

- If two people expect a voice-only app, make typed conversation more explicit in the supporting copy and first screenshot.
- If two cannot explain the saved result, move the task/document proof closer to the headline.
- If people understand the promise but need coaching to create or update a project, fix that product step before expanding acquisition.
- If people complete a first session but find no reason to return, investigate the ongoing job before making the return benefit the main sales claim.

Keep the exact description while testing the supporting explanation. A revised headline is a
later decision if repeated misunderstanding persists after the concrete proof is visible.

Existing onboarding telemetry includes `first_capture_started`, `first_capture_submitted`,
`first_structure_generated`, `first_project_created`, and `first_project_reviewed`. Review their
actual definitions before interpreting them. The welcome sequence’s `lastVisit` approximation
cannot establish that someone updated the same project. Start with observed sessions; avoid adding
a broad analytics project before these interviews identify a need.

## Harry Dry checks and evidence boundaries

- Visualizable: name notes, tasks, documents, and visible changes.
- Falsifiable: show the saved result of a specific request. Do not invent speed or outcome figures.
- Distinctive: this description is understandable, not an exclusive capability claim. Earn a more
  ownable story with demonstrated customer use and founder facts.

The [positioning article](https://marketingexamples.com/brand/positioning) informed the focus on a
recognizable situation and a narrower first audience. The [landing page guide](https://marketingexamples.com/landing-page/guide)
informed the sequence of explanation, product evidence, and action. The [customer-language example](https://marketingexamples.com/copywriting/customers)
informed the interview protocol. The [title guide](https://marketingexamples.com/landing-page/titles)
informed the recall check. These are applications of the articles, not Harry’s endorsement of BuildOS.

As checked on September 10, Notion promotes [creating projects from messy notes](https://www.notion.com/product/ai/use-cases/create-tasks-and-projects-from-messy-notes)
and [external-agent read/write access](https://www.notion.com/help/notion-mcp). Do not claim that
competitors all forget, require exclusively manual setup, or lack connected agents. Test the ease
of this specific workflow instead.
