<!-- docs/marketing/social-media/daily-engagement/2026-03-26_linkedin-warmup.md -->

# LinkedIn Warmup - March 26, 2026

**Date:** 2026-03-26
**Scan Time:** ~10:30 AM EST

---

## Priority Summary

| #   | Author              | Topic                                    | Post URL                                                                          | Age  | Comments | Score | Why                                          |
| --- | ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ---- | -------- | ----- | -------------------------------------------- |
| 1   | Kyle Fugere         | Claude Code context window management    | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7443113505852948480/) | ~10m | 0        | 92    | Context engineering in practice, ultra fresh |
| 2   | Harshkumar Vekariya | Context engineering = core discipline    | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7443114777406607360/) | ~25m | 0        | 92    | DJ's thesis in someone else's words          |
| 3   | Ethan Mollick       | Coding agent built a Rust webcam app     | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7443092465009651714/) | ~1h  | 7        | 88    | Tier 1 account, still low comments           |
| 4   | Ana de Moraes       | ADHD + Claude = 200 emails into pipeline | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7443081780812845059/) | ~2h  | 0        | 83    | ADHD pillar gold, zero competition           |
| 5   | Nikunj K.           | Claude Code + MCP expense automation     | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7443112664169373696/) | ~33m | 2        | 83    | VC partner (18K followers), MCP relevance    |
| 6   | Dan Shipper         | "Plus Ones" - OpenClaw in Slack launch   | [Link](https://www.linkedin.com/feed/update/urn:li:activity:7442953865685286914/) | ~10h | 13       | 67    | Tier 1 account, agent tools space            |

---

## 1. Kyle Fugere - Claude Code Context Window Management

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7443113505852948480/

**Author:** Kyle Fugere | COO - Flipside Crypto | 3rd+

**The Post:**

> This afternoon I was using Claude Code with Flipside's API to analyze Hyperliquid traders. The query below returned 68,276 rows. Claude saw about 30 lines.
>
> We prevent the API from blowing up the context window by providing a download endpoint that returns a presigned S3 URL instead of raw data.
>
> The workflow:
> Agent creates and executes a SQL query via the API > Polls until the query completes > Gets a temporary S3 URL from the download endpoint > Pipes curl into a Python script inside one shell command
>
> That last step is critical. 68K rows stream through the subprocess where Python filters and aggregates. Only the final summary makes it back to the agent. No pagination either. Most APIs make you loop through results 100 rows at a time. Here you get the full dataset in one download. 68K rows or 500K rows, same single request.

**Stats:** ~2 reactions, 0 comments (~10m old)

**Why This Post:**
This is context engineering in practice. Kyle solved the exact problem DJ talks about: AI is smart but you need to manage what context it sees. "We prevent the API from blowing up the context window" is engineering context, not just prompting. DJ builds APIs and agent workflows daily with Claude Code - this is his world. Ultra fresh, zero competition.

**Option A (Value-add):**

> The context window management part is the real insight here. Same pattern I keep hitting building AI tools - the model is smart enough, it's the context you feed it that determines whether you get something useful or garbage. Streaming through a subprocess and only sending the summary back is clean.

**Option B (Cheerleader + short):**

> "Only the final summary makes it back to the agent" - that's the whole game right there. Smart approach to keeping the context window useful instead of just full.

---

## 2. Harshkumar Vekariya - Context Engineering Is the Core Discipline

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7443114777406607360/

**Author:** Harshkumar Vekariya | Senior AI Software Engineer @ Apexon Labs | Ex-Accenture

**The Post:**

> Context engineering is becoming the core discipline behind building reliable AI agents.
>
> Prompt engineering was never the full story. It has always been a subset of something larger: managing the context passed to LLMs at every step of an agentic system.
>
> An agent is only as good as the context it receives.
>
> But adding more context is not the solution. Too much information introduces failure modes:
>
> - context poisoning
> - context distraction
> - context confusion

**Stats:** 2 reactions, 0 comments (~25m old)

**Why This Post:**
"An agent is only as good as the context it receives" is literally DJ's thesis. The failure modes listed (poisoning, distraction, confusion) map to what DJ sees building BuildOS - throwing all tools at AI doesn't work, you need the right context for the job. Ultra fresh, zero competition, perfect alignment.

**Option A (Value-add):**

> Been building in this space and "an agent is only as good as the context it receives" is the thing I keep coming back to. The failure modes are real - context distraction especially. I was doing API integrations before "AI tool use" was trendy and the lesson was always the same: more data isn't better, the right data is better.

**Option B (Cheerleader):**

> Solid breakdown. The distinction between "more context" and "right context" is the part most people skip over. Context engineering > prompt engineering is the right framing.

---

## 3. Ethan Mollick - Coding Agent Built a Rust Webcam App

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7443092465009651714/

**Author:** Ethan Mollick | Influencer | Associate Professor at The Wharton School. Author of Co-Intelligence | 800K+ followers

**The Post:**

> Great little story from Dan Shapiro about how he asked a coding agent to fix the official webcam software from Canon that kept crashing. He woke up to a new, fully functional Rust webcam app that has worked ever since.

**Stats:** 49 reactions, 7 comments, 1 repost (~1h old)

**Why This Post:**
Tier 1 account with surprisingly low comments for Mollick (only 7). The story is about a coding agent replacing broken vendor software - DJ uses coding agents daily and can relate to the "just let the agent build it" experience. Moderate brand fit (AI agents, not specifically context) but high visibility.

**Option A (Cheerleader):**

> The "woke up to a fully functional Rust app" part is wild. Been using coding agents daily to build and the overnight iteration cycle is genuinely changing how I think about what's possible as a solo builder.

**Option B (Short):**

> This is the part that's hard to explain to people who haven't experienced it yet. You go to sleep with a problem and wake up with a solution. Still catches me off guard.

---

## 4. Ana de Moraes - ADHD + Claude = 200 Emails Into Structured Pipeline

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7443081780812845059/

**Author:** Ana de Moraes | Chief of Staff | Strategic Operations & Project Management | Building AI-Powered Systems That Save 7+ Hours/Week

**The Post:**

> I just turned 200+ scattered emails into a fully operational pipeline with ~500 tasks in ClickUp with Anthropic Claude Cowork.
>
> In one sitting.
>
> I had a client refund process that lived entirely inside email threads. 54 clients, multiple contacts per company, different urgency levels, refund amounts buried in random replies, duplicates everywhere. A mess.
>
> My ADHD brain cannot work with "it's all in the emails, just scroll." I need to SEE things. I need structure. I need a board I can look at and immediately know what's happening.
>
> So I used Claude to:
>
> - Pull and cross-reference data from 200+ email threads
> - Flag duplicates, missing info, and priority mismatches
> - Build a structured spreadsheet with 5 organized tabs

**Stats:** 3 reactions, 0 comments (~2h old)

**Why This Post:**
ADHD pillar gold. "My ADHD brain cannot work with 'it's all in the emails, just scroll.' I need to SEE things. I need structure." This IS the BuildOS thesis - scattered information turned into structured context by AI. The pain point (information buried in emails, needing visual structure) is exactly what brain dumps solve. Zero competition.

**Option A (Cheerleader + ADHD connection):**

> "I need to SEE things. I need structure." This is the whole thing. The mess-to-structure pipeline is where AI actually shines. Not in doing the thinking for you, but in the organization of the chaos so you can think clearly. Really cool use case.

**Option B (Value-add):**

> This resonates hard. I've been building AI tools around this exact problem - people don't need more intelligence, they need their existing information structured in a way their brain can actually work with. The ADHD angle makes it even more real. How long did the full pipeline setup take?

---

## 5. Nikunj K. - Claude Code + MCP for Expense Categorization

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7443112664169373696/

**Author:** Nikunj K. | Partner at FPV Ventures | 18K followers

**The Post:**

> Step 1: Open Claude Code
> Step 2: Connect Google calendar MCP
> Step 3: Install Ramp CLI
> Step 4: All transactions categorized & memos done (removed PII).
>
> Finished 3 months of expense categorization in ~12 minutes. It's honestly that easy.
>
> What a wonderful freaking world!!

**Stats:** 9 reactions, 2 comments (~33m old)

**Why This Post:**
VC partner (18K followers = good visibility) using Claude Code + MCP to solve a real workflow problem. The step-by-step simplicity mirrors how DJ thinks about tool use - connecting the right tools to AI for specific jobs. MCP relevance to BuildOS's approach. Fresh, low competition.

**Option A (Cheerleader):**

> 3 months in 12 minutes. The MCP + CLI combo is where it clicks - connecting AI to your actual tools instead of copy-pasting data around.

**Option B (Value-add):**

> This is the pattern that keeps working. AI connected to your specific tools through MCP beats a generic chatbot every time. The specificity of the context (your calendar, your transactions) is what makes it 12 minutes instead of a whole afternoon.

---

## 6. Dan Shipper - "Plus Ones" OpenClaw Product Launch

**Post Link:** https://www.linkedin.com/feed/update/urn:li:activity:7442953865685286914/

**Author:** Dan Shipper | Co-founder / CEO at Every | Verified | 2nd connection

**The Post:**

> BREAKING! Introducing Plus Ones: A hosted OpenClaw that lives in your Slack and comes pre-loaded with Every's best tools, skills, and workflows.
>
> Set it up in one click, and use your ChatGPT subscription (or any other API key.)
>
> Connected to the Every ecosystem: Cora for email, Spiral for writing, Proof for editing.
>
> Custom skills and workflows we use and love...

**Stats:** 94 reactions, 13 comments, 12 reposts (~10h old)

**Why This Post:**
Tier 1 account launching a product in the agent tools space. The "pre-loaded with tools, skills, and workflows" approach is adjacent to BuildOS thinking - context + tools > raw AI. More crowded (13 comments) and promotional, so lower priority. Only engage if time permits.

**Option A (Cheerleader):**

> Pre-loaded skills and workflows is the right call. The setup friction is what kills most AI tool adoption. One-click to useful is how it should work.

**Option B (Curious):**

> Interesting that this is OpenClaw-based and lives in Slack. How are people using the custom skills so far? Curious which workflows get the most traction.

---

## Commenting Strategy

**Recommended Order:**

1. **Kyle Fugere** - Ultra fresh, zero competition, perfect context engineering alignment (comment NOW)
2. **Harshkumar Vekariya** - Ultra fresh, zero competition, DJ's thesis in someone else's words
3. **Ethan Mollick** - Tier 1 visibility, only 7 comments, still fresh
4. **Ana de Moraes** - ADHD pillar gold, zero competition
5. **Nikunj K.** - Fresh, MCP alignment, VC visibility (18K followers)
6. **Dan Shipper** - Only if time, 13 comments already, promotional

**Timing Notes:**

- Posts 1, 2, 5 are all <35 min old: Comment ASAP (first hour is critical on LinkedIn)
- Post 3 (Mollick) at ~1h: Still excellent timing, comment within the hour
- Post 4 (Ana) at ~2h: Good timing, zero competition makes up for age
- Post 6 (Shipper) at 10h: Lower urgency, moderate competition

**Spacing:** 15-30 min between comments

---

## New Accounts Discovered

Accounts from search/feed worth adding to engagement tiers:

| Account             | Followers | Theme                                        | Suggested Tier | Why                                                                    |
| ------------------- | --------- | -------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| Kyle Fugere         | Unknown   | Claude Code, crypto data, context management | 3              | COO building real workflows with Claude Code, context-aware API design |
| Ana de Moraes       | Unknown   | ADHD, AI systems, operations                 | 3              | ADHD + AI productivity, Chief of Staff building AI-powered systems     |
| Nikunj K.           | 18K       | VC, Claude Code, MCP workflows               | 3              | VC partner actively using and promoting Claude Code + MCP              |
| Harshkumar Vekariya | Unknown   | Context engineering, AI agents               | 3              | Posting about context engineering regularly, check frequency           |

### Account Details

#### Kyle Fugere - COO at Flipside Crypto

**Role:** COO - Flipside Crypto
**Content Themes:** Claude Code workflows, API design, context window management, crypto data analysis
**Recent Post That Stood Out:**

> "We prevent the API from blowing up the context window by providing a download endpoint that returns a presigned S3 URL instead of raw data."

**Why Add to Tier 3:**
Builder who understands context engineering at the infrastructure level. His API design choices (streaming, aggregation, context-aware endpoints) align with DJ's "context > tools" philosophy. Check posting frequency before upgrading.

#### Ana de Moraes - Chief of Staff / AI Systems Builder

**Role:** Chief of Staff | Strategic Operations & Project Management
**Content Themes:** ADHD productivity, AI-powered operational systems, Claude workflows
**Recent Post That Stood Out:**

> "My ADHD brain cannot work with 'it's all in the emails, just scroll.' I need to SEE things. I need structure."

**Why Add to Tier 3:**
ADHD + AI systems builder. Her audience directly overlaps with BuildOS target users. "Building AI-Powered Systems That Save 7+ Hours/Week" is adjacent to BuildOS positioning. Good potential cross-pollination.

#### Nikunj K. - Partner at FPV Ventures

**Role:** Partner at FPV Ventures | 18K followers
**Content Themes:** Claude Code, MCP, AI tool workflows, VC perspective on AI
**Recent Post That Stood Out:**

> "Finished 3 months of expense categorization in ~12 minutes. It's honestly that easy."

**Why Add to Tier 3:**
VC partner actively building with Claude Code + MCP. High follower count means good visibility for DJ's comments. Check if he posts regularly about AI tools.

---

## Tier 1 Account Scan Summary

| Account         | Latest Post                         | Age | Status                                   |
| --------------- | ----------------------------------- | --- | ---------------------------------------- |
| Ethan Mollick   | Coding agent built Rust webcam app  | 1h  | **Engageable** (7 comments)              |
| swyx            | Not checked                         | N/A | Historically reposts only on LinkedIn    |
| Dan Shipper     | "Plus Ones" OpenClaw launch         | 10h | Engageable but promotional (13 comments) |
| Lenny Rachitsky | PM openings at highest in 3 years   | 1d  | Too crowded (63 comments)                |
| Sahil Lavingia  | Gumroad office open house           | 1w  | Not relevant, stale                      |
| Greg Isenberg   | Not checked                         | N/A | Need correct LinkedIn profile            |
| Harrison Chase  | Agent middleware / LangChain promos | 10h | Promotional, not ideal                   |
| Simon Willison  | Not checked                         | N/A | Very infrequent on LinkedIn              |

---

## Voice Reminder

### The 3 Rules

1. Can I visualize it? (Specific details, not abstractions)
2. Can I falsify it? (Real experience you could defend)
3. Can nobody else say this? (Use your unique experience)

### LinkedIn-Specific

- Longer, more nuanced than Twitter
- Professional but authentic
- Learning voice, not authoritative
- 2-4 sentence comments minimum
- Ask questions to open dialogue

### Today's Modes

- Post 1 (Kyle): **Value mode** - context window management is your daily reality building with Claude Code
- Post 2 (Harshkumar): **Value mode** - context engineering is your core positioning, share the Curri integrations angle
- Post 3 (Mollick): **Cheerleader mode** - quick reaction as a daily coding agent user
- Post 4 (Ana): **Value mode** with ADHD connection - this IS your product thesis (structure from chaos)
- Post 5 (Nikunj): **Cheerleader mode** - hype the MCP + CLI workflow, short and sweet
- Post 6 (Shipper): **Cheerleader + curious** - only if time permits

---

**Created:** 2026-03-26 ~10:30 AM EST
**Next Scan:** 2026-03-27
