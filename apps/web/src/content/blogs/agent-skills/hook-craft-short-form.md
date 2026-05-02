---
title: 'Hook Craft For Short-Form: An Agent Skill For Better Openers'
description: 'A source-lineaged agent skill for drafting, auditing, and rewriting hooks across short-form video, blog leads, social posts, demo openers, and pitch slide 1.'
author: 'DJ Wayne'
date: '2026-05-02'
lastmod: '2026-05-02'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    [
        'agent-skills',
        'hooks',
        'short-form-video',
        'content-strategy',
        'copywriting',
        'marketing-and-content',
        'buildos'
    ]
readingTime: 9
excerpt: 'A hook is not one clever sentence. It is four aligned signals built from archetypes, slot grammar, a three-beat structure, and a diagnostic pass. This skill turns that into an agent-readable playbook.'
skillId: 'marketing-and-content/hook-craft-short-form'
skillType: 'combo'
skillCategory: 'marketing-and-content'
providers: ['YouTube source analysis', 'BuildOS YouTube library']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    [
        'content-strategy-beyond-blogging',
        'viral-video-script-structure',
        'story-driven-content-craft'
    ]
skillSource: 'docs/research/youtube-library/skill-drafts/hook-craft-short-form/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/hook-craft-short-form/lineage.yaml'
lineagePeople:
    - 'Kallaway'
lineageStats:
    sources: 4
    primitives: 6
    sourceClaims: 9
    edges: 19
    candidateV2Sources: 2
lineageSources:
    - title: 'How to Create Irresistible Hooks (and blow up your content)'
      creator: 'Kallaway'
      url: 'https://www.youtube.com/watch?v=LmXpbP7dD48'
    - title: "Give me 15 mins, and I'll make your hooks impossible to skip"
      creator: 'Kallaway'
      url: 'https://www.youtube.com/watch?v=2byPP_9F0-Q'
    - title: 'I Studied 100 Viral Hooks, These 6 Will Make You Go Viral'
      creator: 'Kallaway'
      url: 'https://www.youtube.com/watch?v=xnOe8aA9Pmw'
    - title: 'The ONLY 6 Words You Need to Hook ANY Viewer'
      creator: 'Kallaway'
      url: 'https://www.youtube.com/watch?v=S9FlxFv9dxg'
path: apps/web/src/content/blogs/agent-skills/hook-craft-short-form.md
---

# Hook Craft For Short-Form Content

Use this skill when an agent needs to make the first 1 to 5 seconds of a piece of content earn the next 30 seconds. The hook is the 80 of the 80/20. Never let the body get more revision passes than the opener.

A hook is not one clever sentence. It is **four aligned signals**: spoken words, key visual, text overlay, and audio cue. Those signals are built from six structural slots, organized across three beats, and audited against four failure modes. The agent's job is to enforce that order, not generate from blank.

## Skill Composition

This is a combo skill distilled from four Kallaway source analyses. The pieces stack in a strict order.

| Primitive                    | Job                                                                                  | Primary source layer                    |
| ---------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| Hook archetype selection     | Pick the strategic shape from the available visual and contrast.                     | 100 Viral Hooks                         |
| Six-slot grammar             | Fill subject, action, objective, contrast, proof, and time before polishing.         | 6 Words Hook                            |
| Three-beat structure         | Shape the opener as context lean, scroll-stop interjection, and contrarian snapback. | Irresistible Hooks                      |
| Four-mistake diagnostic      | Audit delay, confusion, irrelevance, and disinterest in order.                       | Hooks Impossible To Skip                |
| Visual/text/audio alignment  | Make all four signals point at the same opt-in promise.                              | 100 Viral Hooks + Irresistible Hooks    |
| Variant log and payoff check | Generate multiple variants and verify the body can pay off the promise.              | 6 Words Hook + Hooks Impossible To Skip |

## When To Use

- Draft or rewrite an opening for TikTok, Reels, Shorts, or vertical YouTube.
- Draft or rewrite a blog lede, LinkedIn opener, X thread first line, or email subject.
- Open a demo video, sales call recording, conference talk, or pitch deck.
- Audit a draft hook a founder already wrote.
- Tag a competitor's hook against the slot grammar to learn from it.
- Build a hook variant log so the agent learns the founder's voice over time.

Do not use this skill for body copy, payoff structure, or CTAs. Pair it with a content strategy skill above it and a script structure skill below it.

## Core Principles

**Hook equals opt-in machine.** Its only job is topic clarity plus on-target curiosity. Anything else is overhead.

**Visual is load-bearing.** The key visual decides the hook; the words confirm it. If there is no visual, the agent must either design one or kill the video idea.

**Lead with pain or benefit, not the thing.** Hostile audiences will still listen if the pain is theirs. They will not listen to a feature description.

**Slot grammar before cleverness.** Hook craft is slot-stacking. Cleverness is downstream of structure.

**Snapback must redirect, not amplify.** A snapback that goes "more of the same, bigger" is escalation, not contrast.

**Empty snapbacks are fraud.** If the body cannot pay off the hook's promise, refuse to ship the hook.

## Pillar 1: Six Archetypes

Pick one archetype based on the available key visual, not just the topic.

| Archetype      | Contrast spine                         | Use when                                                           |
| -------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Fortune Teller | Present to future                      | A real forward-looking claim and future-feeling visual exist.      |
| Experimenter   | Old method to new method               | Live demo, screen recording, or comparison footage exists.         |
| Teacher        | Failing at X to winning at X           | The content is a hard-won lesson with clear transfer value.        |
| Magician       | Layer or modifier                      | Atypical visual, object, or visual pacifier can heighten the hook. |
| Investigator   | Unknown to now-you-know                | There is a genuine secret or under-noticed insight.                |
| Contrarian     | Conventional wisdom to opposite belief | A real opposing point of view exists with proof.                   |

Magician is a modifier, not a standalone hook. Layer it under one of the other five.

For BuildOS founder content, contrarian and teacher hooks are usually native. Anti-feed positions, anti-AI framing, and context-engineering arguments start contrarian. Frameworks, lessons, and product walkthroughs usually start teacher or experimenter.

## Pillar 2: Six-Slot Grammar

Every hook fills these slots:

```txt
[Subject] [Action] [Objective/End-state] [Contrast] (+ [Proof]) (+ [Time])
```

Mandatory slots: subject, action, objective, contrast.

Optional slots: proof and time. Proof is near-mandatory for education. Time only belongs when it is credible.

Slot collapses are normal. "0 to 100K" can be objective plus contrast. "Before you build it" can be contrast plus time. The point is not to make the hook longer. The point is to make the structure visible.

## Pillar 3: Three-Beat Structure

Hooks are usually two or three lines, not one. Use three beats:

1. **Context lean.** Topic noun in the first 5 to 7 words. Earn the lean through common ground, pain, benefit, metaphor, or a surprising insight.
2. **Scroll-stop interjection.** Use contrastive motion: but, however, yet, although, therefore. Reuse an embedded belief, then refuse it.
3. **Contrarian snapback.** Travel in a different direction than the lean while staying on topic. Bigger shock needs bigger proof.

If clarity plus contrast can collapse to one line, prefer that. Never pad just to fill the structure.

## Pillar 4: Four-Mistake Diagnostic

Run these passes in order. Each pass assumes the prior one is clean.

| Pass        | Question                                       | Fix                                                           |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Delay       | Is the topic noun in the first 1 to 2 seconds? | Delete everything before the topic line.                      |
| Confusion   | Can the hook be misread?                       | Rewrite at sixth-grade clarity, active voice, low ambiguity.  |
| Irrelevance | Does it address the viewer's pain or desire?   | Convert topic description into "you/your" consequence.        |
| Disinterest | Is there explicit A vs B contrast?             | Name the viewer's current belief and the sharper alternative. |

Only ship hooks that pass all four.

## Generate A Hook From Scratch

1. Inventory the visual: footage, screen recording, prop, object, motion graphic, or text-overlay scaffold.
2. Find the biggest real contrast.
3. Pick the archetype from the visual plus contrast.
4. Fill the six slots.
5. Lay out the three beats.
6. Write a 3 to 5 word text overlay.
7. Specify the visual cue and motion level.
8. Specify the audio cue or mark it voice-led.
9. Run the four-mistake diagnostic.
10. Run the comprehension sandwich: silent, with audio, silent again.
11. Generate 3 to 5 variants.
12. Record the payoff coherence note.

The comprehension sandwich is important. The eye scans the visual, the ear parses the spoken hook, and the eye returns to confirm. If spoken, visual, text, and audio signals disagree, stop and rework.

## Audit An Existing Hook

Given a draft hook:

1. Slot-tag every word or phrase.
2. Mark missing mandatory slots.
3. Identify the implicit archetype.
4. Run delay, confusion, irrelevance, and disinterest.
5. Run the ambiguity test in isolation.
6. Score the two-variable test: topic clarity and on-target curiosity.
7. Generate three rewrite candidates that fix the first failed pass.
8. Re-run the comprehension sandwich.

Use LLMs as clarity rewriters, not blank hook generators. The agent should start from seeded material: a founder draft, competitor example, source clip, or clear visual inventory.

## Output

Return a hook bundle, never a single line:

- Archetype
- Slot map
- Three beats
- Spoken hook
- Text overlay
- Visual cue
- Audio cue
- Lean mechanism
- Contrast mode
- Two-variable score
- Four-mistake pass result
- Comprehension sandwich result
- 3 to 5 variants
- Payoff coherence note

If the body cannot pay off the hook, the agent should refuse to ship the hook and state what proof or section is missing.

## Guardrails

- No empty snapbacks.
- No vague-suspense hooks on text-only platforms.
- No literal product names in text overlays when a better emotional category phrase exists.
- No jargon in the spoken hook.
- No hooks where the topic is missing from the first 5 to 7 words.
- No hooks scoring below 2/2 on topic clarity and on-target curiosity.
- No LLM-generated hooks from blank prompts.
- No all-contrarian feeds; rotate archetypes across a content cycle.
- No publishing without a hook variant log.

## Source Lineage

This skill is distilled from four Kallaway source layers.

- [How to Create Irresistible Hooks (and blow up your content)](https://www.youtube.com/watch?v=LmXpbP7dD48) supplies the three-beat structure, lean mechanisms, visual hook priority, and lead-with-pain rule.
- [Give me 15 mins, and I'll make your hooks impossible to skip](https://www.youtube.com/watch?v=2byPP_9F0-Q) supplies the topic-clarity test, four-mistake diagnostic, ambiguity test, and clarity-rewrite prompt.
- [I Studied 100 Viral Hooks, These 6 Will Make You Go Viral](https://www.youtube.com/watch?v=xnOe8aA9Pmw) supplies the six archetypes, four-signal alignment, visual-to-audio-to-visual sandwich, and key-visual rule.
- [The ONLY 6 Words You Need to Hook ANY Viewer](https://www.youtube.com/watch?v=S9FlxFv9dxg) supplies the six-slot grammar, copy-work drill, slot-collapse patterns, and audit-first posture.

The lineage file for the agent-readable draft maps these claims into primitive skills, guardrails, output artifacts, and source-claim edges.
