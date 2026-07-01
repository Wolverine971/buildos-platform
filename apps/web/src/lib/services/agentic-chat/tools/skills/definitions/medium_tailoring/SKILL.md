---
name: Medium Tailoring
description: Reshape an approved, enhanced draft into one target medium's native format and apply that medium's amplification levers. Use at the Tailor stage when the piece is written and you are fitting it to LinkedIn, Instagram, X, YouTube, a blog, or a newsletter. Not for choosing the channel or platform strategy — that is algorithm_aware_publishing.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - medium-tailoring
    - marketing-and-content.medium-tailoring.skill
reference_modules:
    - id: medium_tailoring.linkedin
      name: LinkedIn Tailoring
      summary: Format, first-line hook, length, structure, and amplification levers for a LinkedIn post.
      when_to_load:
          - When the target medium is a LinkedIn post.
      path: references/linkedin.md
      visibility: public
    - id: medium_tailoring.instagram
      name: Instagram Tailoring
      summary: Carousel and Reel format, slide grammar, caption, cover, and amplification levers for Instagram.
      when_to_load:
          - When the target medium is an Instagram carousel or Reel.
      path: references/instagram.md
      visibility: public
    - id: medium_tailoring.x_twitter
      name: X / Twitter Tailoring
      summary: Single-post and thread format, hook tweet, pacing, and amplification levers for X.
      when_to_load:
          - When the target medium is an X (Twitter) post or thread.
      path: references/x_twitter.md
      visibility: public
    - id: medium_tailoring.youtube
      name: YouTube Tailoring
      summary: Title + thumbnail packaging, intro, retention structure, and CTA placement for YouTube video and Shorts.
      when_to_load:
          - When the target medium is a YouTube video or Short.
      path: references/youtube.md
      visibility: public
    - id: medium_tailoring.blog
      name: Blog Tailoring
      summary: Title, structure, scannability, on-page SEO surface, and internal-link levers for a blog post.
      when_to_load:
          - When the target medium is a blog post or article.
      path: references/blog.md
      visibility: public
    - id: medium_tailoring.newsletter
      name: Newsletter Tailoring
      summary: Subject line, preview text, one-CTA structure, and forward/reply levers for an email newsletter.
      when_to_load:
          - When the target medium is an email newsletter.
      path: references/newsletter.md
      visibility: public
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/medium_tailoring/SKILL.md
---

# Medium Tailoring

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  This file is skill_type: procedure, so Procedure carries the weight; Judgment holds the preconditions,
  thresholds, and the boundary vs algorithm_aware_publishing; the volatile per-medium format facts live in
  the six reference modules, loaded exactly one at a time.
-->

## Identity

Take a draft that is already written and enhanced, and reshape it into **one** target medium's native format — plus the amplification levers that medium rewards. This is the tactical transform at the pipeline's Tailor stage. It does not choose the channel and it does not decide platform strategy.

## Activation

- A draft spine is approved and enhanced, and now needs to fit a specific medium.
- The user says "format this for LinkedIn", "turn this into a thread", "make it a carousel", "write the YouTube version".
- A piece written for one medium needs to be re-cut for another.

Do not use for: choosing which channel to publish on, cadence, or algorithm strategy (`algorithm_aware_publishing`); writing the draft (`content_creation_pipeline` Stage 4); or the opening hook in isolation (`hook_craft_short_form`).

## Judgment

### Boundary vs algorithm_aware_publishing

`algorithm_aware_publishing` answers _where and whether_ to publish — platform choice, topic discipline, rented-vs-owned, brand safety. **Medium Tailoring** answers _how to shape this one piece_ once the medium is chosen — character limits, line breaks, slide count, hook placement, CTA. Strategy upstream; format downstream. If the user has not chosen a medium yet, route to `algorithm_aware_publishing` first.

### Precondition

The draft must be approved (Stage 5) and ideally enhanced (Stage 6, `sensory_double_tap`). Tailoring an unapproved draft bakes format work into prose that may still change.

### Thresholds (replace judgment with lookup)

- Load **one** medium reference per piece. Re-cutting to a second medium is a second pass, not a merge.
- **One primary CTA.** Additional asks dilute conversion — cut them.
- Respect the reference's hard limits (character counts, slide counts, title length). When the draft overflows, cut, do not shrink the font of the idea.
- Do not introduce a new argument during tailoring. New claims belong back in Draft.

## Procedure

### Universal Tailoring Procedure

Run this regardless of medium; the loaded reference supplies the medium-specific numbers and templates.

1. **Confirm the medium** and load its reference module (`medium_tailoring.<medium>`).
2. **Place the hook.** Move the strongest beat to the medium's attention slot (first line, cover slide, thumbnail+title, subject line).
3. **Reflow to the format.** Apply the reference's structure template, length thresholds, and line/segment rules. Preserve the spine's argument; do not add new claims.
4. **Carry the enhancement cues** into the medium's native asset slots (carousel slides, on-screen `[VISUAL]`, inline images).
5. **Set exactly one primary CTA.** One ask per piece; the reference says which CTA the medium rewards.
6. **Amplification pass.** Apply the reference's levers (e.g. first-line curiosity gap, save-bait, reply-prompt) without violating the piece's integrity.

### Workflow

1. Confirm the medium and that the draft is approved + enhanced.
2. Load the matching `medium_tailoring.<medium>` reference module.
3. Run the Universal Tailoring Procedure using that reference's numbers and templates.
4. Return the medium-native piece plus a short amplification note.
5. Hand to Ship (post / save / schedule). For platform strategy questions, escalate to `algorithm_aware_publishing`.

## Routing

Ownership map. This skill owns the format transform; upstream strategy and adjacent craft route out.

| Concern (what)                                         | Owner (who)                                  |
| ------------------------------------------------------ | -------------------------------------------- |
| Channel choice, cadence, platform / algorithm strategy | `algorithm_aware_publishing`                 |
| Writing the draft spine (Stage 4)                      | `content_creation_pipeline`                  |
| Opening hook in isolation                              | `hook_craft_short_form`                      |
| Stage 6 enhancement (sensory cues)                     | `sensory_double_tap`                         |
| Per-medium format numbers, templates, and levers       | `medium_tailoring.<medium>` reference module |
| Ship the piece (post / save / schedule)                | downstream Ship stage                        |

## Contract

Return:

- **Medium**: the single target medium.
- **Tailored piece**: the draft reflowed into the medium's native format, hook in the attention slot.
- **Asset slots**: where the enhancement cues land (slides, visuals, images).
- **Primary CTA**: the one ask.
- **Amplification note**: 1–3 levers applied, and the hand-off to Ship.

## Policy

- Do not pick the channel for the user. Medium is an input; if it is unset, route to `algorithm_aware_publishing`.
- Do not load multiple medium references at once — one per piece.
- Do not rewrite the argument while formatting. Preserve the approved spine; flag any needed claim change as a Draft-stage change.
- Do not stack CTAs. One primary ask.
- Do not fabricate platform metrics or "best time to post" claims; the references carry format rules, not performance guarantees.

## Knowledge

Deliberately thin. Each medium has a dedicated reference module. Load **exactly one** — the one you are targeting. Loading more than one is wasted context. Everything medium-specific — character limits, line breaks, slide count, hook placement, CTA, and amplification levers — lives in the six reference modules (`medium_tailoring.linkedin`, `.instagram`, `.x_twitter`, `.youtube`, `.blog`, `.newsletter`), each loaded on demand.

> **Extraction / DRY flag (§12.3, inventory seam AA):** per-medium format facts here overlap with the platform reference modules under `going_viral`. Possible shared platform-facts module — flag for DJ. No new reference modules created in this pass.

## Examples

### Worked Example

Input: an approved + enhanced LinkedIn-targeted draft arguing agents fail because of the chat-box container.

Loaded `medium_tailoring.linkedin`. Output:

```
Medium: LinkedIn post.

Tailored piece:
  Line 1 (hook): You didn't prompt it wrong.
  [blank line]
  I let an agent run a multi-step task for an afternoon. I came back to the same step, looped 40 times.
  I rewrote the prompt three times before I saw it: the chat box can't hold the work's state.
  A smarter model won't fix a broken container. (…short paragraphs, 1–2 sentences each…)
  [blank line]
  The fix isn't a better prompt. It's a better environment.

Asset slots: [VISUAL: annotated screenshot of the looping steps] as the single image.
Primary CTA: "What's the longest an agent has looped on you?" (reply-prompt — LinkedIn rewards comments).
Amplification note: first line is a 4-word pattern-break with a curiosity gap; one image; one reply-prompt CTA. Hand to Ship.
```

## Provenance

- **Reference modules:** `medium_tailoring.linkedin`, `medium_tailoring.instagram`, `medium_tailoring.x_twitter`, `medium_tailoring.youtube`, `medium_tailoring.blog`, `medium_tailoring.newsletter` — one per medium, each holding that medium's format rules, structure templates, and amplification levers. _(internal-default)_
- **Parent pipeline:** `content_creation_pipeline` (this skill runs at the Tailor stage). _(internal-default)_
