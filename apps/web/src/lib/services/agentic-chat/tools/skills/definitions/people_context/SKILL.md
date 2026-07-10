---
name: People Context
catalog_line: 'Profile and contact context: lookup, search and updates, candidate resolution, sensitive-value handling.'
description: People context playbook for profile lookup, contact search and updates, candidate resolution, and safe handling of sensitive contact values.
skill_type: procedure # procedure | strategy | reference | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - util.people.skill
    - people.skill
    - contacts.skill
    - profile.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/people_context/SKILL.md
---

# People Context

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure, so the Procedure runbook carries the weight; Judgment holds the two
  standing boundary/confirmation principles. It routes to no sibling skill (standalone), so there is no Routing
  block, and it grounds no schema/taxonomy, so there is no Knowledge block.
-->

## Identity

People context playbook for profile lookup, contact search and updates, candidate resolution, and safe handling
of sensitive contact values. This is a **procedure** skill at **task** altitude: an ordered runbook for the
BuildOS people/contact surface.

## Activation

- Use user profile context when personalization matters
- Look up a person or contact record
- Create or update contact details
- Resolve duplicate or ambiguous contact candidates
- Link a person/contact record to another entity safely

## Judgment

- Profile context and contact data are different surfaces: profile is about the user; contacts are about people records.
- People workflows often fail from overconfidence. Prefer explicit confirmation over silent merging.

## Procedure

1. Decide whether you need profile context, a contact lookup, a candidate-resolution workflow, or an entity link.
2. Use util.profile.overview only when personalization or user context materially matters; profile data is not preloaded.
3. For people lookups, search first and inspect the returned matches before writing anything.
4. If identity is uncertain or duplicates exist, use the contact candidate tools before assuming records should merge.
5. Only request raw phone or email values when the user explicitly asks for exact details.
6. For contact linking, choose the link type first, then pass exact target IDs.
7. For candidate resolution, only use confirmed merge actions when the user has clearly confirmed the records represent the same person.
8. After execution, explain what was found or changed and note when sensitive values were intentionally withheld.

## Contract

After a people or contact action, report:

- What was found or changed: the contact/person record and the specific fields, links, or merges applied.
- Redaction state: explicitly note when sensitive values (phone, email) were withheld by default, and that they can be disclosed on request.
- For candidate resolution: which records were compared and why a merge was or was not performed.

Stop conditions before replying: no two records were merged on name similarity alone; no confirmed-merge action ran without explicit user confirmation; sensitive values were disclosed only when the user explicitly asked; contact link and candidate-resolve used exact IDs.

## Policy

- Do not assume two records are the same person based only on name similarity.
- Contact values are redacted by default; do not request sensitive values unless the user explicitly wants them.
- Do not use confirmed merge actions without explicit user confirmation.
- Use exact IDs for contact link and candidate resolution operations.

## Related Tools

- `util.profile.overview`
- `util.contact.search`
- `util.contact.upsert`
- `util.contact.candidates.list`
- `util.contact.candidate.resolve`
- `util.contact.link`

## Examples

### Find a contact and disclose exact contact details only when asked

- Use util.contact.search first to find the right record.
- If the user wants exact email or phone data, re-run with the appropriate sensitive-value options only after confirming that need.
- Summarize the result and keep redaction behavior explicit.

### Resolve duplicate contact candidates safely

- Use util.contact.candidates.list to inspect likely duplicates.
- Ask for confirmation if the merge decision is not already explicit from the user.
- Use util.contact.candidate.resolve only after the intended action is clear.

## Provenance

- `internal-default` — BuildOS people/contact handling playbook; no external source cited. Both Judgment
  principles (surface distinction; confirm-over-merge) are BuildOS reasoned defaults.
