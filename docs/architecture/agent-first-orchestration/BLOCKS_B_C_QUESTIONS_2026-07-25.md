<!-- docs/architecture/agent-first-orchestration/BLOCKS_B_C_QUESTIONS_2026-07-25.md -->

# Questions for DJ — Blocks B & C

**Date:** 2026-07-25
**Purpose:** These answers are the last missing input for the open-brief evaluation
corpus (`corpus/open-brief-v1.json`, currently `incomplete_pending_dj_input`).
**Audience:** DJ, or an agent helping DJ work through this.
**Time:** ~20 minutes. Dictating is fine — messy answers are better than tidy ones.

---

## 1. Why these specific questions (read this first)

We are building an evaluation for a capability that has **no right answer**.

Tier 1 evaluation — already built and run — tests things like _"the beta email task
is done."_ Those have ground truth: a database row either changed or it didn't. Seven
scenarios now exist, one real bug was found and fixed, two real gaps confirmed.

Tier 2 is different. The brief is _"build me a marketing plan for this project."_
There is no answer key. No database row proves it worked. **The only definition of
"good" is whether DJ would actually execute the plan.**

That has one consequence, and it is the reason this document exists:

> If the person building the eval invents the briefs and invents the quality bar,
> the eval measures the builder's taste, not DJ's. It would produce confident
> numbers about nothing.

So these questions cannot be answered on DJ's behalf. Everything else in the corpus
has already been built without him — structure, snapshots, the swap-test pair, the
grounding hooks. This is what's left.

### What each answer unlocks

| Question block                 | Unlocks                                                                                         | Currently                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| B — the briefs                 | The corpus contents                                                                             | Placeholder text written by the spec author |
| B — blocked/proceedable labels | Two metrics: how often the agent asks when it should, and how often it stalls when it shouldn't | Uncomputable                                |
| C — the quality bar            | The L3 human-scoring rubric and the L4 judge panel                                              | Both entirely blocked                       |

---

## 2. Block B — What would you actually ask it to do?

### B1. The briefs

A "brief" here is a **commission, not a question.** Not _"what's on my plate"_ — more
like _"go do this thing for me."_

Below are five candidates drafted from your real projects. They are guesses. **Strike
the fake ones, rewrite the clumsy ones, add the real ones.** Dictate them the way you
would actually say them out loud.

1. "go figure out what's actually blocking the job search and tell me what to do this week"
2. "build me a marketing plan for tacemus to get more local clients"
3. "look at 9takes and tell me what i'm missing — what would actually make people come back"
4. "turn spooky good into a four week plan i can actually follow"
5. "research what people are charging for website design in maryland and tell me if i'm underpricing"

**Answer here:**

```
2. "build me a marketing plan for tacemus to get more local clients"
```

### B2. Which ones are weekly?

Of the briefs above, which would you use **every week** if it worked well? We want the
corpus weighted toward real recurring demand, not impressive one-offs.

**Answer here:**

```
"turn spooky good into a four week plan i can actually follow"
```

### B3. Where does the output go?

Pick one brief. After the agent hands you the result — **what do you physically do
next?** Paste it somewhere? Send it to someone? Start executing off it? Read it and
close the tab?

This matters more than it sounds. "I'd paste it into the project as a doc" and "I'd
skim it for one idea" imply completely different quality bars.

**Answer here:**

```
So what I would do is I would tell it to produce a doc, a one-pager on all the research it did, and then give it to another agent to plug it in to wherever it needs to go. Or I'd expand upon that core research doc. If the agent hands me a good result, I'd turn it into a workflow, or I'd move it to another relevant project, or I'd just expand upon it, probably.
```

### B4. Blocked or proceedable? (one line each)

For each brief, which is true?

- **PROCEEDABLE** — a smart contractor could make reasonable assumptions and start.
- **BLOCKED** — there's something only you know that they'd have to ask you first
  (a budget, an audience, a deadline, a constraint that isn't written down anywhere).

We need at least one genuinely **BLOCKED** brief. It is the control case: it proves
the agent asks when asking is correct. It cannot be invented, because a brief that's
blocked on made-up information tests nothing.

**Answer here:**

```
brief 1: PROCEEDABLE / BLOCKED — because...
It would be blocked because, for the marketing plan for brief one, where it's producing a marketing plan, it'd be blocked because the agent is assuming you want to grow and get awareness, but it needs specifics. To know what my vision of a marketing plan is, or it needs permission to just use its best judgment based on the documents that it has, or it's just blocked because the agent needs to be pointed in a direction and then told what to do. It can then go do whatever it needs to do. That's one way.
brief 2: ...
Okay, for proceeding, say it's a marketing plan. If I already have an existing marketing doc and enough context, it can basically be proceedable because it can look at that existing marketing doc, understand where we're at, and then it has enough to do research and come up with a better theory or a better step forward. That's kind of what I'm thinking as for proceedable.
```

---

## 3. Block C — What makes a plan good or worthless?

To make this concrete rather than abstract, here are **two real answers to the same
brief.** Both respond to _"turn this project into a four-week execution plan"_ for
BuildOS.

### Plan A

> **Week 1 — Discovery & Audit.** Review current product state, analyze user feedback,
> identify top friction points in onboarding. Define success metrics and set up tracking.
>
> **Week 2 — Build & Iterate.** Prioritize the highest-impact improvements from Week 1.
> Ship incremental changes. Establish a weekly release cadence.
>
> **Week 3 — Launch & Amplify.** Roll out updates to existing users. Execute a
> coordinated content push across social channels. Engage the community and gather
> testimonials.
>
> **Week 4 — Measure & Optimize.** Analyze results against Week 1 metrics. Double down
> on what's working, cut what isn't. Plan the next sprint.

### Plan B

> **Week 1 — Unblock the one thing gating everything.** Record the demo video. It is
> the last piece holding the reactivation campaign, and that campaign produces the
> activation numbers you need elsewhere. Then make the ship/kill/shelve call on
> collaborative planning — three content pieces are queued behind that decision.
>
> **Week 2 — Reactivation, then the honest post.** Send to the beta list. Publish the
> founder-truth post about killing or keeping the feature — it's only honest once the
> call is real. Both are cheap; you're on a maintenance ration because of the job
> search, so this week assumes roughly three working hours.
>
> **Week 3 — One wedge, not three.** Authors only. Not podcasters, not newsletter
> operators. One workflow teardown for one real author, used as both outreach artifact
> and hero asset. With 8 overdue and 84 open tasks, the plan has to subtract, and
> dropping the secondary audiences is the biggest subtraction available.
>
> **Week 4 — Ask whether 10 DAU by Sept 30 is still real.** You'll have ~8 weeks left.
> If reactivation converts under ~5 active users, the target is aspirational and the
> honest move is re-dating it rather than sprinting at it.
>
> _Not addressed: pricing. The $20/mo and ~$6 model cost came from a founder interview,
> not a paying cohort — optimizing revenue on those numbers would be building on sand._

### C1. Which one is worthless?

Presumably A. **But say why in your own words** — and specifically, was it worthless
from the first line, or did you have to read a while to be sure? What gave it away?

**Answer here:**

```
Okay, for a plan right here, I think both aren't great because it has a time block for this. You can do time estimates of how certain things would be, but don't say, "Block week one, we would do this. Week two, with the..." I think it should lay out a general strategy for how we're gonna do stuff, and then it says the steps of the plan. I think in terms of steps rather than schedule, like, "These are the steps. These are the knowns and unknowns," and then we get into whatever we got to do. That's how I think of a good plan.
```

### C2. Is Plan B actually good, or just _specific_?

Plan B name-drops your real situation. That's easy to fake — an agent can sprinkle
real nouns onto a generic skeleton.

**Would you execute Plan B?** If not, what's missing? If yes — what specifically earned
that, beyond the fact that it used real details?

**Answer here:**

```
Plan B is fine. I just wouldn't frame it in terms of week 1, week 2, week 3, week 4. I would frame it in terms of a sequence of steps and measure or guess the workload required for each part. Then have it be like we have that, and we know loosely what the plan would look like. We're just not as sure about the timeline. That's my thinking.
```

### C3. Three bullets vs. three pages

Two plans arrive. One is **three bullets that are exactly right.** One is **three pages
that are 70% right.** Which do you want, and why?

**Answer here:**

```
I want the three bullet points that are right, and maybe one document. If there is extensive stuff, you can create multiple documents, but you should not just feed me the documents. You should create the documents and tell me: these are the takeaways. This is where you can find out more information. Give me the bottom line up front.
```

### C4. The trust question

**What would make you believe it actually read your project — rather than pattern-matched
the phrase "marketing plan" and produced a template?**

Concrete framing if it helps: if it planned The Cadre and never mentioned that your
credibility comes from scout-sniper experience — is that the tell? Or is the tell
something else entirely?

**Answer here:**

```
It would sort of know if, for the marketing plan, it had a direction or there was no direction, and then it gave me its input. It basically reiterated what we were trying to do with the marketing plan and how we needed to tweak it or edit it or update it or shift it or whatever.
```

### C5. The "it gets it" question

**What could a plan say that would make you go: oh, it genuinely gets this project?**

This is the single most important question in the document. Not "what would be
correct" — what would be _surprising in a good way._ The thing that would make you
trust it with the next one.

**Answer here:**

```
I love this question. It should know if we have enough context to achieve this plan. It should sort of stress test the plan. It would basically try to determine if this plan is doable. It would try to weigh how hard this plan is and how easy this plan is. It should ask for more context in order to make sure that the plan will actually get done and that the plan is feasible and followable.
```

### C6. Did Plan B overstep?

Plan B made judgment calls without asking: it dropped two audiences, it questioned
whether your Sept 30 target is real, and it refused to touch pricing.

**Was any of that presumptuous?** Where should it have asked you first instead of
deciding? This is the same blocked/proceedable line as B4, but observed on a real
artifact instead of in the abstract.

**Answer here:**

```
I think it's okay a little bit. I don't think it was presumptuous. I think it was making judgment calls that I want. I'll redirect it if I feel like it's going in the wrong direction, but I feel like it's fine.
```

---

## 4. What happens next

Once these are answered:

1. The briefs and labels go into `corpus/open-brief-v1.json`, replacing the
   placeholders, and its status flips from `incomplete_pending_dj_input` to ready.
2. C1–C6 become the **L3 rubric** — the wording used when DJ blind-scores outputs
   1–4 on "would you execute this?"
3. C4 and C5 specifically anchor the two metrics with no published equivalent:
   **grounding ratio** (C4) and the **swap test** (C5).
4. The L0/L1/L2 machine-scoring harness can then be built against a real corpus.

Answers will be captured **close to verbatim.** Paraphrasing sands off exactly the
specificity that makes them useful, so rough dictation beats polished prose.

---

## 5. Related

- [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md) — the spec these feed
- [`corpus/open-brief-v1.json`](./corpus/open-brief-v1.json) — the file being completed
- [`TIER_1_RESULTS_2026-07-25.md`](./TIER_1_RESULTS_2026-07-25.md) — the Tier 1 run these follow
- [`SCENARIO_AUTHORING_HANDOFF_2026-07-25.md`](./SCENARIO_AUTHORING_HANDOFF_2026-07-25.md) — original interview guide
