---
title: "How To Train Your AI Agent's Skills (Claude Code / OpenClaw)"
source: https://www.youtube.com/watch?v=KkJZY5Klymw
type: tutorial-transcript
topic: agent-skill-training
date_parsed: 2026-02-01
key_concepts:
    - skill markdown files
    - iterative training
    - workflow documentation
    - token/time optimization
tools_mentioned:
    - Claude Code
    - OpenClaw
    - Cursor
    - Chrome DevTools Protocol (CDP)
    - JavaScript injection
path: skill-learn-youtube.md
---

# How To Train Your AI Agent's Skills

## Overview

This tutorial demonstrates how to train AI agents (Claude Code / OpenClaw) to learn new skills using markdown files. The core concept is **iterative skill documentation** - letting the agent figure out how to do something, then saving the successful workflow to a skill.md file for reuse.

---

## Step-by-Step: Creating a New Skill

### Step 1: Set Up Your Skills Directory

Store all skills as `.md` files in a dedicated directory:

```
claude.skills/
├── x.skill.md          # Twitter/X navigation
├── gmail.skill.md      # Gmail automation
├── youtube.skill.md    # YouTube workflows
├── linkedin.skill.md   # LinkedIn workflows (example)
└── ...
```

### Step 2: Create an Empty Skill File

Start with an empty markdown file for the new skill:

```bash
# In Claude Code
> We're going to learn a new skill today: LinkedIn
> Create a new /skills/linkedin.skill.md file, empty for now
```

**Why empty?** You need to iterate first. The agent will discover what works.

### Step 3: Point the Agent to Required Tools

If the skill requires browser automation, direct the agent to the necessary utilities:

```
> Read the browser.js file so you know how to open Chrome and navigate using JavaScript
```

This gives the agent context on how to interact with the browser via CDP (Chrome DevTools Protocol).

### Step 4: Let the Agent Explore (The Discovery Phase)

Give the agent a task and let it figure out how to accomplish it:

```
> Open linkedin.com
> Make a draft post on LinkedIn
```

**What happens:**

- Agent tries different approaches
- Uses JavaScript injection to interact with elements
- Searches for correct selectors (LinkedIn's editor may not have standard attributes)
- Eventually figures out the working approach

**Example timing:** First attempt took ~6 minutes of trial and error.

### Step 5: Save the Successful Workflow

Once the agent succeeds, immediately capture what worked:

```
> Great job! Now update the linkedin.skill.md file with the workflow
> that led to us creating a post with success. For next time to save time.
```

The agent writes the successful:

- JavaScript snippets
- Element selectors
- Step sequence
- Any workarounds discovered

### Step 6: Test the Trained Skill

Close the context window completely, then test with a fresh session:

```
> Go to linkedin.com and compose a draft post about AI agents.
> Don't post anything. Wait for feedback.
```

**Results:**

- First attempt (no skill): ~6 minutes
- Second attempt (with skill): ~40 seconds

---

## The Iterative Training Loop

```
1. Create empty skill.md
       ↓
2. Let agent attempt task (discovery)
       ↓
3. Agent struggles, tries different approaches
       ↓
4. Agent succeeds
       ↓
5. Save workflow to skill.md
       ↓
6. Test with fresh context
       ↓
7. Add more capabilities (repeat 2-6)
```

---

## Key Tips & Best Practices

### Tip 1: Update Skills Incrementally

After each new capability is discovered, update the skill file immediately:

```
> Add this way of finding people to skill.md
```

### Tip 2: Use Dedicated Hardware for Persistent Sessions

The creator uses a dedicated Mac Mini where:

- The agent is always logged into necessary services
- No repeated authentication needed
- Persistent browser sessions

### Tip 3: Make Skills Composable

Train individual skills that can work together:

- Video research skill
- Video creation skill
- YouTube publishing skill
- X/Twitter posting skill

Then chain them: "Do video research, create a video, publish on YouTube, post about it on X"

### Tip 4: Be Patient During Discovery

Let the agent work through problems. It will:

- Try different selectors
- Use CDP to inject JavaScript
- Research element structures
- Eventually find what works

Only intervene manually if it's truly stuck.

### Tip 5: Hard Exit Between Tests

When testing a trained skill, do a complete context reset:

- Exit Claude Code
- Discard the session
- Start fresh
- Load the skill explicitly

This proves the skill file contains everything needed.

---

## Benefits of Skill Training

| Without Skills       | With Skills           |
| -------------------- | --------------------- |
| 6+ minutes per task  | ~40 seconds           |
| High token usage     | Minimal tokens        |
| Repeated trial/error | First-attempt success |
| Expensive            | Cost-effective        |

---

## Example Skills Trained in Video

### LinkedIn Skill Components

1. **Create Post**
    - Navigate to linkedin.com
    - Open post composer
    - Inject text via JavaScript/CDP
    - Handle non-standard editor elements

2. **Find People**
    - Search for company (e.g., "Anthropic")
    - Parse employee results
    - Extract names, titles, locations

3. **Send Messages**
    - Navigate to connections
    - Open messaging
    - Inject message text
    - Click send

---

## Advanced: Skill Store Concept

The creator mentions building a "skill store" - a marketplace for pre-trained skill files:

- Skills that work well can be shared/sold
- May be consumed by other agents, not just humans
- Like a plugin ecosystem for AI agents

---

## Full Transcript

<details>
<summary>Click to expand original transcript</summary>

Okay, so in today's video, uh I just wanted to show you kind of how I uh train up my AI agent to learn new skills. So you can see here, here is kind of my AI agent. This is like she's she is fully uh dedicated to like a Mac Mini. This is the way I have set it up. It doesn't have to be that way, but basically we uh have a lot of skills. So skills when I say skills I mean skills markdown files. So all these skills are available to my AI agent uh via markdown files right. So this agent has knows how to navigate X GitHub, Gmail research, video edit, YouTube and a bunch of other skills I kind of have manually trained it up to do iteratively as you will see. So today I thought we can just try something for the video. We're going to kind of use uh a new skill MD file just to learn how to navigate LinkedIn. So I want to set up like a LinkedIn profile for my agent to kind of get information, post stuff and stuff like that. So that's what we're going to do today. I'm just going to go through step by step how I kind of start a new skill and how we work on this iterative to kind of end up with something we can reuse later. So, let's just head over to my Mac Mini and where kind of the agent lives and let's do it. Okay, so we're just going to start here in uh kind of cursor and you can see we have the claw uh skills, right? And under here we have every single skill we kind of have trade-ups. This is the place we store our skill. Uh so you can see we have X here, skill.md, right? And we have all this information about X. Maybe I can pull this down a bit. I can see here's everything we know how to navigate X and we have thumbnail loop Gmail. Here is everything we need to know how to navigate Gmail. So this is kind of the type of file we want to create. So I'm just going to start on uh I'm just going to go to my directory here, right? And I'm just going to launch cloud. And the first thing I want to do now is uh if we go to slash skills here, you can see all the skills we have, right? You can see we have yeah everything. But we want to add one more today and that is going to be how to navigate and use LinkedIn for example. This is just my example for the video. It could be anything. So I'm just going to start with uh something simple. Uh we're going to learn a new skill today. Uh LinkedIn uh in uh at Claude or like claude.skills. Create a new/skills LinkedIn skill.md file empty for now. Okay. So it's just going to be empty for now because we need to iterate. So I'm just going to ask Claude to just generate this file. And from there we are going to actually start testing out what we can do on um on LinkedIn. Right. So I'm just going to give some more instructions. I'm just going to say that uh it's going to read a file we have to kind of connect to u to to uh to Chrome. So I'm just going to direct it to this browser JavaScript file because we want to use JavaScript to navigate on Chrome. So I'm just going to ask it to read this file so it kind of knows how to open up Chrome and navigate using JavaScript. So now we're just going to start by uh open uh linkedin.com please. And since this is this agent is kind of on my dedicated Mac Mini, we could just be logged in to all the parts we need, right? So if we go to LinkedIn now, you can see we are already logged into our account. So this is kind of like a um we can zoom in a bit here. So this is basically just a blank account. We haven't done anything. I just added myself here to this account just to do some testing. So we kind of have the name here. And yeah, this is basically just for testing. So now I'm basically just going to see what we can do with out of the box. So, I'm going to say something like, "So, we're just going to see what the agent can do now without me giving it any instructions, and we're just going to iterate and see if it kind of can make a draft post now uh on its own. Uh, if it doesn't really work, we're going to intervene and do some manual adjustments and stuff, but you can see kind of in the background here. Now, the agent kind of knows what it needs to do. It kind of opens up post and maybe it's going to do some uh injection here using JavaScript with text. We'll see. So you can see uh let me try to browse a post, right? You can see it's using JavaScript here to do this. So let me see if it can kind of come up with a draft here. Let's see if we can get some text in here. Maybe some attachments. We'll see. So you can see it's trying different things now. Now it's kind of referring to CDP here to kind of inject JavaScript to add the content because it's looking for elements where to kind of click on the text. So what is nice about this and it's just going to keep trying until it figured this out. So what we are kind of saving instead of every time we're going to do this uh the model doesn't have to really try and try and try until it figures it out. We kind of just take uh what was working we put it into the skill.md file and next time we're going to use LinkedIn. This is just going to go first attempt right that saves us token that saves us time. So this is why I kind of call call it training agents even though it can figure it out over time just by adding this exact workflow to kind of the skill MD file. This will kind of save us time next time token time and money. Right. So I'm just going to let uh the agent work here now figure out how to post and then we're going to save that workflow that worked into the skill MD file. So you can kind of see now I see the problem. The type command uses document query selector, but LinkedIn post editor might not have standard attributes. Let me try to write a quick uh JavaScript file to kind of inject text here into the post field. Let's see if that's going to work. If that doesn't work, it's probably just going to try something else. Uh but if we're really stuck, we might want to do some manual intervention looking at the elements, see what works and stuff. Now, you can see it says found it editor editor with blah blah blah. uh UCDP input insert text to type into it. So let's see if it kind of figured it out. Yeah, I've almost spent five minutes now researching this. >> Okay, so you can see there it finally figured it out after trying for such a long time. We spent 6 minutes figured it out. But now that we kind of got it, we're just going to try to save that. I'm going to restart and we're just going to see how much time this will save us. Right. So I'm just going to go something like uh great job. Now update this uh LinkedIn skill.md file with the workflow that led to us creating a post with success. For the next uh we run it to save time. So hopefully now it's just going to take the instruction it figured out how to do this with put it into the skill file and then we're going to try again with a new context window just to see how fast it goes this time when we kind of have kind of learned this skill. Right. Okay. So you can see now we kind of have updated our skill.md. I'm going to save that. Great. And now we're just going to go out again. We're going to close down this. And we're going to discard it. Just going to close it down. And I'm going to do like a hard exit here. Uh, but this time we should have a skill. So I'm just going to say something like okay. So now we're just going to do go to linkedin.com and compose a draft post on LinkedIn about AI agents learning to your skills. Don't post anything. Wait for the feedback from the user. So now it's going to be interesting to see how much time we spend. So last time we spent six minutes, right? So, uh, we can use the skill LinkedIn that we just created. You can see successfully loaded the skill. Hopefully, now it's just going to open up LinkedIn.com, I guess, or something. Yeah, perfect. You can see I'm not doing anything. And let's see how much time we're going to spend now in um regards to the previous when we didn't it. So, it open up this post part here. So hopefully now we have everything we need and it's just going to do it one time instead of kind of spending all this time trying different stuff. Okay, so we wrote the JavaScript, the temporary code. Boom. So you can see this saves us a lot of time, right? And now we spent about 40 seconds instead of 6 minutes because we are kind of already have trained our agent to do this. And now the post is ready. And if you wanted to, we can just post this. I'm not going to do that now, right? But this is just a part of the training and I'm just going to back out of this. I'm going to discard it. So yeah, great start here. Now let's uh ask for another skill we wanted to learn. Right. Okay. So the next skill I wanted to try out is uh something we can do on LinkedIn. So I'm just going to say read LinkedIn.skill attendee. Let's train some more on LinkedIn. Please try to find five employees from Antropic that we maybe connect to later. Just a test. see how well we can kind of navigate LinkedIn to look for uh people we can connect with. Okay, so I'm just going to see how it's going to do this now. It's going to use the browserjs. Perfect. And it's searching for Antropic up in the search bar here. I think that's pretty good. And it can it is it able to kind of scroll down here? So, we can see already that we have a few hits here. So, let me just see what it figures out. Uh, it should be able to scroll up and down if we needed to, but I'm just going to wait for the results and let's see what we got here. >> So, you can see it kind of cleaned up all the tabs it opened. And this is kind of the list we ended up with. Yeah, you can see we have a few people here. Tyler Quinn. Yeah, you can see it. Software engineer at Entropic. Applied AI at Entropic. We have their location. And I would say this worked out pretty good. So, I'm just going to say add this way of finding people to skill.mmd. So, we just update as we go. And I think the final skill I want to train on now is actually sending a DM or something like a message. So, I can try that on myself, right? Because I want to send to anyone else now. So, I'm I'm going to try to set that up. See how we can actually try to send um DM. I don't know if that works on uh LinkedIn, but let's try it anyway. So, I thought we can do this a bit more autonomously. So say uh read the linking skill again. Uh now please uh check who you are following if any send them a message hello how are you if possible don't give up until the message is sent when you figure this out how to do it update the workflow that worked into the skill MD file. So again let's just launch it and let's let's watch kind of how uh Claude is trying to figure this out. So it's probably just going to go to my profile or something and look for people. It should be only me, my profile. Yeah, that looks much better. And now it has the option to send. So, it's just going to kind of identify that uh button down there, send. Should just be able to click that. And we have sent our first message here using uh yeah, Aentic uh AI here on LinkedIn. Uh that should be it, right? Yeah, we sent our first me message on LinkedIn and yeah, perfect. So, that seemed to work. Now, we just have to update uh this skill and yeah, that should be it. I guess I think to test this, we're just going to do we just learn learned a new message skill in LinkedIn. Please test it again. Send thanks for the connect connected. Okay, it doesn't matter to our only connection. So, what I want to see now is this going much faster because uh again, we're going to use the LinkedIn skill because last time we kind of spent like 10 15 minutes on this. So, now we're just going to go straight to the messaging uh part. That's good. And I'm not 100% sure how it's going to do this. It should have the instructions now. So, this should go pretty fast. I can see the conversation and it should know what kind of scripts to run to actually inject the message. CDP script. Yeah, we are writing this temporary script. We are running it and thanks for the connected and we sent it. So you can see we learned that skill super fast and now we have it forever. So that is kind of how I have been training up these different skills and when everything come together, right? This is going to be really powerful. But then we can give open-ended task. I'm going to just give you like a quick example. Uh earlier today I said to my a agent do video research and create a video, publish it on YouTube, go to X post about it and it did everything in one go. So that saved me a lot of time and it was very autonomous. So this is what I've been doing the last few weeks just training up these different skills that we talked about and I think it's going to be really interesting. So hopefully you picked up something today and this is something maybe you want to try out for yourself. I'm going to keep updating um what I learned. I also kind of have a plan to just create like a store for this. So you can see I have updated one uh store here. So this is the skills MD. Uh I think this is maybe not going to be for humans, maybe for other agents. We'll see. So I'm going to kind of keep putting out some skills that work very well. Uh yeah, this this is basically just for fun, right? Just to test it and I'm going to keep updating all the skills here so I can kind of put them up for sale here, right? So I think this is just something I'm going to try out. But uh this basically how I've been doing this and I had a lot of success. So if you're going to go to my my let's say my YouTube here. So if you kind of look at uh this agent has their own YouTube channel. So, you can see it's posting uh different YouTube videos. So, we have plus 87 subscribers, 5,000 views, and yeah, this agent is just going to keep growing this channel because I taught it how to generate videos, right? So, just another example of how you can train your agents. So, that was all I had for today and I'm going to keep bringing you other different skills we're going to learn. So, give this video a like and uh subscribe if you want more of this. So, yeah. Thank you for tuning in and good luck trading your agents.

</details>
