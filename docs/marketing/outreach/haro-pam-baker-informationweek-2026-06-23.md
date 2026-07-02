<!-- docs/marketing/outreach/haro-pam-baker-informationweek-2026-06-23.md -->

# HARO/SOS Response — Pam Baker (InformationWeek): Why agentic AI projects fail

**Status:** Drafted, ready to send
**Date drafted:** 2026-06-23
**Deadline:** 2026-06-24, 7:00 pm ET
**Source:** Peter Shankman / Source of Sources (SOS) — "Tuesday Afternoon Media Queries, 'Stay on Topic' Edition", query #6

---

## The query

> **SUMMARY:** Is the agent, processes, or wrong automation targets causing AI fails?
> **CATEGORY:** Technology
> **NAME:** Pam Baker
> **EMAIL:** bakercom1@gmail.com
> **MUCK RACK:** https://muckrack.com/bakercom1
> **MEDIA OUTLET:** InformationWeek
> **DEADLINE:** 2026-06-24, 7:00 pm ET
>
> **QUERY:** Gartner expects 40% of agentic AI projects to collapse by 2027 and not because the models can't deliver. So what is/are real agent project failure points? Is it the agents? Is it processes? Is the fault in what enterprises are trying to automate?
>
> Looking for AI experts, CIOs, AI scientists, industry analysts, and other experts to comment on the reasons agent projects fail, which are the most common causes, and what can be done to correct the situation. Send complete comments in writing, along with quote attribution and contact info. Phone calls are reserved for follow-up questions.

---

## Research notes (context for the angle)

**Who Pam Baker is.** Not a casual tech reporter. Author of _Agentic AI For Dummies_, _Generative AI For Dummies_, and _ChatGPT For Dummies_; LinkedIn Learning AI instructor; member of the National Press Club. Writes for InformationWeek, Dark Reading, CIO.com, TechTarget, PCMag, Channel Futures.

**Her angle is skeptical and anti-hype.** Recent themes:

- "Building an MCP server is easy, but getting it to work is a lot harder"
- "Nobody told legal about your RAG pipeline" (governance gap)
- "The hidden high cost of training AI on AI"
- AI vendor exit strategies / lock-in
- "The invisible labor crisis inside IT"

→ **Implication:** She rewards specific, non-hype, root-cause takes and punishes buzzwords. No "revolutionize / game-changer" language.

**The Gartner stat** (press release 2025-06-25, analyst Anushree Verma): >40% of agentic projects canceled by end of 2027 due to _escalating costs, unclear business value, inadequate risk controls_ — driven by "hype" and "agent washing" (Gartner estimates only ~130 of thousands of agentic vendors are real). Gartner's own fix: redesign workflows from scratch, don't bolt agents onto legacy systems; use a tiered approach (agents for decisions, automation for routine, assistants for retrieval).

**The bridge.** Gartner names _symptoms_ (cost, no ROI). DJ's take names the _root cause_: agents fail because (1) they're trapped in the chat thread, which can't hold real work, and (2) they're context-starved. The contrarian kicker ties straight to Pam's governance beat — the fix everyone reaches for (always-on AI surveillance to build context) just trades a context problem for the privacy/cost/legal problem she already writes about.

---

## The deeper thesis — agents fail because the chat box is the wrong environment (reusable BuildOS IP)

> This is the core argument. It's bigger than this one email — it's the intellectual spine of BuildOS's "thinking environment" positioning. Reuse for blog/LinkedIn/talks.

**1. The misdiagnosis.** Everyone is stuck asking "is the model smart enough?" Every serious study says yes, it's fine — MIT's NANDA report found ~95% of enterprise GenAI pilots deliver zero P&L impact, and _not_ for lack of model horsepower. If the model is fine and projects still die, the failure is in the **environment we put the model in.** Right now that environment is a chat box.

**2. Why the chat box is the bug (hard mechanism).** Real work is hundreds of small steps. At 95% reliability per step, a 20-step task succeeds only ~36% of the time; at 50 steps, under 8%. Worse than independent multiplication, because the model _conditions on its own earlier mistakes_ — an error at step 3 poisons step 4's context. A single long thread is the **worst possible container** for this: every error stays in the room and compounds; nothing gets checkpointed or reset. The thread doesn't just fail to help — it _amplifies_ the failure.

**3. The original insight — we collapsed all of work into ONE primitive.** Nobody gets complex work done _through other intelligent agents (people)_ via one continuous conversation. A leader runs work through a repertoire of primitives. The chat box has almost none of them:

| How a leader runs work through smart people        | In the chat box?                         |
| -------------------------------------------------- | ---------------------------------------- |
| **Brief / frame** — goal, constraints, context     | ❌ a one-line prompt, not a brief        |
| **Delegate & walk away** — go do this, report back | ❌ you babysit every token; can't leave  |
| **Send to research** — go find X, come back        | ❌ no parallel work that returns         |
| **Meet** — sync, align, decide together            | ⚠️ the _one_ it has — and broken         |
| **Review / redline** — critique the draft          | ❌ no artifact to review, just more chat |
| **Heads-down execution** — stop talking, go build  | ❌ work only exists while you type       |
| **Capture decisions durably**                      | ❌ thread forgets the moment you leave   |

Punchline: the chat box gives you exactly **one** primitive — a meeting — and a broken one: a meeting you can never leave, where nothing gets written down, and you re-explain everything every time you walk back in. **We took the least scalable way humans coordinate work and made it the only way to work with the most capable tool ever built. You can't run a company through a single group chat — so why did we think we could run knowledge work through one?**

**4. The reframe.** Stop trying to make the AI more _agentic_ ("doing stuff with you"). The AI is already smart. What's missing is a **thinking environment** where a human can _direct_ that intelligence the way a founder directs a team. Dropping an agent into a chat window = dropping a brilliant new hire into a company with no onboarding, no org chart, no handoffs, and no memory — then blaming the hire when the project collapses.

**5. Why it's right, not just clever (data + lineage).** Deloitte: redesigning the workflow _around_ human-AI work produced ~30% productivity gains vs. ~5% from bolting AI onto the old process. MIT's surviving 5% changed the workflow, not the model. And it's old wisdom — Engelbart's _Augmenting Human Intellect_ (1962) and Nancy Kline's _Thinking Environment_ both held that human thinking improves dramatically when you build the right **structure around it.** The chat box is the opposite of a thinking environment; it's a thinking _bottleneck_. BuildOS = the individual-scale version of what the enterprise winners already do.

**Sources:** [MIT/Fortune 95%](https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/) · [Compounding-error math](https://highlandedge.com/resources/insights/compound-error-problem/) · [Deloitte 30% vs 5% / IW zero-based redesign](https://www.informationweek.com/machine-learning-ai/drive-agentic-ai-outcomes-with-zero-based-process-redesign) · [Nancy Kline Thinking Environment](https://www.timetothink.com/nancy-kline/) · [Engelbart 1962](https://michaelnotebook.com/notes/engelbart/engelbart.html) · [Gartner 40%](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)

---

## How Pam triages — and how we win

Researched the journalist side of the SOS/HARO workflow so the pitch matches how she actually selects sources.

| What's true of her workflow                                                                                 | What we do about it                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popular queries pull **hundreds** of responses; she scans, doesn't read.                                    | One-skim scannable. Lead with the answer, bold the labels, liftable quotes.                                                                        |
| **Speed beats the deadline** — good answers in the first ~15 min often close the window early.              | **Send today.** This is the "Tuesday afternoon" edition and today is Tuesday — don't wait for the Wed 7pm backstop.                                |
| She **Googles you** before quoting; thin presence = rejected even with a strong pitch.                      | Link build-os.com (+ LinkedIn). Make sure the site reads as real before sending.                                                                   |
| **CARE**: Credentials, Authenticity, Relevance, Exclusivity.                                                | DJ isn't a CIO/analyst — lead with _authenticity + exclusivity_: "I build agentic software and watch these failures daily." First-hand > rehashed. |
| She rewards pitches that **answer exactly what was asked**.                                                 | Open by answering her three literal questions (agents? processes? targets?) in two sentences.                                                      |
| **150–250 words, no promo, no AI-slop.** She wrote _Agentic AI For Dummies_ — she'll smell generic AI text. | Specific named tools + concrete analogies. BuildOS mentioned once, at the end, never as a pitch.                                                   |
| It's a **relationship** — she re-pitches good sources on recurring queries.                                 | Close by offering to be a future source on agentic AI / context engineering.                                                                       |

---

## Draft email (SEND THIS — short, human, reply-getting ~175 words)

> Goal: sound like a person, give her one liftable quote, and leave a thread she can pull (the "brutal math" tease) so she has a reason to write back. The longer four-quote version below it reads as AI — uniform structure, same-length sentences. Don't send that one.

**To:** bakercom1@gmail.com
**Subject:** re: why agent projects fail

---

Hi Pam,

Quick take — quote whatever's useful.

The models aren't the problem. I build agent software all day; they're plenty smart. We're just running real work through a chat box, and that's a terrible place to do real work.

Think about how you actually get things done through other people. You brief them, send them off to research something, hand off a piece and let them run, then review what comes back. A chat box does none of that. It's one conversation you can never leave that forgets everything the moment you close it.

You can't run a company through a single group chat. That's basically what we're asking AI to do, then we act shocked when it falls apart.

Projects don't fail because the agent's dumb. They fail because we hired someone brilliant and gave them no onboarding, no memory, and no way to hand off work.

There's some brutal failure-rate math behind this too, if it's useful — happy to get into it, here or by phone.

DJ

DJ Wayne
Founder, BuildOS · build-os.com

---

### Why this version (notes)

- **No `**Label:** "quote"` scaffolding.** The repeated bold-then-quote blocks were the #1 AI tell. Just talk.
- **Varied sentence length** — fragments, one long sentence, several short. Uniform rhythm = robotic.
- **One signature line** ("you can't run a company through a single group chat") instead of four competing polished quotes.
- **The math is a tease, not a dump** — gives her a concrete reason to reply ("send me the numbers"), which is how a cold pitch becomes a source relationship.
- Dropped the "Former Marine / thinking environment" bio block — for a fast reply it reads as a press kit. The work speaks; the sig is two lines.

> Need the long, fully-explained version for a follow-up or blog? It's in **§"The deeper thesis"** above — but don't paste that structure into a cold reply.

---

## Spin-off deliverables (from the thesis)

**HTML one-pager:** `~/Desktop/buildos-guides/the-chat-box-is-the-bug.html` — self-contained, Inkprint "field notes" styling (cream card / "box" layout, stat chips, primitives table, pull-quotes), JSON-LD (`BlogPosting`, author DJ Wayne / publisher BuildOS) + Open Graph for sharing. Light + dark mode. Opens offline. Candidate to publish at `build-os.com/blog/the-chat-box-is-the-bug` or as a `philosophy` blog post.

### LinkedIn post (DJ voice — first-person realization, names BuildOS at close)

> Everyone keeps asking if AI is smart enough yet.
>
> Wrong question.
>
> Gartner says 40% of agentic AI projects die by 2027. MIT looked at 300 enterprise rollouts — 95% never moved the bottom line.
>
> The easy read: "the AI isn't ready."
>
> I build this stuff every day. The models are fine. We just keep putting them in the wrong place: a chat box.
>
> Here's the part nobody says out loud.
>
> Think about how you get hard things done through other smart people. You don't do it in one endless conversation. You brief them. You send them off to research something. You hand off a piece and walk away so they can actually do it. You meet to decide. You review the draft.
>
> A company runs on those moves.
>
> A chat box has exactly one of them — a meeting. And a broken one: you can never leave, nothing gets written down, you re-explain everything every time you come back.
>
> We took the least scalable way humans coordinate work and made it the only way to work with the most powerful tool we've ever built.
>
> You can't run a company through a single group chat.
>
> So why are we running all of our thinking through one?
>
> The fix isn't a smarter agent. It's a thinking environment — a place where context lives, work gets handed off, and decisions stick.
>
> That's what we're building at BuildOS.
>
> The model was never the bottleneck. The box was.

---

## Send checklist

- [ ] **Send TODAY (2026-06-23), not at the deadline** — first-responder advantage; she may stop reading once she has good quotes
- [ ] Sanity-check build-os.com loads clean + reads as real (she'll click it before quoting); add LinkedIn URL to the sig if you want extra credibility
- [ ] Confirm the "Former Marine" bio line is OK for a press piece (good color, but optional)
- [ ] Length call: deeper version runs ~550 words. She asked for "complete comments" and the labeled quotes keep it skimmable — but if you want a faster read, cut the "reframe" quote (keep mechanism + primitives + what-works)
- [ ] Gut-check the stats are stated as ranges/attributed ("~95%", "Deloitte found", "the math shows") so nothing reads as overclaimed — she fact-checks
- [ ] Send to bakercom1@gmail.com before 2026-06-24, 7:00 pm ET
- [ ] Subject line stays specific / non-promotional
