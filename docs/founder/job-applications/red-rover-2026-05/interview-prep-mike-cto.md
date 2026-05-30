<!-- docs/founder/job-applications/red-rover-2026-05/interview-prep-mike-cto.md -->

# Red Rover — CTO Interview Prep (Mike Sheldon)

**Date:** 2026-05-27
**Interviewer:** Mike Sheldon — co-founder/CTO. Ex-Frontline ~18 years (intern → Software Architect). Drexel CS. Drove Frontline's microservices migration. Engineering owns product, UX, and customer; no separate PM org.
**Posture:** Pragmatic builder. Skeptical of theater. Recently warming to AI but not buying hype.

---

## Part 1 — DJ's Principles (your version of LPs)

Pick the principle, tell the story, let Mike pull on the thread. Don't recite the principle name — internalize it, then speak from it.

### 1. Engineers think like product people

**Why this lands with Mike:** Red Rover has no PM org. Engineering owns UX, customer, outcome. You already live this.

**Likely question:** "Tell me about a time you owned something end-to-end."

**Story:** Curri ops console. Service-ops team used it all day every day. You sat with them, watched what they actually did, figured out which signals to surface and when. The work that mattered most wasn't the code — it was deciding what _not_ to surface. The dispatcher's screen got quieter, not louder.

**Punchline:** "I don't think of myself as an engineer who picks up product. I think the engineer _is_ the product person, and the spec is just a hypothesis until someone uses it."

---

### 2. Sit with the people carrying the load

**Why this lands:** Red Rover sells to HR directors, payroll, ops admins, school secretaries — the people doing the unglamorous work of keeping schools running. You're motivated by exactly that population.

**Likely question:** "Why Red Rover? Why K-12?"

**Story:** Two angles. (a) Curri taught you that the dispatcher carries more than software people realize — you got obsessed with reducing what they had to hold in their head. (b) You have kids; you've watched teachers and school admins carry an unreasonable amount on behalf of other people's families. Jon Chua pointed you at Red Rover; you trust Jon's read.

**Punchline:** "A lot of why I work is to make life easier for people who carry an unreasonable amount on behalf of others. Red Rover sells to those people."

---

### 3. The structural parallel I keep noticing

**Why this lands:** Mike will respect that you saw the system match before he had to point it out.

**Likely moment:** When he describes the product or the sub-placement engine.

**Story:** Curri's matching loop — driver supply, shipment demand, real-time mobile notifications, partner network (Lyft/Uber/DoorDash + 4 regionals) — is structurally identical to Red Rover's sub-placement core: substitute supply, absence demand, real-time mobile notifications, and a multi-source pool. Different domain, same loop.

**Punchline:** "I've already debugged a version of your core loop. Different cargo."

---

### 4. Ship the boring thing first

**Why this lands:** Red Rover ships a new module every ~6 months. That's not a novelty culture. That's a "boring things, shipped reliably" culture.

**Likely question:** "How do you decide what to build vs cut?"

**Story:** Pick a Curri example where you cut something flashy in favor of something operational. (Have a real one ready — e.g., a fancy routing visualization vs a one-line "ETA confidence" badge. Whichever you actually shipped.) The principle: the boring thing usually wins because the user wants their day to get easier, not more interesting.

**Punchline:** "I'd rather ship the thing the dispatcher uses 200 times a day than the thing that demos well."

---

### 5. Context engineering, not agent engineering

**Why this lands:** This is your bridge into the AI conversation. Mike was skeptical, now open. This principle says you're skeptical too — but you've earned a real opinion. (Full handling in Part 2.)

**Likely question:** "What do you think about AI in our space?" / "Where would you use AI here?"

**Short version:** "Most of the AI product losses I've watched come from teams trying to engineer the agent. The wins come from engineering the context — what shape the data is in, where the model gets to act, what it never gets to touch. I've spent two years building something that taught me where the line is."

(Expand in Part 2.)

---

### 6. Durable surfaces, not throwaway demos

**Why this lands:** Mike is an architect. He built the microservices migration at Frontline. He'll care about whether you're someone who ships a thing that has to be rewritten in 18 months, or a thing that compounds.

**Likely question:** "Tell me about a technical decision you'd make differently."

**Story:** Pick one where you optimized for the demo and regretted it. Or where you over-engineered for a future that didn't come. Either is honest. The principle is: you've felt the cost of both ends and now bias toward durable surfaces — the kind of thing the next engineer to touch it doesn't have to apologize for.

**Punchline:** "I want to build the thing where the next person to touch it doesn't curse my name."

---

## Part 2 — The AI / BuildOS conversation

Mike was AI-skeptical, now opening up. The single worst move is sounding like the people who made him skeptical in the first place. The single best move is showing him you went through the same arc, but as a builder.

### How to bring it up (naturally)

Wait for one of these openings:

- He asks "what have you been working on outside of work / Curri?"
- He asks "what do you think about AI?"
- He asks "where would you use AI at Red Rover?"
- He mentions Red Rover's existing AI work (resume parsing, AI JD generator)

**Bridge sentence (memorize this one):**

> "I've been building a product called BuildOS for the last couple years. It's a thinking environment — the marketing line is 'turn messy thinking into structured work.' The reason I bring it up is that building it is how I formed an opinion on where AI actually helps and where it's theater."

This is not a pitch. It's a credential.

### The four patterns to have ready

These are what BuildOS taught you. Speak from these, not from BuildOS features.

**1. LLMs are good at unstructured → structured.**
Brain dump (stream of consciousness) → projects, tasks, context. That's the whole BuildOS engine. The model isn't being "smart" — it's parsing. The product win is removing the activation cost of organizing your own thoughts. **Red Rover parallel:** resume parsing (already shipped), classifying teacher notes about subs, parsing district policy docs into structured rules, turning the 18,000-respondent substitute survey into structured signal.

**2. The agent-native pattern matters more than the agent itself.**
Most "AI features" fail because they're a chatbot bolted onto a CRUD app. The real shift is: anything a user can do, an agent can do. Anything a user can see, an agent can see. That's a product/architecture decision, not a model decision. **Red Rover parallel:** if a district admin can place a sub via the UI, eventually an agent should be able to place a sub via the same API. That's not science fiction; that's just discipline about which surfaces exist.

**3. Don't use AI where deterministic code is better.**
Sub-matching is constraint satisfaction (certifications, distance, history, preferences, blocked list). That's optimization, not language. Wrapping an LLM around it makes it slower, more expensive, and less explainable to a district that wants to know why a sub got picked. **Use AI where the input is fuzzy. Use code where the rules are crisp.**

**4. Context >> model.**
The published anti-AI blog you wrote (`anti-ai-assistant-execution-engine`) argues this directly: most teams over-invest in the model and under-invest in what the model gets to see. The wins compound when the data shape is right, not when the model is newer.

### Tone calibration

- Don't say "AI-powered." Don't say "agentic." Don't say "intelligent."
- Do say "parses," "classifies," "drafts," "structures."
- If Mike makes a dry comment about AI hype, agree with him before adding your own take. He's earned the skepticism.
- If he asks what you'd ship first at Red Rover, the safe answer is _not_ a new AI feature — it's a boring win that makes one persona's day measurably easier. Then a hypothesis about where the unstructured-to-structured pattern could earn its keep next.

### The thing not to do

Do not narrate BuildOS features for more than 30 seconds. He's hiring an engineer, not evaluating a product. BuildOS is a credential that earns you the right to have a real opinion on AI. Use it that way, then put it down.

---

## Part 3 — Questions to ask Mike

Pick 3–4 based on conversation flow. Don't list them like a checklist.

1. **Frontline architecture lessons.** "You spent ~18 years at Frontline and led the microservices migration. What's the architecture decision you'd never make again, and what's the one you'd make on day one if you could?" _(This shows you did your homework, gives him a chance to tell a story he loves, and surfaces real engineering priorities at Red Rover.)_

2. **Eng-owns-product reality check.** "You've said engineering owns product, UX, and customer here. What does that actually look like on a Tuesday for a senior IC? Where does the handoff happen — or does it?"

3. **The next module.** "You've shipped a module roughly every six months — Records most recently. Without spoilers: what's the shape of the next bet, and what does it ask of the platform?"

4. **AI seriously, not theatrically.** "You've shipped resume parsing and the AI JD generator in Hiring. What's the next place AI earns its keep here — and what's a place you've explicitly decided it doesn't?" _(This is the key one. It validates his cautious posture and asks him to draw the line. His answer tells you a lot about whether this is a good place to build.)_

5. **Sub-matching as a system.** "Sub placement looks like a classic constraint-satisfaction problem on the surface, but I'd guess the messy part is everything around it — district policy quirks, sub preferences, no-show history. How much of that is currently in code vs in operator heads?"

6. **The C# ramp.** "I want to be upfront — my C# is real but rusty, I've been in TypeScript for years. What does ramp look like for a senior IC here, and where would you want me contributing in the first 60 days?" _(Better to surface this yourself than have him surface it.)_

7. **What does talent-dense mean to you?** _(Your application asked about the "talent dense team." This question puts the phrase back on him in a way that shows you took it seriously.)_

---

## Part 4 — Guardrails

- **Do not bash Frontline.** He built it.
- **Do not pitch BuildOS.** It's a credential, not a product demo.
- **Do not overclaim on C#.** Already on the record in your fit answer that it's rusty. Honor that.
- **Do not over-prepare answers verbatim.** Speak from the principles. Let the stories breathe.
- **Do say "DJ."** Sign-off energy, in-conversation: be the person, not the resume.

---

## Part 5 — Rehearsed answers (post-mock)

These are the cleaned-up versions of answers you've already drafted out loud. Speak from them, don't recite them.

### 5.1 — The opener (Curri credentials)

Use when Mike says "tell me about yourself" or "walk me through your background."

> "Hey Mike — I'm DJ Wayne. I came in through Jon Chua. We didn't overlap a ton at Curri — Jon lived in the driver mobile app, I was across the public site and the admin side — but I trust his read on the teams worth joining.
>
> Two things from Curri I'd point at:
>
> **First, I owned the integration layer to outside delivery networks.** When our driver-search algorithm couldn't find someone in our own network, we needed to be able to ask Uber, Lyft, DoorDash, and a handful of regional carriers — get a quote, accept, track the delivery, the whole loop. This was pre-AI, so I reverse-engineered all of those APIs by hand. Started with Uber, then expanded the range because it was working.
>
> **Second, I rebuilt our internal ops dashboard, and the insight wasn't mine — it was an ops guy's.** He pointed out that our dispatchers were clicking into deliveries all day to stay busy, not because anything was actually wrong. Each rep was watching ten deliveries, clicking through them in a loop just to feel like they were on top of it. So we flipped it. Instead of a list you patrol, we built an exception queue: the system pings you when a driver's slow to pick up, or there's a drop-off issue, or the customer changes the address. The dispatcher gets the problem and a couple of quick actions — call the driver, call the customer, whatever's appropriate. React and Next.js on the front, GraphQL on the back, with hooks into anywhere in the system that could generate an exception.
>
> The reason I lead with those two — the multi-source supply network with quote/accept/track, and the operator dashboard built around exceptions instead of patrolling — is that I keep noticing they're structurally the same problems Red Rover is solving. Different cargo.
>
> Happy to go deeper on either. Where do you want to start?"

**Why this works:** Honest about Jon overlap, range without sounding scattered, credit-the-ops-guy line (signals you don't grab credit), structural-parallel bridge lands at the end, hands the floor back.

---

### 5.2 — "Tell me more about the Exception Dashboard"

Lead with the epistemics insight. The architecture is bonus, not main course.

> "Two things stand out. One was an epistemics problem — dispatchers would bump driver pay or tweak the search radius after ten minutes of nothing, because they felt like _they_ should be doing something. The algorithm was usually working; their intervention often made it worse. So we measured: of the clicks they made, how many actually improved the delivery? Most didn't. That told us we shouldn't be giving them an interface to patrol — we should be giving them an interface to _exception-handle._
>
> The KPI we landed on was: deliveries that completed without a human intervening. The leverage metric was: how many deliveries can one dispatcher actually monitor? Baseline was around 10; the goal was 20+, because that scales cleanly.
>
> Happy to go into the architecture if it's useful — otherwise that's the gist."

**Moves:**

- The epistemics framing leads. That's the senior-engineer insight.
- KPI and leverage metric land in one tight beat.
- Exit ramp hands the floor back instead of bleeding into the architecture detour.

**If he pulls on architecture:** Quick version — "We had hooks throughout the stack — GraphQL events from the driver app, algorithm-side timers, customer-side triggers. Wherever something could go wrong, we'd emit an exception into the queue. The dashboard subscribed to that queue and rendered the live triage view."

---

### 5.3 — "How did you handle partner APIs when they changed?"

Answer the actual question first. Then offer the harder version of it.

> "Honestly, the way you learn about API changes is by failing. So we instrumented for that — every external call had error pings wired to me, and we built in graceful degradation. If Uber's quote endpoint went sideways, we'd fail over to Lyft or DoorDash; if a region didn't have Uber coverage that day, we'd skip them dynamically. There's no changelog with these carriers — you just figure it out by watching what breaks.
>
> The harder version of the problem wasn't the APIs changing — it was that the carrier, the driver, and our system were three sources of truth that didn't always agree. The carrier's driver would send updates to the carrier, the carrier would relay to us, but sometimes the driver would call us directly. Figuring out which version of reality to trust was the actual work. I built tooling around reconciling those signals."

**Moves:**

- Direct answer in the first beat (failure-driven discovery, instrumentation, failover).
- The "no changelogs, you figure it out" is the earned-scar line — keep it.
- The pivot to the harder problem is the senior-engineer move: _the question you asked is the easy version; here's what was actually hard._

---

### 5.4 — "What was the team structure?"

Don't describe the org chart. Describe how you operate, then bridge to Red Rover's structure.

> "Mostly independent. Sometimes I worked with a designer or a PM who'd already done research and had a brief; I'd take that, write the engineering spec, and we'd trade pros and cons before I built it. PRs got reviewed by whoever was the domain authority on that area of code.
>
> But the thing I noticed at Curri is I did my best work when I was the one doing the user research directly. The dashboard rebuild — I sat with the dispatchers. When a PM was in the middle, I shipped fine, but the work was less mine. So I'm reading Red Rover's 'engineering owns product' line as a feature, not a flag."

**Moves:**

- First paragraph is the factual answer; doesn't dwell.
- Second paragraph is the bridge to Mike's no-PM culture. "Feature, not a flag" is the key phrase — signals you noticed the structure and you're wired for it.

---

### 5.5 — "Where are you at now?" (BuildOS, sequenced)

This is the most important answer you'll give. Frame BuildOS as a credential that taught you something, not a competing commitment.

> "After Curri, I went all-in on AI. I'd been watching the wave from the outside and I wanted to be inside it. So I built a product called BuildOS for the last couple years — a thinking environment for people doing complex work. The thesis I landed on, after a lot of iteration, is that **the model gets the credit, but the win is almost always in what the model gets to see.** Context engineering, not agent engineering. That's most of what BuildOS taught me.
>
> It's a hard market — every founder is shipping something AI-shaped — and I've gotten what I'm going to get out of building it solo. So when Jon brought up Red Rover, I paid attention.
>
> The K-12 piece wasn't an obvious yes at first. I'll be honest — I told Jon, _I'm not sure I'm passionate about K-12._ But two things shifted it. One, my kids are going into kindergarten, and I started thinking about what teachers and school admins actually carry on behalf of other people's families. Two, I wasn't passionate about delivery logistics either before Curri, and I ended up loving it. The thing I actually love is being close to operators and solving real problems for them. The domain comes second.
>
> That's where I am."

**Why each move is in there:**

- **"Watching the wave from the outside, wanted to be inside it"** — explains _why AI_ without sounding like a bandwagon-jumper.
- **One clean thesis sentence:** "The model gets the credit, but the win is almost always in what the model gets to see." Memorize this verbatim. It's your AI credential in one sentence, and it's exactly what Mike (cautious AI posture) wants to hear.
- **"I've gotten what I'm going to get out of building it solo."** Critical strategic line — signals BuildOS is in a learning-mode phase, not a _I'm-about-to-quit-my-day-job_ phase. Doesn't say you're killing it; just says it's not in competition.
- **Kindergarten beat is real and survives a year of grind work.** Mike has built K-12 software for ~24 years; he'll know which motivations are recruiter-pitch and which are real.
- **Curri parallel — "I wasn't passionate about logistics either."** Evidence-based confidence that you'll fall in love with the domain.
- **"The domain comes second."** Ties back to your principles: you love being near operators, not delivery routing.

---

### 5.6 — Follow-up: "What did context engineering actually look like in BuildOS?"

Mike will probably ask. 35 seconds, then stop.

> "The product takes stream-of-consciousness brain dumps and turns them into structured projects and tasks. The model is doing parsing, not reasoning. The whole game is the prompt scaffolding around what context gets surfaced — what the user's history is, what project they're in, what they marked important last week. The model's quality matters less than people think; what matters is whether you've put the right facts in front of it."

**Stop there. Don't keep going.** Let him pull on the next thread.

---

### 5.7 — The strategic positioning rule for BuildOS

Across every BuildOS mention in this interview, hold this frame:

- **BuildOS is a credential, not a competing commitment.** It taught you something. You haven't abandoned it, but you're not asking Red Rover to compete with it.
- **Do not pitch features.** If you find yourself describing the product for more than 30–35 seconds, you've drifted. Stop, hand back to Mike.
- **The phrase to fall back on if the conversation drifts into BuildOS:** _"I'm happy to nerd out about it, but the short version is — it taught me where AI actually earns its keep, and that's what I want to bring here."_
