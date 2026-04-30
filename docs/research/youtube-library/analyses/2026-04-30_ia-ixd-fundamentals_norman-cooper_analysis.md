---
title: 'Information Architecture & Interaction Design Fundamentals — Don Norman + Alan Cooper (Consolidated Analysis)'
source_type: youtube_analysis
sources:
    - role: primary
      type: article_summary
      title: 'Don Norman — Signifiers, Affordances, and Design (Essay Summaries from JND.org)'
      author: Don Norman
      publication: JND.org
      url: 'https://jnd.org/'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_don-norman_signifiers-and-affordances-essay-summaries.md'
    - role: primary
      type: article
      title: 'Defending Personas'
      author: Alan Cooper
      publication: Medium (mralancooper)
      url: 'https://mralancooper.medium.com/defending-personas-2657fe26dd0f'
      date: 2021-03-09
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_alan-cooper_defending-personas.md'
    - role: cross_reference
      type: youtube_analysis
      title: 'Inclusive Components — Heydon Pickering'
      transcript: 'docs/research/youtube-library/analyses/2026-04-29_heydon-pickering_inclusive-components_analysis.md'
    - role: cross_reference
      type: youtube_analysis
      title: 'Applied Accessibility — Sara Soueidan'
      transcript: 'docs/research/youtube-library/analyses/2026-04-29_sara-soueidan_applied-accessibility_analysis.md'
analyzed_date: '2026-04-30'
analyzed_by: Claude (Opus 4.7, 1M ctx)
analysis_type: consolidated-source-analysis
library_category: product-and-design
library_status: 'analysis'
transcript_status: available
analysis_status: available
processing_status: ready_for_skill_draft
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ''
public_article: ''
indexed_date: '2026-04-30'
last_reviewed: '2026-04-30'
tags:
    - information-architecture
    - interaction-design
    - affordances
    - signifiers
    - personas
    - archetypes
    - don-norman
    - alan-cooper
    - conceptual-models
    - goal-directed-design
    - product-and-design
path: docs/research/youtube-library/analyses/2026-04-30_ia-ixd-fundamentals_norman-cooper_analysis.md
---

# Information Architecture & Interaction Design Fundamentals — Don Norman + Alan Cooper (Consolidated Analysis)

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): **Information architecture and interaction fundamentals (proposed)**; UI/UX quality review; Accessibility and inclusive UI review (proposed)

This is the foundational layer underneath every other Product & Design skill in the index. Visual-craft (Schoger, Kennedy, Designspo), accessibility (Pickering, Soueidan), calm-software (Saarinen, Maeda), and delight (Changuel) all assume the IA/IxD foundation is already sound. This analysis backs the proposed `information-architecture-and-interaction-fundamentals` skill and is the gap-#7 anchor from the Product & Design gap audit.

> "Affordances determine what actions are possible. Signifiers communicate where the action should take place." — Don Norman
>
> "Personas are a tool for understanding and communicating the goals, motivations, and desired end-states of our real-world users." — Alan Cooper

---

## Source Coverage — Be Honest

**This is a canon-driven analysis, not a transcript-driven one.**

- **Don Norman / JND.org:** Norman's canonical essays at JND.org are copyrighted (originally published in ACM _Interactions_) and the WebFetch service refused full reproduction. The Norman portion of this analysis is grounded in (a) explicit summary content returned by WebFetch/WebSearch, (b) widely-documented canonical material from _The Design of Everyday Things_ (DOET), _Emotional Design_, and Norman's interaction-design teaching, and (c) the IxDF essay material that paraphrases the JND.org essays. Direct quotes are flagged where they are confirmed against published Norman text.
- **Alan Cooper / "Defending Personas":** The full essay was extracted in transcript form. This is a 2021 retrospective in which Cooper steps back from "defending" personas; the underlying canon (goal-directed design, primary persona, behavioral archetypes) comes from _The Inmates Are Running the Asylum_ (1999, chapter 9) and _About Face_ (1995, multiple editions through 4th).
- **Foundational books (not in transcript form, cited from canon):** _The Design of Everyday Things_ (Norman, 1988/2013); _Emotional Design_ (Norman, 2003); _The Inmates Are Running the Asylum_ (Cooper, 1999); _About Face 4th Edition_ (Cooper / Reimann / Cronin / Noessel, 2014).
- **Cross-source analyses already on disk:** Heydon Pickering's `inclusive-components` analysis and Sara Soueidan's `applied-accessibility` analysis. These are the practical operationalization of Norman's signifier framework in screen-reader and keyboard-input modalities.

This analysis is positioned as the **canonical reference layer**, not a transcript decode. A subsequent pass should pull _DOET_ revised edition and _About Face 4_ directly to deepen specific subsections.

---

## Core Thesis

**Every visual, interaction, and accessibility decision is downstream of two foundational questions: _what should the interface communicate, and who should it communicate to?_** Norman's signifier-affordance distinction answers the first; Cooper's persona archetype method answers the second. Without these foundations the surface design layer (Schoger / Kennedy / Pickering / Soueidan / Saarinen / Maeda) operates without a brief — designers polish what cannot answer "polish for whom and toward what?"

The two canons are complementary, not competing. Norman is mostly **principles** — a vocabulary for how human action and perception interact with designed artifacts. Cooper is mostly **methods** — concrete tools for translating field research into design decisions. Together they form the operating system every other product-and-design skill assumes.

The single sentence that compresses both canons: **design is communication between the designer's mental model, the user's mental model, and the system's actual behavior — and the designer's job is to keep all three aligned through perceivable signifiers, coherent conceptual models, and audience archetypes grounded in real research.**

---

## TL;DR — Top 12 Fundamental Rules (Norman + Cooper Combined)

| #   | Rule                                                                                                                                                                          | Source |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Affordances determine what actions are possible. Signifiers communicate where the action should take place.** Most interface failures live at the signifier layer.          | Norman |
| 2   | **Discoverability and understanding** are the two pillars of good design. Discoverability fails when signifiers are absent; understanding fails when the conceptual model is. | Norman |
| 3   | **Follow conventions** in imagery and interactions. Most interface "affordances" are actually learned conventions; honor them unless you have a strong reason to invent.      | Norman |
| 4   | **Use words to label actions explicitly.** When signifiers are weak or ambiguous, language disambiguates. Icons without labels are signifier-poor.                            | Norman |
| 5   | **Maintain a coherent conceptual model.** What the user learns in one part of the system should predict the behavior of the rest.                                             | Norman |
| 6   | **Reduce the gulf of execution** (how do I act on intention?) and **the gulf of evaluation** (what happened after I acted?). Improve signifiers; improve feedback.            | Norman |
| 7   | **Three levels of emotion: visceral, behavioral, reflective.** Calm software lives in behavioral + reflective; delight lives in visceral + reflective. Pick deliberately.     | Norman |
| 8   | **Personas are archetypes, not market segments.** They are distillations of field research into representative goals, motivations, and end-states — not marketing avatars.    | Cooper |
| 9   | **Design for goals, not features.** Users have goals; products serve goals; features are mechanisms, not ends. The persona is the carrier of the goal.                        | Cooper |
| 10  | **Pick a primary persona.** Design for the most-demanding-but-real archetype; serving them well usually serves the rest. >3 personas = unfocused design.                      | Cooper |
| 11  | **Reject the Microsoft inversion.** "100 personas, one per feature" is the anti-pattern. If a persona exists to defend a feature, it isn't a persona.                         | Cooper |
| 12  | **Personas without field research are fiction.** Making them up internally is the same anti-pattern as "personas to defend features." Real field contact is non-negotiable.   | Cooper |

---

## Operating Lessons

### 1. Affordance vs. Signifier — The Norman Canon

The signifier-affordance distinction is the cleanest single contribution Norman makes to interaction design vocabulary. The story is:

**Gibson's original definition (1977, 1979).** The perceptual psychologist J.J. Gibson coined "affordance" to refer to the actionable properties between the world and an actor — a relationship, not a property of the object alone. A chair affords sitting because chairs have a sittable property and humans have the capability to sit. A staircase does not afford climbing for an actor without legs. Gibson's affordance is descriptive and ecological.

**Norman's "perceived affordance" contribution (1988, _DOET_).** Norman imported "affordance" into design and emphasized that what matters in interface design is whether the user _perceives_ that some action is possible. A touchscreen and a non-touchscreen both _afford_ touching; only one provides meaningful feedback when touched. The designer can't change what the touchscreen affords (touch is afforded by physics) — but the designer can radically change what the touchscreen _signals_ that touching will accomplish.

**Norman's later refinement: signifier (2008, _Interactions_).** Norman concluded that "perceived affordance" was muddling the conversation. He introduced **signifier** as the cleaner term:

> "A 'signifier' is some sort of indicator, some signal in the physical or social world that can be interpreted meaningfully." — "Signifiers, not affordances," _Interactions_, 2008

The clean split:

- **Affordance** = what actions are possible (a property of the relationship between object and actor)
- **Signifier** = how people discover those possibilities (a perceptible cue placed by the designer)

**The designer's job is signifier work, not affordance work.** A flat plate on a door _signifies_ pushing. A handle _signifies_ pulling. A scroll bar's position _signifies_ scrollable content. Most digital interface design is signifier choice, not affordance invention — the designer cannot change what the screen affords (it affords clicking, tapping, hovering; the operating system affords keyboard navigation), but the designer chooses every signifier that reveals how to use it.

**This reframes 90% of UI quality reviews.** When reviewing a screen, the question "are the affordances clear?" is almost always wrong. The affordances are determined by the platform; what's actually being audited is whether the **signifiers** for those affordances are perceivable, consistent, and unambiguous. A button that looks like a label has weak signifiers. An icon with no text label has weak signifiers. A modal with no obvious close affordance is missing the close-affordance signifier (the affordance — clicking — is there; the signifier isn't).

### 2. Norman's Four Principles for Screen Interfaces

From "Affordances and Design" (2008 / 2013 update). These are the operating rules Norman gives for screen-based UI:

1. **Follow conventions in imagery and interactions.** Designers often conflate affordances with cultural conventions and constraints. The placement of a scroll bar, the position of a window's close button, the meaning of a hamburger icon — these are all _learned conventions_, not inherent affordances. They are arbitrary but effective; they should be honored unless there's a strong reason to invent.

2. **Use words to label actions explicitly.** Where signifiers are weak or ambiguous, language disambiguates. The single largest failure pattern in modern app design is icon-only navigation: the icon may have a clear meaning to the designer, but it's a poor signifier without a text label for users who haven't learned that icon's convention. Words always disambiguate; icons sometimes do.

3. **Apply metaphors cautiously.** Metaphors guide initial understanding — desktop, file, folder, trash, page — but break down at scale. The "file" metaphor doesn't map cleanly to cloud-synced shared documents; the "page" metaphor doesn't map to infinite scroll; the "tab" metaphor doesn't map to mobile. Don't lean on metaphors past their useful range. Norman's specific warning: a metaphor that worked in 1985 might be actively misleading by 2025.

4. **Maintain a coherent conceptual model so learning transfers.** A user who learns one part of the system should be able to predict how the rest will behave. If pressing Cmd-Z undoes a typed character, it should also undo a deleted file. If clicking a name opens that person's profile in one place, it should open that person's profile everywhere. Inconsistency forces re-learning at every screen.

### 3. Discoverability + Understanding — The Two Pillars of Good Design

> "The two most important features of good design are discoverability and understanding." — Norman, _DOET_

- **Discoverability:** Can the user figure out _what_ actions are possible and _where_ to perform them? Discoverability fails when signifiers are absent, ambiguous, or buried.
- **Understanding:** Once discovered, can the user form a correct mental model of _how_ the system works and what the actions will do? Understanding fails when the conceptual model is incoherent, hidden, or contradicted by the system's actual behavior.

Most usability bugs decompose cleanly into one of these two failure modes. A tooltip-only feature is a discoverability failure. A button labeled "Send" that actually drafts is an understanding failure. The remediation differs: discoverability failures are fixed with stronger signifiers; understanding failures are fixed with a clearer conceptual model and better feedback.

### 4. The Seven Stages of Action + The Two Gulfs

Norman's interaction model from _DOET_ — the canonical decomposition of what happens when a user uses any product:

1. **Forming the goal** — What do I want to achieve? (e.g., "I want to see what's on my plate today.")
2. **Forming the intention** — What do I want to do? (e.g., "I want to open the daily brief.")
3. **Specifying an action** — How do I do it? (e.g., "I'll click the brief icon.")
4. **Executing the action** — Do it.
5. **Perceiving the state of the world** — What happened?
6. **Interpreting the state** — What does it mean?
7. **Evaluating the outcome** — Did it match my goal?

Two **gulfs** can break this loop:

- **Gulf of Execution** — between intention (stage 2) and action (stages 3-4): when the system makes it hard to figure out _how_ to act on an intention. Closed by stronger signifiers, clearer affordances, fewer steps, and convention-following.
- **Gulf of Evaluation** — between perception (stage 5) and outcome (stage 7): when the system makes it hard to interpret _what happened_ after the action. Closed by faster, clearer, more interpretable feedback.

Designers reduce gulfs by improving signifiers (closes execution gulf) and feedback (closes evaluation gulf). When debugging a usability complaint, ask: _which gulf is this in?_ The answer immediately suggests the remediation.

### 5. The Three Levels of Emotional Design

From _Emotional Design_ (Norman, 2003). The three levels at which a product engages a user emotionally:

- **Visceral** — Immediate, sensory, pre-conscious response. The first 500ms. Color, form, motion, texture, animation timing. The "ooh" before any cognition. Visual delight, micro-interactions, surprise.
- **Behavioral** — Usability, performance, learnability. The middle minutes-to-weeks. How well does the product help me get my work done? How easily do I learn it? Does it stay out of my way?
- **Reflective** — Meaning, identity, story-telling. The retrospective minutes-to-years. What does it mean that I use this product? Does using it make me feel like a kind of person I want to be? Do I tell my friends about it? Is it part of my self-concept?

**Cross-walk to the calm-software vs. delight schools:**

- **Calm software (Saarinen / Maeda / Linear / Things 3 / 37signals)** primarily engages the _behavioral_ level (clean usability, performance discipline, restraint) and the _reflective_ level (the product reflects values the user wants to see in themselves — focused, careful, thoughtful, anti-feed). Calm-software products _earn_ visceral delight as a side effect of behavioral excellence (the door that opens "just right"), but never optimize for it directly.
- **Delight school (Changuel / Spotify Wrapped / FigJam / Headspace)** primarily engages the _visceral_ level (immediate sensory pleasure — confetti, animation, color, surprise) and the _reflective_ level (social-emotional motivators — proud, cool, connected, shareable). Delight-school products are willing to add visceral delight as the headline experience.

Both are valid choices. The mistake is to ship one while believing you're shipping the other. Norman's three-level model is the discipline that forces designers to be honest about which level they are designing for.

### 6. Personas as Archetypes — The Cooper Canon

> "At Cooper, we did our field research and then synthesized personas as a tool for understanding and communicating the goals, motivations, and desired end-states of our real-world users."
>
> — Alan Cooper, "Defending Personas," 2021

Cooper invented design personas in the early 1990s at his consulting company, Cooper, and published the canonical chapter in _The Inmates Are Running the Asylum_ (1999, chapter 9). The method is precise:

- **Personas are archetypes synthesized from field research.** They are not market segments. They are not customer profiles. They are not marketing avatars. They are not "users we imagine." They are distilled patterns observed across real customer conversations and watched real-customer-behavior.
- **Personas are vehicles for goals, motivations, and desired end-states.** The persona's name, photo, demographics, and quirks are mnemonic; the load-bearing content is the persona's goals and the end-state they want.
- **Personas are tightly restricted in number.** Cooper's rule: tightly restrict the number of personas. At Cooper, projects typically had 1–3. The narrowing of focus is the point.
- **The primary persona principle.** Among the personas, one is _primary_ — the persona for whom the design must work. Designing for the primary persona usually serves the rest; designing for "everyone" serves no one. This is the persona-method analogue of Saarinen's "opinionated software."

### 7. The Microsoft Anti-Pattern (Cooper's "Defending Personas")

Cooper's 2021 essay tells the central anti-pattern story:

> "At Microsoft, they invented personas to defend the features that the engineers cooked up in their ivory towers. At Cooper, we knew that narrowing the focus was the key to good design, so we tightly restricted the number of personas we used. At Microsoft, they had hundreds of personas, one for each feature they wanted to inflict on their users."

Cooper's structural diagnosis:

- **The Cooper method:** field research → synthesized personas → goals → design decisions.
- **The Microsoft inversion:** features → invented "personas" to retroactively justify the features → marketing artifact masquerading as a design tool.

**Tells of the Microsoft anti-pattern in the wild:**

- A team has more than 5 personas, especially more than 10. (Cooper says >3 is suspicious; >10 is structural.)
- Each persona "wants" a feature the team is already planning to build.
- The persona was created internally without field interviews.
- The persona has detailed demographic and lifestyle content but vague or generic goals.
- The persona is referenced in marketing decks but not in design reviews.
- "Persona X would want this" is used to win an internal feature debate.

When personas defend features instead of goals, the method has been inverted and is doing the opposite of what Cooper invented it for. The corrective is to walk the persona back to field research: what _real_ archetypes did interviews and observation produce? Forget the feature; what does the archetype's goal demand?

### 8. The 1999 Origin and Goal-Directed Design

Cooper's 1999 _Inmates_ argument was directed at middle-level business managers, not practitioners — a polemic to convince managers that the tech world needed interaction designers as a distinct discipline. Chapter 9 ("Designing for Pleasure" in some editions) introduced personas as one of several tools. The essay form gave the method a casual exposition that practitioners later mis-implemented.

Goal-directed design is the larger Cooper framework that personas serve. The behavioral model:

1. **Users have goals.** Not features. Not workflows. Goals are end-states they want — "see what's important today," "feel confident I'm on top of it," "get the brain-fog out of my head."
2. **Products serve goals.** A product that serves no clear user goal is solving a problem the user doesn't have.
3. **Features are mechanisms, not ends.** Each feature should map to a goal. Features without goal-mapping are feature-creep; goals without feature-mapping are unmet needs.

Personas are the carrier of the goal. The persona is "who has this goal and what does it look like in practice?" Without personas, "user goals" become abstract and contested; with personas, the team can argue specifically about whether _this_ archetype's goal is being served.

This framework is the antecedent of all later "jobs-to-be-done," "goal-directed design," and "outcome-driven innovation" methods. Tony Ulwick's outcome-driven innovation, Christensen's jobs-to-be-done, and the Lean UX persona methods are all descendants.

### 9. Conceptual Models and Mental Models — Norman Canon

Three models are at play in any product design (Norman's framing in _DOET_):

- **The designer's mental model** — what the designer believes the system is, how it works, what it does.
- **The user's mental model** — what the user believes the system is, how it works, what it does. Built by interaction with the system, by signifiers, by language, by feedback.
- **The system's actual model** — what the system actually does, mechanically.

**Design fails when these diverge.** When the designer's model and the system's model diverge, the designer is shipping based on an incorrect understanding (rare on small teams, common on large ones). When the user's model and the system's model diverge, the user makes mistakes — they form intentions the system can't honor, or interpret feedback incorrectly. The signifier and feedback layer is what holds the user's model close to the system's actual model.

**The conceptual model is the simplification of the system that the user is supposed to hold.** The designer's job is to choose a conceptual model that's (a) coherent, (b) faithful enough to predict behavior, and (c) communicable through signifiers and feedback. Most products don't have a conceptual model; they have an implementation model — the UI exposes the developer's data structures rather than a story the user can hold in their head.

**The cross-link to skills:** the conceptual model is the "north star" the visual-craft, accessibility, and calm-software disciplines all serve. Visual craft makes the conceptual model perceivable; accessibility makes it perceivable in non-visual modalities; calm-software discipline keeps the conceptual model from fragmenting under feature pressure.

### 10. Cross-Walk — How Norman + Cooper Underpin Other Skills

This is the single most important consequence of treating IA/IxD as foundational: every other skill in the Product & Design index is downstream.

- **`accessibility-and-inclusive-ui-review` (Pickering, Soueidan)** — Heydon Pickering's components canon is, structurally, Norman's signifier framework operationalized for non-visual modalities. The screen reader receives _only_ the signifiers the designer chose to encode semantically (HTML element type, ARIA role, label). When Pickering says "wrap a real `<button>` _inside_ the heading and toggle `aria-expanded`," he is saying: encode the affordance _and the signifier_ in a form a screen reader can perceive. Soueidan's "name, role, state, value" mantra is the same — every actionable element must have a perceivable cue in a non-visual modality.
- **`visual-craft-fundamentals` (Schoger, Kennedy, Designspo)** — Refactoring UI's "consistency, hierarchy, contrast" rules are, structurally, Norman's "follow conventions" + "use words" + "maintain a coherent conceptual model." Kennedy's "steal like an artist — pick a known UI to study and copy its patterns" is Norman's "follow conventions" with a learning method attached. The visual craft books deliver _how_ to make signifiers perceivable; Norman delivers _why_.
- **`calm-software-design-review` (Saarinen, Maeda, 37signals)** — Saarinen's "the spec is the baseline, not the goal" is Norman's gulf-of-execution closure paired with Cooper's goal-directed restraint. The calm-software emphasis on the behavioral and reflective emotional levels is a direct application of Norman's three-level model. Saarinen's "opinionated software" is Cooper's "primary persona" applied at the product level.
- **`delightful-product-review` (Changuel, Cultured Code)** — Changuel's delight grid (low/surface/deep) is a navigation of Norman's three-level model — surface delight is visceral, deep delight bridges behavioral and reflective. Changuel's "demotivator inversion" method is Cooper's field-research persona work in miniature.
- **`customer-discovery-through-switching-forces` (PRODUCT_STRATEGY)** — The switching-forces interview method is Cooper's field research method narrowed to one specific moment (the switch). Cooper would recognize it as a goal-directed-design field protocol with a tighter focus.

The implication: when an audit finds visual-craft, accessibility, or calm-software failures on a screen, the root cause is often upstream at the IA/IxD layer. A button with weak visual signifiers might be _the wrong button_ for the wrong persona's wrong goal. Fixing the visual signifier without fixing the IA/IxD foundation is patching the surface above a structural fault.

---

## Cross-Source Contradictions and Unifications

1. **Norman is principles; Cooper is methods.** Norman gives a vocabulary (affordance, signifier, conceptual model, gulfs, three levels of emotion) and a diagnostic ("which gulf is this failure in?"). Cooper gives a research-and-synthesis method (field research → personas → goals → design decisions). They are complementary, and neither is sufficient alone — Norman without Cooper produces principle-rich design with no audience grounding; Cooper without Norman produces audience-grounded design with no perceivability discipline.

2. **Both reject premature feature thinking.** Norman's seven stages start with the user's goal, not the system's feature. Cooper's goal-directed design literally puts goals before features by name. This is the shared ancestor of every later "jobs-to-be-done" / "outcome-driven" framework.

3. **Both insist on user goals before solutions.** Where they differ: Norman is descriptive (here's how interaction works), while Cooper is prescriptive (here's what to do about it before you ship). A practitioner using only Norman might never get to the field-research step that Cooper insists is non-negotiable.

4. **Both predate AI-era UI.** Neither Norman's signifier framework nor Cooper's persona method explicitly contemplates interfaces where the system generates novel UI on demand, or where an agent acts on behalf of the user. The frameworks still apply — the affordances and signifiers of an agent-mediated interaction are real questions — but the canon doesn't address them. (See Critical Analysis.)

5. **Both are more specific than they're often quoted.** "Affordance" and "persona" are both terms that have been bowdlerized in practice — "this button has good affordance" (Norman would call this perceived-affordance or signifier) and "our personas are 35-year-old Sarah, who likes yoga" (Cooper would say this is fiction without field research). Returning to the original definitions clarifies most disagreements about whether a design or method is being used correctly.

---

## Quotables

> "Affordances determine what actions are possible. Signifiers communicate where the action should take place." — Don Norman

> "A 'signifier' is some sort of indicator, some signal in the physical or social world that can be interpreted meaningfully." — Don Norman, "Signifiers, not affordances"

> "The two most important features of good design are discoverability and understanding." — Don Norman, _DOET_

> "Personas are a tool for understanding and communicating the goals, motivations, and desired end-states of our real-world users." — Alan Cooper

> "At Microsoft, they had hundreds of personas, one for each feature they wanted to inflict on their users." — Alan Cooper

> "The Microsoft version of personas was a 180 degree inversion of reality." — Alan Cooper

> "It is easy to do 'personas' without really doing personas." — Alan Cooper (paraphrase)

> "Designers often conflate affordances with cultural conventions and constraints." — Don Norman

> "A door is a door, and if it opens, it technically functions." — Karri Saarinen, paraphrasing Norman's signifier-vs-affordance distinction in product terms

> "When opening a door that closes and opens very perfectly, you can feel that quality." — Karri Saarinen (Norman's behavioral + reflective levels in product form)

> "Quality is rare, and rarity is the marketing channel." — Saarinen (the operational consequence of behavioral-level mastery)

> "Setting things right was my job to be done." — Alan Cooper, on the corruption of his method (a meta-acknowledgement that the canon must be defended by the practitioner community, not the inventor)

---

## Practical IA/IxD Audit Checklist — Apply Norman+Cooper Jointly

When reviewing a screen, flow, or feature, walk through these eight layers in order. Failures higher in the list usually cause the failures below them; fix upward.

### A. Goal Layer (Cooper)

- [ ] **What user goal does this serve?** Name it as an end-state, not a feature description. ("Know what to work on today" — not "see today's tasks list.")
- [ ] **Is this goal real?** Is there field-research evidence that real users have this goal? Or is it a goal we imagine they have?
- [ ] **If we removed this surface, would the goal still be served by the rest of the product?** If yes, the surface may be redundant.

### B. Archetype Layer (Cooper)

- [ ] **Which persona archetype is this designed for?** Name it specifically.
- [ ] **Are there >3 archetypes implicated?** If yes, the design is probably unfocused. Pick a primary persona.
- [ ] **Is this archetype based on field research or invented internally?** If invented, walk it back. The Microsoft anti-pattern is the trap.
- [ ] **Does this surface defend a feature, or serve the archetype's goal?** If "the feature already exists, we're justifying it with a persona," that's the inversion.

### C. Conceptual Model Layer (Norman)

- [ ] **What mental model does the user need to have to use this correctly?** Can you state it in one sentence?
- [ ] **Does the design support or fight that mental model?** Does anything in the UI imply a different model?
- [ ] **Is the conceptual model consistent with the rest of the product?** Or does this surface introduce a new model the user has to learn locally?

### D. Affordance Layer (Norman)

- [ ] **What actions are possible here?** (Usually obvious — clicking, typing, dragging, swiping. Determined by platform.)
- [ ] **Are any affordances missing that the user might expect?** (e.g., user expects to drag, but the surface doesn't support it.)

### E. Signifier Layer (Norman)

- [ ] **Which actions are perceivable?** Walk every interactive element and ask: how does the user know this is interactive?
- [ ] **Are signifiers consistent across the app?** Does the same kind of action look the same everywhere?
- [ ] **Are any actions hidden behind weak signifiers?** Icon-only nav, hover-only reveals, undisclosed gestures are the typical offenders.
- [ ] **Are there false signifiers — things that look interactive but aren't?** Cards that look clickable but aren't, labels styled like buttons, etc.

### F. Convention Layer (Norman)

- [ ] **Are we following conventions or inventing?** List every convention this surface honors and every one it breaks.
- [ ] **Where invented, is the cost worth it?** Inventing a convention costs the user re-learning. Pay the cost only if there's a clear benefit.
- [ ] **Are the conventions we're following the right ones for this audience?** Conventions are audience-specific (a developer expects keyboard shortcuts; a casual user doesn't).

### G. Feedback Layer (Norman, gulf of evaluation)

- [ ] **When an action is taken, is the result perceivable?** Visually, audibly, haptically, or via state change.
- [ ] **Is the result interpretable?** Can the user tell whether what they wanted to happen actually happened?
- [ ] **Is feedback timely?** Latency erodes feedback. Delayed feedback feels like absent feedback.
- [ ] **Does feedback work in non-visual modalities?** Screen-reader announcements, focus moves, ARIA live regions for state changes.

### H. Recovery Layer (Norman)

- [ ] **When an action fails or surprises, can the user recover?** Undo, back, retry, re-state.
- [ ] **Are errors actionable?** Does the error message tell the user what to do, or just what failed?
- [ ] **Is destructive action reversible or confirmed?** Cooper's "informed consent" principle: the user shouldn't be able to delete data without knowing they're about to.

---

## Application to BuildOS

BuildOS sits squarely in the territory where Norman + Cooper matter most: it's a productivity tool with a strong opinionated workflow (brain dump → AI structure → projects + tasks), a specific high-craft audience (creators, technical founders, knowledge workers in complex domains), and an anti-feed positioning that depends on cohesion across surfaces. The IA/IxD foundation is the single biggest leverage point on whether the product feels coherent or fragmented.

### 1. Goal-Directed Audit — BuildOS Users' Real Goals

BuildOS users' top-level goals (synthesized from existing customer interviews, support conversations, and the marketing strategy docs):

- **"Get my brain out of my head."** The brain-dump goal. The user is overloaded; they need to off-load before they can think.
- **"Know what to work on today."** The daily-brief goal. The user has too many possible tasks; they need a curated, opinionated answer.
- **"See structure in my mess."** The project-organization goal. The user has unstructured ideas across many domains; they want them organized into projects with clear next steps.
- **"Trust that I'm not dropping the ball."** The continuity goal. The user wants confidence that thinking they did three weeks ago hasn't been lost.

**Audit move:** map every screen to one of these four goals. Cut surfaces that serve no goal. Surfaces that serve more than one goal need to be checked for fragmenting the conceptual model.

**Likely findings:**

- The brain-dump CTA serves goal #1 cleanly.
- The daily brief serves goal #2 cleanly.
- The project list serves goals #3 and #4 — possibly too much in one surface.
- Settings, integrations, and admin surfaces typically serve no top-level user goal — they serve maintenance goals. They are necessary but should not compete for attention with the goal-serving surfaces.

### 2. Persona Archetypes — Cooper-Style, Not Microsoft-Style

The proposed BuildOS persona archetypes are **research artifacts to be synthesized after field interviews, not written internally and codified.** Cooper would explicitly forbid making them up.

**Possible archetypes** (to be validated by field research, not used until validated):

- **The overloaded creator** — likely primary. Author, YouTuber, founder, multi-project knowledge worker. Has too many ideas across too many domains; needs to off-load before judging. Goal: turn messy thinking into structured work.
- **The burnt-out planner.** Has tried Notion, Asana, Linear, Things, etc. and bounced off because the configuration burden defeated the planning intent. Goal: a system that thinks with them, not for them.
- **The team-of-one operator.** Solo founder or contractor running a small business; has the workload of a team and the tools of an individual. Goal: capture, prioritize, execute without losing context.

**Important:** these are hypotheses for the field-research conversation guide, not validated personas. The field research is non-negotiable; Cooper's whole canon insists on it. A team that ships designs based on imagined personas is running the Microsoft anti-pattern even if the personas are well-intentioned.

**Anti-pattern guard:** when a feature is justified by "user X wants this," check whether user X is a real archetype distilled from research, or a feature-defending fiction. If we cannot point to specific customer conversations that produced the archetype, the persona doesn't exist yet.

### 3. Signifier Discipline — Common BuildOS Gaps

Every surface in BuildOS is a signifier-level audit candidate. Likely common gaps to look for:

- **Ambiguous icon-only navigation.** If the nav uses icons without text labels (or with hover-only labels), the signifiers are weak. Norman's principle 2 ("use words") applies. The fix is text labels at all times, or text-on-hover with strong fallback affordances.
- **Modals without obvious close affordance.** A modal with no visible × or "Close" button is a signifier failure. The affordance (clicking outside, pressing Escape) may exist; the signifier is missing.
- **AI-generated content with no signifier of "you can edit this."** The biggest IA/IxD gap unique to BuildOS is communicating editability of AI-generated content. The user's mental model: "I dumped, the AI structured it." The follow-up question: _can I edit what the AI made?_ If the answer is yes (and it must be), the surface needs a signifier that says so. Pencil icons, hover states, click-to-edit affordances — all are valid; absence is a failure.
- **AI processing states.** When the system is "thinking," what's the signifier? A spinner is a weak conceptual model — it implies "wait, then magic." A streaming indicator or step-by-step status is a stronger conceptual model — it implies "the system is working through this in stages, here's where it is."
- **Brain-dump empty state.** When the textarea is empty, what does the signifier communicate? Norman: "use words." A placeholder with a prompt ("What's on your mind?") is stronger than an empty textbox.
- **Daily brief CTA.** What signifier announces that today's brief is ready? When is the brief stale? Is staleness perceivable?

### 4. Conceptual Model — One Pipeline, Not Three Modules

BuildOS's three-step pipeline (brain dump → AI structure → projects + tasks) must be communicated as **one conceptual model**, not three separately-presented modules. The user's mental model should be:

> "I dump my thinking; it organizes; I act on the organized version."

If the UI exposes the three steps as separate sections, separate menus, or separate "modes," the model fragments. The user starts thinking "now I'm in brain-dump-land; now I'm in AI-land; now I'm in tasks-land." That's three mental models, not one — and three is the Microsoft persona anti-pattern in conceptual-model form.

**Audit moves:**

- The transition from brain-dump submission to processed output should feel continuous, not modal. If it's a hard navigation, that's a fragmentation tell.
- The processed output should clearly trace back to the brain-dump that produced it — provenance is part of the conceptual model.
- Editing the processed output should not require re-entering the brain-dump; the user should not be punished for the AI being wrong. The conceptual model is "I dump, it organizes, I refine," not "I dump, it organizes, I redo."

### 5. Microsoft Anti-Pattern Guard for BuildOS Feature Decisions

When a BuildOS feature is justified internally with "user X wants this," apply the Cooper test:

- Is user X a real archetype distilled from field research?
- Does user X have multiple goals, or just the one this feature happens to serve?
- If we asked a different real user, would we get a different feature request?
- Would removing this feature actually fail the archetype's goal, or just reduce optionality?

If the answers don't hold, the feature is being defended by an invented persona — the Microsoft anti-pattern. The corrective is to walk back to the archetype and ask: does this archetype's primary goal demand this feature, or are we adding optionality?

### 6. Cross-Link to Existing BuildOS Work

This analysis is the foundation under several existing and proposed BuildOS skills/agents:

- **`accessibility-auditor` agent (proposed, currently absent).** Pickering and Soueidan are the implementation; Norman is the foundation. The agent should invoke Norman's signifier-vs-affordance vocabulary directly when explaining why a screen-reader gap matters: "this element has the affordance (click) but no signifier in the screen-reader modality (no role/label)."
- **`ui-ux-quality-review` skill.** This is the home for Norman's four principles, the seven stages of action, and the gulf diagnostic. Every UI quality complaint should be diagnosed in Norman vocabulary first ("which gulf?") before remediation.
- **`information-architecture-and-interaction-fundamentals` skill (proposed — this analysis is the source backbone).** The new skill should encode the audit checklist above as the operating contract.
- **`calm-software-design-review` skill.** Builds on Norman's three-level emotional model. The calm-software audit is structurally a check that the surface is engaging the behavioral and reflective levels, not the visceral.
- **The Inkprint design system.** Inkprint is a signifier vocabulary. Tokens are the spec; their application on each screen is the signifier work. An Inkprint audit is a Norman audit at the token level.

---

## Critical Analysis — Limits

### 1. Norman Is Principle-Rich, Method-Poor

Norman gives a vocabulary and a diagnostic, but he doesn't give a research method. _DOET_ is full of examples ("the doors of the building where my office is") but light on how to find the affordance failures in a specific product before users complain. To use Norman in practice, pair him with method-rich sources:

- **Cooper for design methods** — personas, goal-directed design, scenarios.
- **Erika Hall for research methods** — _Just Enough Research_ as the field-research protocol Cooper assumes.
- **Steve Krug for evaluative methods** — _Don't Make Me Think_ and _Rocket Surgery Made Easy_ for usability testing.

A team that has only Norman knows what good design looks like but doesn't know how to find what's wrong with their current design.

### 2. Cooper's Persona Method Is Useless Without Field Research

Cooper's whole canon presupposes that personas are synthesized from real customer interviews and observation. The Microsoft anti-pattern is what happens when teams skip the research step and synthesize personas from imagination, market segments, or existing-feature lists. This is not a soft warning — it's a structural condition.

For BuildOS or any team adopting personas, the research has to happen first. If the team can't run field research, the team should not write personas. Use a thinner method (jobs-to-be-done, switching forces) until research can be funded.

### 3. Both Are Pre-AI-Era

Neither Norman's signifier framework nor Cooper's persona method explicitly addresses:

- **AI-generated UI.** When the system generates novel UI elements on demand, the affordances are not chosen by the designer. Who's responsible for the signifier — the model, the designer of the model's output template, or the underlying platform? Norman's framework still applies (the user still needs to perceive what's possible), but the chain of responsibility is ambiguous.
- **Generative content.** When the system generates content (a draft, a summary, a structured task), the conceptual model "the user authored this" no longer holds. The signifier "this is AI-generated" becomes load-bearing in a way Norman didn't address.
- **Agent-mediated interactions.** When the agent acts on behalf of the user, what's the affordance and signifier of the agent's "I'm thinking" state? What's the signifier of "I'm about to do something irreversible"? The framework needs extension. (This is also the core gap in the agentic-chat work BuildOS is currently shipping.)

### 4. Mobile and Touch Need Modern Extension

Norman's framework was written when GUI meant mouse + keyboard. Touch, gesture, and multimodal interfaces (voice, AR, haptics) need extension:

- **Gesture affordances.** Swipe, pinch, long-press are affordances, but their signifiers are usually invisible. The convention layer is doing extra work that Norman didn't fully predict.
- **Haptic feedback.** A modality Norman barely contemplates. Haptic signals are signifiers in his framework; the practice is more developed than the canon describes.
- **Voice and audio interfaces.** All-non-visual modalities. Norman's framework still applies in principle (the user still needs to perceive affordances and form a mental model) but the practice is in the accessibility canon (Pickering, Soueidan) more than the Norman canon.

### 5. Agentic Interfaces Need a Whole New Pass

For interfaces where the agent acts on behalf of the user:

- **What's the affordance of an agent's "I'm thinking" state?** Does the user perceive that anything can be done while the agent thinks? Can the user interrupt? Reconfigure?
- **What's the signifier of "I'm about to commit to an action you might regret"?** Reversibility-affordance signifiers don't exist in the canonical Norman framework.
- **What's the conceptual model of an agent that learns about you?** "I told it once, will it remember?" is a conceptual-model question Norman's framework doesn't directly answer.

This is fertile ground for new IA/IxD canon, and BuildOS — as an AI-native productivity tool — is one of the laboratories where the new canon will be written.

---

## Recommended Next Research Pull

In rough order of value to the proposed `information-architecture-and-interaction-fundamentals` skill:

1. **Don Norman, _The Design of Everyday Things_ (revised edition, 2013).** Canonical. Paid. The full primary source for everything in this analysis's Norman section, with depth Norman's online essays can't reach. Single most important book to pull next.
2. **Alan Cooper / Robert Reimann / David Cronin / Christopher Noessel, _About Face_ (4th ed., 2014).** Canonical. Paid. The full goal-directed design method, the persona chapter in its mature form, scenarios, design principles. The Cooper canon's deepest single source.
3. **Tony Ulwick, _What Customers Want_ (2005).** Outcome-driven innovation; the descendant of Cooper's goal-directed design at the company strategy level. Cross-link to PRODUCT_STRATEGY index.
4. **Jakob Nielsen / NN/g, "10 Usability Heuristics."** The practitioner's evaluation checklist — the closest thing to a Norman audit in checklist form. Pull NN/g's full catalogue of articles on each heuristic.
5. **Bill Buxton, _Sketching User Experiences_ (2007).** The prototype-as-thinking-medium argument. Important for the design-process layer Norman + Cooper don't fully address.
6. **Alan Cooper, _The Inmates Are Running the Asylum_ (1999).** Specifically chapter 9 — the original persona chapter. Worth pulling to compare against the 2014 _About Face_ treatment and Cooper's 2021 retrospective.
7. **Mike Cohn, _User Stories Applied_ (2004).** For the user-story-vs-persona distinction. User stories serve a different function than personas; many teams confuse them. Cohn is the source for the distinction.
8. **Erika Hall, _Just Enough Research_ (2013).** The research-method companion to Cooper's persona work. Cooper's persona method assumes Hall's research method.
9. **Steve Krug, _Don't Make Me Think_ (2014, 3rd ed.).** Norman's principles in evaluative-testing form. The book teaches usability testing as a 5-user, hallway-test discipline.
10. **Donald Norman, _Emotional Design_ (2003).** For the three-level model in depth. The Saarinen / Maeda / calm-software discussion ultimately depends on Norman's three levels, and this book is the deep source.

---

## Strongest Immediate Operating Implications

Three takeaways that should change BuildOS practice now:

1. **Walk every BuildOS surface back to a goal and an archetype before any visual review.** The visual-craft audits (Schoger, Kennedy) and accessibility audits (Pickering, Soueidan) currently in the skill index assume the IA/IxD foundation is already sound. For BuildOS, that foundation has not yet been formally documented. The first move is to write down the four real user goals and the candidate archetypes, ground the archetypes in field research, and use them as the brief for every subsequent design review. Every surface that doesn't serve a goal should be marked for cut or restructure.

2. **The single highest-leverage signifier audit for BuildOS is the AI-output editability layer.** The "I dumped, the AI structured it, can I edit it?" question is where BuildOS has more conceptual-model debt than any traditional productivity tool. Make editability of AI-generated content a perceivable signifier on every surface where AI generates content. This is Norman applied to a category Norman didn't anticipate — and getting it right is part of what makes BuildOS "trustable" rather than "magical-but-fragile."

3. **Adopt the Cooper anti-pattern guard for every internal feature debate.** When someone says "user X wants this," the team's reflex should be: _is user X a real archetype, or are we defending a feature?_ This is the cheapest single discipline a small team can install and the highest-leverage protection against the Microsoft inversion. Personas are Cooper's gift to product teams; the discipline of using them honestly is what makes them work.
