<!-- research-library/transcripts/podcast-ryo-lu-peter-yang.md -->

# Full Tutorial: Design to Code with Cursor's Head of Design

**Source:** [YouTube](https://www.youtube.com/watch?v=bdh8k6DyKxE)
**Host:** Peter Yang
**Guest:** Ryo Lu, Head of Design at Cursor

---

## Overview

A hands-on walkthrough where Ryo builds a calculator app in his personal retro operating system "Real OS" using Cursor's plan mode, demonstrating the design-to-code workflow without Figma.

---

## Part 1: Introduction

**Peter:** Welcome everyone. My guest today is Ryo, head of design at Cursor. Ryo has built a pretty amazing personal operating system that feels very retro and honestly blew me away. He built it completely using Cursor and AI. So he's going to do a walkthrough of it and also use Cursor to add a new feature to his operating system without using Figma at all.

**Ryo:** Hey everyone, I'm Ryo. I do design at Cursor. I was the first designer there. How I started was really because I found the agent back in November last year and I got hooked and I kept making stuff.

---

## Part 2: Live Demo - Building a Calculator

### Getting Started

**Peter:** What do you want to add?

**Ryo:** I was thinking maybe a calculator. Let's have the AI suggest something. Can we make something really cool - add a new app to the OS? Something that stuck with us through time.

**Peter:** So you actually use Cursor in light mode? I've never seen anyone use Cursor in light mode before.

**Ryo:** We have a new theme made by one of our designers called "cursor light." It's really nice. As I got older, my eyes just want something with more contrast during the day.

### Plan Mode Demonstration

**Ryo:** What if the agent helps you think and plan and ideate? We built this new thing called plan mode. If you switch to plan mode and hit this button, let's see what happens.

The same kind of research will be done, but for longer. It's going to do the research and then think of questions to ask if it's something really ambiguous.

Calculator, solitaire, clock - all really classic. Let's do the calculator.

**Peter:** And plan mode - the idea is to tell it not to code, right?

**Ryo:** It's more like you're still coding but at a higher level. Instead of doing low-level coding each file type of thing, you think about the architecture or what you want in it. How do you specify things in the most clear way possible?

The agent can help you do the first draft of the plan. As it thinks about all the things it wants to add, it thinks about implementation details - where to put things. At the end, it thinks about individual steps needed.

All I need to do is review, and if it's good, I hit build.

### Reviewing and Modifying the Spec

**Ryo:** Let's read it. "Add a calculator icon" - but I don't really have an icon yet. What if we just say "use a placeholder, search in the icons folder."

I can almost write my own spec or make modifications almost like in a Google doc where PMs do PRDs.

**Peter:** I like how the MD files are markdown formatted. I feel like people are actually going to start using Cursor to make documents - it's not just for writing code.

**Ryo:** A lot of people are already doing that. "I want to update the changelog" or "do some documentation" - people just use Cursor agents. If it knows your codebase, it can give you better, more real results.

### The New Cursor View

**Peter:** I noticed your view is basically just the agent and localhost. That's not the default view, right?

**Ryo:** Cursor used to have the IDE layout borrowed from VS Code. But we started noticing people look at code less and less. The main focus is actually the agents - the list of agents, reviewing things, spinning up multiple agents, flipping between them, seeing states, previewing things in browser, or making plans at high level.

But if you want, you can still look at the code - just click and see what happens, make modifications yourself.

### Fixing Bugs in Real-Time

**Peter:** So it ran into a bug and it's fixing the bug now?

**Ryo:** Yes.

**Peter:** Do you do the fancy stuff where you have multiple agents working at once?

**Ryo:** I usually spin stuff to the background. My workflow is one main agent locally, then spin little tasks to the back.

We're working on a new feature for worktrees so you can run multiple local agents in parallel - they won't overwrite each other and you can review them all at once.

### Browser Integration

**Ryo:** Can you fix this for me by reading what's going on in the browser?

**Peter:** Do you have some MCP installed or can Cursor already read the browser?

**Ryo:** We built an internal browser automation thing. We have two types of browser integrations - the internal browser tab, and you can also talk to Chrome.

---

## Part 3: How the Cursor Team Builds Products

### Blurred Roles

**Peter:** How do you and the team build Cursor these days? Do you mostly get the agent to make PRs or watch them make stuff live?

**Ryo:** We do a mix of things. Cursor is kind of everywhere now.

I still like the local IDE for really quick changes where it's visual - I need to see the thing, tweak all the details myself.

For things like fixing bugs that are more defined, or just tickets in Linear, you can send them to the Cursor background agent. They do stuff in the cloud, fix those things. Once done, you review in the list of agents, or they ping you in Slack. You can make a PR, see it. The bug bot can even find some issues. Once done, hit merge.

**Peter:** What kind of features do you work on? Mostly front-end or entire features with the team?

**Ryo:** At Cursor, the roles between designers, PMs, engineers are really muddy. We just do the part that does our unique strength. Use the agent to tie everything together. When we need help, we assemble people together.

Some focus more on visuals and interactions. Some focus more on the infra side - how to design a really robust architecture to scale.

There's a lot less separation between roles, teams, or even tools we use. For a lot of designs, if they're not individual space, we'll just prototype in Cursor because it lets us really interact with live states of the app. It just feels a lot more real than some pictures in Figma.

### When Figma Still Makes Sense

**Peter:** So Figma doesn't get much use?

**Ryo:** We're still using it sometimes in initial phases of exploring something, or defining new visual patterns, or exploring layouts. That's still pretty quick because we're used to doing it in Figma.

### No PMs Yet

**Peter:** Did you actually hire a PM? Last time I talked there were no PMs.

**Ryo:** We did not hire a PM yet. We have an engineer who used to be a founder who took a lot of the PM-y side. He became the first PM of the company. But a lot of PM jobs are spread across builders in the team.

---

## Part 4: The Calculator is Done

**Peter:** Is it working now?

**Ryo:** I think so.

**Peter:** There it is! The minesweeper - oh wait, that's the calculator.

**Ryo:** It works. Keyboard works too. Boom.

**Peter:** Not bad. So it basically did it in one shot because it did plan mode, wrote the spec, you modified it, and then it built it.

---

## Part 5: Making it Look Good (Not AI Slop)

### The Million Dollar Question

**Peter:** Whenever I vibe code something, it always does Shadcn and looks like generic AI slop. How did you actually get it to look like this? Did you just prompt it? Share screenshots?

**Ryo:** If you look at the files - components - a lot of these components are actually Shadcn components. All the standard controls, menus, buttons, tabs, dropdowns, dialogs - they're all Shadcn.

But because Shadcn duplicates components to your working tree, it can do theming. I have a theming thing where I define different themes and override some styles by hand.

**The key insight:** AI really knows Shadcn well because it's seen it a lot around the internet during training. It's really good at composing patterns that exist.

Because Shadcn is a wrapper on Radix - a really robust UI library with thought put into it - they handle keyboard navigation, accessibility, a lot of things for you. You don't have to let the AI start from scratch, which is more error-prone.

It's building patterns on top. Your job becomes: instead of making it look like AI slop, how do I paint it in a way that fits what I want? But underneath are still these pretty standard shared components.

**Peter:** So basically you build standard Shadcn components and tweak the theme CSS?

**Ryo:** Yes, I built a theming thing on top. But fundamentally they're just... for the retro fonts and stuff, you need to really look at history. What things were like, how things were made. A lot of details really matter to fit all the vibes together.

---

## Part 6: The Origin of Real OS

### UI Archaeology

**Peter:** All these different backgrounds and icons - you just drag stuff into your Cursor project?

**Ryo:** It's more like a research project. UI archaeology basically. I got some really old Macs at home. I looked at them a lot. As you try to recreate these patterns, you realize what kind of constraints or philosophies they were thinking about.

This is Real OS. It's my personal playground. I use this to test Cursor - all the features we make, all the different models available.

### How It Started

**Ryo:** How I started was making this soundboard app when I was leaving Notion and joining Cursor. When I'm in meeting rooms, I make a lot of noises. I made a little app for my Notion friends so they can remember me.

It started looking nothing like this. It was only this app, in Tailwind default styles with Shadcn - really bare.

I was just asking the agent: "instead of this really boring neutral style, can you make it more retro Mac OS-y?"

It applied some Google font that looks pixely. I was like "this is getting interesting." What if we added a window? Then we added the menu bar. What if we just make more apps?

I made a chats app with a fake Rio in it. I made a browser. I made an iPod that actually works like a real iPod - it completely replicates the UI and UX, but it can also show lyrics and the music video.

**Peter:** So you just built it over time?

**Ryo:** And the real chat is using an API - it's actually a multi-modal agent. If you go to system settings and turn on debug mode, you can see it's plugged into all these models. I can test different flavors of how models behave - there's really drastic differences in how they respond with the same prompts.

### The Virtual PC

**Peter:** Show the virtual PC thing.

**Ryo:** This is a DOS emulator. When you click on it, it runs a DOSBox in WebAssembly.

The idea behind all of this is showing people that all these things are the same things. All the apps we use, the patterns we use, what we do on computers - it's almost the same and hasn't changed that much.

**Peter:** You just built this through prompting Cursor?

**Ryo:** When I started, it really required more technical knowledge - I needed to instruct the agent specifically: "you need to use Bun, use Shadcn for components," mention a lot of codebase details. Without that, it wouldn't give good results and took a lot of turns.

But now with newer models and new Cursor features, you can almost do anything one-shot, get something really close. All you need to do is tweak a little bit.

### The Reference Website

**Ryo:** There's this really cool website where they have a library of patterns and things from the past - pixel-accurate screenshots and icons. I based a lot of things on this, found historical assets that are fully accurate.

But everything else - the styles, any UI controls - I kind of made them with the agent.

**Peter:** Ryo also has a public GitHub with all the files, so we can link that.

---

## Part 7: How Cursor Ships Products

### No Long-Term Roadmaps

**Peter:** How does a feature like plan mode start? At bigger companies you write documents, make strategy. How do you guys do it?

**Ryo:** How plan mode started - when I first started at Cursor, the thing I did was merge all the tabs (chat, composer, etc.) and make the default the agent.

But the default letting the model decide might not satisfy all the things people want. Sometimes you want a more specific workflow - "I'm just asking questions, don't make edits" or "when planning, I want it to ask me more questions, see document artifacts."

These are still fundamentally the same agent, but you're applying different configurations that fit certain workflows or people better.

For plan mode specifically, a lot of our users were already doing this in Cursor manually. But there wasn't an easy way for other people to do it - you had to know how to put a plan prompt, force it to write markdown in a folder, reference the right plan file.

So we built it and kept playing with it, iterating, using it ourselves.

**Peter:** So just one engineer built it and you guys stocked it internally?

**Ryo:** A lot of things happen like that. For this one, it came from multiple sources - early thinking when we did the demos thing from me, some explorations on different kinds of editors for Cursor instead of just looking at code.

A lot of little ideas plus users really liking certain things - we're like "maybe we should do this." Someone makes a prototype, maybe janky, but we can see some promise. Let's make it better.

### The Spec Decision

**Peter:** What was the decision to make it a markdown file that's well-formatted?

**Ryo:** That came from my mocks - I made them even before I joined Cursor when we were just chatting.

The natural evolution of where we're going is slowly ascending - or even really quickly ascending - in the levels of abstraction of how you interact with the codebase, how you build software.

A lot of people think "what is this new AI world interface? Is it just the chat? Just the agent?" My answer is probably not, because there are more specific forms of interaction that are just a lot easier and familiar for certain people.

The problem becomes identifying the most universal patterns we might need, but pointing them to the same thing. Underneath it's the same agents doing the same things, but depending on who you are, the interface starts changing.

Based on where you are in the workflow - planning versus building versus testing - it can fit you better. Instead of just a chat where you're throwing everything into a little box like a black hole.

**Peter:** The spec makes sense. Having Cursor work with Cursor to write the spec and reviewing that - that's where a lot of product decisions get made.

**Ryo:** People say the spec is dead because people start coding. I don't think it's dead - now it's AI-assisted, you review it, then the agent does the actual work afterwards.

I feel like speccing will become even more important. As models get better, they'll be really good at implementing exact prompts or specifications. What we're good at is: without specifications, the model only makes something mediocre, generic.

But focus on speccing it out - thinking about it, writing it down, or something more visual that fits how you think - use that as input to the agent. Then they can do something better.

### Fast Feedback Loops

**Peter:** You probably have some sort of beta group to see what people are doing?

**Ryo:** We have ambassadors and "nightly" users. Every build goes out at night - they see the latest things we're working on every day. Maybe a lot of bugs but good surprises.

We also have people really vocal on Twitter and Reddit - complaining but also loving certain things. We can gauge what people want.

**Peter:** What about longer-term planning? Do you have a spreadsheet or roadmap?

**Ryo:** We don't really. Because the world is changing faster and faster - new models dropping every day with new capabilities, people's mindsets changing.

It's actually more important to be a little more flexible and not prescriptive of each thing you're gonna do. Build something that kind of lasts - the concepts or foundations last. Gradually evolve them, make them better, more cohesive.

As things shift, you start changing what the defaults are - maybe new modes, expanding concepts to work better for teams or big companies, from one agent to multiple agents in parallel or sequentially, background or local.

But it's still rooted from the same concept.

**Peter:** There is a vision to let anyone build anything?

**Ryo:** That's at least my personal why I joined Cursor. I saw a path where as models get better, we need to build the right tools for people to take away all the things models are good at, plus what they're good at, in a way that's really familiar and in flow.

Then they can do it by themselves as one person, but also with others who are specialized in different areas. Together you can make amazing things.

**Peter:** That would be amazing - if people can start creating by default instead of just watching Netflix or consuming.

### Avoiding Planning Theater

**Peter:** I think what you said is important. A lot of companies do planning theater - they pretend to have a one-year roadmap or a Northstar Figma that's been there for three months. I just feel like that kind of stuff is a waste of time. You have to talk to users, have fast feedback loops. You want to know where you're going at a fuzzy level, but pretending you have a roadmap in this day and age is lying to yourself.

**Ryo:** I think so. There's a little ambiguous direction we want to go to, and there's the present state of where we are. You can see a little bit of steps here. All you want is for the steps to kind of align to that place. That's it.

The fuzzy direction.

And you just keep going. If you start thinking "what is the step here, here, here" and spend a month in meetings - "the step should be here, no here" - what's the point?

You kind of just evolve it. Like the interface started as a VS Code fork with a bunch of files and now it's more like an agent and what the agent's building.

**Peter:** And the key idea is it's still the same Cursor underneath.

**Ryo:** But it can start changing itself and fitting better for anything - the thing you're doing, who you are, your team.

### Shipping to Different Audiences

**Peter:** Do you have checks and balances? Cursor is in a lot of big companies trying to update production codebases. You can't just cowboy and ship whatever.

**Ryo:** We now have different levels of releases. Enterprise people get the slowest one.

**Peter:** So you ship to consumers first, they complain on Twitter, you iron out the bugs.

**Ryo:** That's basically it.

### Tools They Use

**Peter:** What do you guys use at Cursor?

**Ryo:** Notion, Linear, Cursor, Figma. That's pretty much it.

---

## Part 8: Advice for Designers

### Getting Started

**Peter:** Most designers in the industry are still just in Figma making mocks. How do they become more like Ryo?

**Ryo:** Download Cursor and try to start something simple.

There are ways to plug your Figma workflow to Cursor - you can get the Figma MCP and it'll read your Figma files. But I actually recommend starting from a really simple base and exploring with the agent.

You start learning these concepts. It's actually really good to learn software concepts - maybe not exactly how TypeScript syntax works, but:

- How do I structure my components?
- How do these things flow together?
- The props and stuff

It really helps a designer. We're basically writing software in a proxy - the end result of our work is still code that gets changed. But we're thinking on the visual level.

Before, you did it through another artifact - pixels, layers, completely visual. Now you get to do the whole thing. You interact with the material - the code. You can see it, poke at it, see how things work.

**Peter:** You have to interact with the prototype or code to get a feel of how it actually works. The other abstractions are just hard to tell.

**Ryo:** Exactly. It's not real.

### The Designer Revolution

**Ryo:** Start prototyping and trying things. Don't be afraid. If you run into roadblocks, just ask "fix this for me" or copy paste the error. "What did you just do? Explain for me." They'll just tell you.

**Peter:** If you're at a big company, they probably won't let designers change the codebase. You have to do personal projects, put it on your portfolio.

**Ryo:** Starting there is good. But at some point, designers will start revolting.

**Peter:** Revolting?

**Ryo:** As they gain these skills, they'll realize "what were we doing?" It doesn't make sense.

All this back and forth - the engineer builds something but it's 50 pixels off and kind of weird. The designer takes screenshots: "here's wrong, here's wrong, here's the spec, here's my redline." Back to the engineer. Loop again and again.

Versus: the designer comes in, does "fix this, fix this, fix this," sends it to Cursor in Slack. Boom, it's fixed. They come back, look at it - looks great. Or maybe it didn't work well. "Add this engineer, can you continue that thing for me?" And that's it.

**Peter:** There's so much of this polish and craft that's just editing copy and making pixel changes. That kind of stuff - you should be able to do it. It's a waste of time to do all this back and forth.

**Ryo:** People care about different slices of the puzzle. Some people have the eyes to see 0-to-1 pixel offness. Some people's range is like 100 pixels, but maybe they're really good at high-level system architectures or backend stuff.

**Peter:** We can leave the backend stuff to the engineers.

---

## Part 9: Ryo's Design Principles

### Simplicity Over Minimalism

**Peter:** What are your top three product or operating principles that you really believe in?

**Ryo:** I believe in simplicity, but it's not minimalism.

At the core of what you're doing is really simple concepts where the architecture is really simple. But each of them combine - they're a layered experience. They multiply. They emerge in complexity.

So it scales and works better for more people, more kinds of things. But the default state is still simple.

That's what I want to do - reach more people instead of constraining yourself into a little box.

**Peter:** A lot of people say simplicity means fewer options, fewer decisions. But you kind of isolate to just this group of users, those problems.

**Ryo:** You design a perfect solution for those users, those problems in the most simple way. But it gets stuck there.

Versus: you have some really robust low-level concepts that are flexible.

Like Notion - it's the blocks, the pages, the databases. With all of these you can do whatever.

With Cursor - it's really just the code, the agent, the models, the tools. With all of these, you give them form, put them in the right place, merge everything. Then you can almost serve anyone, do anything, build anything.

### The Balance

**Peter:** That's really important and really hard to do. Take Figma as an example - if I'm a PM trying to edit a Figma file, there's so many constraints now with auto layout and everything. It's difficult to use, I can't move a box around.

**Ryo:** It's a constant fight between rigidity, complexity, flexibility, simplicity. You need to find a balance.

If you make the tool so pro, PMs can't even do it. So they start trying to simplify it, but then maybe that makes the pro designers more angry.

How do we solve that? Do we split into multiple products? Merge into the same product with different modes? Different configuration customization options? What is it?

**Peter:** I don't think there's one answer. It depends on what you're trying to do, how big your ambition is, what the core ideas of the product are.

**Ryo:** My refrain is maybe like Linear's value - "simple but powerful." At surface level simple, but if you want power user features, you can still use them.

I would make something more flexible than Linear.

**Peter:** Linear is very opinionated.

---

## Closing

**Peter:** Where can people find you and Real OS?

**Ryo:** People can go to real.loo. You can find me on X. And Real OS is os.real.loo.

**Peter:** I hope everyone builds their own OS that's as fun as yours.

**Ryo:** It's going to get even easier as models get better. Have you seen the Gemini 3 demo?

**Peter:** No, is it coming out soon?

**Ryo:** Someone tested it and they kind of one-shot Real OS in one HTML file.

**Peter:** Well, that's probably not coding best practice, but that's great. So if you want to do the proper thing, you still need Cursor.

**Ryo:** That's right.

---

_Transcribed and formatted from the YouTube tutorial._
