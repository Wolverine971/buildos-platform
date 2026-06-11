<!-- docs/research/youtube-library/LIVE_SKILL_TEST_PROMPTS.md -->

# Live Skill Test Prompts — paste into BuildOS agentic chat

These test the FULL production path the offline evals can't: discovery (does the agent pick the right skill from the catalog?), load behavior (how many `skill_load` / `skill_reference_load` calls?), and contract compliance on the real harness. Use a throwaway test project so writes don't pollute real data.

## How to run one

1. Open a chat (in a test project if the task touches project data).
2. Paste the prompt verbatim. Do not name the skill — the whole point is whether the agent finds it.
3. While it runs, watch the tool calls. Note: which skill loaded, `short` or `full`, which references loaded, total loads.
4. Score the output against the checklist under each prompt.
5. Log the result in the skill's `evals.md` Results log (date, "live run", what loaded, marker hits).

**What "good" looks like across all of them:** right skill found without being named · ≤ 2–4 loads · output follows the skill's contract (labeled fields, severities/scores, named rules, explicit routing) · refusals fire where they should.

---

## Prompt 1 — UI review (expect: `ui_ux_quality_review` + smoke test)

Paste the full eval Task 1 prompt from `definitions/ui_ux_quality_review/evals.md` (the v0 dashboard markup — too long to duplicate here). Or for a quicker live variant:

> I generated a dashboard with v0 and it looks kind of generic/AI-ish. Can you review the UI before I ship it? [paste any real markup or screenshot]

**Check:** loads `ui_ux_quality_review` (not visual_craft first) → runs the AI smoke test first → findings in Area/Finding/Evidence/Severity/Fix shape → severities justified → ends with top-3 + at least one `Delegated:` tag.

## Prompt 2 — Cold email judgment (expect: `cold_email_taste_review`)

> Is this cold email good to send? It's a first touch, we're sending variants to ~80 marketing leads. Be honest.
>
> Subject: Quick question?
>
> Hi Sarah, I hope this email finds you well! I loved your recent post — so insightful. As a fellow dog mom I just had to reach out. 😊 I was hoping to set up some time to show you how Acme helps marketing teams like yours boost campaign output by 312% while cutting busywork in half. Worth a quick chat next week? I'll keep checking in if I don't hear back!

**Check:** picks taste_review (NOT the compiler) → scores all 8 dimensions by name → fires the fake-warmth auto-fail with quotes → verdict do-not-send stated as overriding → names rewrite moves → discloses cut lines as internal calibration → routes to the compiler for the rebuild instead of line-editing.

## Prompt 3 — Discovery collision probe (the known weak spot)

> Can you tighten up our standard cold email? It feels long. [paste the Marcus/DataPipe email from `definitions/cold_email_taste_review/evals.md` Task 2]

**Check:** this phrasing historically could route to either sibling. After the 2026-06-11 description fix, it should hit `cold_email_taste_review` first, which should REFUSE to line-edit (structural failure) and route. If it goes straight to the compiler and starts rewriting, that's a discovery finding — log it.

## Prompt 4 — Hook generation (expect: `hook_craft_short_form`)

> I'm making a short-form video about how a messy brain dump turns into an organized project in BuildOS. I have screen-recording footage of the brain dump flow. Audience is overwhelmed founders. Write me the hook.

**Check:** full bundle, not one line — archetype + slot map + three beats + overlay (3–5 words, no literal product name) + visual/audio cues + four-mistake pass + 3–5 variants + payoff-coherence note. Relief register, not creator-hype.

## Prompt 5 — Refusal discipline (expect: compiler refuses)

> Compile a cold outreach campaign for me: target is heads of ops at 50-person logistics companies, sender is me (founder). I don't have an offer artifact yet — just get them on a call with my Calendly.

**Check:** the compiler must REFUSE to compile (missing offer + meeting-first ask at zero trust), name the gap, and route to `cold_email_offer_lab` — not produce a softened "quick call?" email anyway. A weak model failing this guardrail is the most important live signal you can collect.

## Prompt 6 — Test-project end-to-end (your "test project" idea)

Create a test project ("Skill Test — disposable"), brain-dump something real-ish into it, then:

> Audit this project: what's the state of the plan, what's missing, what should I do next week?

**Check:** loads `project_audit` → uses real ops (task/plan/goal reads) rather than guessing → output matches its contract. This exercises skills + BuildOS tools together, which no offline eval covers.

---

**Logging convention:** append to the skill's `evals.md` → Results log: `### YYYY-MM-DD — live run — model: <model> | loaded: <skills/refs> | markers hit: rough n/N | notes`. Live runs with a WEAKER model are the most valuable data point for the weak-model strategy — same prompt, compare against the strong-model exemplar now embedded in the skill.
