<!-- docs/marketing/social-media/publish-kits/2026-05-04_linkedin-bespoke-vs-reusable.md -->

# LinkedIn Post Draft — Bespoke vs Reusable (Post-AI)

**Date:** 2026-05-04
**Platform:** LinkedIn
**Status:** Drafts v2 (rule-frame) + v3 (realization-frame), awaiting review
**Hook archetypes:** v2 = Contrarian, v3 = Investigator (realization)
**Source idea:** DJ Wayne (raw note, May 2026)

---

## Source idea (raw)

> Pre-AI, the conventional wisdom was to make reusable components. Now with AI you don't need to do that. You're not going to maximize standardization. What you're maximizing is bespoke utility.
>
> You're making sure everything is tailored to its job, to its page, to where it shows up on the page. You're tailoring it for every device. You're not using reusable cards. You're having bespoke cards for every page, for every section. Yes you do need a design system, but every page should be designed from the ground up with first principles about how that page should look and what it is supposed to do. What is the user trying to do on this page? Maximize efficiency, usability, and bespoke-ness so the user can do whatever they need to do.
>
> You do not need to maximize software engineering productivity because we have AI agents who are more than willing to make bespoke custom pages for everything. It is more possible to put the user first. In the past we had to weigh user usability against software engineering productivity, but now software productivity is not a factor anymore. You can turn up and dial up all the bespoke features that improve the life of a user.

---

## Hook diagnosis (v1 → v2)

**v1 hook (rejected):** "The old rule was: build one card, reuse it everywhere."

Why it failed:

- Topic ("card") is industry jargon — the average LinkedIn reader has no anchor for what kind of card.
- Reader has no skin in the game. It's a description of an engineering rule, not the reader's experience.
- Fails the **irrelevance** pass: doesn't convert topic into "you/your" consequence.
- Earns no lean. There's no pain, no benefit, no surprise — just an industry observation.

**Fix:** Lead with the reader's lived experience as a _user_ of software, then turn the camera to _why_ it feels that way. Everyone has used software that felt mid. The contrarian turn is that the reason was always economic, not creative.

---

## Primary draft (v2)

```
Every product you've ever used was a compromise.

Not built for you. Built for what the engineering team could afford
to build.

For 20 years, the "design system" was the truce between user
experience and developer hours. Build one card, reuse it everywhere.
Standardize the layout. Pick a flow that works "well enough" for
everyone — because building five flows for five users wasn't economic.

AI agents just made bespoke cheaper than reusable.

You can now have a tailored card for every section. A tailored layout
for every page. A tailored flow for every device. Not because it's
clever — because the only reason you didn't was cost.

You still need a design system. You don't need one-size-fits-all UI.

Every page should be designed from first principles around what the
user is actually trying to do on it. Dial up the tailoring. Nothing
is stopping you anymore.

Software engineering productivity used to be one side of the scale.

It's not anymore. Put the whole weight on the user.
```

---

## Hook craft audit (v2)

Per `apps/web/src/content/blogs/agent-skills/hook-craft-short-form.md`.

- **Archetype:** Contrarian (embedded belief: software is built for users → refusal: software is built for engineering economics)
- **Topic noun in first 5 words:** "product you've ever used" — word 4
- **Reader-stake in first sentence:** "you" appears in word 2; "compromise" puts the reader's frustration on the page
- **Slot map:**
    - Subject: every product you've used
    - Action: was built (compromised)
    - Objective: ship within engineering budget
    - Contrast: built for engineers vs built for you
    - Proof: "AI agents just made bespoke cheaper than reusable"
    - Time: "20 years" / "now"
- **Three beats:**
    1. **Lean:** "Every product you've ever used was a compromise." — common ground, mild pain, universal.
    2. **Stop:** "Not built for you. Built for what the engineering team could afford to build." — refuses the embedded belief that products are made for users.
    3. **Snapback:** "AI agents just made bespoke cheaper than reusable." — redirects to a new economic reality, not just "build better reusables".
- **Four-mistake diagnostic:**
    - Delay: topic-of-stake ("product you've used") in word 4 — **pass**
    - Confusion: clear, active voice, no jargon — **pass**
    - Irrelevance: opens with "you," names a felt experience — **pass**
    - Disinterest: A (built for engineers) vs B (built for you) — explicit — **pass**
- **Topic clarity / on-target curiosity:** 2/2
- **Lead-with-pain rule:** satisfied. The reader's pain is "products that don't quite fit me," and the post names it directly.

---

## Alternate hooks (A/B options)

Pick based on which audience cut you want to lead with. All pass the four-mistake diagnostic.

1. **Reader-as-user (chosen):** `Every product you've ever used was a compromise.`
   — Universal. Best for general LinkedIn reach.

2. **Reader-as-builder:** `Reusable components were never about quality. They were about cost.`
   — Punchier for an engineering / design audience. Loses the universal hook.

3. **Compressed thesis:** `Most software is a compromise. AI just removed the reason for it.`
   — Hook + snapback in one sentence. Highest information density. Risks giving the whole turn away on line one.

4. **Future-state benefit:** `Software is about to feel like it was actually made for you.`
   — Most positive frame. Good for reach, weakest pull-through to the engineering argument.

5. **Aggressive contrarian:** `Stop building reusable components. The constraint that justified them is gone.`
   — Best for comments and pushback. Risks alienating the audience you want to actually convince.

---

## Primary draft (v3 — realization frame)

A different posture from v2. v2 declares a rule. v3 narrates the founder catching himself in an old habit. The reader rides shotgun while the realization happens in real time. Naturally more vulnerable, naturally less preachy.

```
I had a realization that's been hard to shake.



For years, I built software the way I was taught. Reusable components. Shared layouts. Design systems. Efficiency. DRY.



But I hadn't admitted the other half of it.



Reusable components aren't just efficient. They're a crutch. They let me ship without asking whether *this* page, for *this* user, actually needed something different. A shared card is the path of least resistance.



The path of least resistance has another name. It's laziness.



I've been lazy. We've all been lazy. We had to be — there were only so many hours in a day, and "good enough for everyone" was the only thing that scaled.



You know who isn't lazy? AI.



AI doesn't need reusable components. Humans do. AI doesn't get tired of building the same card three different ways for three different sections. It builds what's needed, where it's needed, exactly how the page calls for it.



For the first time in software history, "lazy" is no longer the cheapest option.



The next decade of software is going to feel more handcrafted than the last decade ever did. Not less.

We finally have the bandwidth.

[LANDING — see options below]
```

---

## Hook craft audit (v3)

- **Archetype:** Investigator (Unknown / unadmitted → now-you-know). Pairs with a quiet Contrarian under it.
- **Topic noun in first 10 words:** "software" (word 9 — "the way I was taught" delays slightly but the _realization_ is itself the topic, which is named in word 3).
- **Reader-stake:** the "I" frame creates parasocial pull. The reader watches a peer change their mind, which is a stronger pull than being told a rule.
- **Slot map:**
    - Subject: I (the founder)
    - Action: built reusable
    - Objective: efficiency / DRY
    - Contrast: efficient vs lazy (same behavior, two readings)
    - Proof: AI doesn't need reusable; humans do
    - Time: "for years" / "for the first time in software history"
- **Three beats:**
    1. **Lean:** "I had a realization that's been hard to shake." — common ground (everyone has had one), creates a small cliff: _what_ realization?
    2. **Stop:** "Reusable components aren't just efficient. They're a crutch." — refuses the embedded virtue of DRY.
    3. **Snapback:** "You know who isn't lazy? AI." — rotates the camera. Doesn't escalate the laziness point; flips the comparison.
- **Four-mistake diagnostic:**
    - Delay: realization on line 1 — **pass**
    - Confusion: clear, conversational — **pass**
    - Irrelevance: "I" frame invites the reader to map their own behavior — **pass**
    - Disinterest: A (DRY = virtue) vs B (DRY = crutch) — **pass**

---

## Landing options for v3

The user explicitly asked to brainstorm what to leave the reader with. The realization frame opens with vulnerability, so the landing should be either a **commitment**, a **question**, or a **reframe**, not a rule. Six options, ranked.

### A. Practice change (recommended for v3)

> I've stopped asking "what's the reusable version of this?"
>
> I'm asking: "what does this user actually need on this page?"
>
> Different question. Different product.

**Why it works:** narrates a concrete change in how the founder works. Reader can copy the question into their own head tomorrow morning. Pairs with the realization frame — it shows what the realization changed.

### B. Reframe the constraint

> The design system isn't dead. But the excuse it gave us is.

**Why it works:** one-liner, quotable, doesn't preach. Defuses the most common pushback ("are you saying we should kill our design system?") in advance.

### C. Self-questioning (most vulnerable)

> Reusable was a compromise with my own limits.
>
> AI doesn't have those limits.
>
> So why am I still building like I do?

**Why it works:** keeps the "I" frame all the way through. No call to action. The reader fills in their own answer. Highest comment-pull because it ends on a question.

### D. Provocation to the reader

> If your product still feels generic, ask who you optimized it for.
>
> Probably not the person using it.

**Why it works:** rotates the camera onto the reader. Slightly more aggressive — best if the post is performing well and you want to push for engagement. Risks reading as preachy after the realization frame.

### E. Counterintuitive future-state

> The next decade of software is going to feel more handcrafted than the last decade ever did. Not less.
>
> We finally have the bandwidth.

**Why it works:** future-tense Fortune Teller landing. Lifts the post from "personal realization" to "industry observation." Good for shareability. Loses the intimacy of the I-frame.

### F. Stake in the ground (most declarative)

> I'm not building reusable anymore.
>
> I'm building bespoke. Page by page. Every interaction tuned to what the user is trying to do there.

**Why it works:** founder declaration. Strongest if you actually mean it and want to commit publicly. Risks sounding like a manifesto if you don't follow through visibly.

### Recommendation

**Lead with A.** It's the only landing that converts the realization into a _practice the reader can adopt tonight_. If A feels too tactical, layer B underneath it as a closing line:

```
I've stopped asking "what's the reusable version of this?"
I'm asking: "what does this user actually need on this page?"

The design system isn't dead. But the excuse it gave us is.
```

---

## Posting notes

- Best posted mid-week, mid-morning ET for engineering / founder audience.
- Likely to attract pushback from senior frontend ICs and design-system maintainers — engage with curiosity, not defense. The post is not anti-design-system; it's anti-design-system-as-cost-compromise.
- Pairs well with a follow-up post on what a "first-principles page" actually looks like in practice (could pull from BuildOS UI work without naming the product).
- No CTA, no link, no product mention — fits anti-AI marketing posture (the post acknowledges AI as removing a constraint, not as the hero).
