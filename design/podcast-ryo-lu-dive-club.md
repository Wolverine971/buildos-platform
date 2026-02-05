<!-- design/podcast-ryo-lu-dive-club.md -->

# Ryo Lu: Designing the Future of Cursor

**Source:** [Dive Club Podcast](https://youtu.be/dsZqOPVQTNg)
**Host:** Rid
**Guest:** Ryo Lu, Head of Design at Cursor (formerly Notion)

---

## Overview

This episode explores how Ryo joined Cursor, his approach to systems thinking in design, the future of personalized AI interfaces, and his personal project "Real OS" - a retro operating system built entirely with Cursor.

---

## Part 1: How Ryo Joined Cursor

### The Prototype That Changed Everything

**Rid:** So, Cursor people first reached out like August last year. That was before the agent existed.

**Ryo:** The Cursor product trajectory - they started with the tab. It's like auto-completion for code, a much better GitHub Copilot. Then we did the chat early last year where you can ask Cursor about the codebase and it'll answer, but it won't do much for you. Then in July they added the composer, which is like now the chat can actually write code for you.

They reached out to me back then. We talked a little. I thought, "Oh cool." But I still thought Cursor was like a tool mostly for coders. So I was still going to do my Notion thing because I wanted to make something for everyone.

Then last year around November we were doing planning at Notion - planning this multi-year project that I was working on for a long time. And the plan was we're gonna do this for the second half of this year. And I was so angry because I wanted to do it since I joined Notion.

So I went to V0, made a little prototype - a Next.js React Tailwind CSS app of the future Notion. I played a couple rounds there and got stuck. I wanted to do more but couldn't.

So I downloaded Cursor, opened it up, used the agent. It took a lot of time to find where the agent is, and then I was hooked. I did that for 3 days and built this whole prototype of the future Notion - exactly what I wanted in my head. It has a menu where you can turn every feature flag on/off and see the whole app change. It has real data. I built a 3D globe view - the idea being in Notion you have board, table, galleries, but you could have custom views.

That completely changed me.

### The Transformation of Making Software

**Ryo:** Making software before was a really long process. You might need to start by yourself, maybe make some little tools - it's fun. But to make something bigger, you need to assemble a team with so many different people doing different things. You need to figure out how to tie them together, align people, make plans.

Versus now: I have an idea. I'll draw some sketches. I'll maybe verbally describe it to the agent. Maybe I'll take a picture of a napkin sketch of this menu structure - just a rectangle, box, line, divider. Then I'll tell the agent the items I want in the menu. And boom, done. That's it.

And it's that for every single little thing. You can keep going at a much faster rate to where you want your thing to be. And as you do it, you're not acting on some other artifact or representation of the software.

Before, people had to write docs like PRDs, make plans in Linear, make tasks, draw pixels in Figma, try to stitch everything with a process.

Now it's almost like sculpting. You get something, then you poke at it. Maybe get rid of certain parts. Maybe re-wrangle. Maybe say "do it again, again, again - do it five times. Pick the right one."

It changes completely.

---

## Part 2: The First Cursor Redesign

### Unifying the Concepts

**Rid:** What was the first project you shipped at Cursor?

**Ryo:** It was unifying all the Cursor concepts into one thing. Before, Cursor had:

- The tab
- Command K (inline editing)
- The chat (only talks, doesn't do anything)
- The composer (talks with code)
- The cursor composer agent (a mode on composer that automates)

Five different concepts, built separately, named differently, each with different key bindings.

All I did was say: all of these things are the same thing. They're all agents. We merged them into one concept. Now we default everyone to use the agent.

Before, people were stuck. People didn't know we had the agent. That's probably the biggest reason we took off since February.

**Rid:** I'm glad I started using Cursor after you made that change.

**Ryo:** I talked to so many people - "Cursor is so great, so cool." And they're like, "I've been using Cursor for months and I don't have this. How do you do it?" Even senior engineers.

---

## Part 3: Systems Thinking in Design

### Understanding the Whole System

**Rid:** You talked about the importance of thinking in systems, not features. Talk about what you were doing in your own mind to arrive at those changes.

**Ryo:** My general process is I need to understand the whole system. I need to know every bit of it as much as possible. I consume information from:

- The outside world (users, bug reports, feedback)
- Internal people
- What it is actually in the code

Then you come up with better models. You simplify things. You don't get rid of things - you unify things. The things people were using are still there, but reorganized into something simpler. Instead of five concepts, you have just one.

It's almost like building layers of the same thing.

For most people, they'll use the default agent mode. They don't have to change anything - it just works in the ideal state.

But we want to serve everyone - from the most experienced coders who want full manual control to people who are more "vibes" and let the agent do everything. There's almost in-between a lot of different configurations and patterns.

You might get it wrong, then you build mechanisms for people to move progressively. You don't want to nudge people completely - "from now on agent is default, I remove everything else." Then people can't picture how you got from today to this new place.

Instead of five discrete things, you make the circle big. It's now one thing. But there are still ways for people to do the five discrete things. Maybe instead of just five things, now there's N things.

---

## Part 4: The Expanding Vision

### From IDE to Everywhere

**Rid:** It sounds like you're creating something that can support designers, all types of different builders. Does your model require the default version to be the simplest form?

**Ryo:** Right now everyone comes into Cursor and sees three buttons, and a lot of people don't understand what they mean:

- "Open project" - you need to create a folder on your file system
- "Clone repo" - what the fuck is a repo?
- "Open SSH" - what's SSH?

Nobody knows outside the programming world.

But conceptually, all the people around building software - maybe you're a designer, PM, data person - everything we're doing, at the end, is just code that gets written. We're influencing what code gets written. We're part of this game.

Once AI is able to help translate those into code, it's more collaborative. It's a human with AI thing. It's a team thing. It's not AI replacing creators.

A 1x engineer can become a 10x engineer. A 10x engineer becomes a thousand-x engineer. A designer becomes a 10x engineer even.

I don't want the tool to be "we built a Cursor for designers" or "Cursor for PMs." It's just Cursor. It's the same agent. Cursor might change how it feels depending on who you are.

### Beyond the IDE

**Rid:** Talk to me about the tension between the familiarity of an IDE and scaling for a world where Cursor for X might just be Cursor.

**Ryo:** The IDE is just one form of Cursor. We started there because it's the most popular code editor - coders know what it is. Now you deeply fuse it with AI.

Look at the trajectory:

1. Manually writing code
2. Auto-completion of code
3. Edit this part of code
4. Ask the whole codebase
5. It can do stuff - make tool calls, modifications, search on its own
6. Three parallel threads in the foreground (tabs)
7. Background agent - N things simultaneously, parallel or sequential

But Cursor even today isn't stuck in the IDE. We ship the Slack integration, web agent, it works on phone, any browser.

You can feel it's just different forms of the same thing. Different people or different parts of workflow might prefer different forms.

The most manual people still love the tab thing more than agents. But there are people everywhere on the spectrum. Some might not even use Cursor IDE - just the web agent. They might not even see code, just planning things at a high level. But it's still Cursor, still the same thing.

---

## Part 5: Multi-Agent Design Challenges

### The To-Do List Revelation

**Rid:** Are there specific design challenges you've wrestled with around simultaneous agents?

**Ryo:** I spent probably this month mostly thinking about this problem: How do you spin up multiple agents, manage them, view what's going on? Once they're done, what to do with them? How do they work? How do you plan things ahead?

Most people still do one thing at a time. But some want to plan ahead - some executed sequentially with dependencies, some parallelizable. Like "I have 10 bugs to fix - just fix them all and see what happens."

Then there's this whole flow:

- Tasks that are planned
- You're doing them (the agent is doing them, but you're responsible)
- Once done, review the changes
- Decide what to keep
- Decide how to merge and ship

Then I was like, "Oh shit, it's to-do list all over again."

**Rid:** And we're back.

**Ryo:** Every single time we're back to the to-do list. For the agent, for humans. List view, grid view, column view. How about we make it a kanban board - and we're back to the same thing.

The only difference is these things might be done by the agent. That's it. It's so simple.

**Rid:** How quickly did you arrive there?

**Ryo:** What we wanted was maybe chats could each become a task - one-to-one. But people use it so differently. Some have a giant long-running chat for everything. Some have a chat for specific edits or areas. Our preferred method is still: make a new chat for every single task.

That was tempting because that's the simplification - if everyone did that, every chat is a task. You don't need another concept.

But some people want to do five things in one chat, some just one. And agents have limited context windows - we're stuffing file context plus chat history plus what it did. As you go longer, it forgets. Sometimes the model is great for the first few times, then gets dumber.

The more interesting part is it's not to-do list just for the agent or one chat, but the whole thing. You can break up entire software development into tasks pegged to prompts and chats.

Because this concept is so universal, the interface doesn't have to be complex. Anybody who's seen a list view can start doing these things. That's why we built these things outside the IDE - you can access it at cursor.com/agents. Boom, a list view of agents. Click around, see what they do, see the chat without looking at code, hit merge. Done.

---

## Part 6: How Ryo Works

### Week to Week

**Rid:** Talk to me about your week to week as the person designing Cursor.

**Ryo:** Every week I come up with things I want to do and explore - specific problems. Like this week: making our pricing clearer, doing more on the background agent web/mobile launch, cleaning up, making things better.

At the same time, I try to gather a lot of information from everywhere to keep awareness of what's going on and how people perceive Cursor.

I try to do projects on my own. That's how we dogfood and how I get intuition of where the limits of AI are, where our problems are.

You just play, you build. We build Cursor with Cursor, and I build "baby Cursor" with Cursor that ends up in Cursor.

I don't even add new features - I just improve things I did or the agents did. I refactor systems, make better ones, and learn. I can know maybe O3 is better at this versus Gemini. Then I carry that knowledge back to work and we fix the tool.

### Filtering Signal from Noise

**Rid:** Where are you deriving signal versus what you ignore? There are a lot of people giving you feedback - 772 comments on your mobile designs.

**Ryo:** I just look at everything on Twitter, Slack, all user reports and feedback. I try to simmer them in. It's like training a model - feeding more data, building intuition. The more you see, the better your priorities get, your sense gets.

**Rid:** How have you evolved your system for what feedback to ignore?

**Ryo:** For most little decisions in isolation, they don't really matter. But when you put them together, they all matter - the direction matters, the concepts matter, the idea matters more than how you do it.

I try to get a sense of what the person really wants, why they told me this. Their solution? I don't care. Sometimes I ignore those too - they're not important. Even for myself, they're not important.

The more you look at these things, the easier you naturally process them. You build your own processor filtering out noise and building intuition. It's dynamic - maybe this week people are saying XYZ is better or bad, it changes.

### Competing Timelines

**Rid:** There's competing timelines - feature requests that make sense but it's all about making faster horses.

**Ryo:** Take everything but you set the priorities and they change. It's more like dynamic ordering.

It's not just the outside - there's company stuff, resource limitations, technical limitations, the present, the future, you, the engineers, designers, everyone, manual control versus automation.

It's really hard if you try to pick sides because you get stuck. It's much easier to look at everything and figure out: for now we do this, maybe later we do that.

---

## Part 7: Personal Process

### Tools for Different Problems

**Rid:** When are you using Cursor versus other tools? Is there correlation between tools and fidelity of the idea?

**Ryo:** Because we're building software and code is the material, Cursor is still the best place to interact with the code. You have no limitations. You can do whatever.

As your codebase gets complex, Cursor has more tools to cover it. It scales from a single thing to something big and complex.

People are writing docs in Cursor. Marketing research, reports, all sorts of things. Code is the lowest level primitive - it's the layer where we can do almost everything.

If you start from that layer and build a system around how to interact with any codebase, solve hard AI software engineering problems so the agent can make more complex software and check its own errors, then it's much easier to build upper layers.

### Medium Fits the Problem

**Rid:** Where were your explorations happening before you arrived at the to-do list as primitive?

**Ryo:** I use whatever medium fits the problem.

I do a lot of walks around the office on my phone with Notion, just typing ideas as a bullet list. Walk and write. I come up with more conceptual stuff.

Maybe there's a visual problem that needs 2D space, exact pixel placement, quick iteration between layouts - the current tools don't allow that with real code or AI. So I still use Figma for that.

For prototyping or mocking up that's super hard in Figma but easy in code - I use Cursor, build it out, see how it feels.

One example is the stop and queue interaction we're shipping today or tomorrow. That started from a prototype in baby Cursor. I showed it to people, they said "oh cool," and we built it.

**Rid:** You used the verb "feel it" - that's exactly it. It's the only thing that matters for stopping a queue. If you're working on a product with AI output, anything like a chat, it's impossible to move the needle in Figma. Impossible.

---

## Part 8: The Future of Interfaces

### Fluidity and Personalization

**Rid:** You talked about fluidity of future AI interfaces. Share your thinking.

**Ryo:** You can't design a thing with mocks anymore. They're just static pictures of one ideal state that you think every human will understand. That's impossible.

We as designers try to simplify everything, dumb it down, make it the most universal thing - and maybe you fuck up your whole product because you watered it down. It doesn't do the magic some people wanted anymore.

It's almost like the Mac OS redesign from liquid glass - forcing people onto a grid, a pattern, a system that doesn't make sense for that context. Interfaces were designed differently for a reason. iPhone buttons are 44 pixels tall versus Mac's 28.

Every single person thinks differently, talks differently, has different preferred methods of interacting. Even engineers are so different - some fully in the agent world, some still typing code manually. Some purely use keyboard (Vim, Emacs users), but also a lot of people just click.

I saw a tweet from Jared who works at Bun: "Get a desktop. The app - that's the best way to see this."

**Rid:** I didn't know that was legal to say as an engineer.

**Ryo:** I don't want to impose my preference onto people. I want to satisfy all of them. When people come in, they should feel this thing is for them.

To do that, the interface will change and people can use it in a million ways. You need to design low-level architecture where you can fit all these configurations and customizations.

### Designing Containers, Not Screens

**Rid:** What has to happen to make the jump toward scale while maintaining soul? It sounds like personalization is the antidote.

**Ryo:** We haven't even started on this one.

When you open Cursor with three buttons - the things we design as designers just go up one level. Instead of designing exactly how this piece of UI will look, the order of buttons, where they're placed - you're actually designing a container.

These are the patterns in my whole system, and they translate between each other. In Cursor, the little input when you select text (Command K), the chat on the side that can open as full editor, full window, the background agent on website, on mobile - conceptually they're the same things but in different forms depending on where you are.

**Rid:** Is that a finite list? Are you coming up with all the primitives?

**Ryo:** They can be combined - it's probably a standard factorial.

**Rid:** Is there room for dynamically generated UIs from AI?

**Ryo:** It's possible, but I don't think arbitrary generating UI that creators cannot control or predict is a good thing. It creates more chaos.

But if you come into Cursor, maybe based on what we know about you, your projects, your preferences, AI can reconfigure the entire Cursor for you. Maybe it flips upside down. Maybe all you see is a canvas where you can draw stuff and boom, your idea turns into a real component.

Or maybe a pure coder comes in and all they see is terminals. Why not? But you're still using Cursor through a different form. You're still touching the same low-level primitives - and there's not a lot of them. There are actually very few.

If you build too many abstractions now, you're going to get fucked because a lot won't make sense. But certain things will never change.

---

## Part 9: The Universal Patterns

### What Doesn't Change

**Rid:** Coming from Notion - blocks for AI to wield dynamically is probably more important now than ever in designing digital products.

**Ryo:** Yeah. But the forms we interact with haven't changed much and they don't need to.

**Rid:** To-do list.

**Ryo:** Different ways people process information - visual, list, card, table, could be anything. But it depends on what you're doing, who you are.

---

## Part 10: Real OS - The Personal Project

### Why Build It?

**Rid:** Talk about Real OS. People are completely in love with it on Twitter. What's the deeper motivation?

**Ryo:** It started as pure accident. I built the first app - the soundboard app. If you open it, there's pre-recorded sounds of me making noises.

**Rid:** That's you?

**Ryo:** Yeah. I was leaving Notion and wanted my team to have my voices in meetings.

It started as a React Tailwind CSS app - very generic, functionally correct, looks very ugly. I said "make it more like retro Mac OS." It pulled some random pixely font from Google - still very ugly but you could sense where it was going.

Then I said "put it in a window" - a really bad crappy window. "Make a menu bar" - it made a menu bar.

Then I thought: why does this thing only have one app? It looks like an OS but only has one app.

I built the second app - Internet Explorer. Just a browser with a bar - an input and an iframe, I called it an app.

When I did that, me and the agent redesigned the whole OS architecture: How do I handle multiple apps? Multiple windows? Window foregrounding, backgrounding, which one's active, dragging, resizing, managing app states, storing in local storage so when you close and reopen, states remain.

Then I added a text editor with slash commands. Then: what if the chat can write into the text editor?

No plans. Pure vibes.

### The Speed of Ideas

**Rid:** You think it's that you're quick to act on ideas?

**Ryo:** One reason I joined Cursor is I want the gap between having an idea and it becoming reality to get closer to zero. With Cursor I can literally do that.

Now I can do way more than any single person was capable of before, even as an engineer.

I wrote most of the real code in one or two months. Right now it's 130,000 lines of code.

**Rid:** Whoa.

**Ryo:** I asked ChatGPT how long it would take for a normal engineering team - months or years with tens of people. And it's just me by myself on the side, vibe coding random ideas.

---

## Part 11: Building Cursor at Cursor

### Blurred Roles

**Rid:** How do you collaborate with engineers at Cursor? How often are you contributing production code?

**Ryo:** One example - we have another designer, Ricky, from Notion. He's a big design system guy - loves making components in Figma. Color tokens, styles, components, nested components, all the states.

He joined and started there - old habits - cleaning up, mocking up, making them visually perfect. Which is important, but it's a thing you only do once.

He did that in Figma for maybe two weeks. I said "what are you doing? Let's just try vibe coding it."

**Rid:** What do the engineers think?

**Ryo:** They love it. They see us as part of them now.

**Rid:** Explain that.

**Ryo:** I started building things without knowing distinctions between designer, engineer, PM. I just made stuff myself. I designed in my mind, I coded it. And I felt this whole thing doesn't make sense.

The designers draw pictures and pixel states, then engineers need to take those pictures and design the whole architecture and build everything. It doesn't make sense. It's the same problem, same puzzle - different sizes, different layers of abstraction.

If you slice it like this, it ends up weird when it could be way better.

Before me, there were no designers at Cursor because people just built for themselves. I think that's great - that's how Cursor got here. But as you expand to more people, you need the system to accommodate more ways of doing things.

**Rid:** Your story speaks to the value of the designer - since you had people building for themselves, but it was the designer required to untangle complexity and create solutions that scale to more people.

**Ryo:** Exactly. We have so many great engineers, but they're clueless in some ways. They build the hardest part of the problem but forget to build the doors. Or forget to make paths flow into the same thing.

Instead of building five things, maybe we should build one thing that has N or a million different ways to see it.

That's what designers or software architects do - designing the boundaries of things, how concepts work together. Instead of layer by layer - strategy doc, PMs write requirements, split tasks, do planning sessions, split to engineers like coding monkeys.

Instead, we're just builders with ideas wanting to build the best thing together. Maybe I'm more artsy, maybe I do more visuals, maybe you think about data model or ML. You're completing this puzzle together, and the roles and titles just don't matter anymore when everyone gets to write code.

---

## Part 12: Durable Skills for Designers

### What Matters in the Future

**Rid:** In a world where everyone can contribute ideas in code, what are the durable skills that define what a designer brings?

**Ryo:** If you pull all the way up - it's really just how you interpret the world, how you view things around you, the concepts you're working with.

We're all different. Some are good at deep detail but less on high level. Some are good at high level but not crafty. Some are good at low-level code but when they build UI, they throw buttons everywhere and confuse people.

All we're doing results in beautiful quality software that works. That's the ideal state - the sum of all these people, where they want to get to.

Before Cursor, these people had to rely on archaic ways to communicate, align, and work together.

Each role, each specialization thinks differently in their own mental palace. Designers talk in visual hierarchy, typography, spacing, colors. Engineers talk in backend stuff. But it's all the same thing - the backend generates a message to display in UI through pixels.

What doesn't change is how you build the thing. How you think about it. How you break it up. How you tie it back together with people and AI and code. What you want the thing to be.

Some people think a single purposefully built thing that only does one thing is great. I don't think like that. Different preferences, different ways of doing things - those might be what makes the difference.

---

## Part 13: The Future of HCI

### The Final Question

**Rid:** I outsourced my final question to you. I asked the virtual Rio, "What's the most interesting question to end this conversation?" It said:

> "What's something you believe about the future of HCI that sounds insane but you still believe is true?"

**Ryo:** The interface will just become how you think. And I think it will get closer to you.

Maybe we don't operate from proxy devices. Maybe it's even closer - I'm a visual thinker, I'll still see my canvas stuff, but maybe they're floating in my mind instead of on a screen.

**Rid:** That's a trippy future.

**Ryo:** Have you seen the new Neuralink presentation? They can already, with a thousand electrodes, draw stuff in your vision field.

**Rid:** The whole definition of what we think of as a designer in that world - what does it mean? How much carries over?

**Ryo:** There's still someone coming up with the concepts, how you call things.

**Rid:** The importance of language.

**Ryo:** That is actually a big part of my job now - clarifying concepts and ideas that are supposed to be the same into their simplest form that doesn't change.

---

## Closing

**Rid:** Rio, this has been amazing. Thank you for geeking out on all the things in your brain. I'm even more appreciative that you took this role knowing now the impact you've had on this product. It's been a joy to watch as a user and observer.

**Ryo:** Thank you.

---

_Transcribed and formatted from the Dive Club podcast episode._
