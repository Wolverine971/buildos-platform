---
name: create-skill
description: Create, update, or refactor a Claude Code skill — scoped to BuildOS conventions. Use when the user says "create a skill", "add a skill for X", "update the X skill", "split this skill", "heal this skill", or needs to decide between a skill, command, or agent for a new capability. Teaches how to design the frontmatter trigger, body structure, and `references/` split, and includes the BuildOS rules (location, naming, size, no custom frontmatter fields).
---

# Create Skill — BuildOS

You are helping another instance of Claude author a skill that *a future* Claude will use. Everything you write is prompt payload — treat it that way.

This skill has two jobs:

1. **Teach** the fundamentals of skill design (frontmatter, progressive disclosure, degrees of freedom).
2. **Enforce** BuildOS-specific rules (where skills live, what frontmatter fields work in this harness, how skills integrate with our commands).

For deeper upstream guidance there's also `compound-engineering:create-agent-skills` — reach for it if the skill is exotic. For everyday BuildOS skill work, this file is enough.

---

## 0. Decide: skill, command, or agent?

Most "I should add a skill for X" requests aren't skill-shaped. Check first:

| If the capability is… | Use |
|---|---|
| **Reusable procedural knowledge** loaded on demand (how to navigate a tool, read a schema, run a browser flow, use an API) | **Skill** |
| A **named, user-triggered workflow** with a specific beginning and end (`/fix-bug`, `/project-cleanup`, `/twitter-warmup`) | **Command** (`.claude/commands/<name>.md`) |
| A **persona or role** invoked via the Task tool (growth-analyst, content-editor, accessibility-auditor) | **Agent** (`.claude/agents/<name>.md`) |

Right-sizing signals that point to **skill**:
- You're about to copy-paste the same "how to do X" section into more than one command or agent.
- Future Claudes across sessions will need the same procedural knowledge.
- The content has a clean branching factor ("if you're doing A read this; if B read that") that fits progressive disclosure.

If the capability is really one-shot or only used by a single command, just inline it in the command and move on.

---

## 1. Skill anatomy

```
.claude/skills/<skill-name>/
├── SKILL.md            # required — frontmatter + lean body
├── references/         # optional — detail loaded only when SKILL.md points to it
│   └── <topic>.md
├── scripts/            # optional — deterministic code (.py / .sh) the skill calls
│   └── <task>.py
└── assets/             # optional — files the skill outputs (templates, images, fonts)
    └── …
```

Three tiers of loading — this is the key mental model:

| Tier | What | When loaded | Budget |
|---|---|---|---|
| **Metadata** | `name` + `description` in frontmatter | Always, on every conversation | ≈ 100 words — keep description sharp |
| **Body** | The rest of SKILL.md | Only when the skill is triggered | Aim under ~200 lines for BuildOS skills |
| **Bundled resources** | Files in `references/`, `scripts/`, `assets/` | Only when the body tells Claude to load them | Effectively unlimited — scripts don't even have to be read |

Every byte in the first tier is paid on every request. Every byte in the body is paid on every triggered invocation. Every byte in bundled resources is paid only when needed. Design accordingly.

---

## 2. Frontmatter — the only trigger

```yaml
---
name: <kebab-case; must match directory name>
description: <what the skill does + explicit when-to-use signal, in one sentence or two>
---
```

**That's it.** This harness ignores extra fields. Do not add any of these:

- `model:` — skills don't set the model.
- `path:` — not a real field.
- `version:` — not read.
- `tools:` / `allowedTools:` — these are agent fields, not skill fields.

**Description rules** (this is the single most important thing you'll write):

- Front-load with **what the skill does** ("Browser automation for X", "Query the BuildOS Supabase database").
- Include **when to use it** — user phrasings, verbs, scenarios. This is the only signal Claude has for whether to load the skill.
- Include **what it deliberately doesn't do**, if that's non-obvious.
- Imperative / declarative voice, not marketing.
- One or two sentences. If you need more, you're probably packing body content into metadata — stop.

**Good:**
> "Browser automation for LinkedIn. Use when navigating LinkedIn, searching posts or profiles, reading notifications, posting, commenting, messaging, or running LinkedIn warmup tasks. Critical for any flow that must capture direct post URLs."

**Bad:**
> "LinkedIn stuff." (No when-to-use signal; won't trigger reliably.)
> "Comprehensive, best-in-class LinkedIn skill that transforms Claude into…" (Marketing voice; wastes the metadata budget.)

---

## 3. Body — lean by default

SKILL.md body loads after the skill triggers. Keep it focused on **procedural knowledge a fresh Claude would need** to do the job and would not already know.

Default skeleton (adapt, don't mechanically copy):

```markdown
# <Skill Name>

<One-line scope: what this covers; what it defers to references/.>

## Prerequisites
<env vars, auth, tools assumed>

## Core workflow / quick reference
<the 3–7 step procedure or quick-action cheat sheet>

## Non-obvious rules / gotchas
<things a smart Claude still wouldn't know without having done this before>

## When to read references/<file>.md
<explicit trigger conditions per reference file>

## Integrations in this repo
<which commands or agents load this skill, so updates to the skill don't break callers>
```

Things to **not** include in the body:

- Philosophical intros about what skills are.
- Copy-pasted content that lives in another file Claude can read (link to it instead).
- Setup instructions for the skill author (those go in a PR description, not the skill).
- `README.md`, `CHANGELOG.md`, `INSTALLATION.md`, `QUICK_REFERENCE.md` as separate files inside the skill — they're clutter. Every file in a skill should be one Claude will eventually read.

---

## 4. Degrees of freedom

Match the specificity of your instructions to how much the task actually varies:

| Freedom | When to use it | Form |
|---|---|---|
| **High** | Many valid approaches; depends on context; heuristic judgement wins | Prose guidance, principles, examples |
| **Medium** | A preferred pattern with local variation | Pseudocode, templates with placeholders |
| **Low** | Fragile, error-prone, strict sequence required | Exact commands, scripts, literal code |

BuildOS skills so far:
- `twitter`, `linkedin`, `instagram` — **low** for selectors + URL patterns, **high** for engagement judgement.
- `supabase` — **medium** for query patterns, **low** for safety rules around admin client usage.

Don't pick "low freedom everywhere" as a default. Over-prescribed skills rot faster than the code they describe.

---

## 5. Progressive disclosure — when to use `references/`

A skill over ~200 lines is a signal, not a rule. Reach for `references/` when:

- The skill has **distinct domains** that rarely apply together. (e.g. `bigquery/reference/finance.md`, `sales.md`, `product.md` — a revenue question doesn't need the sales schema loaded.)
- There are **variants or frameworks** inside one domain. (e.g. `cloud-deploy/references/aws.md`, `gcp.md`, `azure.md`.)
- There's **reference material you want Claude to grep rather than pre-read** — long tables, full API surfaces, selector catalogs.

### Pattern A — high-level guide + on-demand references

```markdown
# X Skill

Quick start: <5-line core flow>

## When to read references/
- `workflows.md` — exact click sequences and selectors
- `edge-cases.md` — auth failures, rate limits, stale selectors
```

Claude only loads `workflows.md` when SKILL.md tells it to. The twitter / linkedin / instagram skills use this pattern.

### Pattern B — domain split

```
skill-name/
├── SKILL.md          # overview + which file to load for which domain
└── references/
    ├── finance.md
    ├── sales.md
    └── product.md
```

### Pattern C — conditional detail

```markdown
For simple edits, modify the XML directly.

**For tracked changes**: see references/redlining.md
**For OOXML details**: see references/ooxml.md
```

**Rules of thumb:**
- Don't nest — keep `references/` one level deep from SKILL.md.
- If a reference file is longer than ~100 lines, put a 3-line table of contents at the top so Claude can see the shape before reading.
- Don't duplicate content between SKILL.md and a reference. If it's in a reference, SKILL.md just points; it doesn't repeat.
- Every reference file should be mentioned in SKILL.md with an explicit "read this when…". Orphan references are invisible.

---

## 6. `scripts/` and `assets/`

- **`scripts/`** — deterministic code, usually Python or Bash, that the skill can call via `Bash(…)`. Use when you're about to explain the same code for the 3rd time or when reliability beats creativity. Example: a PDF rotation helper, a JSON validator. Claude can execute these without loading them into context. Still test them before shipping.
- **`assets/`** — templates, boilerplate, fonts, logos, sample docs. Files the skill **outputs or modifies**, not reads as context. Example: a starter HTML template, a brand logo.

Most BuildOS skills today don't need either — they're reference-only. Don't add empty directories.

---

## 7. BuildOS-specific conventions

### Location and naming

- All project skills live under `.claude/skills/<name>/`. Nothing outside that path is picked up as a project skill.
- Directory name = `name:` field = kebab-case, no underscores.
- If there's any chance of collision with a plugin skill (e.g. our enabled `compound-engineering:skill-creator`), prefix with `buildos-` — e.g. `buildos-supabase-ops`. Check the active skill list before picking a name.

### Size targets

- SKILL.md: **aim under ~200 lines**, hard-cap around 300. Past that, split.
- Description: **one or two sentences**, not a paragraph.
- Reference file: whatever size makes sense for the domain — longer is fine here.

### Integrations

Skills in this repo are usually loaded by commands. When you create a skill, update the command(s) that will use it so the reference is explicit:

```markdown
Before interacting with <platform>, load `.claude/skills/<skill-name>/SKILL.md`.
```

Conversely, when you edit an existing skill, grep for any command that references it and check whether the contract still holds.

### Don't duplicate plugin skills

`compound-engineering:create-agent-skills` and `compound-engineering:skill-creator` are already enabled. Writing a project-local skill that does the same generic thing is pure duplication. Project-local skills earn their keep by being **BuildOS-opinionated**.

---

## 8. Authoring workflow

1. **Confirm use case**: run through §0 with the user. Verify skill is the right shape.
2. **Sketch the trigger**: write the `description:` first, out loud, and read it back. If a fresh Claude looking only at that line can't tell *when* to invoke this skill, keep sharpening.
3. **Draft the body**: use the skeleton in §3. Stay under ~200 lines. Note which parts might want references/.
4. **Split into references** where §5 patterns apply. Link each reference from SKILL.md with an explicit "read when…".
5. **Wire into callers**: update the commands / agents that should load this skill to say so.
6. **Smoke-test the trigger**: in a fresh conversation, ask Claude something that should invoke the skill. If it doesn't load, the description is the problem — refine it.
7. **Iterate on real usage**, not imagined usage. The first version will be wrong somewhere; that's fine.

---

## 9. Minimum viable skill checklist

Before declaring done:

- [ ] `name:` in frontmatter matches the directory name exactly (kebab-case, no underscores).
- [ ] `description:` includes both *what* and *when to trigger*. No marketing voice.
- [ ] No extra frontmatter fields (`model:`, `path:`, `version:`, `tools:` — none of these work).
- [ ] SKILL.md body is under ~200 lines; longer detail is in `references/`.
- [ ] Every `references/*.md` is linked from SKILL.md with an explicit read-when trigger.
- [ ] No `README.md` / `CHANGELOG.md` / `INSTALLATION.md` inside the skill.
- [ ] No collision with enabled plugin skills (check active skill list).
- [ ] All commands / agents that depend on this skill reference it by path.
- [ ] You tested the trigger in a fresh conversation — it loaded when it should, skipped when it shouldn't.

---

## 10. Existing BuildOS skills (as of 2026-04-16)

| Skill | Shape | Pattern |
|---|---|---|
| `twitter`, `linkedin`, `instagram` | Browser-automation workflows (each has `references/workflows.md`) | Pattern A |
| `supabase` | DB query + admin-safety (with `references/schema.md`) | Pattern A |
| `create-skill` | This one — policy + teaching for building new skills | Pattern A (self-contained for now) |

If you're adding something in an adjacent area (e.g. a `bluesky` warmup skill, or a `stripe-ops` skill), read the existing skill in that family first and match shape. Consistency across project skills matters more than local optimality.
