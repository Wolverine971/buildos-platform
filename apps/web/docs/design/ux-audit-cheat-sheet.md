---
title: 'BuildOS UX Audit Cheat Sheet'
description: 'One-page working guide for reviewing a BuildOS flow, screen, or component'
date_created: '2026-09-09'
date_modified: '2026-09-09'
status: 'active'
category: 'design-system'
tags: [usability, flow-audit, cheat-sheet, review]
related_files:
    - apps/web/docs/design/design-principles-checklist.md
    - apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_DESIGN_PLAYBOOK.md
---

# BuildOS UX Audit Cheat Sheet

Use this during an audit. Read the full
[BuildOS usability and interaction principles](./design-principles-checklist.md) when a finding needs
more interpretation.

## Start with the job

Write one sentence:

> When **[trigger]**, the user wants to **[outcome]**, so they can **[larger purpose]**.

Audit the complete journey, not only the page where it begins.

## Inventory the flow

- Entry points
- Happy path
- Alternate or skip paths
- Empty state
- Loading and long-running states
- Partial-success state
- Error, retry, undo, and resumed states
- Success state
- Return path into the user's work

## Six-lens scan

### Focus

- What decision is this state asking for?
- Is there one obvious primary action?
- Are essentials first and actions beside their targets?
- Can secondary complexity wait?

Principles: **1–5**

### Structure

- Do groups match the user's mental model?
- Is content chunked for scanning rather than decorated with extra containers?
- Do familiar BuildOS patterns behave consistently?
- Are relationships visible through proximity, alignment, or connection?

Principles: **6–11**

### Interaction

- Are targets easy to hit for the current pointer type?
- Is intent acknowledged within 400 ms?
- Can any step, repeated entry, or navigation round trip disappear?

Principles: **12–14**

### Momentum

- Can the user tell what happened, what is happening, and what remains?
- Does each step make the outcome feel closer?
- Has BuildOS chosen a responsible default instead of asking unnecessarily?

Principles: **15–17**

### Safety

- Which likely mistakes can be prevented before submission?
- If something fails, are input and completed work retained?
- Is retry, undo, correction, or a safe exit available?

Principles: **18–19**

### Finish

- Is success unmistakable?
- Does the ending show what BuildOS understood or created?
- Is there one relevant next action back into useful work?

Principle: **20**

## Useful thresholds

- **Primary actions:** one dominant action per state; secondary actions must not visually compete.
- **Touch targets:** normally 44 by 44 CSS pixels for coarse pointers; preserve deliberate density
  for fine pointers while keeping hit areas and focus states reliable.
- **Feedback:** acknowledge direct interaction preferably within 100 ms and no later than 400 ms.
- **Long work:** enter a truthful pending state immediately; show progress or the next expected event.
- **User input:** never discard it because of navigation, retry, OAuth, refresh, or an optional failure.
- **Errors:** say what failed, what was preserved, and what the user can do next.
- **Success:** say what changed, show the useful result, and offer one next step.
- **Progressive disclosure:** hide secondary controls, not active state or the primary path.

## Measure before and after

- Number of visible decisions per state
- Actions and navigation steps to the outcome
- Time to visible acknowledgment
- Time to useful outcome
- Backtracks, repeated entry, and dead ends
- Input or progress lost on interruption
- Error recovery steps
- Whether users can identify success and the next action without explanation

## Record findings

```text
[Blocking | Friction | Polish] Flow / state
Evidence:
User cost:
Principles:
Smallest credible fix:
Before/after measure:
```

Do not assign an overall UX score. Fix findings in this order:

1. Lost work, blocked completion, and trust failures
2. Repeated friction in high-frequency or activation-critical flows
3. Shared-system fixes that improve several flows
4. Local clarity and polish
