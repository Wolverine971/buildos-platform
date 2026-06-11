<!-- docs/research/youtube-library/LIVE_SKILL_TEST_PROMPTS.md -->

# Live Skill Test Prompts — paste into BuildOS agentic chat

These test the FULL production path the offline evals can't: discovery (does the agent pick the right skill from the catalog?), load behavior (how many `skill_load` / `skill_reference_load` calls?), and contract compliance on the real harness.

**The BuildOS agent is project-scoped.** Skills don't run in a vacuum — they run inside a project context, with the project's goals, plans, tasks, and documents available as real tool reads. So a faithful live test isn't "open a blank chat and paste a prompt." It's: **create a project first, then exercise the skills inside that project.** That's the only way to test discovery + skill contract + BuildOS tools together, the way a real user hits them.

This doc walks one disposable test project through every skill prompt. **Step 0 creates the project** with a single brain dump that seeds every downstream thread (a cold outreach campaign, a short-form video, a v0 dashboard, a goal with a timeline). Prompts 1–6 then run inside that project.

Some skills under test (cold email, hook craft) aren't project-data-dependent — but running them in-project is still the point: it's where discovery and the real harness get exercised under genuine project context, which no offline eval covers.

## How to run

1. **Run Step 0 once** in a fresh chat to create the disposable test project. Stay in that project context.
2. For each prompt, **open a fresh chat scoped to the test project** (project context preserved, discovery signal clean — don't reuse one long thread, or skill-load caching and prior turns muddy the discovery read).
3. Paste the prompt verbatim. **Do not name the skill** — the whole point is whether the agent finds it.
4. While it runs, watch the tool calls. Note: which skill loaded, `short` or `full`, which references loaded, total loads.
5. Score the output against the checklist under each prompt.
6. Log the result in the skill's `evals.md` Results log (date, "live run", what loaded, marker hits).
7. When done, **delete the disposable project** (teardown note at the bottom) so writes don't pollute real data.

**What "good" looks like across all of them:** right skill found without being named · ≤ 2–4 loads · output follows the skill's contract (labeled fields, severities/scores, named rules, explicit routing) · refusals fire where they should · the agent uses real project reads instead of guessing when the task is project-scoped.

---

## Step 0 — Create the test project (expect: `project_creation`)

Open a fresh chat (not inside an existing project) and paste:

> Start a new project. I'm running a 6-week go-to-market push to get overwhelmed founders onto BuildOS. Three workstreams: (1) a cold outreach campaign to ~80 marketing leads — first touch, I still need to nail the offer and the actual email; (2) a short-form video showing how a messy brain dump becomes an organized project, I have screen-recording footage of the brain dump flow; (3) a new dashboard landing view I spun up in v0 that honestly looks kind of generic. Goal is 25 activated trial users by the end of the six weeks. Kicking off this week.

**Check:** loads `project_creation` → infers a sensible `name` and `type_key` (a marketing / go-to-market classification) → builds a *minimal* valid payload (project + the one stated goal for the 25 activated trials; tasks only for the concrete workstreams) → does NOT over-structure (no invented milestones, risks, or docs the brain dump didn't describe) → includes empty `entities`/`relationships` arrays where appropriate → summarizes the new project briefly → continues in the created project context. This is your discovery + minimal-payload test for `project_creation`, and it seeds the artifacts every prompt below refers to.

> Note the project name/id it creates — every prompt below runs **inside this project**.

---

## Prompt 1 — UI review (expect: `ui_ux_quality_review` + smoke test)

Open a fresh chat in the test project. Paste the full eval Task 1 prompt from `definitions/ui_ux_quality_review/evals.md` (the v0 dashboard markup — too long to duplicate here). Or for a quicker live variant:

> The dashboard landing view I built with v0 for this launch looks kind of generic/AI-ish. Can you review the UI before I ship it? [paste any real markup or screenshot]

**Check:** loads `ui_ux_quality_review` (not visual_craft first) → runs the AI smoke test first → findings in Area/Finding/Evidence/Severity/Fix shape → severities justified → ends with top-3 + at least one `Delegated:` tag.

## Prompt 2 — Cold email judgment (expect: `cold_email_taste_review`)

Open a fresh chat in the test project. Paste:

> Is this cold email good to send? It's the first touch for the campaign — variants going to ~80 marketing leads. Be honest.
>
> Subject: Quick question?
>
> Hi Sarah, I hope this email finds you well! I loved your recent post — so insightful. As a fellow dog mom I just had to reach out. 😊 I was hoping to set up some time to show you how Acme helps marketing teams like yours boost campaign output by 312% while cutting busywork in half. Worth a quick chat next week? I'll keep checking in if I don't hear back!

**Check:** picks taste_review (NOT the compiler) → scores all 8 dimensions by name → fires the fake-warmth auto-fail with quotes → verdict do-not-send stated as overriding → names rewrite moves → discloses cut lines as internal calibration → routes to the compiler for the rebuild instead of line-editing.

## Prompt 3 — Discovery collision probe (the known weak spot)

Open a fresh chat in the test project. Paste:

> Can you tighten up our standard cold email for the campaign? It feels long. [paste the Marcus/DataPipe email from `definitions/cold_email_taste_review/evals.md` Task 2]

**Check:** this phrasing historically could route to either sibling. After the 2026-06-11 description fix, it should hit `cold_email_taste_review` first, which should REFUSE to line-edit (structural failure) and route. If it goes straight to the compiler and starts rewriting, that's a discovery finding — log it.

## Prompt 4 — Hook generation (expect: `hook_craft_short_form`)

Open a fresh chat in the test project. Paste:

> Write me the hook for the short-form video on this project — the one showing how a messy brain dump turns into an organized project in BuildOS. I have screen-recording footage of the brain dump flow. Audience is overwhelmed founders.

**Check:** full bundle, not one line — archetype + slot map + three beats + overlay (3–5 words, no literal product name) + visual/audio cues + four-mistake pass + 3–5 variants + payoff-coherence note. Relief register, not creator-hype.

## Prompt 5 — Refusal discipline (expect: compiler refuses)

Open a fresh chat in the test project. Paste:

> Compile the cold outreach campaign for this project: target is the ~80 marketing leads, sender is me (founder). I don't have an offer artifact yet — just get them on a call with my Calendly.

**Check:** the compiler must REFUSE to compile (missing offer + meeting-first ask at zero trust), name the gap, and route to `cold_email_offer_lab` — not produce a softened "quick call?" email anyway. A weak model failing this guardrail is the most important live signal you can collect.

## Prompt 6 — Project audit (expect: `project_audit`)

This one runs against everything Step 0 (and any prompts above that wrote back) created. Open a fresh chat in the test project. Paste:

> Audit this project: what's the state of the plan, what's missing, what should I do next week?

**Check:** loads `project_audit` → stays in `project` context (does not switch to a `project_audit` context type) → reuses the in-context project_id and uses real ops (project overview, task/plan/goal reads) rather than guessing → audits the goal → plan → task chain, documentation coverage, loose/duplicate work, and timeline realism against the 6-week / 25-activated-trials goal → separates observations from recommendations → ends with ranked findings + smallest practical correction each. This exercises skills + BuildOS tools together end-to-end, which no offline eval covers.

---

## Teardown

Delete the disposable project once you've logged your runs (chat: "delete this project", or remove it from the projects UI). The whole point of Step 0 is a throwaway scope — don't let test writes accumulate in real data.

**Logging convention:** append to the skill's `evals.md` → Results log: `### YYYY-MM-DD — live run — model: <model> | loaded: <skills/refs> | markers hit: rough n/N | notes`. Live runs with a WEAKER model are the most valuable data point for the weak-model strategy — same prompt, compare against the strong-model exemplar now embedded in the skill.
