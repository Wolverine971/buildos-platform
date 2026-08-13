---
name: create-skill
description: Create, update, or refactor a Claude Code skill — scoped to BuildOS conventions. Use when the user says "create a skill", "add a skill for X", "update the X skill", "split this skill", "heal this skill", or needs to decide between a skill, command, or agent for a new capability. Teaches how to design the frontmatter trigger, body structure, and `references/` split, and includes the BuildOS rules (location, naming, size, no custom frontmatter fields).
---

# Create Skill — BuildOS

You are helping another instance of Claude author a skill that *a future* Claude will use — everything you write is prompt payload. Two jobs: **teach** skill-design fundamentals (frontmatter, progressive disclosure, degrees of freedom) and **enforce** BuildOS rules (location, frontmatter fields, command integration). For exotic skills there's also `compound-engineering:create-agent-skills`; for everyday BuildOS skill work, this file is enough.

**Scope check first:** if the skill is for the **agentic-chat runtime** (the in-product agent — files under `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/`), this file does NOT apply. Use `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md` instead — different parser, different frontmatter, different sizing rules.

---

## 0. Decide: skill, command, or agent?

Most "I should add a skill for X" requests aren't skill-shaped. Check first:

| If the capability is… | Use |
|---|---|
| **Reusable procedural knowledge** loaded on demand (navigate a tool, read a schema, run a browser flow, use an API) | **Skill** |
| A **named, user-triggered workflow** with a specific beginning and end (`/fix-bug`, `/twitter-warmup`) | **Command** (`.claude/commands/<name>.md`) |
| A **persona or role** invoked via the Task tool (growth-analyst, content-editor) | **Agent** (`.claude/agents/<name>.md`) |

Signals pointing to **skill**: you're about to copy-paste the same "how to do X" into more than one command or agent; future Claudes across sessions need the same procedural knowledge; the content branches cleanly ("if doing A read this; if B read that"). If the capability is one-shot or used by a single command, inline it in the command and move on.

---

## 1. Skill anatomy

```
.claude/skills/<skill-name>/
├── SKILL.md            # required — frontmatter + lean body
├── references/         # optional — detail loaded only when SKILL.md points to it
├── scripts/            # optional — deterministic code (.py / .sh) the skill calls
└── assets/             # optional — files the skill outputs (templates, images, fonts)
```

Three tiers of loading — the key mental model:

| Tier | What | When loaded | Budget |
|---|---|---|---|
| **Metadata** | `name` + `description` | Always, every conversation | ≈ 100 words — keep it sharp |
| **Body** | Rest of SKILL.md | Only when triggered | Aim under ~200 lines |
| **Bundled resources** | `references/`, `scripts/`, `assets/` | Only when the body points there | Effectively unlimited |

Tier 1 is paid on every request, the body on every invocation, resources only when needed. Design accordingly.

---

## 2. Frontmatter — the only trigger

```yaml
---
name: <kebab-case; must match directory name>
description: <what the skill does + explicit when-to-use signal, one or two sentences>
---
```

**That's it.** This harness ignores extra fields — do not add `model:`, `path:`, `version:`, or `tools:`/`allowedTools:` (those are agent fields, not skill fields).

**Description rules** (the single most important thing you'll write):

- Front-load **what the skill does** ("Browser automation for X", "Query the BuildOS Supabase database").
- Include **when to use it** — user phrasings, verbs, scenarios. It's the only trigger signal Claude has.
- Include **what it deliberately doesn't do**, if non-obvious.
- Imperative / declarative voice, not marketing.
- One or two sentences; needing more means you're packing body content into metadata — stop.

**Good:** "Browser automation for LinkedIn. Use when navigating LinkedIn, searching posts or profiles, reading notifications, posting, commenting, messaging, or running LinkedIn warmup tasks. Critical for any flow that must capture direct post URLs."
**Bad:** "LinkedIn stuff." (no when-to-use signal) — or "Comprehensive, best-in-class LinkedIn skill that transforms Claude into…" (marketing voice, wasted metadata budget).

---

## 3. Body — lean by default

The body loads after the trigger. Keep it to **procedural knowledge a fresh Claude would need** and wouldn't already know. Default skeleton (adapt, don't mechanically copy):

```markdown
# <Skill Name>
<One-line scope: what this covers; what it defers to references/.>
## Prerequisites                        <env vars, auth, tools assumed>
## Core workflow / quick reference      <the 3–7 step procedure or cheat sheet>
## Non-obvious rules / gotchas          <things a smart Claude wouldn't know cold>
## When to read references/<file>.md    <explicit trigger conditions per reference>
## Integrations in this repo            <which commands/agents load this skill>
```

Do **not** include: philosophical intros about what skills are; copy-pasted content that lives in another file Claude can read (link instead); setup instructions for the skill author (PR-description material); or `README.md` / `CHANGELOG.md` / `INSTALLATION.md` / `QUICK_REFERENCE.md` as separate files inside the skill — every file in a skill should be one Claude will eventually read.

---

## 4. Degrees of freedom

Match instruction specificity to how much the task actually varies:

| Freedom | When to use it | Form |
|---|---|---|
| **High** | Many valid approaches; heuristic judgement wins | Prose guidance, principles, examples |
| **Medium** | A preferred pattern with local variation | Pseudocode, templates with placeholders |
| **Low** | Fragile, error-prone, strict sequence required | Exact commands, scripts, literal code |

BuildOS examples: `twitter` / `linkedin` / `instagram` — **low** for selectors + URL patterns, **high** for engagement judgement; `supabase` — **medium** for query patterns, **low** for admin-client safety rules. Don't pick "low freedom everywhere" as a default — over-prescribed skills rot faster than the code they describe.

---

## 5. Progressive disclosure — when to use `references/`

Over ~200 lines is a signal, not a rule. Reach for `references/` when the skill has **distinct domains** that rarely apply together (finance.md / sales.md / product.md); **variants or frameworks** within one domain (aws.md / gcp.md / azure.md); or **material Claude should grep rather than pre-read** (long tables, full API surfaces, selector catalogs).

- **Pattern A — guide + on-demand references:** SKILL.md holds the core flow plus a "When to read references/" list (`workflows.md` — exact click sequences; `edge-cases.md` — auth failures, rate limits). The twitter / linkedin / instagram skills use this.
- **Pattern B — domain split:** SKILL.md is an overview routing to one reference file per domain.
- **Pattern C — conditional detail:** inline the simple case; point to a reference for the advanced one ("**For tracked changes**: see references/redlining.md").

**Rules of thumb:**

- Don't nest — keep `references/` one level deep from SKILL.md.
- If a reference file is longer than ~100 lines, put a 3-line table of contents at the top.
- Don't duplicate content between SKILL.md and a reference — SKILL.md points, it doesn't repeat.
- Every reference file must be mentioned in SKILL.md with an explicit "read this when…". Orphan references are invisible.

---

## 6. `scripts/` and `assets/`

- **`scripts/`** — deterministic code the skill calls via `Bash(…)`. Use when you're about to explain the same code for the 3rd time or reliability beats creativity. Claude can execute these without loading them into context. Still test them before shipping.
- **`assets/`** — templates, boilerplate, fonts, logos, sample docs: files the skill **outputs or modifies**, not reads as context.

Most BuildOS skills are reference-only. Don't add empty directories.

---

## 7. BuildOS-specific conventions

**Location & naming:** all project skills live under `.claude/skills/<name>/` — nothing outside that path is picked up. Directory name = `name:` field = kebab-case, no underscores. If a plugin-skill collision is possible (check the active skill list), prefix with `buildos-` — e.g. `buildos-supabase-ops`.

**Size targets:** SKILL.md aims under ~200 lines, hard-cap around 300 — past that, split. Description: one or two sentences. Reference files: whatever size the domain needs.

**Integrations:** skills in this repo are usually loaded by commands. When you create a skill, update the command(s) that will use it so the reference is explicit ("Before interacting with <platform>, load `.claude/skills/<skill-name>/SKILL.md`."). When you edit an existing skill, grep for commands that reference it and check the contract still holds.

**Don't duplicate plugin skills:** `compound-engineering:create-agent-skills` and `compound-engineering:skill-creator` are already enabled — a project-local clone of a generic skill is pure duplication. Project-local skills earn their keep by being **BuildOS-opinionated**.

**Match the family:** when adding a skill adjacent to an existing one (another warmup platform, another ops surface), read the existing skill in that family first and match its shape — consistency across project skills matters more than local optimality.

---

## 8. Authoring workflow

1. **Confirm use case** — run §0 with the user; verify skill is the right shape.
2. **Sketch the trigger** — write the `description:` first and read it back. If a fresh Claude can't tell *when* to invoke from that line alone, keep sharpening.
3. **Draft the body** — §3 skeleton, under ~200 lines; note which parts might want references/.
4. **Split into references** where §5 patterns apply; link each from SKILL.md with an explicit "read when…".
5. **Wire into callers** — update the commands / agents that should load this skill.
6. **Smoke-test the trigger** in a fresh conversation. If it doesn't load, the description is the problem — refine it.
7. **Iterate on real usage**, not imagined usage. The first version will be wrong somewhere; that's fine.

---

## 9. Minimum viable skill checklist

- [ ] `name:` matches the directory name exactly (kebab-case, no underscores).
- [ ] `description:` includes both *what* and *when to trigger*. No marketing voice.
- [ ] No extra frontmatter fields (`model:`, `path:`, `version:`, `tools:` — none work).
- [ ] SKILL.md body is under ~200 lines; longer detail is in `references/`.
- [ ] Every `references/*.md` is linked from SKILL.md with an explicit read-when trigger.
- [ ] No `README.md` / `CHANGELOG.md` / `INSTALLATION.md` inside the skill.
- [ ] No collision with enabled plugin skills (check active skill list).
- [ ] All commands / agents that depend on this skill reference it by path.
- [ ] You tested the trigger in a fresh conversation — it loaded when it should, skipped when it shouldn't.

---

## 10. Current inventory

List `.claude/skills/` for the live inventory — a table here drifts out of date.
