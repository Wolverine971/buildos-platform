---
title: 'ANALYSIS: Thariq (Claude Code team, Anthropic) — Agentic Engineering Talk'
video_id: IHbsfvbfAto
url: 'https://www.youtube.com/watch?v=IHbsfvbfAto'
speaker: Thariq Shihipar (@trq212) — Claude Code team, Anthropic
event: 'Agentic Engineering, Fancy Pizza, Wine — June 25, 2026, SF (Greg Kamradt + Deedy Das)'
duration: '28:57'
analyzed_date: '2026-07-22'
raw_transcript: ./IHbsfvbfAto.md
path: youtube-transcripts/IHbsfvbfAto-analysis.md
---

# Everything Thariq Says: Agentic Engineering Deep Analysis

**Who he is:** Thariq Shihipar — ~1 year on the Claude Code team at Anthropic. Before that: YC founder for 5 years, then interpretability work with Goodfire. He personally built the **AskUserQuestion tool** in Claude Code and claims first credit for the "interview me / grill me" prompting pattern. This talk is a mid-formation draft of his upcoming AI Engineer keynote, so it's raw thinking from someone who builds the tool itself.

---

## TL;DR — The Thesis in 3 Sentences

1. Software and knowledge work are getting cheap, but **generating value is still hard** — AI hasn't yet earned its valuations or moved GDP, and the bottleneck is increasingly _us_, not the models.
2. There's a massive **capability overhang**: models can do far more than we extract from them, because we "hobble" them — wrong tools, wrong prompts, wrong formats, wrong ambition level.
3. The core skill of agentic engineering is **grinding down your own unknown unknowns** — you cannot prompt for what you can't perceive or express, so you must actually learn the domain (with Claude's help) to unlock the model.

---

## The Big Ideas (in order)

### 1. "We need to be better" — the value gap

- People tag him on Twitter: "What are you spending all the tokens on? Where's the growth?" His answer: _"You're right."_
- Software becoming cheap ≠ value being created. Building startups is still extremely hard; software/knowledge work is only _part_ of value creation.
- "We haven't honestly earned our valuations… because there's still more value to create."

### 2. Don't negotiate against yourself (Anthropic value)

- As a CEO he used to write down priorities and reason about trade-offs _in advance_. His reframe: **"What if you were less reasonable? Ask reality to show you the trade-offs."**
- At Anthropic: "Let's just do the thing. Let's do all of it. Force reality to show us the trade-offs."
- With AI, the trade-off map may have changed underneath you: **"Is good, fast, and cheap still a trade-off? Maybe not."**
- Actionable framing: your mental model of what's possible/what trades off against what is probably stale. Don't pre-concede. Attempt the ambitious version and let reality push back.

### 3. Human-Agent Interaction (HAI) is the new HCI

- 2010s tech giants were built on Human-Computer Interaction — UI/UX patterns. The next wave needs an equivalent discipline: **Human-Agent Interaction**.
- Talking to LLMs is a _skill_ like writing or public speaking: someone good at it drives **massively more value** than someone who isn't, and it will stay high-leverage for a long time.
- Explicitly rejects the "end state is one sentence in, magic out" framing: "I don't think the end goal is you just put a sentence into Claude and it does the thing. There's a lot of depth here."

### 4. Models are grown, not designed

- Labs cultivate data, RL environments, pre/mid/post-training — but **nobody knows what the model will actually be good at until they try it**. Capabilities emerge in _spiky_, unexpected ways.
- "Models don't get smarter in a straight line. They get smarter in unexpected ways."
- Killer example: back in the Sonnet 3.5 era everyone assumed coding would be solved by giant context windows (fit the whole codebase in 100M tokens). Instead it got solved by **tool calling + bash + grep**. Nobody predicted that — "you just have to do it."
- Implication: empiricism beats theory. Discover capabilities by experiment, not by reasoning from first principles about what the model "should" be able to do.

### 5. Capability overhang — "we are hobbling Claude"

- Definition: the mismatch between what models _can_ do and what we actually _use_ them for.
- He says even the current frontier ("Opus 4.8… incredible capability overhang… I feel bad about it") is massively underused.
- Part of why AI growth hasn't shown up in the numbers: **we are the bottleneck**, hobbling the model with bad interaction patterns.

### 6. Case study: "Pokémon ending in -aw"

The teaching example for overhang. An AI-hate tweet mocked ChatGPT for failing "name Pokémon ending in 'aw'" (1000+ Pokémon; exactly two qualify — even he, a big Pokémon fan, didn't know).

- **What doesn't work:** recall from weights, "thinking harder", chain-of-thought over every name, web search. Empirically all fail — even though the model obviously "knows" every Pokémon.
- **What works:** any agent with a code-exec tool. Claude Code fetches the list of all Pokémon and greps for `aw$` — **one line, instantly correct**.
- **The skill gap:** an average user asks, gets a wrong answer, and stops. A skilled user knows how to _unhobble_ the model — reroute the problem into tools where the model is superhuman.
- **Go further — abundance thinking:** don't just answer the question; have Claude generate a web app that answers _any regex over Pokémon names_. "There's so much more abundance than the problem implies." Solve the _class_ of problem, not the instance.

### 7. Put yourself in Claude's shoes (the empathy framework)

The usual framing is "model + harness." His richer framing: **model + harness + world + YOU** — a four-way relationship.

For a prompt like "explain how the auth module works," Claude has to guess:

- **Who are you?** Technical or not? How deep do you want to go? Do you know this codebase?
- **What's the world?** Huge legacy codebase → spend heavy compute, spawn subagents. Small codebase → just read it directly. Claude has to infer which situation it's in.
- **What other context exists?** Can it check git history? Slack? Is there nuance around this module?
- **WHY are you asking?** A human colleague would ask _"for what?"_ before answering. Claude never gets the "for what."

**The fix — be explicit about all four dimensions.** His example upgrade:

> "I'm an experienced TypeScript engineer, zero familiarity with this module. It's a high-compute problem, so use subagents."

That one sentence supplies identity, familiarity, and a compute/strategy directive. Memory in the harness helps, but you can close the gap manually today.

### 8. Case study: Claude Code edits his videos end-to-end

The "surprise capability" demo — nobody would guess Claude can edit video, and _Claude itself wouldn't tell you it can_ ("it doesn't know how to unhobble itself").

**The pipeline (all Claude Code, no video editor ever opened):**

1. Input = a **folder of raw clips** from a video shoot + the transcript/script of what he intended to say.
2. Claude transcribes every clip.
3. Picks the best takes by matching clip transcriptions against the intended script.
4. Cuts out "ums," clips segments together.
5. **Generates React UI overlays** (graphics, titles) that compile into the final video — following the team's actual Figma design system.
6. Even the presentation artifact explaining this process was Claude-generated.

**Key line:** _"This is what knowledge work is increasingly becoming — a folder of code, scripts, and data controlled by an agent."_

Business reality: they literally could not hire a human editor fast enough. The video only exists because of this workflow.

### 9. The color-grading story — unknown unknowns (the heart of the talk)

His first AI-edited video vs. the second: the visible difference was **color grading** — a concept he didn't know existed (raw footage comes flat/overexposed; making it look good is an art).

**The Rumsfeld matrix for agentic engineering:**

- Known knowns — what you want.
- Known unknowns — what you know you haven't figured out.
- Unknown knowns — things you only recognize when you see them.
- **Unknown unknowns — the killers.** You can't prompt for what you can't perceive.

He knew ffmpeg, transcription, Remotion — enough to get the video made. Color grading was an unknown unknown, so his output was silently worse and he couldn't even ask for better.

**The anti-pattern — "education porn":** ask Claude for a report, glaze over it, feel educated, learn nothing, still can't prompt any better. "It generated this and I honestly had no idea what color grading was from this."

**What actually worked (the learning loop):**

1. **Persist past the first report.** Keep asking follow-up questions ("what is a vectorscope?").
2. **Demand visualizations**, not prose.
3. Have Claude **pull real literature** from the domain into the explanation.
4. Ask for **before/after examples** of his own footage.
5. **Anchor to existing knowledge:** the unlock was realizing color grading ≈ a shader (pixel in → transformed pixel out) — a concept he already had.
6. The breakthrough tool: an **interactive visualization where he could hover over any pixel and watch its value transform** — built by Claude, for him, to understand the domain.
7. Only then could he express what he wanted — and he learned real domain insight: **grade skin separately from background** (humans tolerate a purple-ish wall, not purple-ish skin; his skin tone and background were close in color, making it a genuinely hard grade).

**The meta-lesson:** "We oversimplify agentic engineering as 'it's just prompts, it's just loops.' No — **we need to know what we're doing.** Learn more → prompt better → create valuable work."

### 10. Techniques to stay in the loop (his slide list)

Mentioned quickly as a family of techniques (he's writing more on these):

- **Exploring / brainstorming with Claude** before committing.
- **Asking Claude to interview you** (his "grill me" pattern).
- **Building technical plans** before implementation.
- **Explanation / implementation notes** — have Claude document what it did.
- **Explainers** — have Claude teach you the domain it's working in.

The umbrella point: _"You probably have a lot of unknown unknowns, and you're probably not being ambitious enough as a result."_

---

## Q&A Insights (lots of gold here)

### Claude tag (Claude in Slack) vs. Claude Code

- A lot of his workflow has shifted to Claude tag: exploration, thinking, generating artifacts he reviews on his phone.
- But **in-the-loop coding stays in Claude Code**.
- Claude tag's strengths: _starting_ work, managing jobs, and being **multiplayer by default** — Anthropic uses it organizationally (shared feedback channels, working together in threads).

### Evolution of the AskUserQuestion tool (he built it)

A live example of riding capability overhang across model generations:

1. **Opus 4 era:** the model could _barely call the tool at all_.
2. Then: chaining calls — full interviews, 30–40 questions strung together.
3. **Now:** he asks Claude to **build an HTML report** presenting the questions, and he selects answers _inside the report_.

Same tool, radically escalating usage pattern — you have to keep re-testing what the model can do with what you already have.

### The markdown → HTML progression (format unlocks capability)

- Originally markdown was how the model **kept itself on track**.
- Then it became a way of **communicating with you**.
- Now the model can produce **rich interactive HTML reports** — a strictly higher-bandwidth channel.
- **"You need to switch formats to unlock capabilities."** How do you know when? _"I don't have a science for you. That's maybe the trillion-dollar question."_

### On "isn't this just waterfall?" (spec → implement → QA)

Questioner: agentic dev looks like old-school waterfall. His answer reframes the whole thing:

- **Build lots of cheap prototypes first** — HTML mockups the agent doesn't fully implement.
- Core admission: _"I often find that I don't know what I want, and there's an iterative process of finding out what I want that happens quite deep in the implementation."_ That's the real slowdown — 80% done, then "ah, no, that's wrong."
- His loop: **spec → interview → prototype → (maybe a prototype PR) → reset and start again with the learnings.**
- The goal isn't process purity — it's pulling the "finding out what I want" moment earlier and earlier, because throwaway attempts are now cheap.

### Plan mode

Asked by Daisy (also on Claude Code) if he still uses plan mode: **"No. We need to do something about this."** — even the tool's own team routes around it; his interview/prototype loop replaced it.

### On "Claude explanation brain rot" (when is learning from Claude wasted time?)

Question: "My primary form of brain rot is Claude explaining stuff to me — an hour later I need remedial matrix algebra."

- No easy answer, but the test is: **are you driving an outcome?** Agentic engineering is _fun_, and you can burn hours without producing anything.
- The discriminator question: **"What is wrong with my output? How do I get better?"** — the answer is usually an unknown unknown you can't yet express.
- **"You don't need to learn about everything — but there are particular things that you need to."** Learn exactly the domains that gate your output quality (like color grading gated his videos), nothing more.

### On empathizing with the model / designing environments (audience Q)

- He admits this is "an art right now" — no clean framework yet.
- The questioner's dichotomy (lenient bash-like environments that let reasoning emerge vs. curated tools/context that supply signal) — Thariq: "that seems right, but I need to think on it more."

---

## The Actionable Playbook (everything, condensed)

**Prompting & interaction**

1. Supply the four contexts explicitly: who you are, what the world/codebase is like, what other context to pull, and _why_ you're asking ("for what").
2. Give compute directives: "this is a high-compute problem, use subagents" / "small codebase, just do it."
3. Use "interview me / grill me" to have Claude extract requirements from you.
4. Push Claude out of markdown into HTML/interactive artifacts when the content deserves higher bandwidth.
5. When an answer fails, don't stop — ask _how to reroute the problem into tools_ (code exec turned an impossible recall question into a one-line grep).

**Learning & unknown unknowns** 6. When output feels off but you can't say why → you've hit an unknown unknown. Make Claude teach you that domain until you _can_ say why. 7. Don't accept "education porn" reports. Demand visualizations, literature, before/afters, and interactive explorers of your own data. 8. Anchor new concepts to ones you already have (color grading ≈ shaders). 9. Learn only the domains that gate your output — not everything.

**Process** 10. Prototype cheap and early (HTML mockups, prototype PRs); expect to discover what you want mid-implementation; reset with learnings rather than grinding forward. 11. Skip heavyweight upfront planning (he doesn't use plan mode) in favor of the spec → interview → prototype → reset loop. 12. Solve the class, not the instance — turn a one-off question into a reusable tool/app when it's nearly free.

**Ambition & mindset** 13. Don't negotiate against yourself — attempt the ambitious version and let reality reveal the trade-offs. Good/fast/cheap may no longer trade off. 14. Assume capability overhang everywhere: re-test your tools and workflows against every new model — usage patterns that failed on Opus 4 are trivial now. 15. Treat knowledge work as "a folder of code, scripts, and data controlled by an agent" — ask which of your workflows (video, docs, analysis) can be restructured that way. 16. Empathize with the model: model + harness + world + you, not just model + harness.

---

## Notable Quotes

> "Models don't get smarter in a straight line. They get smarter in unexpected ways."

> "What if you were less reasonable? Ask reality to show you what the trade-offs are."

> "Is good, fast, and cheap still a trade-off? Maybe not."

> "We are hobbling Claude… it doesn't know how to unhobble itself."

> "This is what knowledge work is increasingly becoming: a folder of code and scripts and data controlled by an agent."

> "I often find that I don't know what I want when I'm building something."

> "We oversimplify agentic engineering — 'it's just prompts, it's just loops.' No: we need to know what we're doing."

> "You probably have a lot of unknown unknowns, and you're probably not being ambitious enough as a result."

> "How do you figure out [which format/tool unlocks the model]? I don't have a science for you. That's maybe the trillion-dollar question."

---

## Critical Read (what to take with salt)

- **It's a draft talk** — he says repeatedly the ideas are mid-formation ("bear with me," "I need to think on it more"). The frameworks (HAI, four-way empathy, unknown-unknowns grinding) are directionally strong but not systematized; he openly admits there's no science for finding capability unlocks.
- **Incentive alignment:** an Anthropic employee arguing "the model is more capable than you think, the bottleneck is you" is also the most commercially convenient framing for a model vendor. That said, the Pokémon and AskUserQuestion examples are concrete and falsifiable, and the "we haven't earned our valuations" opener cuts against pure boosterism.
- **The video-editing demo** is real but survivor-biased — you're seeing video #2 after he closed the color-grading gap; the workflow's failure modes (how many bad cuts, how much steering) aren't shown.
- The transcript garbles some names (auto-captions): "Stark" = Thariq, "cloud code" = Claude Code, "cloud tag" = Claude tag (Claude in Slack), the two Pokémon names are mangled.
