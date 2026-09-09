---
title: 'BuildOS Usability and Interaction Principles'
description: 'Operational principles for auditing BuildOS screens, flows, and shared interaction patterns'
date_created: '2025-08-15'
date_modified: '2026-09-09'
status: 'active'
category: 'design-system'
tags: [design-principles, usability, interaction-design, flow-audits, buildos]
related_files:
    - apps/web/docs/design/ux-audit-cheat-sheet.md
    - apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
    - apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md
    - apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md
---

# BuildOS Usability and Interaction Principles

## Purpose

Use these principles to make BuildOS easier to understand, faster to operate, safer to explore, and
more satisfying to complete work in. They are decision prompts, not laws that override product
context. Several overlap deliberately because a single source of friction can affect attention,
structure, momentum, and trust at the same time.

Do not score every route against all twenty principles. Audit a core user flow first, inspect the
screens and states inside that flow, and then move recurring problems into shared components or
system conventions.

The companion [UX audit cheat sheet](./ux-audit-cheat-sheet.md) is the abbreviated working version.

## The three evaluation levels

### 1. Flow

A flow begins with a user intention and ends with a recognizable outcome. Use the flow level for
steps, defaults, waiting, progress, error recovery, completion time, and the quality of the ending.

Examples:

- Start a project through agentic chat -> receive useful structure -> take the first next action.
- Complete onboarding -> create the first project -> arrive on Today knowing what to do.
- Open an AI inbox item -> understand it -> decide -> return to the relevant work.

### 2. Screen or state

A screen is one page, modal, drawer, or materially different state inside a flow. Use this level for
choice count, hierarchy, grouping, chunking, primary-action emphasis, proximity, and progressive
disclosure. Audit empty, loading, partial, error, success, and resumed states—not only the happy-path
screenshot.

### 3. System or component

Use this level for behavior that should be consistent everywhere: interaction feedback, pointer-
appropriate target sizes, form validation, loading language, error structure, focus behavior,
motion, and shared components. Fixing the system is preferable when the same defect appears in
multiple flows.

## The six lenses

### A. Focus and priority

#### 1. Reduce choices per screen

Every visible choice asks the user to compare, predict, and decide. Show the choices needed for the
current decision; defer secondary paths until they become relevant. Do not confuse fewer choices
with fewer capabilities.

Audit question: _What decision is this screen asking the user to make, and which visible options do
not help make it?_

#### 2. Highlight the primary action

Each state should have one visually dominant next action. Secondary actions can remain available,
but they should not compete through equal color, weight, placement, or repeated calls to action.

Audit question: _If the user glances for one second, will they identify the intended next step?_

#### 3. Place key actions near their context

Put actions beside the object or decision they affect. Avoid making users move between content and a
distant toolbar, or remember which item an action will change.

Audit question: _Can the action and its target be understood together without scanning elsewhere?_

#### 4. Put essentials first

Lead with the information and actions needed to orient and proceed. Put supporting context after the
core answer, and place important recurring actions at predictable edges or endpoints.

Audit question: _What must the user know first, and is it actually encountered first?_

#### 5. Reveal complexity gradually

Show the simple, common path first and expose advanced controls when the user asks for them or when
the situation requires them. Keep active selections and consequential hidden state visible.

Audit question: _What can be deferred without hiding the user's current state or a primary action?_

### B. Structure and comprehension

#### 6. Follow familiar patterns

Use established web, platform, and existing BuildOS conventions unless a different interaction
creates a material advantage. Familiar behavior reduces the amount users must learn and remember.

Audit question: _Would a user reasonably predict how this behaves before trying it?_

#### 7. Group related information

Use proximity and shared placement to communicate relationships. Separate unrelated actions even
when they technically fit in the same row or panel.

Audit question: _Do the visual groups match the user's mental groups?_

#### 8. Break content into meaningful chunks

Turn long, undifferentiated content into sections the user can scan and act on. Chunk by meaning or
decision—not merely to create more cards and borders.

Audit question: _Can the user find the relevant part without reading everything?_

#### 9. Simplify complex interfaces

Remove accidental complexity, duplicate paths, repeated metadata, and unnecessary modes. Essential
domain complexity may remain; move it into good defaults, clear sequencing, automation, or the point
where it becomes actionable.

Audit question: _Is this complexity inherent to the user's work, or created by the interface?_

#### 10. Maintain pattern consistency

Elements that look alike should behave alike. Equivalent actions, states, labels, and controls
should keep the same visual and interaction language across routes and modals.

Audit question: _Has the user already learned a pattern elsewhere that we should reuse here?_

#### 11. Connect related elements visually

Use alignment, dividers, containers, lines, shared backgrounds, or repeated geometry when a stronger
relationship must be communicated. Do not add decoration where proximity alone is sufficient.

Audit question: _Is the relationship visible before the user reads the labels?_

### C. Interaction and physical ease

#### 12. Make targets comfortably hittable

Size and space targets for the input context. Coarse-pointer controls should normally provide a
44-by-44 CSS-pixel hit area. Dense fine-pointer interfaces may use smaller visible controls when the
hit area, focus state, and separation remain reliable.

Audit question: _Can this be selected quickly without precision or fear of hitting its neighbor?_

#### 13. Acknowledge interactions within 400 ms

An interaction should visibly acknowledge the user within 400 ms, preferably within 100 ms for
direct manipulation. This is not a promise that every server operation finishes in 400 ms. Long work
must enter a truthful pending state immediately, preserve control where safe, and communicate
progress or the next expected event.

Audit question: _After acting, how quickly can the user tell that BuildOS received the intent?_

#### 14. Reduce task-completion time

Remove redundant steps, repeated data entry, avoidable navigation, and unnecessary confirmation.
Optimize the common path while preserving safe escape hatches for uncommon or consequential cases.

Audit question: _Which step could disappear without reducing understanding, control, or trust?_

### D. Momentum and guidance

#### 15. Show visible progress

When work spans steps or time, show what has happened, what is happening, and what remains. Progress
must reflect real state rather than provide decorative reassurance.

Audit question: _Can the user tell whether they are moving forward, waiting, blocked, or finished?_

#### 16. Make completion feel closer

Break large work into credible milestones, acknowledge completed parts, and keep the next reachable
step visible. Do not manufacture progress by splitting a short task into unnecessary screens.

Audit question: _Does each step reduce uncertainty and make the remaining work feel bounded?_

#### 17. Use sensible defaults

Preselect the safest and most common valid choice using available context. Make the default visible,
explain consequential assumptions, and allow change without forcing every user through setup.

Audit question: _What would BuildOS choose if it were responsibly helping instead of asking?_

### E. Prevention and recovery

#### 18. Prevent errors proactively

Constrain impossible choices, validate at the point of entry, preview consequential changes, and
warn before destructive or irreversible actions. Prefer making errors hard to commit over explaining
them afterward.

Audit question: _What predictable mistake can the interface make impossible or obvious in advance?_

#### 19. Make errors recoverable

Preserve user input, provide retry or undo where appropriate, identify what failed in plain language,
and tell the user what they can do next. A failure in one optional branch should not erase progress
elsewhere in the flow.

Audit question: _After failure, can the user continue without starting over or reconstructing work?_

### F. Finish and continuity

#### 20. End flows memorably

Make success unmistakable. Name what BuildOS understood or created, show the useful result, and offer
one relevant next action. The ending should reinforce the product promise and establish continuity,
not simply display “Done.”

Audit question: _What does the user leave believing happened, and do they know where to go next?_

## BuildOS conflict-resolution rules

When principles pull in different directions, use these rules:

1. Preserve the user's real goal before reducing visible complexity.
2. Preserve clarity and trust before saving a click.
3. Preserve high information density when it improves scanning; remove noise, not useful information.
4. Keep primary actions visible; progressive disclosure is for secondary or advanced controls.
5. Use contextual target sizing rather than inflating every desktop control.
6. A fast acknowledgment with honest progress is better than a frozen interface waiting for completion.
7. Recovery and retained work matter more than a cosmetically clean error state.
8. One issue may implicate several principles; record it once and cite every relevant lens.

## Standard audit record

For each finding, record:

- **Flow and state:** where the user is and what they are trying to achieve.
- **Evidence:** what is visible or observed, including desktop/mobile and alternate states.
- **User cost:** delay, uncertainty, error risk, lost work, abandonment, or trust damage.
- **Principles:** the relevant numbered principles and lens.
- **Smallest credible fix:** copy, layout, interaction, flow, or shared-system change.
- **Measure:** how the result will be verified before and after.

Use three severity levels instead of a numerical UX score:

- **Blocking:** prevents success, loses work, or materially damages trust.
- **Friction:** adds decisions, time, uncertainty, backtracking, or repeated effort.
- **Polish:** improves comprehension and confidence without changing task success.

## Relationship to other BuildOS guidance

- [Inkprint](../technical/components/INKPRINT_DESIGN_SYSTEM.md) defines visual tokens and component language.
- The [Hyperplexed playbook](../technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md)
  provides the detailed region-by-region surface craft rubric.
- The [Hyperplexed audit tracker](../technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md)
  tracks page and component audits.
- Flow audits should live in `apps/web/docs/technical/audits/` and link to relevant surface audits
  instead of duplicating them.
