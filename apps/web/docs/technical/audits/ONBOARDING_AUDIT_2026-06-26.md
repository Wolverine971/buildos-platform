<!-- apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md -->

# BuildOS Onboarding & First-Run Audit — 2026-06-26

**Question being answered:** When a brand-new user first gets on BuildOS, are we properly onboarding them, teaching them, and syncing them with what we're building (the "thinking environment / turn messy thinking into structured work" thesis)?

**Verdict:** The flow _mechanically_ onboards well — it collects good signal (intent, stakes, a first project) and the final step is genuinely on-thesis. But it **under-teaches the two things that make BuildOS different** (the messy→structured transformation as a felt "wow," and project memory/continuity), and it **abandons the positioning the moment onboarding ends** (the empty-state dashboard reads like a generic task manager; skippers get nothing). We're onboarding them to _use the buttons_ but not converting them to _the worldview_.

Measured against the positioning matrices (`docs/marketing/strategy/buildos-want-need-painkiller-2026-06-26.md`): the relief promise and the five pains (Overflow→Structure, Stall→Traction, Agent-Fatigue→Calm, Dropped-Threads→Continuity, Leak→Recall) are present in marketing but largely **absent from the first-run product**.

---

## The flow as it stands

1. **Register** (`/auth/register`) — "Join BuildOS / Start with the messy version." On-brand. ✅
2. Redirect to `/?onboarding=true` → **Welcome modal** ("Welcome to BuildOS! … Takes about 5 minutes") → **Start Setup**.
3. **`/onboarding`** — 4 steps:
    - **Step 0 — Intent + Stakes:** "What brings you to BuildOS?" (organize / plan / unstuck / explore) + "How important is this?" (high / medium / low).
    - **Step 1 — Project Capture:** intent-aware prompt → opens chat → brain dump becomes a structured project. Optional Google Calendar "analyze my calendar."
    - **Step 2 — Notifications:** "Want daily check-ins?" (email brief / SMS).
    - **Step 3 — Ready:** stats, claim public username, **connect AI tools** ("read off the same sheet of paper instead of starting from zero"), "what to do next."
4. Async **`onboarding_analysis`** worker job generates 3–7 personalized `project_questions`.
5. Land on **dashboard** — empty state: "Welcome to BuildOS! Create your first project and BuildOS will help you shape goals, tasks, and milestones."

---

## What's working — keep it

- **Signup framing** ("Start with the messy version") is pure relief, on-brand.
- **Intent options meet people at the pain.** "I'm overwhelmed and need to get unstuck" _is_ the Overflow/Stall pain in the user's own words. This is the strongest part of the flow.
- **Intent-aware capture prompts** are good ("Just dump everything that's on your mind — work, personal, ideas, worries. We'll help sort it out…").
- **The Ready step's "Connect your AI tools"** copy is excellent and exactly on-thesis: _"Your projects live in BuildOS. Let Claude Code, Cursor, ChatGPT… read off the same sheet of paper instead of starting from zero each session."_ This is the Continuity painkiller, stated well.
- **The async question generation** is a smart way to give the user a thinking on-ramp without more forms.

---

## The gaps (prioritized) — mapped to the positioning

### P0 — Sync them with the thesis (cheap copy wins, high impact) — ✅ SHIPPED 2026-06-26

> All four P0 copy fixes below are implemented. Summary of what changed:
>
> - **Empty-state dashboard** (`AnalyticsDashboard.svelte`): "Welcome to BuildOS! Create your first project…" → **"Get it out of your head."** + brain-dump/structure-and-memory body; CTA "Create your first project" → **"Start a brain dump."**
> - **Brain-dump placeholder** (`AgentComposer.svelte`): generic "Ask BuildOS anything…" → **"Brain-dump anything — messy is fine."**; project-create context now shows **"Dump everything you're thinking about — messy is fine. BuildOS turns it into a structured project."**
> - **Brief framing** (`NotificationsStepV3.svelte` + `DashboardBriefWidget.svelte`): added the Leak→Recall relief line ("so nothing falls through" / "so nothing slips"), dropped "AI-powered" from the dashboard CTA.
>   P1/P2 below remain open.

**1. The empty-state dashboard betrays the positioning.**
File: `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` (~L1076).
Current: _"Welcome to BuildOS! Create your first project and BuildOS will help you shape goals, tasks, and milestones."_ → This could describe Asana, Trello, any task manager. It's the first thing a user sees post-onboarding and the most-returned-to screen, and it carries **none** of the relief promise.
Fix — rewrite to the relief promise:

> **Get it out of your head.**
> Brain-dump the messy version of what you're working on — half-thoughts, voice memos, the 2am spiral. BuildOS turns it into a project with structure and memory.
> **[ Start a brain dump ]**
> (Note the CTA verb: "Start a brain dump," not "Create your first project." We sell relief, not data entry.)

**2. The thesis-aware prompts only exist inside onboarding.** A user who skips onboarding ("I'll do this later") or opens project-create from the dashboard gets the generic placeholder **"Ask BuildOS anything…"** (`AgentComposer.svelte` ~L98). That's the _"another chatbot to manage"_ experience we're explicitly positioning against (Agent-Fatigue pain).
Fix — lift the intent-aware/relief placeholder out of `onboarding.config.ts` so the brain-dump prompt is consistent everywhere: e.g. _"Dump everything you're thinking about this — messy is fine. I'll turn it into a structured project."_

**3. The daily brief is offered but never _framed_.** Step 2 ("A morning email with your tasks, events, and priorities") and the dashboard "Generate Brief / Get your AI-powered daily overview" are feature-descriptions, not relief. This is the **Leak→Recall** painkiller and we're leaving it on the table.
Fix — add one line of relief at the point of offer and first view: _"So nothing falls through. One brief each morning with what actually matters today — even on the projects you forgot about."_

### P1 — Teach the two things that make BuildOS different

**4. The "wow" (messy → structured) happens silently.** The single most important moment — user dumps a paragraph of chaos and gets back a real project — passes with no acknowledgment. There's no before/after, no "here's what we just did with that."
Fix — after the first brain dump creates a project, show a short **"From your words → to structure"** moment: their raw text on the left, the extracted goals/tasks/docs on the right. Make the transformation _visible_ and name it. This is the activation aha; right now it's invisible.

**5. Project memory / continuity — the actual moat — is never shown or explained.** Onboarding teaches capture but never demonstrates that _the context persists and compounds_ ("your context compounds," the Continuity/Dropped-Threads painkiller). This is also the **retention** hook, and it's absent from first-run.
Fix — one explicit beat in Ready or first-project: _"Next time you open this, you won't start over. BuildOS remembers the project — so do your agents."_ Ideally demonstrated (re-open the project, show the context is still there).

**6. First daily brief is a cold button.** New user with no data hits "Generate Brief" with no explanation of what it is, when it arrives, or why it's different. `DashboardBriefWidget.svelte`.
Fix — pre-generate the first brief (or explain it inline) so they _experience_ it rather than having to summon it blind.

### P2 — Structural / activation system

**7. No sample/demo project, no templates, no "try it on an example" path.** Brand-new users (especially the "explore" intent and skippers) face a truly blank slate. Blank slates kill activation.
Fix — offer a one-click example project ("See it work on a sample") or a couple of starter templates per intent.

**8. No persistent teaching after onboarding.** No getting-started checklist, coach marks, or progress nudges. Once the 4 steps end, teaching stops.
Fix — a dismissible first-week checklist on the dashboard: first brain dump · see your first brief · connect a tool · connect calendar. Each nudge maps to a painkiller.

**9. The chat-vs-anti-chatbot tension.** Our positioning is _anti-chatbot_ ("not another assistant to manage"), yet the primary input surface is a chat that says "Ask BuildOS anything…". The product can stay chat-driven, but the _language_ should consistently be **"brain dump / dump it and I'll handle it,"** never "chat with your AI assistant." Audit all first-run chat copy for this.

**10. Dead onboarding assets.** `static/onboarding-assets/` contains ~12 zero-byte `PLACEHOLDER_*.png/.mp4` (calendar analysis, SMS, phase generation, timeblocks). They're referenced but empty. Either produce them (they'd directly serve gaps #4 and #6 by _showing_ the magic) or remove the references.

---

## The single biggest leak

The **"I'll do this later" / skip path.** A user who dismisses the welcome modal lands on the generic empty-state dashboard with the generic chat placeholder and zero guidance — none of the intent-aware prompts, none of the thesis, no teaching. That's the worst-case first impression and it's one click away from the default. Fixing P0 #1 and #2 closes most of it because they make the _un-guided_ surfaces carry the message too.

---

## Suggested sequencing

- **This week (copy-only, no new components):** P0 #1, #2, #3, and P2 #9. Pure string/placeholder edits in known files; immediately makes every first-run surface sound like BuildOS.
- **Next:** P1 #4 and #5 (the transformation reveal + the memory beat) — the activation/retention core. Needs small UI.
- **Then:** P2 #7 and #8 (sample project + first-week checklist), and produce the missing demo assets (#10) which feed #4/#6.

---

## Key files

| Surface                      | File                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Register                     | `apps/web/src/routes/auth/register/+page.svelte`                                                                                |
| First-login gating           | `apps/web/src/routes/+layout.server.ts` (~L130), `+layout.svelte` (~L285)                                                       |
| Welcome modal                | `apps/web/src/lib/components/onboarding/OnboardingModal.svelte`                                                                 |
| Onboarding steps             | `apps/web/src/routes/onboarding/+page.svelte`, `src/lib/components/onboarding-v3/*`, `onboarding-v2/ProjectsCaptureStep.svelte` |
| Intent/stakes/prompts config | `apps/web/src/lib/config/onboarding.config.ts`                                                                                  |
| Empty-state dashboard        | `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` (~L1063–1089)                                                 |
| Brain-dump/chat placeholder  | `apps/web/src/lib/components/agent/AgentComposer.svelte` (~L98), `agent-chat.constants.ts`                                      |
| Brief widget                 | `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`                                                             |
| Analysis job                 | `apps/worker/src/workers/onboarding/onboardingAnalysisService.ts`, `prompts.ts`                                                 |
| Assets                       | `apps/web/static/onboarding-assets/`                                                                                            |
