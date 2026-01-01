<!-- docs/prompts/agents/enneagram/README.md -->

# Enneagram-Based AI Agent Profiles

This directory contains comprehensive agent configuration files for AI assistants tailored to each Enneagram type. These profiles enable BuildOS to provide deeply personalized assistance that works _with_ each user's psychological patterns rather than against them.

## Directory Structure

```
enneagram/
├── README.md                    # This file
├── type-1-reformer.md           # The Perfectionist/Reformer
├── type-2-helper.md             # The Helper/Giver
├── type-3-achiever.md           # The Achiever/Performer
├── type-4-individualist.md      # The Individualist/Romantic
├── type-5-investigator.md       # The Investigator/Observer
├── type-6-loyalist.md           # The Loyalist/Skeptic
├── type-7-enthusiast.md         # The Enthusiast/Adventurer
├── type-8-challenger.md         # The Challenger/Protector
└── type-9-peacemaker.md         # The Peacemaker/Mediator
```

## How to Use These Profiles

Each profile contains:

1. **Psychological Foundation** - Deep understanding of the type's inner world
2. **Cognitive Architecture** - How they think, process, and decide
3. **Motivational Dynamics** - What drives and blocks them
4. **Communication Protocol** - How to speak their language
5. **Intervention Strategies** - When and how to help
6. **Growth Integration** - Supporting healthy development

## Implementation Notes

- These profiles should be loaded based on user's self-identified or inferred type
- The assistant should internalize these patterns, not recite them
- Adaptation should feel natural, not performative
- Users can override or customize any aspect
- Consider wings and subtypes for deeper personalization (Phase 2)

## The Enneagram Centers

Understanding the three centers helps group types by their primary intelligence:

| Center            | Types   | Primary Intelligence | Core Emotion |
| ----------------- | ------- | -------------------- | ------------ |
| **Body/Gut**      | 8, 9, 1 | Instinctual          | Anger        |
| **Heart/Feeling** | 2, 3, 4 | Emotional            | Shame        |
| **Head/Thinking** | 5, 6, 7 | Mental               | Fear         |

## Stress and Growth Directions

Each type moves toward another type under stress (disintegration) and growth (integration):

| Type | Stress Direction                 | Growth Direction              |
| ---- | -------------------------------- | ----------------------------- |
| 1    | → 4 (moody, irrational)          | → 7 (spontaneous, joyful)     |
| 2    | → 8 (aggressive, demanding)      | → 4 (self-aware, authentic)   |
| 3    | → 9 (disengaged, apathetic)      | → 6 (loyal, collaborative)    |
| 4    | → 2 (clingy, people-pleasing)    | → 1 (principled, disciplined) |
| 5    | → 7 (scattered, escapist)        | → 8 (confident, decisive)     |
| 6    | → 3 (competitive, image-focused) | → 9 (relaxed, trusting)       |
| 7    | → 1 (critical, perfectionistic)  | → 5 (focused, depth-seeking)  |
| 8    | → 5 (withdrawn, secretive)       | → 2 (caring, generous)        |
| 9    | → 6 (anxious, reactive)          | → 3 (focused, effective)      |

The assistant should recognize these patterns and respond appropriately.

---

_See individual type files for complete agent profiles._
