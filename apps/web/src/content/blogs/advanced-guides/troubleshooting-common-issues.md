---
title: 'BuildOS Troubleshooting Guide: Fix Common Issues Fast'
description: 'Quick fixes for the most common BuildOS problems. Calendar sync not working? Brain dump not parsing right? Projects feeling off? Start here.'
author: 'DJ Wayne'
date: '2025-6-27'
lastmod: '2025-6-27'
changefreq: 'weekly'
priority: '0.6'
published: true
tags: ['troubleshooting', 'support', 'solutions', 'advanced-guides', 'optimization']
readingTime: 9
excerpt: 'Quick fixes for common BuildOS problems. Calendar sync issues, brain dump parsing, project organization, and performance optimization.'
pic: 'troubleshooting-guide'
path: apps/web/src/content/blogs/advanced-guides/troubleshooting-common-issues.md
---

Something not working right? This guide covers the fixes for issues we see most often. Jump to your problem, try the solution, and get back to work.

## Quick Diagnostic Checklist

Before diving into specific fixes, run through this:

1. **Scope it**: One project or everything? If it's one project, the issue is probably data-related. If it's everything, check your integrations.
2. **Timeline it**: When did this start? Right after connecting a calendar? After a big brain dump? That narrows down the cause.
3. **Verify connections**: Check your [calendar settings](/profile?tab=calendar) and make sure the right accounts are linked.

## Project Issues

### "My project context seems generic or wrong"

**What's happening**: BuildOS generates context from what you give it. Thin input produces thin context.

**Quick fixes**:

1. **Add more detail to your project description**. Include your goals, constraints, timeline, and who's involved. Two paragraphs minimum.
2. **Check you linked the right project**. If you ran a brain dump and it went to the wrong place, the context will be off.
3. **Use specific language**. Industry terms, methodology names, and technical details help the AI understand what you're actually doing.

**If that doesn't work**: Add custom context fields manually. Three to five specific fields (like "Tech Stack: React/Node" or "Deadline: March 15") give the AI much better signal than generic descriptions.

### "The generated phases don't match how I actually work"

Phase generation works best when it has context about your workflow. If the phases feel off:

1. **Delete and recreate**. Remove phases that don't fit and add ones that do. Drag to reorder.
2. **Merge or split**. If you got five phases that should be two, combine them. If one phase is doing too much, break it apart.
3. **Be more explicit in your brain dump**. Mention phases directly: "First I need to do X, then Y, finally Z." The AI picks up on structure cues.

### "Tasks aren't showing up in the right project"

This usually happens when tasks get created outside of a project context, or when a brain dump creates tasks before you've specified which project they belong to.

**Fix it**:

1. Open the task and reassign it to the correct project.
2. Check for duplicates. If the same task appears in multiple places, delete the extras.
3. Going forward, create tasks from within the project view rather than from the global task list.

## Calendar Issues

### "Tasks aren't showing up in my calendar"

**First, check the basics**:

- Go to [calendar settings](/profile?tab=calendar) and verify you're connected to the right calendar.
- Make sure BuildOS has read/write permission. If you only granted read access, tasks can't sync.
- Check that your time zones match between BuildOS and Google Calendar.

**If it's still not working**:

1. Disconnect the calendar integration completely.
2. Reconnect it fresh.
3. Create a test task with a due date and see if it appears.

This clears out any stale OAuth tokens or cached connection state.

### "Events are scheduled at the wrong times"

Usually a time zone mismatch or incorrect work hours configuration.

1. **Check your time zone** in profile settings. If you travel, this might need updating.
2. **Set your work hours** so BuildOS knows when you're available. Events won't schedule outside these windows.
3. **Review buffer settings** if tasks are getting crammed together without breaks.

## Brain Dump Issues

### "Brain dump created too many projects (or the wrong ones)"

The AI groups your thoughts based on what looks like distinct outcomes. If you get fragmented projects, your brain dump probably had multiple unrelated threads without clear connections.

**How to fix it**:

1. **Merge the projects** that should be one. Select them and combine.
2. **Delete irrelevant ones** that got created by mistake.
3. **Next time, be explicit** about what belongs together. "These three things are all part of launching the product" helps the AI group correctly.

### "AI suggestions don't match how I work"

BuildOS learns from your patterns, but it needs data. If suggestions feel off:

1. **Be consistent with your feedback**. When you accept or reject a suggestion, that trains the system.
2. **Update your preferences** in settings. Tell it when you do deep work, when you handle admin tasks, what your priorities actually are.
3. **Keep your context current**. Stale project descriptions lead to stale suggestions.

## Performance Issues

### "Everything feels slow"

**Quick fixes**:

1. **Hard refresh** (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) to clear cached resources.
2. **Check your internet connection**. BuildOS needs a stable connection for AI features.
3. **Close other tabs**. If you have 50 tabs open, your browser is fighting for memory.

**If it's still slow**: Archive old projects. A cleaner workspace means less data to load.

### "Changes aren't syncing between devices"

1. Make sure you're logged into the same account on both devices.
2. Check that both devices have internet access.
3. Force a refresh on the device that's behind.

If you're making rapid changes on multiple devices simultaneously, give the sync a moment to catch up before switching.

## Workflow Issues

### "I'm completing tasks but not making real progress"

This is a strategy problem, not a technical one. BuildOS can organize your work, but it can't tell you which work matters.

**Ask yourself**:

- Are these tasks actually moving projects forward, or just keeping you busy?
- Do your active projects connect to goals you care about?
- Are you working on urgent things while important things wait?

**Fix it**: Do a weekly review. Look at what you spent time on versus what actually mattered. Pause or archive projects that aren't serving real goals.

### "BuildOS feels overwhelming"

You're probably trying to use everything at once.

1. **Reduce active projects to 2-3**. You can have more in the system, but only focus on a few.
2. **Turn off notifications** you don't need.
3. **Simplify your dashboard** to show only what matters today.

BuildOS works best when it reflects your actual capacity, not your aspirational to-do list.

## Keeping Things Running Smoothly

### Weekly (10 minutes)

- Archive completed projects
- Update project statuses
- Delete duplicate or stale tasks
- Quick check that calendar sync is working

### Monthly (30 minutes)

- Review whether your active projects still align with your goals
- Adjust your work hours and preferences if your schedule changed
- Clear out anything that's accumulated but isn't useful

## When to Contact Support

Reach out if:

- You've tried the fixes above and nothing worked
- Data seems lost or corrupted
- You're seeing security or privacy issues
- Performance problems persist across devices and browsers

**Before you contact us**, grab:

- A clear description of what's happening
- What you've already tried
- Screenshots if possible
- Your browser and device info

---

_Still stuck? [Contact our team](/contact) or check the [community forum](/community) where other users share solutions._
