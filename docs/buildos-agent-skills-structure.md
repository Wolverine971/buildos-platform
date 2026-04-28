<!-- docs/buildos-agent-skills-structure.md -->

# BuildOS Agent Skills Repository Structure

This document summarizes the structure used by the AITMPL skills catalog and adapts it into a BuildOS-neutral design. The goal is to preserve compatibility with the emerging Agent Skills pattern while avoiding any Claude-specific assumptions.

## Reference Model

AITMPL's skills catalog is a web UI backed by a GitHub repository:

- Catalog: <https://www.aitmpl.com/skills/>
- Repository: <https://github.com/davila7/claude-code-templates>
- Skill root: <https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/skills>

The website is mainly a browser and installer interface. The actual skills live in the repository under:

```txt
cli-tool/components/skills/
```

At the time of research, the repository tree contained 831 `SKILL.md` files under that path. Public docs and marketing pages sometimes show older or inconsistent counts, so the GitHub tree should be treated as the source of truth.

## Core Pattern

A skill is a portable package of agent instructions plus optional supporting resources.

The required file is:

```txt
SKILL.md
```

Optional supporting directories are:

```txt
references/
scripts/
assets/
```

Each piece has a distinct job:

```txt
SKILL.md     Agent-readable instructions and trigger metadata
references/  Detailed docs loaded only when needed
scripts/     Deterministic helper programs the agent can run
assets/      Templates, images, schemas, examples, fonts, or other static resources
```

The design keeps the initial agent context small. The agent only needs the skill name and description during discovery. It loads the full `SKILL.md` only when the task appears relevant, and it loads references or runs scripts only when the skill instructions call for them.

## AITMPL Repository Layout

AITMPL organizes skills by category:

```txt
cli-tool/components/skills/
├── development/
├── scientific/
├── ai-research/
├── business-marketing/
├── creative-design/
├── security/
├── web-development/
├── workflow-automation/
└── utilities/
```

Inside each category, each skill gets its own folder:

```txt
cli-tool/components/skills/{category}/{skill-name}/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Not every skill has every optional folder. Many skills are only a `SKILL.md`. More operational skills include references and scripts.

## Example: Design Mirror

AITMPL's `design-mirror` skill lives at:

```txt
cli-tool/components/skills/web-data/design-mirror/
```

Its structure:

```txt
design-mirror/
├── SKILL.md
├── scripts/
│   ├── screenshot.sh
│   └── scrape_html.sh
└── references/
    ├── apply-guide.md
    ├── capture-guide.md
    └── css-extraction.md
```

The `SKILL.md` explains when the skill should trigger, what it does, and the sequence the agent should follow:

1. Capture the inspiration site with screenshot and HTML scrape scripts.
2. Extract design tokens from the screenshot and CSS.
3. Build a design token map.
4. Inspect the user's codebase.
5. Apply the design language without copying the original site.
6. Report what changed.

This is a good example of a full skill: it has high-level workflow instructions, deterministic scripts, and deeper reference docs.

## Example: Code Reviewer

AITMPL's `code-reviewer` skill lives at:

```txt
cli-tool/components/skills/development/code-reviewer/
```

Its structure:

```txt
code-reviewer/
├── SKILL.md
├── scripts/
│   ├── code_quality_checker.py
│   ├── pr_analyzer.py
│   └── review_report_generator.py
└── references/
    ├── code_review_checklist.md
    ├── coding_standards.md
    └── common_antipatterns.md
```

The `SKILL.md` tells the agent when to use the skill for pull request review, code feedback, issue identification, and code quality standards. The scripts provide repeatable checks, while the references provide checklists and review standards.

## SKILL.md Format

The core file uses YAML frontmatter followed by Markdown instructions:

```md
---
name: design-mirror
description: Replicate the visual style of any website and apply it to your existing codebase. Use this skill whenever the user wants to match a site's design, mirror a UI aesthetic, make their app look like another site, or replicate a specific visual style from a URL.
---

# Design Mirror

Instructions go here...
```

For a portable BuildOS-compatible skill, the minimum required fields should remain:

```yaml
name: string
description: string
```

The `description` field is important because it is not just human-facing documentation. It is the agent's primary trigger surface.

Good description:

```yaml
description: Review pull requests and code changes for bugs, security issues, maintainability, and test gaps. Use when the user asks for code review, PR review, diff analysis, or quality feedback.
```

Weak description:

```yaml
description: Helps with code.
```

A good skill description should include:

- What the skill does
- When the agent should use it
- Trigger phrases or task contexts
- Important domain keywords

## Optional BuildOS Metadata

To stay cross-agent compatible, keep `SKILL.md` close to the open Agent Skills format. Put BuildOS-specific marketplace and runtime metadata in a separate file.

Recommended:

```txt
SKILL.md       Portable agent skill
buildos.yaml   BuildOS-specific metadata
```

Example:

```yaml
id: development/code-reviewer
version: '1.0.0'
author: buildos
license: MIT
tags:
    - development
    - code-review
    - quality
requires:
    tools:
        - python3
    env: []
permissions:
    network: false
    filesystem: workspace
    shell: true
ui:
    display_name: Code Reviewer
    short_description: Review diffs, PRs, and code quality.
    default_prompt: Review this pull request for bugs, maintainability, security, and test gaps.
```

This separation matters:

- `SKILL.md` should work across compatible agents.
- `buildos.yaml` can contain BuildOS-specific install, UI, permission, versioning, and registry behavior.

## BuildOS Repository Proposal

A BuildOS skill repository could use this structure:

```txt
buildos-skills/
├── registry.json
├── skills/
│   ├── development/
│   │   └── code-reviewer/
│   │       ├── SKILL.md
│   │       ├── buildos.yaml
│   │       ├── scripts/
│   │       ├── references/
│   │       └── assets/
│   └── web-data/
│       └── design-mirror/
│           ├── SKILL.md
│           ├── buildos.yaml
│           ├── scripts/
│           └── references/
└── tools/
    ├── validate-skill
    ├── index-skills
    └── package-skill
```

The `skills/` directory is the canonical source. `registry.json` is generated from the skill folders.

## Skill Identity

AITMPL uses category paths for install commands:

```bash
npx claude-code-templates@latest --skill web-data/design-mirror
npx claude-code-templates@latest --skill development/code-reviewer
```

BuildOS should use stable, client-neutral skill identifiers:

```txt
development/code-reviewer
web-data/design-mirror
security/security-audit
```

Possible fully qualified forms:

```txt
buildos://skills/development/code-reviewer
@buildos/development/code-reviewer
```

The `name` in `SKILL.md` should match the skill folder basename:

```txt
skills/development/code-reviewer/SKILL.md
```

```yaml
name: code-reviewer
```

The registry ID can include the category:

```json
{
	"id": "development/code-reviewer",
	"name": "code-reviewer",
	"category": "development"
}
```

## Catalog Generation

AITMPL appears to generate the website catalog by scanning each `SKILL.md`, extracting metadata, and showing the file tree and install command.

BuildOS can follow this indexing flow:

1. Scan `skills/**/SKILL.md`.
2. Parse YAML frontmatter.
3. Validate `name`, `description`, path, and optional metadata.
4. Read `buildos.yaml` if present.
5. Build a normalized registry JSON.
6. Render web catalog pages.
7. Generate install commands.

Example registry item:

```json
{
	"id": "development/code-reviewer",
	"name": "code-reviewer",
	"category": "development",
	"description": "Review pull requests and code changes for bugs, security issues, maintainability, and test gaps.",
	"source": "github.com/buildos/skills/tree/main/skills/development/code-reviewer",
	"files": [
		"SKILL.md",
		"buildos.yaml",
		"scripts/pr_analyzer.py",
		"references/code_review_checklist.md"
	],
	"install": "buildos skills add development/code-reviewer"
}
```

## Installation Model

AITMPL installs skills into Claude's local skill directory:

```txt
.claude/skills/{skill-name}/
```

BuildOS should avoid client-specific locations. Recommended scopes:

```txt
Project-local: .buildos/skills/
Portable:      .agents/skills/
User-global:   ~/.buildos/skills/
Portable user: ~/.agents/skills/
```

Recommended install commands:

```bash
buildos skills add development/code-reviewer
buildos skills add web-data/design-mirror --scope project
buildos skills add security/security-audit --scope user
buildos skills add scientific/datacommons-client --scope portable
```

Install output should copy the entire skill folder:

```txt
.buildos/skills/code-reviewer/
├── SKILL.md
├── buildos.yaml
├── scripts/
└── references/
```

For cross-agent compatibility, BuildOS may also support installing to:

```txt
.agents/skills/code-reviewer/
```

## Runtime Discovery

At startup, a BuildOS-compatible agent should scan known skill directories:

```txt
./.buildos/skills/
./.agents/skills/
~/.buildos/skills/
~/.agents/skills/
```

Discovery should follow progressive loading:

1. Find skill directories containing `SKILL.md`.
2. Read only the YAML frontmatter.
3. Build an available-skills catalog from `name` and `description`.
4. Match user tasks against the catalog.
5. Load the full `SKILL.md` when relevant.
6. Load references or run scripts only when the active skill calls for them.

This lets many skills be available without loading every skill's full instructions into context.

## Progressive Disclosure

The progressive disclosure model has three levels:

```txt
Level 1: Catalog
Loaded at startup:
- name
- description

Level 2: Instructions
Loaded when the skill triggers:
- full SKILL.md body

Level 3: Resources
Loaded or executed only when needed:
- references/
- scripts/
- assets/
```

This is the core reason skills scale. Hundreds of skills can be installed, but only a small metadata catalog needs to be present upfront.

## Security Model

Skills may include executable scripts, so BuildOS should treat third-party skills as code.

Recommended safeguards:

- Show the file tree before install.
- Preview `SKILL.md` before install.
- Highlight scripts before install.
- Validate frontmatter and file paths.
- Scan for dangerous commands.
- Require explicit permissions for network, shell, environment variables, and filesystem writes.
- Sandbox script execution.
- Pin installs to a source commit or version.
- Record provenance.
- Support lockfiles for installed skill versions.

Example lockfile entry:

```json
{
	"id": "development/code-reviewer",
	"source": "github.com/buildos/skills",
	"path": "skills/development/code-reviewer",
	"commit": "abc123",
	"installed_at": "2026-04-27T00:00:00Z",
	"permissions": {
		"shell": true,
		"network": false,
		"filesystem": "workspace"
	}
}
```

## Validation Rules

BuildOS should validate at least:

- `SKILL.md` exists.
- YAML frontmatter parses.
- `name` exists.
- `description` exists.
- `name` is lowercase kebab-case.
- Folder basename matches `name`.
- Description is specific enough to trigger.
- Optional `buildos.yaml` parses.
- Referenced files exist.
- Scripts are inside the skill folder.
- No unexpected symlinks or path traversal.

Suggested naming rules:

```txt
name:
- lowercase letters, numbers, and hyphens
- no spaces
- no underscores
- no leading or trailing hyphen
- no duplicate names within the same install scope
```

## BuildOS CLI Surface

Suggested CLI commands:

```bash
buildos skills search code-review
buildos skills show development/code-reviewer
buildos skills preview development/code-reviewer
buildos skills add development/code-reviewer
buildos skills add development/code-reviewer --scope project
buildos skills add development/code-reviewer --scope user
buildos skills list
buildos skills update development/code-reviewer
buildos skills remove development/code-reviewer
buildos skills validate ./skills/development/code-reviewer
buildos skills index
```

`preview` should be strongly encouraged before installing third-party skills.

## BuildOS Web Catalog

A BuildOS skills website can mirror the AITMPL pattern:

- Browse by category.
- Search by name, description, and tags.
- Show install command.
- Show `SKILL.md` preview.
- Show file tree.
- Show scripts and permissions.
- Show source repo and commit.
- Show compatibility.
- Show examples.
- Allow stack/bundle building.

For each skill page, include:

```txt
Name
Category
Description
Install command
Source link
Files
Permissions
Dependencies
Usage examples
Version/provenance
```

## Recommended BuildOS Principles

1. Keep `SKILL.md` portable.
2. Put BuildOS-specific metadata in `buildos.yaml`.
3. Use category paths for catalog organization.
4. Use `name` and `description` for discovery and triggering.
5. Keep `SKILL.md` concise.
6. Move detailed docs into `references/`.
7. Put repeatable or fragile operations into `scripts/`.
8. Treat scripts as untrusted code until reviewed.
9. Support both BuildOS-native and cross-agent install directories.
10. Generate the public catalog from the repository, not by hand.

## Sources

- AITMPL skills catalog: <https://www.aitmpl.com/skills/>
- AITMPL installing components docs: <https://docs.aitmpl.com/guides/installing-components>
- AITMPL GitHub repository: <https://github.com/davila7/claude-code-templates>
- AITMPL skills folder: <https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/skills>
- Agent Skills specification: <https://agentskills.io/specification>
