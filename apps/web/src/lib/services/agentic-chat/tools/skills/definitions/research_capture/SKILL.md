---
name: Research Capture
description: Turn research and durable things the user says into saved project records instead of chat-only answers — when to capture, where it lands, and how to report it back without pasting the document.
catalog_line: Save research findings and stated next steps into project records instead of losing them in chat.
skill_type: procedure # procedure | strategy | reference | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
recommended_load_format: full
preserve_markdown: true
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/research_capture/SKILL.md
---

# Research Capture

<!--
  BLOCK ONTOLOGY (canonical order): Identity → Activation → Judgment → Procedure → Contract →
  Policy → Related Tools → Examples → Provenance.
  skill_type: procedure — Activation + Procedure + Contract carry the weight. Judgment resolves the
  capture/no-capture call, which is the decision the measured failure hinges on.
-->

## Identity

Procedure skill at **task** altitude for the moment a turn produces knowledge that does not yet exist
anywhere in BuildOS: findings from web research, or something durable the user stated in passing.
Its job is to get that knowledge into a project record before the turn ends, and to report it back as
takeaways rather than as a wall of text.

This skill is about **where knowledge lands and how it is reported**. It is not about document
formatting or structure — `document_workspace` owns that.

## Activation

Load this skill when a turn is generating knowledge that would otherwise exist only in the reply.

- The turn has run, or is about to run, two or more `web_search` / `web_visit` calls
- The user asked you to research, look into, compare, or find out about something
- The user stated something durable in passing — what happens next, what they are waiting on, a
  decision, a constraint, a deadline — that is not already recorded
- A prior turn researched something and the findings are not in any document

Do not load this skill for a single quick lookup answered from one search, or when the user is asking
about something already in their workspace. Reading existing context is not research.

## Judgment

The capture decision, in order. Stop at the first match.

| Condition                                                                         | Call                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| User explicitly said not to save, or asked a throwaway question                   | **Do not capture.** Answer in chat                                            |
| One search, one fact, answer fits in a sentence                                   | **Do not capture.** Answering is enough                                       |
| ≥2 research calls, or any comparison / landscape / pricing / options question     | **Capture required** before the turn ends                                     |
| User stated a future, a decision, a blocker, or a constraint not already recorded | **Capture required**, as the smallest record that fits (see Procedure step 4) |
| Findings extend a document that already exists                                    | **Append to it.** Do not create a parallel document                           |

The failure this skill exists to prevent is the silent one: a turn that researches well, answers
fluently, and leaves nothing behind. **The user cannot see what was lost.** When the call is close,
capture — an unnecessary note is cheap and visible; a lost finding is neither.

## Procedure

1. **Decide before you research, not after.** If the request meets the capture bar in Judgment, plan
   on writing. Deciding afterward is how the write gets skipped.
2. **Look for an existing home first.** Search the project for a document this belongs to
   (`search_onto_documents` / `list_onto_documents`). Appending to the right document beats creating a
   near-duplicate.
3. **Write the record before you finalize.** Append to the existing document, or create one when
   nothing fits. The document carries the findings, the reasoning, and a `## Sources` section listing
   every URL used. **Maximum 2 new documents per turn** — more than that is bloat, not thoroughness.
4. **For something the user stated,** pick the smallest record that survives: a task if it is work, an
   event if it has a time, an update to the relevant document or the project START HERE if it is
   context. One is enough. Do not create all four.
5. **Name what you could not answer.** Anything you searched for and did not resolve goes in the
   document under an explicit unknowns heading. A finding list that hides its gaps reads as more
   certain than it is.
6. **Report back as takeaways, not as the document.** See Contract.

## Contract

The reply and the record do different jobs. Do not collapse them.

**The document gets:** the findings, the detail, the reasoning, a `## Sources` section with every URL,
and an explicit unknowns section.

**The reply gets:**

- **3–5 bullets, bottom line up front.** What you found, in the order that matters.
- **One line naming where the detail lives** — the document title.
- **One line on what is still unknown**, if anything is.

Never paste the document body into the reply. The reply is the summary; the document is the record.
If the user wants the full text they will open it.

Stop condition: the turn is not finished until the record exists. If a write fails, say so in the
reply rather than answering as though it succeeded.

## Policy

- **Do not answer from two or more research calls without writing a record.** This is the failure
  mode; treat it as a hard rule, not a preference.
- **Do not create a document without a `## Sources` section** when the content came from the web.
- **Do not create more than 2 new documents in one turn.** Prefer one, prefer appending.
- **Do not silently drop a stated future.** "I'm waiting to hear back," "I'll decide next week,"
  "this is blocked on Ana" — each needs a record, even a one-line one.
- **Do not claim you saved something you did not.** If the write failed, report the failure.
- **Do not capture private throwaway remarks** the user clearly did not mean as project state.
- Escalate to `document_workspace` when the question is how to structure or format the document
  rather than whether to write it.

## Related Tools

- `util.web.search`
- `util.web.visit`
- `onto.document.search`
- `onto.document.list`
- `onto.document.create`
- `onto.document.update`
- `onto.task.create`

## Examples

### Research a landscape and leave a record

- User: "I think we need to figure out the research on what people charge for this — like a doc about
  it or something."
- Four `web_search` calls plus two `web_visit` calls on vendor pricing pages. Capture bar met.
- Search the project first; no pricing document exists, so create one:
  `create_onto_document({ project_id: "<uuid>", title: "Pricing Landscape — Competitor Research", content: "<findings, ranges, per-vendor notes>\n\n## Unknowns\n- No public pricing for two of the five vendors\n\n## Sources\n- https://…\n- https://…" })`
- Reply:

> Three things stood out:
>
> - Most competitors land between $2.5k and $6k for a comparable scope.
> - Two of the five publish no pricing at all — both route to a sales call.
> - The one that publishes lowest bundles hosting, so it is not a like-for-like comparison.
>
> Detail and sources are in **Pricing Landscape — Competitor Research**.
> Still unknown: actual close prices, which nobody publishes.

### Append rather than fork

- User: "Can you look into whether that integration supports webhooks?"
- Two research calls. A document named "Integration Notes" already exists in the project.
- Append to it instead of creating "Webhook Research":
  `update_onto_document({ document_id: "<uuid>", update_strategy: "append", content: "## Webhooks\n<findings>\n\n## Sources\n- https://…" })`

### Capture a stated future

- User: "Yeah the Northwind intro call is done, I'm just waiting to hear back from them."
- Two records, not one thing: close the task, then capture the future as the smallest record that
  fits.
  `update_onto_task({ task_id: "<uuid>", state_key: "done" })`
  `create_onto_task({ project_id: "<uuid>", title: "Follow up with Northwind if no reply", description: "Waiting to hear back after the intro call." })`
- Reply: "Closed the Northwind intro call and added a follow-up so the wait doesn't get lost."

### Do not capture

- User: "What's that library called again, the one for date parsing?"
- One search, one fact. Answer in chat. No document.

## Provenance

- `internal-default` — Written 2026-07-25 from a measured failure, not from general principle. Five
  identical runs of the `document-from-vague-description` e2e scenario split 3 pass / 2 fail: on the
  failures the agent ran exactly six `web_search` calls, reported findings in chat, and persisted
  nothing. The `task-complete-cold-reference` scenario fails the same way on stated futures, hitting
  zero of four durable surfaces.
- The base prompt previously framed persistence as optional ("when you save findings into a
  document…"), which is why the model treated it as a choice. That line was corrected alongside this
  skill; the skill carries the depth the prompt line cannot.
