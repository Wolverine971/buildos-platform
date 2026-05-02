---
skill_id: lead-list-research-with-claude-code
name: Lead List Research With Claude Code
description: Build and refine B2B lead lists with an AI agent in the loop. Use when sourcing accounts, defining an ICP, scoring prospect fit, finding personas, enriching contacts, or turning a messy market into a qualified outbound list.
skill_type: combo
categories:
    - sales-and-growth
    - technology-and-agent-systems
path: docs/research/youtube-library/skill-drafts/lead-list-research-with-claude-code/SKILL.md
---

# Lead List Research With Claude Code

Use this skill to help an agent build a qualified lead list through iterative research, scoring, exclusions, and contact sourcing. The goal is not to automate judgment away. The goal is to coordinate research agents, tools, and human review until the list reflects a real market opinion.

## When to Use

- Build an account list from a target market or lookalike customer
- Turn closed-won customers into an ICP search pattern
- Score companies for fit and explain why they qualify
- Find buyer personas or titles for qualified accounts
- Debug noisy lists with agencies, resellers, enterprise accounts, or wrong-fit categories
- Create a repeatable outbound campaign source list

Do not use this skill when the user only needs a simple contact lookup, a generic scraping job, or a list with no qualification criteria.

## Inputs

- Offer or product being sold
- Target market hypothesis
- Closed-won examples or ideal customer URLs if available
- Firmographic limits such as geography, employee count, stage, industry, or budget
- Exclusion patterns from prior bad lists
- Contact persona assumptions
- Source tools available, such as search, CRM export, enrichment CLI, or spreadsheet

## Core Workflow

1. **Start from the market thesis.** Restate what the user believes is true about the target market and why those accounts may buy.
2. **Find candidate accounts.** Use lookalikes, category search, domain search, directories, maps, or CRM patterns. Keep the first pull broad enough to expose noise.
3. **Inspect the first batch.** Classify strong fit, marginal fit, and bad fit. Report the failure patterns, not just the final rows.
4. **Anneal the ICP.** Tighten inclusion and exclusion rules one variable at a time: employee count, category, business model, product type, geography, funding, website language, or technical signals.
5. **Create a scoring prompt.** Score each account from 1 to 10 with fit reasoning. Define the threshold for qualified accounts before scaling.
6. **Spot-check before scaling.** Test the scoring prompt on a small sample. Ask the user to confirm borderline judgments.
7. **Source contacts by persona tier.** Identify likely titles by inspecting real companies. Use role tiers instead of seniority alone.
8. **Make enrichments durable.** Save progress as rows are found so partial failures do not erase the run.
9. **Review the finished list.** Summarize total accounts, qualified accounts, contacts found, reasons for qualification, and remaining noise risks.

## ICP Scoring Rules

- Score the account, not just the industry label.
- Require a short reason for every score.
- Treat 7+ as qualified only if the user agrees.
- Track false positives and update exclusions.
- Use homepage evidence when categories are ambiguous.
- Watch for agencies, resellers, consultants, media sites, marketplaces, wholesalers, and enterprises that exceed the intended segment.
- Do not use employee count as a universal budget proxy; some small companies are high-intent when the niche is capital-intensive.

## Persona Rules

- Identify likely buyers from actual company patterns, not generic title lists.
- Split personas into tiers such as owner/founder, operator, technical lead, revenue leader, or department head.
- Account for company size: founder at small orgs, VP or director at larger orgs.
- Avoid seniority as the only selector. Titles vary by market.
- Always get at least one plausible contact per qualified account when possible.

## Human In The Loop

Ask for user judgment when:

- The exclusion rule could remove valid accounts
- The market has several plausible subsegments
- The account fit depends on hidden budget or timing
- The scoring prompt returns high confidence for examples the user dislikes
- The list is being used for paid sending or high-volume outbound

## Output

Return:

- market thesis
- inclusion rules
- exclusion rules
- scoring rubric
- qualified account count
- marginal account count
- contact persona tiers
- contact count
- examples of accepted and rejected accounts
- recommended next test

## Source Attribution

Distilled from Mitchell Keller's video [Building Perfect Lead Lists With Claude Code](https://www.youtube.com/watch?v=ESIxitOLYoQ), with local transcript notes at `docs/marketing/growth/research/youtube-transcripts/2026-04-24_mitchell-keller_lead-lists-claude-code.md`.
