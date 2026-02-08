<!-- research-library/transcripts/podcast-dex-chroma.md -->

# Context Engineering Episode 1 - Dex Horthy

**Source:** [YouTube](https://www.youtube.com/watch?v=BNhRnx_O95c)
**Host:** Jeff Huber, CEO of Chroma
**Guest:** Dex Horthy (@dexhorthy), coined "Context Engineering"
**Date:** December 3, 2025
**Views:** 2,510

---

## Key Insights & Takeaways

### 1. Context Engineering = Information Density, Not Volume

Dex defines context engineering as "how do you get the most out of today's models" - and the core insight is that it's not just about putting the right information in, but about **keeping the context as small and dense as possible.** Not token density, but _information per token_ density. More isn't better. Denser is better.

### 2. The Deterministic Layer Is the Real Unlock

The most powerful pattern isn't pure agentic loops. It's having a fast model identify what's relevant, then a **deterministic layer** that stuffs the right context into a single prompt for an expensive model. De-emphasize the agentic loop. Pre-gather context, then make one smart call. This is the "context engineering fix" for slow, expensive tool-calling loops.

### 3. Pick One Model and Go Deep

Dex is adamant: switching between tools and models constantly caps your skill at ~80%. The people getting the best results have spent 2+ months with a single model and developed deep intuition for its behavior - when to push it, when to restructure prompts, when it'll follow six steps vs. forget step four. **Models are not swappable.** Prompts optimized for Opus break on Codex and vice versa.

### 4. Markdown + Front Matter Is the AI-Native Data Layer

Dex built his entire CRM, productivity system, and GTM stack on markdown files with YAML front matter, managed by Claude Code. Front matter lets you slice and filter deterministically without the model reading the whole file. His stack: markdown as data, prompts as business logic, slash commands as orchestration, Airtable as a human-friendly view. "Schemas are for humans, not for AI."

### 5. "Don't Rely on the Prompt for Control Flow"

The single most quotable line. If you know what the workflow steps are, don't put them all in one prompt and hope the model follows them. Break the workflow into explicit stages with explicit transitions. Dex went from "12 Factor Agents" (anti-agent) to "full-fat Claude Code agents" to now landing on **micro-agents with stage-gated workflows.** The pendulum settled in the middle.

### 6. The "Oral Tradition" Problem

Most people can't replicate expert prompting results because there's massive tacit knowledge - when to reinforce instructions, when to nudge the model back on track, what a "good session" looks like. Dex's current work is about **baking that oral tradition into the product** so you don't need 10,000 hours of prompt intuition to get expert results.

### 7. Agent Memory Is Almost Impossible to Do Generically

Building good agent memory is "really freaking hard" and nearly impossible to do as a horizontal layer. The success stories are vertical-specific: a tutoring app with "decaying resolution memory" (today's events, daily summaries for 14 days, weekly for 3 weeks, monthly for 2 months). Factual recall ("user likes X") is doable. Behavioral learning ("how to do the job better") is unsolved.

### 8. Instruction Following Has a Hard Ceiling (~150-200 Rules)

Frontier models can reliably follow about 150-200 instructions. Beyond that, attention spreads too thin and the model starts ignoring rules. This creates "instruction severity inflation" - everyone puts their rules in ALL CAPS, which de-tunes everything else. The potential fix: RAG-based rules search (retrieve relevant rules per task) instead of stuffing everything in the system prompt.

### 9. Vibes-First Eval Strategy

Don't build evals first for AI products. Capabilities are emergent - you don't know what the system can do until you build it. Instead: build the thing, vibe on it for a few days, identify the behaviors you like, then back into evals. Snapshot-based regression testing (diff outputs, accept/reject changes) is their approach. "Never send an AI to do a linter's job."

### 10. The AI-Native MVC Stack

Dex's vision for what every AI-native system needs: **(1)** Markdown as the data layer, **(2)** Prompts as business logic, **(3)** Orchestration/scheduling (cron, GitHub Actions), **(4)** Code execution + storage, **(5)** Secrets/OAuth management, **(6)** An agent harness, **(7)** Views for humans. Git is a temporary solution - CRDTs are the real answer for multi-agent collaboration.

---

## BuildOS Analysis: How This Applies

### Direct Validations

**BuildOS IS the productized version of what Dex built by hand.** The parallels are striking:

- **Dex's markdown CRM with front matter** = BuildOS's ontology system with structured documents. He's doing manually (markdown + Claude Code + Git + Airtable views) what BuildOS is building as a product. The difference: Dex needs Claude Code skills and Git knowledge. BuildOS makes this accessible to anyone.

- **"Brain dump everything, let AI organize"** = BuildOS's brain dump system is literally this pattern, productized. Dex even describes using GTD methodology implemented via Claude - BuildOS automates this extraction pipeline.

- **"Schemas are for humans, not for AI"** = Validates BuildOS's flexible ontology over rigid database schemas. The ontology system lets structure emerge from content rather than being pre-defined.

- **The "shared context layer" concept** = BuildOS's entire thesis. Dex describes organizations needing a shared mental map that agents and humans both understand. BuildOS is building exactly this - context that persists across sessions, agents, and workflows.

- **"Constantly reorienting around what's the most important thing"** = The daily brief system. Dex landed on the YC-inspired weekly/daily goal pattern - BuildOS automates this with AI-generated daily briefs.

### Architecture Implications for BuildOS

**1. Agentic Chat v2 should use stage-gated workflows, not monolithic prompts.**
Dex's key insight: "If you know what the steps are, don't rely on the prompt for control flow." BuildOS's agentic chat currently uses a master prompt builder. The recommendation from this podcast is to split into explicit stages (understand context -> ask clarifying questions -> plan -> execute) with explicit transitions rather than hoping one big prompt handles all phases. This directly applies to the stream orchestrator and master prompt builder.

**2. Context loading should prioritize information density over volume.**
"Not token dense, but information per token density." BuildOS's context-loader.ts should be evaluated for how much signal vs. noise it puts into the context window. Front matter / structured metadata should be loadable without loading full document bodies - exactly what Dex does with his markdown front matter system.

**3. The ~150-200 instruction limit matters for BuildOS's system prompts.**
BuildOS's master prompt builder assembles system prompts from multiple sources (user context, project context, ontology data, tool definitions). If this exceeds ~200 directives, the model will start dropping instructions. Consider: rules search / RAG for contextual instruction loading instead of stuffing everything in.

**4. The deterministic pre-gathering pattern should inform agentic chat.**
Instead of letting the agent make 10 tool calls to figure out what context it needs, BuildOS's context loader should deterministically pre-gather relevant ontology documents, project state, and user context before the first LLM call. One smart, context-rich call beats five thin agentic loops.

### Product & Positioning Implications

**1. BuildOS solves the "oral tradition" problem for productivity.**
Dex describes how expert prompters have tacit knowledge that can't be transferred. BuildOS bakes that expertise into the product - users don't need to know how to prompt; the system knows what context to provide. This is a powerful positioning angle: "BuildOS is the oral tradition of productivity, codified."

**2. The "views for humans" gap is BuildOS's opportunity.**
Dex acknowledges that "views for humans" (the equivalent of Airtable on top of markdown) is his lowest priority because he just uses an editor. But he admits that non-technical users need it. BuildOS IS the view layer that makes AI-native context management accessible to people who aren't going to run Claude Code in a terminal.

**3. "80-90% in one tool" validates BuildOS's all-in-one approach.**
Dex explicitly says he'd rather have 80-90% of capability in a single tool than specialized tools for every part of his stack. This is BuildOS's thesis - one place for brain dumps, tasks, projects, AI chat, and context management. Not Notion + Todoist + ChatGPT + Calendar.

**4. The "tab complete for life" concept is a future BuildOS feature.**
Dex's vision of background agents that surface suggested actions ("here's what I'm going to do, approve?") maps directly to a future BuildOS feature - proactive AI that suggests next actions based on your context, not just reacting to prompts.

### Content Opportunities

- **"Context engineering is information density, not volume"** - Tweet-worthy insight that DJ could riff on from the BuildOS perspective
- **"Schemas are for humans, not for AI"** - Contrarian take that aligns with BuildOS's flexible ontology
- **"The oral tradition problem"** - Perfect framing for why BuildOS exists: codifying the tacit knowledge of productivity into a product
- **Dex's markdown CRM story** - DJ could share his own version: "I built BuildOS because I was doing what Dex describes, but realized normal people shouldn't need Claude Code to organize their life"

---

## Overview

An hour-long conversation between Chroma CEO Jeff Huber and Dex Horthy about the state of context engineering, multi-model agent architectures, personal productivity systems built on markdown and Claude Code, AI UX patterns, collaborative workspaces, eval strategies, and agent memory systems. Recorded in December 2025 as the first episode of Chroma's Context Engineering podcast series.

---

## Part 1: Context Engineering Origins

**Jeff:** All right, so this is an experimental format, which is to say we just talk. Whenever we hang out, we seem to have great conversations about all things context engineering. So here we are. We're in December of 2025. How are you thinking about context engineering? What are your latest thoughts?

**Dex:** My favorite thing about context engineering - I figured this out like a month or two ago - I had posted that thing on like April 3rd or something, right?

**Jeff:** The 12 Factor Agents.

**Dex:** 12 Factor Agents, right, which had an article where one of the 12 factors was about context engineering - which apparently was the one that blew up. But like two weeks afterwards, you just posted the words "context engineering" with no context. And I'm like, oh, Jeff was thinking about the exact same thing at the exact same time as me. So that was exciting. It's fun to have a secret co-creator of context engineering out there.

**Jeff:** I don't remember if it was spontaneous evolution or if I just totally unintentionally copied you, but I could do worse than copy you.

**Dex:** One of the new words I'm seeing a lot is "harness engineering." Have you seen this?

**Jeff:** I tweeted about that unfortunately as well.

**Dex:** I tweeted about a guy. I was like, "Oh yeah, this guy said it first." And then I was like, "Oh no, that guy was actually reposting a post from another guy who I have literally talked to in the last two weeks." Attribution is hard and I don't think anyone can really own a word for that long anyways.

**Jeff:** And who cares, right? It's kind of cringe to be the person who "coined X" as like your name, your claim to fame anyways. I think we're aligned on that.

---

## Part 2: New Models & Multi-Model Architecture

### Updating Priors with New Models

**Jeff:** New models are coming out every day. In the past three weeks, so many new powerful models have come out. How have you updated your priors on what it means to do context engineering with these latest and greatest models?

**Dex:** Context engineering for me is: how do you get the most out of today's models? A lot of people say, "Oh, it's all about putting the right information into the model." But it's also about keeping it as small as possible. And the keeping it as small as possible and as dense as possible is the thing that actually matters - not token dense, but information per token density.

Every time a new model comes out, we're playing with it, testing it, working in different workflows. A lot of what we are building is built on a paradigm that we're exploring a way past - there's a new vision that is more flexible and makes it easier to take advantage of new models as they come out.

### The Smart Orchestrator + Fast Sub-Agent Pattern

**Dex:** Today a lot of what we're doing - something that works really well - is: use a really smart model as your top-level steering orchestrator. Something like Opus 4.5, or Opus - it was Opus 4.1 forever. Opus 4.1 was the first thing that really made us go "oh, we can actually do really incredible things with this model."

And then you delegate out - your harness has sub-agents, which is one of the reasons we really like Claude Code - delegate out to a bunch of sub-agents that use faster, smaller models. We've seen this with Cognition and SweetGraph. We've seen this with Morph, who just released their GP agent.

### The Inverse: Fast Driver + Smart Oracle

**Dex:** One thing we've been exploring - and it's actually how the AMP Code team designed their architecture for a while - is where your main orchestrator is actually a smart but not the smartest, fast model. They've been using Sonnet as the default for a really long time as the core one, and then they had this "oracle" concept where you delegate out to a smart model.

You put the reasoning and the really beefy slow thinking intelligence there. Like, "Hey, I have 50 files I need you to read and help me figure out where this race condition is."

But doing that really well is tricky because those big slow models are slow. If you're just like "hey read these 50 files" - we've experimented with this using Sonnet as the driver and Opus as the thinker, and the problem is Opus is going to sit there and call tools and read every single file. It's just slow because it's a big slow model.

### The Context Engineering Fix

**Dex:** The context engineering nugget is: if you can have the fast orchestrator model figure out which files are relevant without having to really understand every line of code, you can put some deterministic layer in between that just stuffs all those files into a big prompt. You're de-emphasizing the agentic loop and you're just like: here's a crap ton of context, tell me how it works, or answer whatever the question is.

---

## Part 3: One Model vs. Multi-Model

### The Case for Sticking with One Model

**Jeff:** There's one school of thought which is like "one model is all you need" - you're not even using sub-agents. Multi-agent was seen as too brittle. And then increasingly there's this view that sub-agents are really important for breaking out agents into different roles. Do you think the bitter lesson is coming for all of us? How durable is this?

**Dex:** You have new models every week, but then you also have Ilya saying scaling is not going to keep happening and we need to go back to research for a while. I don't know if I buy that either.

If things are topping out, then now is the time to be investing in how to get the most out of today's models. Two years ago, you could write all this code so GPT-3.5 can solve problems, and then GPT-4 comes out and you throw all that out.

But it feels now like the map of boxes that an agent harness needs to do a good job - file system, tools and tool use, the ability to write and run code - those boxes are going to be the same in 10 years. I can't imagine a world where those change dramatically or go away.

**As long as we're dealing with quadratic transformer attention, you're always going to benefit from doing the deterministic engineering that allows you to keep the context window as small as possible for a given task.**

### Develop Deep Intuition with One Model

**Dex:** My advice to a lot of people is like, "Well, I use Claude Code for this and I use Codex for this and sometimes I use Cursor and then sometimes I shell out to Deep Research." You're only going to get to like 80% of the possible intuition you could have if you're constantly switching. Whereas if you sit and talk to one model all day for 2 months, you will develop a level of intuition that is where the people who are the best at agentic engineering get their results.

I tell this to a lot of people: you will get better results if you pick one model, one tool and work with it a lot for a month or two versus the incremental gains of trying every new model for three weeks.

**Jeff:** That implies the models are not highly swappable at this point. Like a master carpenter really learning the characteristics of a specific saw for a specific grain of wood.

**Dex:** Yeah, like when the Codex CLI came out - I think Swyx posted about this too - if you yell at Codex the way you're used to yelling at Claude, you completely de-tune the model and screw up the performance. All the ALL CAPS and "IMPORTANT" and "you must always" - that's helpful and gets good results from Opus, but you go use the same prompts with a different model and it breaks.

We've taken our prompts that are optimized for Claude and Opus. When I say "our prompts are optimized for Opus," it's really like: I know that if I have a six-step workflow, I can rely on Opus to actually go through all those steps. If I give that to Sonnet, it's going to get halfway through step three and forget that there was a step four, five, and six. I have to remind it. You can change your workflow around that, but then I need two sets of prompts and every time the models change, I need to update both of them.

---

## Part 4: Personal Productivity Systems

### The Markdown + Claude Code CRM

**Jeff:** We were texting last week about using AI more deeply in day-to-day work and productivity - specifically managing to-do lists. What is your current personal to-do list setup?

**Dex:** Everything's super chaotic right now. Since bringing on a co-founder a couple months ago, it has definitely changed because when it's just you steering the ship, it was enough for me to just have a pile of markdown files that I occasionally sync to GitHub and think that was my system.

I had the Getting Things Done - the Robert Allen GTD method. I was like, "Okay, cool. Deep Research, go make me a long summary of the GTD method and then drop that in a markdown file for Claude and just go implement this system." And it kind of built the whole set of stuff.

It actually ended up being really heavyweight. When we needed to collaborate more, we consolidated on the YC-inspired approach: what's the goal for the month? What's the goal for the week? What's the goal for today? Check in at the beginning of every day and at the end of every day - who did their thing? What's behind? What do we need to do? Constantly reorienting around what's the most important thing.

**Jeff:** And that just happens to work better in a Google Doc than in a markdown file. But there's no AI in that Google Doc - it's just you guys as humans typing.

**Dex:** It's just us as humans typing.

### The Email-Based Agent Workflow

**Dex:** This is something we're hoping to ship - collaborative markdown editing. There's just like - I haven't seen a good tool. VS Code Live Share is pretty good, but it's missing all the AI stuff.

A collaborative workspace where two people can have multiple cursors on a document and also have multiple cursors in a prompt box and back and forth with AI in a way that both people can see it and collaborate - I think that's a really interesting space.

People talk about "chat is a bad UX for AI." We've barely scratched the surface. The way that humans interact with AI and each other and can maintain visibility about what's going on is going to be really important.

Linear's entire company is based on "hey, we built Jira but with a sync engine." At the core, it's a snappier, better UI that's better for collaboration and feels real-time. That's the biggest unlock for me.

---

## Part 5: AI UX Patterns

### Chat Is Better Than People Think

**Jeff:** I tweeted something earlier this year which is like "most operating systems are built for single player, not for multiplayer, and for AI they need to be multiplayer." People on Twitter were like "no, you're wrong, there are daemons." Okay fine, but you're not using my computer at the same time I'm using my computer. Do all markdown files need to be CRDT-native so agents and humans can all be editing at the same time?

**Dex:** They won't have to be, but I think you unlock a lot if you can solve that.

**Jeff:** AIUX feels incredibly primitive still. In some ways, chat is way better than people thought and it's sort of wrong to dunk on chat because chat and/or the Claude Code style chat is actually very powerful. In the same way, it feels like we are in the caveman days of collaborating with agents and other humans in a shared workspace.

### Dex's Favorite AI UX: Email-Based Human-in-the-Loop

**Dex:** I spent nine-plus months obsessing with this problem. The whole point of chat is like, "oh, you interact with this the same way you interact with other people. You text your friends, you type to the agent. Same experience. It works." The issue was that they weren't in Slack, they weren't in your email inbox.

The workflow I came to love was: I had a bunch of emails and I built something where you can just forward an email to an agent. It has a bunch of tools, but the tools are wired with an email-based human in the loop.

You delegate a bunch of stuff out. Next time you come to your inbox, you have some inbound. It's like, "Here's the tool call I'm going to make, your permission." We were using Linear as our CRM at the time. Every inbound email, I just forward it and it would either make a new contact or add a comment to an existing contact.

So it would come back like, "here's the comment I'm going to add" and then I could reply like "no, do it this way." And eventually when it was good, it would actually update the CRM.

That was my favorite AI UX ever: talk to AI the way you talk to your human co-workers.

### Tab Complete for Everything

**Jeff:** Are there other patterns you think are useful or important?

**Dex:** I think tab complete is really dope. Tab complete is the thing Cursor figured out how to do really well.

**Jeff:** Where do you want tab complete to work that it doesn't right now?

**Dex:** For non-text things. This was kind of what Human Layer was - you have this agent out in the world. When things happen that need AI action, you get a Slack message or an email that's like, "Hey, we're going to do this thing." And you're like, "Yep, looks good. Yep, looks good."

It was like tab autocomplete for generic tool calls. You have something running in the background regularly querying the state of the world and deciding if there's some action that needs to be taken, and then autocompleting that action. You just go, "yep, yep, yep, no do it this way."

---

## Part 6: The Shared Context Layer

### Markdown as the Data Layer

**Jeff:** You've already heard the term - organizations having this "shared context layer," which is exactly what it sounds like. The same way a human has a mental map of "we do this in Notion, we do this in GitHub" - if you want an agent to be another colleague, it has to have a similar mental map.

**Dex:** Yeah, it's probably prompt and tools, some agentic search thrown in.

**Jeff:** Do you have thoughts about almost like an AI-native organization that should run differently than organizations have for the last hundred years?

### Markdown with Front Matter

**Dex:** We're doing markdown with front matter for a while because front matter is nice - you can do a lot of slicing and filtering deterministically without the model having to actually go read the whole file.

**Jeff:** Interesting. A little tiny layer on top of the file system.

**Dex:** And then we have some stuff in Airtable as well which we're experimenting with, syncing between the two.

**Jeff:** What's the Airtable use case?

**Dex:** It's a view to the data. We have the Git sync and then the Airtable sync - a bidirectional sync that takes mostly the front matter (the structured data about a record) and then the body goes into a notes field.

It allows me to work by mostly just talking to Claude. I can be like, "Hey, I just had a call with this person. Here's their email. Go use the CRM writer agent" - which is a sub-agent prompted to create a person or a company, always go search the web.

It's basically a poor man's data enrichment system. You can find most of this on the web and Claude can just do it. I was like, yeah, I could go do Clay and ZoomInfo and learn all this stuff, but if we can just do it with Claude and markdown, that works great. I'd rather have 80-90% in one tool versus specialized tools for every single part of the GTM stack.

### Why NoSQL is More AI-Friendly

**Jeff:** Why not just have the agent write some basic React app to load that markdown? Why do you need a separate tool?

**Dex:** I just use an editor. I have a hook set up that every week goes and looks at everything on my calendar. I run it as part of my Friday review process - go look at all my meetings, check who's not already in the CRM. If it's external and looks like a sales meeting, pull them in.

When I'm on a call with somebody, I open my editor and I can pretty consistently just be like, "okay, here's who this person is." It's so much faster than clicking around a web UI. The data is already there.

**Jeff:** By the way, I tweeted last week that NoSQL is more AI-friendly than SQL. I actually strongly believe that.

**Dex:** Yeah, because AI data doesn't care about the schema. It's going to read the thing and see all the stuff. Schemas are for humans, not for AI. Or rigid schemas, at least.

---

## Part 7: Data Storage & Git for Non-Code

### The Git Sync Problem

**Jeff:** So you have markdown as your source of truth for your CRM. The agent can evolve the schema itself - add a new field, maybe backfill, maybe not. It's very flexible.

**Dex:** We store it all. Everyone's just pushing and pulling straight to master for that repo because it's plain text documents.

**Jeff:** Do you use Git for this or is it overly burdensome?

**Dex:** I basically use it as like S3 or a generic document store. Being able to merge conflicts is great, but again the CRDT thing is the actual answer. You wouldn't have merge conflicts if you had CRDTs.

The reason we use Claude to do the Git operations instead of just writing a script is because when there's merge conflicts, we have instructions in the prompts for how to resolve them. For journals/logs, it's like "just keep both, always." It's almost always just additive merge - very rarely do you have to actually merge logic like you get with code.

**Jeff:** I think a lot of people are reaching for Git and I have a suspicion that's not going to be a durable component. Clearly a shared data store is incredibly important. Some level of versioning is important, but all the heaviness of Git for something that's not code...

### What You Actually Need

**Dex:** So what do you need? You need local-first speed. You need a UI that's accessible to less technical people for reading and writing. And you need a very high-efficiency, context-respectful interface for an agent to use.

If you take the MVC architecture - model, view, controller - the model is the schema of the data, the views are how you see it, and the controllers are your business logic.

**Jeff:** What's the AI-native version of this?

**Dex:** The business logic goes in your prompts. We have a lot of slash commands and sub-agents. Like this thing that does the calendar sync - that's a slash command that runs once a week in GitHub Actions, goes and pulls things, pushes updates to the markdown, commits and pushes.

So you need: markdown as the data layer, some orchestration/scheduling, tooling, a way to write and execute code, secrets management, an agent harness, and views for humans.

**Jeff:** But views for humans could just be an agent-built React app to the same data, instead of syncing to Airtable.

**Dex:** That's probably a better approach. Views have been lowest priority for me because I just look at everything in the editor.

---

## Part 8: OAuth & Desktop Apps

**Jeff:** The OAuth thing can't be that hard. Over the weekend, I was building a desktop app and I told Opus 4.5 to add OAuth for Google. And it just one-shotted it.

**Dex:** Really?

**Jeff:** It walked me through going and creating the service account and downloading it. Just one-shotted it.

**Dex:** That's crazy. A year ago that did not work. I was using CodeBuff - one of these coding CLIs that came out way before Claude Code. Super fast and only supported YOLO mode, no way to add permissions. I was back and forth with a combination of Gemini Pro 2.0 and Claude 3.6. It was like 10 or 15 rounds to get it working. When it finally got the OAuth and could list out my emails from Gmail, I literally typed in all caps - I've never done this to a model - "HOLY SHIT, YOU DID IT."

**Jeff:** Never have, but maybe I should.

---

## Part 9: Why Claude Code (and Not Switching)

**Jeff:** You mentioned using Claude Code for a bunch of stuff. Are there other agent harnesses you're using?

**Dex:** Every time a new one comes out, I'll try it for like an hour. When the new Cursor Agent view came out, I was interested more in the UX - how do you help humans keep their work straight when agents can go off and do things headless? I played with it but didn't get what I needed.

I'd rather just keep focused on getting better and better at Claude Code and refining that. We play with Codex, we've played with anti-gravity - we mess with all these things.

**Jeff:** Claude Code is not open source, so even if you find where it's weak, you can't change it.

**Dex:** People yell at Anthropic DevRel on Twitter. I try not to do that. I actually filed an issue on the Anthropic repo because there was a breaking change with 2.0. And while I was waiting, I read through the other open issues - there's like 6,000 open issues on the Claude Code repo. Five out of six that I read were people just being like "this thing did a bad job on a coding test, this sucks." I just think about how messy the signal is for a company that big with that much adoption.

### Open Code as Alternative

**Jeff:** Going back to the agent harness piece - do you think there will be an open-source equivalent to Claude Code that's just as good?

**Dex:** I asked this on Twitter maybe a week or two ago and resoundingly the comments were: Open Code, Open Code, Open Code.

**Jeff:** Because Open Code is basically built by reverse-engineering the Claude Code harness. Have you ever hooked up a proxy to Claude Code and read all the traffic?

**Dex:** I did it yesterday because I'm rebuilding a lot of our plan generation workflows. You can proxy it and it's just a token-for-token replica of Claude Code because you can pass the same tools, same tool definitions, use the same models, make the tools behave the exact same way. That's why Open Code is tied with Claude Code on most benchmarks - it's the same thing, just open source.

---

## Part 10: From Full-Fat Agents Back to Micro-Agents

### The Research-Plan-Implement Workflow

**Dex:** We realize there's a lot of what I call "oral tradition" in using the research-plan-implement workflow. Thousands of people have adopted it on GitHub. But when I use the prompts, they're very different from how most people use them. Most people haven't used them enough to know what a good session versus a not-so-good session looks like.

Part of it is: there's six instructions and if you don't reinforce them - like "okay, now we're on phase three, please also do four, five, and six" - sometimes it'll just skip to the end.

It's the same thing as people who used to be really good prompters: "remember, stay objective, we don't want you to tell me how to solve it, just tell me how the codebase works today," "think step by step" - all these things.

### Baking Opinions into the Product

**Dex:** What we're trying to do now is: how do we make the product and tooling require less oral tradition? How do we bake that into the opinions?

It's funny - I was the 12 Factor Agents guy, right? Full-fat agents don't work, just do context engineering, treat LLM calls as just an atomic step in your software like any other function. Then two months later, Claude Code starts blowing up. And I'm like, "actually, full-fat agents are good to go. I'm the Claude Code guy now."

And now we're realizing: the thing we want to do is actually break up this workflow into a bunch of smaller steps. There's a chat loop, and then you progress the conversation to another part of the chat loop. So it's like, oh, we're back to context engineering and micro-agents.

**If you know what the steps are, don't rely on the prompt for control flow. If you know what the workflow is, split the prompt up into smaller workflow steps.** You can still iterate with the human in those steps and then explicitly proceed to the next one - either by a model doing a specific structured output, or by the user opting in like "yes, I'm done with the questions phase, now I want to go to the plan outline phase."

---

## Part 11: Evals & Observability

### LLM-as-Judge Skepticism

**Jeff:** Speaking about evals - popular topic. There's a million AI observability companies. And then there's everyone saying LLM-as-judge doesn't really work very well.

**Dex:** LLM-as-judge. Man. I was working with a customer a long time ago and they were like, "Hey, we're gonna do LLM-as-judge." I was like, "I don't think that works very well." I don't think models are good at evaluating things.

When we work, we try to keep the model objective as long as possible. Kyle actually just put a post out about a good CLAUDE.md - part of it is like: never send an AI to do a linter's job. Anything that can be done deterministically - I don't trust a model to read code and tell me if it's good or not, because these models are optimized to tell us what we want to hear.

You could say, "Hey, review this code and tell me if it's good or not." It's like, "Yep, it's great." "Hey, review this code and tell me if it's bad or not." "Yeah, it's trash." It all depends on how you phrase the question.

**Jeff:** I asked online how you get valuable critique from one of the models. The answer was: you have to tell it "my friend sent me this and I want to give them some valuable advice." Otherwise the model won't hurt your feelings.

### Snapshot-Based Evals

**Jeff:** You said you have very good evals. What are your evals?

**Dex:** They are snapshot-based. We have this prompt workflow split into stages. We have a test that runs it end-to-end for a question - it takes a while, like Claude Code running sub-agents, searching files, doing all this stuff. Then we output the snapshot - here's what the final output was.

We can also break down and do eval by stage - like unit test versus integration test. We store the output, and when you run it again, you create new snapshots and diff them in the CLI.

If I made a change and the output has changed significantly, I can accept the new snapshot. It's basically - evals for me are the way software engineers think about unit tests or integration tests. It's a way to prevent regressions.

### Vibes First

**Dex:** The advice I like the most is: the first layer is vibes. Vibes is very high-leverage, especially if you don't know what you're building yet and don't know what you want it to look like.

There was a guy who talked at AI Engineer World's Fair - Ben Stein - about how product management changes when the capabilities of what you're building are emergent. You don't actually know what it's capable of until you build it and try it.

His take is: BDD never really worked anyway. Building evals first for an AI tool is going to constrain what you're actually building. Instead, build the thing, have a product manager play with it for a couple days, have them point out the behaviors you really like, then back into "here's what we're going to eval against going forward."

---

## Part 12: Agent Memory & Continual Learning

### The Problem

**Jeff:** There's increasing awareness that what we really want is the ability for AI systems to get better through experience. The AI goes out, does a job, observes what it does well and what it doesn't, gets feedback from humans, and then updates its intuition. This is how humans operate - you can't write a manual detailed enough to onboard an engineer and one-shot it. You're going to be sitting next to that person giving them micro-feedback for months.

### Why Generic Memory Is Hard

**Dex:** The naive solution is: build a good memory. And not naive in the sense that building a good memory system is really freaking hard. I think it's almost impossible to do generically right now.

I know people building for very specific use cases. My buddy Brian is at an applied AI lab. They built a tutor with what they call "decaying resolution memory." Every time the agent turns on: here's what happened today, here's daily summaries for the last 14 days, weekly summaries for the three weeks before that, monthly summaries for the last two.

It's not conceptually hard. But that's a very specific implementation for a very specific use case. If they had tried to generalize it, they would not have solved their own problem and they would also not have solved anybody else's problem.

### Factual Recall vs. Behavioral Learning

**Dex:** The factual stuff feels doable today - "remember this user likes potatoes, they don't like lettuce." The thematic stuff feels much harder - the instructions and rules, the "how to be," not the "what is true."

### Instruction Following Has Hard Limits

**Dex:** Have you seen anybody attempt that?

**Jeff:** I see a lot of people try to attempt it in their CLAUDE.md files and it doesn't go very well.

**Dex:** There's some findings - the study is like six months old so there's no Gemini 3 or anything in there - but frontier models can follow about 150 to 200 instructions. If you give more than that, you really start to lose out. You spread the attention across all the instructions and the model has to decide which ones are relevant, and sometimes it won't.

**Jeff:** Context rot for instructions.

**Dex:** You tell it too many ways to do things, it just won't work. People spam with "always do this, never do this." You put the ALL CAPS thing, that's going to put more attention there and take away attention from everything else. You get this instruction severity inflation where everybody who wants their instruction followed puts it in all caps, and then your entire system prompt is all caps and you're actually de-tuning it from everything else in the conversation.

**Jeff:** Isn't agentic search a solution to that? Anthropic just launched their tool search thing. Seems like rules search in this context would be potentially very effective.

**Dex:** I haven't seen anybody implement that - like "hey, I'm doing this, how should I perform it?" and you RAG against your rules. Rules bench - I'm sure there are instruction-following benchmarks. I don't know if anyone's evaluated anything like that.

---

## Closing

**Jeff:** All right, we just hit an hour.

**Dex:** Damn. Really?

**Jeff:** We could talk all day. But why don't we call it there and save the good stuff for next time?

**Dex:** Sounds great. Can't wait.

**Jeff:** Good stuff, dude. Peace.

---

_Transcribed and formatted from the YouTube video._
