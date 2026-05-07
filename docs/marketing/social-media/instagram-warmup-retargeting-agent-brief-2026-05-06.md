<!-- docs/marketing/social-media/instagram-warmup-retargeting-agent-brief-2026-05-06.md -->

# Instagram Warmup Retargeting Agent Brief

**Date:** 2026-05-06
**Purpose:** One-off research assignment to find stronger non-ADHD Instagram accounts, topics, search terms, hashtags, posts, and comment sections for future `@djwayne3` warmup runs.
**Status:** Ready to give to a research agent.

---

## Short Version

The current Instagram warmup system is still ADHD-first in practice.

That made sense when BuildOS was framed as an ADHD productivity OS, but current brand strategy now leads with:

> **BuildOS is a thinking environment for people making complex things.**

The better Instagram target is no longer primarily ADHD creators. ADHD should remain a supporting affinity lane, not the first scan lane.

This research pass should find where Instagram has people who feel the pain of:

- messy thinking
- scattered notes, docs, tasks, AI chats, screenshots, sources, and plans
- project context getting lost
- restarting from zero every time they return to work
- too many projects, ideas, clients, videos, posts, or creative assets
- AI workflows that work once but do not compound

The agent should not comment, like, follow, DM, or draft final comments.

---

## Current State Assessment

### Current Command Behavior

`.claude/commands/instagram-warmup.md` is a Stage 1 research and queueing command. It:

1. verifies the active account is `@djwayne3`
2. reads brand, founder, Instagram voice, strategy, targets, and profile docs
3. checks notifications, stories, and feed
4. scans priority sources
5. creates or updates profile memory
6. queues 5-7 engagement opportunities for `/instagram-reply`

The command explicitly says Phase 3 should scan in this order:

1. Tier 1 ADHD and neurodivergent accounts
2. Tier 1 solo founders, solopreneurs, AI builders, and PKM accounts
3. Watering-hole accounts and their comment sections
4. Competitors and adjacent products
5. Hashtag pages
6. Explore page
7. Reels feed

Because ADHD is first, the agent naturally fills the queue with ADHD content before it reaches better-fit BuildOS audiences.

### Current Target Docs

`docs/marketing/social-media/instagram-engagement-targets.md` still has this section title:

> **ADHD/Neurodivergent Creators (PRIMARY)**

It also says:

> "The ADHD community on Instagram is massive, tight-knit, and highly engaged. This is where BuildOS's audience lives."

That conflicts with the newer brand guide and growth plan.

`docs/marketing/social-media/instagram-niche-expansion-research.md` already identified the needed pivot:

- ADHD accounts are awareness/coping focused
- direct competitors already own ADHD-tool positioning
- BuildOS's "dump chaos -> get clarity" promise resonates beyond ADHD
- solo founders, solopreneurs, PKM people, and AI workflow builders are better aligned

### Recent Warmup Evidence

Recent completed runs confirm the ADHD-first bias:

- `2026-05-03_instagram-warmup.md`: 3 of 6 queued opportunities were ADHD-first accounts.
- `2026-05-05_instagram-warmup-evening.md`: 2 of 5 queued opportunities were ADHD-first accounts.
- `2026-05-06_instagram-warmup-pm.md`: 4 of 6 queued opportunities were ADHD-first accounts.

Across those completed May runs, roughly half the queue is still ADHD. The newest real run is even more skewed toward ADHD.

### Current Operational Issue

The home feed for `@djwayne3` is not surfacing strategic BuildOS content. Recent warmup logs repeatedly say the feed is anchored to personal, Marines, lifestyle, and IRL content.

So discovery cannot depend on the home feed. The next agent should use direct search, profile graph exploration, Reels search, hashtags, and comment-section mining.

---

## Strategic Pivot

### New Audience Priority

Prioritize accounts and posts in this order:

1. **Creators making complex things**
   Authors, YouTubers, podcasters, newsletter operators, course creators, educators, documentary/video creators, and creator-founders.

2. **AI workflow builders and AI-native operators**
   People using Claude, ChatGPT, Codex, agents, custom GPTs, Notion AI, or automation to run real projects.

3. **PKM, second brain, Notion, Obsidian, and digital organization people**
   Especially people who show the maintenance burden, stale notes, tool sprawl, or "my system fell apart" pain.

4. **Solo founders and solopreneurs**
   Prefer operators with real product, service, content, or community work over generic motivational accounts.

5. **Freelancers, agency owners, creative business owners**
   People juggling multiple clients, assets, revisions, deadlines, and content calendars.

6. **ADHD / scattered-mind accounts**
   Keep as supporting affinity only. Engage when a post is unusually relevant, has very low comment competition, or comes from an existing relationship worth maintaining.

### What To Deprioritize

The agent should not make ADHD the default scanning lane.

Downgrade these to monitor/supporting unless the post is exceptional:

- generic ADHD trait prompts
- broad ADHD memes
- emotional vulnerability posts where any BuildOS angle would be awkward
- ADHD coaches posting general awareness content
- mega ADHD accounts where comments are relationship-light

Still keep:

- specific executive-function posts that map cleanly to project restart friction
- creator/founder ADHD posts where the person is also building a business, book, course, or creative body of work
- existing relationship accounts where a low-risk touchpoint helps maintain continuity

---

## What The Agent Should Produce

Create one output file:

`docs/marketing/social-media/instagram-non-adhd-discovery-YYYY-MM-DD.md`

Use the actual date of the run.

The output should include:

1. **Executive Summary**
    - strongest new audience lanes
    - best accounts found
    - best search terms / hashtags
    - best posts or comment threads to engage
    - recommended changes to `instagram-warmup.md`

2. **Account Candidates**
    - 25-40 candidate accounts
    - sorted by priority
    - grouped by audience lane
    - include profile URL, handle, follower ballpark, content focus, why they fit, and suggested strategic role

3. **Immediate Engagement Queue Seeds**
    - 10-15 live posts or comment threads worth considering in the next warmup
    - include post URL, age, visible likes/comments if available, topic, account, and engagement angle
    - do not draft final comments

4. **Search Terms**
    - Instagram search phrases that produced good accounts/posts
    - separate account-search terms from post/Reels-search terms

5. **Hashtags**
    - daily hashtags
    - weekly discovery hashtags
    - hashtags to avoid because they are spammy, guru-heavy, or off-target

6. **Watering Holes**
    - big accounts whose own posts are not the target, but whose comment sections contain good prospects
    - list specific recent posts and high-signal commenters if possible

7. **Recommended Target Doc Changes**
    - accounts to add to `instagram-engagement-targets.md`
    - accounts to move down or mark monitor-only
    - sections that should be renamed or reordered

8. **Recommended Warmup Command Changes**
    - revised Phase 3 scan order
    - revised scoring weights
    - new include/skip rules

---

## Research Inputs To Read First

Read these before using Instagram:

- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `docs/marketing/social-media/FOUNDER_CONTEXT.md`
- `docs/marketing/content/drafts/why-i-built-buildos.md`
- `docs/marketing/social-media/instagram-voice-quick-ref.md`
- `docs/marketing/social-media/instagram-engagement-targets.md`
- `docs/marketing/social-media/instagram-niche-expansion-research.md`
- `docs/marketing/social-media/instagram-profiles/README.md`
- `docs/marketing/social-media/profile-seeding-task-prompts.md`

Skim recent completed warmups:

- `docs/marketing/social-media/daily-engagement/2026-05-03_instagram-warmup.md`
- `docs/marketing/social-media/daily-engagement/2026-05-05_instagram-warmup-evening.md`
- `docs/marketing/social-media/daily-engagement/2026-05-06_instagram-warmup-pm.md`

Use those to avoid rediscovering the same stale ADHD-heavy pattern.

---

## Account Fit Criteria

Score accounts higher when they meet several of these:

- they make complex creative, technical, educational, or business work
- their audience has tool-sprawl, project-memory, or messy-thinking pain
- they post Reels or carousels at least twice per week
- they have real comments, not just emoji spam
- they reply to commenters
- they are small enough that `@djwayne3` can be noticed
- they show actual workflow, behind-the-scenes, drafts, systems, notes, tools, content calendars, project planning, or client work
- they speak from practice rather than generic motivation
- their followers look like creators, builders, operators, or tool-curious people

Preferred follower bands:

- **Best:** 1K-50K
- **Still useful:** 50K-150K if comment sections are thoughtful
- **Watering hole only:** 150K+

Skip accounts that are:

- pure quote pages
- generic AI prompt listicle accounts
- faceless repost accounts
- hustle-guru pages
- meme-only accounts
- ADHD-only accounts with no builder/creator/operator overlap
- brand accounts with dead comments
- accounts where every post is a hard CTA funnel and no real discussion happens

---

## Audience Lanes To Search

### 1. Authors And Writers

Look for:

- novelists documenting drafts and revisions
- nonfiction writers building books in public
- Substack/newsletter writers
- writing coaches with active communities
- authors using Notion, Scrivener, Obsidian, Google Docs, or AI in their process

Pain signals:

- draft chaos
- research everywhere
- losing the thread
- chapter planning
- revision planning
- keeping notes organized
- turning ideas into outlines

Search terms:

- `writing workflow`
- `book writing process`
- `author workflow`
- `novel planning`
- `drafting process`
- `revision process`
- `writing systems`
- `writer productivity`
- `substack writer`
- `newsletter workflow`

Hashtags:

- `#writingcommunity`
- `#writersofinstagram`
- `#amwriting`
- `#authorsofinstagram`
- `#novelwriting`
- `#bookwriting`
- `#writingtips`
- `#substack`
- `#newslettercreator`

### 2. YouTubers And Video Creators

Look for:

- creators showing video planning, scripting, editing, thumbnails, content calendars
- creator educators teaching YouTube workflow
- small/mid-size creators talking about batching, research, ideation, and production
- people complaining about too many ideas and not enough execution

Pain signals:

- video idea backlog
- script chaos
- research notes
- content calendar overwhelm
- repurposing across Shorts, Reels, YouTube, newsletter, podcast
- project files spread across tools

Search terms:

- `youtube workflow`
- `content creation workflow`
- `video scripting`
- `content calendar`
- `creator workflow`
- `video editing workflow`
- `youtube productivity`
- `content batching`
- `creator systems`

Hashtags:

- `#contentcreator`
- `#youtuber`
- `#youtubecreator`
- `#contentcreationtips`
- `#creatoreconomy`
- `#videocreator`
- `#contentstrategy`
- `#contentcalendar`
- `#creatorworkflow`

### 3. Course Creators And Educators

Look for:

- course builders
- cohort/community operators
- educators turning knowledge into curriculum
- people showing lesson planning, student feedback, launch assets, or curriculum systems

Pain signals:

- scattered lesson ideas
- curriculum organization
- launch planning
- student feedback loops
- turning expertise into modules

Search terms:

- `course creator`
- `online course creator`
- `curriculum design`
- `community builder`
- `cohort based course`
- `creator educator`
- `digital product workflow`
- `knowledge business`

Hashtags:

- `#coursecreator`
- `#onlinecourse`
- `#digitalproducts`
- `#communitybuilder`
- `#curriculumdesign`
- `#knowledgecreator`
- `#creatorbusiness`

### 4. PKM, Second Brain, Notion, Obsidian

Look for:

- people showing actual systems, not just pretty dashboards
- Notion/Obsidian creators with thoughtful comments
- people admitting their system decays
- creators talking about capture, retrieval, action, and review

Pain signals:

- second brain maintenance burden
- note graveyards
- too many capture places
- no action from notes
- dashboards replacing work
- AI chats not connected to project memory

Search terms:

- `second brain`
- `notion setup`
- `obsidian notes`
- `notion workflow`
- `pkm`
- `personal knowledge management`
- `digital organization`
- `productivity system`
- `life os`
- `note taking system`

Hashtags:

- `#secondbrain`
- `#pkm`
- `#notion`
- `#notiontemplate`
- `#notiontips`
- `#obsidian`
- `#obsidianmd`
- `#digitalorganization`
- `#productivitysystem`
- `#lifeos`

### 5. AI Workflow Builders

Look for:

- people using Claude/ChatGPT/Codex/agents for real work
- builders showing workflows, not "top 10 tools"
- creators talking about context, memory, prompts, evaluation, and review loops
- people who understand that AI output quality depends on project context

Pain signals:

- re-explaining context
- losing useful AI answers
- prompt chains not compounding
- agents going off track
- too many AI chats
- human review burden

Search terms:

- `AI workflow`
- `Claude workflow`
- `ChatGPT workflow`
- `AI productivity`
- `AI agents workflow`
- `context engineering`
- `Claude for business`
- `AI for creators`
- `AI content workflow`
- `vibe coding`

Hashtags:

- `#aiworkflow`
- `#aiproductivity`
- `#aitools`
- `#chatgpt`
- `#claudeai`
- `#aiagents`
- `#contextengineering`
- `#vibecoding`
- `#aiforbusiness`

### 6. Solo Founders, Solopreneurs, Creator-Founders

Look for:

- people building products, communities, agencies, newsletters, courses, or service businesses
- founders showing behind-the-scenes operations
- operators with actual project load
- builders who talk about decision-making, not just revenue screenshots

Pain signals:

- too many tasks/projects
- idea overload
- launch planning
- managing content + product + support + sales
- founder context switching
- systems that break when neglected

Search terms:

- `solo founder`
- `solopreneur`
- `creator founder`
- `build in public`
- `one person business`
- `founder workflow`
- `startup workflow`
- `micro business`
- `indie business`
- `digital business owner`

Hashtags:

- `#solofounder`
- `#solopreneur`
- `#onepersonbusiness`
- `#buildinpublic`
- `#founderstory`
- `#founderlife`
- `#microbusiness`
- `#creatorfounder`
- `#digitalbusiness`

### 7. Freelancers, Agencies, Creative Operators

Look for:

- freelance designers, copywriters, editors, strategists, and agency owners
- people showing client workflows
- people managing several projects at once
- creators talking about scope, assets, revisions, approvals, and delivery

Pain signals:

- client context switching
- tracking revisions
- scattered feedback
- many active projects
- proposal / delivery / content calendars
- agency operating systems

Search terms:

- `freelance workflow`
- `agency owner`
- `client workflow`
- `creative business`
- `freelance designer`
- `copywriter workflow`
- `studio vlog`
- `agency systems`
- `client project management`

Hashtags:

- `#freelancelife`
- `#agencylife`
- `#creativebusiness`
- `#freelancetips`
- `#studiolife`
- `#servicebusiness`
- `#clientwork`
- `#agencyowner`

---

## Existing Accounts To Reassess

Use these as seed accounts, but do not limit discovery to them.

### Higher Priority Existing Non-ADHD Targets

- `@chloedigital.ai` - peer-level AI founder, good BuildOS fit
- `@dickiebush` - writing / creator systems / AI builder
- `@leaturnerholt` - solopreneur/community operator
- `@justyn.ai` - AI automation for entrepreneurs
- `@thesamparr` - founder/community watering hole
- `@startuprules` - small founder account, potential peer
- `@_obsidian.md_` - PKM / Obsidian niche
- `@gregisenberg` - AI/startup watering hole
- `@notionhq` - PKM / competitor watering hole
- `@thefuturishere` - freelancer/creative business watering hole
- `@flux.academy` - web design freelancer watering hole
- `@thedankoe` - solo-builder watering hole
- `@aliabdaal` - productivity / LifeOS watering hole

### Existing ADHD Accounts To Downgrade

Do not delete these. Move them to supporting or monitor-only unless the post has a strong specific hook:

- `@the_mini_adhd_coach`
- `@howtoadhd`
- `@adhd_alien`
- `@adhdcoachsheila`
- `@adhdjesse`
- `@danidonovan`
- `@theadhdtools`

Keep `@danidonovan` and `@theadhdtools` as competitor/intel accounts, not routine engagement defaults.

---

## Engagement Opportunity Scoring

Score each post or comment thread using this revised weighting:

| Factor               | Weight | What To Look For                                                                  |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| Audience fit         | 4x     | Creators/builders/operators who feel fragmented project-context pain              |
| Natural DJ angle     | 3x     | DJ can respond from lived building experience without performing expertise        |
| Freshness            | 3x     | Posts under 24h, ideal under 6h                                                   |
| Comment visibility   | 2x     | Low or moderate comment competition; thoughtful threads                           |
| Relationship value   | 2x     | Account is worth repeated attention                                               |
| Discovery value      | 2x     | Opens a new audience lane or comment-section graph                                |
| BuildOS category fit | 1x     | Thinking environment / project memory / context compounds can be hinted naturally |

ADHD-specific content receives no automatic priority boost. If it is only ADHD-awareness content, score it down unless there is a clear creator/builder/operator angle.

---

## Immediate Warmup Command Recommendation

After this research pass, update `.claude/commands/instagram-warmup.md` so Phase 3 scans in this order:

1. Creator/building-complex-things accounts
2. AI workflow builders and AI-native operators
3. PKM / second brain / Notion / Obsidian accounts
4. Solo founders, solopreneurs, and creator-founders
5. Freelancers, agencies, and creative operators
6. Watering-hole comment sections
7. Competitors and adjacent products
8. ADHD / scattered-mind accounts as supporting affinity
9. Hashtag pages
10. Explore page
11. Reels feed

Also change the selection rules:

- Require at least 4 of the 5-7 queued posts to come from non-ADHD lanes.
- Cap routine ADHD-first queue items at 1 per run unless there is a direct relationship signal.
- Prefer commenter-mining on large accounts over direct comments to large accounts.
- Track discovered account lanes in the warmup doc so future agents can tell whether the graph is improving.

---

## Agent Prompt

Use this exact prompt for the one-off research agent:

```text
You are running a one-off Instagram retargeting research pass for BuildOS.

Goal:
Find better Instagram accounts, topics, search terms, hashtags, posts, and comment threads for future @djwayne3 warmup runs. The strategic pivot is to deprioritize ADHD-first engagement and find people more aligned with BuildOS's current audience: creators, authors, YouTubers, course creators, AI workflow builders, PKM/second-brain people, solo founders, solopreneurs, freelancers, and creative operators making complex things.

Do not comment, like, follow, DM, save, or draft final comments.

Read first:
- docs/marketing/social-media/instagram-warmup-retargeting-agent-brief-2026-05-06.md
- docs/marketing/brand/brand-guide-1-pager.md
- docs/marketing/social-media/buildos-platform-growth-plan-2026.md
- docs/marketing/social-media/FOUNDER_CONTEXT.md
- docs/marketing/content/drafts/why-i-built-buildos.md
- docs/marketing/social-media/instagram-voice-quick-ref.md
- docs/marketing/social-media/instagram-engagement-targets.md
- docs/marketing/social-media/instagram-niche-expansion-research.md
- docs/marketing/social-media/instagram-profiles/README.md

Use Instagram search, Reels search, hashtag pages, profile graph exploration, and watering-hole comment sections. Do not rely on @djwayne3's home feed.

Primary output:
Create docs/marketing/social-media/instagram-non-adhd-discovery-YYYY-MM-DD.md.

The output must include:
1. executive summary
2. 25-40 candidate accounts grouped by audience lane
3. 10-15 live posts or comment threads that could be used in the next warmup
4. search terms that worked
5. hashtags that worked
6. watering-hole accounts and specific posts/commenters to mine
7. accounts to add, downgrade, or monitor in instagram-engagement-targets.md
8. recommended changes to .claude/commands/instagram-warmup.md

Prioritize:
1. authors, YouTubers, course creators, and creator-founders making complex things
2. AI workflow builders and AI-native operators
3. PKM / second brain / Notion / Obsidian accounts
4. solo founders and solopreneurs
5. freelancers, agencies, and creative operators
6. ADHD / scattered-mind accounts only as supporting affinity

Quality bar:
- Prefer 1K-50K follower accounts with thoughtful comments.
- Use 50K-150K accounts when the comment sections are unusually strong.
- Treat 150K+ accounts mostly as watering holes.
- Skip generic AI prompt accounts, faceless repost pages, hustle-guru content, meme-only accounts, and ADHD-only content with no creator/builder/operator overlap.
- Do not create or update profile files unless the account is clearly worth repeated attention.
- Do not draft final comments.

At the end, summarize:
- strongest new lanes
- top 10 account targets
- top 10 post/comment opportunities
- command changes you recommend
- what still needs a second pass
```

---

## Definition Of Done

The research pass is complete when it gives the next warmup agent enough material to run a non-ADHD-first queue without guessing.

Minimum useful result:

- 25 candidate accounts
- 10 live post/comment opportunities
- 20 search terms
- 20 hashtags
- 5 watering-hole posts/comment sections
- concrete command-change recommendations

Best result:

- enough evidence to rewrite `instagram-engagement-targets.md` around the current BuildOS brand strategy
- enough specific live opportunities to run the next `/instagram-warmup` with at least 80% non-ADHD queue items
