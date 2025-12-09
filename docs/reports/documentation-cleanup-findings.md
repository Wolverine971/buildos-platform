---
title: Documentation Cleanup Findings
date: 2025-11-07
author: Codex Agent
path: docs/reports/documentation-cleanup-findings.md
---

# BuildOS Documentation Cleanup Findings

## Overview

- Surveyed the root `README`, `/docs` hub, and representative feature/API specs.
- Focused on structural issues (encoding, navigation drift, missing entry points, redundant specs) that make the doc set hard to trust.
- The items below are the highest-impact cleanups to unblock future contributors.

## Findings

### 1. Encoding corruption across key entry docs

- `README.md:8-15` shows the repo tree with characters like `�"o�"?` instead of ASCII `├──`, and the Design/API standards bullets at `README.md:86-95` use `�o.` making the requirements unreadable.
- `docs/README.md:3-45` (the monorepo doc hub) renders headings such as `## dY?-` and bullets like `�o.`/`�?O`, so the primary navigation page looks broken.
- API/ops docs inherit the same corruption: `docs/api/agent-chat-implementation.md:26-47` contains `�+"` placeholders inside the streamed flow diagram, `docs/operations/worker/README.md:5` shows `���` inside the only list item, and `docs/archive/README.md:5` has the same issue. The SMS feature spec repeats the pattern in `docs/features/sms-event-scheduling/README.md:22-35`.
- Impact: copy/paste of these docs into issue trackers or external tools fails, and the documents are hostile to screen readers. We need to re-encode affected files as UTF-8 and replace special tree/bullet characters with plain ASCII.

### 2. Navigation files reference paths that do not exist

- `README.md:104-110` links to `./docs/ARCHITECTURE.md` and `./MIGRATION_GUIDE.md`, but those files are missing (only `/docs/architecture/` exists). Readers hit immediate 404s when trying to follow setup links.
- `docs/README.md:20-31` lists folders like `/audits/` and `/research/` that are not present under `/docs`, while omitting real directories such as `/api/`, `/features/`, `/reports/`, and `/technical/`. The mismatch makes the supposedly authoritative index unreliable.
- `docs/business/README.md:8-25` promises `/product/`, `/marketing/`, `/sales/`, and `/fundraising/` subfolders, yet the directory only contains `/strategy` and `/war-room`. It is unclear where business collaborators should place new material.
- `docs/marketing/INDEX.md:289` links to `../start-here.md` and `../development/`, neither of which exist under `/docs`. These dead links are at the bottom of a 290-line index that otherwise serves as the marketing table of contents.
- Action: rewrite each navigation list so it mirrors `Get-ChildItem docs`, add missing folders (if they should exist), or intentionally deprecate the references. Consider adding a CI check that validates internal links.

### 3. Required folder READMEs are missing

- The documentation playbook explicitly asks contributors to ensure every folder has a README before adding content (`docs/DOCUMENTATION_GUIDELINES.md:300`), but several top-level collections break that rule.
- `/docs/api`, `/docs/operations`, and `/docs/technical` each contain valuable references yet have no landing page (`README.md`), so there is no explanation of scope, ownership, or how files are organized inside those folders.
- Without these entry points, new writers do not know where to add new endpoint references, operational runbooks, or technical specs, and LLM agents cannot route updates correctly. Add short README/INDEX files for each folder that describe purpose, expected sub-structure, and cross-links to related app-specific docs.

### 4. Agent chat specs are duplicated and overlapping

- There are four separate, partially redundant specs for the same feature: the high-level API doc (`docs/api/agent-chat-implementation.md:13-79`) plus three near-duplicate implementation guides inside `docs/technical/implementation/` (`AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC*.md:1-40`).
- Two of the implementation files cover “Phases 2-5” and “Phases 3-5”, so they overlap and disagree on what remains to be done. None references the canonical status in `README.md` or links to tests.
- This sprawl makes it impossible to know where to update the feature. Consolidate into a single living spec (with a change log), demote historical drafts into `/docs/archive/`, and ensure the API doc links to the implementation plan instead of re-explaining it.

## Recommended next steps

1. Batch-reencode affected Markdown files to UTF-8 (replace fancy tree/bullet glyphs with ASCII) and add this check to linting so corruption does not creep back in.
2. Refresh root-level navigation (repo `README`, `docs/README`, `docs/business/README`, `docs/marketing/INDEX`) so that every listed path actually exists, and add placeholders or archive stale sections.
3. Create README/INDEX files for `/docs/api`, `/docs/operations`, and `/docs/technical`, following the checklist in `docs/DOCUMENTATION_GUIDELINES.md:300`.
4. Merge the four agent chat specs into one maintained document, link it from the API reference, and move obsolete phase write-ups into `/docs/archive/` with a short note.
