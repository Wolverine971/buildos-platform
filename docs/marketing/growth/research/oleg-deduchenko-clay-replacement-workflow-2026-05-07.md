<!-- docs/marketing/growth/research/oleg-deduchenko-clay-replacement-workflow-2026-05-07.md -->

# Oleg Deduchenko / Clay Replacement Workflow Notes

> Date: 2026-05-07
> Source: LinkedIn post by Oleg Deduchenko
> Link: https://www.linkedin.com/posts/oleg-deduchenko-138298166_i-cancelled-my-800mo-clay-plan-last-month-activity-7454855405710753792-o5Sh
> Purpose: capture the post details and reverse engineer the workflow at a high level for BuildOS thinking.

## Why this matters

This is a strong example of the market moving from rigid enrichment SaaS toward agent-shaped, owner-controlled workflows.

BuildOS implication: the interesting part is not "Claude Code replaced Clay." The interesting part is that a conversational operator loop now orchestrates ingestion, normalization, enrichment, research, scoring, and campaign launch over owned data infrastructure.

## Post details (copied)

Oleg Deduchenko’s Post

1w

Edited

I cancelled my $800/mo Clay plan last month.

My pipeline got better. And it even talks to me.

I replaced it with a $100/mo Claude Code subscription. Here's why you should too ↓

Look - Clay is a great product. It helped me get to where I'm at and most people starting out should try it.

But once you scale, the walls close in fast...

- 50,000 row cap per table
- Performance lags at 30-40 columns
- Credits expire every month
- Need more mid-cycle? 30% premium
- Custom API calls? $495 plan minimum
- Real support? Enterprise only
- Bring your own API key? They still charge per Action

So we built our own system in Claude Code at OneAway. And...
It works.

Here's what it does ↓

- Uploads CSVs, auto-detects the source, and normalizes everything into a Postgres database I own
- Cleans company names, contact names, job titles - strips taglines, fixes ALL CAPS, removes junk leads
- Runs MX lookups on every domain to classify Google vs Microsoft vs other - before I send a single email
- Scrapes company websites through an LLM to extract competitors, ICP, pricing, and product categories - ~$0.01 per company
- Deep Research mode that hits Google 3 ways, runs semantic search, pulls review sites, and synthesizes through Llama 70B - ~$0.01 per company
- Detects whether a company is already running cold email by analyzing domain redirects
- Finds decision-makers, verifies emails, scores them against a custom ICP rubric I build conversationally
- Connects to any API I want. I point Claude at the docs and the integration exists in minutes
- When enrichment is done, another agent writes the sequences, builds the campaign, and launches it — same chat window

We didn't plan to build all of this. But once we started, we couldn't stop.

Every new capability costs almost nothing to add. My data lives in Postgres - not in someone else's spreadsheet with a 50K row cap.

I just speak English to my terminal to understand what's happening across every client database.

Clay is now built for enterprise. It no longer serves most of you reading this.
And that's fine - because I put together the full blueprint →

- Every tool
- The Claude Code Skill file
- The integrations
- A Clay vs custom cost comparison
- A walkthrough of how each piece works

Like the post and drop "LFG" in the comments and I'll DM you the access link.

Make sure we are connected so I could DM you.

## Reverse-engineered workflow

At a high level, this looks like a conversational outbound ops stack with agent orchestration on top of owned data.

### 1) Lead ingestion

Inputs:

- CSV uploads from multiple lead sources
- likely exported lists from Apollo, Clay, LinkedIn scraping, event lists, or data vendors

System behavior:

- detect source format
- map columns into a canonical schema
- load into Postgres

Likely primitives:

- file upload
- source classifier
- field mapper
- normalization jobs
- dedupe keys on domain, company, person, linkedin url, or email

### 2) Data cleaning and normalization

Core operations:

- normalize company names
- clean contact names
- standardize titles
- strip junk text/taglines
- remove obviously bad rows

Likely implementation:

- deterministic cleanup rules first
- LLM cleanup only where heuristics fail
- queue-based enrichment passes over records

### 3) Domain and mail-system enrichment

Core operations:

- MX lookup per domain
- classify provider: Google, Microsoft, other

Why it matters:

- useful for deliverability strategy
- useful for segmenting infra patterns before outreach

### 4) Website and company research

Core operations:

- crawl or fetch company website
- extract ICP clues, competitors, pricing, categories
- synthesize into structured fields

Likely implementation:

- fetch homepage + key nav pages
- LLM extraction into JSON
- persist structured attributes back to company record

### 5) Deep research layer

Core operations:

- query Google multiple ways
- run semantic search/relevance pass
- pull review or third-party sites
- synthesize findings via model

Likely output:

- richer company profile
- stronger personalization inputs
- better ICP scoring confidence

### 6) Cold-email detection

Core operations:

- inspect domain redirects / tracking behavior
- infer whether company already runs outbound

Likely value:

- stronger segmentation
- avoid irrelevant messaging
- tune offer based on outbound maturity

### 7) Contact finding and verification

Core operations:

- find decision-makers
- verify emails
- rank contacts against custom ICP rubric

Notable product detail:

- the ICP rubric is described as conversationally defined, which means the operator can update scoring logic in plain English instead of hard-coding every rule first.

### 8) API extensibility layer

Claim:

- point Claude at API docs and integration exists quickly

Real interpretation:

- agent can scaffold connectors and transforms fast
- value comes from fast integration iteration, not zero-engineering magic

### 9) Sequence writing and campaign launch

Core operations:

- downstream agent writes sequences
- builds campaign
- launches from same interface

This implies:

- enrichment output feeds copy generation
- there is probably a campaign object model
- there is likely some human review checkpoint, even if the post does not mention it

## Inferred system architecture

Probable stack:

- Postgres as source of truth
- agent or coding harness for workflow creation and ops control
- enrichment workers/jobs
- search/scraping providers
- email verification provider
- sending / sequencing platform or direct outbound infra
- conversational control surface in terminal/chat

The real pattern is:

1. owned database
2. modular enrichment jobs
3. plain-English operator control
4. cheap incremental capability expansion

## Why this works better than Clay for this operator

The post’s real argument is not just price.

It is control:

- owned schema
- owned database
- no row cap pressure
- no per-action pricing trap
- easier custom enrichment
- easier workflow mutation
- one conversational interface across the whole stack

## BuildOS takeaways

Potentially relevant ideas for BuildOS:

- conversational workflow authoring over real data systems
- operator-visible pipelines instead of spreadsheet-shaped automation
- structured research/enrichment loops that turn messy external info into stable records
- persistent memory around scoring rubrics, enrichment logic, and campaign patterns
- agent handoffs between ingestion, research, scoring, and execution stages

Important distinction:
BuildOS should not copy the "AI SDR machine" framing. The durable product lesson is that people want a thinking environment that can operate over owned workflows and data, not just a chat box or brittle no-code table.

## Open questions

Things the post does not tell us:

- what sends the outbound emails
- what provider handles email verification
- how much of the workflow is deterministic vs LLM-based
- whether there is a review/approval step before launch
- how errors, retries, and bad data are handled
- whether the "same chat window" is terminal-native, custom UI, or both

## Suggested next step

If we want, next pass should turn this into:

1. a more explicit system diagram
2. a guessed tool/vendor stack
3. a BuildOS product-opportunity memo: what to borrow, what to avoid, and where our angle differs
