<!-- tasker/17-skill-live-test-prompts.md -->

# 17a — Live test prompts for the skill-ontology refactor

**Companion to:** [17-skill-refactor-followups](17-skill-refactor-followups.md) (live-suite and fidelity verification)

> **2026-07-03 status:** the first run of this suite loaded zero skills on the script/hook turns and exposed the project-create date bug (`2025-07-31`). A partial rerun after the first local fix wave proved date anchoring plus script/hook skill loading, but content fidelity was uneven and the full suite was not rerun after the second fix wave. Current local fixes include the skill-load gate, broader skill policy, current-date anchoring, alias word-boundary matching, story/narrative recall, and a deterministic no-skill-load finalization repair.
>
> Before scoring a run, confirm the fixes were active. In a turn's prompt snapshot, look for `Skill-load gate: ACTIVE`; in project-create turns, look for a `Current date:` line. If those markers are absent, the run exercised old code.
>
> Scoring rules:
>
> 1. **No `skill_load` in the tool trace = ROUTING FAILURE.** Stop scoring that turn's content entirely — plausible base-model output is not a passing skill test. Record the miss and move on.
> 2. Run each numbered prompt in a **fresh chat** scoped to the test project (domain sensing gates on the current message; a long thread muddies the signal).
>
> Known gap: the cold-email prompt (#8) may still load nothing because "cold-emailed" does not token-match the `cold_email` domain. If it fails that way, log it as the known sensing-recall gap.

**How to run:** In BuildOS agentic chat, run Prompt 0 to create the test project, then run the numbered prompts inside that project's chat. Each prompt lists the skill that should load and a **pass signal** — distinctive content from the skill body that proves the rendered markdown survived the refactor (the auto-verifier's known blind spot is silently dropped content, so "the right skill loaded" is not enough; the response must show the skill's actual craft).

**Cleanup:** delete the test project when done.

---

## Prompt 0 — Create the test project

> **Skill:** `project_creation` (passed auto-verify but had the dropped-content bug caught by a loader test — worth one live confirmation)

```
I'm launching a BuildOS demo video campaign. I want to script and ship a 90-second
launch video for TikTok and YouTube Shorts, grow the BuildOS YouTube channel around
it, and pressure-test the landing page the video points to. Deadline is end of July.
Set this up as a project.
```

**Pass signal:** Creates the _smallest valid_ project — name + type inferred, only the structure actually described (video, channel, landing page, July deadline). Fail if it invents a sprawling task tree, phases, or goals the prompt never mentioned.

**Date regression check:** "end of July" must persist as **2026-07-31**, not 2025-07-31. The first run resolved it into the past because the project_create prompt carried no current date; that's now fixed (current-date line in the focus section). If it's wrong again, that's a regression, not the same bug.

---

## The 5 unverified skills

### 1. `viral_video_script_structure`

```
Draft the script for the 90-second launch video. The core idea: people don't have a
productivity problem, they have a "where do my thoughts go" problem, and BuildOS is
the fix. Keep me hooked the whole way through.
```

**Pass signals (rendered-content fidelity — this is the largest file, highest risk):**

- Uses the fixed skeleton: packaging → outline → intro → body → outro
- Body points arrive in **2-1-3-4 order** (second-best first, best second)
- Mentions or applies **value loops** and **rehooks**; CTA is native, not bolted on
- For a 60–90s script, follows the **middle-first / hook-last** process (writes the body before the hook)

**Routing negative controls** (should NOT load this skill):

```
Just give me 10 opening-hook options for the launch video.
```

→ should route to `hook_craft_short_form`

```
The video draft feels emotionally flat — the story doesn't build. Fix the narrative arc.
```

→ should route to `story_driven_content_craft`

### 2. `youtube_channel_craft_for_founders`

```
The BuildOS YouTube channel has 9 videos and almost no views. Why aren't my videos
getting views, and what 3 videos should I make next?
```

**Pass signals:**

- Diagnoses at the **channel** level, not per-video script fixes
- Applies the **three-phase gate** (won't prescribe optimization tactics to a channel that hasn't done its reps)
- Treats **title + thumbnail as one packaging unit**; cites the non-linear packaging returns idea
- Runs or references the **idea funnel** to rank the next 3 videos

**Routing negative control:**

```
Rewrite the title of my latest video so the first 5 seconds hook better.
```

→ first-5-seconds work should route to `hook_craft_short_form`, not stay here

### 3. `sensory_double_tap`

Run this AFTER the script from prompt 1 exists (it needs an approved draft):

```
The script is approved — don't change the structure or the words. Now make it hit
harder: what should I actually show on screen at each beat? Storyboard the cues.
```

**Pass signals:**

- Treats the draft spine as **frozen** — enhancement, not rewriting
- Reinforces only the **load-bearing beats** through a second channel (visual, demo, diagram, concrete example)
- Respects the **medium boundary** (what a vertical 90s video can actually carry)
- Runs something like its 6-step enhancement pass rather than freeform "add b-roll" advice

**Routing negative control:**

```
Actually, rewrite the second half of the script — it drags.
```

→ should route back to `content_creation_pipeline` (Stage 4 drafting), not stay in the double-tap lens

### 4. `ui_ux_quality_review`

```
Here's the landing page the video links to: [paste screenshot or describe
buildos.dev/launch]. It feels amateur and I can't tell why. Give me a UI/UX audit.
```

**Pass signals:**

- Returns **evidence-backed findings with severity levels and concrete fixes** — not vibes
- Covers its check areas (hierarchy, clarity, spacing, type, color, consistency, states, responsive fit)
- Loads its reference modules for the full pass (foundation checks areas 1–6, polish & fit areas 7–11)
- If told the page was AI-generated (v0/Lovable/Bolt), runs the **AI-generated-UI smoke test**

**Routing negative control:**

```
Audit the landing page specifically for accessibility — contrast and screen readers.
```

→ accessibility-as-main-lens should route to `accessibility_inclusive_ui_review`

### 5. `usability_quick_research`

```
Before the video sends traffic, I want to know if people actually understand the
landing page. I don't want a big research program — what's the lightest way to
find out, and when do I stop?
```

**Pass signals:**

- **Sizes the bet first**, then picks the method (bet-size → method matrix) — does not jump straight to "run a survey"
- Proposes something like a **Krug-style 3-user moderated test**
- Frames questions as **hypotheses, not validation**; applies the leading-question lint to any proposed questions
- Returns a **research plan with stop conditions**, not a report template

**Routing negative control:**

```
I already ran the test — 2 of 3 users bounced at the pricing section. Fix that section's design.
```

→ design fixes should route to `ui_ux_quality_review` / `build_quality_ui_ux`

---

## Decision-queue routing probes (§13.3 overlap pairs)

These don't verify content fidelity — they generate evidence for the DRY single-owner rulings by showing which of each duplicate pair actually wins routing today.

### 6. `calendar_management` vs `google_calendar`

```
Block two 2-hour filming sessions for the launch video next week, on this project's
calendar. Don't double-book me.
```

Note **which skill loads**. Then probe the other's territory:

```
That filming session should repeat every Tuesday through end of July — set that up
and make sure it doesn't create duplicate events.
```

(Recurring events + duplicate prevention are `google_calendar`'s described specialty.) If both prompts load the same skill, that's the single-owner evidence; if they split, record the split line for the ruling.

### 7. `project_audit` vs `project_forecast`

```
Audit this project: what's missing, what's duplicated, is the structure sound, and
where are the blockers?
```

→ should load `project_audit` (backward/state-looking)

```
Given where this project is today, will I hit the end-of-July deadline? What's the
trajectory and what should I do next?
```

→ should load `project_forecast` (forward-looking). If either prompt loads the other skill — or one skill answers both — that's merge-candidate evidence for the §13.3 ruling.

### 8. `cold_email_learning_review` (reference-extraction candidate)

```
I cold-emailed 40 creators about the launch video collab. 6 replies: 3 said "not
right now", 2 asked about pricing, 1 booked a call. What did I learn and should I
keep going with this angle?
```

**Pass signals:** staged diagnosis → a gated **stop / iterate / recycle / scale** decision → learning memo; enforces **sample-size discipline** before pronouncing on rates (n=40 is small — it should say so).

---

## Recording results

For each prompt, capture: (1) which skill actually loaded (check the tool-call trace), (2) pass signals hit/missed, (3) any content that reads truncated or generic — the dropped-content smell. Log outcomes back into [[17-skill-refactor-followups]]; misses on skills 1–5 mean running the pre/post sample-diff from loose end #1 on that skill before fixing.
