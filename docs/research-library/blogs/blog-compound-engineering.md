<!-- research-library/blogs/blog-compound-engineering.md -->

https://every.to/source-code/my-ai-had-already-fixed-the-code-before-i-saw-it

# My AI Had Already Fixed the Code Before I Saw It

**By Kieran Klaassen** | Source Code (Every)
August 18, 2025

_Compounding engineering turns every pull request, bug fix, and code review into permanent lessons your development tools apply automatically._

---

## The Opening

Before I opened my laptop, the code had reviewed itself.

I launched GitHub expecting to dive into my usual routine—flag poorly named variables, trim excessive tests, and suggest simpler ways to handle errors. Instead, I found a few strong comments from Claude Code, the AI that writes and edits in my terminal:

> "Changed variable naming to match pattern from PR #234, removed excessive test coverage per feedback on PR #219, added error handling similar to approved approach in PR #241."

In other words, Claude had learned from three prior months of code reviews and applied those lessons without being asked. It had picked up my tastes thoroughly, the way a sharp new teammate would—and with receipts.

It felt like cheating, but it wasn't—it was compounding. Every time we fix something, the system learns. Every time we review something, the system learns. Every time we fail in an avoidable way, the system learns. That's how we build Cora, Every's AI-enabled email assistant, now: Create systems that create systems, then get out of the way.

## Defining Compounding Engineering

I call this **compounding engineering**: building self-improving development systems where each iteration makes the next one faster, safer, and better.

Typical AI engineering is about short-term gains. You prompt, it codes, you ship. Then you start over. Compounding engineering is about building systems with memory, where every pull request teaches the system, every bug becomes a permanent lesson, and every code review updates the defaults. AI engineering makes you faster today. Compounding engineering makes you faster tomorrow, and each day after.

Three months of compounding engineering on Cora have completely changed the way I think about code. I can't write a function anymore without thinking about whether I'm teaching the system or just solving today's problem. Every bug fix feels half-done if it doesn't prevent its entire category going forward, and code reviews without extractable lessons seem like wasted time.

> When you're done reading this, you'll have the same affliction.

## The 10-Minute Investment That Pays Dividends Forever

Compounding engineering asks for an upfront investment: You have to teach your tools before they can teach themselves.

### Example: Building a Frustration Detector

Klaassen is building a "frustration detector" for Cora; the goal is for the AI assistant to notice when users get annoyed with the app's behavior and automatically file improvement reports. A traditional approach would be to write the detector, test it manually, tweak, and repeat.

Instead, the compounding approach:

1. **Start with a sample conversation** where frustration is expressed—repeatedly asking the same question with increasingly terse language
2. **Hand it to Claude** with a simple prompt: "This conversation shows frustration. Write a test that checks if our tool catches it."
3. **Claude writes the test. It fails** — the natural first step in test-driven development (TDD)
4. **Tell Claude to write the detection logic.** It still doesn't work perfectly — also expected
5. **The beautiful part:** Tell Claude to iterate on the frustration detection prompt until the test passes

Claude adjusts the prompt and runs the test again. It reads the logs, sees why it missed a frustration signal, and adjusts again. After a few rounds, the test passes.

But AI outputs aren't deterministic—a prompt that works once might fail the next time.

So Claude runs the test **10 times**. When it only identifies frustration in four out of 10 passes, Claude analyzes why it failed the other six times. It studies the chain of thought from each failed run and discovers a pattern: It's missing hedged language a user might use, like "Hmm, not quite," which actually signals frustration when paired with repeated requests. Claude then updates the original frustration-detection prompt to specifically look for this polite-but-frustrated language.

On the next iteration, it's able to identify a frustrated user **nine times out of 10**. Good enough to ship.

The entire workflow—from identifying frustration patterns to iterating prompts to validation—is codified in **CLAUDE.md**, the special file Claude pulls in for context before each conversation. The next time they need to detect a user's emotion or behavior, they don't start from scratch. They say: "Use the prompt workflow from the frustration detector." The system already knows what to do.

## The Five-Step Playbook

### Step 1: Teach Through Work

Capture decisions in **CLAUDE.md** (context file) and **llms.txt** (architectural decisions). These files translate personal preferences into permanent system knowledge. Rather than repeating preferences, encode them once—like "guard clauses over nested ifs" or naming conventions—so Claude applies them automatically.

While the internet is full of "ultimate CLAUDE.md files" you can copy, **your context should reflect your codebase, your patterns, and your hard-won lessons. Ten specific rules you follow beat 100 generic ones.**

### Step 2: Turn Failures Into Upgrades

When bugs surface, resist the urge to merely fix and move on. Instead:

- Write tests preventing recurrence
- Update monitoring rules
- Build evaluations ensuring the **category** of failure stops happening

This converts one-off problems into permanent system safeguards.

### Step 3: Orchestrate in Parallel

Deploy multiple Claude instances simultaneously across specializations:

- **Terminal 1:** Planning/research
- **Terminal 2:** Frontend UI development
- **Terminal 3:** Backend API creation / implementation
- **Terminal 4:** Testing
- **Terminal 5:** Documentation
- **Human role:** Orchestration and architectural review

This mirrors having specialized team members working in parallel rather than sequentially.

### Step 4: Keep Context Lean But Yours

Resist copying generic context files. Build documentation reflecting actual codebase patterns and hard-won lessons. Prune regularly—living context means deleting what no longer serves.

### Step 5: Trust the Process, Verify Output

Resist micromanaging every output. Instead, establish test suites, evaluation frameworks, and spot checks. When something fails, teach the system why rather than manually fixing it each time.

## The Compounding Loop

The system learns through a virtuous cycle:

1. Claude writes tests based on examples
2. Tests fail initially (expected in TDD)
3. Claude adjusts prompts iteratively based on test results
4. After multiple runs, patterns emerge in failures
5. Prompts update to address discovered gaps
6. Success rates improve through accumulated refinement
7. The entire workflow gets codified for reuse

> "If you did not codify, you only shipped code once. If you codify, you shipped capability."

## Results

In three months running compound engineering on Cora:

- **Time-to-ship** on features dropped from over a week to 1-3 days on average
- **Bugs caught before production** increased substantially
- **Pull request review cycles** that used to drag on for days now finish in hours
- **Two engineers** produce output equivalent to a 15-person team

## The Mindset Shift

This approach transforms engineering identity. Rather than coding features individually, engineers become designers of systems that design systems. Each improvement compounds permanently—unlike traditional development where lessons evaporate once code ships.

Kent Beck observed: "90% of traditional programming is becoming commoditised. The other 10%? It's now worth 1000x more." The skills that matter now are system thinking, orchestration capability, architectural judgment, and the ability to manage AI agents like a tech lead manages humans.

---

## Article Comments (Notable)

- **Ross K:** "As a non-developer, I am able to share your article with Claude Code, discuss how it applies to our project, and (hopefully) implement it correctly."
- **@blaine.wishart:** "The TDD cycle here is on a different level than TDD in Smalltalk 20 years ago, but the spirit is the same."
- **Peter Orlovacz:** "It is just a list of well-known (does not mean always practiced) good engineering practices for engineers. Of course, replacing humans with machines may speed up the feedback cycle."
- **@CloudNeato:** "It would be great to see a follow piece that talks more about recruiting/hiring/onboarding a first engineer in a 'compounding engineering' environment."

---

## BuildOS Insights & Takeaways

### Core Thesis

**Compounding engineering** is the practice of building self-improving development systems where every PR, bug fix, and code review becomes a permanent lesson that AI tools apply automatically. The key distinction from typical AI engineering: instead of prompt-code-ship-repeat, you build systems with memory that get better over time.

### Why This Matters for BuildOS

This article is **directly relevant** to BuildOS at multiple levels — both as a development methodology we should follow, AND as a product philosophy that validates our core thesis.

#### 1. BuildOS IS Compounding Engineering for Life/Work

The central promise of BuildOS — that context compounds over time — is the exact same principle Klaassen describes for code:

| Compounding Engineering            | BuildOS                                    |
| ---------------------------------- | ------------------------------------------ |
| Every PR teaches the system        | Every brain dump teaches the system        |
| Bug fixes become permanent lessons | Task completions become pattern knowledge  |
| CLAUDE.md encodes developer taste  | Project context encodes user preferences   |
| Code reviews update defaults       | Daily briefs surface evolved understanding |
| Systems that create systems        | Context that creates context               |

> "Every time we fix something, the system learns. Every time we review something, the system learns."

This IS the BuildOS thesis. We should be using this language.

#### 2. The "10-Minute Investment" Framing

Klaassen's framing of compounding engineering as a "10-minute investment that pays dividends forever" is exactly how we should position brain dumps and context building:

- **Brain dump = teach through work.** Users invest 5 minutes of stream-of-consciousness, and the system extracts permanent context.
- **Task completion = turn failures into upgrades.** When users complete or restructure tasks, the system learns what actually works for them.
- **Daily briefs = the compounding output.** The brief gets smarter because the context it draws from gets richer.

**BuildOS should:** Explicitly frame the user's initial effort as "investment" not "work." The payoff compounds.

#### 3. "Keep Context Lean But Yours"

> "Ten specific rules you follow beat 100 generic ones."

This validates our approach of user-specific context over generic templates. BuildOS doesn't give users a one-size-fits-all productivity system — it learns THEIR patterns, THEIR projects, THEIR way of thinking.

**BuildOS should:**

- Emphasize that the system learns YOUR patterns, not generic ones
- Prune stale context automatically (context that no longer serves)
- Surface the most relevant context at decision points (Project Lens does this)

#### 4. The Frustration Detector Pattern = BuildOS Intelligence

The frustration detector workflow maps perfectly to how BuildOS should build user intelligence:

1. **Observe** user behavior patterns (brain dumps, task completion rates, project engagement)
2. **Test** hypotheses about what the user needs (daily brief suggestions, task prioritization)
3. **Iterate** on the model based on what the user actually does
4. **Codify** the learnings into permanent user context

**BuildOS should:** Build this feedback loop explicitly. When a user ignores a daily brief suggestion, that's signal. When they consistently complete certain types of tasks first, that's signal. The system should learn and adapt.

#### 5. Parallel Orchestration = Multi-Project Management

Klaassen runs multiple Claude instances (frontend, backend, testing, docs) in parallel. BuildOS users manage multiple projects in parallel. The principle is the same: **specialized focus with unified orchestration.**

**BuildOS should:**

- Help users think about their projects as "parallel streams" like agent terminals
- Surface cross-project dependencies and conflicts
- Provide the "orchestration layer" — the human stays in the strategic role

#### 6. The Identity Shift

> "Engineers become designers of systems that design systems."

For BuildOS users, the equivalent shift is: **You stop being a task-doer and become a system-builder for your own life.** Instead of checking off to-do lists, you build a system that understands your goals, surfaces the right tasks, and compounds your progress.

**BuildOS should:** Help users see themselves as "system builders" not "task checkers." This is aspirational and empowering.

### Key Quotes for BuildOS

> "Typical AI engineering is about short-term gains. You prompt, it codes, you ship. Then you start over. Compounding engineering is about building systems with memory."

> "Every bug fix feels half-done if it doesn't prevent its entire category going forward, and code reviews without extractable lessons seem like wasted time."

> "If you did not codify, you only shipped code once. If you codify, you shipped capability."

> "Ten specific rules you follow beat 100 generic ones."

> "Create systems that create systems, then get out of the way."

### Implications for Our Development Process

This isn't just a product philosophy article — it's a **development methodology article**. We should be practicing compounding engineering on BuildOS itself:

1. **Our CLAUDE.md already does this** — we encode patterns, conventions, and architectural decisions
2. **Our test suites should compound** — every bug should produce a test that prevents its category
3. **Our agent workflows should orchestrate** — we already use the compound-engineering plugin for parallel agents
4. **Our documentation should be living** — prune what's stale, codify what works

### Summary: Klaassen's Principles Applied to BuildOS

1. **Teach through work** — Brain dumps ARE teaching the system. Frame it that way.
2. **Turn failures into upgrades** — Every stalled project, ignored brief, or abandoned task is learning signal.
3. **Orchestrate in parallel** — Help users manage multiple life-streams like parallel agents.
4. **Keep context lean but yours** — User-specific context beats generic templates. Always.
5. **Trust the process, verify output** — Build user confidence in the system's recommendations over time.

### Content/Marketing Angle

This article validates BuildOS's positioning perfectly. We should:

- Reference "compounding" language in our messaging (we already do somewhat)
- Position brain dumps as "10-minute investments that pay dividends"
- Use the contrast: "Other tools make you productive today. BuildOS makes you productive tomorrow, and each day after."
- Blog post opportunity: "Compound Engineering for Your Life" — applying Klaassen's principles beyond code
